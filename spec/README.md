# Formato de cena snaple — v1 (normativo)

Este diretório é o **contrato** entre o core e qualquer backend de render.
Junto com `cena.schema.json`, é o suficiente para escrever um backend novo sem
ler uma linha do código do core.

## Convenções globais

| | |
|---|---|
| Unidade | **metros**, em todo lugar, sem exceção |
| Eixo vertical | **+y** (Y-up), sistema **destro** |
| Cardeais | `+x` leste · `-x` oeste · `+z` sul · `-z` norte |
| Rotação | Euler **XYZ intrínseca**, em **radianos** |
| Ordem da transform | escala → rotação → translação, relativa ao nó pai |
| Malha | **nunca** aparece no documento. Só parâmetros. |

Um backend Z-up converte na própria fronteira. A convenção acima não muda e
não é negociável por backend — é isso que faz o mesmo JSON render igual em
dois motores diferentes.

## Invariante de centragem

**Toda geometria paramétrica é centrada na própria origem local.** Uma caixa
de 2 × 1 × 4 ocupa `[-1, 1] × [-0.5, 0.5] × [-2, 2]` no espaço local; um cone
tem a base em `-altura/2` e o ápice em `+altura/2`; um perfil de `extrude` é
recentrado na sua própria bounding box antes de ser extrudado.

Isso não é detalhe de implementação, é parte do contrato. Como rotacionar um
conjunto de pontos simétrico em torno da origem preserva a simetria
(`R(-v) = -R(v)`), o centro da AABB mundial de um nó sem filhos coincide
sempre com a origem local levada para o mundo — qualquer que seja a rotação.
Um backend que centre diferente (base em `y=0`, por exemplo) vai desenhar a
cena deslocada em relação ao layout que o core calculou.

## Tipos de nó

### Geometria paramétrica

| tipo | params | forma |
|---|---|---|
| `box` | `largura`(x), `altura`(y), `profundidade`(z) | caixa |
| `sphere` | `raio`, `segmentos?` | esfera |
| `cylinder` | `raioTopo`, `raioBase`, `altura`, `segmentos?` | eixo em +y; raios iguais = cilindro reto, diferentes = tronco de cone |
| `cone` | `raio`, `altura`, `segmentos?` | base em -y, ápice em +y |
| `plane` | `largura`(x), `profundidade`(z) | superfície no plano XZ, normal +y, **espessura zero** |
| `torus` | `raio`, `raioTubo`, `segmentos?`, `segmentosTubo?` | anel no plano XZ, eixo em +y |
| `extrude` | `perfil` (`[x, z]`), `altura`, `recentrar?` | perfil fechado no plano XZ, extrudado em +y |
| `lathe` | `perfil` (`[raio, altura]`), `segmentos?`, `recentrar?` | perfil revolucionado em torno de +y — `recentrar: false` preserva as alturas do perfil como estão, simétrico ao `recentrar` de `extrude` (ver seção do `extrude` acima) mas no eixo da revolução em vez do plano da base |
| `helix` | `raio`, `raioTubo`, `passo`, `voltas`, `segmentosPorVolta?`, `segmentosTubo?` | tubo de seção circular varrendo um caminho helicoidal em torno de +y |

### `recentrar` em `extrude`

Por padrão (`recentrar` ausente ou `true`), o perfil de `extrude` é recentrado
na própria bounding box antes de ser extrudado — é a invariante de centragem
acima. `recentrar: false` usa as coordenadas do perfil **como declaradas**,
sem deslocar: o nó nasce com a origem local onde o perfil a colocou, não no
centro da peça. É uma exceção deliberada à invariante, para perfis desenhados
num sistema de coordenadas próprio (por exemplo, várias peças com um ponto de
referência comum que precisa continuar sendo a origem de cada nó). O eixo de
extrusão (`y`) continua **sempre** centrado — `recentrar` só afeta o plano
`(x, z)` do perfil. Consequência para bbox: com `recentrar: false`, a caixa
local do nó pode não ter `min = -max` (deixa de ser simétrica em torno da
origem), mas continua sendo a caixa real e exata da geometria.

### `helix`

```json
{ "tipo": "helix", "params": { "raio": 0.02, "raioTubo": 0.003, "passo": 0.01, "voltas": 6 } }
```

Um tubo de seção circular (raio `raioTubo`) varrendo um caminho helicoidal de
raio `raio` em torno do eixo `+y` local, já centrado: `y` vai de
`-passo·voltas/2` a `+passo·voltas/2`, mesma convenção de `cylinder`/`lathe`.
`passo` é a distância percorrida em `y` por volta completa; `voltas` pode ser
fracionário. Casos de uso: mola, rosca de parafuso, cabo espiralado.

A bbox é **analítica**, sem depender de malha:

- no plano `(x, z)`: `raio + raioTubo` (a trajetória fica a `raio` fixo do
  eixo; o tubo soma no máximo `raioTubo` a partir daquele ponto);
- em `y`: `passo·voltas / 2 + raioTubo` de meia-altura. O termo `+ raioTubo`
  não é cosmético — as duas pontas do tubo são **abertas** (não é um anel
  fechado), e a "tampa" de cada ponta é um círculo perpendicular à
  **tangente** da hélice, não ao eixo `y`. No limite de passo raso (quase um
  anel achatado — o caso de uma mola com voltas de passo curto), essa tampa
  pode avançar em `y` até quase `raioTubo` inteiro além do que a trajetória
  sozinha cobriria. Sem essa margem, a bbox declarada mentiria (a malha real
  poderia sair da caixa que o layout usou) — o resto do formato depende de a
  bbox nunca mentir, então a margem é normativa, não um detalhe do backend de
  referência.

Um backend constrói a malha varrendo um tubo de seção circular ao longo da
mesma curva usada para a bbox (por exemplo `TubeGeometry` sobre uma `Curve`
paramétrica, no Three.js). `helix` não aceita furo: não é a extrusão de um
perfil 2D num só eixo (mesma família de `sphere`/`cone`/`torus`/`lathe` na
tabela de limites abaixo).

`helix` é o primeiro caso de **varredura ao longo de um caminho** que o
formato suporta — hoje só um caminho helicoidal fixo, com forma fechada. Um
`sweep` genérico (perfil 2D arbitrário varrendo uma curva arbitrária) é a
extensão natural futura; quando existir, `helix` deve poder ser reexpresso
como um caso particular dele, sem quebrar este contrato.

### `model` — objeto por referência

```json
{ "tipo": "model", "params": { "src": "assets/cadeira.glb", "tamanho": [0.45, 0.9, 0.5] } }
```

`tamanho` é a bounding box **declarada**, e é o que o layout usa — **sem
carregar o arquivo**, exatamente como `width`/`height` num `<img>`. Um backend:

1. carrega `src`;
2. se falhar ou o arquivo não existir, desenha uma **caixa proxy** com
   `tamanho`;
3. se carregar e a bbox real divergir de `tamanho` além de uma tolerância,
   **avisa e não corrige**. Reescalar em silêncio faria a cena calculada e a
   cena desenhada discordarem; previsibilidade de layout vem primeiro.

Nós `model` **não aceitam features** — o schema proíbe. Não há parâmetros a
regerar numa malha importada.

### Containers

`grupo` não posiciona nada. `row` (eixo X), `column` (eixo Y) e `stack`
(eixo Z) posicionam os filhos com semântica de flexbox e **sobrescrevem** a
posição deles no eixo principal e nos dois eixos cruzados.

Um backend **não precisa implementar layout**: o core já resolve os
containers e grava as posições resultantes em `transform.posicao` antes de
serializar. Para o backend, um container é só um nó sem geometria.

### `junta` — rotação como pose, não como transform

```json
{ "tipo": "junta", "params": { "eixo": "y", "angulo": 0.35, "limites": [-1.2, 1.2] } }
```

Sem geometria própria, como `grupo` — mas a ROTAÇÃO do nó em torno de
`eixo` vem de `params.angulo`, não de `transform.rotacao`. Um backend deve
**ignorar** `transform.rotacao` num nó `junta` e montar a matriz local com
uma rotação pura de `angulo` radianos em torno de `eixo` (os outros dois
eixos ficam em 0) — `transform.posicao`/`escala` continuam normais.

É a diferença entre "girar este nó" e "esta é uma articulação, e o ângulo
dela é `angulo`": mudar a pose de um braço vira **editar um parâmetro**
(`definirParams`), não recompor uma matriz de rotação à mão a cada
articulação da cadeia — útil em qualquer hierarquia de juntas encadeadas
(ombro → cotovelo → punho), onde cada uma está no referencial da anterior.

`limites` (`[mínimo, máximo]` em radianos) é só para o linter: `angulo` fora
do intervalo vira aviso `junta-fora-do-limite`, nunca bloqueio — a cena
continua válida e renderizável com a junta em qualquer ângulo.

## Faces

Toda face é derivada da AABB da geometria **própria** do nó (não da
subárvore), no espaço local dele — não no do mundo. A face é um plano 2D com
origem no centro do retângulo e eixos U/V:

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

| face | normal | U | V |
|---|---|---|---|
| `topo` | `+y` | `+x` | `+z` |
| `base` | `-y` | `+x` | `-z` |
| `leste` | `+x` | `+z` | `+y` |
| `oeste` | `-x` | `-z` | `+y` |
| `sul` | `+z` | `-x` | `+y` |
| `norte` | `-z` | `+x` | `+y` |

`u`/`v` são **sempre** coordenadas nesse plano local: girar o dono no mundo
gira o plano inteiro junto, mas não muda o que `u`/`v` significam para quem
chama — um furo ou uma colocação em `leste` com `u=0.05` corre ao longo do
`+z` **local** do dono, não do eixo X do mundo, mesmo que o dono esteja
girado. Verificado contra a implementação (não só descrito): colocar um
alvo em cada uma das seis faces de um cubo não rotacionado com
`{u: 0.02, v: 0}` desloca o centro do alvo, em relação ao centro do dono, ao
longo do eixo U de cada face (e da normal, pela distância de "encostar
exatamente") — nunca num eixo diferente do declarado na tabela acima; e
repetir `{u: 0.05, v: 0.03}` na face `leste` de um dono girado 90° em Y no
mundo desloca o alvo em `(0.05, 0.03, ...)` no mundo — ou seja, pelo `u`/`v`
**locais**, que a rotação levou para o eixo X do mundo, não pelos eixos do
mundo antes da rotação.

Os frames satisfazem `normal = V × U`, de modo que colocar um nó numa face
mapeia o `+x` local dele em U, o `+y` local em **normal** e o `+z` local em V
— uma rotação pura, sem espelhamento. Consequência prática para quem autora:
**o `+y` local do nó é o que aponta para fora da face**, então um nó que vai
numa parede é autorado deitado, com a espessura em `altura`.

Aliases `+y|-y|-z|+z|+x|-x` são aceitos na entrada e normalizados para o nome
longo antes de serializar.

## Superfícies de revolução — `lateral()` e `padraoCircular()`

`Face` (seção acima) é o plano de trabalho de uma superfície PLANA; `Lateral`
(`no.lateral()`) é o equivalente para a superfície CURVA de um `cylinder` ou
`lathe` — a única coisa "de fora" que muda é o nome dos eixos do plano:
`(u, v)` vira `(ângulo, altura)`, e "para fora" é a normal REAL da
superfície de revolução naquele ponto, não uma normal constante — radial num
cilindro reto, inclinada num tronco de cone, seguindo o perfil segmento a
segmento num `lathe` qualquer (a normal de cada segmento é perpendicular à
sua própria tangente `(Δraio, Δaltura)`, apontando para fora do eixo).

```ts
cilindro.lateral().colocar(parafuso, { angulo: Math.PI / 4, altura: 0.02 });
```

`ângulo` segue a mesma convenção do backend de referência (`x = raio·sin(
ângulo)`, `z = raio·cos(ângulo)`), para que o ponto calculado corresponda de
verdade a onde a malha renderizada está. `altura` é o eixo `+y` local do
dono — para `lathe`, já no referencial resolvido por `recentrar`. Um
`cylinder` é tratado como um `lathe` de 2 pontos internamente, então as duas
geometrias compartilham a mesma implementação.

`padraoCircular(dono, fabrica, n, { raio, eixo?, fase? })` distribui `n` nós
(criados por `fabrica(i)` como filhos de `dono`) em círculo no plano
perpendicular a `eixo` (padrão `y`), no referencial LOCAL de `dono` — não no
mundo, diferente de `circular()` em `layout.ts`. Serve para estrias,
parafusos em círculo, marcadores de mostrador: o padrão manual de
`for (i) { const a = i/n*TAU; ... }` que aparecia reimplementado à mão,
diferente a cada vez, em mais de um modelo autorado contra a lib.

## Features — furo paramétrico sem CSG

Um furo é **estado**, não uma operação destrutiva sobre malha:

```json
{ "tipo": "furo", "face": "topo",
  "forma": { "tipo": "circulo", "raio": 0.05, "segmentos": 64 },
  "u": 0.1, "v": -0.05, "profundidade": 0.04 }
```

`u`/`v` são coordenadas no plano da face, com origem no centro da face.
`profundidade` ausente = furo passante.

### Como um backend gera a geometria

O core monta a receita; o backend só executa. A receita (`GeometriaDerivada`)
para um nó furado é uma **extrusão** com esta forma:

```
{ tipo: "extrusao",
  eixo: "x" | "y" | "z",          // eixo local da extrusão (informativo)
  rotacao: [rx, ry, rz],          // Euler XYZ a aplicar na geometria pronta
  partes: [ { contorno, furos, altura, deslocamento }, ... ] }
```

Regras normativas:

1. Cada parte é uma extrusão independente. O `contorno` (anti-horário) e os
   `furos` (horários) vivem no **plano XY**, e a extrusão cresce em **+Z** —
   o referencial nativo de qualquer extrusor. `rotacao` leva esse referencial
   para o espaço local do nó.
2. Cada parte é centrada em `z = 0` e depois transladada por `deslocamento`
   ao longo do eixo de extrusão. Concretamente: `translate(0, 0, deslocamento
   - altura/2)` antes de aplicar `rotacao`.
3. `altura === 0` significa superfície sem espessura (um `plane` furado): o
   backend gera a face plana da forma, sem extrudar.
4. O sentido dos contornos já vem correto — o backend **não** deve inverter
   winding "por precaução".

Um furo de **profundidade parcial** chega como mais de uma parte: o core fatia
o eixo de extrusão nos pontos onde o conjunto de furos ativos muda, e cada
fatia vira uma extrusão própria (a fatia furada e a fatia maciça). É assim
que o furo parcial sai sem CSG. O backend desenha uma malha por parte.

### Limites — erro, nunca gambiarra

O core recusa, com erro explicando por quê:

| caso | motivo |
|---|---|
| furo em nó `model` | `malha-importada` — não há parâmetros a regerar |
| furo em `sphere`/`cone`/`torus`/`lathe`/`helix`/tronco de cone | `geometria-nao-extrudavel` |
| dois furos em faces de normais diferentes no mesmo nó | `faces-conflitantes` |
| furo cujo volume alcança outro nó da cena | `atravessa-outro-no` |
| furo maior que a peça | `furo-maior-que-o-no` |

Furo numa direção que não seja normal a nenhuma face é **irrepresentável por
construção**: o campo `face` só aceita os seis nomes (mais aliases), e o
schema recusa qualquer outro valor.

CSG é ponto de extensão futuro e **não** está implementado. Os casos acima são
justamente os que exigiriam CSG, e é por isso que falham alto em vez de
devolverem algo silenciosamente errado.

## Validação — contato intencional

O linter (`avisosDaCena`) é sempre AVISO, nunca bloqueio, mas por padrão
qualquer par de nós que não seja pai/filho e cujas geometrias se sobreponham
gera um aviso de `interpenetracao`. Um nó pode declarar `validacao.
contatoIntencional: string[]` — ids de outros nós com os quais a sobreposição
é esperada (um prego cravado numa tábua, uma rosca encaixada). A checagem
vale numa direção só: A listar B no seu `contatoIntencional` já basta, B não
precisa listar A de volta (mesma semântica de pai/filho em `saoParentes`).

Um contato coberto por essa lista não vira aviso de `interpenetracao` — vira
`contato-intencional` no array estruturado (`Cena.avisos()`), mas fica de
fora de `avisosTexto()`/`descrever()` como problema; `descrever()` só resume
quantos foram ignorados ("2 contatos intencionais ignorados"). Um backend que
só desenha a malha pode ignorar `validacao` inteiramente — o campo não afeta
geometria nem layout, só o linter.

A checagem de interpenetração em si compara as caixas **orientadas** dos dois
nós (a caixa local de cada um, rotacionada/escalada pela transform real, não
inflada para os eixos do mundo) — é o que evita o falso positivo de duas
peças giradas cujas AABBs se cruzam sem as caixas de verdade se tocarem. A
AABB de cada nó continua sendo calculada como fase ampla antes disso.

## Biblioteca de perfis e texto

Dois módulos utilitários que só produzem `Ponto2D[]`/nós comuns — não são
parte do formato de cena (nenhuma mudança de schema), só evitam reimplementar
as mesmas formas/o mesmo texto à mão em cada modelo:

- `perfis.ts`: `arco`, `estadio`, `gota`, `retanguloArredondado`,
  `poligonoRegular`, `elipse` — geradores puros de contorno 2D para
  `extrude`/`lathe`/furo poligonal. `arco` devolve `n+1` pontos (as duas
  pontas incluídas, pensado para concatenar em contornos compostos);
  `poligonoRegular`/`elipse` devolvem só `n` pontos (já fecham sozinhos).
- `texto.ts`: fonte vetorial própria (dígitos, A–Z, alguns símbolos, grade
  3×5) e `texto(pai, nome, txt, plano, opcoes)`, que grava cada caractere
  como caixas finas em relevo sobre um `Plano` (`origem`, `direita`, `cima`,
  `normal`). `planoDeFace(face, u, v)` e `planoDeLateral(lateral, ângulo,
  altura)` constroem esse `Plano` a partir de uma `Face` ou de um ponto de
  `Lateral` — o mesmo `texto()` grava tanto um rótulo plano quanto um texto
  ao redor de um cilindro.

Cada caractere é gravado como uma CADEIA pai→filho de caixas (uma por
traço), não como irmãs — é o que faz o linter (que ignora pares
ancestral/descendente) tratar os traços de uma letra como um conjunto só,
sem precisar de `permitirContato` traço a traço. Caracteres diferentes
continuam sendo nós independentes entre si.

## Versionamento

`version` é `1`. Um documento com outra versão deve ser **recusado**, não
interpretado na base do palpite. Mudanças compatíveis (novo tipo de nó, novo
campo opcional) não incrementam a versão; um backend deve ignorar campos que
não conheça em `material` e falhar alto num `tipo` de nó desconhecido.
