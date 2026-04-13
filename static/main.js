'use strict';
const id = s => document.getElementById(s);

// ── State ─────────────────────────────────────────────────────────────────────
let nodes=[], edges=[], running=false, timer=null, step=0;
let beta=0.3, gamma=0.1, delta=0.05, spd=5, mode='vaccinate';
let netType='random', nodeCount=35, avgDegree=3;
let aiSuggested=[], chartInst=null, tStepData={}, currentTStep=1;
let stateHistory=[], lastMarkov=null;
let infectionStep={};   // nodeId -> step when first infected
let maxInfStep=1;       // for color normalization
let viewMode='normal';  // 'normal' | 'wave'
const MAX_HIS=80;
const COLORS={'S':'#4CAF50','I':'#F44336','R':'#2196F3','V':'#FF9800','D':'#9C27B0','_':'#1a1d27'};

// ── Canvas ────────────────────────────────────────────────────────────────────
const nc=id('nc'), ctx=nc.getContext('2d');
function resizeCanvas(){
  const w=nc.parentElement.clientWidth-22;
  nc.style.width=w+'px';
  nc.style.height=Math.round(w*0.5)+'px';
}

// ── Draw network ──────────────────────────────────────────────────────────────
function draw(){
  const dpr=window.devicePixelRatio||1;
  const W=nc.clientWidth||600, H=nc.clientHeight||300;
  nc.width=W*dpr; nc.height=H*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  const px=n=>n.x*W/700, py=n=>n.y*H/400;
  if(viewMode==='wave') drawWave(W,H,px,py);
  else drawNormal(W,H,px,py);
  updateStats();
}

function drawNormal(W,H,px,py){
  edges.forEach(({source,target})=>{
    const a=nodes[source],b=nodes[target];
    if(!a||!b) return;
    ctx.beginPath(); ctx.moveTo(px(a),py(a)); ctx.lineTo(px(b),py(b));
    ctx.strokeStyle='rgba(90,100,150,0.2)'; ctx.lineWidth=1; ctx.stroke();
  });
  nodes.forEach((n,i)=>{
    const x=px(n),y=py(n);
    if(aiSuggested.includes(i)&&n.state==='S'){
      ctx.beginPath(); ctx.arc(x,y,15,0,Math.PI*2);
      ctx.strokeStyle='#FF9800'; ctx.lineWidth=2.5;
      ctx.setLineDash([3,2]); ctx.stroke(); ctx.setLineDash([]);
    }
    const color=n.state==='I'?'#F44336':n.state==='R'?'#2196F3':n.state==='V'?'#FF9800':n.state==='D'?'#9C27B0':'#4CAF50';
    const r=n.state==='D'?6:9;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle=n.isolated?'rgba(96,125,139,0.4)':color; ctx.fill();
    if(n.state==='D'){
      ctx.strokeStyle='#9C27B0'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(x-4,y-4); ctx.lineTo(x+4,y+4);
      ctx.moveTo(x+4,y-4); ctx.lineTo(x-4,y+4); ctx.stroke();
    }
    if(n.state==='I'&&!n.isolated){
      ctx.beginPath(); ctx.arc(x,y,13,0,Math.PI*2);
      ctx.strokeStyle='rgba(244,67,54,0.2)'; ctx.lineWidth=4; ctx.stroke();
    }
    if(n.isolated&&n.state!=='D'){
      ctx.strokeStyle='#607D8B'; ctx.lineWidth=2;
      ctx.setLineDash([2,3]); ctx.stroke(); ctx.setLineDash([]);
    }
  });
}

function waveColor(t){
  const r=t<0.5?255:Math.round(255*(1-t)*2);
  const g=t<0.5?Math.round(t*2*170):Math.round(170+(t-0.5)*2*85);
  const b=t<0.5?30:Math.round((t-0.5)*2*220);
  return 'rgb('+r+','+g+','+b+')';
}

function drawWave(W,H,px,py){
  const mx=Math.max(1,maxInfStep);
  edges.forEach(({source,target})=>{
    const a=nodes[source],b=nodes[target];
    if(!a||!b) return;
    const aInf=infectionStep[source]!==undefined;
    const bInf=infectionStep[target]!==undefined;
    ctx.beginPath(); ctx.moveTo(px(a),py(a)); ctx.lineTo(px(b),py(b));
    ctx.strokeStyle=(aInf&&bInf)?'rgba(255,120,50,0.3)':'rgba(60,70,110,0.15)';
    ctx.lineWidth=1; ctx.stroke();
  });
  nodes.forEach((n,i)=>{
    const x=px(n),y=py(n);
    const infected=infectionStep[i]!==undefined;
    let color,r=9;
    if(n.state==='V'){ color='#FF9800'; }
    else if(!infected){ color=n.isolated?'rgba(50,55,90,0.5)':'rgba(70,80,120,0.45)'; }
    else {
      const t=infectionStep[i]/mx;
      color=waveColor(t);
      if(infectionStep[i]===0) r=14;
    }
    if(n.state==='D') r=6;
    if(infectionStep[i]===0&&n.state!=='D'){
      ctx.beginPath(); ctx.arc(x,y,20,0,Math.PI*2);
      ctx.strokeStyle='rgba(255,60,60,0.25)'; ctx.lineWidth=3; ctx.stroke();
      ctx.beginPath(); ctx.arc(x,y,26,0,Math.PI*2);
      ctx.strokeStyle='rgba(255,60,60,0.1)'; ctx.lineWidth=2; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle=color; ctx.fill();
    if(infected&&n.state!=='V'){
      ctx.fillStyle='rgba(255,255,255,0.92)';
      ctx.font='bold '+(r<=7?7:8)+'px sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(infectionStep[i]),x,y);
    }
    if(n.state==='D'){
      ctx.strokeStyle='#9C27B0'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(x-3,y-3); ctx.lineTo(x+3,y+3);
      ctx.moveTo(x+3,y-3); ctx.lineTo(x-3,y+3); ctx.stroke();
    }
  });
  // Colorbar
  const bw=100,bh=8,bx=W-110,by=H-22;
  for(let i=0;i<bw;i++){ctx.fillStyle=waveColor(i/bw);ctx.fillRect(bx+i,by,1,bh);}
  ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=0.5; ctx.strokeRect(bx,by,bw,bh);
  ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='9px sans-serif';
  ctx.textAlign='left'; ctx.fillText('step 0',bx,by+bh+9);
  ctx.textAlign='right'; ctx.fillText('step '+mx,bx+bw,by+bh+9);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats(){
  const s=nodes.filter(n=>n.state==='S'&&!n.isolated).length;
  const inf=nodes.filter(n=>n.state==='I').length;
  const r=nodes.filter(n=>n.state==='R').length;
  const v=nodes.filter(n=>n.state==='V').length;
  const d=nodes.filter(n=>n.state==='D').length;
  const iso=nodes.filter(n=>n.isolated&&n.state!=='D').length;
  id('ss').textContent=s; id('si').textContent=inf; id('sr').textContent=r;
  id('sv').textContent=v; id('sd').textContent=d; id('siso').textContent=iso;
  id('stepc').textContent=step;
  const r0=beta/gamma;
  const herd=r0>1?Math.max(0,Math.round((1-1/r0)*100)):0;
  const immune=v+r;
  const pct=nodes.length?Math.round(immune/nodes.length*100):0;
  id('curpct').textContent=pct+'%';
  const fill=id('herdfill');
  fill.style.width=Math.min(herd>0?pct/herd*100:100,100)+'%';
  fill.style.background=pct>=herd?'#4CAF50':'#5c8de8';
  updateMathPanel();
}

// ── Real-time math panel ──────────────────────────────────────────────────────
function updateMathPanel(){
  if(!lastMarkov) return;
  const d=lastMarkov;
  const k=Math.max(1,Math.round(avgDegree*0.3));

  // P(S->I)
  const pinf=1-Math.pow(1-beta,k);
  id('calc-pinf').textContent=
    `1 − (1 − ${beta.toFixed(2)})^${k} = ${pinf.toFixed(4)}`;

  // R0
  const r0=beta/gamma;
  id('calc-r0').textContent=
    `${beta.toFixed(2)} / ${gamma.toFixed(2)} = ${r0.toFixed(3)}`;
  const el=id('r0val');
  el.textContent=r0.toFixed(2);
  el.style.color=r0>1?'#EF5350':'#66BB6A';
  id('r0lbl').textContent=r0>1?'Epidemic spreads — R₀ > 1':'Epidemic fading — R₀ < 1';

  // Herd immunity
  const herd=r0>1?Math.max(0,(1-1/r0)*100):0;
  id('herdpct').textContent=herd.toFixed(1)+'%';
  id('calc-herd').textContent=r0>1
    ?`1 − 1/${r0.toFixed(2)} = ${(herd/100).toFixed(4)} (${herd.toFixed(1)}%)`
    :`R₀ ≤ 1 — no epidemic threshold`;

  // Expected extinction
  const ext=(1/gamma).toFixed(1);
  id('exttime').textContent=ext+' steps';
  id('calc-ext').textContent=`1 / ${gamma.toFixed(2)} = ${ext} steps`;

  // Row sums
  const rs=d.row_sums||[1,1,1];
  id('calc-rowsum').textContent=
    `Row S: ${rs[0].toFixed(4)} | Row I: ${rs[1].toFixed(4)} | Row R: 1.0000`;
  id('rs0').textContent=rs[0]?rs[0].toFixed(3):'1.000';
  id('rs1').textContent=rs[1]?rs[1].toFixed(3):'1.000';

  // Eigenvalue steady-state (theoretical — always R=1 for absorbing chain)
  const pi=d.steady_state||{S:0,I:0,R:1};
  id('pis-eq').textContent=pi.S.toFixed(3);
  id('pii-eq').textContent=pi.I.toFixed(3);
  id('pir-eq').textContent=pi.R.toFixed(3);
  id('calc-pi').textContent=
    `πS=${pi.S.toFixed(3)}  πI=${pi.I.toFixed(3)}  πR=${pi.R.toFixed(3)}`;

  // Transient distribution at current step t: π^T P^t  (the useful one)
  if(d.dist_evolution&&d.dist_evolution.length>0){
    const tidx=Math.min(step,d.dist_evolution.length-1);
    const dist=d.dist_evolution[tidx];
    // Show transient distribution in the main pi row
    id('pis').textContent=dist[0].toFixed(3);
    id('pii').textContent=dist[1].toFixed(3);
    id('pir').textContent=dist[2].toFixed(3);
    id('calc-dist').textContent=
      `t=${step}: S=${dist[0].toFixed(3)}  I=${dist[1].toFixed(3)}  R=${dist[2].toFixed(3)}`;
  }

  // Transition derivation
  const infN_avg=Math.ceil(avgDegree*0.3);
  id('calc-deriv').textContent=
    `p(S→I)=1−(1−${beta.toFixed(2)})^${k}=${pinf.toFixed(4)} | p(I→R)=${gamma.toFixed(3)} | p(I→I)=${(1-gamma-delta).toFixed(3)}`;

  // Avg degree
  id('avgdeg').textContent=avgDegree.toFixed(1);
  id('exttime').textContent=ext+' steps';
}

// ── Markov API ────────────────────────────────────────────────────────────────
async function fetchMarkov(){
  try{
    const res=await fetch('/api/markov',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({beta,gamma,delta,avg_degree:avgDegree}),
    });
    const d=await res.json();
    lastMarkov=d;
    applyMarkovToUI(d);
  }catch(_){}
}

function applyMarkovToUI(d){
  lastMarkov=d;
  const P=d.matrix;
  id('mss').textContent=P[0][0].toFixed(3);
  id('msi').textContent=P[0][1].toFixed(3);
  id('mii').textContent=P[1][1].toFixed(3);
  id('mir').textContent=P[1][2].toFixed(3);
  if(d.t_step_matrices){tStepData=d.t_step_matrices;showTStep(currentTStep,null);}
  updateMathPanel();
}

function showTStep(t,btn){
  currentTStep=t;
  if(btn){
    btn.closest('.card').querySelectorAll('.pill').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  }
  const M=tStepData[String(t)];
  if(!M) return;
  for(let i=0;i<3;i++) for(let j=0;j<3;j++){
    const el=id(`ts${i}${j}`);
    if(el) el.textContent=M[i][j].toFixed(3);
  }
}

// ── Load graph ────────────────────────────────────────────────────────────────
async function loadGraph(){
  try{
    const res=await fetch('/api/graph',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({net_type:netType,n:nodeCount,beta,gamma,delta}),
    });
    const d=await res.json();
    nodes=d.nodes; edges=d.edges; avgDegree=d.avg_degree;
    aiSuggested=[]; stateHistory=[];
    infectionStep={}; maxInfStep=1;
    // Record patient zero (initial infected nodes)
    nodes.forEach((n,i)=>{ if(n.state==='I'){ infectionStep[i]=0; } });
    applyMarkovToUI(d.markov);
    draw(); recordHistory(); drawHeatmap(); pushChart();
  }catch(_){}
}

// ── Sim step ──────────────────────────────────────────────────────────────────
function simStep(){
  step++;
  const adj={};
  nodes.forEach((_,i)=>(adj[i]=[]));
  edges.forEach(({source,target})=>{adj[source].push(target);adj[target].push(source);});
  const next=nodes.map(n=>n.state);
  nodes.forEach((n,i)=>{
    if(n.isolated||['V','R','D'].includes(n.state)) return;
    if(n.state==='S'){
      const infN=adj[i].filter(j=>nodes[j].state==='I'&&!nodes[j].isolated).length;
      if(infN>0&&Math.random()<1-Math.pow(1-beta,infN)) next[i]='I';
    } else if(n.state==='I'){
      const r=Math.random();
      if(r<gamma) next[i]='R';
      else if(r<gamma+delta) next[i]='D';
    }
  });
  nodes.forEach((n,i)=>{
    if(!n.isolated&&!['V','R','D'].includes(n.state)){
      const wasS=n.state==='S';
      n.state=next[i];
      if(wasS&&n.state==='I'&&infectionStep[i]===undefined){
        infectionStep[i]=step;
        if(step>maxInfStep) maxInfStep=step;
      }
    }
  });
  draw(); recordHistory(); drawHeatmap(); pushChart();
  if(!nodes.some(n=>n.state==='I')){
    running=false; clearInterval(timer);
    id('startBtn').textContent='▶ Start';
    id('sim-status').textContent='Done';
    id('sim-status').className='st-done';
  }
}

// ── Controls ──────────────────────────────────────────────────────────────────
function toggleSim(){
  if(running){
    running=false; clearInterval(timer);
    id('startBtn').textContent='▶ Start';
    id('sim-status').textContent='Paused'; id('sim-status').className='st-idle';
  } else {
    running=true; timer=setInterval(simStep,1100-spd*100);
    id('startBtn').textContent='⏸ Pause';
    id('sim-status').textContent='Running'; id('sim-status').className='st-run';
  }
}
function restartTimer(){if(running){clearInterval(timer);timer=setInterval(simStep,1100-spd*100);}}
function resetAll(){
  running=false; clearInterval(timer); step=0; aiSuggested=[]; stateHistory=[];
  infectionStep={}; maxInfStep=1; viewMode='normal';
  document.querySelectorAll('.view-pill').forEach((b,i)=>i===0?b.classList.add('active'):b.classList.remove('active'));
  id('startBtn').textContent='▶ Start';
  id('sim-status').textContent='Idle'; id('sim-status').className='st-idle';
  id('aimsg').textContent='Run Monte Carlo analysis to get suggestions.';
  id('aitags').innerHTML=''; id('applyBtn').style.display='none'; id('aisub').textContent='';
  if(chartInst){chartInst.data.labels=[];chartInst.data.datasets.forEach(d=>(d.data=[]));chartInst.update('none');}
  const hm=id('hm'); if(hm){const hctx=hm.getContext('2d');hctx.clearRect(0,0,hm.width,hm.height);}
  loadGraph();
}
function changeNet(v){netType=v;resetAll();}
function setViewMode(m,btn){
  viewMode=m;
  document.querySelectorAll('.view-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  draw();
}
function setMode(m,btn){
  mode=m;
  document.querySelectorAll('.toolbar .pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

// ── Canvas click ──────────────────────────────────────────────────────────────
nc.addEventListener('click',e=>{
  const rect=nc.getBoundingClientRect();
  const W=nc.clientWidth,H=nc.clientHeight;
  const mx=e.clientX-rect.left,my=e.clientY-rect.top;
  nodes.forEach((n,i)=>{
    const px=n.x*W/700,py=n.y*H/400;
    if(Math.hypot(px-mx,py-my)<14){
      if(n.state==='D') return;
      if(mode==='vaccinate'){n.state='V';n.isolated=false;}
      else if(mode==='isolate'){n.isolated=!n.isolated;}
      else if(mode==='infect'&&!n.isolated){n.state='I';}
      draw(); fetchMarkov();
    }
  });
});

// ── Heatmap ───────────────────────────────────────────────────────────────────
function recordHistory(){
  stateHistory.push(nodes.map(n=>n.isolated?'_':n.state));
  if(stateHistory.length>MAX_HIS) stateHistory.shift();
}
function drawHeatmap(){
  const hm=id('hm'); if(!hm||stateHistory.length===0) return;
  const W=hm.parentElement.clientWidth-22;
  const N=nodes.length, ROW=Math.max(2,Math.min(5,Math.floor(70/N)));
  hm.width=W; hm.height=N*ROW;
  const hctx=hm.getContext('2d');
  hctx.clearRect(0,0,W,N*ROW);
  const cols=stateHistory.length, colW=W/cols;
  stateHistory.forEach((snap,t)=>{
    snap.forEach((state,ni)=>{
      hctx.fillStyle=COLORS[state]||'#1a1d27';
      hctx.fillRect(Math.floor(t*colW),ni*ROW,Math.max(1,Math.ceil(colW)),ROW);
    });
  });
  hctx.strokeStyle='rgba(255,255,255,0.25)'; hctx.lineWidth=1;
  const cx=Math.floor((cols-1)*colW+colW/2);
  hctx.beginPath(); hctx.moveTo(cx,0); hctx.lineTo(cx,N*ROW); hctx.stroke();
}

// ── SIR chart ─────────────────────────────────────────────────────────────────
function initChart(){
  if(chartInst){chartInst.destroy();chartInst=null;}
  const cc=id('cc');
  const W=cc.parentElement.clientWidth||600;
  cc.width=W; cc.height=180;
  chartInst=new Chart(cc,{
    type:'line',
    data:{
      labels:[],
      datasets:[
        {label:'S',data:[],borderColor:'#4CAF50',borderWidth:2,pointRadius:0,tension:0.3,backgroundColor:'transparent'},
        {label:'I',data:[],borderColor:'#F44336',borderWidth:2,pointRadius:0,tension:0.3,backgroundColor:'transparent'},
        {label:'R',data:[],borderColor:'#2196F3',borderWidth:2,pointRadius:0,tension:0.3,backgroundColor:'transparent'},
        {label:'D',data:[],borderColor:'#9C27B0',borderWidth:2,pointRadius:0,tension:0.3,backgroundColor:'transparent',borderDash:[5,3]},
      ],
    },
    options:{
      animation:false,
      responsive:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{display:true,ticks:{color:'#3a4060',font:{size:9},maxTicksLimit:8},grid:{color:'rgba(50,60,90,0.4)'}},
        y:{display:true,min:0,ticks:{color:'#3a4060',font:{size:9},maxTicksLimit:5},grid:{color:'rgba(50,60,90,0.4)'}},
      },
    },
  });
}
function pushChart(){
  if(!chartInst) return;
  if(chartInst.data.labels.length>80){chartInst.data.labels.shift();chartInst.data.datasets.forEach(d=>d.data.shift());}
  chartInst.data.labels.push(String(step));
  chartInst.data.datasets[0].data.push(nodes.filter(n=>n.state==='S'&&!n.isolated).length);
  chartInst.data.datasets[1].data.push(nodes.filter(n=>n.state==='I').length);
  chartInst.data.datasets[2].data.push(nodes.filter(n=>n.state==='R').length);
  chartInst.data.datasets[3].data.push(nodes.filter(n=>n.state==='D').length);
  chartInst.update('none');
}

// ── AI ────────────────────────────────────────────────────────────────────────
async function runAI(){
  id('aimsg').textContent='Running 300 Monte Carlo scenarios...';
  id('aitags').innerHTML=''; id('applyBtn').style.display='none'; id('aiRunBtn').disabled=true;
  try{
    const res=await fetch('/api/ai_suggest',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nodes,edges,beta,gamma,delta,trials:300,top_k:6}),
    });
    const d=await res.json();
    aiSuggested=d.suggested.map(x=>x.id);
    id('aimsg').textContent=`Herd immunity needs ~${d.needed} vaccinations. AI found ${aiSuggested.length} critical nodes:`;
    const container=id('aitags');
    d.suggested.forEach(x=>{
      const tag=document.createElement('span');
      tag.className='ai-tag';
      tag.textContent=`#${x.id+1} · ${x.degree} links · −${x.score.toFixed(1)} cases`;
      container.appendChild(tag);
    });
    id('aisub').textContent=`Baseline: ${d.baseline_recovered} recovered, ${d.baseline_dead} dead | R₀=${d.r0} | Threshold: ${d.herd_threshold_pct}%`;
    id('applyBtn').style.display='block'; draw();
  }catch(_){id('aimsg').textContent='Error: Is Flask running? (python app.py)';}
  id('aiRunBtn').disabled=false;
}
function applyAI(){
  aiSuggested.forEach(i=>{if(nodes[i]&&nodes[i].state==='S') nodes[i].state='V';});
  aiSuggested=[];
  id('applyBtn').style.display='none';
  id('aimsg').textContent='AI suggestions applied. Start the simulation!';
  id('aitags').innerHTML=''; draw(); fetchMarkov();
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded',()=>{
  resizeCanvas(); initChart(); loadGraph();
});
window.addEventListener('resize',()=>{resizeCanvas();draw();});

// ── Law of Large Numbers Demo ─────────────────────────────────────────────────
let llnChart=null;

function initLLNChart(){
  if(llnChart){llnChart.destroy();llnChart=null;}
  const c=id('lln-chart');
  if(!c) return;
  c.width=c.parentElement.clientWidth||300; c.height=130;
  llnChart=new Chart(c,{
    type:'line',
    data:{
      labels:[],
      datasets:[
        {label:'Running mean',data:[],borderColor:'#5c8de8',borderWidth:2,pointRadius:0,tension:0.2,backgroundColor:'transparent'},
        {label:'True mean',data:[],borderColor:'rgba(76,175,80,0.6)',borderWidth:1.5,pointRadius:0,borderDash:[5,3],backgroundColor:'transparent'},
      ]
    },
    options:{
      animation:false,responsive:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{display:true,ticks:{color:'#3a4060',font:{size:8},maxTicksLimit:8},grid:{color:'rgba(50,60,90,0.3)'}},
        y:{display:true,ticks:{color:'#3a4060',font:{size:8},maxTicksLimit:5},grid:{color:'rgba(50,60,90,0.3)'}},
      }
    }
  });
}

function runLLN(){
  const btn=id('llnBtn');
  btn.disabled=true;
  id('lln-status').textContent='Running 300 JS simulations...';
  ['lln10','lln50','lln100','lln300','lln-var','lln-conv'].forEach(i=>id(i)&&(id(i).textContent='...'));

  const candidate=nodes.find(n=>n.state==='S'&&!n.isolated);
  if(!candidate||nodes.length===0){
    id('lln-status').textContent='No susceptible nodes — reset first.';
    btn.disabled=false; return;
  }

  // Build adjacency once
  const adj={};
  nodes.forEach((_,i)=>adj[i]=[]);
  edges.forEach(({source,target})=>{adj[source].push(target);adj[target].push(source);});

  function jsSim(vacId=null){
    const states={};
    nodes.forEach(n=>states[n.id]=n.state);
    if(vacId!==null) states[vacId]='V';
    for(let s=0;s<100;s++){
      const next={...states};
      for(const nid in states){
        const st=states[nid];
        if(st==='S'){
          const infN=(adj[+nid]||[]).filter(j=>states[j]==='I').length;
          if(infN>0&&Math.random()<1-Math.pow(1-beta,infN)) next[nid]='I';
        } else if(st==='I'){
          const r=Math.random();
          if(r<gamma) next[nid]='R';
          else if(r<gamma+delta) next[nid]='D';
        }
      }
      Object.assign(states,next);
      if(!Object.values(states).includes('I')) break;
    }
    return Object.values(states).filter(s=>s==='R').length;
  }

  // Run async in chunks to avoid blocking UI
  setTimeout(()=>{
    const baseline=Array.from({length:30},()=>jsSim()).reduce((a,b)=>a+b,0)/30;
    const MAX_N=300;
    const results=[];
    const runningMeans=[];
    const snapLabels=[];
    let sum=0;

    for(let i=0;i<MAX_N;i++){
      const impact=baseline-jsSim(candidate.id);
      sum+=impact;
      results.push(impact);
      runningMeans.push(+(sum/(i+1)).toFixed(3));
      if((i+1)%5===0) snapLabels.push(String(i+1));
      else snapLabels.push('');
    }

    const trueMean=+(results.reduce((a,b)=>a+b,0)/results.length).toFixed(3);
    const variance=+(results.reduce((a,b)=>a+Math.pow(b-trueMean,2),0)/results.length).toFixed(2);
    const mean=arr=>+(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(3);

    id('lln10').textContent=mean(results.slice(0,10));
    id('lln50').textContent=mean(results.slice(0,50));
    id('lln100').textContent=mean(results.slice(0,100));
    id('lln300').textContent=trueMean;
    id('lln-var').textContent=variance;

    const last50=runningMeans.slice(-50);
    const converged=last50.every(m=>Math.abs(m-trueMean)<Math.max(0.3,Math.abs(trueMean)*0.1));
    const convEl=id('lln-conv');
    convEl.textContent=converged?'Yes ✓':'Not yet';
    convEl.style.color=converged?'#4CAF50':'#F44336';

    if(llnChart){
      llnChart.data.labels=snapLabels;
      llnChart.data.datasets[0].data=runningMeans;
      llnChart.data.datasets[1].data=snapLabels.map(()=>trueMean);
      llnChart.update('none');
    }

    id('lln-status').textContent='Node #'+(candidate.id+1)+': true mean='+trueMean+'. Running mean converges as n→∞.';
    btn.disabled=false;
  },50);
}

// Re-init LLN chart on load
window.addEventListener('DOMContentLoaded',()=>{
  setTimeout(initLLNChart,500);
});
