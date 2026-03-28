'use strict';

// ── Helpers ───────────────────────────────────────────────────────────────────
const id = s => document.getElementById(s);

// ── State ─────────────────────────────────────────────────────────────────────
let nodes = [], edges = [], running = false, timer = null, step = 0;
let beta = 0.3, gamma = 0.1, spd = 5, mode = 'vaccinate';
let netType = 'random', nodeCount = 35, avgDegree = 3;
let aiSuggested = [], chartInst = null;

// ── Canvas ────────────────────────────────────────────────────────────────────
const nc  = id('nc');
const ctx = nc.getContext('2d');

function resizeCanvas() {
  const w = nc.parentElement.clientWidth - 24;
  nc.style.width  = w + 'px';
  nc.style.height = Math.round(w * 0.55) + 'px';
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function draw() {
  const dpr = window.devicePixelRatio || 1;
  const W   = nc.clientWidth  || 600;
  const H   = nc.clientHeight || 330;
  nc.width  = W * dpr;
  nc.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const px = n => n.x * W / 700;
  const py = n => n.y * H / 400;

  // Edges
  edges.forEach(({ source, target }) => {
    const a = nodes[source], b = nodes[target];
    if (!a || !b) return;
    ctx.beginPath();
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
    ctx.strokeStyle = 'rgba(100,110,160,0.25)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);
    ctx.stroke();
  });

  // Nodes
  nodes.forEach((n, i) => {
    const x = px(n), y = py(n);
    const isAI = aiSuggested.includes(i) && n.state === 'S';

    // AI ring
    if (isAI) {
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = '#FF9800';
      ctx.lineWidth   = 2.5;
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Node fill
    const color = n.state === 'I' ? '#F44336'
                : n.state === 'R' ? '#2196F3'
                : n.state === 'V' ? '#FF9800'
                : '#4CAF50';

    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = n.isolated ? 'rgba(120,120,130,0.45)' : color;
    ctx.fill();

    // Isolated dash border
    if (n.isolated) {
      ctx.strokeStyle = '#78909C';
      ctx.lineWidth   = 2;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Glow for infected
    if (n.state === 'I' && !n.isolated) {
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(244,67,54,0.25)';
      ctx.lineWidth   = 4;
      ctx.stroke();
    }
  });

  updateStats();
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  const s   = nodes.filter(n => n.state === 'S' && !n.isolated).length;
  const inf = nodes.filter(n => n.state === 'I').length;
  const r   = nodes.filter(n => n.state === 'R').length;
  const v   = nodes.filter(n => n.state === 'V').length;
  id('ss').textContent    = s;
  id('si').textContent    = inf;
  id('sr').textContent    = r;
  id('sv').textContent    = v;
  id('stepc').textContent = step;

  // Herd immunity bar
  const r0   = beta / gamma;
  const herd = r0 > 1 ? Math.max(0, Math.round((1 - 1 / r0) * 100)) : 0;
  const pct  = nodes.length ? Math.round(v / nodes.length * 100) : 0;
  id('curpct').textContent = pct + '%';
  const fill = id('herdfill');
  fill.style.width      = Math.min(herd > 0 ? pct / herd * 100 : 100, 100) + '%';
  fill.style.background = pct >= herd ? '#4CAF50' : '#5c8de8';
}

// ── Markov panel ──────────────────────────────────────────────────────────────
async function fetchMarkov() {
  try {
    const res  = await fetch('/api/markov', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beta, gamma, avg_degree: avgDegree }),
    });
    const d = await res.json();
    const P = d.matrix, pi = d.steady_state, r0 = d.r0;

    id('mss').textContent = P[0][0].toFixed(2);
    id('msi').textContent = P[0][1].toFixed(2);
    id('mii').textContent = P[1][1].toFixed(2);
    id('mir').textContent = P[1][2].toFixed(2);
    id('pis').textContent = pi.S.toFixed(2);
    id('pii').textContent = pi.I.toFixed(2);
    id('pir').textContent = pi.R.toFixed(2);

    const el = id('r0val');
    el.textContent  = r0.toFixed(2);
    el.style.color  = r0 > 1 ? '#EF5350' : '#66BB6A';
    id('r0lbl').textContent = r0 > 1
      ? 'Epidemic spreads — R₀ > 1'
      : 'Epidemic fading — R₀ < 1';
    id('herdpct').textContent = d.herd + '%';
  } catch (_) {}
}

// ── Load graph from API ───────────────────────────────────────────────────────
async function loadGraph() {
  try {
    const res = await fetch('/api/graph', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ net_type: netType, n: nodeCount, beta, gamma }),
    });
    const d  = await res.json();
    nodes     = d.nodes;
    edges     = d.edges;
    avgDegree = d.avg_degree;
    aiSuggested = [];
    fetchMarkov();
    draw();
    pushChart();
  } catch (_) {}
}

// ── Simulation step ───────────────────────────────────────────────────────────
function simStep() {
  step++;

  // Build adjacency
  const adj = {};
  nodes.forEach((_, i) => (adj[i] = []));
  edges.forEach(({ source, target }) => {
    adj[source].push(target);
    adj[target].push(source);
  });

  const next = nodes.map(n => n.state);
  nodes.forEach((n, i) => {
    if (n.isolated || n.state === 'V') return;
    if (n.state === 'S') {
      const infN = adj[i].filter(j => nodes[j].state === 'I' && !nodes[j].isolated).length;
      if (infN > 0 && Math.random() < 1 - Math.pow(1 - beta, infN)) next[i] = 'I';
    } else if (n.state === 'I') {
      if (Math.random() < gamma) next[i] = 'R';
    }
  });

  nodes.forEach((n, i) => { if (!n.isolated && n.state !== 'V') n.state = next[i]; });
  draw();
  pushChart();

  if (!nodes.some(n => n.state === 'I')) {
    running = false;
    clearInterval(timer);
    id('startBtn').textContent = '▶ Start';
  }
}

// ── Controls ──────────────────────────────────────────────────────────────────
function toggleSim() {
  if (running) {
    running = false; clearInterval(timer);
    id('startBtn').textContent = '▶ Start';
  } else {
    running = true; timer = setInterval(simStep, 1100 - spd * 100);
    id('startBtn').textContent = '⏸ Pause';
  }
}

function restartTimer() {
  if (running) { clearInterval(timer); timer = setInterval(simStep, 1100 - spd * 100); }
}

function resetAll() {
  running = false; clearInterval(timer); step = 0; aiSuggested = [];
  id('startBtn').textContent = '▶ Start';
  id('aimsg').textContent    = 'Run Monte Carlo analysis to get suggestions.';
  id('aitags').innerHTML     = '';
  id('applyBtn').style.display = 'none';
  id('aisub').textContent    = '';
  if (chartInst) {
    chartInst.data.labels = [];
    chartInst.data.datasets.forEach(d => (d.data = []));
    chartInst.update('none');
  }
  loadGraph();
}

function changeNet(v) { netType = v; resetAll(); }

function setMode(m, btn) {
  mode = m;
  document.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ── Canvas click ──────────────────────────────────────────────────────────────
nc.addEventListener('click', e => {
  const rect = nc.getBoundingClientRect();
  const W    = nc.clientWidth, H = nc.clientHeight;
  const mx   = e.clientX - rect.left, my = e.clientY - rect.top;
  nodes.forEach((n, i) => {
    const px = n.x * W / 700, py = n.y * H / 400;
    if (Math.hypot(px - mx, py - my) < 14) {
      if      (mode === 'vaccinate')                  { n.state = 'V'; n.isolated = false; }
      else if (mode === 'isolate')                    { n.isolated = !n.isolated; }
      else if (mode === 'infect' && !n.isolated)      { n.state = 'I'; }
      draw(); fetchMarkov();
    }
  });
});

// ── AI advisor ────────────────────────────────────────────────────────────────
async function runAI() {
  id('aimsg').textContent      = 'Running 300 Monte Carlo scenarios...';
  id('aitags').innerHTML       = '';
  id('applyBtn').style.display = 'none';
  id('aiRunBtn').disabled      = true;

  try {
    const res  = await fetch('/api/ai_suggest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges, beta, gamma, trials: 300, top_k: 6 }),
    });
    const d = await res.json();
    aiSuggested = d.suggested.map(x => x.id);

    id('aimsg').textContent =
      `Herd immunity needs ~${d.needed} vaccinations. ` +
      `AI identified ${aiSuggested.length} critical nodes:`;

    const container = id('aitags');
    d.suggested.forEach(x => {
      const tag = document.createElement('span');
      tag.className   = 'ai-tag';
      tag.textContent = `#${x.id + 1} · ${x.degree} links · −${x.score.toFixed(1)} cases`;
      container.appendChild(tag);
    });

    id('aisub').textContent =
      `Baseline: ${d.baseline_recovered} cases | R₀=${d.r0} | Threshold: ${d.herd_threshold_pct}%`;
    id('applyBtn').style.display = 'block';
    draw();
  } catch (_) {
    id('aimsg').textContent = 'Error: Is the Flask server running?';
  }
  id('aiRunBtn').disabled = false;
}

function applyAI() {
  aiSuggested.forEach(i => { if (nodes[i] && nodes[i].state === 'S') nodes[i].state = 'V'; });
  aiSuggested = [];
  id('applyBtn').style.display = 'none';
  id('aimsg').textContent      = 'AI suggestions applied. Start the simulation to observe the effect!';
  id('aitags').innerHTML       = '';
  draw(); fetchMarkov();
}

// ── SIR Chart ─────────────────────────────────────────────────────────────────
function initChart() {
  if (chartInst) { chartInst.destroy(); chartInst = null; }
  const cc = id('cc');
  cc.width  = cc.parentElement.clientWidth  || 260;
  cc.height = 96;
  chartInst = new Chart(cc, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'S', data: [], borderColor: '#4CAF50', borderWidth: 1.5, pointRadius: 0, tension: 0.3, backgroundColor: 'transparent' },
        { label: 'I', data: [], borderColor: '#F44336', borderWidth: 1.5, pointRadius: 0, tension: 0.3, backgroundColor: 'transparent' },
        { label: 'R', data: [], borderColor: '#2196F3', borderWidth: 1.5, pointRadius: 0, tension: 0.3, backgroundColor: 'transparent' },
      ],
    },
    options: {
      animation: false, responsive: false,
      plugins: {
        legend: { display: true, labels: { color: '#7986cb', font: { size: 10 }, boxWidth: 14, padding: 6 } },
      },
      scales: {
        x: { display: false },
        y: {
          display: true, min: 0,
          ticks: { font: { size: 9 }, maxTicksLimit: 4, color: '#7986cb' },
          grid:  { color: 'rgba(100,110,160,0.1)' },
        },
      },
    },
  });
}

function pushChart() {
  if (!chartInst) return;
  if (chartInst.data.labels.length > 60) {
    chartInst.data.labels.shift();
    chartInst.data.datasets.forEach(d => d.data.shift());
  }
  chartInst.data.labels.push(String(step));
  chartInst.data.datasets[0].data.push(nodes.filter(n => n.state === 'S' && !n.isolated).length);
  chartInst.data.datasets[1].data.push(nodes.filter(n => n.state === 'I').length);
  chartInst.data.datasets[2].data.push(nodes.filter(n => n.state === 'R').length);
  chartInst.update('none');
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  initChart();
  loadGraph();
});

window.addEventListener('resize', () => {
  resizeCanvas();
  draw();
});

