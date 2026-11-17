'use strict';
const statsFilter={skill:'All',days:30};
// Practice estimates for full Listening and Academic Reading papers.
function practiceBand(skill,correct,count){
  if(count!==40 || !['Reading','Listening'].includes(skill))return null;
  const minimum=skill==='Reading'?[1,2,3,4,6,8,10,13,15,19,23,27,30,33,35,37,39]:
    [1,2,3,4,6,8,11,13,16,18,23,26,30,32,35,37,39];
  return correct===0?0:1+minimum.findLastIndex(n=>correct>=n)/2;
}
const percent=(n,d)=>d?new Intl.NumberFormat(undefined,{style:'percent',maximumFractionDigits:1}).format(n/d):'—';
function practiceTime(ms){
  const seconds=Math.floor(ms/1000),minutes=Math.floor(seconds/60);
  if(minutes>=60)return Math.floor(minutes/60)+'h '+minutes%60+'m';
  return minutes?minutes+'m '+seconds%60+'s':seconds+'s';
}
function calendarDay(timestamp){
  const d=new Date(timestamp);
  return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
}
function scoreTrend(points,writing){
  if(!points.length)return '<p class="sub">No scored attempts in this period.</p>';
  const dates=points.map(p=>p.day),first=dates[0],last=dates.at(-1);
  const date=day=>new Date(day).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  const coords=points.map(p=>({x:last===first?360:46+(p.day-first)/(last-first)*650,y:132-p.correct/p.total*112}));
  const plotted=coords.map(p=>p.x+','+p.y).join(' ');
  const grid=[0,50,100].map(v=>'<text x="0" y="'+(136-v*1.12)+'">'+v+'%</text><line x1="40" x2="705" y1="'+(132-v*1.12)+'" y2="'+(132-v*1.12)+'"/>').join('');
  const dots=coords.map((p,i)=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="4"><title>'+date(dates[i])+' · '+percent(points[i].correct,points[i].total)+'</title></circle>').join('');
  return '<svg class="trend-chart" viewBox="0 0 720 152" role="img" aria-label="'+(writing?'Daily writing completion':'Daily accuracy')+'">'+grid+'<polyline points="'+plotted+'"/>'+dots+'</svg><div class="chart-dates"><span>'+date(first)+'</span>'+(first===last?'':'<span>'+date(last)+'</span>')+'</div>'+
    '<details><summary>Daily values</summary><ul>'+points.map(p=>'<li>'+date(p.day)+' · '+percent(p.correct,p.total)+' ('+p.correct+'/'+p.total+')</li>').join('')+'</ul></details>';
}
function renderStats(){
  show('stats');
  const root=$('#stats'), history=saved(),latest=Math.max(...history.map(r=>r.date),0);
  root.innerHTML='<div class="crumb">Workspace <span>/</span> Test stats</div><div class="session-head"><h1>Test statistics</h1><label class="date-filter">Date range<select id="stats-range">'+
    [3,7,30,60,90,180,365,0].map(n=>'<option value="'+n+'" '+(n===statsFilter.days?'selected':'')+'>'+(n?'Last '+n+' days':'All saved dates')+'</option>').join('')+'</select></label></div>'+
    '<p class="sub">Based on your last 30 saved attempts'+(latest?' through '+esc(new Date(latest).toLocaleDateString()):'')+'.</p>'+
    '<div class="tabs" aria-label="Filter by exam type">'+['All','Reading','Listening','Writing'].map(s=>'<button class="secondary" data-skill="'+s+'">'+(s==='All'?'All tests':s)+'</button>').join('')+'</div><div id="stats-content"></div>';
  const content=$('#stats-content');
  function update(){
    const writing=statsFilter.skill==='Writing';
    for(const b of root.querySelectorAll('[data-skill]')){
      const on=b.dataset.skill===statsFilter.skill;b.classList.toggle('chosen',on);b.setAttribute('aria-pressed',on);
    }
    const from=statsFilter.days?calendarDay(latest)-(statsFilter.days-1)*86400000:-Infinity;
    const list=history.filter(r=>(statsFilter.skill==='All'||r.type===statsFilter.skill) && calendarDay(r.date)>=from);
    if(!list.length){content.innerHTML='<section class="card"><h2>'+(!history.length?'No practice results yet':'No attempts in this selection')+'</h2><p class="sub">'+(!history.length?'Submit a test to see your practice statistics.':'Choose another date range or exam type.')+'</p></section>';return;}
    const fullAttempts=list.filter(r=>fullTest(r.type,r.rows.length));
    const duration=fullAttempts.reduce((sum,r)=>sum+r.duration,0);
    let correct=0,total=0;
    const scores=[],bands=[],daily=new Map(),breakdown=new Map();
    for(const r of list){
      if(!fullTest(r.type,r.rows.length) || (r.type==='Writing' && !writing))continue;
      let got=0;
      for(const row of r.rows){
        const key=JSON.stringify([r.type,row.part,row.category || 'Unclassified']);
        if(!breakdown.has(key))breakdown.set(key,{skill:r.type,part:row.part,kind:row.category || 'Unclassified',correct:0,incorrect:0,blank:0});
        const group=breakdown.get(key);
        if(row.status==='Blank')group.blank++;
        else if(writing || row.status==='Correct'){group.correct++;got++;}
        else group.incorrect++;
      }
      if(!r.rows.length)continue;
      scores.push(got/r.rows.length);total+=r.rows.length;correct+=got;
      const band=practiceBand(r.type,got,r.rows.length);
      if(band!==null)bands.push(band);
      const day=calendarDay(r.date);
      if(!daily.has(day))daily.set(day,{day,correct:0,total:0});
      daily.get(day).correct+=got;daily.get(day).total+=r.rows.length;
    }
    const metric=(label,value)=>'<div class="card stat"><span>'+label+'</span><strong>'+value+'</strong></div>';
    const performance=writing?'Completion':'Accuracy';
    const body=[...breakdown.values()].sort((a,b)=>a.skill.localeCompare(b.skill)||a.part.localeCompare(b.part,undefined,{numeric:true})||a.kind.localeCompare(b.kind));
    const average=bands.length?(Math.round(2*bands.reduce((a,b)=>a+b,0)/bands.length)/2).toFixed(1):'—';
    const hero='<section class="band-summary"><div class="band-circle"><span>'+(writing?'Average completion':'Average IELTS band')+'</span><strong>'+(writing?percent(scores.reduce((a,b)=>a+b,0),scores.length):average)+'</strong>'+(writing?'':'<small>out of 9</small>')+'</div><p class="sub">'+(writing?'Writing bands require assessment of the essay.':bands.length?'Estimated from '+bands.length+' full-length '+(bands.length===1?'attempt.':'attempts.'):'Complete a 40-question Listening or Academic Reading test for a band estimate.')+'</p></section>';
    content.innerHTML=hero+'<div class="stat-grid band-metrics">'+metric('Tests taken',fullAttempts.length)+metric('Practice time',practiceTime(duration))+metric('Average time',fullAttempts.length?practiceTime(duration/fullAttempts.length):'—')+
      metric(performance,percent(correct,total))+metric(writing?'Best completion':'Best band',writing && scores.length?percent(Math.max(...scores),1):bands.length?Math.max(...bands).toFixed(1):'—')+'</div>'+
      (statsFilter.skill==='All' && list.some(r=>r.type==='Writing')?'<p class="sub">Scores and accuracy cover Reading and Listening. Select Writing to see response completion.</p>':'')+
      '<section class="card stats-block"><h2>'+performance+' over time</h2>'+scoreTrend([...daily.values()].sort((a,b)=>a.day-b.day),writing)+'</section>'+
      (body.length?'<section class="card stats-block"><h2>Performance by section and question type</h2><div class="table-scroll"><table><thead><tr><th>Section</th><th>Question type</th><th>'+(writing?'Completed':'Correct')+'</th>'+(writing?'':'<th>Incorrect</th>')+'<th>Blank</th><th>'+performance+'</th></tr></thead><tbody>'+body.map(g=>'<tr><th scope="row">'+(statsFilter.skill==='All'?esc(g.skill)+' · ':'')+esc(g.part)+'</th><td>'+esc(g.kind)+'</td><td>'+g.correct+'</td>'+(writing?'':'<td>'+g.incorrect+'</td>')+'<td>'+g.blank+'</td><td>'+percent(g.correct,g.correct+g.incorrect+g.blank)+'</td></tr>').join('')+'</tbody></table></div></section>':'')+
      '<section class="card stats-block"><h2>Completed tests</h2><div class="table-scroll"><table><thead><tr><th>Test</th><th>Date</th><th>Result</th><th>Time</th></tr></thead><tbody>'+list.map((r,i)=>{
        const w=r.type==='Writing',n=r.rows.filter(row=>w?row.status!=='Blank':row.status==='Correct').length;
        const band=practiceBand(r.type,n,r.rows.length);
        const result=fullTest(r.type,r.rows.length)?(band===null?'':'Band '+band.toFixed(1)+' · ')+n+'/'+r.rows.length+(w?' completed':''):'Ungraded practice';
        return '<tr><th scope="row"><button class="text-button" data-attempt="'+i+'">'+esc(r.title)+'</button></th><td>'+esc(new Date(r.date).toLocaleDateString())+'</td><td>'+result+'</td><td>'+elapsed(r.duration)+'</td></tr>';
      }).join('')+'</tbody></table></div></section>';
    content.onclick=e=>{const btn=e.target.closest('[data-attempt]');if(btn)renderReview(list[Number(btn.dataset.attempt)]);};
  }
  root.querySelector('.tabs').onclick=e=>{const btn=e.target.closest('[data-skill]');if(btn){statsFilter.skill=btn.dataset.skill;update();}};
  $('#stats-range').onchange=e=>{statsFilter.days=Number(e.target.value);update();};update();
}
