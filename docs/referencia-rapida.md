# Referência rápida — snaple para quem só escreve código

Lista de consulta para escrever `.ts` contra `@snaple/core` **sem poder
rodar nada** (sem terminal, sem MCP, sem viewer) — só o texto do código
importa. Não é tutorial: é a lista de tipos, assinaturas e convenções para
não ter que adivinhar nome de campo ou ordem de parâmetro. Para entender o
"porquê" de cada peça, leia [`README.md`](../README.md); para o fluxo de
trabalho de quem PODE rodar código, leia
[`guia-de-modelagem.md`](guia-de-modelagem.md).

Regra de ouro por não poder verificar: **prefira sempre a função de relação
(`face().colocar()`, `colocarSobre`, `encostar`, `circular`, `grade`,
`distribuir`) a calcular uma coordenada de mundo à mão.** Uma relação não
pode dar objeto flutuando/afundado/sobreposto por construção; uma coordenada
calculada à mão pode, e ninguém vai rodar o linter para pegar o erro.

## Convenções fixas (nunca variam)

| | |
|---|---|
| Unidade | **metros** |
| Eixo vertical | **+y** (Y-up), sistema destro |
| Direções | `+x` leste · `-x` oeste · `+z` sul · `-z` norte |
| Rotação | Euler XYZ intrínseca, em **radianos** (nunca graus) |
| Origem de cada geometria | centrada nela mesma (exceto `extrude` com `recentrar: false`) |

## Import e esqueleto de arquivo

```ts
import { Cena, type NoRef, colocarSobre, encostar, alinhar, centralizarEm, empilhar, distribuir, circular, envelope } from "@snaple/core";

export function montarCena(): Cena {
  const cena = new Cena();
  // ... montagem ...
  return cena;
}
```

Um modelo é sempre uma função `montarCena(): Cena` sem efeito colateral (sem
`console.log`, sem I/O) — quem chama decide o que fazer com a `Cena` depois.

## Criar um nó

```ts
cena.criar(tipo, params, opcoes?) => NoRef
no.criar(tipo, params, opcoes?)   => NoRef   // cria como FILHO de `no`
```

`opcoes` (todas opcionais):

```ts
{
  id?: string;
  nome?: string;                 // rótulo p/ descrever() — "mesa", "xícara"
  transform?: { posicao?: [x,y,z]; rotacao?: [x,y,z]; escala?: [x,y,z] };
  material?: Material;
  pai?: string | NoRef;          // só em cena.criar; no.criar já é filho de `no`
}
```

## Tipos de nó e seus `params`

Todo `params` abaixo é o segundo argumento de `criar()`. Campos com `?` são
opcionais.

| tipo | params | observação |
|---|---|---|
| `box` | `{ largura, altura, profundidade }` | |
| `sphere` | `{ raio, segmentos? }` | |
| `cylinder` | `{ raioTopo, raioBase, altura, segmentos? }` | `raioTopo === raioBase` → cilindro reto (único caso furável); diferentes → tronco de cone |
| `cone` | `{ raio, altura, segmentos? }` | |
| `plane` | `{ largura, profundidade }` | plano XZ, normal `+y`, espessura zero |
| `torus` | `{ raio, raioTubo, segmentos?, segmentosTubo? }` | anel deitado, eixo `+y` |
| `extrude` | `{ perfil: [x,z][], altura, recentrar? }` | perfil fechado no plano XZ, extrudado em `+y`; `recentrar` padrão `true` |
| `lathe` | `{ perfil: [raio,altura][], segmentos? }` | perfil revolucionado em torno de `+y` |
| `helix` | `{ raio, raioTubo, passo, voltas, segmentosPorVolta?, segmentosTubo? }` | tubo espiralado em `+y`; `passo` = avanço em y por volta |
| `model` | `{ src, tamanho: [x,y,z] }` | referência externa; `tamanho` é a bbox DECLARADA (o layout usa isso, não abre o arquivo) |
| `grupo` | `{}` | container sem eixo, sem geometria própria |
| `row` | `{ extensao?, gap?, justify?, align? }` | container flex, eixo X |
| `column` | `{ extensao?, gap?, justify?, align? }` | container flex, eixo Y |
| `stack` | `{ extensao?, gap?, justify?, align? }` | container flex, eixo Z |

`justify`: `"start" \| "center" \| "end" \| "space-between" \| "space-around" \| "space-evenly"`
`align`: `"start" \| "center" \| "end"`

## `Material`

```ts
{ cor?: string; metalico?: number; rugosidade?: number; opacidade?: number; aramado?: boolean }
```

`cor` é CSS (`"#8b5a2b"`). `metalico`/`rugosidade`/`opacidade` em `[0, 1]`.
`aramado: true` renderiza wireframe. Nenhum campo é obrigatório.

## Métodos de `NoRef` (o que volta de `criar()`)

```ts
no.criar(tipo, params, opcoes?)        // cria filho
no.face(nome: FaceEntrada) => Face     // plano de trabalho — ver seção Face
no.mover([x,y,z])                      // sobrescreve transform.posicao
no.girar([x,y,z])                      // sobrescreve transform.rotacao (radianos)
no.escalar([x,y,z] | numero)
no.material({ cor, ... })
no.nomear("nome")
no.definirParams({ ... })              // sobrescreve params parcialmente
no.furar({ face, forma, u, v, profundidade? })   // ver seção Furo
no.atualizarFuro(indice, { ... })      // edita um furo já existente
no.limparFuros()
no.bbox()                              // AABB de mundo, com subárvore
no.bboxPropria()                       // AABB de mundo, só a geometria própria
no.remover()
no.filhos() => NoRef[]
no.pai() => NoRef | null
```

Todos os métodos que mutam (`mover`, `girar`, `material`, `furar`, ...)
retornam `this` — dá para encadear.

## `Face` — `no.face(nome)`

`nome`: `"topo" | "base" | "norte" | "sul" | "leste" | "oeste"` (ou os
aliases `"+y" | "-y" | "-z" | "+z" | "+x" | "-x"`).

Tabela de frame por face (normal aponta para FORA; `u`/`v` são coordenadas
locais do plano, origem no centro da face):

| face | normal | eixo U | eixo V |
|---|---|---|---|
| `topo` | `+y` | `+x` | `+z` |
| `base` | `-y` | `+x` | `-z` |
| `leste` | `+x` | `+z` | `+y` |
| `oeste` | `-x` | `-z` | `+y` |
| `sul` | `+z` | `-x` | `+y` |
| `norte` | `-z` | `+x` | `+y` |

```ts
face.colocar(alvo: NoRef, opcoes?) => NoRef
```

```ts
opcoes?: {
  u?: number;              // padrão 0
  v?: number;               // padrão 0
  alinhamento?: "centro" | "inicio" | "fim";   // padrão "centro"
  gap?: number;              // folga face→alvo; padrão 0 (encosta exato)
  orientar?: boolean;        // padrão true (+y local do alvo → normal da face)
  reparentar?: boolean;      // padrão true (alvo vira filho do dono da face)
}
```

`alvo` nasce SEMPRE encostado exatamente na face (± `gap`), nunca
flutuando/afundado — isso é garantido pela função, não por você acertar um
número.

```ts
face.distribuir(alvos: NoRef[], opcoes?) => NoRef[]
// opcoes: { eixo?: "u"|"v" (padrão "u"), extensao?, gapEntre?, justify?, offset?, ...OpcoesColocar sem u/v }

face.grade(alvos: NoRef[], colunas: number, linhas?: number, opcoes?) => NoRef[]
// opcoes: { gapEntre?: number | [u,v], extensao?: [u,v], espalhar?: boolean (padrão true), ...OpcoesColocar sem u/v }

face.extensao() => [u, v]        // tamanho da face nesses eixos, em metros
face.origemLocal() => [x,y,z]    // centro da face no espaço local do dono
face.origemMundo() => [x,y,z]
face.normalMundo() => [x,y,z]
face.eixosMundo() => { u: [x,y,z]; v: [x,y,z] }
```

As três leituras "Mundo" recalculam a partir de `cena.mundo()` a cada
chamada — refletem rotação e escala não uniforme de qualquer ancestral, e
nunca ficam desatualizadas depois de mover/girar/reparentar. É o que
`cena.acoplar` usa por baixo (ver seção "Acoplamentos" abaixo) para comparar
duas faces de nós diferentes sem importar a hierarquia.

## Layout — funções relacionais no espaço do MUNDO

Import de `@snaple/core`. Todas trabalham sobre AABB alinhada aos eixos do
mundo (diferente de `Face`, que trabalha no espaço local do dono).

```ts
colocarSobre(a: NoRef, b: NoRef, opcoes?: { alinhamento?: "centro"|"inicio"|"fim"; gap?: number }) => NoRef
// base de `a` encosta no topo de `b`, sem gap nem penetração

encostar(a: NoRef, b: NoRef, lado: FaceEntrada, gap?: number) => NoRef
// encosta `a` num lado de `b`; centraliza `a` em `b` nos outros dois eixos

alinhar(nos: NoRef[], eixo: "x"|"y"|"z", modo?: "start"|"center"|"end") => NoRef[]
// alinha as bboxes de vários nós num eixo; modo padrão "center"

centralizarEm(a: NoRef, b: NoRef, eixos?: string) => NoRef
// eixos padrão "xz" — centraliza `a` em `b` só nesses eixos ("tapete no chão sem levantar")

empilhar(nos: NoRef[], direcao?: FaceEntrada, gap?: number) => NoRef[]
// direcao padrão "topo" — empilha na ordem da lista, cada um encostado no anterior

distribuir(nos: NoRef[], opcoes?: {
  eixo?: "x"|"y"|"z";                                  // padrão "x"
  justify?: Justify;                                    // padrão "space-between"
  gap?: number;
  extensao?: number;      // faixa total; padrão: extensão atual do conjunto
  dentro?: NoRef;         // alternativa a extensao: usa a bbox deste nó como faixa
  centro?: number;        // padrão: centro atual do conjunto
  ordenar?: boolean;      // padrão true (ordena pela posição atual no eixo)
}) => NoRef[]

circular(nos: NoRef[], raio: number, opcoes?: {
  centro?: NoRef | [x,y,z];    // padrão: centro atual do conjunto
  plano?: "xz" | "xy" | "yz";  // padrão "xz" (chão)
  anguloInicial?: number;      // radianos, padrão 0
}) => NoRef[]

envelope(nos: NoRef[]) => AABB   // { min, max, centro, tamanho } dos nós juntos
```

`circular` espaça ângulos IGUAIS — serve para mesa redonda; numa mesa
retangular gera posições nas diagonais, não nos lados. Nesse caso, calcule
o offset manualmente (ver exemplo completo abaixo).

## Furo (`no.furar(...)`)

```ts
no.furar({
  face: FaceEntrada;
  forma:
    | { tipo: "circulo"; raio: number; segmentos?: number }
    | { tipo: "retangulo"; largura: number; altura: number }
    | { tipo: "poligono"; pontos: [u,v][] };   // pontos relativos ao CENTRO DO FURO
  u: number;                 // posição do furo no plano da face
  v: number;
  profundidade?: number;     // omitido = passante
}) => NoRef   // this, encadeável
```

Só funciona em geometria extrudável (`box`, `extrude`, `cylinder` com
`raioTopo === raioBase`, `lathe` fechado no eixo certo). Falha **alto** (lança
erro, não corta silenciosamente) se: nó não-extrudável, furos em faces de
normais diferentes no mesmo nó, furo maior que a peça, furo cujo volume
atravessa outro nó. Nunca use furo para simular CSG arbitrário — não existe.

## Serialização

```ts
cena.toJSON() => { version: 1, unidade: "m", eixoCima: "y", raiz: No }
Cena.deJSON(json) => Cena
```

## Diagnóstico (não precisa de render)

```ts
cena.avisos() => Aviso[]          // { tipo, texto, ... } estruturado
cena.avisosTexto() => string      // mesmo conteúdo, em texto
cena.descrever() => string        // a cena inteira em prosa (relações + avisos)
```

São sempre **avisos**, nunca erro/exceção: interpenetração pode ser
deliberada, a lib não julga. Quatro tipos: `interpenetracao`, `flutuando`,
`centros-coincidentes`, `acoplamento-violado` (ver seção seguinte).

## Acoplamentos (`contato`/`pivo`) — relação declarada, conferida sob demanda

Uma relação entre duas FACES de dois nós, guardada na cena e serializada —
não um cálculo feito uma vez na criação. Serve para juntas/articulações e
peças assentadas que continuam se movendo depois (`girar()`,
`deslocarMundo()`): declare a relação e reconfira em qualquer pose, em vez
de reimplementar a checagem à mão toda vez.

```ts
cena.acoplar({
  tipo: "contato" | "pivo";
  nome?: string;                                   // só rótulo, não precisa ser único
  a: { no: NoRef | string; face: FaceEntrada };
  b: { no: NoRef | string; face: FaceEntrada };
}) => AcoplamentoRef   // { id, tipo, nome }

cena.acoplamentos() => readonly Acoplamento[]
cena.desacoplar(ref: AcoplamentoRef | string) => void

cena.conferirMontagem(opcoes?: { tolerancia?: number }) => {
  passou: boolean;
  tolerancia: number;               // padrão 1e-6, mesma unidade p/ metros E radianos
  erros: Array<{
    id: string; tipo: "contato" | "pivo"; nome?: string; nos: [string, string];
    erroPosicao: number; erroAngulo: number; passou: boolean;
  }>;
  piorCaso: (typeof erros)[number] | null;
}
```

- **`contato`**: as duas faces no mesmo plano, normais opostas — uma peça
  assentada sobre a outra. `erroPosicao` = distância ao longo da normal.
- **`pivo`**: os CENTROS coincidem (não só o plano), normais opostas — o
  eixo de giro é a normal compartilhada. `erroPosicao` = distância entre
  centros.
- `erroPosicao` (metros) e `erroAngulo` (radianos, desvio das normais em
  relação a exatamente opostas) sempre vêm **separados**, por acoplamento e
  no pior caso.
- **Só confere, nunca posiciona** — quem posiciona continua sendo
  `face().colocar()`/layout/fórmula, como em qualquer outra peça. Se
  `conferirMontagem()` falhar, o bug está em como a peça foi movida/girada
  depois de criada, não no acoplamento.
- Um par acoplado deixa de contar como `interpenetracao`/`flutuando` no
  linter (a relação já é a declaração de que aquilo é intencional), e ganha
  o aviso `acoplamento-violado` se deixar de valer na pose atual.
- `remover()` descarta em cascata qualquer acoplamento que referencie o nó
  removido (ou um descendente dele) — não sobra referência órfã.
- Exemplo real completo: `examples/web/robo_frc.ts` — pivôs em toda junta
  (swerve, punho, garra, intake) e contatos em toda peça aparafusada,
  conferidos numa varredura de dezenas de poses.

## Os dois jeitos de posicionar — em ordem de preferência

1. **Relação com uma peça que já existe** → `face().colocar()` /
   `colocarSobre` / `encostar` / `circular` / `alinhar` / `distribuir` /
   `grade`. Sempre que a frase que descreve a peça tem "em cima de", "na
   face de", "ao redor de", "encostado em", use a função — não tem número em
   metros para calcular.
2. **Peça nova cuja posição vem de uma fórmula** (ângulo, empilhamento com
   gap) → `transform.posicao`/`rotacao` explícitos, mas **calculados no
   código**, nunca um valor cravado que "funcionou no viewer". Dois padrões
   prontos:

   ```ts
   // peça que pivota numa ponta e aponta num ângulo `a` (0 = norte/-z, horário)
   const x = Math.sin(a) * (comprimento / 2);
   const z = -Math.cos(a) * (comprimento / 2);
   // posicao: [x, y, z], rotacao: [0, a, 0], comprimento no eixo `profundidade`

   // pilha com gap fixo (ex.: vista explodida)
   let cursor = 0;
   const empilhar = (altura: number) => {
     const centro = cursor + altura / 2;
     cursor += altura + GAP;
     return centro;
   };
   ```

## Exemplo mínimo, completo, comentado

```ts
import { Cena, circular } from "@snaple/core";

export function montarCena(): Cena {
  const cena = new Cena();

  // única coordenada de mundo cravada da cena inteira: a altura do tampo
  const tampo = cena.criar(
    "box",
    { largura: 1.8, altura: 0.06, profundidade: 1.0 },
    { nome: "mesa", transform: { posicao: [0, 0.72, 0] }, material: { cor: "#8b5a2b" } },
  );

  // 4 pernas numa grade 2×2 na face de baixo, 12cm recuadas da borda
  const pernas = [0, 1, 2, 3].map(() =>
    cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.04, altura: 0.69 }, { nome: "perna" }),
  );
  tampo.face("base").grade(pernas, 2, 2, { gapEntre: 0.12 });

  // xícara em cima da mesa, sem calcular a altura de contato
  const xicara = cena.criar(
    "cylinder",
    { raioTopo: 0.04, raioBase: 0.03, altura: 0.09 },
    { nome: "xícara", material: { cor: "#eee" } },
  );
  tampo.face("topo").colocar(xicara, { u: -0.45, v: 0.1 });

  return cena;
}
```

## Coisas para NUNCA fazer

- Furo não-circular/retangular/poligonal, ou tentar simular subtração de
  sólidos arbitrária: **CSG não existe** nesta lib.
- Girar em graus. É sempre radianos (`Math.PI`, `Math.PI / 2`, ...).
- Usar `bbox()` quando a intenção é "só a geometria deste nó" — isso é
  `bboxPropria()`. Confundir os dois é o erro mais comum de layout.
- Cravar uma coordenada de mundo em vez de usar relação/fórmula (ver seção
  acima) — sem poder rodar o linter, esse é o erro que mais passa
  despercebido.
- Materiais com campo de Three.js (`emissive`, `map`, etc.) — o `Material`
  daqui é neutro, só os cinco campos listados acima existem.
