'use strict';
const ExamImport = (() => {
  const all = (root, selector) => [...root.querySelectorAll(selector)];
  const text = node => node?.textContent.trim() || '';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fail = message => { throw new Error(message); };
  function inert(source) {
    const template = document.createElement('template');
    template.innerHTML = source;
    return template.content;
  }
  function mediaUrl(raw) {
    if (!raw) return '';
    if (raw.startsWith('/media/')) return 'https://study4.com' + raw;
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  }
  // Copy only exam prose, tables and images. Imported page code and attributes stay inert.
  function rich(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return escape(node.data);
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return [...node.childNodes].map(rich).join('');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.localName;
    if (['script','style','iframe','svg','math','template','noscript','form','audio','object','embed','button','title','nav','footer','head'].includes(tag)) return '';
    if (tag === 'img') {
      const raw = node.getAttribute('src') || '';
      const src = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(raw) ? raw : mediaUrl(raw);
      return src ? '<img loading="lazy" referrerpolicy="no-referrer" src="'+escape(src)+'" alt="'+escape(node.alt || 'Exam illustration')+'">' : '<em>[Image unavailable in this file]</em>';
    }
    if (tag === 'br') return '<br>';
    const content = [...node.childNodes].map(rich).join('');
    if (!/^(p|b|strong|i|em|u|sup|sub|h[1-6]|ol|ul|li|table|thead|tbody|tr|td|th|div|blockquote|details|summary)$/.test(tag)) return content;
    let attrs = '';
    if(tag==='h3' && node.classList.contains('passage-letter'))attrs=' class="passage-letter"';
    if(tag==='h3' && /^\d+$/.test(node.dataset.context || ''))attrs+=' data-context="'+node.dataset.context+'"';
    if (tag === 'td' || tag === 'th') for (const name of ['rowspan','colspan']) {
      if (/^[1-9]\d?$/.test(node.getAttribute(name))) attrs += ' '+name+'="'+node.getAttribute(name)+'"';
    }
    return '<'+tag+attrs+'>'+content+'</'+tag+'>';
  }
  const prose = nodes => nodes.map(rich).join('');
  const examContext = c => !c.querySelector('audio') && !c.closest('.context-transcript,.question-explanation-wrapper');
  function detailedExplanation(q) {
    return rich(q.closest('.question-item-wrapper')?.querySelector('.question-explanation-wrapper .collapse'));
  }
  function transcript(node) {
    const set=node.closest('.question-set-wrapper') || node.closest('.tab-pane');
    return rich(set?.querySelector('.context-transcript .collapse'));
  }
  function documentExam(filename,type,keys,passage,source='') {
    const questions=new Map([...keys.keys()].sort((a,b)=>a-b).map(number=>[number,{number,options:[],prompt:''}]));
    const defaultLabel=type==='Reading'?'Reading passage':type==='Writing'?'Writing prompt':'Listening notes';
    const title=filename.replace(/\.[^.]+$/,'');
    if(!source && passage)return {title,type,parts:[{label:defaultLabel,passage,groups:[{intro:'',questions:[...questions.values()]}]}]};

    // Word supplies formatted blocks. OCR and PDF text supply lines that need reflowing.
    const blocks=passage ? [...inert(passage).children].map(el=>({line:text(el),html:rich(el)})) : [];
    if(!blocks.length)for(let line of source.split(/\r?\n/)){
      if(type==='Listening'){
        if(/^(?:Test \d+|LISTENING|Listening test audio|[=:©\[\]wIQ\s]+)$/.test(line.trim()) || /(?:=>|[>@=|]).*p\.\s*\d+/.test(line))continue;
        line=line.replace(/\s*Listening test audio.*$/,'').replace(/\bputitin\b/g,'put it in').replace(/\bseaeagles\b/g,'sea eagles').replace(/\bfurseals\b/g,'fur seals').replace(/\bItis\b|\bltis\b/g,'It is').replace(/\balamb\b/g,'a lamb').replace(/\banewly\b/g,'a newly');
      }
      blocks.push({line});
    }
    function paragraphs(items) {
      const html=[];let words=[];
      function flush(){if(words.length)html.push('<p>'+escape(words.join(' '))+'</p>');words=[];}
      for(const {line,html:formatted} of items){
        const s=line.trim();
        if(formatted){flush();html.push(formatted);continue;}
        if(!s || /^(?:Reading|Listening|Writing|\d{1,3})$/i.test(s)){flush();continue;}
        if(/^(?:[A-H]|\d{1,2})[.)]?\s+/.test(s) || /^(?:[•●▪]|[-–] )/.test(s))flush();
        words.push(s);
        if(/[.?!:”“"]$/.test(s) || (words.length===1 && s.length<55 && !/[.,;-]$/.test(s)))flush();
      }
      flush();return html.join('');
    }
    const sectionHead=/^(?:(?:reading\s+)?passage|section|part|(?:writing\s+)?task)\s+\d+\s*(?:[,.:–—-]?\s*Questions?\s+\d+\s*[-–—]\s*\d+)?\s*$/i;
    const rangeHead=/^questions?\s+(\d+)(?:\s*(?:[-–—]|and|&)\s*(\d+))?\s*[:.]?$/i;
    const sections=[];let page=1,section,group;
    function newSection(label){
      section={label,page,body:[],ranges:[]};sections.push(section);group=null;
    }
    newSection(defaultLabel);
    for(const block of blocks){
      if(block.line.includes('\f'))page++;
      const line=block.line.trim().replace(/^((?:PART\s+[1-4]\s+)?Questions?\s+\d+\s*[-–—]\s*\d+)\s+.*$/i,'$1');
      if(sectionHead.test(line)){
        const label=line.match(/^(.*?\d+)/)[1];
        newSection(label);
        const questions=line.match(/Questions?\s+(\d+)\s*[-–—]\s*(\d+)/i);
        if(questions){group={label:questions[0],first:+questions[1],last:+questions[2],body:[]};section.ranges.push(group);}
        continue;
      }
      const range=line.match(rangeHead);
      if(range){
        if(group && group.first===+range[1] && group.last===+(range[2] || range[1]))continue;
        if(type==='Listening' && questions.size===40){
          const number=Math.floor((Number(range[1])-1)/10)+1;
          const label='Part '+number;
          const existing=sections.find(s=>s.label.toLowerCase()===label.toLowerCase());
          if(existing){section=existing;group=null;}
          else if(!section.ranges.length){section.label=label;}
          else newSection(label);
        }
        group={label:line,first:+range[1],last:+(range[2] || range[1]),body:[],page};
        section.ranges.push(group);
      }else (group?group.body:section.body).push(block);
    }
    const parts=[], assigned=new Set();
    for (const section of sections){
      let body=section.body;
      if(type==='Reading' && body.some(b=>/^B(?:\s+[A-Z“‘]|$)/.test(b.line.trim()))){
        let letter=65;
        body=body.flatMap(block=>{
          const m=block.line.trim().match(/^([A-Z])(?:\s+(.+)|$)/);
          if(!m || m[1].charCodeAt(0)!==letter || (m[1]==='A' && m[2] && !/^[A-Z“‘]/.test(m[2])))return [block];
          letter++;
          return [{line:m[1],html:'<h3 class="passage-letter">'+m[1]+'</h3>'},...(m[2]?[{line:m[2]}]:[])];
        });
      }
      const part={label:section.label,page:section.page,passage:paragraphs(body),groups:[]};
      if(!part.passage && !section.ranges.length)continue;
      for(const range of section.ranges){
        const qs=[...questions.values()].filter(q=>!assigned.has(q.number) && q.number>=range.first && q.number<=range.last && !section.ranges.some(r=>r!==range && r.first>=range.first && r.last<=range.last && r.last-r.first<range.last-range.first && q.number>=r.first && q.number<=r.last));
        const original=paragraphs(range.body);
        qs.forEach(q=>q.sourcePage=range.page || section.page);
        if(!qs.length){part.passage+=original;continue;}
        const optionsText=range.body.slice(0,18).map(b=>b.line).join(' ');
        if(/complete the sentences/i.test(optionsText)){
          const intro=[],sentences=new Map();let active=null;
          for(const b of range.body){
            const m=b.line.trim().match(/^(\d{1,3})\s+(.+)/);
            if(m && qs.some(q=>q.number===+m[1])){active=+m[1];sentences.set(active,[m[2]]);}
            else if(active && !/^\s*(?:Reading|Test \d+|\d+|.*p\.\s*\d+|\f)\s*$/.test(b.line))sentences.get(active).push(b.line);
            else if(!active)intro.push(b);
          }
          if(sentences.size===qs.length){
            for(const q of qs){
              q.prompt='<p>'+escape(sentences.get(q.number).join(' ').replace(/\bBLANK\b|[._…·]{3,}/g,' ............ '))+'</p>';
              assigned.add(q.number);
            }
            part.groups.push({intro:'<strong>'+escape(range.label)+'</strong>'+paragraphs(intro),questions:qs});continue;
          }
        }
        if(/match each statement.*correct researcher/i.test(optionsText)){
          const lines=range.body.map(b=>b.line.trim()).filter(Boolean),start=lines.findIndex(s=>/^A\s+/.test(s));
          if(start>=0){
            const options=lines.slice(start).filter(s=>/^[A-D]\s+/.test(s)).map(s=>({value:s[0],label:s.replace(/^([A-D])\s+/,'$1. ')}));
            const first=lines.findIndex(s=>new RegExp('^'+qs[0].number+'\\s+').test(s));
            if(options.length===4 && first>=0){
              for(const [i,q] of qs.entries()){
                const from=lines.findIndex(s=>new RegExp('^'+q.number+'\\s+').test(s));
                const to=i+1<qs.length?lines.findIndex(s=>new RegExp('^'+qs[i+1].number+'\\s+').test(s)):lines.findIndex(s=>/^List of Researchers/i.test(s));
                q.prompt='<p>'+escape(lines.slice(from,to>from?to:start).join(' ').replace(/^\d+\s+/,''))+'</p>';q.options=structuredClone(options);assigned.add(q.number);
              }
              part.groups.push({intro:'<strong>'+escape(range.label)+'</strong>'+paragraphs(lines.slice(0,first).map(line=>({line}))),questions:qs});continue;
            }
          }
        }
        const selection=optionsText.match(/choose\s+(TWO|FOUR)\s+(?:letters|answers).*?A\s*[-–—]\s*([B-F])/i);
        if(type!=='Writing' && selection){
          const lines=range.body.map(b=>b.line.trim()).filter(s=>s && !/^(?:Test \d+|Reading|Listening|\d+)$/.test(s));
          const start=lines.findIndex(s=>/^A[.)]?\s+/.test(s));
          const options=[];
          if(start>=0){
            for(const line of lines.slice(start)){
              const m=line.match(/^([A-F])[.)]?\s+(.+)/);
              if(m && m[1]===String.fromCharCode(65+options.length))options.push({value:m[1],label:m[1]+'. '+m[2]});
              else if(options.length && !/^\d+\b|^Modules\b|^Test \d+|^\f/i.test(line))options.at(-1).label+=' '+line;
            }
            if(options.length===selection[2].charCodeAt(0)-64){
              const stems=lines.slice(start).filter(s=>/^\d+\s+/.test(s));
              qs.forEach(q=>{
                q.options=structuredClone(options);
                const stem=stems.find(s=>s.startsWith(q.number+' '));
                q.prompt=stem?'<p>'+escape(stem.replace(/^\d+\s+/,'').replace(/\s+(?:[a-z]*([a-z])\1{3,}[a-z]*|enero)\s*$/i,''))+'</p>':'';
                assigned.add(q.number);
              });
              part.groups.push({intro:'<strong>'+escape(range.label)+'</strong>'+paragraphs(lines.slice(0,start).map(line=>({line}))),questions:qs});
              continue;
            }
          }
        }
        if(type!=='Writing' && /choose (?:the|one) correct (?:letter|answer).*?\bA\s*,?\s*B\s*(?:,\s*C\s*,?\s*(?:or|and)\s+D|(?:or|,)\s*C)\b/i.test(optionsText)){
          const lines=range.body.map(b=>b.line.trim().replace(/^Cc\s+/,'C ')).filter(line=>line && !/^(?:Test \d+|Reading|Listening|Listening test audio|[\d\s:©]+)$/.test(line));
          let cursor=0;
          while(cursor<lines.length && /^(?:choose|write|on your answer sheet)/i.test(lines[cursor]))cursor++;
          const instructions=lines.slice(0,cursor);
          const parsed=[];
          for(const q of qs){
            const prompt=[],options=[];
            while(cursor<lines.length && !/^A[.)]?\s+/.test(lines[cursor]))prompt.push(lines[cursor++]);
            const letters=/\bC\s*(?:,?\s*or|,?\s*and)\s*D\b/i.test(optionsText)?'ABCD':'ABC';
            for(const value of letters){
              const m=lines[cursor]?.match(/^([A-D])[.)]?\s+(.+)/);
              if(m?.[1]!==value)break;
              cursor++;
              let label=m[2];
              while(cursor<lines.length && !/^[A-D][.)]?\s+/.test(lines[cursor])){
                if(value===letters.at(-1) && (/[.!?]$/.test(label) || /^[A-Z]/.test(lines[cursor]) || /^(?:\d+\b|what|why|how|which|who|when|where|according|in (?:the|paragraph))\b/i.test(lines[cursor])))break;
                label+=' '+lines[cursor++];
              }
              options.push({value,label:value+'. '+label});
            }
            if(options.length!==letters.length || !prompt.length)break;
            parsed.push({prompt:'<p>'+escape(prompt.join(' ').replace(new RegExp('^'+q.number+'[.)]?\\s+'),''))+'</p>',options});
          }
          if(parsed.length===qs.length){
            qs.forEach((q,i)=>{Object.assign(q,parsed[i]);assigned.add(q.number);});
            part.groups.push({intro:'<strong>'+escape(range.label)+'</strong>'+paragraphs(instructions.map(line=>({line}))),questions:qs});
            continue;
          }
        }
        if(type!=='Writing' && /complete the (?:notes|summary|sentences|table|flow.?chart)/i.test(optionsText)){
          let next=0;
          const notes=range.body.map(block=>{
            if(block.html || /(?:questions?|boxes|answers?)\s+\d|^choose\b/i.test(block.line))return block;
            const gaps=/\bBLANK\b/.test(block.line)?/(?:(\d{1,2})[ ._…·£$]*)?\bBLANK\b/g:/(?<!\d)(\d{1,2})(?!\d)(?:[ \t]*[._…·]{2,}(?:[a-z]{1,8}[._…·]{2,})*)?|[._…·]{3,}/gi;
            const line=block.line.replace(/\bAnumber\s*of\b/gi,'A number of').replace(/\binthe\b/gi,'in the').replace(/BLANK\s+Lt\b/g,'BLANK. It').replace(/^(?:eo?|oe|°)\s+/,'• ').replace(gaps,(match,n)=>{
              const q=qs[next];
              if(!q || (n && Number(n)!==q.number))return match;
              next++;
              return ' '+q.number+' ............ ';
            });
            return {line};
          });
          const boundary=range.body.findIndex(b=>b.line.includes('\f'));
          const last=notes.slice(0,boundary<0?notes.length:boundary).findLast(b=>b.line.trim() && !/^\d+$/.test(b.line.trim()));
          if(next===qs.length-1 && next>0 && last && !last.html && /\b(?:with|the|of|in|a|an|to|by|for)\s*$/i.test(last.line))
            last.line+=' '+qs[next].number+' ............';
          const joined=[];
          for(const b of notes){
            if(!b.html && /^(?:\s*|Test \d+|\d+|Reading)$/i.test(b.line.trim()))continue;
            const prev=joined.at(-1);
            if(prev && !b.html && !prev.html && !/^•/.test(b.line) &&
               (/^\s*\d+ \.{4}/.test(b.line) || /^[a-z]/.test(b.line.trim()) || /\.{4}$/.test(prev.line) && !/^The\b/.test(b.line)))
              prev.line+=' '+b.line.trim();
            else joined.push({...b});
          }
          let content=paragraphs(joined);
          const bank=optionsText.match(/list of (?:phrases|words|options)[,\s]+A\s*[-–—]\s*([B-Z])/i);
          if(bank){
            const start=joined.findIndex(b=>/^A[.)]?\s+/.test(b.line.trim()));
            if(start>=0){
              const source=joined.slice(start).map(b=>b.line.trim()).join(' ');
              const labels=[...source.matchAll(/(?:^|\s)([A-Z|])[.)]?\s+(?=\S)/g)];
              const entries=[];
              for(const m of labels){
                const expected=String.fromCharCode(65+entries.length);
                if(m[1]===expected || (expected==='I' && m[1]==='|'))entries.push({letter:expected,index:m.index,end:m.index+m[0].length});
                if(expected===bank[1] && entries.at(-1)?.letter===expected)break;
              }
              if(entries.at(-1)?.letter===bank[1])content=paragraphs(joined.slice(0,start))+entries.map((e,i)=>'<p><strong>'+e.letter+'</strong> '+escape(source.slice(e.end,entries[i+1]?.index).trim())+'</p>').join('');
            }
          }
          part.groups.push({intro:'<strong>'+escape(range.label)+'</strong>'+content,questions:qs});
          qs.forEach(q=>assigned.add(q.number));continue;
        }
        const choices=/\bTRUE\b.*\bFALSE\b.*NOT GIVEN/i.test(optionsText)?['TRUE','FALSE','NOT GIVEN']:
          /\bYES\b.*\bNO\b.*NOT GIVEN/i.test(optionsText)?['YES','NO','NOT GIVEN']:[];
        const intro=[], stems=new Map();let current=null;
        for(const block of range.body){
          const match=block.line.trim().match(/^(\d{1,3})[.)\s]+(\S.*)$/);
          const number=Number(match?.[1]);
          if(qs.some(q=>q.number===number) && !stems.has(number)){
            current=[];stems.set(number,current);current.push({line:match[2]});
          }else (current || intro).push(block);
        }
        for(const q of qs){
          q.prompt=paragraphs(stems.get(q.number)||[]);
          if(type!=='Writing')q.options=choices.map(value=>({value,label:value}));
          assigned.add(q.number);
        }
        if(choices.length && !stems.size){
          const fragment=inert(paragraphs(intro));
          const paragraphsList=[...fragment.children];
          const lastInstruction=paragraphsList.findLastIndex(el=>/^NOT GIVEN\b/.test(el.textContent.trim()));
          const statements=paragraphsList.slice(lastInstruction+1).filter(el=>!/^\s*(?:[>=>@|Q ]*p\.\s*\d+|Test \d+|\d+)\s*$/.test(el.textContent));
          if(lastInstruction>=0 && statements.length===qs.length){
            qs.forEach((q,i)=>q.prompt=rich(statements[i]));
            intro.splice(0,intro.length,...paragraphsList.slice(0,lastInstruction+1).map(el=>({line:el.textContent,html:rich(el)})));
          }
        }
        part.groups.push({intro:'<strong>'+escape(range.label)+'</strong>'+paragraphs(intro),questions:qs});
      }
      parts.push(part);
    }
    if(!parts.length)throw Error('No readable exam content was found. Try a clearer scan.');
    // IELTS Listening papers sometimes number the four sections without printing question ranges.
    if(type==='Listening' && questions.size===40){
      for(const part of parts){
        const heading=part.label.match(/^(?:section|part)\s+([1-4])$/i);
        if(!heading)continue;
        const first=(Number(heading[1])-1)*10+1;
        const missing=[...questions.values()].filter(q=>!assigned.has(q.number) && q.number>=first && q.number<first+10);
        if(missing.length){part.groups.push({intro:'',questions:missing});missing.forEach(q=>assigned.add(q.number));}
      }
    }
    const remaining=[...questions.values()].filter(q=>!assigned.has(q.number));
    // Some papers have a heading for each task but no printed question ranges.
    const ungrouped=parts.filter(p=>!p.groups.length);
    if(remaining.length===ungrouped.length)ungrouped.forEach((p,i)=>p.groups.push({intro:'',questions:[remaining[i]]}));
    else if(remaining.length)parts.at(-1).groups.push({intro:'',questions:remaining});
    for(let i=parts.length-1;i>=0 && parts.length>1;i--) {
      if(parts[i].groups.length)continue;
      const extra=parts.splice(i,1)[0], adjacent=parts[Math.min(i,parts.length-1)];
      adjacent.passage=i<parts.length?extra.passage+adjacent.passage:adjacent.passage+extra.passage;
    }
    if(type==='Reading')for(const part of parts){
      const fragment=inert(part.passage),elements=[...fragment.children];
      const instruction=elements.findIndex(el=>/you should spend|which are based on/i.test(el.textContent));
      if(instruction>=0){
        let index=instruction+1;
        while(index<elements.length && /^(?:Reading Passage \d+ below\.?|Test \d+)$/i.test(elements[index].textContent.trim()))index++;
        const candidate=elements[index];
        if(candidate?.localName==='p' && candidate.textContent.length<180 && !/[.!?]$/.test(candidate.textContent.trim())){
          const heading=document.createElement('h2');heading.textContent=candidate.textContent;candidate.replaceWith(heading);
        }
      }
      const notes=[...fragment.querySelectorAll('p')].filter(el=>/^\s*\*\s*\S/.test(el.textContent));
      if(notes.length){
        const footer=document.createElement('footer');footer.className='passage-notes';footer.setAttribute('aria-label','Passage notes');
        for(const note of notes){
          let next=note.nextElementSibling;
          while(next?.localName==='p' && /^[a-z]/.test(next.textContent.trim())){
            const following=next.nextElementSibling;note.append(' ',...next.childNodes);next.remove();next=following;
          }
          footer.append(note);
        }
        fragment.append(footer);
      }
      const container=document.createElement('div');container.append(fragment);part.passage=container.innerHTML;
    }
    return {title,type,parts};
  }
  function paperContent(doc) {
    const content=rich(doc.querySelector('main,article') || doc);
    if (!content.replace(/<[^>]+>/g,'').trim() && !content.includes('<img ')) fail('The paper has no readable content.');
    return content;
  }
  function keyDraft(source, type) {
    const lines=source.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    const rows=new Map(), expected=new Set();
    let current=0;
    for (let i=0;i<lines.length;i++) {
      const line=lines[i];
      if(/^If you score\b/i.test(line)){current=0;continue;}
      const range=line.match(/^(?:Part\s+\d+[,.:]?\s*)?Questions?\s+(\d+)\s*[-–—]\s*(\d+)/i);
      if(range && +range[2]<=200) {
        for(let n=+range[1];n<=+range[2];n++)expected.add(n);
        current=0;continue;
      }
      const pair=line.match(/^(\d+)\s*[&+]\s*(\d+)\s*[.:]?\s*(?:in )?either order/i);
      if(pair) {
        const numbers=[+pair[1],+pair[2]];
        const letters=lines.slice(i+1,i+3).map(value=>value.match(/^([a-z])\1?$/i)?.[1].toUpperCase() || '');
        rows.set(numbers[0],numbers.join('&')+'. '+letters.join(' | '));
        numbers.forEach(n=>expected.delete(n));
        rows.set(numbers[1],'');current=0;continue;
      }
      let match=line.match(/^(?:Q(?:uestion)?\s*)?(\d{1,3})(?:[.)：:]\s*|\s+)(.+)$/i);
      if(match && rows.has(+match[1])){
        const next=lines[i+1]?.match(/^(\d+)[.)\s]/);
        const number=Number(next?.[1])-1;
        if(expected.has(number) && String(number).endsWith(match[1]))match=['',String(number),match[2]];
      }
      // Recover a damaged number only when both adjacent printed numbers identify the same slot.
      if(!match && current && new RegExp('^'+(current+2)+'[.)\\s]').test(lines[i+1]||'')) {
        const damaged=line.match(/^(\d[\w|]{0,2})\s+([A-Z](?:[A-Z ]+)?)$/);
        if(damaged && String(current+1).startsWith(damaged[1][0]))match=['',String(current+1),damaged[2]];
      }
      if(match && +match[1]>0 && +match[1]<=200) {
        current=+match[1];
        if(!rows.has(current))rows.set(current,current+'. '+match[2]);
        expected.delete(current);
      } else if(type==='Writing' && current) rows.set(current,rows.get(current)+'\n'+line);
    }
    for(const n of expected)if(!rows.has(n))rows.set(n,n+'. ');
    return [...rows].sort(([a],[b])=>a-b).map(([,line])=>line).filter(Boolean).join('\n');
  }
  async function readKeyFile(file,type,progress,review) {
    if (!/\.(docx|pdf)$/i.test(file.name)) return answerKey(await file.text(),/\.html?$/i.test(file.name),type);
    const result=await Scan.read(file,'answer key',progress);
    if(result.scanned && review) return review(keyDraft(result.text,type),type,result.text);
    return answerKey(result.scanned ? keyDraft(result.text,type) : result.text,false,type);
  }
  function importHtml(source, type, filename, keys) {
    const doc = inert(source);
    const panes = all(doc,'.tab-pane').filter(p => p.querySelector('.test-questions-wrapper'));
    if (!panes.length) {
      if (!keys || doc.querySelector('.result-answers-item')) fail('Choose the exam paper for this upload.');
      return documentExam(filename,type,keys,paperContent(doc));
    }
    const labels = new Map(all(doc,'a[role="tab"]').map(a=>[a.getAttribute('href'),text(a)]));
    const detected = doc.querySelector('textarea[data-type="question-answer"]') ? 'Writing' : doc.querySelector('.test-questions-wrapper audio') ? 'Listening' : 'Reading';
    if (type !== detected) fail('This exam contains '+detected.toLowerCase()+' questions. Select '+detected+' to continue.');
    const parts = panes.map((pane,index) => {
      const section = pane.querySelector('.test-questions-wrapper');
      const groupNodes = all(section,'.question-group-wrapper');
      const contexts = all(section,'.context-content').filter(c => examContext(c) && !c.closest('.question-group-wrapper'));
      const groups = (groupNodes.length ? groupNodes : [section]).map(node => {
        const questions = all(node,'.question-wrapper').map(q => {
          const number = Number(text(q.querySelector('.question-number')));
          if (!Number.isInteger(number) || number<1) fail('One of the questions is missing a valid number.');
          const inputs = all(q,'[data-type="question-answer"]');
          if (!inputs.length || inputs.some(el => !['text','radio','textarea'].includes(el.type))) fail('Question '+number+' uses an unsupported answer control.');
          const options = inputs.filter(i=>i.type==='radio').map(i=>({value:i.value, label:text(all(q,'label').find(l=>l.htmlFor===i.id)) || i.value}));
          return {number,id:q.dataset.qid || '',prompt:rich(q.querySelector('.question-text')),options,explanation:detailedExplanation(q)};
        });
        return {intro:groupNodes.length ? prose(all(node,'.context-content').filter(examContext)) : '', transcript:transcript(node), questions};
      });
      const audio = section.querySelector('audio');
      let passage=prose(contexts);
      if (type==='Listening') {
        for (const group of groups) {
          if (!group.intro || !group.questions.length) continue;
          const first=group.questions[0].number,last=group.questions.at(-1).number;
          group.contextIndex=groups.indexOf(group);
          passage+='<h3 data-context="'+group.contextIndex+'">Questions '+first+'–'+last+'</h3>'+group.intro;
          group.intro='';
        }
      }
      return {label: labels.get('#'+pane.id) || 'Part '+(index+1), passage, audio:mediaUrl(audio?.getAttribute('src') || audio?.querySelector('source')?.getAttribute('src')),groups};
    });
    const questions = parts.flatMap(p => p.groups.flatMap(g=>g.questions));
    // Writing collections can restart the printed number at 1 for each dated task.
    if (type==='Writing') questions.forEach((q,i)=>{q.number=i+1;});
    if (!questions.length || new Set(questions.map(q=>q.number)).size!==questions.length) fail('The paper has missing or repeated question numbers.');
    return {title:(text(doc.querySelector('title')) || filename).replace(/\s*-\s*STUDY4\s*$/i,''),type,parts};
  }
  function answerKey(source, html, type) {
    const entries = new Map();
    function add(number,value,id='') {
      if (!Number.isSafeInteger(number) || number<1 || !value.trim() || entries.has(number)) fail('The key contains an empty answer or a repeated or invalid question number.');
      entries.set(number,{value:value.trim(),id});
    }
    if (html) {
      const doc = inert(source);
      for (const row of all(doc,'.result-answers-item')) {
        const link = row.querySelector('.result-answer-detail')?.getAttribute('data-href') || '';
        const number=type==='Writing'?entries.size+1:Number(text(row.querySelector('.question-number')));
        add(number,text(row.querySelector('.text-answerkey')),link.match(/\/q\/(\d+)\//)?.[1]);
      }
      for(const row of all(doc,'.tab-pane tbody tr')){
        const tag=text(row.cells[0]).match(/^\[[^\]]+\]\s*(.+)/)?.[1];
        if(tag)for(const link of all(row,'.result-question-item')){
          const entry=entries.get(Number(text(link)));if(entry)entry.category=tag;
        }
      }
      if(!entries.size)for(const q of all(doc,'.question-wrapper')){
        const correct=text(q.querySelector('.question-content .text-success')).match(/^(?:Đáp án đúng|Correct answer)\s*:\s*(.+)$/is);
        if(!correct)continue;
        const n=type==='Writing'?entries.size+1:Number(text(q.querySelector('.question-number')));
        add(n,correct[1],q.dataset.qid);Object.assign(entries.get(n),{explanation:detailedExplanation(q),transcript:transcript(q)});
      }
    } else {
      let current, lines=[];
      for (const line of source.replace(/^\uFEFF/,'').split(/\r?\n/)) {
        const pair=line.match(/^\s*(\d+)\s*&\s*(\d+)\s*[.:)]\s*(.*)$/);
        if(pair) {
          if(current!==undefined)add(current,lines.join('\n'));
          current=undefined;lines=[];
          const choices=pair[3].split('|').map(v=>v.trim());
          if(choices.length!==2 || choices.some(v=>!v)) fail('Enter two answers separated by | for questions '+pair[1]+' and '+pair[2]+'.');
          const numbers=[Number(pair[1]),Number(pair[2])];
          for(const [i,n] of numbers.entries()) {add(n,choices[i]);entries.get(n).either=numbers;}
          continue;
        }
        const match=line.match(/^\s*(\d+)(?:[.):\t-]\s*|\s+)(.+)$/);
        if (match) {
          if(current !== undefined) add(current,lines.join('\n'));
          current=Number(match[1]); lines=[match[2]];
        } else if(current !== undefined) lines.push(line);
        else if(line.trim()) fail('Start each text-key entry with its question number, for example “1. London”.');
      }
      if(current !== undefined) add(current,lines.join('\n'));
    }
    if(!entries.size) fail('No correct answers found. Choose the matching results page or a numbered TXT key.');
    return entries;
  }
  function matchKey(exam,key) {
    const questions=exam.parts.flatMap(p=>p.groups.flatMap(g=>g.questions));
    if(questions.length!==key.size) fail('The exam has '+questions.length+' questions and the key has '+key.size+' answers. Choose the matching key.');
    for(const q of questions) {
      const item=key.get(q.number);
      if(!item || (q.id && item.id && q.id!==item.id)) fail('The key does not match question '+q.number+'. Check that both files are for the same test.');
      q.key=item.value;
      if(item.category)q.category=item.category;
      if(item.explanation)q.explanation=item.explanation;
      if(item.either)q.either=item.either;
    }
    for(const part of exam.parts)for(const group of part.groups){
      const source=key.get(group.questions[0]?.number);
      if(source?.transcript)group.transcript=source.transcript;
    }
  }
  const norm = v => v.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–]/g,'-').trim().replace(/\s+/g,' ');
  function isCorrect(answer,key) {
    const actual=norm(answer);
    if(!actual) return false;
    return key.split(/\s*\|\s*|\s+or\s+/i).some(part => {
      const versions = new Set([part,...part.split('/')]);
      // A number written two ways can share the rest of the answer, e.g. “66/sixty-six Lake”.
      const shared=part.match(/^(\d+)\/([\w-]+)(\s+.+)$/);
      if(shared) { versions.add(shared[1]+shared[3]); versions.delete(shared[1]); }
      return [...versions].some(v => [v,v.replace(/\(([^()]*)\)/g,'$1'),v.replace(/\([^()]*\)/g,'')].some(x=>norm(x)===actual));
    });
  }
  return {rich,escape,importHtml,paperContent,inert,readKeyFile,documentExam,answerKey,matchKey,isCorrect};
})();
