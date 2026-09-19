# Visualizador e Editor de Grafos

**Tema 9 · Grupo 05**

Aplicação web para criar vértices e arestas visualmente e executar algoritmos sobre o grafo,
mostrando a exploração **passo a passo**: estado de cada vértice e aresta, linha atual do
pseudocódigo, fila/pilha usada pelo algoritmo e tabela de distâncias/pais.

## Como executar

Não precisa instalar nada: é HTML, CSS e JavaScript puros, sem bibliotecas.

- **Opção 1:** abra o arquivo `index.html` direto no navegador (Chrome, Edge ou Firefox).
- **Opção 2:** sirva a pasta com um servidor local:

```bash
python -m http.server 8000
```

Depois acesse http://localhost:8000.

## Funcionalidades

### Edição visual
| Ação | Como fazer |
|---|---|
| Criar vértice | Ferramenta **Vértice** (`V`) e clique na área, ou duplo clique no vazio no modo Mover |
| Criar aresta | Ferramenta **Aresta** (`A`): clique na origem e depois no destino, ou arraste de um até o outro |
| Mover vértice | Arraste-o (modo **Mover**, `M`) |
| Renomear vértice | Duplo clique no vértice |
| Alterar peso | Duplo clique na aresta (com "Ponderado" ativo) |
| Remover | Ferramenta **Remover** (`R`), botão direito, ou selecione e tecle `Delete` |
| Desfazer / refazer | `Ctrl+Z` / `Ctrl+Y` (ou os botões da barra de ferramentas) |

- Grafos **dirigidos** ou **não dirigidos**, **ponderados** ou não (chaves no topo).
- Arestas opostas (A→B e B→A) são desenhadas curvas para não se sobreporem.
- **Exemplos prontos**, gerador **aleatório**, **layout circular** e **ajuste à tela**.
- **Importar / exportar** em JSON e salvamento automático no navegador (`localStorage`).

### Representações (atualizadas em tempo real)
- **Lista de adjacência**: memória O(V + E).
- **Matriz de adjacência**: memória O(V²), consulta de aresta em O(1). Mostra 0/1 ou os pesos.
- Durante a execução, a linha do vértice atual e o vizinho examinado ficam destacados nas duas.

### Algoritmos
| Algoritmo | O que mostra | Complexidade |
|---|---|---|
| **BFS** (busca em largura) | Fila, distâncias em nº de arestas, árvore de busca, ordem de visita | O(V + E) |
| **DFS** (busca em profundidade) | Pilha de recursão, tempos de descoberta/finalização (d/f), arestas de retorno (ciclos) | O(V + E) |
| **Menor caminho — BFS** | Caminho com menos arestas entre origem e destino | O(V + E) |
| **Menor caminho — Dijkstra** | Fila de prioridade, relaxamento de arestas, caminho de menor custo | O(V²) |
| **Componentes conexas** | Rotulação por BFS; diz se o grafo é conexo (em dirigidos: conectividade fraca) | O(V + E) |
| **Componentes fortemente conexas (Kosaraju)** | Fase 1: DFS e pilha de término; fase 2: DFS no grafo transposto Gᵀ | O(V + E) |

A aba **Propriedades** resume o grafo: número de vértices e arestas, densidade, graus
(entrada/saída em dirigidos), se é conexo / fortemente conexo, componentes e se possui ciclo.

### Controles da execução
- `▶` / `Espaço`: reproduzir ou pausar
- `‹` `›` / `←` `→`: passo anterior ou próximo
- `«` `»` / `Home` `End`: primeiro ou último passo
- Barra de tempo, controle de velocidade e lista de passos clicável
- `Esc`: encerra a execução

Durante a execução:
- a **fila / pilha / fila de prioridade** aparece ao lado da explicação do passo, embaixo do grafo;
- a aresta examinada é "traçada" do vértice atual até o vizinho, e as cores mudam com transição suave;
- o vértice atual pulsa, e cada vértice mostra um selo com seu valor (distância, d/f, componente);
- a **legenda** acima do grafo mostra só as cores usadas pelo algoritmo escolhido.

## Estrutura do projeto

```
visualizador-grafos/
├── index.html          # estrutura da página
├── css/style.css       # estilos
└── js/
    ├── graph.js        # classe Graph: vértices, arestas, vizinhos, JSON
    ├── algorithms.js   # BFS, DFS, Dijkstra, componentes, Kosaraju + pseudocódigos
    └── app.js          # interface: desenho SVG, edição, painéis e player
```

### Como funciona o passo a passo
Cada algoritmo roda por completo e grava uma lista de **snapshots** (classe `Recorder` em
`algorithms.js`). Cada snapshot guarda o estado dos vértices e arestas, a linha do pseudocódigo,
o conteúdo da fila/pilha, a tabela de dados e uma explicação em texto. A interface apenas
reproduz esses snapshots, por isso é possível avançar, voltar e pular para qualquer passo.

Os vizinhos são sempre percorridos em ordem alfabética do rótulo, então a execução é
determinística e fácil de conferir à mão.

## Formato do arquivo JSON

```json
{
  "directed": false,
  "weighted": true,
  "vertices": [
    { "id": 1, "label": "A", "x": 120, "y": 200 },
    { "id": 2, "label": "B", "x": 300, "y": 120 }
  ],
  "edges": [
    { "from": 1, "to": 2, "weight": 4 }
  ]
}
```

As arestas podem referenciar os vértices pelo `id` ou pelo `label`.
