# @snaple/ifc

Backend IFC para `@snaple/core`: consome o JSON de uma cena snaple e produz
um arquivo `.ifc` (STEP/SPF, ISO 10303-21) importável em Revit, ArchiCAD,
Solibri, BlenderBIM e qualquer outra ferramenta BIM que leia IFC4.

```bash
npm install @snaple/ifc
```

```ts
import { Cena } from "@snaple/core";
import { exportarIFC } from "@snaple/ifc";
import { writeFileSync } from "node:fs";

const cena = new Cena();
cena.criar("box", { largura: 1.8, altura: 0.06, profundidade: 1 }, { nome: "mesa" });

writeFileSync("cena.ifc", exportarIFC(cena, { nomeProjeto: "Sala de jantar" }));
```

`exportarIFC` é **síncrona** e não faz I/O: ao contrário de `@snaple/three`,
nenhum nó desta lib precisa carregar arquivo (um `model` sem malha
embutível vira caixa proxy, não uma tentativa de abrir `src`). Mesma regra
de dependência do resto do projeto (ver `AGENTS.md` da raiz): não importa
nada de render nem de DOM, roda em Node puro, e a conversão de eixo/unidade
acontece só na fronteira deste pacote.

## Por que IFC4 (não IFC2x3)

O enunciado pediu para avaliar as duas. Fomos com **IFC4** por três razões
concretas, não só "é mais novo":

1. **`OwnerHistory` é opcional em IFC4** e obrigatório em IFC2x3. Isso é
   mais que estético: `IfcOwnerHistory` exige `IfcPersonAndOrganization` +
   `IfcApplication`, ou seja, inventar uma pessoa/aplicação/organização
   fictícia só para preencher um atributo que nenhuma ferramenta BIM
   realmente usa para geometria. IFC4 deixa isso de fora sem violar o
   schema — um arquivo menor e mais honesto sobre o que ele de fato sabe.
2. **`IfcArbitraryProfileDefWithVoids`** (perfil de extrusão com buracos —
   como este exportador representa furo, ver item 4 abaixo) já existe desde
   o IFC2x3, mas o restante do modelo de perfis/CSG usado aqui
   (`IfcEllipseProfileDef`, `IfcCsgSolid` moderno) é mais consistente e
   melhor documentado em IFC4.
3. **É o schema que o enunciado pede como alvo.** IFC2x3 continua sendo o
   "mínimo denominador comum" aceito por mais ferramentas legadas — se um
   fluxo de trabalho específico exigir IFC2x3, é uma flag a mais neste
   pacote no futuro (`schema` já é um valor isolado em `spf.ts`), não uma
   razão para não entregar IFC4 agora.

`FILE_SCHEMA(('IFC4'))` no cabeçalho.

## Escrever SPF direto, sem biblioteca IFC de terceiros

Avaliado: `web-ifc` (parser/writer wasm, mantido pela comunidade IFC.js) e
bindings de `ifcopenshell` para Node (não existem prontos — `ifcopenshell`
é Python/C++; usar exigiria um processo Python à parte ou compilar bindings
próprios).

Decisão: escrever o texto STEP diretamente (`src/spf.ts`). Motivo: **o
formato de saída é texto estruturado simples** — uma linha por entidade,
`#N=TIPO(atributos);` — e o volume de entidades que este exportador precisa
emitir é pequeno e bem definido (perfis, sólidos, placements, um punhado de
entidades de material). Escrever a mão evita:

- Puxar um binário wasm (`web-ifc`) só para SERIALIZAR texto — não estamos
  fazendo parsing nem geometria booleana de verdade, onde uma biblioteca
  madura valeria a complexidade.
- Uma dependência de build/runtime pesada num pacote cujo "core" é, na
  prática, um formatador de atributos e um contador de `#N` — o mesmo
  raciocínio de "sem dependência pesada por conveniência" que já vale para
  o resto do projeto.

O preço dessa escolha é que a responsabilidade de "esse atributo é REAL,
INTEGER ou DERIVADO" fica com quem escreve os construtores de entidade
(`src/entidades.ts`) em vez de vir de um schema carregado em runtime — é
exatamente por isso que a seção **Validação** abaixo não é opcional, é o
que pegou os dois bugs reais descritos lá.

## Hierarquia: achatada, elementos com placement absoluto

IFC exige uma cadeia `IfcProject → IfcSite → IfcBuilding →
IfcBuildingStorey`, que a árvore do snaple não tem. Este exportador gera
essa cadeia mínima **uma vez por cena** (`"Terreno"` / `"Edifício"` /
`"Térreo"`) e coloca **todo** nó geométrico como elemento direto dessa
única storey — não tenta reproduzir pai/filho do snaple como
`IfcLocalPlacement`s aninhados.

Duas razões (documentadas com mais detalhe no topo de `src/mapear.ts`):

1. **Escala não existe em `IfcLocalPlacement`** — é posição + rotação, sem
   fator de escala. Um `row`/`grupo` escalado no snaple escala a subárvore
   inteira; reconstruir isso como composição de placements aninhados
   exigiria decompor escala em cada nível e reaplicá-la na geometria dos
   descendentes — exatamente o que `cena.mundo()` já faz. Usar o resultado
   pronto (`NoMundo.matriz`, já a matriz de mundo Y-up resolvida pelo core)
   e converter para Z-up uma vez por nó é mais simples E mais correto do
   que recompor a mesma conta.
2. **Containers não têm elemento** de qualquer forma
   (`cena.nosGeometricos()` já os exclui — `grupo`/`row`/`column`/`stack`/
   `junta` não têm geometria própria). Uma hierarquia de placements
   aninhados só faria sentido para agrupar elementos que existem; achatado
   não perde nenhuma posição, porque o placement absoluto de cada elemento
   já reflete a cadeia de transforms inteira que ele tinha no snaple.

Isso é IFC válido — é como muitos exportadores de ferramentas paramétricas
saem na prática (elementos soltos, placement absoluto, uma storey). O que
se perde é a semântica de agrupamento ("estas 4 peças eram uma cadeira");
nenhuma ferramenta BIM usa isso para geometria/posição, só apareceria em
software feito para ler agrupamento do snaple especificamente, que não
existe fora deste repositório.

## Nós → entidades IFC: tipo semântico opcional, fora do core

Por padrão todo nó geométrico vira `IfcBuildingElementProxy` — o tipo
neutro do IFC para geometria sem semântica BIM declarada. `exportarIFC`
aceita `tipoIfcPorNo` para quem quiser um tipo mais específico:

```ts
const mesa = cena.criar("box", { largura: 1.8, altura: 0.06, profundidade: 1 });
exportarIFC(cena, { tipoIfcPorNo: { [mesa.id]: "IfcFurniture" } });
```

**Decisão de design deliberada:** o core **não** ganhou um campo `ifcTipo`
em `No`. O enunciado pergunta se vale a pena — a resposta é "o metadado é
útil, mas não pode morar no core": `AGENTS.md` da raiz é explícito que
"nenhum conceito de IFC pode vazar" para `packages/core`, e um campo
chamado `ifcTipo` com um valor do tipo `"IfcFurniture"` é exatamente esse
vazamento, mesmo optional. Em vez disso, o mapeamento id→tipo é passado
**de fora**, como opção de `exportarIFC` — o core continua sem saber que
IFC existe, e quem monta a cena decide a semântica BIM só na hora de
exportar (ou nem decide, e todo mundo vira proxy).

Tipos aceitos (compartilham o mesmo template de atributos no IFC4 —
`GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement,
Representation, Tag, PredefinedType`, ver `elementoBIM` em
`src/entidades.ts`): `IfcBuildingElementProxy` (padrão), `IfcFurniture`,
`IfcColumn`, `IfcBeam`, `IfcMember`, `IfcPlate`, `IfcRailing`, `IfcWall`,
`IfcSlab`, `IfcCovering`, `IfcFooting`. `IfcDoor`/`IfcWindow`/`IfcStair`
ficaram de fora de propósito: no IFC4 eles têm atributos extras
(`OverallHeight`/`OverallWidth` antes de `PredefinedType`) que quebrariam o
template genérico — dar suporte a eles é extensão futura, não uma
adivinhação de atributo aqui.

`no.nome` (campo genérico do core, não específico de IFC) vira `Name` do
elemento; `no.id` vira `Tag` — o que permite re-identificar o elemento numa
reimportação sem depender só do GUID.

## Geometria paramétrica → representação IFC

| tipo snaple | entidade IFC | exato? |
|---|---|---|
| `box` | `IfcExtrudedAreaSolid` + `IfcRectangleProfileDef` | sim |
| `cylinder` (raioTopo≈raioBase) | `IfcExtrudedAreaSolid` + `IfcCircleProfileDef` (ou `IfcEllipseProfileDef` se a escala XZ for não-uniforme) | sim |
| `cylinder` (tronco de cone) | `IfcFacetedBrep` (tesselado) | não — sem entidade IFC para seção variável |
| `cone` | `IfcRevolvedAreaSolid` de um perfil triangular (ver nota abaixo) | sim, se a escala XZ for uniforme |
| `sphere` | `IfcCsgSolid(IfcSphere)` | sim, se a escala for uniforme nos 3 eixos |
| `plane` | `IfcFacetedBrep` (2 triângulos) | tesselado, mas exato (é literalmente um retângulo) |
| `torus` | `IfcFacetedBrep` (grade toroidal) | não — sem primitiva de toro em IFC4 |
| `extrude` (com ou sem furo) | `IfcExtrudedAreaSolid` + `IfcArbitraryClosedProfileDef`/`WithVoids` | sim |
| `lathe` | `IfcRevolvedAreaSolid` | sim, se a escala XZ for uniforme |
| `helix` | `IfcFacetedBrep` (tubo tesselado) | não — sem primitiva de hélice |
| `sweep` | `IfcFacetedBrep` (mesma costura de anéis do backend Three.js, portada para TS puro) | não |
| `model` | `IfcExtrudedAreaSolid` retangular do `tamanho` declarado + aviso | proxy — sem malha para embutir |

**`cone` não usa `IfcCsgSolid(IfcRightCircularCone)`, mesmo sendo
geometricamente equivalente e válido no schema.** Isso não foi decidido na
teoria: rodando o motor de geometria do `ifcopenshell` (não só o validador
de schema — ver seção **Validação**) contra um cone gerado assim, a
triangulação do `IfcProduct` falha (`Failed to process shape`), mesmo com
`ObjectPlacement` IDENTIDADE, sem nenhuma rotação envolvida. Reproduzido
isolado antes de decidir a representação final: `IfcCsgSolid` triangula bem
sozinho, mas o mesmo sólido dentro de um `IfcProduct` completo falha no
kernel OpenCASCADE do `ifcopenshell`. `IfcSphere` (mesma família CSG) NÃO
tem esse problema — testado e confirmado end-to-end antes de manter a
escolha. Em vez de arriscar essa mesma fragilidade para `cone`, ele é
modelado como a revolução de um perfil triangular (ápice + base) em torno
do eixo `y` — a mesma família de sólido (`IfcRevolvedAreaSolid`,
`SweptAreaSolid`) que `lathe` já usa, comprovadamente mais madura em
qualquer motor de geometria IFC.

Toda a extrusão (linha 1, 2ª linha, `extrude`) reaproveita **o mesmo
contrato que `@snaple/three` já consome** (`GeometriaExtrusao.rotacao` do
core, ver `packages/core/src/geometria.ts`): o perfil sai no referencial
nativo de um extrusor (plano XY, extrusão em +Z), e a mesma rotação Euler
que o backend Three.js aplica à malha depois de construí-la é aplicada
aqui ao `Position`/`ExtrudedDirection` do `IfcExtrudedAreaSolid` — é
reaproveitar uma peça do contrato core→backend já testada, não inventar
uma segunda convenção de eixo de extrusão.

Escala não-uniforme é aplicada exatamente sempre que a malha é tesselada
(escala componente a componente num vértice não perde precisão nunca); nos
sólidos paramétricos exatos, ela só se mantém exata quando cai dentro do
grupo de simetria da forma (radial uniforme para `cylinder`/`cone`/lathe`,
3 eixos uniformes para `sphere`) — fora disso, o exportador cai para
tesselado em vez de desenhar uma forma circular/esférica errada.

## Furo paramétrico: `IfcArbitraryProfileDefWithVoids`, não booleano

Avaliado (item 4 do enunciado): `IfcBooleanClippingResult`/
`IfcBooleanResult` com `IfcHalfSpaceSolid`, ou tesselar o resultado já
furado.

Decisão: nenhum dos dois. Um furo numa geometria extrudável (`box`,
`cylinder` reto, `plane`, `extrude`) vira um **buraco no perfil 2D antes da
extrusão** — `IfcArbitraryProfileDefWithVoids` (`OuterCurve` +
`InnerCurves`, todos `IfcPolyline` fechada). É exatamente a mesma filosofia
que o resto do projeto já usa para furo (`packages/core/src/geometria.ts`:
"furo é sempre regerar geometria paramétrica, nunca cortar malha" — ver
`AGENTS.md`): o buraco entra no PERFIL, a extrusão é regerada, nunca há uma
operação booleana entre dois sólidos. Isso também é mais compatível — uma
extrusão com void é o caminho de sólidos mais suportado do IFC, enquanto
`IfcBooleanResult`/`IfcHalfSpaceSolid` tem suporte mais desigual entre
ferramentas (e, como a seção de `cone` acima mostra, "válido no schema" e
"o motor de geometria processa direito" nem sempre são a mesma coisa —
então evitar o caminho menos maduro sem necessidade é a escolha certa).

Furo de profundidade PARCIAL (o core já fatia o eixo nos pontos onde o
conjunto de furos ativos muda, ver `ParteExtrusao` no core) vira **mais de
um `IfcExtrudedAreaSolid`** dentro do mesmo `IfcShapeRepresentation` — uma
fatia por trecho, mesma ideia que `@snaple/three` usa (lá, mais de um
`THREE.Mesh` agrupados; aqui, mais de um item de representação no mesmo
elemento).

**Simplificação registrada:** um `plane` furado (espessura zero) não tem
uma extrusão de verdade para carregar o void — em vez de escrever um
triangulador de polígono-com-buracos só para este caso raro, ele sai como
uma placa de **0,1 mm** de espessura (reaproveitando o mesmo caminho de
extrusão-com-voids). Documentado aqui e no comentário de
`criarParteExtrudida` (`src/geometria.ts`) — não é um comportamento
escondido.

## Unidades e eixo — a conversão mora só na fronteira

snaple é **Y-up, metros**; IFC é convencionalmente **Z-up**, com unidade
declarada em `IfcUnitAssignment` (`IFCSIUNIT(...,.METRE.)` aqui). A
conversão é a rotação própria (determinante +1, sem espelhar nada)
`(x, y, z) → (x, -z, y)` (`src/eixo.ts`) — o que era "para cima" continua
"para cima", só troca de eixo.

Ela acontece **numa única fronteira, por nó**: `src/mapear.ts` pega a
matriz de mundo já resolvida pelo core (`cena.mundo()`, sempre Y-up),
decompõe em posição/rotação/escala e converte só a posição e a BASE de
rotação (`ex`/`ez`) do nó para IFC. A geometria em si
(`src/geometria.ts`) nunca vê essa conversão — ela é escrita inteiramente
em coordenadas locais do próprio nó, do jeito que o core já as entende.
Isso é o que faz um erro de eixo, se existisse, aparecer numa fronteira só
em vez de se espalhar por todo o cálculo de cada primitiva.

**Testado explicitamente**, não só por construção: `tests/ifc.test.ts` tem
dois testes de hierarquia com transform acumulado (incluindo um pai
rotacionado 90° em Y) que decodificam a posição de volta do IFC gerado e
conferem contra `no.bbox().centro` que o CORE calculou — é o teste
"que pega erro de conversão de eixo" pedido no enunciado, e ele lê o
arquivo gerado de volta em vez de confiar na teoria.

## Materiais: cor e transparência, o resto é perda conhecida

`Material.cor` → `IfcColourRgb` dentro de `IfcSurfaceStyleRendering`;
`Material.opacidade` → `Transparency` (1 − opacidade). Aplicado via
`IfcStyledItem` no item de representação, com cache por conteúdo
serializado do material (mesma ideia do `compartilhar` de
`@snaple/three`: uma cena com centenas de peças iguais não gera um
`IfcSurfaceStyle` por peça).

**Perda conhecida, documentada em vez de forçada**: `metalico`,
`rugosidade`, `emissivo`, `textura`, `aramado` e `facetado` não têm
equivalente em `IfcSurfaceStyleRendering` (que é um modelo de material
antigo, sem PBR). Mapear "rugosidade" para o único campo remotamente
parecido (`SpecularHighlight`, um shininess Phong) seria impreciso o
bastante para enganar mais do que ajudar — melhor a perda ficar explícita
aqui do que escondida atrás de um número que não significa a mesma coisa.

## GUIDs estáveis

Toda entidade `IfcRoot` (Project/Site/Building/Storey/elementos) tem GUID
determinístico: SHA-256 de uma chave estável (`no:` + id do nó para
elementos; uma string fixa por entidade espacial singleton), truncado a
128 bits e comprimido no formato de 22 caracteres do IFC (mesmo algoritmo
que `ifcopenshell.guid.compress` usa — `src/guid.ts`). Não há UUID
aleatório em lugar nenhum. Resultado: exportar a mesma cena duas vezes
produz o **mesmo arquivo, byte a byte** (testado — `tests/ifc.test.ts`) —
GUIDs e a numeração `#N` das entidades saem idênticos, porque ambos são
função só do conteúdo da cena, nunca de estado entre chamadas.

## Validação

Rodada de verdade, não suposta — dois validadores independentes, via
`ifcopenshell` (Python) instalado num venv temporário (não é dependência
deste pacote nem do repositório; usado só para conferir a saída):

1. **`ifcopenshell.validate --rules`** — carrega o schema IFC4 completo
   (tipos, regras `WHERE`) e confere cada atributo de cada entidade. Pegou
   dois bugs reais antes deste README ser escrito:
   - `IfcGeometricRepresentationContext.CoordinateSpaceDimension` estava
     saindo como REAL (`3.`) quando o schema pede INTEGER (`3`) — todo
     `number` deste pacote vira REAL por padrão (ver `spf.ts`); precisou de
     um tipo `Inteiro` à parte para este único atributo.
   - `IfcSIUnit.Dimensions` estava saindo `$` (omitido) quando o schema
     marca esse atributo como **DERIVADO** nessa subtipo — STEP tem um
     token específico para isso (`*`), diferente de "omitido"; precisou de
     um segundo marcador (`Derivado`) além de `Omitido`.

   Depois das duas correções, **as três cenas de teste (`box`, `sala` com
   13 elementos e furo, e a cena da câmera com 1116 nós) validam sem
   nenhum problema** (`No validation issues found.`).

2. **`ifcopenshell.geom`** (motor de geometria OpenCASCADE) — não só
   confere o schema, tenta de fato TRIANGULAR cada elemento como um
   visualizador IFC faria. Foi este teste, não o de schema, que achou o
   problema de `cone`/`IfcCsgSolid` descrito acima (schema-válido, mas o
   motor de geometria falha ao processar o `IfcProduct`). Depois de trocar
   `cone` para `IfcRevolvedAreaSolid`: **as três cenas trianguIam 100% dos
   elementos sem exceção** (1 / 13 / 1116 de 1 / 13 / 1116).

O que **não** foi rodado: o validador oficial do buildingSMART (serviço web
hospedado, https://validate.buildingsmart.org) — este ambiente não tem
acesso interativo a esse serviço específico dentro da sessão de trabalho.
`ifcopenshell` é a alternativa mais próxima de "validador de referência"
que roda localmente: é o motor por trás do BlenderBIM/IfcOpenShell e de
boa parte do ecossistema IFC open source, então uma cena que passa em
`ifcopenshell.validate` + `ifcopenshell.geom` tem uma chance real de abrir
correta em ferramentas de verdade — mas não é uma certificação formal do
buildingSMART, e está registrado aqui para quem for revisar saber
exatamente o que foi e o que não foi conferido.

## Opções

```ts
interface OpcoesExportarIFC {
  nomeProjeto?: string;               // IfcProject.Name — padrão "Cena snaple"
  nomeArquivo?: string;               // FILE_NAME do cabeçalho SPF — só metadado
  autor?: string;
  organizacao?: string;
  tipoIfcPorNo?: Record<string, string>; // ver "Nós → entidades IFC" acima
  aoAvisar?: (aviso: AvisoIFC) => void;   // ver abaixo
}
```

`AvisoIFC.motivo`:

| motivo | quando |
|---|---|
| `tesselado` | o nó saiu como `IfcFacetedBrep` (sem sólido paramétrico exato para o caso — ver tabela acima) |
| `modelo-proxy` | nó `model`: virou caixa proxy do `tamanho` declarado, sem a malha de origem |
| `falha` | a geometria do nó não pôde ser derivada (mesmo motivo que apareceria em `@snaple/three`) — o nó é pulado, o resto da cena continua saindo |

## Limitações conhecidas

- Escala não-uniforme fora do grupo de simetria de `cylinder`/`cone`/
  `sphere`/`lathe` cai para malha tesselada (documentado acima).
- `plane` furado sai com 0,1 mm de espessura em vez de superfície de
  espessura zero (simplificação registrada acima).
- Metálico/rugosidade/emissivo/textura não têm equivalente em
  `IfcSurfaceStyleRendering` — perda conhecida, não aproximada.
- Hierarquia é achatada (uma storey, elementos com placement absoluto) —
  agrupamento do snaple não sobrevive à exportação, só posição/geometria/
  material.
- `IfcDoor`/`IfcWindow`/`IfcStair` não estão na lista de `tipoIfcPorNo`
  (atributos extras que quebrariam o template genérico de elemento).
