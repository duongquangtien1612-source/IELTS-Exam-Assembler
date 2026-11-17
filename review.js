'use strict';
function reviewStatus(row) {
  const color=row.status==='Correct'?'good':row.status==='Incorrect'?'bad':'';
  return '<span class="status '+color+'">'+esc(row.status)+'</span>';
}
function locateQuestion(body,number){
  const pattern=new RegExp('(?:\\('+number+'\\)\\s*[_….]+|\\b'+number+'[.)]?\\s*[_…]{2,})');
  for(const area of body.querySelectorAll('.instructions,.readable')){
    const walker=document.createTreeWalker(area,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode,match=node.data.match(pattern);
      if(!match)continue;
      const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
      const mark=document.createElement('mark');mark.className='question-location';range.surroundContents(mark);
      return mark;
    }
  }
}
const ReviewDetails=(()=>{
  const id=r=>r.reviewId || JSON.stringify([r.date,r.type,r.title]);
  let database,latest,objectUrl;
  const failures=new Set();
  const warning=r=>failures.has(id(r))?'The score is saved. Browser storage could not save the paper for later review.':'';
  function connect(){
    if(!database)database=new Promise((resolve,reject)=>{
      const req=indexedDB.open('folio-question-review',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('papers');
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    }).catch(error=>{database=undefined;throw error;});
    return database;
  }
  async function store(result,paper,expired=[]){
    const key=id(result);
    latest={key,paper};
    function write(db,data){
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('papers','readwrite'),papers=tx.objectStore('papers');
        for(const old of expired)papers.delete(id(old));
        papers.put(data,key);
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
      });
    }
    try{
      const db=await connect();
      try{await write(db,paper);}
      catch(error){
        if(!(paper.recording instanceof Blob || paper.parts.some(p=>p.audio instanceof Blob)))throw error;
        // Keep the question review available if the browser cannot retain a recording.
        await write(db,{...paper,missingAudio:true,recording:undefined,
          parts:paper.parts.map(p=>({...p,audio:p.audio instanceof Blob?undefined:p.audio}))});
      }
      failures.delete(key);
    }catch{
      failures.add(key);
      const note=$('#saved-note');
      if(note?.dataset.result===key)note.textContent=warning(result);
    }
  }
  async function load(result){
    const key=id(result);
    if(latest?.key===key)return latest.paper;
    const db=await connect();
    return new Promise((resolve,reject)=>{
      const req=db.transaction('papers').objectStore('papers').get(key);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  function close(){
    const player=$('#detail audio');if(player)player.pause();
    $('#detail').replaceChildren();
    if(objectUrl)URL.revokeObjectURL(objectUrl);
    objectUrl=undefined;
  }
  async function open(result,number,paper){
    close();show('detail');
    $('#detail').innerHTML='<div class="crumb">History <span>/</span> Detailed answers</div><div class="editor-heading"><h1></h1><button class="secondary" id="back-result">Back to results</button></div><div id="detail-body" aria-live="polite">Opening question…</div>';
    $('#detail h1').textContent=result.title;
    const body=$('#detail-body');
    $('#back-result').onclick=()=>{renderReview(result,'',paper);$('#review [data-detail="'+number+'"]:last-child')?.focus();};
    if(!paper)try{paper=await load(result);}catch{}
    if(!body.isConnected)return;
    function draw(n){
      number=n;
      const row=result.rows.find(r=>r.number===n);
      const part=paper?.parts.find(p=>questionsOf(p).some(q=>q.number===n));
      const group=part?.groups.find(g=>g.questions.some(q=>q.number===n));
      const q=group?.questions.find(q=>q.number===n);
      const position=result.rows.indexOf(row),writing=result.type==='Writing';
      const audio=paper?.recording || part?.audio;
      const current=body.querySelector('audio'),sameSource=current && current.sourceFile===audio;
      if(!sameSource && objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=undefined;}
      const passage=writing && part?writingFile(part):part?.passage || '';
      const options=q?.options.map(o=>'<li>'+esc(o.label)+'</li>').join('') || '';
      const answerLabel=value=>q?.options.find(o=>o.value===value)?.label || value;
      const sectionNames=paper?.parts.map((p,i)=>'<button class="secondary '+(p===part?'chosen':'')+'" data-number="'+questionsOf(p)[0]?.number+'" '+(!questionsOf(p).length?'disabled':'')+'>'+esc(p.label)+'</button>').join('') || '';
      const numbers=(part?questionsOf(part):result.rows).map(item=>'<button data-number="'+item.number+'" '+(item.number===n?'aria-current="true" class="chosen"':'')+' aria-label="Review question '+item.number+'">'+item.number+'</button>').join('');
      body.innerHTML='<div class="tabs" aria-label="Test sections">'+sectionNames+'</div><div id="review-recording"></div>'+
        '<div class="exam-grid '+(passage || group?.transcript?'':'single')+'">'+(passage || group?.transcript?'<article class="card passage"><h2>'+esc(part.label)+'</h2><div class="readable">'+passage+'</div>'+(group.transcript?'<details class="transcript"><summary>Transcript</summary>'+group.transcript+'</details>':'')+'</article>':'')+
        '<article class="card answers"><div class="answer-head"><h2 tabindex="-1">Question '+n+'</h2>'+reviewStatus(row)+'</div>'+
        (group?.intro?'<div class="instructions">'+group.intro+'</div>':'')+(q?.prompt?'<div class="detail-prompt">'+q.prompt+'</div>':'')+
        (options?'<ul class="review-options">'+options+'</ul>':'')+
        '<dl class="comparison"><dt>Your response</dt><dd>'+esc(answerLabel(row.answer) || 'Unanswered')+'</dd>'+(writing?'':'<dt>Correct answer</dt><dd>'+esc(answerLabel(row.key))+'</dd>')+'</dl>'+
        (q?.explanation?'<section class="explanation"><h3>Explanation</h3>'+q.explanation+'</section>':q && !writing?'<p class="sub">No written explanation was supplied for this question.</p>':'')+'</article></div>'+
        '<div class="exam-actions"><button class="secondary" id="previous-question" '+(position===0?'disabled':'')+'>Previous question</button><button class="secondary" id="next-question" '+(position===result.rows.length-1?'disabled':'')+'>Next question</button></div><div class="qnav" aria-label="Question navigation">'+numbers+'</div>'+
        '<details class="restore-paper" '+(!paper?'open':'')+'><summary>'+(paper?'Add a detailed answer file':'Reconnect the original exam paper')+'</summary><p>'+(paper?'Choose the matching detailed-answer HTML to add its explanations and transcripts.':'This attempt has saved answers only. Choose its original paper or matching detailed-answer HTML to reopen this question.')+'</p><input aria-label="Attach review file" type="file" accept="'+(paper?'.html,.htm':'.html,.htm,.docx,.pdf')+'"><p role="status"></p></details>';
      if(audio){
        const player=sameSource?current:document.createElement('audio');
        if(!sameSource){player.controls=true;player.preload='none';player.sourceFile=audio;
          player.src=audio instanceof Blob?(objectUrl=URL.createObjectURL(audio)):audio;}
        player.setAttribute('aria-label',paper.recording?'Full test recording':part.label+' recording');
        $('#review-recording').append(player);
      }else if(paper?.missingAudio)$('#review-recording').textContent='Browser storage could not retain this recording.';
      const heading=body.querySelector('.answers h2');heading.focus({preventScroll:true});
      const blank=locateQuestion(body,n),marker=blank || body.querySelector('[data-context="'+group?.contextIndex+'"]');
      if(blank && !q?.prompt && blank.closest('.passage')){
        const line=blank.closest('p,li,tr')?.textContent;
        if(line){const prompt=document.createElement('p');prompt.className='detail-prompt';prompt.textContent=line;body.querySelector('.comparison').before(prompt);}
      }
      const pane=marker?.closest('.passage');
      if(pane)pane.scrollTop+=marker.getBoundingClientRect().top-pane.getBoundingClientRect().top-18;
      body.querySelector('#previous-question').onclick=()=>draw(result.rows[position-1].number);
      body.querySelector('#next-question').onclick=()=>draw(result.rows[position+1].number);
      const input=body.querySelector('input[type=file]'),note=input.nextElementSibling;
      if(warning(result))note.textContent=warning(result);
      input.onchange=async()=>{
        const file=input.files[0];if(!file)return;
        input.disabled=true;note.textContent='Reading file…';
        try{
          const keys=new Map(result.rows.map(r=>[r.number,{value:r.key}]));
          let details;
          if(/\.html?$/i.test(file.name)){
            const source=await file.text();
            if(ExamImport.inert(source).querySelector('.question-explanation-wrapper,.question-content .text-success'))details=ExamImport.answerKey(source,true,result.type);
          }
          if(paper && !details)throw Error('Choose an HTML file with detailed answers for this test.');
          if(details && (details.size!==keys.size || result.rows.some(r=>{
            const answer=details.get(r.number)?.value;
            const pair=r.key.match(/^(.+) \(either order\)$/);
            return !answer || !(ExamImport.isCorrect(answer,r.key) || answer===r.key || pair?.[1].split(' / ').includes(answer));
          })))throw Error('The answer key does not match this attempt.');
          const updated=paper?structuredClone(paper):await readPaper(file,result.type,keys,m=>{note.textContent=m;});
          ExamImport.matchKey(updated,details || keys);
          if(!input.isConnected)return;
          paper=updated;await store(result,paper);
          if(input.isConnected)draw(n);
        }catch(err){note.textContent=err.message;input.disabled=false;input.value='';}
      };
    }
    body.onclick=e=>{const b=e.target.closest('[data-number]');if(b)draw(Number(b.dataset.number));};
    draw(number);
  }
  return {store,warning,open,close,id,connect,load};
})();
