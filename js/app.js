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
    edge: 'Clique no vértice de origem e depois no de destino (ou arraste de um até o outro). Clicando duas vezes no mesmo vértice, cria um laço. Esc cancela.',
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
    multigrafo: {
      directed: false, weighted: true,
      vertices: [['A', 0, .5], ['B', .35, 0], ['C', .35, 1], ['D', .75, .5], ['E', 1, .1]],
      edges: [['A', 'B', 5], ['A', 'B', 2], ['A', 'C', 9], ['B', 'C', 3], ['B', 'B', 7], ['C', 'D', 4],
        ['D', 'D', 1], ['D', 'E', 6], ['B', 'D', 8]],
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
    animateFocus: false, // animar a aresta examinada no próximo desenho
  };

  const svg = $('#canvas');
  const edgesLayer = $('#edgesLayer');
  const verticesLayer = $('#verticesLayer');
  const rubber = $('#rubber');
  const focusLayer = $('#focusLayer');
  const weightsLayer = $('#weightsLayer'); // acima da aresta em foco, para o peso não ser coberto
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

  /**
   * Tamanho útil da área de desenho. Enquanto ela não tem tamanho (aba em
   * segundo plano, janela minimizada), usa um padrão: sem isso, os vértices
   * seriam posicionados fora da tela.
   */
  function canvasSize() {
    const r = svg.getBoundingClientRect();
    return { w: r.width > 50 ? r.width : 800, h: r.height > 50 ? r.height : 500 };
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

  /**
   * Posição de cada aresta dentro do seu "feixe": arestas paralelas (mesmo par
   * de vértices, em qualquer sentido) são afastadas umas das outras, e os
   * laços de um mesmo vértice são distribuídos em leque.
   */
  let edgeLayout = new Map();

  function rebuildEdgeLayout() {
    const grupos = new Map();
    for (const e of g.edges) {
      const key = e.from === e.to
        ? `L${e.from}`
        : `${Math.min(e.from, e.to)}:${Math.max(e.from, e.to)}`;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(e);
    }
    edgeLayout = new Map();
    for (const lista of grupos.values()) {
      lista.sort((a, b) => a.id - b.id);
      lista.forEach((e, i) => edgeLayout.set(e.id, { idx: i, total: lista.length }));
    }
  }

  const layoutOf = e => {
    if (!edgeLayout.has(e.id)) rebuildEdgeLayout();
    return edgeLayout.get(e.id) || { idx: 0, total: 1 };
  };

  const fmt = n => n.toFixed(1);

  /** Laço: uma alça que sai e volta ao mesmo vértice. */
  function loopGeometry(v, idx, flip) {
    const ang = -Math.PI / 2 + idx * 1.1;          // laços sucessivos abrem em leque
    const dir = { x: Math.cos(ang), y: Math.sin(ang) };
    const perp = { x: -dir.y, y: dir.x };
    const L = R + 46, W = 24;
    const on = a => ({ x: v.x + R * Math.cos(a), y: v.y + R * Math.sin(a) });
    let p0 = on(ang - 0.55), p1 = on(ang + 0.55);
    let c1 = { x: v.x + dir.x * L - perp.x * W, y: v.y + dir.y * L - perp.y * W };
    let c2 = { x: v.x + dir.x * L + perp.x * W, y: v.y + dir.y * L + perp.y * W };
    if (flip) { [p0, p1] = [p1, p0]; [c1, c2] = [c2, c1]; }
    return {
      d: `M${fmt(p0.x)},${fmt(p0.y)} C${fmt(c1.x)},${fmt(c1.y)} ${fmt(c2.x)},${fmt(c2.y)} ${fmt(p1.x)},${fmt(p1.y)}`,
      mid: { x: v.x + dir.x * (L * 0.85), y: v.y + dir.y * (L * 0.85) },
    };
  }

  /**
   * Geometria de uma aresta. `reverse` percorre o mesmo traçado de trás para
   * frente (usado para animar a exploração no sentido em que ela acontece).
   */
  function edgeGeometry(e, transpose = false, reverse = false) {
    const { idx, total } = layoutOf(e);
    const inverte = transpose !== reverse;

    if (e.from === e.to) return loopGeometry(g.vertex(e.from), idx, inverte);

    // A curvatura é calculada sempre na mesma orientação (do menor id para o
    // maior), para que o traçado não mude quando a aresta é percorrida ao
    // contrário; só a ordem dos pontos é invertida.
    const first = Math.min(e.from, e.to), second = Math.max(e.from, e.to);
    const a = g.vertex(first), b = g.vertex(second);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = (idx - (total - 1) / 2) * Math.min(30, Math.max(18, len * 0.22));
    const cx = (a.x + b.x) / 2 - (dy / len) * bend;
    const cy = (a.y + b.y) / 2 + (dx / len) * bend;
    const toward = (p, r) => {
      const ddx = cx - p.x, ddy = cy - p.y, l = Math.hypot(ddx, ddy) || 1;
      return { x: p.x + (ddx / l) * r, y: p.y + (ddy / l) * r };
    };
    let p0 = toward(a, R), p1 = toward(b, R);
    // Ponta da seta no vértice em que a aresta termina, no sentido desenhado.
    const comecaNoPrimeiro = (inverte ? e.to : e.from) === first;
    if (!comecaNoPrimeiro) [p0, p1] = [p1, p0];

    const d = bend
      ? `M${fmt(p0.x)},${fmt(p0.y)} Q${fmt(cx)},${fmt(cy)} ${fmt(p1.x)},${fmt(p1.y)}`
      : `M${fmt(p0.x)},${fmt(p0.y)} L${fmt(p1.x)},${fmt(p1.y)}`;
    const mid = bend
      ? { x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y }
      : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { d, mid };
  }

  // Os elementos SVG são reaproveitados entre renderizações (em vez de
  // recriados), para que as mudanças de cor aconteçam com transição.
  const vertexEls = new Map();
  const edgeEls = new Map();

  function svgEl(tag, cls, parent) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (cls) el.setAttribute('class', cls);
    if (parent) parent.appendChild(el);
    return el;
  }

  function pruneEls(map, alive) {
    for (const [id, el] of map) {
      if (!alive.has(id)) { el.root.remove(); el.weight?.remove(); map.delete(id); }
    }
  }

  function getEdgeEl(e) {
    let el = edgeEls.get(e.id);
    if (!el) {
      const root = svgEl('g', 'edge', edgesLayer);
      root.dataset.edge = e.id;
      el = {
        root,
        hit: svgEl('path', 'edge-hit', root),
        line: svgEl('path', 'edge-line', root),
        weight: svgEl('text', 'edge-weight', weightsLayer),
      };
      edgeEls.set(e.id, el);
    }
    return el;
  }

  function getVertexEl(v) {
    let el = vertexEls.get(v.id);
    if (!el) {
      const root = svgEl('g', 'vertex', verticesLayer);
      root.dataset.id = v.id;
      svgEl('circle', 'halo', root).setAttribute('r', R + 6);
      const body = svgEl('circle', 'body', root);
      body.setAttribute('r', R);
      const label = svgEl('text', 'label', root);
      label.setAttribute('dy', '0.35em');
      const badge = svgEl('g', 'badge', root);
      badge.setAttribute('transform', `translate(${R + 4},${-R + 1})`);
      const badgeBg = svgEl('rect', null, badge);
      badgeBg.setAttribute('height', 18);
      badgeBg.setAttribute('y', -9);
      badgeBg.setAttribute('rx', 9);
      const badgeText = svgEl('text', null, badge);
      badgeText.setAttribute('dy', '0.35em');
      el = { root, body, label, badge, badgeBg, badgeText };
      vertexEls.set(v.id, el);
    }
    return el;
  }

  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };

  function renderCanvas() {
    rebuildEdgeLayout();
    const step = currentStep();
    const transpose = !!step?.transpose;
    const hasPath = !!step?.final && Object.values(step.es).includes('path');

    for (const e of g.edges) {
      const el = getEdgeEl(e);
      const cls = !step ? 'idle' : step.es[e.id] || (hasPath ? 'dim' : 'idle');
      const { d, mid } = edgeGeometry(e, transpose);
      el.root.setAttribute('class', `edge ${cls}`);
      el.weight.setAttribute('class', `edge-weight ${cls}${step?.focusEdge === e.id ? ' active' : ''}`);
      el.hit.setAttribute('d', d);
      el.line.setAttribute('d', d);
      if (g.directed) el.line.setAttribute('marker-end', `url(#arrow-${cls === 'dim' ? 'idle' : cls})`);
      else el.line.removeAttribute('marker-end');
      el.weight.style.display = g.weighted ? '' : 'none';
      el.weight.setAttribute('x', mid.x.toFixed(1));
      el.weight.setAttribute('y', mid.y.toFixed(1));
      setText(el.weight, formatNum(e.weight));
    }
    pruneEls(edgeEls, new Set(g.edges.map(e => e.id)));

    for (const v of g.vertices) {
      const el = getVertexEl(v);
      const cls = ['vertex', `st-${step ? step.vs[v.id] || 'unvisited' : 'idle'}`];
      if (step && step.focusVertex === v.id) cls.push('focus');
      if (state.selected === v.id && !step) cls.push('selected');
      if (state.pending === v.id) cls.push('pending');
      el.root.setAttribute('class', cls.join(' '));
      el.root.setAttribute('transform', `translate(${v.x.toFixed(1)},${v.y.toFixed(1)})`);
      const comp = step?.comp[v.id];
      el.body.style.fill = comp ? COMP_COLORS[(comp - 1) % COMP_COLORS.length] : '';
      setText(el.label, v.label);

      const badge = step?.badges[v.id];
      el.badge.style.display = badge == null ? 'none' : '';
      if (badge != null) {
        setText(el.badgeText, String(badge));
        const w = Math.max(20, String(badge).length * 7 + 12);
        el.badgeBg.setAttribute('width', w);
        el.badgeBg.setAttribute('x', -w / 2);
      }
    }
    pruneEls(vertexEls, new Set(g.vertices.map(v => v.id)));

    renderFocus(step);
    updateRubber();
    $('#emptyState').hidden = g.vertices.length > 0;
    $('#hint').hidden = !!step;
    $('#legend').hidden = !step;
    $('#transposeFlag').hidden = !transpose;
  }

  /**
   * Aresta sendo examinada: desenhada por cima das demais, no sentido da
   * exploração (do vértice atual para o vizinho). Ao avançar um passo, a
   * linha é "traçada" e uma bolinha percorre a aresta.
   */
  function renderFocus(step) {
    const animate = state.animateFocus;
    state.animateFocus = false;
    const e = step?.focusEdge != null ? g.edge(step.focusEdge) : null;
    if (!e) { focusLayer.replaceChildren(); delete focusLayer.dataset.key; return; }

    const start = step.transpose ? e.to : e.from;
    const reverse = step.current != null && start !== step.current;
    const { d } = edgeGeometry(e, step.transpose, reverse);
    const key = `${e.id}:${reverse}`;
    const line = focusLayer.querySelector('.focus-line');

    if (!animate && line && focusLayer.dataset.key === key) {
      line.setAttribute('d', d); // só reposiciona (ex.: arrastando um vértice)
      focusLayer.querySelector('.focus-dot')?.remove();
      return;
    }
    focusLayer.dataset.key = key;
    focusLayer.replaceChildren();
    const path = svgEl('path', `focus-line${animate ? ' animate' : ''}`, focusLayer);
    path.setAttribute('d', d);
    path.setAttribute('pathLength', '1');
    if (g.directed && !reverse) path.setAttribute('marker-end', 'url(#arrow-active)');
    if (!animate) return;

    wrap.style.setProperty('--anim', `${animDuration()}s`);
    const dot = svgEl('circle', 'focus-dot', focusLayer);
    dot.setAttribute('r', 6);
    const motion = svgEl('animateMotion', null, dot);
    motion.setAttribute('dur', `${animDuration()}s`);
    motion.setAttribute('path', d);
    motion.setAttribute('fill', 'freeze');
    motion.setAttribute('begin', 'indefinite');
    motion.setAttribute('calcMode', 'spline');
    motion.setAttribute('keyTimes', '0;1');
    motion.setAttribute('keySplines', '0.3 0 0.2 1');
    motion.beginElement();
  }

  /** Duração das animações (s), proporcional à velocidade escolhida. */
  const animDuration = () => Math.min(0.6, (stepDelay() / 1000) * 0.45);

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
    $('#listNote').textContent = (g.directed
      ? 'Cada vértice aponta para os vértices alcançados por suas arestas de saída. '
      : 'Cada vértice lista todos os seus vizinhos (cada aresta aparece duas vezes). ') +
      (g.isMultigraph() ? 'Arestas paralelas aparecem repetidas e o laço aparece como o próprio vértice. ' : '') +
      'Memória O(V + E).';
    if (!vs.length) { $('#adjList').innerHTML = '<p class="muted">Grafo vazio.</p>'; return; }

    $('#adjList').innerHTML = vs.map(v => {
      const cur = step && step.current === v.id && !step.transpose;
      // Convenção: em grafo não dirigido o laço aparece duas vezes (grau 2).
      const nbs = g.neighbors(v.id).flatMap(n => (!g.directed && n.v === v.id ? [n, n] : [n]));
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
    const multi = g.isMultigraph();
    $('#matrixNote').textContent =
      (g.directed ? 'Linha = origem, coluna = destino. ' : 'Em grafos não dirigidos a matriz é simétrica. ') +
      (g.weighted
        ? 'Cada célula mostra o menor peso entre os dois vértices (· = sem aresta)' + (multi ? ', e entre parênteses quantas arestas existem. ' : '. ')
        : 'Cada célula mostra quantas arestas ligam os dois vértices. ') +
      (multi && !g.directed && !g.weighted ? 'Cada laço conta 2 na diagonal, como manda a convenção. ' : '') +
      'Memória O(V²); consulta de aresta em O(1).';
    if (!vs.length) { $('#adjMatrix').innerHTML = '<p class="muted">Grafo vazio.</p>'; return; }

    const cur = step && !step.transpose ? step.current : null;
    const focus = cur != null ? step.focusVertex : null;
    let html = '<table class="data matrix"><thead><tr><th></th>' +
      vs.map(v => `<th class="${v.id === focus ? 'colcur' : ''}">${esc(v.label)}</th>`).join('') + '</tr></thead><tbody>';
    for (const u of vs) {
      html += `<tr class="${u.id === cur ? 'cur' : ''}"><th>${esc(u.label)}</th>`;
      for (const v of vs) {
        const es = g.edgesBetween(u.id, v.id);
        // Convenção: em grafo não dirigido, um laço conta 2 na diagonal.
        const n = es.length * (u.id === v.id && !g.directed ? 2 : 1);
        const val = !es.length
          ? (g.weighted ? '·' : '0')
          : g.weighted
            ? formatNum(Math.min(...es.map(x => x.weight))) + (es.length > 1 ? ` (${es.length})` : '')
            : String(n);
        const cls = [es.length ? 'one' : 'zero'];
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
      ['Tipo', `${g.directed ? 'Dirigido' : 'Não dirigido'}, ${g.weighted ? 'ponderado' : 'sem pesos'}` +
        (g.isMultigraph() ? ', multigrafo (com laços ou arestas paralelas)' : '')],
      ['Vértices |V|', n],
      ['Arestas |E|', m],
    ];
    if (n > 1 && !g.isMultigraph()) {
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
    $('#playerDs').hidden = !ds;
    if (!ds) return;
    $('#dsTitle').textContent = ds.title;
    box.className = `ds ${ds.kind}`;
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

  function buildLegend(name) {
    $('#legend').innerHTML = Algorithms.INFO[name].legend.map(([key, text]) => {
      const kind = key.startsWith('e-') ? 'bar' : key.startsWith('ring-') ? 'ring' : 'dot';
      return `<span><i class="${kind} ${key}"></i>${esc(text)}</span>`;
    }).join('');
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
    buildLegend(name);
    renderStep();
    play();
    // Foco no player: o Espaço passa a pausar/continuar em vez de reexecutar.
    $('#btnPlay').focus({ preventScroll: true });
  }

  function stopRun() {
    pause();
    state.run = null;
    buildLog();
    renderStep();
  }

  function goTo(i) {
    if (!state.run) return;
    const next = Math.max(0, Math.min(i, state.run.steps.length - 1));
    state.animateFocus = next === state.run.idx + 1;
    state.run.idx = next;
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

  // ============================================================ histórico

  const history = { undo: [], redo: [], limit: 100 };
  const snapshot = () => JSON.stringify(g.toJSON());

  function pushHistory(before) {
    history.undo.push(before);
    if (history.undo.length > history.limit) history.undo.shift();
    history.redo = [];
    updateHistoryButtons();
  }

  /** Executa uma alteração no grafo e registra o estado anterior para o "desfazer". */
  function edit(fn) {
    const before = snapshot();
    fn();
    if (snapshot() !== before) pushHistory(before);
  }

  function travel(from, to, message) {
    if (!from.length) return;
    cancelEditor(true);
    to.push(snapshot());
    g.load(JSON.parse(from.pop()));
    state.pending = null;
    state.drag = null;
    if (!g.vertex(state.selected)) state.selected = null;
    syncOptions();
    structureChanged();
    updateHistoryButtons();
    toast(message);
  }

  const undo = () => travel(history.undo, history.redo, 'Alteração desfeita.');
  const redo = () => travel(history.redo, history.undo, 'Alteração refeita.');

  function updateHistoryButtons() {
    $('#btnUndo').disabled = !history.undo.length;
    $('#btnRedo').disabled = !history.redo.length;
  }

  // ============================================================ edição

  function addVertexAt(p) {
    if (g.vertices.length >= MAX_VERTICES) { toast(`Limite de ${MAX_VERTICES} vértices atingido.`, 'error'); return; }
    edit(() => {
      const v = g.addVertex(p.x, p.y);
      clampPos(v);
      state.selected = v.id;
      structureChanged();
    });
  }

  function removeVertex(id) {
    edit(() => {
      g.removeVertex(id);
      if (state.selected === id) state.selected = null;
      if (state.pending === id) state.pending = null;
      structureChanged();
    });
  }

  function removeEdge(id) {
    edit(() => {
      g.removeEdge(id);
      structureChanged();
    });
  }

  function connect(u, v) {
    const before = snapshot();
    const res = g.addEdge(u, v, 1);
    if (res.error) { toast(res.error, 'error'); renderCanvas(); return; }
    structureChanged();
    // Em grafo ponderado, a aresta e o peso viram um único passo de desfazer.
    if (g.weighted) editWeight(res.edge, before);
    else pushHistory(before);
  }

  function openEditor(x, y, value, onCommit, onCancel = null) {
    commitEditor();
    editor.value = value;
    editor.style.left = `${x}px`;
    editor.style.top = `${y}px`;
    editor.hidden = false;
    state.editor = { onCommit, onCancel };
    requestAnimationFrame(() => { editor.focus(); editor.select(); });
  }

  function commitEditor() {
    if (!state.editor) return;
    const { onCommit } = state.editor;
    state.editor = null;
    editor.hidden = true;
    onCommit(editor.value);
  }

  /** `silent` descarta a edição sem avisar quem abriu o editor (usado pelo desfazer). */
  function cancelEditor(silent = false) {
    const open = state.editor;
    state.editor = null;
    editor.hidden = true;
    if (!silent) open?.onCancel?.();
  }

  function editLabel(v) {
    openEditor(v.x, v.y, v.label, val => {
      if (val.trim() === v.label) return;
      let err;
      edit(() => { err = g.renameVertex(v.id, val); });
      if (err) toast(err, 'error'); else structureChanged();
    });
  }

  /**
   * `historyBefore` permite juntar a criação da aresta e a digitação do peso
   * em um único passo de desfazer.
   */
  function editWeight(edge, historyBefore = null) {
    const before = historyBefore ?? snapshot();
    const registrar = () => { if (snapshot() !== before) pushHistory(before); };
    const { mid } = edgeGeometry(edge, false);
    openEditor(mid.x, mid.y, formatNum(edge.weight), val => {
      const w = Number(String(val).trim().replace(',', '.'));
      if (String(val).trim() === '' || !Number.isFinite(w)) {
        toast('Peso inválido: digite um número.', 'error');
      } else if (w !== edge.weight) {
        edge.weight = w;
        structureChanged();
      }
      registrar();
    }, registrar);
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
        if (state.pending != null) {
          const from = state.pending;        // mesmo vértice duas vezes = laço
          state.pending = null;
          connect(from, v.id);
        } else {
          state.pending = v.id;
          renderCanvas();
        }
        return;
      }
      state.selected = v.id;
      state.drag = { id: v.id, ox: p.x - v.x, oy: p.y - v.y, moved: false, before: snapshot() };
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
      if (state.drag.moved) {
        if (snapshot() !== state.drag.before) pushHistory(state.drag.before);
        save();
      }
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
    const typing = !!e.target.closest?.('input, select, textarea');
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
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
    // Espaço/setas pertencem ao elemento focado quando ele é um botão ou link.
    if (e.target.closest?.('button, a[href], [role="button"]')) return;
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
    const directed = g.directed;
    g.clear(); // clear() preserva as opções "dirigido" e "ponderado"
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
        const data = JSON.parse(reader.result);
        if (Array.isArray(data.vertices) && data.vertices.length > MAX_VERTICES) {
          toast(`O arquivo tem ${data.vertices.length} vértices; o limite é ${MAX_VERTICES}.`, 'error');
          return;
        }
        let ajustes;
        edit(() => {
          ajustes = g.load(data);
          fitToView();
          afterLoad();
        });
        const avisos = [
          ajustes.renomeados && `${ajustes.renomeados} rótulo(s) repetido(s) renomeado(s)`,
          ajustes.semVertice && `${ajustes.semVertice} aresta(s) com vértice inexistente descartada(s)`,
        ].filter(Boolean);
        toast(`Grafo "${file.name}" carregado.` + (avisos.length ? ` Ajustes: ${avisos.join('; ')}.` : ''));
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
    edit(() => { g.setDirected(e.target.checked); });
    updateAlgoOptions();
    structureChanged();
  });
  $('#optWeighted').addEventListener('change', e => {
    edit(() => { g.weighted = e.target.checked; });
    structureChanged();
    if (g.weighted && g.edges.length) toast('Dê um duplo clique em uma aresta para alterar o peso.');
  });

  $('#exampleSelect').addEventListener('change', e => {
    if (e.target.value) edit(() => loadExample(e.target.value));
    e.target.value = '';
  });
  $('#btnRandom').addEventListener('click', () => edit(randomGraph));
  $('#btnExport').addEventListener('click', exportGraph);
  $('#btnImport').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importGraph(file);
    e.target.value = '';
  });
  $('#btnClear').addEventListener('click', () => {
    if (g.vertices.length && !confirm('Apagar todos os vértices e arestas?')) return;
    const hadVertices = g.vertices.length > 0;
    edit(() => { g.clear(); afterLoad(); });
    if (hadVertices) toast('Grafo apagado. Use Ctrl+Z para desfazer.');
  });
  $('#btnCircle').addEventListener('click', () => edit(() => { circleLayout(); save(); renderCanvas(); }));
  $('#btnFit').addEventListener('click', () => edit(() => { fitToView(true); save(); renderCanvas(); }));
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);

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

  // Quando a área muda de tamanho, as posições acompanham proporcionalmente.
  // (Antes elas eram grudadas na borda, o que achatava o grafo de vez.)
  let lastSize = canvasSize();
  let resizeSaveTimer = null;
  new ResizeObserver(() => {
    const r = svg.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return; // área ainda sem tamanho utilizável
    const w = r.width, h = r.height;
    const mudou = Math.abs(w - lastSize.w) > 0.5 || Math.abs(h - lastSize.h) > 0.5;
    if (mudou && g.vertices.length) {
      const sx = w / lastSize.w, sy = h / lastSize.h;
      g.vertices.forEach(v => { v.x *= sx; v.y *= sy; clampPos(v); });
      clearTimeout(resizeSaveTimer);
      resizeSaveTimer = setTimeout(save, 400);
    }
    lastSize = { w, h };
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
