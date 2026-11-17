'use strict';
const Scan = (() => {
  const base = new URL('vendor/ocr/', document.baseURI);
  let library;
  function loadEngine() {
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('tesseract.min.js', base);
      script.onload = resolve;
      script.onerror = () => { library = null; reject(Error('Could not load text recognition. Reopen the local website and try again.')); };
      document.head.append(script);
    });
    return library;
  }

  // Replace printed dot leaders before recognition: OCR often reads them as letters or skips the line.
  function markBlanks(canvas) {
    const ctx=canvas.getContext('2d'),{width,height}=canvas;
    const pixels=ctx.getImageData(0,0,width,height).data,lines=[];
    for(let y=0;y<height;y++){
      let start=0,last=-width,pitch=0,count=0;
      function finish(){
        if(count<16 || last-start<width*.065)return;
        const margin=Math.ceil(width*.004);
        if(y<margin || y+margin>=height)return;
        let above=0,below=0;
        for(let x=start;x<=last;x++){
          if(pixels[((y-margin)*width+x)*4]<185)above++;
          if(pixels[((y+margin)*width+x)*4]<185)below++;
        }
        if(above+below>(last-start)*.025)return;
        const prev=lines.findLast(r=>y-r.bottom<8 && Math.min(last,r.right)-Math.max(start,r.left)>(last-start)*.7);
        if(prev){prev.bottom=y;prev.left=Math.min(prev.left,start);prev.right=Math.max(prev.right,last);}
        else lines.push({left:start,right:last,top:y,bottom:y});
      }
      for(let x=0;x<width;x++){
        if(pixels[(y*width+x)*4]>150)continue;
        const left=x;
        while(x+1<width && pixels[(y*width+x+1)*4]<=150)x++;
        const step=left-last;
        if(x-left>width*.005 || step>width*.014 || step<2 || (count>2 && Math.abs(step-pitch)>Math.max(2,pitch*.4))){
          finish();count=0;
        }
        if(x-left<=width*.005){
          if(!count)start=left;
          else pitch=count===1?step:pitch*.75+step*.25;
          count++;last=left;
        }
      }
      finish();
    }
    for(const r of lines){
      const font=Math.round(Math.min(width*.014,(r.right-r.left)/4));
      ctx.fillStyle='white';ctx.fillRect(r.left-1,r.top-font,r.right-r.left+width*.005+2,font+r.bottom-r.top+4);
      ctx.fillStyle='black';ctx.font=font+'px Arial';ctx.fillText('BLANK',r.left+font*.45,r.bottom);
    }
    return lines.length;
  }

  // Reuse the language model across pages of one file and release it when finished.
  async function read(file,purpose,progress=()=>{}){
    const bytes=await file.arrayBuffer();
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const key='scan-v2/'+purpose+'/'+file.name.split('.').at(-1).toLowerCase()+'/'+hash;
    try{
      const cached=await paperStore('readonly',s=>s.get(key));
      if(cached){progress('Reusing previously scanned file…');return cached;}
    }catch{}
    const result=await scanFile(file,purpose,progress);
    try{await paperStore('readwrite',s=>s.put(result,key));}catch{}
    return result;
  }
  async function scanFile(file, purpose, progress = () => {}) {
    let worker, scanned = false, nextLetter='';
    async function recognize(image, label) {
      progress('Reading ' + label + '…');
      if (!worker) {
        await loadEngine();
        worker = await Tesseract.createWorker('eng', 1, {
          workerPath: new URL('worker.min.js', base).href,
          corePath: new URL('tesseract-core-lstm.wasm.js', base).href,
          langPath: base.href, workerBlobURL: false
        });
        await worker.setParameters({tessedit_pageseg_mode:purpose==='answer key'?'6':'3'});
      }
      scanned = true;
      const {data} = await worker.recognize(image, {}, {text:true, blocks:purpose==='answer key'});
      if (purpose !== 'answer key') {
        if(/NOT GIVEN/i.test(data.text)){
          await worker.setParameters({tessedit_pageseg_mode:'6'});
          try{
            const alternate=await worker.recognize(image);
            const numbered=s=>(s.match(/^\d{1,2}\s+[A-Za-z]/gm)||[]).length;
            if(numbered(alternate.data.text)>numbered(data.text))return alternate.data.text;
          }finally{await worker.setParameters({tessedit_pageseg_mode:'3'});}
        }
        if(/choose (?:two|four) (?:letters|answers)|correct (?:researcher|letter).*?A\s*[-–—]\s*D|correct letter,?\s*A,?\s*B\s*(?:or|,)\s*C/i.test(data.text)){
          await worker.setParameters({tessedit_pageseg_mode:'6'});
          try{
            const alternate=await worker.recognize(image);
            const count=s=>(s.match(/^[A-F][.)]?\s+\S/gm)||[]).length;
            if(count(alternate.data.text)>count(data.text))return alternate.data.text;
          }finally{await worker.setParameters({tessedit_pageseg_mode:'3'});}
        }
        if(nextLetter && !/^Questions?\s+\d/im.test(data.text) && !new RegExp('^'+nextLetter+'\\b','m').test(data.text)){
          await worker.setParameters({tessedit_pageseg_mode:'6'});
          try{
            const alternate=await worker.recognize(image);
            if(new RegExp('^'+nextLetter+'\\b','m').test(alternate.data.text))return alternate.data.text;
          }finally{nextLetter='';await worker.setParameters({tessedit_pageseg_mode:'3'});}
        }
        const labels=[...data.text.matchAll(/^([A-H])\s+(?=[A-Z])/gm)];
        nextLetter=labels.length>=2?String.fromCharCode(labels.at(-1)[1].charCodeAt(0)+1):'';
        if(/complete the (?:notes|summary|sentences|table|flow.?chart)/i.test(data.text) && image instanceof HTMLCanvasElement){
          const marked=markBlanks(image);
          // Single-block recognition keeps the left edge of boxed notes with the rest of each line.
          await worker.setParameters({tessedit_pageseg_mode:'6'});
          try{
            const second=await worker.recognize(image);
            if(/complete the (?:notes|summary|sentences|table|flow.?chart)/i.test(second.data.text) &&
              ((marked && /\bBLANK\b/i.test(second.data.text)) || second.data.text.trim().length>=data.text.trim().length*.9))return second.data.text;
          }finally{await worker.setParameters({tessedit_pageseg_mode:'3'});}
        }
        return data.text;
      }
      const words = (data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words)));
      if (!words.length) return data.text;
      const layout=keyLines(words);
      if (image instanceof HTMLCanvasElement && layout.starts.length===2 &&
          layout.starts[1]-layout.starts[0]>image.width*0.25) {
        const split=Math.round(layout.starts[1]-layout.height*2);
        const columns=[];
        for(const [left,width] of [[0,split],[split,image.width-split]]) {
          const column=await worker.recognize(image,{rectangle:{left,top:0,width,height:image.height}});
          columns.push(column.data.text);
        }
        const combined=columns.join('\n').split(/\r?\n/);
        const alternate=layout.text.split(/\r?\n/);
        // A second segmentation can recover an isolated choice letter in an either-order pair.
        combined.forEach((line,index)=>{
          if(!/either order/i.test(line))return;
          const label=line.match(/\d+\s*&\s*\d+/)?.[0];
          const other=label ? alternate.findIndex(s=>s.includes(label) && /either order/i.test(s)) : -1;
          if(other<0)return;
          for(let i=1;i<=2;i++){
            const candidate=alternate[other+i]?.trim().match(/^([A-Z])\1?$/i);
            if(candidate && !/^[a-z]$/i.test(combined[index+i]?.trim()))combined[index+i]=candidate[1].toUpperCase();
          }
        });
        return combined.join('\n');
      }
      return layout.text;
    }
    try {
      if (/\.docx$/i.test(file.name)) {
        const doc = document.createElement('template');
        try {
          const converted = await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()},
            {externalFileAccess:false,includeEmbeddedStyleMap:false});
          doc.innerHTML = converted.value;
        } catch { throw Error('Could not open the Word document. Upload an unencrypted .docx file.'); }
        const images = [...doc.content.querySelectorAll('img')];
        for (const [i,img] of images.entries()) {
          if (!/^data:image\//i.test(img.src)) continue;
          const bitmap=new Image();
          bitmap.src=img.src;
          try{await bitmap.decode();}catch{continue;}
          const scale=Math.min(2,2900/Math.max(bitmap.width,bitmap.height));
          const canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
          const context=canvas.getContext('2d');
          context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);
          context.drawImage(bitmap,0,0,canvas.width,canvas.height);
          const result = await recognize(canvas, purpose + ' image ' + (i+1) + ' of ' + images.length);
          canvas.width=canvas.height=0;
          img.alt = result.trim() || 'Exam illustration';
        }
        const display=doc.content.cloneNode(true);
        if(purpose==='exam paper')for(const img of display.querySelectorAll('img')) {
          const recognized=img.alt.trim();
          if(!recognized || recognized==='Exam illustration')continue;
          const fragment=document.createDocumentFragment();
          for(const block of recognized.split(/\n\s*\n/)){
            const p=document.createElement('p');p.textContent=block.trim();fragment.append(p);
          }
          const figure=document.createElement('details'),label=document.createElement('summary');
          label.textContent='View illustration';figure.append(label,img.cloneNode());fragment.append(figure);
          const container=img.closest('p');
          (container && !container.textContent.trim() && container.querySelectorAll('img').length===1?container:img).replaceWith(fragment);
        }
        const holder=document.createElement('template');holder.content.append(display);
        const original = holder.innerHTML;
        for (const img of images) img.replaceWith(document.createTextNode('\n'+img.alt+'\n'));
        const lines = [...doc.content.querySelectorAll('p,tr,li,h1,h2,h3,h4')].filter(el=>!el.closest('td,th') && !(el.localName==='li' && el.querySelector('p'))).map(el =>
          el.localName==='tr' ? [...el.cells].map(c=>c.textContent.trim()).join(' ') : el.textContent);
        return {text:lines.join('\n'), html:original, scanned};
      }
      const pdfjs = await import('./vendor/pdfjs/build/pdf.js');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/build/pdf.worker.js',document.baseURI).href;
      const task = pdfjs.getDocument({data:await file.arrayBuffer(),isEvalSupported:false,useSystemFonts:true,
        wasmUrl:new URL('vendor/pdfjs/wasm/',document.baseURI).href});
      try {
        const pdf = await task.promise, pages = [];
        for (let i=1;i<=pdf.numPages;i++) {
          const page=await pdf.getPage(i), label=purpose+' page '+i+' of '+pdf.numPages;
          progress('Reading '+label+'…');
          const content=await page.getTextContent();
          const items=content.items.filter(item=>'str' in item);
          let output='', lastY;
          for (const item of items) {
            if(lastY!==undefined && Math.abs(item.transform[5]-lastY)>3) output+='\n';
            output+=item.str+(item.hasEOL?'\n':' ');
            lastY=item.transform[5];
          }
          // A scan may have a selectable page number or heading over a full-page image.
          const ops=await page.getOperatorList();
          const hasImage=ops.fnArray.some(op=>op===pdfjs.OPS.paintImageXObject || op===pdfjs.OPS.paintInlineImageXObject);
          if(!output.trim() || (hasImage && (output.trim().length<100 || (purpose==='answer key' && !/^\s*\d+[.)\s]+\S/m.test(output))))) {
            const unit=page.getViewport({scale:1});
            const viewport=page.getViewport({scale:Math.min(3.5,2900/Math.max(unit.width,unit.height))});
            const canvas=document.createElement('canvas');
            canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
            try {
              await page.render({canvas,viewport}).promise;
              const recognized=await recognize(canvas,label);
              if(recognized.trim()) output=recognized;
            } finally {canvas.width=canvas.height=0;}
          }
          pages.push(output);page.cleanup();
        }
        return {text:pages.join('\n\f\n'),scanned};
      } catch(error) {
        if(error.name==='PasswordException') throw Error('Upload an unlocked copy of the PDF.');
        throw error;
      } finally {await task.destroy();}
    } finally {if(worker) await worker.terminate();}
  }

  // Read the words on each printed line together even when OCR separates numbers and answers into blocks.
  function keyLines(words) {
    const center = w => (w.bbox.y0+w.bbox.y1)/2;
    const heights=words.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b);
    const height=heights[Math.floor(heights.length/2)] || 12;
    const rows=[];
    for(const w of words.sort((a,b)=>center(a)-center(b))) {
      const row=rows.at(-1);
      if(!row || Math.abs(row.y-center(w))>height*0.64)rows.push({y:center(w),words:[w]});
      else row.words.push(w);
    }
    // Use repeated left edges of question numbers to find separate answer columns.
    const anchors=[];
    for(const w of words.filter(w=>/^\d{1,2}(?:[.)]|&\d{1,2})?$/.test(w.text.trim()))) {
      let a=anchors.find(a=>Math.abs(a.x-w.bbox.x0)<height*1.6);
      if(a)a.count++;else anchors.push({x:w.bbox.x0,count:1});
    }
    const starts=anchors.filter(a=>a.count>=3).map(a=>a.x).sort((a,b)=>a-b);
    const columns=[[]];
    for(const row of rows) {
      const chunks=new Map();
      for(const w of row.words.sort((a,b)=>a.bbox.x0-b.bbox.x0)) {
        const col=Math.max(0,starts.filter(x=>w.bbox.x0>=x-height*1.6).length-1);
        chunks.set(col,[...(chunks.get(col)||[]),w.text.trim()]);
      }
      for(const [col,chunk] of chunks)(columns[col] ||= []).push(chunk.join(' '));
    }
    return {text:columns.map(col=>col.join('\n')).join('\n'),starts,height};
  }
  return {read};
})();
