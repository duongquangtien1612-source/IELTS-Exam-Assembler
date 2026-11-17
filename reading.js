'use strict';
const themeButton=document.querySelector('#theme-toggle');
function useDarkTheme(dark) {
  document.documentElement.dataset.theme=dark?'dark':'light';
  themeButton.setAttribute('aria-pressed',String(dark));
  themeButton.innerHTML=icon(dark?'moon':'sun')+'<span>'+(dark?'Dark theme':'Light theme')+'</span>';
  themeButton.setAttribute('aria-label',(dark?'Dark':'Light')+' theme. Switch to '+(dark?'light':'dark')+' theme');
}
let dark=matchMedia('(prefers-color-scheme: dark)').matches;
try {const saved=localStorage.getItem('folio-theme');if(saved)dark=saved==='dark';} catch {}
useDarkTheme(dark);
themeButton.onclick=()=>{
  const dark=document.documentElement.dataset.theme!=='dark';
  useDarkTheme(dark);
  try{localStorage.setItem('folio-theme',dark?'dark':'light');}catch{}
};

// Store text offsets within a passage or question so tab changes can rebuild its marks.
function paintMarks(area,ranges) {
  for(const mark of area.querySelectorAll('mark[data-start]'))mark.replaceWith(...mark.childNodes);
  area.normalize();
  const walker=document.createTreeWalker(area,NodeFilter.SHOW_TEXT);
  const nodes=[];let offset=0;
  while(walker.nextNode()){
    const node=walker.currentNode;
    nodes.push({node,offset,end:offset+node.length});offset+=node.length;
  }
  for(const {node,offset,end} of nodes){
    for(const [a,b] of ranges.toReversed()){
      if(a>=end || b<=offset)continue;
      const r=document.createRange();
      r.setStart(node,Math.max(0,a-offset));r.setEnd(node,Math.min(end,b)-offset);
      const mark=document.createElement('mark');
      mark.dataset.start=a;mark.tabIndex=0;mark.setAttribute('role','button');
      mark.title='Remove highlight';mark.setAttribute('aria-label','Remove highlight: '+r.toString());
      r.surroundContents(mark);
    }
  }
}
function markSelection() {
  const selection=getSelection();
  if(!attempt?.marker || selection.isCollapsed || !selection.rangeCount)return;
  const range=selection.getRangeAt(0);
  const parent=range.commonAncestorContainer;
  const area=(parent.nodeType===Node.ELEMENT_NODE?parent:parent.parentElement)?.closest('[data-mark-area]');
  if(!area || !range.toString().trim())return;
  const before=range.cloneRange();before.selectNodeContents(area);before.setEnd(range.startContainer,range.startOffset);
  let start=before.toString().length,end=start+range.toString().length;
  const marks=attempt.exam.parts[attempt.part].marks, ranges=marks[area.dataset.markArea] || [];
  const remaining=ranges.filter(([a,b])=>{
    if(b<start || a>end)return true;
    start=Math.min(start,a);end=Math.max(end,b);return false;
  });
  remaining.push([start,end]);remaining.sort((a,b)=>a[0]-b[0]);marks[area.dataset.markArea]=remaining;
  selection.removeAllRanges();paintMarks(area,remaining);
}
function mountHighlights() {
  const part=attempt.exam.parts[attempt.part];
  part.marks ||= {};
  for(const area of document.querySelectorAll('#exam [data-mark-area]')) {
    const ranges=part.marks[area.dataset.markArea];
    if(ranges?.length)paintMarks(area,ranges);
  }
  const button=document.querySelector('#marker'), hint=document.querySelector('#marker-help');
  function sync(){button.setAttribute('aria-pressed',String(!!attempt.marker));hint.hidden=!attempt.marker;}
  button.onmousedown=e=>e.preventDefault();
  button.onclick=()=>{attempt.marker=!attempt.marker;sync();markSelection();};sync();
}
document.querySelector('#exam').addEventListener('pointerup',e=>{
  if(!e.target.closest('mark[data-start]') || !getSelection().isCollapsed)markSelection();
});
document.querySelector('#exam').addEventListener('keyup',e=>{
  if(e.key==='Shift')markSelection();
});
function removeMark(e){
  const mark=e.target.closest('mark[data-start]');
  if(!mark || !getSelection().isCollapsed || (e.type==='keydown' && !['Enter',' '].includes(e.key)))return;
  e.preventDefault();
  const area=mark.closest('[data-mark-area]'),marks=attempt.exam.parts[attempt.part].marks;
  const ranges=marks[area.dataset.markArea].filter(([start])=>start!==Number(mark.dataset.start));
  marks[area.dataset.markArea]=ranges;paintMarks(area,ranges);
}
document.querySelector('#exam').addEventListener('click',removeMark);
document.querySelector('#exam').addEventListener('keydown',removeMark);
