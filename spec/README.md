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
| `extrude` | `perfil` (`[x, z]`), `altura` | perfil fechado no plano XZ, extrudado em +y |
| `lathe` | `perfil` (`[raio, altura]`), `segmentos?` | perfil revolucionado em torno de +y |

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

## Faces

Toda face é derivada da AABB da geometria **própria** do nó (não da
subárvore), no espaço local dele. A face é um plano 2D com origem no centro
do retângulo e eixos U/V:

| face | normal | U | V |
|---|---|---|---|
| `topo` | `+y` | `+x` | `+z` |
| `base` | `-y` | `+x` | `-z` |
| `leste` | `+x` | `+z` | `+y` |
| `oeste` | `-x` | `-z` | `+y` |
| `sul` | `+z` | `-x` | `+y` |
| `norte` | `-z` | `+x` | `+y` |

Os frames satisfazem `normal = V × U`, de modo que colocar um nó numa face
mapeia o `+x` local dele em U, o `+y` local em **normal** e o `+z` local em V
— uma rotação pura, sem espelhamento. Consequência prática para quem autora:
**o `+y` local do nó é o que aponta para fora da face**, então um nó que vai
numa parede é autorado deitado, com a espessura em `altura`.

Aliases `+y|-y|-z|+z|+x|-x` são aceitos na entrada e normalizados para o nome
longo antes de serializar.

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
| furo em `sphere`/`cone`/`torus`/`lathe`/tronco de cone | `geometria-nao-extrudavel` |
| dois furos em faces de normais diferentes no mesmo nó | `faces-conflitantes` |
| furo cujo volume alcança outro nó da cena | `atravessa-outro-no` |
| furo maior que a peça | `furo-maior-que-o-no` |

Furo numa direção que não seja normal a nenhuma face é **irrepresentável por
construção**: o campo `face` só aceita os seis nomes (mais aliases), e o
schema recusa qualquer outro valor.

CSG é ponto de extensão futuro e **não** está implementado. Os casos acima são
justamente os que exigiriam CSG, e é por isso que falham alto em vez de
devolverem algo silenciosamente errado.

## Versionamento

`version` é `1`. Um documento com outra versão deve ser **recusado**, não
interpretado na base do palpite. Mudanças compatíveis (novo tipo de nó, novo
campo opcional) não incrementam a versão; um backend deve ignorar campos que
não conheça em `material` e falhar alto num `tipo` de nó desconhecido.
