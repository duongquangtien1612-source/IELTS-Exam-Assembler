'use strict';
const Manual = (() => {
  const drafts = new Map();
  const emptyQuestion = () => ({prompt:'', kind:'short', choices:'', key:''});
  const emptyPart = () => ({passage:'', questions:[emptyQuestion()]});
  const storageKey = () => 'folio-manual-' + type;
  const active = () => type !== 'Writing' && $('#build-mode').value === 'manual';
  const partName = () => type === 'Reading' ? 'Passage' : 'Section';
  function draft() {
    if (!drafts.has(type)) {
      let parts;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey()));
        if (Array.isArray(saved) && saved.length && saved.every(p => typeof p?.passage === 'string' &&
            Array.isArray(p.questions) && p.questions.every(q => q && ['short','choice'].includes(q.kind) &&
            ['prompt','key','choices'].every(field => typeof q[field] === 'string')))) parts = saved;
      } catch {}
      drafts.set(type, {parts:parts || [emptyPart()], index:0});
    }
    return drafts.get(type);
  }
  function save() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(draft().parts));
      $('#draft-status').textContent = 'Text draft saved on this device';
    } catch { $('#draft-status').textContent = 'Text draft available in this tab only'; }
  }
  function questionEditor(q, index, number) {
    const choice = q.kind === 'choice';
    return '<fieldset class="edit-question" data-index="'+index+'"><legend>Question '+number+'</legend>'+
      '<label>Question text<textarea rows="2" data-field="prompt">'+esc(q.prompt)+'</textarea></label>'+
      '<label>Answer type<select data-field="kind"><option value="short">Short answer</option><option value="choice" '+(choice?'selected':'')+'>Multiple choice</option></select></label>'+
      (choice ? '<label>Choices (one per line, in A, B, C order)<textarea rows="3" data-field="choices">'+esc(q.choices)+'</textarea></label>' : '')+
      '<label>'+(choice?'Correct letter':'Accepted answer(s)')+'<input data-field="key" value="'+esc(q.key)+'" placeholder="'+(choice?'B':'Separate alternatives with |')+'"></label>'+
      '<label>Explanation (optional)<textarea data-field="explanation">'+esc(q.explanation || '')+'</textarea></label>'+
      '<button class="remove-edit" data-remove-question="'+index+'">Remove question</button></fieldset>';
  }
  function render() {
    const {parts,index} = draft(), part = parts[index];
    const four = type === 'Listening' && $('#audio-mode').value === 'four';
    while (four && parts.length < 4) parts.push(emptyPart());
    const label = partName(), earlier = parts.slice(0,index).reduce((n,p) => n+p.questions.length,0);
    $('#edit-parts').innerHTML = parts.map((p,i) => '<button class="secondary '+(i===index?'chosen':'')+'" data-edit-part="'+i+'" aria-pressed="'+(i===index)+'">'+label+' '+(i+1)+'</button>').join('')+
      (four || (type === 'Listening' && parts.length === 4) ? '' : '<button class="secondary" id="add-part">Add '+label.toLowerCase()+'</button>')+
      (!four && parts.length>1 ? '<button class="remove-edit" id="remove-part">Remove '+label.toLowerCase()+' '+(index+1)+'</button>' : '');
    $('#passage-label').textContent = label+' '+(index+1)+(type==='Reading'?' text':' notes (optional)');
    $('#edit-passage').placeholder = type==='Reading'?'Paste the passage here':'Paste instructions or notes for this section';
    $('#edit-passage').value = part.passage;
    $('#edit-questions').innerHTML = part.questions.map((q,i)=>questionEditor(q,i,earlier+i+1)).join('');
    $('#sum-manual').textContent = parts.reduce((n,p)=>n+p.questions.length,0)+' questions';
  }
  function sync() {
    const manual = active();
    $('#build-mode-field').hidden = type==='Writing';
    $('#manual-editor').hidden = $('#sum-manual-row').hidden = !manual;
    $('#upload-card').hidden = manual && type==='Reading';
    $('#upload-title').textContent = manual?'Listening audio':'Upload your files';
    $('#paper-drop').parentElement.hidden = $('#key-drop').parentElement.hidden = $('#guide').hidden = manual;
    $('#sum-paper').parentElement.hidden = $('#sum-key').parentElement.hidden = manual;
    $('#manual-error').hidden = true;
    if(manual) {$('#draft-status').textContent='';render();}
  }
  document.querySelector('#manual-editor').addEventListener('input', e => {
    const part = draft().parts[draft().index];
    if(e.target.id==='edit-passage') part.passage=e.target.value;
    else if(e.target.dataset.field) part.questions[e.target.closest('fieldset').dataset.index][e.target.dataset.field]=e.target.value;
    else return;
    $('#manual-error').hidden=$('#setup-error').hidden=true;
    save();
    if(e.target.dataset.field==='kind') {
      const index=e.target.closest('fieldset').dataset.index;
      render();$('#edit-questions [data-index="'+index+'"] select').focus();
    }
  });
  document.querySelector('#manual-editor').addEventListener('click', e => {
    const b=e.target.closest('button');
    if(!b)return;
    const d=draft(), part=d.parts[d.index];
    let focus;
    if(b.id==='start-manual') {$('#start').click();return;}
    if(b.dataset.editPart!==undefined) {d.index=Number(b.dataset.editPart);focus='[data-edit-part="'+d.index+'"]';}
    else if(b.id==='add-part') {d.parts.push(emptyPart());d.index=d.parts.length-1;focus='#edit-passage';}
    else if(b.id==='remove-part') {
      if(!window.confirm('Remove '+partName().toLowerCase()+' '+(d.index+1)+' and its questions?'))return;
      d.parts.splice(d.index,1);d.index=Math.min(d.index,d.parts.length-1);focus='#edit-passage';
    } else if(b.id==='add-question') {part.questions.push(emptyQuestion());focus='.edit-question:last-child textarea';}
    else if(b.dataset.removeQuestion!==undefined) {
      const i=Number(b.dataset.removeQuestion), q=part.questions[i];
      if((q.prompt || q.choices || q.key) && !window.confirm('Remove this question and its answer?'))return;
      part.questions.splice(i,1);focus='#add-question';
    } else return;
    $('#manual-error').hidden=$('#setup-error').hidden=true;
    render();save();$(focus).focus();
  });
  function exam(title) {
    const d=draft();
    let number=0;
    const parts=d.parts.map((p,i)=>{
      const label=partName()+' '+(i+1);
      function missing(message,selector) {
        d.index=i;render();$(selector).focus();
        throw Error(label+' — '+message);
      }
      if(type==='Reading' && !p.passage.trim())missing('Paste the passage text.','#edit-passage');
      if(!p.questions.length)missing('Add at least one question.','#add-question');
      const questions=p.questions.map((q,index)=>{
        number++;
        function invalid(message,field) {missing('Question '+number+' '+message,'[data-index="'+index+'"] [data-field="'+field+'"]');}
        if(!q.prompt.trim())invalid('needs a prompt.','prompt');
        let key=q.key.trim(),options=[];
        if(!key.split('|').some(s=>s.trim()))invalid('needs a correct answer.','key');
        if(q.kind==='choice') {
          const lines=q.choices.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
          if(lines.length<2 || lines.length>26)invalid('needs between 2 and 26 choices.','choices');
          options=lines.map((line,j)=>{
            const value=String.fromCharCode(65+j);
            const content=line.replace(new RegExp('^'+value+'[.)]\\s*','i'),'').trim();
            if(!content)invalid('has an empty choice.','choices');
            return {value,label:value+'. '+content};
          });
          key=key.toUpperCase();
          if(!options.some(o=>o.value===key))invalid('needs the letter of a listed choice.','key');
        }
        return {number,prompt:esc(q.prompt.trim()).replace(/\r?\n/g,'<br>'),options,key,explanation:esc(q.explanation || '')};
      });
      const passage=p.passage.trim().split(/(?:\r?\n){2,}/).filter(Boolean)
        .map(s=>'<p>'+esc(s).replace(/\r?\n/g,'<br>')+'</p>').join('');
      return {label,passage:passage || '<p>No section notes.</p>',groups:[{intro:'',questions}]};
    });
    return {title:title || type+' practice', type, parts};
  }
  return {active,sync,exam};
})();
