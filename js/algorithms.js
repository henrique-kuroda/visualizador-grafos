'use strict';

/* =========================================================================
 * Algoritmos sobre grafos.
 *
 * Cada algoritmo roda de uma vez e grava uma lista de "passos" (snapshots).
 * A interface só reproduz esses passos, o que permite avançar, voltar e
 * pular para qualquer ponto da execução.
 *
 * Um passo contém:
 *   msg          explicação em texto
 *   line         linha(s) do pseudocódigo em destaque
 *   vs / es      estado de cada vértice / aresta
 *   comp         componente de cada vértice (para colorir)
 *   current      vértice sendo processado
 *   focusEdge    aresta sendo examinada neste passo
 *   focusVertex  vizinho sendo examinado neste passo
 *   ds           estrutura auxiliar (fila, pilha, fila de prioridade)
 *   table        tabela de dados (dist, pai, tempos...)
 *   badges       texto pequeno exibido abaixo de cada vértice
 *   transpose    desenhar as arestas invertidas (Kosaraju, fase 2)
 * ========================================================================= */

const Algorithms = (() => {

  const INFO = {
    bfs: {
      name: 'Busca em largura (BFS)',
      src: true,
      desc: 'Explora o grafo em camadas: primeiro todos os vizinhos da origem, depois os vizinhos dos vizinhos, e assim por diante. Usa uma fila (FIFO). Complexidade O(V + E).',
      pseudo: [
        'BFS(G, s):',
        '  visitado[s] ← verdadeiro; dist[s] ← 0; Q ← [s]',
        '  enquanto Q não estiver vazia:',
        '    u ← Q.desenfileirar()',
        '    para cada vizinho v de u:',
        '      se não visitado[v]:',
        '        visitado[v] ← verdadeiro; pai[v] ← u; dist[v] ← dist[u] + 1',
        '        Q.enfileirar(v)',
      ],
    },
    dfs: {
      name: 'Busca em profundidade (DFS)',
      src: true,
      desc: 'Segue um caminho o mais fundo possível antes de voltar (backtracking). Usa recursão, ou seja, uma pilha. Registra os tempos de descoberta (d) e de finalização (f) e detecta ciclos pelas arestas de retorno. Complexidade O(V + E).',
      pseudo: [
        'DFS(G, s):',
        '  tempo ← 1; visitar(s)',
        'visitar(u):',
        '  visitado[u] ← verdadeiro; d[u] ← tempo++',
        '  para cada vizinho v de u:',
        '    se não visitado[v]:',
        '      pai[v] ← u; visitar(v)',
        '  f[u] ← tempo++        ▹ u finalizado',
      ],
    },
    'path-bfs': {
      name: 'Menor caminho em nº de arestas (BFS)',
      src: true,
      dst: true,
      desc: 'Sem considerar pesos, a BFS encontra o caminho com o menor número de arestas: como ela avança em camadas, o destino é descoberto pela primeira vez já na menor distância. Complexidade O(V + E).',
      pseudo: [
        'CaminhoBFS(G, s, t):',
        '  visitado[s] ← verdadeiro; dist[s] ← 0; Q ← [s]',
        '  enquanto Q não estiver vazia:',
        '    u ← Q.desenfileirar()',
        '    para cada vizinho v de u:',
        '      se não visitado[v]:',
        '        visitado[v] ← verdadeiro; pai[v] ← u; dist[v] ← dist[u] + 1',
        '        Q.enfileirar(v)',
        '        se v = t: reconstruir caminho t → s por pai[]; parar',
        '  t não é alcançável a partir de s',
      ],
    },
    dijkstra: {
      name: 'Menor caminho com pesos (Dijkstra)',
      src: true,
      dst: true,
      desc: 'Menor caminho considerando os pesos das arestas (que não podem ser negativos). A cada passo, fixa o vértice com a menor distância provisória e "relaxa" as arestas que saem dele. Complexidade O(V²) nesta implementação.',
      pseudo: [
        'Dijkstra(G, s, t):',
        '  dist[v] ← ∞ para todo v; dist[s] ← 0; Q ← V',
        '  enquanto Q não estiver vazia:',
        '    u ← remover de Q o vértice com menor dist',
        '    se u = t ou dist[u] = ∞: parar',
        '    para cada vizinho v de u (aresta de peso w):',
        '      se dist[u] + w < dist[v]:',
        '        dist[v] ← dist[u] + w; pai[v] ← u',
        '  caminho ← seguir pai[] de t até s',
      ],
    },
    components: {
      name: 'Componentes conexas',
      desc: 'Rotula cada vértice com a sua componente, repetindo uma BFS a partir de cada vértice ainda sem rótulo. O grafo é conexo se existir uma única componente. Em grafos dirigidos, calcula a conectividade fraca (ignora as direções). Complexidade O(V + E).',
      pseudo: [
        'Componentes(G):',
        '  c ← 0',
        '  para cada vértice s de G:',
        '    se s ainda não tem componente:',
        '      c ← c + 1; comp[s] ← c; Q ← [s]',
        '      enquanto Q não vazia: u ← Q.desenfileirar()',
        '        para cada vizinho v de u sem componente: comp[v] ← c; Q.enfileirar(v)',
        '  G é conexo ⇔ c = 1',
      ],
    },
    scc: {
      name: 'Componentes fortemente conexas (Kosaraju)',
      directedOnly: true,
      desc: 'Em um grafo dirigido, dois vértices estão na mesma componente fortemente conexa se cada um alcança o outro. Kosaraju faz uma DFS para obter a ordem de término e depois outra DFS no grafo transposto, na ordem inversa: cada árvore é uma componente. Complexidade O(V + E).',
      pseudo: [
        'Kosaraju(G):',
        '  para cada u não visitado: DFS(G, u), empilhando u ao terminar',
        '  Gᵀ ← G com todas as arestas invertidas',
        '  c ← 0',
        '  enquanto a pilha não estiver vazia:',
        '    u ← pilha.desempilhar(); se u já tem componente: continuar',
        '    c ← c + 1; DFS(Gᵀ, u) marcando os alcançados com c',
        '  cada c é uma componente fortemente conexa',
      ],
    },
  };

  // -----------------------------------------------------------------------

  class Recorder {
    constructor(g) {
      this.g = g;
      this.steps = [];
      this.vs = {};
      this.es = {};
      this.comp = {};
      this.current = null;
      this.transpose = false;
      this.ds = null;              // { title, kind, items: () => string[] }
      this.table = () => null;     // () => { cols, rows: [{ id, cells }] }
      this.badge = () => null;     // id => string | null
    }

    snap(msg, line, opts = {}) {
      const badges = {};
      for (const v of this.g.vertices) {
        const b = this.badge(v.id);
        if (b != null) badges[v.id] = b;
      }
      this.steps.push({
        msg,
        line,
        current: this.current,
        vs: { ...this.vs },
        es: { ...this.es },
        comp: { ...this.comp },
        ds: this.ds ? { title: this.ds.title, kind: this.ds.kind, items: this.ds.items() } : null,
        table: this.table(),
        badges,
        focusEdge: opts.edge ?? null,
        focusVertex: opts.vertex ?? null,
        transpose: this.transpose,
        final: !!opts.final,
      });
    }
  }

  const tracePath = (parent, t) => {
    const path = [];
    for (let v = t; v != null; v = parent[v]) path.unshift(v);
    return path;
  };

  const markPath = (R, path) => {
    path.forEach(v => { R.vs[v] = 'path'; });
    for (let i = 0; i + 1 < path.length; i++) {
      const e = R.g.findEdge(path[i], path[i + 1]);
      if (e) R.es[e.id] = 'path';
    }
    R.current = null;
  };

  const groupsText = (g, groups) =>
    groups.map(grp => `{${grp.map(id => g.label(id)).sort(compareLabels).join(', ')}}`).join(', ');

  // ---------------------------------------------------------------- BFS --

  function bfs(g, s, t = null) {
    const R = new Recorder(g);
    const L = id => g.label(id);
    const isPath = t !== null;
    const dist = {}, parent = {}, order = [], Q = [];

    R.ds = { title: 'Fila Q', kind: 'queue', items: () => Q.map(L) };
    R.table = () => ({
      cols: ['Vértice', 'dist', 'pai'],
      rows: g.sortedVertices().map(v => ({
        id: v.id,
        cells: [v.label, v.id in dist ? formatNum(dist[v.id]) : '∞', parent[v.id] != null ? L(parent[v.id]) : '—'],
      })),
    });
    R.badge = id => (id in dist ? `d=${dist[id]}` : null);

    R.snap(isPath
      ? `Objetivo: caminho com o menor número de arestas de ${L(s)} até ${L(t)}.`
      : `Início da BFS a partir de ${L(s)}. Nenhum vértice foi visitado ainda.`, 0);

    dist[s] = 0; parent[s] = null; Q.push(s); R.vs[s] = 'frontier';
    R.snap(`Marca ${L(s)} como visitado (dist = 0) e o coloca na fila.`, 1);

    let found = s === t;
    while (Q.length && !found) {
      const u = Q.shift();
      order.push(u);
      R.current = u; R.vs[u] = 'current';
      R.snap(`Retira ${L(u)} do início da fila e examina seus vizinhos.`, [2, 3]);

      const nbs = g.neighbors(u);
      if (!nbs.length) R.snap(`${L(u)} não tem vizinhos${g.directed ? ' (nenhuma aresta de saída)' : ''}.`, 4);

      for (const { v, edge } of nbs) {
        if (v in dist) {
          R.snap(`${L(v)} já foi visitado: nada a fazer.`, [4, 5], { edge: edge.id, vertex: v });
          continue;
        }
        dist[v] = dist[u] + 1; parent[v] = u; Q.push(v);
        R.vs[v] = 'frontier'; R.es[edge.id] = 'tree';
        R.snap(`${L(v)} ainda não foi visitado: marca, pai[${L(v)}] = ${L(u)}, dist[${L(v)}] = ${dist[v]} e entra no fim da fila.`,
          [6, 7], { edge: edge.id, vertex: v });
        if (v === t) { found = true; break; }
      }
      R.vs[u] = 'visited'; R.current = null;
    }

    if (isPath) {
      if (found) {
        const path = tracePath(parent, t);
        markPath(R, path);
        R.snap(`${L(t)} foi alcançado! Seguindo pai[] de volta até ${L(s)}: ${path.map(L).join(' → ')} ` +
          `(${path.length - 1} aresta${path.length - 1 === 1 ? '' : 's'}).`, 8, { final: true });
      } else {
        R.snap(`A fila esvaziou sem alcançar ${L(t)}: não existe caminho de ${L(s)} até ${L(t)}.`, 9, { final: true });
      }
    } else {
      const missing = g.sortedVertices().filter(v => !(v.id in dist)).map(v => v.label);
      R.snap(`Fila vazia: fim da BFS. Ordem de visita: ${order.map(L).join(', ')}. ` +
        (missing.length ? `Não alcançados a partir de ${L(s)}: ${missing.join(', ')}.` : 'Todos os vértices foram alcançados.'),
        2, { final: true });
    }
    return R.steps;
  }

  // ---------------------------------------------------------------- DFS --

  function dfs(g, s) {
    const R = new Recorder(g);
    const L = id => g.label(id);
    const d = {}, f = {}, parent = { [s]: null }, stack = [], order = [];
    let time = 1, backEdges = 0;

    R.ds = { title: 'Pilha de recursão', kind: 'stack', items: () => stack.map(L).reverse() };
    R.table = () => ({
      cols: ['Vértice', 'd', 'f', 'pai'],
      rows: g.sortedVertices().map(v => ({
        id: v.id,
        cells: [v.label, d[v.id] ?? '—', f[v.id] ?? '—', parent[v.id] != null ? L(parent[v.id]) : '—'],
      })),
    });
    R.badge = id => (id in d ? `${d[id]}/${f[id] ?? '·'}` : null);

    R.snap(`Início da DFS a partir de ${L(s)}. Abaixo de cada vértice aparece d/f (descoberta/finalização).`, [0, 1]);

    const visit = u => {
      stack.push(u); d[u] = time++; order.push(u);
      if (R.current != null) R.vs[R.current] = 'open';
      R.current = u; R.vs[u] = 'current';
      R.snap(`visitar(${L(u)}): marca ${L(u)} como visitado, com tempo de descoberta d = ${d[u]}.`, [2, 3]);

      for (const { v, edge } of g.neighbors(u)) {
        if (!(v in d)) {
          parent[v] = u; R.es[edge.id] = 'tree';
          R.snap(`${L(v)} não foi visitado: pai[${L(v)}] = ${L(u)} e chama visitar(${L(v)}) — desce um nível.`,
            [4, 5, 6], { edge: edge.id, vertex: v });
          visit(v);
          R.current = u; R.vs[u] = 'current';
          R.snap(`Retorno da recursão: volta para ${L(u)} e continua pelos vizinhos restantes.`, 4);
        } else {
          const back = !(v in f) && (g.directed || v !== parent[u]);
          if (back) { backEdges++; R.es[edge.id] = 'back'; }
          R.snap(`${L(v)} já foi visitado: ignora.` +
            (back ? ` ${L(u)}–${L(v)} é uma aresta de retorno (volta a um ancestral): o grafo tem ciclo!` : ''),
            [4, 5], { edge: edge.id, vertex: v });
        }
      }

      f[u] = time++; stack.pop();
      R.vs[u] = 'visited'; R.current = null;
      R.snap(`Todos os vizinhos de ${L(u)} foram explorados: ${L(u)} é finalizado (f = ${f[u]}) e sai da pilha.`, 7);
    };
    visit(s);

    const missing = g.sortedVertices().filter(v => !(v.id in d)).map(v => v.label);
    R.snap(`Fim da DFS. Ordem de descoberta: ${order.map(L).join(', ')}. ` +
      (missing.length ? `Não alcançados a partir de ${L(s)}: ${missing.join(', ')}. ` : '') +
      (backEdges ? `Foram encontradas ${backEdges} aresta(s) de retorno: há ciclo alcançável a partir de ${L(s)}.`
                 : `Nenhuma aresta de retorno: não há ciclo alcançável a partir de ${L(s)}.`),
      1, { final: true });
    return R.steps;
  }

  // ----------------------------------------------------------- Dijkstra --

  function dijkstra(g, s, t) {
    const R = new Recorder(g);
    const L = id => g.label(id);
    const dist = {}, parent = {}, treeEdge = {}, done = new Set();
    g.vertices.forEach(v => { dist[v.id] = Infinity; });
    dist[s] = 0; parent[s] = null;

    R.ds = {
      title: 'Fila de prioridade (menor dist primeiro)',
      kind: 'pq',
      items: () => g.vertices
        .filter(v => !done.has(v.id) && dist[v.id] < Infinity)
        .sort((a, b) => dist[a.id] - dist[b.id] || compareLabels(a.label, b.label))
        .map(v => `${v.label}: ${formatNum(dist[v.id])}`),
    };
    R.table = () => ({
      cols: ['Vértice', 'dist', 'pai', 'fixo'],
      rows: g.sortedVertices().map(v => ({
        id: v.id,
        cells: [v.label, formatNum(dist[v.id]), parent[v.id] != null ? L(parent[v.id]) : '—', done.has(v.id) ? '✓' : ''],
      })),
    });
    R.badge = id => formatNum(dist[id]);

    R.vs[s] = 'frontier';
    R.snap(`Todas as distâncias começam em ∞, exceto dist[${L(s)}] = 0.`, [0, 1]);

    while (true) {
      let u = null;
      for (const v of g.sortedVertices()) {
        if (!done.has(v.id) && (u === null || dist[v.id] < dist[u])) u = v.id;
      }
      if (u === null) break;
      if (dist[u] === Infinity) {
        R.snap('Os vértices restantes têm distância ∞: são inalcançáveis a partir da origem.', [3, 4]);
        break;
      }
      done.add(u);
      R.current = u; R.vs[u] = 'current';
      R.snap(`Remove ${L(u)}, o vértice com menor distância (${formatNum(dist[u])}). Essa distância agora é definitiva.`, [2, 3]);
      if (u === t) {
        R.snap(`${L(u)} é o destino: podemos parar.`, 4);
        R.vs[u] = 'visited';
        break;
      }

      for (const { v, edge, weight: w } of g.neighbors(u)) {
        if (done.has(v)) {
          R.snap(`${L(v)} já tem distância definitiva: ignora.`, 5, { edge: edge.id, vertex: v });
          continue;
        }
        const nd = dist[u] + w;
        if (nd < dist[v]) {
          const old = dist[v];
          dist[v] = nd; parent[v] = u;
          if (treeEdge[v] != null) delete R.es[treeEdge[v]];
          treeEdge[v] = edge.id; R.es[edge.id] = 'tree';
          R.vs[v] = 'frontier';
          R.snap(`Relaxa ${L(u)}→${L(v)}: ${formatNum(dist[u])} + ${formatNum(w)} = ${formatNum(nd)} < ${formatNum(old)}. ` +
            `Atualiza dist[${L(v)}] = ${formatNum(nd)} e pai[${L(v)}] = ${L(u)}.`, [5, 6, 7], { edge: edge.id, vertex: v });
        } else {
          R.snap(`${L(u)}→${L(v)}: ${formatNum(dist[u])} + ${formatNum(w)} = ${formatNum(nd)} ≥ ${formatNum(dist[v])}. Não melhora: nada muda.`,
            [5, 6], { edge: edge.id, vertex: v });
        }
      }
      R.vs[u] = 'visited'; R.current = null;
    }

    if (dist[t] < Infinity) {
      const path = tracePath(parent, t);
      markPath(R, path);
      R.snap(`Menor caminho de ${L(s)} até ${L(t)}: ${path.map(L).join(' → ')}, custo total ${formatNum(dist[t])}.`, 8, { final: true });
    } else {
      R.snap(`Não existe caminho de ${L(s)} até ${L(t)}.`, 8, { final: true });
    }
    return R.steps;
  }

  // --------------------------------------------------------- Componentes --

  function components(g) {
    const R = new Recorder(g);
    const L = id => g.label(id);
    const weak = g.directed;
    const comp = {}, Q = [];
    let c = 0;

    R.ds = { title: 'Fila Q', kind: 'queue', items: () => Q.map(L) };
    R.table = () => ({
      cols: ['Vértice', 'componente'],
      rows: g.sortedVertices().map(v => ({ id: v.id, cells: [v.label, comp[v.id] ? `C${comp[v.id]}` : '—'] })),
    });
    R.badge = id => (comp[id] ? `C${comp[id]}` : null);

    R.snap(weak
      ? 'Grafo dirigido: para a conectividade fraca, as direções das arestas são ignoradas.'
      : 'Para cada vértice ainda sem componente, uma BFS rotula tudo o que ele alcança.', [0, 1]);

    for (const sv of g.sortedVertices()) {
      const s = sv.id;
      if (comp[s]) continue;
      c++; comp[s] = c; R.comp[s] = c; Q.push(s); R.vs[s] = 'frontier';
      R.snap(`${L(s)} ainda não tem componente: inicia a componente C${c} a partir dele.`, [2, 3, 4]);

      while (Q.length) {
        const u = Q.shift();
        R.current = u; R.vs[u] = 'current';
        R.snap(`Retira ${L(u)} da fila e examina seus vizinhos.`, 5);
        for (const { v, edge } of g.neighbors(u, { ignoreDirection: weak })) {
          if (comp[v]) {
            R.snap(`${L(v)} já está na componente C${comp[v]}.`, 6, { edge: edge.id, vertex: v });
            continue;
          }
          comp[v] = c; R.comp[v] = c; Q.push(v);
          R.vs[v] = 'frontier'; R.es[edge.id] = 'tree';
          R.snap(`${L(v)} recebe o rótulo C${c} e entra na fila.`, 6, { edge: edge.id, vertex: v });
        }
        R.vs[u] = 'visited'; R.current = null;
      }
    }

    const groups = [];
    g.vertices.forEach(v => { (groups[comp[v.id] - 1] ||= []).push(v.id); });
    const kind = weak ? 'fracamente conexo' : 'conexo';
    R.snap(c === 1
      ? `Há uma única componente: o grafo é ${kind}.`
      : `${c} componentes: ${groupsText(g, groups)}. O grafo NÃO é ${kind}.`, 7, { final: true });
    return R.steps;
  }

  // ------------------------------------------------------------ Kosaraju --

  function scc(g) {
    const R = new Recorder(g);
    const L = id => g.label(id);
    const visited = {}, fin = {}, comp = {}, finish = [];
    let order = 1, c = 0;

    R.ds = { title: 'Pilha de término', kind: 'stack', items: () => finish.map(L).reverse() };
    R.table = () => ({
      cols: ['Vértice', 'término', 'componente'],
      rows: g.sortedVertices().map(v => ({
        id: v.id,
        cells: [v.label, fin[v.id] ?? '—', comp[v.id] ? `C${comp[v.id]}` : '—'],
      })),
    });
    R.badge = id => (comp[id] ? `C${comp[id]}` : fin[id] ? `t=${fin[id]}` : null);

    R.snap('Fase 1: DFS no grafo original. Cada vértice é empilhado quando termina.', 0);

    const dfs1 = u => {
      visited[u] = true;
      if (R.current != null) R.vs[R.current] = 'open';
      R.current = u; R.vs[u] = 'current';
      R.snap(`DFS visita ${L(u)}.`, 1);
      for (const { v, edge } of g.neighbors(u)) {
        if (visited[v]) continue;
        R.es[edge.id] = 'tree';
        R.snap(`Segue a aresta ${L(u)} → ${L(v)}.`, 1, { edge: edge.id, vertex: v });
        dfs1(v);
        R.current = u; R.vs[u] = 'current';
      }
      fin[u] = order++; finish.push(u);
      R.vs[u] = 'visited'; R.current = null;
      R.snap(`${L(u)} terminou (ordem ${fin[u]}): vai para o topo da pilha.`, 1);
    };
    for (const v of g.sortedVertices()) if (!visited[v.id]) dfs1(v.id);

    R.vs = {}; R.es = {}; R.current = null; R.transpose = true;
    R.snap('Fase 2: todas as arestas são invertidas (grafo transposto Gᵀ). Os vértices saem da pilha do maior para o menor término.', 2);

    const dfs2 = u => {
      comp[u] = c; R.comp[u] = c;
      if (R.current != null) R.vs[R.current] = 'open';
      R.current = u; R.vs[u] = 'current';
      R.snap(`${L(u)} entra na componente C${c}.`, 6);
      for (const { v, edge } of g.neighbors(u, { transpose: true })) {
        if (comp[v]) continue;
        R.es[edge.id] = 'tree';
        R.snap(`Em Gᵀ, segue ${L(u)} → ${L(v)} (em G a aresta é ${L(v)} → ${L(u)}).`, 6, { edge: edge.id, vertex: v });
        dfs2(v);
        R.current = u; R.vs[u] = 'current';
      }
      R.vs[u] = 'visited'; R.current = null;
    };
    while (finish.length) {
      const u = finish.pop();
      if (comp[u]) {
        R.snap(`Desempilha ${L(u)}: já pertence à componente C${comp[u]}.`, [4, 5]);
        continue;
      }
      c++;
      R.snap(`Desempilha ${L(u)}: ainda sem componente → nova componente C${c}.`, [4, 5, 6]);
      dfs2(u);
    }

    R.transpose = false;
    const groups = [];
    g.vertices.forEach(v => { (groups[comp[v.id] - 1] ||= []).push(v.id); });
    R.snap(`${c} componente(s) fortemente conexa(s): ${groupsText(g, groups)}. ` +
      (c === 1 ? 'O grafo é fortemente conexo.' : 'O grafo NÃO é fortemente conexo.'), 7, { final: true });
    return R.steps;
  }

  // ------------------------------------------- versões rápidas (sem passos) --

  function weakComponents(g) {
    const seen = new Set(), groups = [];
    for (const sv of g.sortedVertices()) {
      if (seen.has(sv.id)) continue;
      const grp = [], Q = [sv.id];
      seen.add(sv.id);
      while (Q.length) {
        const u = Q.shift();
        grp.push(u);
        for (const { v } of g.neighbors(u, { ignoreDirection: true })) {
          if (!seen.has(v)) { seen.add(v); Q.push(v); }
        }
      }
      groups.push(grp);
    }
    return groups;
  }

  function strongComponents(g) {
    const seen = new Set(), order = [];
    const d1 = u => {
      seen.add(u);
      for (const { v } of g.neighbors(u)) if (!seen.has(v)) d1(v);
      order.push(u);
    };
    g.sortedVertices().forEach(v => { if (!seen.has(v.id)) d1(v.id); });
    const assigned = new Set(), groups = [];
    const d2 = (u, grp) => {
      assigned.add(u); grp.push(u);
      for (const { v } of g.neighbors(u, { transpose: true })) if (!assigned.has(v)) d2(v, grp);
    };
    while (order.length) {
      const u = order.pop();
      if (!assigned.has(u)) { const grp = []; d2(u, grp); groups.push(grp); }
    }
    return groups;
  }

  function hasCycle(g) {
    const state = {};
    const visit = (u, parent) => {
      state[u] = 1;
      for (const { v } of g.neighbors(u)) {
        if (state[v] === 1 && (g.directed || v !== parent)) return true;
        if (!state[v] && visit(v, u)) return true;
      }
      state[u] = 2;
      return false;
    };
    return g.vertices.some(v => !state[v.id] && visit(v.id, null));
  }

  // -----------------------------------------------------------------------

  const IMPL = {
    bfs: (g, s) => bfs(g, s),
    dfs: (g, s) => dfs(g, s),
    'path-bfs': (g, s, t) => bfs(g, s, t),
    dijkstra,
    components,
    scc,
  };

  function run(name, g, s, t) {
    const info = INFO[name];
    if (!info) return { error: 'Algoritmo desconhecido.' };
    if (!g.vertices.length) return { error: 'O grafo está vazio: crie pelo menos um vértice.' };
    if (info.src && !g.vertex(s)) return { error: 'Escolha o vértice de origem.' };
    if (info.dst && !g.vertex(t)) return { error: 'Escolha o vértice de destino.' };
    if (info.directedOnly && !g.directed) {
      return { error: 'Componentes fortemente conexas são definidas para grafos dirigidos. Marque a opção "Dirigido".' };
    }
    if (name === 'dijkstra' && g.weighted && g.edges.some(e => e.weight < 0)) {
      return { error: 'Dijkstra não funciona com pesos negativos.' };
    }
    return { steps: IMPL[name](g, s, t) };
  }

  return { INFO, run, weakComponents, strongComponents, hasCycle, groupsText };
})();
