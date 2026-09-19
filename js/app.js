'use strict';

/* =========================================================================
 * Interface: edição visual do grafo, painéis de representação e
 * reprodução passo a passo dos algoritmos.
 * ========================================================================= */

(() => {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const R = 20;                 // raio do vértice
  const MAX_VERTICES = 60;
  const STORAGE_KEY = 'visualizador-grafos:v1';
  const COMP_COLORS = ['#93c5fd', '#fca5a5', '#86efac', '#fcd34d', '#c4b5fd', '#f9a8d4', '#5eead4', '#fdba74', '#a5b4fc', '#bef264'];

  const HINTS = {
    move: 'Arraste os vértices para organizá-los. Duplo clique renomeia um vértice ou altera o peso de uma aresta; duplo clique no vazio cria um vértice.',
    vertex: 'Clique em uma área vazia para criar um vértice.',
    edge: 'Clique no vértice de origem e depois no de destino (ou arraste de um até o outro). Esc cancela.',
    delete: 'Clique em um vértice ou aresta para removê-lo.',
  };

  // Coordenadas normalizadas (0–1), convertidas para o tamanho da área ao carregar.
  const EXAMPLES = {
    basico: {
      directed: false, weighted: false,
      vertices: [['A', 0, .5], ['B', .25, .08], ['C', .25, .92], ['D', .5, .5], ['E', .55, 1], ['F', .75, .08], ['G', .8, .6], ['H', 1, .95]],
      edges: [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['C', 'E'], ['D', 'F'], ['D', 'G'], ['E', 'G'], ['F', 'G'], ['G', 'H']],
    },
    ponderado: {
      directed: false, weighted: true,
      vertices: [['A', 0, .5], ['B', .3, .05], ['C', .3, .95], ['D', .68, .05], ['E', .68, .95], ['F', 1, .5]],
      edges: [['A', 'B', 4], ['A', 'C', 2], ['B', 'C', 1], ['B', 'D', 5], ['C', 'D', 8], ['C', 'E', 10], ['D', 'E', 2], ['D', 'F', 6], ['E', 'F', 2]],
    },
    desconexo: {
      directed: false, weighted: false,
      vertices: [['A', 0, .15], ['B', .22, 0], ['C', .22, .4], ['D', .5, .05], ['E', .75, .05], ['F', .75, .45], ['G', .5, .45],
        ['H', .05, .9], ['I', .35, .9], ['J', .9, .9]],
      edges: [['A', 'B'], ['B', 'C'], ['C', 'A'], ['D', 'E'], ['E', 'F'], ['F', 'G'], ['G', 'D'], ['H', 'I']],
    },
    dirigido: {
      directed: true, weighted: false,
      vertices: [['A', 0, .1], ['B', .33, .1], ['C', .66, .1], ['D', 1, .1], ['E', 0, .9], ['F', .33, .9], ['G', .66, .9], ['H', 1, .9]],
      edges: [['A', 'B'], ['B', 'C'], ['B', 'E'], ['B', 'F'], ['C', 'D'], ['C', 'G'], ['D', 'C'], ['D', 'H'], ['E', 'A'], ['E', 'F'],
        ['F', 'G'], ['G', 'F'], ['G', 'H']],
    },
  };

  const g = new Graph();
  const state = {
    mode: 'move',
    selected: null,   // vértice selecionado
    pending: null,    // origem de uma aresta em criação
    drag: null,
    mouse: null,
    run: null,        // { name, steps, idx }
    timer: null,
    editor: null,
  };

  const svg = $('#canvas');
  const edgesLayer = $('#edgesLayer');
  const verticesLayer = $('#verticesLayer');
  const rubber = $('#rubber');
  const wrap = $('#canvasWrap');
  const editor = $('#inlineEditor');

  // ================================================================ util

  let toastTimer;
  function toast(msg, kind = 'info') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(g.toJSON())); } catch { /* armazenamento indisponível */ }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      g.load(JSON.parse(raw));
      return true;
    } catch {
      return false;
    }
  }

  function canvasSize() {
    const r = svg.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function pointFrom(e) {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function clampPos(v) {
    const { w, h } = canvasSize();
    const m = R + 4;
    v.x = Math.min(Math.max(v.x, m), Math.max(m, w - m));
    v.y = Math.min(Math.max(v.y, m), Math.max(m, h - m));
  }

  function vertexAt(x, y) {
    for (let i = g.vertices.length - 1; i >= 0; i--) {
      const v = g.vertices[i];
      if (Math.hypot(v.x - x, v.y - y) <= R + 2) return v;
    }
    return null;
  }

  const currentStep = () => (state.run ? state.run.steps[state.run.idx] : null);

  // ============================================================ mudanças

  /** Chamado sempre que a estrutura do grafo muda. */
  function structureChanged() {
    if (state.run) {
      stopRun();
      toast('A execução foi encerrada porque o grafo foi alterado.');
    }
    save();
    refreshSelectors();
    renderAll();
  }

  function syncOptions() {
    $('#optDirected').checked = g.directed;
    $('#optWeighted').checked = g.weighted;
    updateAlgoOptions();
  }

  // ============================================================ desenho

  function edgeGeometry(e, transpose) {
    let a = g.vertex(e.from), b = g.vertex(e.to);
    if (transpose) [a, b] = [b, a];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const curved = g.directed && g.edges.some(o => o !== e && o.from === e.to && o.to === e.from);
    const bend = curved ? Math.min(38, len * 0.25) : 0;
    const cx = (a.x + b.x) / 2 - (dy / len) * bend;
    const cy = (a.y + b.y) / 2 + (dx / len) * bend;
    const toward = (p, r) => {
      const ddx = cx - p.x, ddy = cy - p.y, l = Math.hypot(ddx, ddy) || 1;
      return { x: p.x + (ddx / l) * r, y: p.y + (ddy / l) * r };
    };
    const p0 = toward(a, R);
    const p1 = toward(b, R + (g.directed ? 1 : 0));
    const f = n => n.toFixed(1);
    const d = curved
      ? `M${f(p0.x)},${f(p0.y)} Q${f(cx)},${f(cy)} ${f(p1.x)},${f(p1.y)}`
      : `M${f(p0.x)},${f(p0.y)} L${f(p1.x)},${f(p1.y)}`;
    const mid = curved
      ? { x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y }
      : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { d, mid };
  }

  function renderCanvas() {
    const step = currentStep();
    const transpose = !!step?.transpose;
    const rank = { idle: 0, dim: 0, back: 1, tree: 2, path: 3, active: 4 };

    const edgeClass = e => {
      if (!step) return 'idle';
      if (step.focusEdge === e.id) return 'active';
      if (step.es[e.id]) return step.es[e.id];
      return step.final && Object.values(step.es).includes('path') ? 'dim' : 'idle';
    };

    let html = '';
    g.edges
      .map(e => ({ e, cls: edgeClass(e) }))
      .sort((a, b) => rank[a.cls] - rank[b.cls])
      .forEach(({ e, cls }) => {
        const { d, mid } = edgeGeometry(e, transpose);
        const markerCls = cls === 'dim' ? 'idle' : cls;
        const marker = g.directed ? ` marker-end="url(#arrow-${markerCls})"` : '';
        html += `<g class="edge ${cls}" data-edge="${e.id}">` +
          `<path class="edge-hit" d="${d}"/><path class="edge-line" d="${d}"${marker}/>` +
          (g.weighted ? `<text class="edge-weight" x="${mid.x.toFixed(1)}" y="${mid.y.toFixed(1)}">${esc(formatNum(e.weight))}</text>` : '') +
          '</g>';
      });
    edgesLayer.innerHTML = html;

    let vh = '';
    for (const v of g.vertices) {
      const st = step ? (step.vs[v.id] || 'unvisited') : 'idle';
      const cls = ['vertex', `st-${st}`];
      if (step && step.focusVertex === v.id) cls.push('focus');
      if (state.selected === v.id && !step) cls.push('selected');
      if (state.pending === v.id) cls.push('pending');
      const comp = step?.comp[v.id];
      const fill = comp ? ` style="fill:${COMP_COLORS[(comp - 1) % COMP_COLORS.length]}"` : '';
      const badge = step?.badges[v.id];
      vh += `<g class="${cls.join(' ')}" data-id="${v.id}" transform="translate(${v.x.toFixed(1)},${v.y.toFixed(1)})">` +
        `<circle class="halo" r="${R + 6}"/><circle class="body" r="${R}"${fill}/>` +
        `<text class="label" dy="0.35em">${esc(v.label)}</text>` +
        (badge != null ? `<text class="badge" y="${R + 16}">${esc(badge)}</text>` : '') +
        '</g>';
    }
    verticesLayer.innerHTML = vh;

    updateRubber();
    $('#emptyState').hidden = g.vertices.length > 0;
    $('#legend').hidden = !step;
    $('#transposeFlag').hidden = !transpose;
  }

  function updateRubber() {
    const p = state.pending != null ? g.vertex(state.pending) : null;
    if (!p || !state.mouse) { rubber.style.display = 'none'; return; }
    rubber.setAttribute('x1', p.x);
    rubber.setAttribute('y1', p.y);
    rubber.setAttribute('x2', state.mouse.x);
    rubber.setAttribute('y2', state.mouse.y);
    rubber.style.display = 'block';
  }

  // ======================================================= representações

  function renderAdjList() {
    const step = currentStep();
    const vs = g.sortedVertices();
    $('#listNote').textContent = g.directed
      ? 'Cada vértice aponta para os vértices alcançados por suas arestas de saída. Memória O(V + E).'
      : 'Cada vértice lista todos os seus vizinhos (cada aresta aparece duas vezes). Memória O(V + E).';
    if (!vs.length) { $('#adjList').innerHTML = '<p class="muted">Grafo vazio.</p>'; return; }

    $('#adjList').innerHTML = vs.map(v => {
      const cur = step && step.current === v.id && !step.transpose;
      const nbs = g.neighbors(v.id);
      const items = nbs.length
        ? nbs.map(n => `<span class="adj-node${cur && step.focusVertex === n.v ? ' focus' : ''}">${esc(g.label(n.v))}` +
            (g.weighted ? `<small>${esc(formatNum(n.edge.weight))}</small>` : '') + '</span>').join('<span class="adj-link"></span>')
        : '<span class="adj-null">∅</span>';
      return `<div class="adj-row${cur ? ' cur' : ''}"><span class="adj-head">${esc(v.label)}</span><span class="adj-arrow">→</span>${items}</div>`;
    }).join('');
  }

  function renderMatrix() {
    const step = currentStep();
    const vs = g.sortedVertices();
    $('#matrixNote').textContent =
      (g.directed ? 'Linha = origem, coluna = destino. ' : 'Em grafos não dirigidos a matriz é simétrica. ') +
      (g.weighted ? 'Cada célula mostra o peso da aresta (· = sem aresta). ' : 'Célula 1 = existe aresta, 0 = não existe. ') +
      'Memória O(V²); consulta de aresta em O(1).';
    if (!vs.length) { $('#adjMatrix').innerHTML = '<p class="muted">Grafo vazio.</p>'; return; }

    const cur = step && !step.transpose ? step.current : null;
    const focus = cur != null ? step.focusVertex : null;
    let html = '<table class="data matrix"><thead><tr><th></th>' +
      vs.map(v => `<th class="${v.id === focus ? 'colcur' : ''}">${esc(v.label)}</th>`).join('') + '</tr></thead><tbody>';
    for (const u of vs) {
      html += `<tr class="${u.id === cur ? 'cur' : ''}"><th>${esc(u.label)}</th>`;
      for (const v of vs) {
        const e = u.id === v.id ? null : g.findEdge(u.id, v.id);
        const val = e ? (g.weighted ? formatNum(e.weight) : '1') : (g.weighted ? '·' : '0');
        const cls = [e ? 'one' : 'zero'];
        if (u.id === cur && v.id === focus) cls.push('focus');
        html += `<td class="${cls.join(' ')}">${esc(val)}</td>`;
      }
      html += '</tr>';
    }
    $('#adjMatrix').innerHTML = html + '</tbody></table>';
  }

  function renderInfo() {
    const n = g.vertices.length, m = g.edges.length;
    const yes = t => `<span class="yes">${t}</span>`, no = t => `<span class="no">${t}</span>`;
    const rows = [
      ['Tipo', `${g.directed ? 'Dirigido' : 'Não dirigido'}, ${g.weighted ? 'ponderado' : 'sem pesos'}`],
      ['Vértices |V|', n],
      ['Arestas |E|', m],
    ];
    if (n > 1) {
      const max = g.directed ? n * (n - 1) : n * (n - 1) / 2;
      rows.push(['Densidade', `${formatNum(m / max)} (${m} de ${max} arestas possíveis)`]);
    }
    if (n) {
      const weak = Algorithms.weakComponents(g);
      if (g.directed) {
        const strong = Algorithms.strongComponents(g);
        rows.push(['Fracamente conexo', weak.length === 1 ? yes('Sim') : no(`Não — ${weak.length} componentes`)]);
        rows.push(['Fortemente conexo', strong.length === 1 ? yes('Sim') : no(`Não — ${strong.length} componentes`)]);
        rows.push(['Comp. fortemente conexas', esc(Algorithms.groupsText(g, strong))]);
      } else {
        rows.push(['Conexo', weak.length === 1 ? yes('Sim') : no(`Não — ${weak.length} componentes`)]);
        rows.push(['Componentes', esc(Algorithms.groupsText(g, weak))]);
      }
      rows.push(['Possui ciclo', Algorithms.hasCycle(g) ? 'Sim' : 'Não']);
    }
    $('#graphInfo').innerHTML = `<dl class="info-grid">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

    const vs = g.sortedVertices();
    if (!vs.length) { $('#degreeTable').innerHTML = '<p class="muted">Grafo vazio.</p>'; return; }
    const head = g.directed ? ['Vértice', 'Entrada', 'Saída', 'Total'] : ['Vértice', 'Grau'];
    const body = vs.map(v => {
      const d = g.degrees(v.id);
      const cells = g.directed ? [v.label, d.in, d.out, d.total] : [v.label, d.total];
      return `<tr>${cells.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
    }).join('');
    const sum = vs.reduce((acc, v) => acc + g.degrees(v.id).total, 0);
    const foot = g.directed
      ? `Soma das entradas = soma das saídas = |E| = ${m}.`
      : `Soma dos graus = ${sum} = 2·|E| (lema do aperto de mãos).`;
    $('#degreeTable').innerHTML = `<table class="data"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>` +
      `<p class="note" style="margin:8px 0 0">${foot}</p>`;
  }

  // ======================================================= execução / player

  function renderPseudo(name, lines) {
    const hl = new Set(lines);
    $('#pseudo').innerHTML = Algorithms.INFO[name].pseudo
      .map((l, i) => `<div class="pl${hl.has(i) ? ' hl' : ''}"><span class="ln">${i + 1}</span><span>${esc(l)}</span></div>`)
      .join('');
  }

  function renderDs(step) {
    const box = $('#dsItems');
    const ds = step?.ds;
    $('#dsTitle').textContent = ds ? ds.title : 'Estrutura auxiliar';
    box.className = `ds ${ds ? ds.kind : ''}`;
    if (!ds) { box.innerHTML = '<span class="muted">—</span>'; return; }
    if (!ds.items.length) { box.innerHTML = '<span class="muted">vazia</span>'; return; }
    const chips = ds.items.map((x, i) => `<span class="chip${i === 0 ? ' head' : ''}">${esc(x)}</span>`).join('');
    const start = { queue: 'início', stack: 'topo', pq: 'mínimo' }[ds.kind];
    box.innerHTML = `<span class="end">${start} →</span>${chips}${ds.kind === 'queue' ? '<span class="end">← fim</span>' : ''}`;
  }

  function renderTable(step) {
    const t = step?.table;
    if (!t) { $('#stateTable').innerHTML = '<span class="muted">—</span>'; return; }
    $('#stateTable').innerHTML = '<table class="data"><thead><tr>' + t.cols.map(c => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>' +
      t.rows.map(r => {
        const cls = r.id === step.current ? 'cur' : r.id === step.focusVertex ? 'focus' : '';
        return `<tr class="${cls}">${r.cells.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
      }).join('') + '</tbody></table>';
  }

  function buildLog() {
    const log = $('#stepLog');
    if (!state.run) { log.innerHTML = ''; $('#logCount').textContent = ''; return; }
    log.innerHTML = state.run.steps.map((s, i) => `<li data-i="${i}">${esc(s.msg)}</li>`).join('');
    $('#logCount').textContent = `(${state.run.steps.length})`;
  }

  function renderRunPanel() {
    const run = state.run;
    const step = currentStep();
    $('#player').classList.toggle('idle', !run);
    ['#btnFirst', '#btnPrev', '#btnPlay', '#btnNext', '#btnLast', '#stepSlider', '#btnStop']
      .forEach(s => { $(s).disabled = !run; });

    renderPseudo(run ? run.name : $('#algoSelect').value, step ? [].concat(step.line) : []);
    renderDs(step);
    renderTable(step);

    const msg = $('#stepMsg');
    if (!run) {
      $('#stepCounter').textContent = '—';
      $('#stepSlider').max = 0;
      $('#stepSlider').value = 0;
      msg.className = 'step-msg';
      msg.textContent = 'Monte o grafo, escolha um algoritmo na barra lateral e clique em "Executar passo a passo".';
      updatePlayButton();
      return;
    }

    const n = run.steps.length;
    $('#stepSlider').max = n - 1;
    $('#stepSlider').value = run.idx;
    $('#stepCounter').textContent = `Passo ${run.idx + 1} de ${n}`;
    msg.className = `step-msg${step.final ? ' final' : ''}`;
    msg.textContent = step.msg;

    const log = $('#stepLog');
    [...log.children].forEach((li, i) => {
      li.classList.toggle('active', i === run.idx);
      li.classList.toggle('future', i > run.idx);
    });
    const li = log.children[run.idx];
    if (li) log.scrollTop = li.offsetTop - log.clientHeight / 2 + li.offsetHeight / 2;
    updatePlayButton();
  }

  function renderStep() {
    renderCanvas();
    renderRunPanel();
    renderAdjList();
    renderMatrix();
  }

  function renderAll() {
    renderStep();
    renderInfo();
  }

  function startRun() {
    commitEditor();
    const name = $('#algoSelect').value;
    const src = Number($('#srcSelect').value);
    const dst = Number($('#dstSelect').value);
    const res = Algorithms.run(name, g, src, dst);
    if (res.error) { toast(res.error, 'error'); return; }
    pause();
    state.pending = null;
    state.run = { name, steps: res.steps, idx: 0 };
    buildLog();
    renderStep();
    play();
  }

  function stopRun() {
    pause();
    state.run = null;
    buildLog();
    renderStep();
  }

  function goTo(i) {
    if (!state.run) return;
    state.run.idx = Math.max(0, Math.min(i, state.run.steps.length - 1));
    renderStep();
  }

  const stepDelay = () => 1300 / Number($('#speed').value);

  function play() {
    if (!state.run) return;
    pause();
    if (state.run.idx >= state.run.steps.length - 1) goTo(0);
    state.timer = setInterval(() => {
      if (!state.run || state.run.idx >= state.run.steps.length - 1) { pause(); return; }
      goTo(state.run.idx + 1);
    }, stepDelay());
    updatePlayButton();
  }

  function pause() {
    clearInterval(state.timer);
    state.timer = null;
    updatePlayButton();
  }

  function togglePlay() {
    if (state.timer) pause(); else play();
  }

  function updatePlayButton() {
    const btn = $('#btnPlay');
    btn.textContent = state.timer ? '❚❚' : '▶';
    btn.setAttribute('aria-label', state.timer ? 'Pausar' : 'Reproduzir');
  }

  // ======================================================= seleção de algoritmo

  function updateAlgoOptions() {
    const sel = $('#algoSelect');
    const prev = sel.value || 'bfs';
    sel.innerHTML = Object.entries(Algorithms.INFO)
      .map(([key, info]) => `<option value="${key}"${info.directedOnly && !g.directed ? ' disabled' : ''}>${esc(info.name)}` +
        `${info.directedOnly && !g.directed ? ' — só dirigidos' : ''}</option>`)
      .join('');
    const prevInfo = Algorithms.INFO[prev];
    sel.value = prevInfo && !(prevInfo.directedOnly && !g.directed) ? prev : 'components';
    updateAlgoForm();
  }

  function updateAlgoForm() {
    const info = Algorithms.INFO[$('#algoSelect').value];
    $('#srcField').hidden = !info.src;
    $('#dstField').hidden = !info.dst;
    $('#algoDesc').textContent = info.desc;
    if (!state.run) renderPseudo($('#algoSelect').value, []);
  }

  function refreshSelectors(reset = false) {
    const vs = g.sortedVertices();
    const fill = (sel, fallback) => {
      const prev = reset ? NaN : Number(sel.value);
      sel.innerHTML = vs.map(v => `<option value="${v.id}">${esc(v.label)}</option>`).join('');
      if (vs.some(v => v.id === prev)) sel.value = prev;
      else if (fallback) sel.value = fallback.id;
    };
    fill($('#srcSelect'), vs[0]);
    fill($('#dstSelect'), vs[vs.length - 1]);
  }

  // ============================================================ edição

  function addVertexAt(p) {
    if (g.vertices.length >= MAX_VERTICES) { toast(`Limite de ${MAX_VERTICES} vértices atingido.`, 'error'); return; }
    const v = g.addVertex(p.x, p.y);
    clampPos(v);
    state.selected = v.id;
    structureChanged();
  }

  function removeVertex(id) {
    g.removeVertex(id);
    if (state.selected === id) state.selected = null;
    if (state.pending === id) state.pending = null;
    structureChanged();
  }

  function removeEdge(id) {
    g.removeEdge(id);
    structureChanged();
  }

  function connect(u, v) {
    const res = g.addEdge(u, v, 1);
    if (res.error) { toast(res.error, 'error'); renderCanvas(); return; }
    structureChanged();
    if (g.weighted) editWeight(res.edge);
  }

  function openEditor(x, y, value, onCommit) {
    commitEditor();
    editor.value = value;
    editor.style.left = `${x}px`;
    editor.style.top = `${y}px`;
    editor.hidden = false;
    state.editor = { onCommit };
    requestAnimationFrame(() => { editor.focus(); editor.select(); });
  }

  function commitEditor() {
    if (!state.editor) return;
    const { onCommit } = state.editor;
    state.editor = null;
    editor.hidden = true;
    onCommit(editor.value);
  }

  function cancelEditor() {
    state.editor = null;
    editor.hidden = true;
  }

  function editLabel(v) {
    openEditor(v.x, v.y, v.label, val => {
      if (val.trim() === v.label) return;
      const err = g.renameVertex(v.id, val);
      if (err) toast(err, 'error'); else structureChanged();
    });
  }

  function editWeight(edge) {
    const { mid } = edgeGeometry(edge, false);
    openEditor(mid.x, mid.y, formatNum(edge.weight), val => {
      const w = Number(String(val).trim().replace(',', '.'));
      if (String(val).trim() === '' || !Number.isFinite(w)) { toast('Peso inválido: digite um número.', 'error'); return; }
      if (w === edge.weight) return;
      edge.weight = w;
      structureChanged();
    });
  }

  function setMode(mode) {
    state.mode = mode;
    state.pending = null;
    $$('.tool').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    $('#hint').textContent = HINTS[mode];
    wrap.dataset.mode = mode;
    renderCanvas();
  }

  // ---------- eventos do canvas

  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    commitEditor();
    const p = pointFrom(e);
    state.mouse = p;
    const v = vertexAt(p.x, p.y);
    const edgeEl = v ? null : e.target.closest('[data-edge]');
    const mode = state.mode;

    if (v) {
      if (mode === 'delete') { removeVertex(v.id); return; }
      if (mode === 'edge') {
        if (state.pending != null && state.pending !== v.id) {
          const from = state.pending;
          state.pending = null;
          connect(from, v.id);
        } else {
          state.pending = v.id;
          renderCanvas();
        }
        return;
      }
      state.selected = v.id;
      state.drag = { id: v.id, ox: p.x - v.x, oy: p.y - v.y, moved: false };
      svg.setPointerCapture(e.pointerId);
      renderCanvas();
      return;
    }

    if (edgeEl && mode === 'delete') { removeEdge(Number(edgeEl.dataset.edge)); return; }
    if (mode === 'vertex') { addVertexAt(p); return; }
    if (mode === 'edge') { state.pending = null; renderCanvas(); return; }
    state.selected = null;
    renderCanvas();
  });

  svg.addEventListener('pointermove', e => {
    const p = pointFrom(e);
    state.mouse = p;
    if (state.drag) {
      const v = g.vertex(state.drag.id);
      if (!v) { state.drag = null; return; }
      v.x = p.x - state.drag.ox;
      v.y = p.y - state.drag.oy;
      clampPos(v);
      state.drag.moved = true;
      renderCanvas();
    } else if (state.pending != null) {
      updateRubber();
    }
  });

  svg.addEventListener('pointerup', e => {
    if (state.drag) {
      if (state.drag.moved) save();
      state.drag = null;
      return;
    }
    if (state.mode === 'edge' && state.pending != null) {
      const p = pointFrom(e);
      const v = vertexAt(p.x, p.y);
      if (v && v.id !== state.pending) {
        const from = state.pending;
        state.pending = null;
        connect(from, v.id);
      }
    }
  });

  svg.addEventListener('pointerleave', () => {
    if (state.pending != null) { state.mouse = null; updateRubber(); }
  });

  svg.addEventListener('dblclick', e => {
    const p = pointFrom(e);
    const v = vertexAt(p.x, p.y);
    if (v) {
      if (state.mode === 'move' || state.mode === 'vertex') editLabel(v);
      return;
    }
    const edgeEl = e.target.closest('[data-edge]');
    if (edgeEl) {
      if (state.mode !== 'move') return;
      if (g.weighted) editWeight(g.edge(Number(edgeEl.dataset.edge)));
      else toast('Ative a opção "Ponderado" para definir pesos nas arestas.');
      return;
    }
    if (state.mode === 'move') addVertexAt(p);
  });

  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    const p = pointFrom(e);
    const v = vertexAt(p.x, p.y);
    if (v) { removeVertex(v.id); return; }
    const edgeEl = e.target.closest('[data-edge]');
    if (edgeEl) removeEdge(Number(edgeEl.dataset.edge));
  });

  editor.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commitEditor(); }
    else if (e.key === 'Escape') cancelEditor();
  });
  editor.addEventListener('blur', commitEditor);

  // ---------- teclado

  document.addEventListener('keydown', e => {
    if (e.target.closest?.('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key;
    const modes = { m: 'move', v: 'vertex', a: 'edge', r: 'delete' };
    if (modes[key.toLowerCase()]) { setMode(modes[key.toLowerCase()]); return; }

    if (key === 'Escape') {
      if (state.pending != null) { state.pending = null; renderCanvas(); }
      else if (state.run) stopRun();
      else { state.selected = null; renderCanvas(); }
      return;
    }
    if ((key === 'Delete' || key === 'Backspace') && state.selected != null) {
      e.preventDefault();
      removeVertex(state.selected);
      return;
    }
    if (!state.run) return;
    const actions = {
      ArrowRight: () => { pause(); goTo(state.run.idx + 1); },
      ArrowLeft: () => { pause(); goTo(state.run.idx - 1); },
      Home: () => { pause(); goTo(0); },
      End: () => { pause(); goTo(state.run.steps.length - 1); },
      ' ': togglePlay,
    };
    if (actions[key]) { e.preventDefault(); actions[key](); }
  });

  // ============================================================ layouts / arquivos

  function circleLayout() {
    const { w, h } = canvasSize();
    const vs = g.sortedVertices();
    const r = Math.max(40, Math.min(w, h) / 2 - 50);
    vs.forEach((v, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / vs.length;
      v.x = w / 2 + r * Math.cos(a);
      v.y = h / 2 + r * Math.sin(a);
    });
  }

  /** Enquadra o grafo na área visível. Sem `force`, só age se algo estiver fora. */
  function fitToView(force = false) {
    const { w, h } = canvasSize();
    if (!g.vertices.length || w < 100 || h < 100) return;
    const out = g.vertices.some(v => v.x < R || v.y < R || v.x > w - R || v.y > h - R);
    if (!out && !force) return;
    const m = 50;
    const xs = g.vertices.map(v => v.x), ys = g.vertices.map(v => v.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const bw = Math.max(...xs) - minX, bh = Math.max(...ys) - minY;
    const s = Math.min(bw ? (w - 2 * m) / bw : Infinity, bh ? (h - 2 * m) / bh : Infinity, force ? Infinity : 1);
    const k = Number.isFinite(s) ? s : 1;
    const offX = (w - bw * k) / 2, offY = (h - bh * k) / 2;
    g.vertices.forEach(v => {
      v.x = offX + (v.x - minX) * k;
      v.y = offY + (v.y - minY) * k;
    });
  }

  function loadExample(key) {
    const ex = EXAMPLES[key];
    const { w, h } = canvasSize();
    const m = 60;
    g.load({
      directed: ex.directed,
      weighted: ex.weighted,
      vertices: ex.vertices.map(([label, x, y]) => ({ label, x: m + x * (w - 2 * m), y: m + y * (h - 2 * m) })),
      edges: ex.edges.map(([from, to, weight]) => ({ from, to, weight: weight ?? 1 })),
    });
    afterLoad();
  }

  function randomGraph() {
    const n = 6 + Math.floor(Math.random() * 4);
    const directed = g.directed, weighted = g.weighted;
    g.clear();
    for (let i = 0; i < n; i++) g.addVertex(0, 0);
    circleLayout();
    const ids = g.vertices.map(v => v.id);
    const p = directed ? 0.22 : 0.32;
    for (const u of ids) {
      for (const v of ids) {
        if (u === v || (!directed && u > v)) continue;
        if (Math.random() < p) g.addEdge(u, v, 1 + Math.floor(Math.random() * 9));
      }
    }
    g.directed = directed;
    g.weighted = weighted;
    afterLoad();
  }

  function afterLoad() {
    state.selected = null;
    state.pending = null;
    if (state.run) stopRun();
    syncOptions();
    refreshSelectors(true);
    save();
    renderAll();
  }

  function exportGraph() {
    const blob = new Blob([JSON.stringify(g.toJSON(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'grafo.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importGraph(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        g.load(JSON.parse(reader.result));
        fitToView();
        afterLoad();
        toast(`Grafo "${file.name}" carregado.`);
      } catch (err) {
        toast(err instanceof SyntaxError ? 'O arquivo não é um JSON válido.' : err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  // ============================================================ ligações

  $$('.tool').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $$('.tab').forEach(b => b.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.toggle('active', t === b));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${b.dataset.tab}`));
  }));

  $('#optDirected').addEventListener('change', e => {
    const merged = g.setDirected(e.target.checked);
    if (merged) toast(`${merged} par(es) de arestas opostas foram mesclados em arestas não dirigidas.`);
    updateAlgoOptions();
    structureChanged();
  });
  $('#optWeighted').addEventListener('change', e => {
    g.weighted = e.target.checked;
    structureChanged();
    if (g.weighted && g.edges.length) toast('Dê um duplo clique em uma aresta para alterar o peso.');
  });

  $('#exampleSelect').addEventListener('change', e => {
    if (e.target.value) loadExample(e.target.value);
    e.target.value = '';
  });
  $('#btnRandom').addEventListener('click', randomGraph);
  $('#btnExport').addEventListener('click', exportGraph);
  $('#btnImport').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importGraph(file);
    e.target.value = '';
  });
  $('#btnClear').addEventListener('click', () => {
    if (g.vertices.length && !confirm('Apagar todos os vértices e arestas?')) return;
    g.clear();
    afterLoad();
  });
  $('#btnCircle').addEventListener('click', () => { circleLayout(); save(); renderCanvas(); });
  $('#btnFit').addEventListener('click', () => { fitToView(true); save(); renderCanvas(); });

  $('#algoSelect').addEventListener('change', updateAlgoForm);
  $('#btnRun').addEventListener('click', startRun);
  $('#btnPlay').addEventListener('click', togglePlay);
  $('#btnFirst').addEventListener('click', () => { pause(); goTo(0); });
  $('#btnPrev').addEventListener('click', () => { pause(); goTo(state.run.idx - 1); });
  $('#btnNext').addEventListener('click', () => { pause(); goTo(state.run.idx + 1); });
  $('#btnLast').addEventListener('click', () => { pause(); goTo(state.run.steps.length - 1); });
  $('#btnStop').addEventListener('click', stopRun);
  $('#stepSlider').addEventListener('input', e => { pause(); goTo(Number(e.target.value)); });
  $('#speed').addEventListener('change', () => { if (state.timer) play(); });
  $('#stepLog').addEventListener('click', e => {
    const li = e.target.closest('li[data-i]');
    if (li) { pause(); goTo(Number(li.dataset.i)); }
  });

  new ResizeObserver(() => {
    g.vertices.forEach(clampPos);
    renderCanvas();
  }).observe(wrap);

  // ============================================================ início

  if (!restore()) loadExample('basico');
  else fitToView();
  syncOptions();
  refreshSelectors();
  setMode('move');
  renderAll();
})();
