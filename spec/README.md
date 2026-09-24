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
recentrado na sua própria bounding box antes de ser extrudado. A única
exceção é `recentrar: false` em `extrude` e `lathe` (ver abaixo), em que a
caixa local pode ser assimétrica.

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
| `lathe` | `perfil` (`[raio, altura]`), `segmentos?`, `recentrar?` | perfil revolucionado em torno de +y — `recentrar: false` preserva as alturas do perfil como estão, simétrico ao `recentrar` de `extrude` (ver seção do `extrude` abaixo) mas no eixo da revolução em vez do plano da base |
| `helix` | `raio`, `raioTubo`, `passo`, `voltas`, `segmentosPorVolta?`, `segmentosTubo?` | tubo de seção circular varrendo um caminho helicoidal em torno de +y |
| `sweep` | `caminho`, `secao`, `suavizar?`, `raioCurva?`, `fechado?`, `cima?`, `segmentos?`, `recentrar?` | seção 2D varrendo um caminho 3D (ver abaixo) |

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

`helix` é o caso de varredura com forma fechada (caminho helicoidal). Para
um caminho qualquer, ver `sweep`.

### `sweep`

```json
{ "tipo": "sweep", "params": {
  "caminho": [[0, 0, 0], [0.5, 0, 0], [0.5, 0.4, 0]], "raioCurva": 0.08,
  "secao": { "tipo": "circulo", "raio": 0.0133, "espessura": 0.002 } } }
```

Uma seção 2D varrendo um caminho 3D (`caminho`, espaço local do nó). A
geometria é normativa, porque dela sai a bbox:

1. **Caminho.** Pontos consecutivos repetidos são descartados (e, com
   `fechado`, um último ponto igual ao primeiro).
   - Padrão: segmentos retos com **canto vivo**. Em cada junta, a seção dos
     dois lados é cortada no plano da bissetriz, de normal
     `normalizar(dEntra + dSai)` (meia-esquadria). Um caminho que volta sobre
     si mesmo (`dEntra + dSai ≈ 0`) é erro.
   - `raioCurva > 0`: cada canto vira um arco de raio `raioCurva` tangente
     aos dois segmentos, recuado `raioCurva · tan(θ/2)` do vértice (`θ` =
     ângulo de desvio). O arco é dividido em `ceil(segmentos · θ / (π/2))`
     partes. É erro se os recuos das duas pontas de um segmento somarem mais
     que o comprimento dele.
   - `suavizar: true`: Catmull-Rom **centrípeta** (α = 0,5) por todos os
     pontos, `segmentos` amostras por vão. Num caminho aberto, as pontas são
     estendidas por reflexão (`2·P0 − P1`). A tangente de cada amostra é a
     diferença central normalizada.
2. **Referencial.** No primeiro ponto, `v` = `cima` (padrão `[0, 1, 0]`)
   sem a componente na tangente `t`; se ficar degenerado, tenta `[0, 0, −1]`
   e depois `[1, 0, 0]`. `u = t × v`. Dali em diante, o referencial é
   **transportado** pela rotação mínima entre tangentes consecutivas (sem
   torção). Com `fechado`, a torção residual de volta ao início (não nula em
   caminho não plano) é distribuída por igual entre os anéis.
3. **Seção.** O ponto `(s, t)` vai para `ponto + s·u + t·v`. Nas juntas de
   canto vivo, o ponto desliza ao longo de `t` até o plano de corte.
   `circulo` (`segmentos` padrão 16, primeiro ponto em `s = raio`) e
   `retangulo` (`largura` em `s`, `altura` em `t`) são centrados;
   `espessura` os deixa ocos. `poligono` usa os pontos como estão.
4. **Bbox.** A caixa local é a dos vértices do contorno em todos os anéis
   (é exata). Com `recentrar` (padrão `true`), o caminho é deslocado para
   que o centro dessa caixa fique na origem local, como em `extrude`.
5. **Pontas.** Caminho aberto: as duas pontas são tampadas com a seção.
   Fechado: sem tampas.

Com params inválidos, a implementação de referência usa como bbox a caixa
dos pontos do caminho (o layout da cena não pode quebrar por um nó) e acusa o
erro ao derivar a geometria. `sweep` não aceita furo.

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

## Acoplamentos

O documento pode ter um campo `acoplamentos` na raiz (ausente = nenhum):
relações declaradas entre faces de dois nós, `contato` (faces coplanares,
normais opostas) ou `pivo` (centros coincidentes, normais opostas).

```json
{ "id": "acoplamento_1", "tipo": "pivo", "nome": "ombro",
  "a": { "no": "box_1", "face": "topo" }, "b": { "no": "box_2", "face": "base" } }
```

Acoplamentos são **verificados, nunca resolvidos**: não movem nada e não
afetam geometria nem layout. Um backend que só desenha a malha pode ignorar
o campo inteiro. `face` já vem normalizada (nome longo, sem alias).

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
| furo em `sphere`/`cone`/`torus`/`lathe`/`helix`/`sweep`/tronco de cone | `geometria-nao-extrudavel` |
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

## Aparência — textura e adesivo

`src` (em `material.textura` e em cada adesivo) é resolvido pelo backend,
como `model.src`. Imagem que não carrega é aviso, nunca erro: a peça sai com
a cor do material.

**UV canônico** (o que `material.textura` usa). Toda superfície vai de 0 a 1
em (u, v); `repetir` multiplica, `rotacao` gira em torno de (0,5; 0,5):

| tipo | mapeamento |
|---|---|
| `box`, `plane` | cada face de 0 a 1 |
| `cylinder`, `cone`, `lathe` | lateral: u ao redor (0 em `+z`, crescendo para `+x`), v de baixo para cima; tampas em disco |
| `sphere`, `torus`, `helix` | o mapeamento nativo da primitiva (u ao redor, v ao longo) |
| `extrude` | tampas: o perfil normalizado pela própria caixa 2D; paredes: u = posição ao longo do perímetro do laço (0 a 1), v ao longo da extrusão inteira (0 a 1, contínuo entre as fatias de um furo parcial) |
| `sweep` | paredes: u ao longo do perímetro da seção, v ao longo do comprimento do caminho; tampas: a seção normalizada pela própria caixa 2D. A costura repete o primeiro ponto com u = 1 (e v = 1 em caminho fechado): a textura não volta para trás |

**Adesivo** (`no.adesivos[]`). A película é um recorte da superfície,
afastado `0,1 mm` para fora ao longo da normal, com a imagem de 0 a 1 nele:

- face plana: retângulo `largura × altura` centrado em `(u, v)` do
  referencial da face (o mesmo de `furar`). Topo da imagem = `+y` nas faces
  verticais, `−z` em `topo`/`base`; direita = `topo × normal` (legível de
  fora); `rotacao` gira os dois eixos em torno da normal. Padrão: a face
  inteira. Faces planas: `box` (todas), `plane`/`extrude`/`cylinder`
  (`topo`/`base`), `cone` (`base`);
- `lateral` (`cylinder`, `cone`, `lathe`): o perfil de revolução recortado
  na faixa `v ± altura/2` (entre as passagens do perfil por essa faixa, a de
  maior raio médio: a parede de fora de uma peça oca), varrido pelo ângulo
  `u ± (largura / raio em v) / 2`. A imagem cresce com o ângulo (direita) e
  ao longo do comprimento do perfil (cima).

Adesivo não entra em bbox, layout nem linter.

## Animação

`CenaJSON.animacoes[]`: cada animação tem `nome` único, `duracao` (padrão:
último quadro), `repetir` (`nao` | `sempre` | `vaivem`) e faixas. Cada
faixa anima uma propriedade de um nó por quadros `{ t, valor }` em ordem
estritamente crescente de `t`. A cena gravada é a **pose de repouso**.

Valor de uma faixa no instante `t` (dentro do ciclo):

1. antes do primeiro quadro, o primeiro; depois do último, o último;
2. entre os quadros `a` e `b`: `s = (t − a.t) / (b.t − a.t)`; `suave` usa
   `s² (3 − 2s)`; `degrau` fica com `a.valor`;
3. mistura: números e vetores linearmente; `cor` por canal RGB (0–255,
   arredondado); `rotacao` por **slerp** entre os quatérnios dos Euler XYZ
   dos dois quadros, pelo menor arco;
4. `relativo`: `posicao`/`angulo` somam à pose de repouso, `escala`
   multiplica, `rotacao` compõe no referencial do nó (`q = q_repouso ·
   q_quadro`). Não vale para `opacidade`/`cor`.

Tempo de reprodução → ciclo: `nao` prende em `[0, duracao]`; `sempre` usa
`t mod duracao`; `vaivem` usa `t mod 2·duracao`, espelhado na segunda metade.

`angulo` só existe em `junta`, e é por ele que uma peça gira mais de meia
volta: interpola o número, não a orientação.

## Versionamento

`version` é `1`. Um documento com outra versão deve ser **recusado**, não
interpretado na base do palpite. Mudanças compatíveis (novo tipo de nó, novo
campo opcional) não incrementam a versão; um backend deve ignorar campos que
não conheça em `material` e falhar alto num `tipo` de nó desconhecido.
