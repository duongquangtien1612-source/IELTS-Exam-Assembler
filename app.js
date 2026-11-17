'use strict';
const $ = s => document.querySelector(s);
const esc = ExamImport.escape;
const paths = {
 moon:'<path d="M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10z"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
 library:'<path d="M4 4v16M9 4v16M14 5l5-1 3 15-5 1zM3 20h19"/>',
 stats:'<path d="M4 3v18h17M8 16v-4m5 4V7m5 9V4"/>',
 book:'<path d="M3 4c3-1 6-.5 9 1.5C15 3.5 18 3 21 4v15c-3-1-6-.5-9 1.5C9 18.5 6 18 3 19zM12 6v14"/>',
 headphones:'<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4.5" height="8" rx="2"/><rect x="16.5" y="12" width="4.5" height="8" rx="2"/>',
 pen:'<path d="m4 16 11.5-11.5a2.1 2.1 0 0 1 4 4L8 20l-5 1zM13 7l4 4M4 16l4 4"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 history:'<path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7m2-4v5l3 2"/>',
 upload:'<path d="M7 18H6a4 4 0 0 1-1-8 7 7 0 0 1 13.5-1 4.5 4.5 0 0 1-.5 9h-1M12 21V11m-4 4 4-4 4 4"/>',
 key:'<path d="M13 3H5v18h14V9zM13 3v6h6M8 14l2 2 4-4"/>',
 sliders:'<path d="M4 6h4m5 0h7M4 12h10m5 0h1M4 18h2m5 0h9"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
 arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',chevron:'<path d="m9 6 6 6-6 6"/>',lock:'<rect x="5.5" y="10" width="13" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',play:'<path d="m8 5 11 7-11 7z"/>',check:'<path d="m5 12 4 4L19 6"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'
};
const icon = name => '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths[name]+'</svg>';
document.querySelectorAll('[data-icon]').forEach(el=>el.replaceWith(document.createRange().createContextualFragment(icon(el.dataset.icon))));
const typeIcons={Reading:'book',Listening:'headphones',Writing:'pen'};
let type='Reading', files={recording:null,paper:null,key:null}, attempt=null, currentView='builder', loadToken=0, timer;
const localFiles=new Map();
let savingResult=null;
const uploadLabels={recording:'Choose audio file',paper:'Choose exam file',key:'Choose results or answer key'};
const historyKey='folio-ielts-history-v1';
const sectionInputs=Array.from({length:4},(_,i)=>{
 const label=document.createElement('label'),input=document.createElement('input');
 label.textContent='Section '+(i+1);input.type='file';input.id='recording-'+(i+1);
 input.accept=$('#recording').accept;input.onchange=refreshSetup;
 label.append(input);$('#section-recordings').append(label);return input;
});
$('#audio-mode').onchange=$('#build-mode').onchange=refreshSetup;
function elapsed(ms) {
 const sec=Math.max(0,Math.floor(ms/1000));
 return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
}
const presetMinutes={Reading:60,Listening:30,Writing:60};
function updateTiming() {
 $('#timing option[value="preset"]').textContent='IELTS preset ('+presetMinutes[type]+' min)';
 $('#minutes-setting').hidden=$('#timing').value!=='custom';
}
$('#timing').onchange=updateTiming;
function testLimit(skill) {
 if($('#timing').value==='free')return 0;
 if($('#timing').value==='preset')return presetMinutes[skill]*60000;
 const mins=$('#minutes').valueAsNumber;
 if(!Number.isSafeInteger(mins*60000) || !$('#minutes').checkValidity()){
  $('#minutes').reportValidity();throw Error('Enter a positive whole number of minutes.');
 }
 return mins*60000;
}
function selectType(next) {
 type=next;updateTiming();
 $('.types').innerHTML=Object.entries(typeIcons).map(([name,symbol])=>'<button class="type '+(type===name?'selected':'')+'" data-type="'+name+'" aria-pressed="'+(type===name)+'">'+icon(symbol)+'<span>'+name+'</span><span class="radio">'+(type===name?icon('check'):'')+'</span></button>').join('');
 $('#sum-type').textContent=type;
 const writing=type==='Writing';
 $('#paper-title').textContent=writing?'Task 1':'Exam paper';
 $('#key-title').textContent=$('#sum-key-title').textContent=writing?'Task 2':'Answer key';
 $('#paper').accept=writing?'.pdf,.jpg,.jpeg,.png':'.docx,.html,.htm,.pdf';
 $('#key').accept=writing?'.pdf,.jpg,.jpeg,.png':'.html,.htm,.txt,.pdf,.docx';
 $('#paper-drop small').textContent=writing?'PDF, JPG or PNG · click here, then Ctrl+V to paste a screenshot':'Word (.docx), HTML or PDF';
 $('#key-drop small').textContent=writing?'PDF, JPG or PNG · click here, then Ctrl+V to paste a screenshot':'PDF, Word (.docx), HTML or TXT';
 document.querySelectorAll('.paste-task').forEach(button=>button.hidden=!writing);
 document.querySelectorAll('.writing-prompt-field').forEach(field=>field.hidden=!writing);
 refreshSetup();
}
function refreshSetup() {
 loadToken++; $('#scan-status').hidden=true; $('#start').disabled=false; $('#setup-error').hidden=true;
 for(const id of Object.keys(uploadLabels)) {
  const file=files[id], box=$('#'+id+'-drop');
  box.classList.toggle('loaded',!!file);
  box.querySelector('strong').textContent=file?.name || (type==='Writing' && id!=='recording'?'Choose Task '+(id==='paper'?'1':'2')+' file':uploadLabels[id]);
  const status=$('#sum-'+id);
  status.textContent=file?'Attached':'Awaiting file';status.className=file?'attached':'pending';
  if(type==='Writing' && id!=='recording' && $('#writing-text-'+id)?.value.trim()){status.textContent='Text added';status.className='attached';}
 }
 const listening=type==='Listening',four=listening && $('#audio-mode').value==='four';
 $('#recording-field').hidden=$('#sum-recording-row').hidden=!listening;
 $('#single-recording').hidden=four;$('#section-recordings').hidden=!four;
 $('.uploads').classList.toggle('listening',listening);
 $('#clear-recording').hidden=!files.recording;
 if(four){
  const count=sectionInputs.filter(input=>input.files.length).length;
  $('#sum-recording').textContent=count+' / 4 attached';$('#sum-recording').className=count===4?'attached':'pending';
 } else if(!Manual.active() && !files.recording && /\.html?$/i.test(files.paper?.name || '')) $('#sum-recording').textContent='Use linked audio';
 Manual.sync();
 const missing=[];
 if(!Manual.active()){
  if(!files.paper && !(type==='Writing' && $('#writing-text-paper')?.value.trim()))missing.push(type==='Writing'?'Task 1':'exam paper');
  if(!files.key && !(type==='Writing' && $('#writing-text-key')?.value.trim()))missing.push(type==='Writing'?'Task 2':'answer key');
  if(four && sectionInputs.some(input=>!input.files.length))missing.push('four section recordings');
  if(listening && !four && !files.recording && !/\.html?$/i.test(files.paper?.name || ''))missing.push('recording');
 }
 $('#readiness').textContent=missing.length?'Add '+missing.join(' and ')+' to continue.':'Ready to review.';
 $('#preview-test').disabled=!!missing.length;
}
$('#clear-recording').onclick=()=>{files.recording=null;$('#recording').value='';refreshSetup();};
$('.types').onclick=e=>{const button=e.target.closest('button');if(button){selectType(button.dataset.type);$('.selected').focus();}};
for(const id of Object.keys(uploadLabels)) {
 const box=$('#'+id+'-drop'),input=$('#'+id);
 if(id!=='recording'){
  box.tabIndex=0;
  const paste=document.createElement('button');paste.type='button';paste.className='secondary paste-task';paste.textContent='Paste screenshot · Ctrl+V';paste.hidden=true;
  paste.onclick=e=>{e.preventDefault();e.stopPropagation();box.focus();};
  box.append(paste);
  const label=document.createElement('label');label.className='writing-prompt-field';label.hidden=true;
  label.innerHTML='Or paste Task '+(id==='paper'?'1':'2')+' prompt text<textarea id="writing-text-'+id+'" rows="5" placeholder="Paste the task instructions here"></textarea>';
  box.after(label);
  label.querySelector('textarea').oninput=()=>refreshSetup();
  box.addEventListener('click',()=>box.focus());
  box.addEventListener('paste',e=>{
   if(type!=='Writing')return;
   const image=[...(e.clipboardData?.items || [])].find(item=>/^image\/(png|jpeg)$/.test(item.type))?.getAsFile();
   if(!image)return;
   e.preventDefault();
   files[id]=new File([image],'task-'+(id==='paper'?'1':'2')+'-screenshot.'+(image.type==='image/png'?'png':'jpg'),{type:image.type});
   refreshSetup();
  });
 }
 input.onchange=()=>{if(input.files[0]){files[id]=input.files[0];refreshSetup();}};
 box.ondragover=e=>{e.preventDefault();box.classList.add('over');};
 box.ondragleave=()=>box.classList.remove('over');
 box.ondrop=e=>{e.preventDefault();box.classList.remove('over');if(e.dataTransfer.files[0]){files[id]=e.dataTransfer.files[0];refreshSetup();}};
}
function show(id) {
 if(currentView==='detail' && id!=='detail')ReviewDetails.close();
 currentView=id;$('#library-tab').classList.toggle('active',id==='library');
 for(const name of ['builder','exam','review','history','stats','detail','library']) $('#'+name).hidden=name!==id;
 $('#builder-tab').classList.toggle('active',id==='builder' || id==='exam');
 $('#history-tab').classList.toggle('active',['history','review','detail'].includes(id));
 $('#stats-tab').classList.toggle('active',id==='stats');
 window.scrollTo(0,0);
}
function ask(title,message,action,fn) {
 const dialog=$('#confirm');
 dialog.querySelector('h2').textContent=title;dialog.querySelector('p').textContent=message;
 $('#confirm-action').textContent=action;$('#confirm-action').onclick=()=>{dialog.close();fn();};dialog.showModal();
}
$('#cancel').onclick=()=>$('#confirm').close();
function navigate(to) {
 if(savingResult)return;
 const go=()=>{checkpoint();loadToken++;endSession();if(to==='library')openLibrary();else if(to==='history')renderHistory();else if(to==='stats')renderStats();else{refreshSetup();show('builder');}};
 if(attempt) ask('Leave this exam?','You can resume this attempt from the Library.','Leave exam',go);
 else go();
}
$('#builder-tab').onclick=()=>navigate('builder');$('#history-tab').onclick=()=>navigate('history');
$('#stats-tab').onclick=()=>navigate('stats');
$('.brand').onclick=e=>{e.preventDefault();navigate('builder');};
function ownedUrl(file){const url=URL.createObjectURL(file);localFiles.set(url,file);return url;}
function endSession() {
 clearInterval(timer);$('#exam').replaceChildren();attempt=null;for(const url of localFiles.keys()) URL.revokeObjectURL(url);localFiles.clear();
}
window.addEventListener('beforeunload',e=>{if(attempt || savingResult){e.preventDefault();e.returnValue='';}});
function reviewScan(draft,type,raw) {
 const dialog=$('#scan-review');
 $('#scan-key').value=draft;
 $('#scan-raw').textContent=raw;
 $('#scan-error').hidden=true;
 try {
  const count=ExamImport.answerKey(draft,false,type).size;
  $('#scan-count').textContent=count+' answers recognized. You can continue or check the answers first.';
  $('#scan-editor').open=false;
 } catch {
  $('#scan-count').textContent='Some answers need a correction. Check the numbered entries against your key.';
  $('#scan-editor').open=true;
 }
 return new Promise((resolve,reject)=>{
  let accepted;
  dialog.onclose=()=>{if(accepted)resolve(accepted);else reject(new DOMException('Import cancelled','AbortError'));};
  $('#scan-cancel').onclick=()=>dialog.close();
  $('#scan-accept').onclick=()=>{
   try {accepted=ExamImport.answerKey($('#scan-key').value,false,type);dialog.close();}
   catch(error){$('#scan-editor').open=true;$('#scan-error').textContent=error.message;$('#scan-error').hidden=false;}
  };
  dialog.showModal();
 });
}
function listeningRecordings() {
 if(type!=='Listening')return [];
 const four=$('#audio-mode').value==='four';
 const recordings=four?sectionInputs.map(input=>input.files[0]):[files.recording];
 for(const [index,file] of recordings.entries()){
  if(!file && four)throw Error('Choose the audio file for Section '+(index+1)+'.');
  if(file && (!file.size || !(/^audio\//.test(file.type) || /\.(mp3|m4a|wav|ogg|aac|flac|webm)$/i.test(file.name))))throw Error('Choose a playable audio file, such as MP3 or WAV'+(four?' for Section '+(index+1):'')+'.');
 }
 return recordings.filter(Boolean);
}
function attachRecordings(exam,recordings) {
 if(exam.type!=='Listening')return;
 if(!recordings.length){
  if(exam.parts.some(p=>!p.audio))throw Error('Attach an audio file for this Listening paper.');
 }else if(recordings.length===1)exam.recording=ownedUrl(recordings[0]);
 else {
  if(exam.parts.length===1){
   const [whole]=exam.parts, numbers=questionsOf(whole).map(q=>q.number);
   if(numbers.length===40 && new Set(numbers).size===40 && numbers.every(n=>n>=1 && n<=40)){
    exam.parts=recordings.map((_,i)=>({...whole,label:'Section '+(i+1),
     groups:whole.groups.map(g=>({...g,questions:g.questions.filter(q=>Math.floor((q.number-1)/10)===i)})).filter(g=>g.questions.length)}));
   }
  }
  if(exam.parts.length!==4)throw Error('Four recordings need a paper with four sections, or a single paper numbered 1–40. You can also use one recording.');
  exam.parts.forEach((p,i)=>{p.audio=ownedUrl(recordings[i]);});
 }
}
async function readPaper(paper,skill,keys,progress) {
 if(/\.(pdf|docx)$/i.test(paper.name)){
  const document=await Scan.read(paper,'exam paper',progress);
  const passage=/\.docx$/i.test(paper.name)?ExamImport.paperContent(ExamImport.inert(document.html)):'';
  return ExamImport.documentExam(paper.name,skill,keys,passage,document.text);
 }
 return ExamImport.importHtml(await paper.text(),skill,paper.name,keys);
}
$('#start').onclick=async()=>{
 const token=++loadToken, selected=type, {paper,key}=files;
 try {
  const limit=testLimit(selected),title=$('#test-name').value.trim(),recordings=listeningRecordings();
  if(Manual.active()){
   const exam=Manual.exam(title);
   attachRecordings(exam,recordings);begin(exam,limit);return;
  }
  if(selected==='Writing'){
   const texts=[$('#writing-text-paper').value.trim(),$('#writing-text-key').value.trim()];
   const parts=[paper,key].map((file,i)=>{
    if(!texts[i] && !file)throw Error('Upload a file or paste prompt text for Task '+(i+1)+'.');
    if(!texts[i] && (!/\.(pdf|jpe?g|png)$/i.test(file.name) || !file.size))throw Error('Choose a PDF, JPG/JPEG or PNG file for each Writing task.');
    return {label:'Task '+(i+1),sourceFile:texts[i]?null:file,passage:texts[i]?texts[i].split(/\n/).map(line=>'<p>'+esc(line)+'</p>').join(''):'',groups:[{intro:'',questions:[{number:i+1,prompt:'',options:[],key:''}]}]};
   });
   begin({title:title || 'Writing practice',type:selected,parts},limit);return;
  }
  if(!paper || !key) throw Error(!paper?'Choose your exam paper to begin.':'Choose the matching answer file to begin.');
  if(!/\.(html?|docx|pdf)$/i.test(paper.name) || !/\.(html?|txt|pdf|docx)$/i.test(key.name)) throw Error('Choose a supported file format. See the file format guide below the uploads.');
  $('#start').disabled=true;
  const progress=message=>{
   if(token!==loadToken || currentView!=='builder')throw new DOMException('Import cancelled','AbortError');
   $('#scan-status').textContent=message;$('#scan-status').hidden=false;
  };
  const keys=await ExamImport.readKeyFile(key,selected,progress,(draft,t,raw)=>{
   progress('Review your scanned key.');return reviewScan(draft,t,raw);
  });
  progress('Reading exam paper…');
  const exam=await readPaper(paper,selected,keys,progress);
  exam.originalFile=paper;
  if(token!==loadToken || currentView!=='builder')return;
  ExamImport.matchKey(exam,keys);
  if(title) exam.title=title;
  attachRecordings(exam,recordings);
  begin(exam,limit);
 } catch(err) {if(token===loadToken && err.name!=='AbortError'){
  $('#setup-error').textContent=err.message;$('#setup-error').hidden=false;
  if(Manual.active()){$('#manual-error').textContent=err.message;$('#manual-error').hidden=false;}
 }}
 finally {if(token===loadToken){$('#start').disabled=false;$('#scan-status').hidden=true;}}
};
$('#sample').onclick=()=>{
 let limit;try{limit=testLimit('Reading');}catch{return;}
 loadToken++;
 begin({title:$('#test-name').value.trim() || 'The neighbourhood seed library',type:'Reading',parts:[{label:'Passage 1',passage:'<h2>The neighbourhood seed library</h2><p>At Maple Street Library, readers borrow more than books. A cabinet near the entrance holds small packets of vegetable seeds. Anyone with a library card can take up to three packets each spring.</p><p>When the project began, a local gardener donated the first seeds. Today, most packets come from members who save seeds after the autumn harvest. Returning seeds is encouraged, but it is optional.</p>',groups:[{intro:'Answer questions 1–3 using the passage.',questions:[
 {number:1,prompt:'Where is the seed cabinet?',options:[{value:'A',label:'A. Near the entrance'},{value:'B',label:'B. In the garden'},{value:'C',label:'C. Behind the library'}],key:'A'},
 {number:2,prompt:'How many packets can a member take each spring?',options:[],key:'three | 3'},
 {number:3,prompt:'Members must return seeds after the harvest.',options:['TRUE','FALSE','NOT GIVEN'].map(value=>({value,label:value})),key:'FALSE'}
 ]}]}]},limit);
};
function begin(exam,limit=0,resume=null,checked=false) {
 if(previewRequested){
  previewRequested=false;
  const dialog=document.createElement('dialog');
  dialog.innerHTML='<h2>Review before starting?</h2><p>Check the imported text, questions and answer keys, or start your exam now.</p><div><button type="button" class="secondary" data-choice="review">Review test</button><button type="button" class="primary" data-choice="start">Start immediately</button></div>';
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.onclick=e=>{
   const choice=e.target.closest('[data-choice]')?.dataset.choice;
   if(!choice)return;
   dialog.close();
   if(choice==='review')previewExam(exam,limit);
   else begin(exam,limit,null,true);
  };
  document.body.append(dialog);dialog.showModal();return;
 }
 if(!resume && !checked && examIssues(exam).length){previewExam(exam,limit);return;}
 exam.libraryId ||= crypto.randomUUID();
 attempt={exam,part:0,answers:{},start:Date.now(),limit,...resume};
 if(!resume)archiveExam(exam);checkpoint();
 $('#exam').innerHTML='<div id="exam-top"></div><div id="exam-audio"></div><div id="exam-content"></div>';
 show('exam');renderExam();
 updateClock();if(!attempt)return;timer=setInterval(updateClock,250);
}
function updateClock() {
 if(!attempt)return;
 const used=Date.now()-attempt.start;
 if(attempt.limit && used>=attempt.limit){
  if($('#confirm').open)$('#confirm').close();
  finish(true);return;
 }
 $('#time').textContent=attempt.limit?elapsed(Math.ceil((attempt.limit-used)/1000)*1000)+' left':elapsed(used)+' elapsed';
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateClock();});
const questionsOf=part=>part.groups.flatMap(g=>g.questions);
function question(q) {
 const value=attempt.answers[q.number] || '',writing=attempt.exam.type==='Writing';
 let field;
 if(writing) field='<textarea aria-label="Writing response" id="a-'+q.number+'" data-n="'+q.number+'" rows="14" placeholder="Write your response here…">'+esc(value)+'</textarea><small class="words" id="words-'+q.number+'">'+wordCount(value)+' words</small>';
 else if(q.options.length) field=q.options.map((o,i)=>'<label class="choice"><input '+(i===0?'id="a-'+q.number+'" ':'')+'type="radio" name="q'+q.number+'" data-n="'+q.number+'" value="'+esc(o.value)+'" '+(value===o.value?'checked':'')+'>'+esc(o.label)+'</label>').join('');
 else field='<input type="text" id="a-'+q.number+'" data-n="'+q.number+'" value="'+esc(value)+'" placeholder="Your answer" autocomplete="off" spellcheck="false">';
 return '<fieldset class="question" id="q-'+q.number+'"><legend><span class="num">'+q.number+'</span> '+(writing?'Writing response':'Question '+q.number)+'</legend><div data-mark-area="question-'+q.number+'">'+q.prompt+'</div>'+field+'</fieldset>';
}
function placeNoteInputs(){
 for(const area of document.querySelectorAll('#exam .instructions,#exam .readable')){
  const walker=document.createTreeWalker(area,NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
   const gaps=[...node.data.matchAll(/\b(\d{1,3})\)?\s*([._…·]{2,})/g)].reverse();
   for(const gap of gaps){
    const field=$('#a-'+gap[1]),box=field?.closest('fieldset');
    if(!box || field.type!=='text' || box.querySelector('[data-mark-area]')?.textContent.trim())continue;
    const range=document.createRange(),end=gap.index+gap[0].length;
    range.setStart(node,end-gap[2].length);range.setEnd(node,end);range.deleteContents();
    field.className='note-blank';field.placeholder='................';field.setAttribute('aria-label','Answer to question '+gap[1]);
    range.insertNode(field);box.remove();
   }
  }
 }
}
function wordCount(v){return v.trim()?v.trim().split(/\s+/).length:0;}
function answerLimit(exam,number){
 for(const p of exam.parts)for(const g of p.groups){
  if(!g.questions.some(q=>q.number===Number(number)))continue;
  const text=ExamImport.inert(g.intro || '').textContent;
  const match=text.match(/(?:NO MORE THAN\s+)?(ONE|TWO|THREE|FOUR|\d+)\s+WORDS?\s*(ONLY|AND\/?OR A NUMBER)?/i);
  if(match)return {words:({ONE:1,TWO:2,THREE:3,FOUR:4})[match[1].toUpperCase()] || Number(match[1]),number:/NUMBER/i.test(match[2] || '')};
 }
}
function updateAnswerHint(field){
 if(field.type!=='text' || !attempt)return;
 const limit=answerLimit(attempt.exam,field.dataset.n);
 if(!limit)return;
 let hint=document.getElementById('limit-'+field.dataset.n);
 if(!hint){hint=document.createElement('small');hint.id='limit-'+field.dataset.n;hint.className='answer-limit';hint.setAttribute('role','status');field.after(hint);field.setAttribute('aria-describedby',hint.id);}
 const words=field.value.trim().split(/\s+/).filter(Boolean);
 const count=limit.number?words.filter(w=>!/^\d+(?:[.,]\d+)*$/.test(w)).length:words.length;
 hint.textContent=count>limit.words?'Over the limit of '+limit.words+' word'+(limit.words===1?'':'s')+(limit.number?' plus a number':'')+'.':'';
}
function writingFile(part){
 if(!part.sourceFile)return part.passage || '';
 const url=ownedUrl(part.sourceFile);
 return (part.sourceFile.type==='application/pdf' || /\.pdf$/i.test(part.sourceFile.name))?'<iframe class="writing-file" title="'+esc(part.label)+' uploaded paper" src="'+esc(url)+'"></iframe>':'<div class="image-viewer"><div class="image-zoom" aria-label="Image zoom controls"><button type="button" class="secondary" data-image-zoom="-1" aria-label="Zoom out">−</button><output aria-live="polite">100%</output><button type="button" class="secondary" data-image-zoom="1" aria-label="Zoom in">+</button><button type="button" class="secondary" data-image-zoom="0">Reset</button></div><div class="image-scroll" tabindex="0" aria-label="Scrollable task image"><img class="writing-image" src="'+esc(url)+'" alt="'+esc(part.label)+' uploaded paper"></div></div>';
}
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-image-zoom]');
 if(!button)return;
 const viewer=button.closest('.image-viewer'),image=viewer.querySelector('img');
 const step=Number(button.dataset.imageZoom);
 const zoom=step?Math.max(100,Math.min(300,Number(viewer.dataset.zoom || 100)+step*25)):100;
 viewer.dataset.zoom=zoom;
 image.style.width=zoom+'%';
 viewer.querySelector('output').textContent=zoom+'%';
 viewer.querySelector('[data-image-zoom="-1"]').disabled=zoom===100;
 viewer.querySelector('[data-image-zoom="1"]').disabled=zoom===300;
});
function renderExam() {
 const {exam,part:index}=attempt,p=exam.parts[index],qs=questionsOf(p);
 const reference=exam.type==='Writing'?writingFile(p):p.passage;
 $('#exam-top').innerHTML='<div class="crumb">Workspace <span>/</span> Practice session</div><div class="session-head"><div><div class="kicker">'+esc(exam.type)+' practice</div><h1>'+esc(exam.title)+'</h1></div><span class="time">'+icon('clock')+'<span id="time">'+elapsed(Date.now()-attempt.start)+'</span></span></div><div class="tabs" aria-label="Exam parts">'+exam.parts.map((s,i)=>'<button class="secondary '+(i===index?'chosen':'')+'" data-part="'+i+'">'+esc(s.label)+'</button>').join('')+'</div>';
 $('#exam-content').innerHTML='<div class="reading-tools"><button class="secondary" id="marker" aria-pressed="false">'+icon('pen')+' Highlighter</button><span id="marker-help" hidden>Select text to highlight. Select a highlight to remove it.</span></div><div class="exam-grid '+(!reference?'single':'')+'">'+(reference?'<article class="card passage"><h2>'+esc(p.label==='Exam paper'?'Passage':p.label)+'</h2><div class="readable" data-mark-area="passage">'+reference+'</div></article>':'')+'<article class="card answers"><div class="answer-head"><h2>Answer sheet</h2><span id="progress"></span></div><div class="qnav">'+qs.map(q=>'<button data-jump="'+q.number+'" aria-label="Go to question '+q.number+'">'+q.number+'</button>').join('')+'</div>'+p.groups.map((g,i)=>'<div class="question-group">'+(g.intro?'<div class="instructions" data-mark-area="group-'+i+'">'+g.intro+'</div>':'')+g.questions.map(question).join('')+'</div>').join('')+'</article></div><div class="exam-actions">'+(index>0?'<button class="secondary" data-part="'+(index-1)+'">Previous part</button>':'')+(index<exam.parts.length-1?'<button class="secondary" data-part="'+(index+1)+'">Next part '+icon('arrow')+'</button>':'')+'<button class="primary" id="submit">Submit exam '+icon('arrow')+'</button></div>';
 mountHighlights();placeNoteInputs();updateClock();
 const readable=$('#exam .readable');
 if(readable && !readable.querySelector('.writing-image,.writing-file')){
  const label=document.createElement('label');label.className='text-size-control';label.textContent='Text size ';
  const select=document.createElement('select');select.setAttribute('aria-label','Passage text size');
  for(const size of [16,18,20,22,24,26]){const option=document.createElement('option');option.value=size;option.textContent=size+' px';select.append(option);}
  select.value=attempt.textSize || 16;
  select.onchange=()=>{attempt.textSize=Number(select.value);readable.style.fontSize=select.value+'px';checkpoint();};
  label.append(select);$('#exam .reading-tools').append(label);select.onchange();
 }
 const grid=$('#exam .exam-grid');
 if(reference){
  const divider=document.createElement('input');
  divider.type='range';divider.min=30;divider.max=70;divider.value=attempt.paneWidth || 50;
  divider.className='pane-width';divider.setAttribute('aria-label','Adjust passage width');
  divider.oninput=()=>{attempt.paneWidth=divider.value;grid.style.setProperty('--passage-width',divider.value+'%');};
  $('#exam .reading-tools').append(divider);divider.oninput();
 }
 document.querySelectorAll('#exam input[data-n]').forEach(updateAnswerHint);
 attempt.flags ||= {};
 for(const q of qs){
  const button=document.createElement('button');button.type='button';button.className='question-flag secondary';button.textContent=attempt.flags[q.number]?'Flagged':'Flag for review';button.setAttribute('aria-pressed',String(!!attempt.flags[q.number]));
  button.onclick=()=>{attempt.flags[q.number]=!attempt.flags[q.number];renderExam();checkpoint();};
  const field=$('#a-'+q.number);(field?.closest('fieldset') || field?.parentElement)?.append(button);
  const nav=document.querySelector('[data-jump="'+q.number+'"]');if(nav){nav.classList.toggle('flagged',!!attempt.flags[q.number]);nav.setAttribute('aria-label','Question '+q.number+(attempt.flags[q.number]?', flagged':''));}
 }
 const flagged=document.createElement('details');flagged.className='flagged-review';
 const numbers=Object.keys(attempt.flags).filter(n=>attempt.flags[n]);
 flagged.innerHTML='<summary>Flagged questions ('+numbers.length+')</summary>';
 for(const n of numbers){
  const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Question '+n;
  button.onclick=()=>{attempt.part=exam.parts.findIndex(p=>questionsOf(p).some(q=>q.number===Number(n)));renderExam();$('#a-'+n)?.focus();};flagged.append(button);
 }
 $('#exam .exam-actions').before(flagged);
 if(readable && !readable.querySelector('.writing-image,.writing-file')){
  const spacing=document.createElement('label');spacing.className='text-size-control';spacing.textContent='Line spacing ';
  const select=document.createElement('select');select.setAttribute('aria-label','Passage line spacing');
  for(const value of ['1.5','1.8','2.1']){const option=document.createElement('option');option.value=value;option.textContent=value;select.append(option);}
  select.value=attempt.lineSpacing || '1.8';select.onchange=()=>{attempt.lineSpacing=select.value;readable.style.lineHeight=select.value;checkpoint();};spacing.append(select);$('#exam .reading-tools').append(spacing);select.onchange();
  const warm=document.createElement('button');warm.type='button';warm.className='secondary';warm.textContent='Warm paper';warm.setAttribute('aria-pressed',String(!!attempt.warm));
  function applyWarm(){readable.closest('.passage').classList.toggle('warm-paper',!!attempt.warm);warm.setAttribute('aria-pressed',String(!!attempt.warm));}
  warm.onclick=()=>{attempt.warm=!attempt.warm;applyWarm();checkpoint();};$('#exam .reading-tools').append(warm);applyWarm();
 }
 if(!attempt)return;
 updateProgress();
 $('#submit').onclick=()=>{
  const total=exam.parts.flatMap(questionsOf).length, answered=Object.values(attempt.answers).filter(v=>v.trim()).length;
  ask('Submit your exam?',answered+' of '+total+' answered. '+Object.values(attempt.flags || {}).filter(Boolean).length+' flagged for review. '+(total>answered?'Unanswered questions will be marked blank.':'Your results will be ready to review.'),'Submit exam',finish);
 };
 const audioBox=$('#exam-audio');
 if(exam.type!=='Listening' || (exam.recording && audioBox.firstChild)) return;
 const source=exam.recording || p.audio;
 const recordingLabel=exam.recording?'Full test recording':p.label+' recording';
 audioBox.innerHTML='<div class="audio"><strong>'+esc(recordingLabel)+'</strong><audio controls preload="metadata" aria-label="'+esc(recordingLabel)+'" src="'+esc(source)+'"></audio><label>Replace recording <input type="file" id="replace-audio" accept="audio/*"></label><small role="status"></small></div>';
 const player=audioBox.querySelector('audio');
 player.onerror=()=>{audioBox.querySelector('small').textContent='This recording could not play. Choose another audio file.';};
 if(!exam.recording && p.position)player.addEventListener('loadedmetadata',()=>{player.currentTime=p.position;},{once:true});
 $('#replace-audio').onchange=e=>{
  const file=e.target.files[0];if(!file)return;
  const url=ownedUrl(file);
  if(exam.recording)exam.recording=url;else{p.audio=url;p.position=0;}
  audioBox.querySelector('small').textContent='';player.src=url;
 };
}
function updateProgress() {
 const qs=attempt.exam.parts.flatMap(questionsOf),got=Object.values(attempt.answers).filter(v=>v.trim()).length;
 $('#progress').textContent=got+' / '+qs.length+' answered';
 document.querySelectorAll('[data-jump]').forEach(b=>b.classList.toggle('done',!!attempt.answers[b.dataset.jump]?.trim()));
}
$('#exam').oninput=e=>{
 updateClock();if(!attempt)return;
 const n=e.target.dataset.n;if(!n)return;attempt.answers[n]=e.target.value;updateProgress();
 updateAnswerHint(e.target);
 const count=$('#words-'+n);if(count)count.textContent=wordCount(e.target.value)+' words';
};
$('#exam').onclick=e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.part!==undefined){attempt.exam.parts[attempt.part].position=$('#exam audio')?.currentTime || 0;attempt.part=Number(b.dataset.part);renderExam();window.scrollTo(0,0);}
 if(b.dataset.jump)$('#a-'+b.dataset.jump)?.focus();
};
function fullTest(skill,count){return count===(skill==='Writing'?2:40);}
function saved(){
 try{
  const list=JSON.parse(localStorage.getItem(historyKey)||'[]');
  for(const result of list)if(!fullTest(result.type,result.rows.length)){
   for(const row of result.rows)row.status=row.answer.trim()?'Ungraded':'Blank';
  }
  return list;
 }catch{return [];}
}
function finish(timedOut=false) {
 if(!attempt)return;
 timedOut=timedOut || !!(attempt.limit && Date.now()-attempt.start>=attempt.limit);
 const {exam,answers,start}=attempt,writing=exam.type==='Writing';
 const full=fullTest(exam.type,exam.parts.flatMap(questionsOf).length);
 const rows=exam.parts.flatMap(p=>questionsOf(p).map(q=>{
  const answer=answers[q.number] || '';
  return {number:q.number,part:p.label,category:q.category || (writing?'Essay':q.options.length?'Selected response':'Text response'),answer,key:q.key,status:!answer.trim()?'Blank':!full?'Ungraded':writing?'For review':ExamImport.isCorrect(answer,q.key)?'Correct':'Incorrect'};
 }));
 for(const q of exam.parts.flatMap(questionsOf)) {
  if(q.either?.[0]!==q.number || writing || !full)continue;
  const paired=q.either.map(n=>rows.find(r=>r.number===n));
  const available=paired.map(r=>r.key),label=available.join(' / ')+' (either order)';
  for(const row of paired){
   const index=available.findIndex(key=>ExamImport.isCorrect(row.answer,key));
   row.status=!row.answer.trim()?'Blank':index>=0?'Correct':'Incorrect';
   if(index>=0)available.splice(index,1);
   row.key=label;
  }
 }
 localStorage.removeItem('zbon-session');
 const result={limit:attempt.limit,reviewId:crypto.randomUUID(),title:exam.title,type:exam.type,rows,date:Date.now(),duration:timedOut?attempt.limit:Date.now()-start,timedOut};
 const snapshot={...exam,recording:localFiles.get(exam.recording) || exam.recording,
  parts:exam.parts.map(p=>({...p,audio:exam.recording?undefined:localFiles.get(p.audio) || p.audio}))};
 let warning='';
 const history=[result,...saved()];
 try{
  localStorage.setItem(historyKey,JSON.stringify(history.slice(0,30)));
  savingResult=ReviewDetails.store(result,snapshot,history.slice(30));
 }catch{warning='Browser storage is unavailable. This attempt is visible here for the current session.';}
 endSession();
 if(savingResult){
  $('#exam').innerHTML='<p class="card" role="status">Saving your results and question details…</p>';
  savingResult.then(()=>{savingResult=null;renderReview(result,warning,snapshot);});
 }else renderReview(result,warning,snapshot);
}
function renderReview(result,warning='',snapshot) {
 const {rows,type}=result,writing=type==='Writing',score=rows.filter(r=>r.status==='Correct').length;
 const full=fullTest(type,rows.length);
 const cells=rows.map(r=>'<tr><th scope="row">'+r.number+'</th><td>'+esc(r.answer||'—')+'</td>'+(writing?'':'<td>'+esc(r.key)+'</td>')+'<td>'+reviewStatus(r)+'</td><td><button class="text-button" data-detail="'+r.number+'" aria-label="Review question '+r.number+'">View question</button></td></tr>').join('');
 const first=rows.find(r=>r.status==='Incorrect') || rows.find(r=>r.status==='Blank') || rows[0];
 $('#review').innerHTML='<div class="crumb">Workspace <span>/</span> Results</div><div class="kicker">'+esc(type)+(result.timedOut?' · Time limit reached':' · Completed')+'</div><h1>'+esc(result.title)+'</h1>'+
  '<div class="result-banner"><div><small>'+ (!full?'Ungraded practice':writing?'Responses completed':'Your score')+'</small><h2>'+(writing || !full?rows.filter(r=>r.answer.trim()).length:score)+' <span>/ '+rows.length+(!full?' answered':'')+'</span></h2></div><p>'+(!full?'A full '+type+' test has '+(writing?'2 tasks.':'40 questions.'):writing?'Review your saved writing responses.':Math.round(score/rows.length*100)+'% correct')+'<br>'+elapsed(result.duration)+' elapsed</p></div>'+
  '<p role="status" id="saved-note"></p><div class="card"><div class="answer-head"><h2>Answer review</h2><button class="primary" data-detail="'+first.number+'">View detailed answers</button></div><div class="table-scroll"><table><thead><tr><th>Question</th><th>Your response</th><th>'+(writing?'':'Correct answer')+'</th><th>Result</th><th>Details</th></tr></thead><tbody>'+cells+'</tbody></table></div></div><button class="primary after" id="new-exam">Back to exam builder '+icon('arrow')+'</button>';
 $('#saved-note').dataset.result=ReviewDetails.id(result);$('#saved-note').textContent=warning || ReviewDetails.warning(result);
 show('review');$('#new-exam').onclick=()=>show('builder');
 if(writing){
  const section=document.createElement('section');section.className='card writing-ai-tip';
  const prompt=[
   'Act as an IELTS Writing examiner and give an estimated band assessment of my original responses using the IELTS Writing band descriptors.',
   'I will attach the original Task 1 and Task 2 prompts, including any chart, map or diagram. First confirm that you can read both prompts and visuals. If something is missing or unclear, ask me for it before assessing task fulfilment.',
   'For each task, report the word count and estimated bands for Task Achievement (Task 1) or Task Response (Task 2), Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy. Explain each estimate using specific short quotes from my writing and the task requirements. Identify strengths and the issues that prevent the next band.',
   'For Task 1, check coverage of the main features, overview, comparisons and accuracy against the visual. If it is a General Training letter, check purpose, bullet-point coverage and tone instead. For Task 2, check my position, response to every part of the question, development of ideas and supporting examples.',
   'Show a table of the most important errors with my original wording, a correction and an explanation. Then give three prioritized improvements and a short practice exercise for each. Provide a revised version of each response that preserves my intended meaning, clearly separated from the assessment of my original work.',
   'Give an estimated band for each task and a combined Writing estimate with Task 2 weighted twice as heavily as Task 1. Explain any uncertainty. This is practice feedback, not an official IELTS score. Do not invent details from missing visuals or award a score to an unanswered task.',
   ...rows.map(row=>'TASK '+row.number+' — MY ORIGINAL RESPONSE\n'+(row.answer.trim() || '[Unanswered]'))
  ].join('\n\n');
  section.innerHTML='<h2>Get AI feedback on your writing</h2><p>Attach your original task prompts and visuals to your AI assistant, then copy the prompt below. It includes your submitted responses. AI feedback provides an estimated practice score.</p><details><summary>Detailed grading prompt</summary><p>Copy the text below and attach the original task files.</p><textarea rows="15" readonly aria-label="AI Writing grading prompt"></textarea><button type="button" class="secondary">Copy prompt and responses</button><p role="status"></p></details>';
  section.querySelector('textarea').value=prompt;
  section.querySelector('button').onclick=async()=>{
   const field=section.querySelector('textarea'),status=section.querySelector('[role=status]');
   try{await navigator.clipboard.writeText(field.value);status.textContent='Copied. Attach your task prompts before sending.';}
   catch{field.focus();field.select();status.textContent='Press Ctrl+C to copy the selected prompt.';}
  };
  $('#new-exam').before(section);
  const download=document.createElement('button');download.type='button';download.className='secondary';download.textContent='Export Writing responses';
  section.append(download);
  download.onclick=async()=>{
   download.disabled=true;
   try{
    const paper=snapshot || await ReviewDetails.load(result);
    let content='<h1>'+esc(result.title)+'</h1>';
    for(const row of rows){
     const part=paper?.parts.find(p=>questionsOf(p).some(q=>q.number===row.number));
     content+='<h2>Task '+row.number+'</h2>';
     if(part?.passage)content+='<h3>Task prompt</h3>'+part.passage;
     if(part?.sourceFile instanceof Blob){
      const file=part.sourceFile;
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
      content+='<p><a download="task-'+row.number+(file.type==='application/pdf'?'.pdf':file.type==='image/png'?'.png':'.jpg')+'" href="'+esc(data)+'">Download original task file</a></p>';
      if(file.type.startsWith('image/'))content+='<img style="max-width:100%" alt="Task '+row.number+' prompt" src="'+esc(data)+'">';
     }
     if(!part?.passage && !part?.sourceFile)content+='<p>Original prompt unavailable for this saved attempt.</p>';
     content+='<h3>Your response — '+wordCount(row.answer)+' words</h3><pre>'+esc(row.answer)+'</pre>';
    }
    content+='<h2>AI grading prompt</h2><pre>'+esc(prompt)+'</pre>';
    const blob=new Blob(['<!doctype html><html><meta charset="utf-8"><title>Writing responses</title><style>body{max-width:850px;margin:40px auto;padding:20px;font:17px/1.7 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><body>'+content+'</body></html>'],{type:'text/html'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='zBon-writing-responses.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   }catch(error){section.querySelector('[role=status]').textContent='Export failed: '+error.message;}
   finally{download.disabled=false;}
  };
 }
 const retry=document.createElement('button');retry.className='secondary after';retry.textContent='Retry whole test';
 $('#new-exam').before(retry);
 retry.onclick=async()=>{
  try{
   const original=snapshot || await ReviewDetails.load(result);
   if(!retry.isConnected || currentView!=='review')return;
   if(!original){$('#saved-note').textContent='Open View detailed answers and reconnect the original exam paper to retry this test.';return;}
   const copy=structuredClone(original);
   for(const part of copy.parts){delete part.marks;delete part.position;}
   begin(playable(copy),result.limit ?? 0);
  }catch(error){$('#saved-note').textContent=error.message;}
 };
 $('#review').onclick=e=>{const b=e.target.closest('[data-detail]');if(b)ReviewDetails.open(result,Number(b.dataset.detail),snapshot);};
}
function renderHistory() {
 const list=saved();$('#history').innerHTML='<div class="crumb">Workspace <span>/</span> History</div><h1>Practice history<span>.</span></h1><p class="sub">Your last 30 submitted attempts on this device.</p><div class="card history-list">'+(list.length?list.map((r,i)=>'<button data-index="'+i+'"><span class="sample-icon">'+icon(typeIcons[r.type])+'</span><span><strong>'+esc(r.title)+'</strong><small>'+esc(r.type)+' · '+esc(new Date(r.date).toLocaleString())+'</small></span>'+icon('chevron')+'</button>').join(''):'<h2>No attempts yet</h2><p>Submit an exam to see your answers and results here.</p><button class="secondary" id="history-back">Open exam builder</button>')+'</div>';show('history');
 $('#history').onclick=e=>{const b=e.target.closest('button');if(b?.dataset.index!==undefined)renderReview(list[Number(b.dataset.index)]);if(b?.id==='history-back')show('builder');};
}
selectType('Reading');
