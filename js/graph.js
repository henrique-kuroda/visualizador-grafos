'use strict';

/* =========================================================================
 * Modelo do grafo: vértices, arestas e consultas de adjacência.
 * ========================================================================= */

/** 0 → "A", 25 → "Z", 26 → "AA", ... */
function indexToLabel(i) {
  let s = '';
  i += 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

/** Ordenação "natural" de rótulos: A, B, ..., Z, AA / V2 antes de V10. */
function compareLabels(a, b) {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

/** Formata números para exibição (vírgula decimal, ∞). */
function formatNum(x) {
  if (x === Infinity) return '∞';
  if (x === -Infinity) return '-∞';
  if (Number.isInteger(x)) return String(x);
  return String(Math.round(x * 1000) / 1000).replace('.', ',');
}

class Graph {
  constructor() {
    this.directed = false;
    this.weighted = false;
    this.clear();
  }

  clear() {
    this.vertices = []; // { id, label, x, y }
    this.edges = [];    // { id, from, to, weight }
    this.nextId = 1;
  }

  // ---------- consultas ----------

  vertex(id) {
    return this.vertices.find(v => v.id === id) || null;
  }

  edge(id) {
    return this.edges.find(e => e.id === id) || null;
  }

  label(id) {
    const v = this.vertex(id);
    return v ? v.label : '?';
  }

  sortedVertices() {
    return [...this.vertices].sort((a, b) => compareLabels(a.label, b.label));
  }

  /** Peso efetivo de uma aresta (1 quando o grafo não é ponderado). */
  weightOf(e) {
    return this.weighted ? e.weight : 1;
  }

  /**
   * Todas as arestas que ligam u → v (o grafo é um multigrafo: aceita
   * arestas paralelas e laços). Em grafos não dirigidos a orientação
   * armazenada é irrelevante.
   */
  edgesBetween(u, v) {
    return this.edges.filter(e =>
      (e.from === u && e.to === v) ||
      (!this.directed && e.from === v && e.to === u)
    );
  }

  /** A primeira aresta de u → v, ou null. */
  findEdge(u, v) {
    return this.edgesBetween(u, v)[0] || null;
  }

  /** true se existe laço ou aresta paralela (ou seja, não é um grafo simples). */
  isMultigraph() {
    const vistos = new Set();
    for (const e of this.edges) {
      if (e.from === e.to) return true;
      const key = this.directed
        ? `${e.from}>${e.to}`
        : `${Math.min(e.from, e.to)}:${Math.max(e.from, e.to)}`;
      if (vistos.has(key)) return true;
      vistos.add(key);
    }
    return false;
  }

  /**
   * Uma entrada por aresta incidente a u, ordenada pelo rótulo do vizinho
   * (deixa os algoritmos determinísticos). Como o grafo é um multigrafo,
   * arestas paralelas aparecem repetidas e o laço aparece uma vez.
   *  - transpose: usa o grafo transposto (arestas invertidas)
   *  - ignoreDirection: trata o grafo dirigido como não dirigido
   */
  neighbors(u, { transpose = false, ignoreDirection = false } = {}) {
    const out = [];
    for (const e of this.edges) {
      let v = null;
      if (this.directed && !ignoreDirection) {
        if (!transpose && e.from === u) v = e.to;
        else if (transpose && e.to === u) v = e.from;
      } else if (e.from === u) {
        v = e.to;
      } else if (e.to === u) {
        v = e.from;
      }
      if (v !== null) out.push({ v, edge: e, weight: this.weightOf(e) });
    }
    return out.sort((a, b) => compareLabels(this.label(a.v), this.label(b.v)) || a.edge.id - b.edge.id);
  }

  degrees(id) {
    let out = 0, inn = 0;
    for (const e of this.edges) {
      if (e.from === id) out++;
      if (e.to === id) inn++;
    }
    return { out, in: inn, total: out + inn };
  }

  // ---------- edição ----------

  nextLabel() {
    const used = new Set(this.vertices.map(v => v.label.toUpperCase()));
    for (let i = 0; ; i++) {
      const l = indexToLabel(i);
      if (!used.has(l)) return l;
    }
  }

  addVertex(x, y, label) {
    let l = label != null ? String(label).trim() : '';
    if (!l || this.vertices.some(v => v.label.toLowerCase() === l.toLowerCase())) {
      l = this.nextLabel();
    }
    const v = { id: this.nextId++, label: l, x, y };
    this.vertices.push(v);
    return v;
  }

  /** Retorna uma mensagem de erro ou null em caso de sucesso. */
  renameVertex(id, label) {
    const l = String(label).trim();
    if (!l) return 'O rótulo não pode ser vazio.';
    if (l.length > 8) return 'Use no máximo 8 caracteres.';
    if (this.vertices.some(v => v.id !== id && v.label.toLowerCase() === l.toLowerCase())) {
      return `Já existe um vértice chamado "${l}".`;
    }
    this.vertex(id).label = l;
    return null;
  }

  removeVertex(id) {
    this.vertices = this.vertices.filter(v => v.id !== id);
    this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
  }

  /** Aceita laços (u = v) e arestas paralelas. */
  addEdge(u, v, weight = 1) {
    if (!this.vertex(u) || !this.vertex(v)) return { error: 'Aresta com vértice inexistente.' };
    const e = { id: this.nextId++, from: u, to: v, weight };
    this.edges.push(e);
    return { edge: e };
  }

  removeEdge(id) {
    this.edges = this.edges.filter(e => e.id !== id);
  }

  /**
   * Muda o tipo do grafo. Nada é descartado: um par A→B / B→A passa a ser
   * duas arestas paralelas quando o grafo vira não dirigido.
   */
  setDirected(flag) {
    this.directed = flag;
  }

  // ---------- serialização ----------

  toJSON() {
    return {
      directed: this.directed,
      weighted: this.weighted,
      vertices: this.vertices.map(v => ({ id: v.id, label: v.label, x: Math.round(v.x), y: Math.round(v.y) })),
      edges: this.edges.map(e => ({ from: e.from, to: e.to, weight: e.weight })),
    };
  }

  /**
   * Carrega um grafo a partir de um objeto { directed, weighted, vertices, edges }.
   * As arestas podem referenciar vértices pelo id ou pelo rótulo.
   * Retorna o que precisou ser ajustado: { loops, duplicadas, renomeados }.
   */
  load(data) {
    if (!data || !Array.isArray(data.vertices) || !Array.isArray(data.edges)) {
      throw new Error('Arquivo inválido: são esperados os campos "vertices" e "edges".');
    }
    const g = new Graph();
    g.directed = !!data.directed;
    g.weighted = !!data.weighted;
    // Mantém os ids numéricos do arquivo (o desfazer depende disso); ids
    // gerados começam acima de todos eles, então nunca colidem.
    const validId = id => Number.isInteger(Number(id)) && Number(id) > 0;
    g.nextId = Math.max(0, ...data.vertices.filter(v => validId(v.id)).map(v => Number(v.id))) + 1;
    const kept = new Set();
    const ref = new Map();
    const ajustes = { renomeados: 0, semVertice: 0 };
    for (const v of data.vertices) {
      const nv = g.addVertex(Number(v.x) || 0, Number(v.y) || 0, v.label);
      if (v.label != null && String(v.label).trim() && nv.label !== String(v.label).trim()) ajustes.renomeados++;
      if (validId(v.id) && !kept.has(Number(v.id))) {
        nv.id = Number(v.id);
        kept.add(nv.id);
      }
      if (v.id != null) ref.set(String(v.id), nv.id);
      ref.set(`label:${v.label}`, nv.id);
    }
    const resolve = r => ref.get(String(r)) ?? ref.get(`label:${r}`);
    for (const e of data.edges) {
      const from = resolve(e.from), to = resolve(e.to);
      if (from == null || to == null) throw new Error(`Aresta com vértice inexistente: ${e.from} → ${e.to}.`);
      const w = Number(e.weight ?? 1);
      if (g.addEdge(from, to, Number.isFinite(w) ? w : 1).error) ajustes.semVertice++;
    }
    Object.assign(this, g);
    return ajustes;
  }
}
