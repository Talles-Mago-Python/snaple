# Guia para agentes de IA — snaple

Este arquivo é para uma IA que vai **ler, editar ou usar** o código deste
repositório. Para a explicação de produto (o "porquê" da lib e exemplos
narrados), leia [`README.md`](README.md) — este guia não repete o que já está
lá, só aponta o que uma IA precisa saber antes de editar ou escrever código
contra a API.

## O que é

`snaple` é uma lib de layout 3D declarativo em TypeScript. O estado de uma
cena é uma árvore de nós JSON puro (sem malha, sem vértices); geometria e
bounding box são sempre **derivadas** dos parâmetros. Isso é o que faz o
core rodar em Node puro, sem GPU e sem navegador — inclusive em CI.

```
packages/core    estado, bbox, faces, layout, features (furo), validação, descrever()
packages/three   backend: JSON da cena → THREE.Object3D (não faz layout, não valida)
packages/mcp     servidor MCP (stdio): expõe core+three como tools (ver packages/mcp/README.md)
spec/            JSON Schema normativo do formato de cena (cena.schema.json)
examples/        scripts .ts executáveis + viewer web (examples/web)
tests/           testes de unidade do core, node --test, sem navegador
```

Regra de dependência: `packages/core` **nunca** importa `@snaple/three` nem
conhece nomes de campo do Three.js. Se você está editando o core e sente
vontade de importar algo de render, pare — isso é sinal de estar no pacote
errado.

## Antes de editar: convenções que não têm exceção

- **Unidade: metros. Eixo vertical: +y (Y-up), sistema destro.**
  `+x` leste, `-x` oeste, `+z` sul, `-z` norte.
- **Rotação: Euler XYZ intrínseca, em radianos.** Nunca graus.
- **Toda geometria paramétrica nasce centrada na própria origem local —
  com uma exceção deliberada.** É a invariante de que depende `bbox()`/
  `bboxPropria()` e toda a lógica de face; se você adicionar um novo
  `TipoGeometria`, a malha derivada tem que respeitar isso ou bbox e faces
  ficam erradas silenciosamente. A exceção é `extrude` com `recentrar:
  false`, para perfis desenhados num sistema de coordenadas próprio — nesse
  caso a caixa local pode ser assimétrica (`min ≠ -max`), calculada por
  `caixaLocalPropria()` em `bbox.ts` (generalização de `meiaExtensaoLocal`
  que ainda cobre o caso simétrico sem mudança). `helix` continua sempre
  centrado, mesmo eixo de `cylinder`/`lathe`.
- **O estado nunca guarda malha.** `No.params` + `No.transform` são a fonte
  da verdade; vértices só existem como saída de `derivarGeometria`
  (`packages/core/src/geometria.ts`), nunca gravados de volta no nó.
- **`bbox()` (subárvore) vs `bboxPropria()` (só o próprio nó) não são
  intercambiáveis.** `Face.caixaLocal()` usa a própria de propósito — trocar
  por `bbox()` reintroduz o bug histórico em que a face `base` de um tampo
  passa a se mover conforme pernas são adicionadas.
- **Gap e distribuição operam sobre bordas de AABB, não sobre centros**
  (`distribuirEm1D` em `face.ts`, reusada por `layout.ts`). Qualquer nova
  função de distribuição deve reusar essa função, não reimplementar.

## Mapa da API (o que existe, sem repetir o README)

- `Cena` (`cena.ts`) — árvore + operações: `criar`, `adicionar`, `remover`,
  `reparentar` (preserva posição mundial), `transformar`, `definirParams`,
  `definirMaterial`, `bbox`/`bboxPropria`, `geometria`, `avisos`/
  `avisosTexto`, `descrever`, `toJSON`/`deJSON`. `invalidar()` marca layout
  sujo; a resolução (`resolverFlex` + `calcularMundo`) só acontece na
  próxima leitura via `mundo()`, nunca no meio de uma edição — isso importa
  se você adicionar uma mutação nova: sempre chame `invalidar()` no final.
  Também `acoplar`/`acoplamentos`/`acoplamento`/`desacoplar`/
  `conferirMontagem` — ver `acoplamento.ts` abaixo. `remover()` descarta em
  cascata qualquer acoplamento que referencie o nó removido ou um
  descendente dele.
- `NoRef` — handle fino (`cena` + `id`) devolvido por `criar`/`ref`; nunca
  guarda dado duplicado, então não pode dessincronizar. Métodos fluentes:
  `.mover()`, `.girar()`, `.escalar()`, `.material()`, `.nomear()`,
  `.furar()`, `.atualizarFuro()`, `.limparFuros()`.
- `Face` (`face.ts`) — `no.face(nome)` dá um plano de trabalho com
  `.colocar()`, `.distribuir()`, `.grade()`. Tabela de frames U/V/normal por
  face está documentada no topo do arquivo — consulte antes de mexer em
  orientação. Trabalha no espaço **local do dono**, não no mundo; para o
  mundo, use `.origemMundo()`/`.normalMundo()`/`.eixosMundo()` (recalculadas
  a partir de `mundo()`, refletem rotação e escala não uniforme de qualquer
  ancestral). `colocar()` aceita `gap` (afasta ao longo da normal) e
  `orientar: false` (mantém a rotação do alvo, só encosta a base).
- `layout.ts` — funções relacionais no espaço do **mundo**, para AABBs
  alinhadas aos eixos: `colocarSobre`, `encostar`, `alinhar`,
  `centralizarEm`, `empilhar`, `distribuir`, `circular`, `envelope`. Use
  `Face` quando a relação é "nesta face de um nó girado"; use `layout.ts`
  quando é "acima/ao lado no mundo".
- `validar.ts` — o linter (`avisosDaCena`): quatro tipos de aviso
  (`interpenetracao`, `flutuando`, `centros-coincidentes`,
  `acoplamento-violado`), **sempre avisos, nunca erros**. Pares pai/filho são
  ignorados na checagem de interpenetração (`saoParentes`); pares com um
  `acoplamento` `contato`/`pivo` entre si são igualmente ignorados na
  interpenetração e na flutuação (a relação já é a declaração de que o
  contato/a articulação é intencional). Se adicionar uma nova checagem, siga
  esse padrão — não lance exceção por uma cena "estranha" mas válida.
- `acoplamento.ts` — relação declarada entre faces de dois nós
  (`contato`/`pivo`), guardada em `Cena` e **verificada, não resolvida**:
  `erroDoAcoplamento` calcula `{erroPosicao, erroAngulo}` (posição em metros,
  ângulo em radianos, sempre separados), reusado por `Cena.conferirMontagem`
  e por `validar.ts` para não divergirem. Não crie um solver aqui — layout
  continua vindo de `colocar`/`layout.ts`/fórmulas do modelo.
- `descrever.ts` — gera a prosa em português de `cena.descrever()`. É a
  interface pensada para um agente/LLM "ver" a cena sem screenshot — se você
  adicionar um tipo de nó ou feature, considere se `descrever()` também
  precisa saber falar dele.
- `geometria.ts` — deriva a malha (vértices/índices) a partir de
  params+features. É onde entram os furos (extrusão de perfil 2D com
  `holes`, fatiamento por profundidade parcial). Limites de furo falham
  **alto**, com `ErroFeature.motivo` explicando por quê (ver tabela no
  README) — ao adicionar uma nova restrição, siga o mesmo padrão de erro
  explicado, não `undefined`/silêncio.
- `spec/cena.schema.json` — contrato normativo do JSON serializado. Qualquer
  mudança em `tipos.ts` que afete o formato serializado **precisa** ser
  espelhada aqui, senão a suíte de testes (`tests/spec.test.ts`) quebra —
  esse teste é o guard-rail contra core e spec divergirem em silêncio.

## Fluxo de trabalho

```bash
npm install
npm run check      # typecheck: tsc -b packages/core packages/three packages/mcp + examples/web
npm test           # build + node --test tests/*.test.ts (sem GPU, sem navegador)
npm run relatorio  # os mesmos casos de teste, imprimindo números em vez de ✔
npm run dev        # viewer web (Vite) em examples/web, hot-reload direto do src
```

- Os pacotes rodam **TypeScript estrito, sem `any` na API pública**, e os
  `.ts` de `examples/` e `tests/` executam direto no Node 24+ via type
  stripping — não há passo de build para rodá-los.
- Depois de editar `packages/core/src`, rode `npm test` (ele reconstrói os
  pacotes antes) e não só `npm run check` — há um teste que compara a malha
  construída pelo backend Three.js contra a bbox calculada pelo core, nó a
  nó, para todas as primitivas e hierarquias giradas/escaladas; é o que pega
  regressão de convenção (eixo, centragem, rotação de extrusão) sem abrir
  navegador.
- Modelos do viewer moram em `examples/web/modelos/*.ts` — cada arquivo que
  exporta `montarCena(): Cena` vira uma opção no seletor sozinho (o
  `main.ts` escaneia a pasta via `import.meta.glob`, não precisa editá-lo
  para adicionar um modelo). **Não** coloque câmera, luz ou renderer num
  arquivo de modelo — isso é responsabilidade fixa do viewer (`viewer.ts`).

## Erros comuns a evitar

- Escrever coordenadas de mundo à mão em vez de usar `face().colocar()` /
  `layout.ts` — anula o ponto da lib (é exatamente o que ela existe para
  eliminar) e tende a reintroduzir flutuação/penetração que o linter existe
  para pegar.
- Usar `bbox()` onde a intenção é "só a geometria deste nó" — use
  `bboxPropria()`. Confundir os dois é o bug mais fácil de introduzir por
  engano no código de layout.
- Tentar CSG (subtração booleana de malha). Não está implementado por
  design — furo é sempre regerar geometria paramétrica, nunca cortar malha.
  Se uma tarefa parecer exigir CSG de verdade (interseção arbitrária de
  sólidos), é um limite conhecido da lib, não algo para contornar com hack.
- Adicionar `any` para "resolver" um erro de tipo na API pública dos
  pacotes — o projeto é estrito de propósito; resolva o tipo de verdade.
- Rodar `npm run exemplos`/scripts como fonte de verdade sobre corretude —
  eles são demonstração, não asserção. Corretude é `npm test` (compara
  contra o schema e contra a malha real do backend).

## Onde não adivinhar — leia a fonte

Estes três arquivos têm comentários de topo de arquivo que documentam
decisões de design não óbvias; leia-os antes de mexer na área correspondente
em vez de inferir do nome das funções:

- `packages/core/src/face.ts` — tabela de frames U/V/normal, por que
  `colocar` reparenta por padrão.
- `packages/core/src/bbox.ts` — por que geometria é centrada na origem
  local e o que isso simplifica.
- `packages/core/src/cena.ts` — por que `invalidar()`/`mundo()` separam
  mutação de resolução de layout.
