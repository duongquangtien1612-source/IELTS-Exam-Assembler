'use strict';
let previewRequested=false;
function examIssues(exam){
 const issues=[],seen=new Set(),qs=exam.parts.flatMap(questionsOf);
 if(!fullTest(exam.type,qs.length))issues.push({text:exam.type+' has '+qs.length+' questions. This is ungraded practice.'});
 for(const [pi,p] of exam.parts.entries()){
  if(!p.passage && !p.sourceFile && exam.type==='Reading')issues.push({text:p.label+' has no passage.',part:pi});
  for(const g of p.groups)for(const q of g.questions){
   const context=ExamImport.inert((g.intro || '')+' '+(q.prompt || '')).textContent;
   if(exam.type!=='Writing' && /choose.*(?:letter|answer)|correct (?:letter|researcher)/i.test(context) && !q.options.length)
    issues.push({text:'Check question '+q.number+' — choices may not have been recognized.',number:q.number});
   if(/\bBLANK\b|[a-z]([a-z])\1{5,}/i.test(context))
    issues.push({text:'Check question '+q.number+' — possible unreadable text or blank.',number:q.number});
   if(seen.has(q.number))issues.push({text:'Duplicate question '+q.number+'.',number:q.number,block:true});
   seen.add(q.number);
   if(exam.type!=='Writing' && !q.key?.trim())issues.push({text:'Question '+q.number+' needs an answer key.',number:q.number,block:true});
   if(q.options.length && !q.options.some(o=>ExamImport.isCorrect(o.value,q.key)))issues.push({text:'Question '+q.number+' has a key outside its choices.',number:q.number,block:true});
   if(!q.prompt && !g.intro && !p.passage && !p.sourceFile)issues.push({text:'Question '+q.number+' has no question text.',number:q.number});
   if(new Set(q.options.map(o=>o.value)).size!==q.options.length)issues.push({text:'Question '+q.number+' repeats an option value.',number:q.number,block:true});
  }
 }
 return issues;
}
function showIssues(exam){
 let panel=$('#import-checks');
 if(!panel){panel=document.createElement('section');panel.id='import-checks';panel.className='card';$('#preview-form').before(panel);}
 panel.replaceChildren();
 const heading=document.createElement('h2');heading.textContent='Import check';panel.append(heading);
 const issues=examIssues(exam);
 if(!issues.length){panel.append('Question count and answer keys checked. Review the recognized wording before starting.');return;}
 for(const issue of issues){
  const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent=issue.text;
  button.onclick=()=>{
   const sections=[...document.querySelectorAll('#preview-form section.question')];
   const target=issue.number?sections.find(s=>s.querySelector('h3').textContent==='Question '+issue.number):document.querySelectorAll('#preview-form article')[issue.part || 0];
   target?.scrollIntoView({block:'center'});target?.querySelector('[contenteditable],textarea')?.focus();
   if(exam.originalFile?.type==='application/pdf'){
    let comparison=$('#issue-original');
    if(!comparison){comparison=document.createElement('div');comparison.id='issue-original';panel.after(comparison);}
    const part=exam.parts.find(p=>questionsOf(p).some(q=>q.number===issue.number)) || exam.parts[issue.part || 0];
    const q=part?.groups.flatMap(g=>g.questions).find(q=>q.number===issue.number);
    const page=q?.sourcePage || part?.page || 1;
    comparison.innerHTML='<h3>Original page '+page+'</h3><iframe class="writing-file" title="Original question page" src="'+esc(ownedUrl(exam.originalFile))+'#page='+page+'"></iframe>';
   }
  };panel.append(button);
 }
}
async function paperStore(mode,action){
 const db=await ReviewDetails.connect();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('papers',mode),request=action(tx.objectStore('papers'));
  tx.oncomplete=()=>resolve(request?.result);tx.onabort=()=>reject(tx.error);
 });
}
function archiveExam(exam){
 exam.savedAt ||= Date.now();
 const paper={...exam,recording:localFiles.get(exam.recording)||exam.recording,parts:exam.parts.map(p=>({...p,audio:localFiles.get(p.audio)||p.audio}))};
 paperStore('readwrite',s=>s.put(paper,'library/'+exam.libraryId)).catch(()=>alert('Browser storage could not save this test to the library.'));
}
function checkpoint(){
 if(!attempt)return;
 const {exam,part,answers,start,limit,marker,flags,textSize,lineSpacing,warm,paneWidth}=attempt;
 const state={part,answers,start,limit,marker,id:exam.libraryId,positions:exam.parts.map(p=>p.position||0),marks:exam.parts.map(p=>p.marks||{})};
 Object.assign(state,{flags,textSize,lineSpacing,warm,paneWidth});
 state.positions[part]=$('#exam audio')?.currentTime || 0;
 try{localStorage.setItem('zbon-session',JSON.stringify(state));}catch{}
}
window.addEventListener('pagehide',checkpoint);
document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpoint();});
for(const event of ['input','click','pointerup','keyup','timeupdate'])$('#exam').addEventListener(event,()=>queueMicrotask(checkpoint),true);
$('#library-tab').onclick=()=>navigate('library');
$('#preview-test').onclick=async()=>{previewRequested=true;try{await $('#start').onclick();}finally{previewRequested=false;}};
function previewExam(exam,limit,saveOnly=false){
 show('library');
 const edits=[];
 function editor(target,key,label,rich=false){
  const id='preview-field-'+edits.length;
  edits.push({target,key,id,rich});
  return '<div class="preview-field"><span id="'+id+'-label">'+esc(label)+'</span>'+
   (rich?'<div class="preview-prose" role="textbox" aria-multiline="true" contenteditable="plaintext-only" aria-labelledby="'+id+'-label" id="'+id+'">'+(target[key]||'')+'</div>':
    '<textarea required rows="1" aria-labelledby="'+id+'-label" id="'+id+'">'+esc(target[key])+'</textarea>')+'</div>';
 }
 $('#library').innerHTML='<h1>Test preview</h1><h2>'+esc(exam.title)+'</h2><p class="sub">Edit the text or answer key before starting. Keep numbered dotted blanks where answers belong.</p><form id="preview-form">'+exam.parts.map(p=>'<article class="card passage"><h2>'+esc(p.label)+'</h2>'+(p.sourceFile?writingFile(p):editor(p,'passage','Passage or reference text',true))+p.groups.map(g=>editor(g,'intro','Question instructions and shared text',true)+g.questions.map(q=>'<section class="question"><h3>Question '+q.number+'</h3>'+editor(q,'prompt','Question text',true)+q.options.map(o=>editor(o,'label','Choice '+o.value)).join('')+(exam.type==='Writing'?'':editor(q,'key','Correct answer'))+'</section>').join('')).join('')+'</article>').join('')+'<button type="button" class="secondary" id="preview-back">Back to builder</button> <button class="primary" id="preview-start">Start exam</button></form>';
 for(const edit of edits){
  const field=document.getElementById(edit.id);
  field.oninput=()=>{edit.changed=true;field.setCustomValidity?.('');};
 }
 $('#preview-form').onsubmit=async e=>{
  e.preventDefault();
  for(const {target,key,id,rich,changed} of edits){
   if(!changed)continue;
   const field=document.getElementById(id);
   if(!rich && !field.value.trim()){field.setCustomValidity('Enter a value.');field.reportValidity();return;}
   if(key==='key' && target.options.length && !target.options.some(o=>ExamImport.isCorrect(o.value,field.value))){
    field.setCustomValidity('Enter the value of a listed choice.');field.reportValidity();return;
   }
   if(rich){
    const fragment=ExamImport.inert(field.innerHTML);
    const walker=document.createTreeWalker(fragment,NodeFilter.SHOW_TEXT),multiline=[];
    while(walker.nextNode())if(walker.currentNode.data.includes('\n'))multiline.push(walker.currentNode);
    for(const node of multiline)node.replaceWith(...node.data.split('\n').flatMap((line,i)=>i?[document.createElement('br'),line]:[line]));
    target[key]=ExamImport.rich(fragment);
   }else target[key]=field.value.trim();
  }
  const issues=examIssues(exam);
  if(issues.some(issue=>issue.block)){showIssues(exam);return;}
  if(saveOnly){
   try{await paperStore('readwrite',s=>s.put(exam,'library/'+exam.libraryId));await openLibrary();}
   catch(error){alert('Could not save edits: '+error.message);}
  }else begin(exam,limit,null,true);
 };
 if(saveOnly)$('#preview-start').textContent='Save changes';
 if(exam.originalFile){
  const original=document.createElement('details');original.className='original-preview';
  original.innerHTML='<summary>Compare with original file</summary>'+((/\.(pdf|jpe?g|png)$/i.test(exam.originalFile.name || '') || /^(application\/pdf|image\/(jpeg|png))$/.test(exam.originalFile.type))?writingFile({sourceFile:exam.originalFile,label:'Original paper'}):'<a download="'+esc(exam.originalFile.name)+'" href="'+esc(ownedUrl(exam.originalFile))+'">Open original file</a>');
  $('#preview-form').prepend(original);
 }
 showIssues(exam);
 $('#preview-back').onclick=()=>navigate('builder');
}
function playable(paper){
 if(paper.recording instanceof Blob)paper.recording=ownedUrl(paper.recording);
 for(const p of paper.parts)if(p.audio instanceof Blob)p.audio=ownedUrl(p.audio);
 return paper;
}
async function openLibrary(){
 show('library');const root=$('#library');
 root.innerHTML='<div class="crumb">Workspace <span>/</span> Library</div><h1>Test library<span>.</span></h1><p class="sub">Your saved Reading, Listening and Writing tests on this device.</p><div id="library-list"></div><section class="card"><h2>Backup</h2><button class="secondary" id="export-tests">Export tests and results</button> <label>Restore backup <input type="file" id="restore-tests" accept=".json"></label></section><p role="status" id="library-status"></p>';
 const status=$('#library-status');
 try{
 const keys=await paperStore('readonly',s=>s.getAllKeys(IDBKeyRange.bound('library/','library/\uffff')));
 const state=JSON.parse(localStorage.getItem('zbon-session')||'null');
 const list=$('#library-list');if(!list || !status.isConnected)return;
 const search=document.createElement('input');search.type='search';search.placeholder='Search tests by name or skill';search.setAttribute('aria-label',search.placeholder);search.className='library-search';list.before(search);
 let skill='All';
 const filters=document.createElement('div');filters.className='library-filters';filters.setAttribute('aria-label','Filter tests by skill');search.after(filters);
 function filterTests(){
  for(const row of list.querySelectorAll('article'))row.hidden=!row.dataset.search.includes(search.value.trim().toLowerCase());
  for(const [type,section] of categories){
   section.hidden=skill!=='All' && skill!==type;
   const count=[...section.querySelectorAll('article')].filter(row=>!row.hidden).length;
   section.querySelector('.sub').hidden=count>0;
   section.querySelector('.sub').textContent=search.value.trim()?'No matching tests.':'No '+type.toLowerCase()+' tests saved yet.';
  }
 }
 search.oninput=filterTests;
 for(const name of ['All','Writing','Listening','Reading']){
  const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=name;button.setAttribute('aria-pressed',String(name===skill));
  button.onclick=()=>{skill=name;for(const b of filters.children)b.setAttribute('aria-pressed',String(b===button));filterTests();};filters.append(button);
 }
 const categories=new Map();
 for(const type of ['Writing','Listening','Reading']){
  const section=document.createElement('section');section.className='library-category';
  section.innerHTML='<h2>'+type+'</h2><div class="library-tests"></div><p class="sub">No '+type.toLowerCase()+' tests saved yet.</p>';
  list.append(section);categories.set(type,section);
 }
 for(const key of keys){
  const paper=await paperStore('readonly',s=>s.get(key)),item=document.createElement('article');
  item.className='card';item.innerHTML='<h2>'+esc(paper.title)+'</h2><p>'+esc(paper.type)+' · '+paper.parts.flatMap(questionsOf).length+' questions</p><button class="secondary">Retake test</button>';
  const count=paper.parts.flatMap(questionsOf).length;
  item.querySelector('p').textContent=count+(paper.type==='Writing'?' tasks':' questions');
  const symbol=document.createElement('span');symbol.className='library-skill-icon';symbol.innerHTML=icon(typeIcons[paper.type]);item.prepend(symbol);
  function start(resume){
   const copy=playable(structuredClone(paper));
   if(resume)copy.parts.forEach((p,i)=>{p.position=state.positions[i];p.marks=state.marks[i];});
   begin(copy,resume?state.limit:testLimit(copy.type),resume?state:null);
   if(resume && copy.recording && $('#exam audio'))$('#exam audio').addEventListener('loadedmetadata',e=>{e.target.currentTime=state.positions[state.part];},{once:true});
  }
  item.querySelector('button').onclick=()=>start(false);
  item.dataset.search=(paper.title+' '+paper.type).toLowerCase();
  item.querySelector('button').textContent='Start test';
  if(paper.savedAt)item.querySelector('p').append(' · Saved '+new Date(paper.savedAt).toLocaleDateString());
  const menu=document.createElement('details');menu.className='test-menu';menu.innerHTML='<summary>Manage</summary>';item.append(menu);
  for(const [label,action] of [
   ['Edit test',()=>previewExam(structuredClone(paper),0,true)],
   ['Rename',async()=>{const name=prompt('Test name',paper.title);if(!name?.trim())return;try{paper.title=name.trim();await paperStore('readwrite',s=>s.put(paper,key));await openLibrary();}catch(error){status.textContent=error.message;}}],
   ['Delete',async()=>{if(!confirm('Delete "'+paper.title+'" from the library?'))return;try{await paperStore('readwrite',s=>s.delete(key));if(state?.id===paper.libraryId)localStorage.removeItem('zbon-session');await openLibrary();}catch(error){status.textContent=error.message;}}]
  ]){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=label;button.onclick=action;menu.append(button);}
  if(state?.id===paper.libraryId){const b=document.createElement('button');b.className='primary';b.textContent='Resume attempt';b.onclick=()=>start(true);item.append(b);}
  const category=categories.get(paper.type);
  if(category){category.querySelector('.library-tests').append(item);category.querySelector('.sub').hidden=true;}
 }
 if(!status.isConnected)return;
 for(const section of categories.values()){
  const count=document.createElement('span');count.className='category-count';count.textContent=section.querySelectorAll('article').length;section.querySelector('h2').append(count);
 }
 $('#export-tests').onclick=async()=>{
  try{
   const results=saved(),backup={format:'zBon-1',results,papers:[]};
   for(const key of [...keys,...results.map(ReviewDetails.id)]){
    const paper=await paperStore('readonly',s=>s.get(key));if(!paper)continue;
    for(const [obj,field] of [[paper,'recording'],[paper,'originalFile'],...paper.parts.flatMap(p=>[[p,'audio'],[p,'sourceFile']])])if(obj[field] instanceof Blob){
     const reader=new FileReader();obj[field]=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(obj[field]);});
    }backup.papers.push([key,paper]);
   }
   const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='zBon-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){status.textContent=e.message;}
 };
 $('#restore-tests').onchange=async e=>{
  try{
   const backup=JSON.parse(await e.target.files[0].text());
   if(backup.format!=='zBon-1'||!Array.isArray(backup.results)||!Array.isArray(backup.papers))throw Error('Choose a zBon backup.');
   for(const result of backup.results){
    if(!Object.hasOwn(typeIcons,result.type)||!Array.isArray(result.rows)||!result.rows.length||!Number.isFinite(result.date)||result.rows.some(r=>!Number.isSafeInteger(r.number)||typeof r.answer!=='string'||typeof r.key!=='string'))throw Error('Invalid result in backup.');
   }
   const clean=html=>ExamImport.rich(ExamImport.inert(String(html||'')));
   for(const [key,paper] of backup.papers){
    if(typeof key!=='string'||!Object.hasOwn(typeIcons,paper.type)||!paper.parts?.length)throw Error('Invalid test in backup.');
    for(const part of paper.parts){part.passage=clean(part.passage);delete part.marks;
     for(const group of part.groups){group.intro=clean(group.intro);group.transcript=clean(group.transcript);
      for(const q of group.questions){if(!Number.isSafeInteger(q.number)||!Array.isArray(q.options)||typeof q.key!=='string')throw Error('Invalid question.');q.prompt=clean(q.prompt);q.explanation=clean(q.explanation);}
     }
    }
    for(const [obj,field] of [[paper,'recording'],[paper,'originalFile'],...paper.parts.flatMap(p=>[[p,'audio'],[p,'sourceFile']])]){
     const src=obj[field];if(!src)continue;
     if(/^data:(audio\/[^;,]+|application\/pdf|image\/(?:jpeg|png)|application\/octet-stream)?;base64,/i.test(src))obj[field]=await (await fetch(src)).blob();
     else if(!/^https:\/\//i.test(src))throw Error('Invalid recording.');
    }
   }
   await paperStore('readwrite',s=>{for(const [key,paper] of backup.papers)s.put(paper,key);});
   const merged=new Map([...backup.results,...saved()].map(r=>[ReviewDetails.id(r),r]));
   localStorage.setItem(historyKey,JSON.stringify([...merged.values()].sort((a,b)=>b.date-a.date).slice(0,30)));
   await openLibrary();$('#library-status').textContent='Backup restored.';
  }catch(err){status.textContent=err.message;}
 };
 }catch(err){status.textContent=err.message;}
}

try{
 const session=JSON.parse(localStorage.getItem('zbon-session') || 'null');
 if(session){
  const button=document.createElement('button');button.className='secondary full';button.textContent='Resume saved attempt';
  button.onclick=()=>openLibrary();$('#sample').after(button);
 }
}catch{}
