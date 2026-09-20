# snaple

Layout 3D declarativo em TypeScript. Você descreve **relações** — "as pernas
vão na face de baixo do tampo", "os livros ficam espaçados por igual na
prateleira", "este furo tem 5 mm e é passante" — e a biblioteca resolve as
coordenadas.

O core não importa nenhum motor de render e não toca em DOM: roda em Node
puro, e layout 3D vira uma coisa que dá para **testar em CI, sem GPU e sem
navegador**. O backend Three.js é um pacote separado que só transforma o JSON
resultante em `THREE.Object3D`.

```
packages/core    estado, bounding box, faces, layout, features, validação, descrever()
packages/three   backend: core → Three.js
packages/mcp     servidor MCP (stdio) — expõe core+three como tools pra Claude Code
spec/            JSON Schema versionado do formato de cena (contrato normativo)
examples/        exemplos executáveis + viewer web
tests/           testes unitários do core, sem navegador
```

## Instalação

```bash
npm install @snaple/core
npm install @snaple/three three   # opcional, só se for renderizar
```

## Convenções

| | |
|---|---|
| Unidade | **metros** |
| Eixo vertical | **+y** (Y-up), sistema destro |
| Cardeais | `+x` leste · `-x` oeste · `+z` sul · `-z` norte |
| Rotação | Euler XYZ intrínseca, em radianos |

A convenção **não vaza do core**: o documento de cena declara `unidade: "m"` e
`eixoCima: "y"`, e cada backend converte na própria fronteira se precisar.

## Uma mesa, sem calcular uma coordenada

```ts
import { Cena, circular } from "@snaple/core";

const cena = new Cena();

// a única coordenada absoluta da cena inteira é a altura do tampo
const tampo = cena.criar(
  "box",
  { largura: 1.8, altura: 0.06, profundidade: 1.0 },
  { nome: "mesa", transform: { posicao: [0, 0.72, 0] } },
);

// quatro pernas na face de baixo, numa grade 2×2, 12 cm recuadas da borda
const pernas = [0, 1, 2, 3].map(() =>
  cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.04, altura: 0.69 }, { nome: "perna" }),
);
tampo.face("base").grade(pernas, 2, 2, { gapEntre: 0.12 });

// quatro cadeiras em círculo em volta
const cadeiras = [0, 1, 2, 3].map(() =>
  cena.criar("box", { largura: 0.45, altura: 0.95, profundidade: 0.45 },
    { nome: "cadeira", transform: { posicao: [0, 0.475, 0] } }),
);
circular(cadeiras, 1.2, { centro: [0, 0, 0] });

// uma xícara no tampo, 45 cm à esquerda do centro
const xicara = cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.03, altura: 0.09 }, { nome: "xícara" });
tampo.face("topo").colocar(xicara, { u: -0.45, v: 0.1 });

console.log(cena.descrever());
// Uma mesa (1.8 × 0.75 × 1 m) no centro, com 4 pernas. Quatro cadeiras ao
// redor da mesa, distribuídas em círculo de raio 1.20 m. Uma xícara apoiada
// sobre a mesa, levemente à esquerda.

pernas.every((p) => p.bbox().min[1] === 0);   // true — encostam no chão exatamente
xicara.bbox().min[1] === tampo.bboxPropria().max[1];  // true — sem gap, sem penetração
```

Rode com `node examples/mesa.ts`.

## Os seis conceitos

### 1. O estado é a fonte da verdade, e nunca guarda malha

Uma cena é uma árvore de nós. Cada nó tem `id`, `tipo`, `params`, `transform`,
`filhos` e `features` — e nada mais. Vértices, índices e normais são
**sempre** derivados: `cena.geometria(id)` devolve a *receita*, não a malha.

É isso que faz um furo continuar editável depois de feito, serializar em JSON
e sobreviver à troca de backend.

```ts
JSON.stringify(cena.toJSON()).includes("position");   // false, sempre
```

### 2. Bounding box paramétrica

`bbox()` é calculada de tipo + params + transform, acumulando a cadeia de
pais, sem nenhum round-trip a render:

```ts
const b = no.bbox();        // { min, max, centro, tamanho } no mundo, com a subárvore
const p = no.bboxPropria(); // só a geometria do próprio nó
```

A distinção entre as duas é o que faz `mesa.face("base")` devolver a face de
baixo do **tampo**, e não a do conjunto tampo+pernas depois que a primeira
perna foi colocada.

**Invariante que o resto todo aproveita:** toda geometria é centrada na
própria origem local. Rotacionar um conjunto simétrico preserva a simetria,
então o centro da AABB de um nó sem filhos é sempre a origem local levada para
o mundo — qualquer que seja a rotação.

### 3. Faces como planos de trabalho

Todo nó expõe `topo`, `base`, `norte`, `sul`, `leste`, `oeste` (e os aliases
`+y`, `-y`, `-z`, `+z`, `+x`, `-x`). Uma face é um plano 2D com origem no
centro, eixos U/V e extensão:

```ts
tampo.face("topo").colocar(xicara, { u: -0.45, v: 0.1 });
tampo.face("base").grade(pernas, 2, 2, { gapEntre: 0.12 });
parede.face("sul").distribuir(quadros, { eixo: "u", justify: "space-evenly" });
```

A base do nó encosta na face **exatamente**, e ele nasce orientado para fora
dela. Objeto flutuando ou afundado deixa de ser possível por construção: a
posição final não é escolhida pelo chamador nem por heurística, é derivada da
AABB do nó colocado.

Como o `+y` local do nó é o que aponta para fora da face, um nó que vai numa
parede é autorado **deitado**, com a espessura em `altura`. As contas todas
acontecem no referencial do dono da face, então isso vale igual para um nó
girado no mundo.

`colocar` também adota o nó como filho do dono da face — mover a mesa leva a
xícara junto. Passe `reparentar: false` se não quiser.

Duas opções ajustam esse comportamento padrão: `gap` afasta o alvo da face ao
longo da normal (em vez de encostar em zero), e `orientar: false` mantém a
rotação que o alvo já tinha em vez de sobrescrevê-la — a base ainda encosta no
plano, só a orientação fica por conta de quem chamou:

```ts
tomada.face("topo").colocar(pino, { gap: 0.002 });        // 2 mm de folga
suporte.face("leste").colocar(peca, { orientar: false }); // preserva a rotação
```

#### Face no espaço do mundo

Além do referencial local (usado por `u`/`v`, ver abaixo), toda face sabe se
posicionar no mundo — útil para comparar duas faces de nós diferentes, em
qualquer hierarquia e qualquer pose:

```ts
face.origemMundo(): V3            // centro da face, no mundo
face.normalMundo(): V3            // normal unitária, no mundo
face.eixosMundo(): { u: V3; v: V3 } // eixos U/V unitários, no mundo
```

As três refletem rotação **e** escala não uniforme do dono (e de qualquer
ancestral), sempre recalculadas a partir de `mundo()` — nunca ficam
desatualizadas depois de mover, girar ou reparentar algo na cena. É a base de
[Acoplamentos](#acoplamentos--verificar-não-resolver): dado que ambas as
faces sabem sua origem e normal no mundo, comparar duas faces de nós
diferentes é só subtração e produto escalar.

#### Convenção U/V, face a face

Cada face é derivada da AABB da geometria **própria** do dono, no espaço
**local** dele — não no do mundo. `u`/`v` são sempre coordenadas nesse plano
local, com origem no centro da face; girar o dono no mundo gira o plano
inteiro junto, mas não muda o que `u`/`v` significam para quem chama.

```
                     +y (topo)
                       │   v=+z
                       │  ↗
                       │ ╱
                       │╱
        ───────────────┼─────────────── +x (leste)
                      ╱│                  v=+y, u=+z
                     ╱ │
              -z    ╱  │
            (norte)╱   │
                       -y (base)
```

| face    | normal | eixo U | eixo V |
|---|---|---|---|
| `topo`  | `+y` | `+x` | `+z` |
| `base`  | `-y` | `+x` | `-z` |
| `leste` | `+x` | `+z` | `+y` |
| `oeste` | `-x` | `-z` | `+y` |
| `sul`   | `+z` | `-x` | `+y` |
| `norte` | `-z` | `+x` | `+y` |

Cada linha satisfaz `normal = V × U` (destro, sem espelhamento): colocar um
nó numa face mapeia o `+x` local dele em U, o `+y` local em **normal** e o
`+z` local em V. É por isso que **o `+y` local do nó colocado é o que aponta
para fora da face** (seção anterior) e por isso que um furo ou uma
distribuição em `leste`/`oeste` correm ao longo do `+z`/`+y` do dono, não do
`+x`/`+y` do mundo.

Prova disso rodada de verdade (não só na teoria): colocar um cubo de 2 cm em
cada uma das seis faces de um cubo de 20 cm com `{u: 0.02, v: 0}` desloca o
alvo, em relação ao centro do dono, assim:

| face | normal local | eixo U local | delta mundo (x, y, z) para `u=+0.02` |
|---|---|---|---|
| `topo`  | `0,1,0`   | `1,0,0`  | `0.02, 0.11, 0` |
| `base`  | `0,-1,0`  | `1,0,0`  | `0.02, -0.11, 0` |
| `norte` | `0,0,-1`  | `1,0,0`  | `0.02, 0, -0.11` |
| `sul`   | `0,0,1`   | `-1,0,0` | `-0.02, 0, 0.11` |
| `leste` | `1,0,0`   | `0,0,1`  | `0.11, 0, 0.02` |
| `oeste` | `-1,0,0`  | `0,0,-1` | `-0.11, 0, -0.02` |

(`0.11` = meia-aresta do dono, `0.1`, mais meia-aresta do alvo, `0.01` — a
"encostar exatamente" da seção anterior; `0.02` é exatamente o `u` pedido, no
eixo U de cada face.) Repetindo o mesmo `{u: 0.05, v: 0.03}` na face `leste`
de um dono girado 90° em Y no mundo, o resultado é `delta = (0.05, 0.03,
-0.11)`: `u` e `v` continuam batendo com o eixo U/V **local** do dono (que a
rotação levou para outro lugar no mundo), não com X/Z do mundo — exatamente a
garantia que o parágrafo acima descreve.

### 4. Layout declarativo, com vocabulário de CSS de propósito

Containers sem geometria própria, só organizam filhos: `row` (eixo X),
`column` (eixo Y), `stack` (eixo Z), com `gap`, `justify` e `align`.

```ts
const fila = cena.criar("row", { extensao: 1.1, justify: "space-between", align: "start" });
```

Mais as funções relacionais: `colocarSobre`, `encostar`, `alinhar`,
`empilhar`, `circular`, `centralizarEm`, `distribuir`.

**Gap e distribuição operam sobre BORDAS de bounding box, não sobre centros.**
Com objetos de tamanhos diferentes, é a diferença entre espaçamento certo e
espaçamento errado:

```ts
const fila = cena.criar("row", { extensao: 10, justify: "space-between" });
[0.5, 2, 1.25, 3].forEach((l) => fila.criar("box", { largura: l, altura: 1, profundidade: 1 }));
// os três vãos entre bordas são exatamente iguais: (10 - 6.75) / 3
```

O vocabulário é o do CSS porque quem usa a lib já sabe o que `space-between`
faz — a intuição vem de graça. A semântica também é a do CSS: `gap` é a folga
mínima, e `justify` distribui o espaço livre que sobra por cima dela.

### 5. Furo paramétrico sem CSG

Objetos são paramétricos, então furar é **regerar** a geometria com o furo
incluído — não subtrair malha de malha:

```ts
placa.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.005 }, u: 0.1, v: -0.05 });
placa.atualizarFuro(0, { forma: { tipo: "circulo", raio: 0.006 } });  // é edição, não novo corte
```

O core monta o perfil 2D com os buracos e o backend extruda (`Shape` +
`holes` + `ExtrudeGeometry`, nativo do Three.js). Furo de profundidade parcial
também sai sem CSG: o eixo é fatiado nos trechos onde o conjunto de furos
ativos muda, e cada fatia vira uma extrusão própria.

Os limites falham **alto**, com erro explicando por quê, em vez de devolverem
algo silenciosamente errado:

| caso | `ErroFeature.motivo` |
|---|---|
| furo em nó `model` | `malha-importada` |
| furo em `sphere`/`cone`/`torus`/`lathe`/tronco de cone | `geometria-nao-extrudavel` |
| furos em faces de normais diferentes no mesmo nó | `faces-conflitantes` |
| furo cujo volume alcança outro nó | `atravessa-outro-no` |
| furo maior que a peça | `furo-maior-que-o-no` |

Furo numa direção que não seja normal a nenhuma face é irrepresentável por
construção — o campo `face` só aceita os seis nomes.

CSG é ponto de extensão futuro e **não** está implementado.

### 6. `extrude` com `recentrar: false`, e `helix`

Por padrão, `extrude` recentra o perfil na própria bounding box antes de
extrudar — é a invariante de geometria centrada na origem local, da seção 2.
Às vezes esse recentro atrapalha: quando o perfil já foi desenhado num
sistema de coordenadas próprio, com um ponto de referência que precisa
continuar sendo a origem do nó (por exemplo, várias peças pensadas para se
encaixar por esse ponto comum). `recentrar: false` usa o perfil como está,
sem deslocar — o eixo de extrusão (`y`) continua sempre centrado, só o plano
`(x, z)` do perfil fica descentrado se o perfil for assimétrico:

```ts
cena.criar("extrude", {
  perfil: [[1, 2], [1.6, 2], [1.3, 2.5]], // longe da origem, de propósito
  altura: 0.4,
  recentrar: false,
}); // bbox local não passa mais por -h..+h; é o footprint real do perfil
```

`helix` é uma peça nova: um tubo de seção circular varrendo um caminho
helicoidal em torno do eixo `+y` local — o mesmo eixo de `cylinder`/`lathe`,
já centrado (`y` vai de `-passo·voltas/2` a `+passo·voltas/2`). Serve para
mola, rosca de parafuso, cabo espiralado — qualquer coisa que seja
"circular, mas subindo":

```ts
cena.criar("helix", { raio: 0.02, raioTubo: 0.003, passo: 0.01, voltas: 6 });
```

A bbox é **analítica**, sem tocar em malha: no plano `(x, z)` o tubo nunca
passa de `raio + raioTubo` do eixo; em `y`, a trajetória cobre
`passo × voltas`, mas as duas pontas **abertas** do tubo (não é um anel
fechado) podem ir além disso — a "tampa" de cada ponta é perpendicular à
tangente da hélice, não ao eixo `y`, e no limite de passo raso (quase um
anel achatado, o caso `mola` com voltas curtas) esse excesso tende ao
`raioTubo` inteiro. Por isso a meia-altura declarada soma essa margem
(`passo·voltas/2 + raioTubo`): é o que garante que a malha real sempre
**cabe** dentro da bbox que o core calculou, confirmado contra a malha real
do backend (`TubeGeometry` sobre uma curva helicoidal) em
`tests/backend.test.ts` — não é só teoria, é testado.

Backend: `TubeGeometry` do Three.js sobre uma `Curve` parametrizada pela
mesma fórmula da bbox. Nenhum furo é suportado em `helix` (mesma família de
`sphere`/`cone`/`torus`/`lathe`: não é a extrusão de um perfil 2D num só
eixo, furar exigiria CSG).

`helix` é o primeiro caso de **varredura ao longo de um caminho** que o core
suporta — hoje só um caminho helicoidal fixo. Um `sweep` genérico (perfil 2D
arbitrário varrendo uma curva arbitrária) é a extensão natural futura; quando
existir, `helix` deve virar um caso particular dele, sem quebrar o formato de
cena atual.

## Objetos importados: `model`

```ts
cena.criar("model", { src: "assets/cadeira.glb", tamanho: [0.45, 0.9, 0.5] });
```

`tamanho` é a bounding box **declarada**, e é o que o layout usa — sem abrir o
arquivo, exatamente como `width`/`height` num `<img>`. Se `src` não existir, o
backend desenha uma caixa proxy. Se a bbox real divergir da declarada, ele
**avisa e não corrige**: previsibilidade de layout vem primeiro.

## O linter de cena

Depois de qualquer operação, `cena.avisos()` devolve os problemas em array
estruturado, e `cena.avisosTexto()` os mesmos em texto:

```
AVISO: caixa_a penetra caixa_b em 1.50 m no eixo x
AVISO: bola flutua 2.00 m acima do chão, sem nada embaixo
AVISO: um e dois têm praticamente o mesmo centro (0.0050 m de distância) — provável erro de posicionamento
```

São **sempre avisos, nunca bloqueios**: interpenetração pode ser deliberada
(um prego cravado numa tábua) e a lib não tem como saber. Pares pai/filho são
ignorados na detecção de interpenetração.

## Acoplamentos — verificar, não resolver

Um acoplamento declara uma relação entre duas faces de dois nós — "esta roda
gira em torno deste eixo", "esta chapa está assentada sobre esta bandeja" —
como estado de primeira classe da cena, não como um cálculo feito uma vez e
esquecido. Guardado, serializado e **conferível a qualquer momento, em
qualquer pose**:

```ts
const pivo = cena.acoplar({
  tipo: "pivo",
  nome: "ombro",
  a: { no: base, face: "topo" },
  b: { no: braco, face: "base" },
});

braco.girar([0, Math.PI / 3, 0]); // articula livremente — layout continua vindo de colocar()

const relatorio = cena.conferirMontagem();
relatorio.passou;              // true/false
relatorio.piorCaso;            // { erroPosicao, erroAngulo, nos, ... } — o pior dos dois
```

Dois tipos nesta versão:

- **`contato`**: as duas faces no mesmo plano, normais opostas — uma peça
  assentada sobre a outra. Erro = distância ao longo da normal (fora do
  plano).
- **`pivo`**: os **centros** coincidem (não só o plano), normais opostas — o
  eixo de giro é a normal compartilhada. Erro = distância entre os centros.

Nos dois casos o erro de posição (metros) e o erro angular (radianos, desvio
das normais em relação a exatamente opostas) saem **separados** no
relatório, por acoplamento e no pior caso — misturar as duas unidades numa
soma só esconderia qual delas realmente quebrou.

**Acoplamentos são verificados, não resolvidos.** `acoplar` não move nada;
quem posiciona continua sendo `colocar`, os containers de layout e as
fórmulas do seu modelo. Isso mantém o sistema previsível: layout é sempre
uma função direta dos parâmetros, nunca a saída de um solver iterativo.

Um par acoplado deixa de contar como interpenetração ou flutuação no linter
(a relação declarada já é a explicação de por que eles se tocam ou por que
um não tem nada "embaixo"), e ganha um aviso próprio,
`acoplamento-violado`, se a relação deixar de valer na pose atual — mesma
regra do resto do linter: é aviso, nunca bloqueio. `descrever()` também narra
cada acoplamento em prosa: *"O braço gira em torno do pivô do ombro."*,
*"A bateria está assentada sobre a chapa."*

## `descrever()` — a cena em prosa

```ts
cena.descrever();
// "Uma prateleira (1.2 × 0.03 × 0.25 m) no centro. Cinco livros apoiados
//  sobre a prateleira. Aviso: box_1 flutua 1.39 m acima do chão, sem nada
//  embaixo."
```

Relações, agrupamentos e os avisos ativos, em português. É o que permite
conferir uma montagem sem abrir viewer — e, se houver um agente no circuito,
raciocinar sem gastar screenshot. Implementado no core, sem nenhuma
dependência de render.

## Renderizando

```ts
import { construirCena } from "@snaple/three";

const { objeto, avisos } = await construirCena(cena);
scene.add(objeto);
for (const a of avisos) console.warn(a.texto);
```

O backend só faz isso. Ele não move nós, não faz layout e não valida — tudo
isso já aconteceu no core, em Node puro, antes de o Three.js entrar. A
dependência é de mão única: o core não importa `@snaple/three` e não conhece
nenhum nome de campo do Three.js.

## Viewer web

Um viewer mínimo para olhar a cena enquanto lê o que o core diz sobre ela:

```bash
npm run dev
```

Sobe o Vite em `examples/web/` e abre o navegador. Botão esquerdo orbita,
botão direito faz pan, scroll dá zoom. O painel ao lado do canvas mostra
`descrever()` e `avisosTexto()` — dá para conferir o render contra a prosa sem
sair da página.

Cada arquivo em **`examples/web/modelos/`** que exporta `montarCena(): Cena`
vira uma opção no seletor no topo do painel — nada de câmera, luz ou renderer
ali dentro, isso é responsabilidade fixa do viewer. Para adicionar um modelo
novo, crie o arquivo e salve: o seletor lista sozinho, sem editar nenhum
código do viewer (o Vite escaneia a pasta via `import.meta.glob`). Trocar de
modelo no seletor, ou salvar o arquivo do modelo já selecionado, remonta sem
recarregar a página; a câmera reenquadra a partir da bounding box total,
então qualquer cena que entrar aparece inteira. Erro ao montar cai no painel,
não numa tela branca. A escolha atual fica na URL (`?cena=nome`,
compartilhável) e em `localStorage`, então recarregar a página mantém o
mesmo modelo.

Os pacotes são resolvidos direto do código-fonte (`vite.config.ts`), então
mexer em `packages/core/src` também recarrega na hora, sem `npm run build`.

## Serialização

```ts
const json = cena.toJSON();     // { version: 1, unidade: "m", eixoCima: "y", raiz }
const volta = Cena.deJSON(json);
```

O formato é normativo e está em [`spec/`](spec/): `cena.schema.json` (JSON
Schema 2020-12) mais um README explicando frames de face, o contrato da
geometria derivada e a regra de fatiamento dos furos. Dá para escrever um
backend novo lendo só o spec. A suíte de testes valida a saída real do core
contra esse schema, então contrato e implementação não divergem em silêncio.

`toJSON()` é canônico (`-0` vira `0`), então duas cenas iguais comparam iguais.

## Desenvolvimento

```bash
npm install
npm run dev       # viewer web em examples/web
npm test          # compila e roda a suíte (sem GPU, sem navegador)
npm run relatorio # os mesmos casos, imprimindo os números em vez do ✔
npm run exemplos
npm run check     # só typecheck (pacotes + viewer)
npm run build:web # build estático do viewer
```

A suíte inclui um teste que **compara a malha que o backend constrói com a
bbox que o core calculou**, nó por nó, para todas as primitivas, hierarquias
giradas/escaladas e nós furados. Se as convenções saírem de sincronia (eixo,
centragem, rotação da extrusão), quebra ali — em Node, sem abrir navegador.

O core é TypeScript estrito, sem `any` na API pública, e roda direto no Node
24+ por type stripping — os exemplos e os testes são `.ts` executados sem
passo de build.

## E se houver um agente no circuito?

A API pública é a de biblioteca, para uso manual por um dev. Nada aqui conhece
prompt, tool call, permissão ou processo externo.

Se alguém quiser expor isto a um LLM, a camada é fina e mora **fora** deste
repositório: `descrever()` e `avisosTexto()` já devolvem texto pronto para
entrar num contexto, `toJSON()`/`deJSON()` dão o estado inteiro, e os erros de
feature trazem a explicação do porquê junto. Essa camada fina é um wrapper da
lib, não uma parte dela.

## Limitações conhecidas

- **CSG não existe.** Os casos que exigiriam estão listados acima e falham com
  erro claro.
- **Objeto fixado em parede aparece como "flutuando".** O linter procura apoio
  por baixo; uma prateleira sem suporte inferior é flagrada. É aviso, não
  bloqueio.
- **Escala não-uniforme num ancestral + rotação no filho** produz cisalhamento,
  que não é representável como posição/rotação/escala. A decomposição devolve
  a aproximação ortonormal mais próxima — mesma limitação do Three.js.
- **Contornos são polígonos.** Um círculo furado vira um polígono de
  `segmentos` lados (32 por padrão). O contorno externo de um `box` é exato.
- **Concordância de gênero em `descrever()` é heurística** (substantivo
  terminado em "a"/"ã" é feminino). Acerta mesa, cadeira, xícara, caixa,
  esfera; erra "mapa". É prosa gerada, não gramática garantida.
- **Sem câmera, luz ou animação no formato.** A cena descreve geometria e
  layout; iluminar e enquadrar é do backend.

## Licença

MIT.
