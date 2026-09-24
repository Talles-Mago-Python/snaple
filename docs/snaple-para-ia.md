# Modelando com snaple — guia para uma IA de chat

Este documento é para você, IA, quando alguém pedir um modelo 3D feito com a
biblioteca **snaple** (`@snaple/core`). Em geral você está numa conversa e
**não tem o repositório instalado**. Você escreve o arquivo `.ts`, a pessoa
salva no projeto e abre no viewer. Tudo aqui vem de ter feito isso na
prática: o que funciona, o que gera aviso e o que quebra.

Se a pessoa anexar `README.md`, `guia-de-modelagem.md`, `primeiros-passos.md`,
`AGENTS.md` ou `referencia-rapida.md`, leia todos antes de escrever qualquer
linha. Eles são a fonte da verdade. Este guia só organiza como trabalhar com
eles.

---

## 1. O que você entrega

Um único arquivo `examples/web/modelos/<nome>.ts` que:

- exporta **uma** função `montarCena(): Cena` e nada mais roda no top-level
  (nada de `console.log`, I/O ou estado global);
- não tem câmera, luz nem renderer, porque isso é do viewer;
- tem um nome que **não colide** com os modelos que já existem no repo:
  `camera.ts`, `relogio_explodido.ts`, `robo_frc.ts`, `teste.ts` e o
  `minha-mesa.ts` do tutorial. Colisão sobrescreve o arquivo da pessoa.

Junto com o arquivo, diga numa resposta curta onde salvar, o que você supôs
sem conseguir confirmar (seção 9) e como a pessoa confere (seção 8).

---

## 2. Convenções (sem exceção)

| | |
|---|---|
| Unidade | metros |
| Vertical | `+y` (Y-up), sistema destro |
| Cardeais | `+x` leste · `-x` oeste · `+z` sul · `-z` norte |
| Rotação | Euler XYZ intrínseca, **radianos** |
| Chão | `y = 0` — nada deve ficar abaixo disso |
| Geometria | nasce **centrada na própria origem local** (exceto `extrude` com `recentrar: false`) |

Para objetos com "frente" (câmera, carro, móvel), adote **frente = `+z`
(sul)** e diga isso num comentário no topo do arquivo. Quem olha o objeto de
frente vê `+x` à direita. Quem está atrás do objeto, olhando na mesma direção
que ele, tem `-x` à direita. Decida isso antes de posicionar controles que
dependem de mão (empunhadura, botões).

---

## 3. O que é confiável e o que é suposição

**Documentado (use à vontade):**

- `new Cena()`
- `cena.criar(tipo, params, { nome, material, transform: { posicao, rotacao } })`
- `box { largura, altura, profundidade }`
- `cylinder { raioTopo, raioBase, altura, segmentos? }` (raios diferentes = tronco de cone, que não aceita furo)
- `extrude { perfil: [x, z][], altura, recentrar? }`, extrudado ao longo de `y` local
- `helix { raio, raioTubo, passo, voltas }`, com eixo `+y` local
- `sweep { caminho: [x, y, z][], secao, suavizar?, raioCurva?, fechado?, recentrar? }`
  para fios (`suavizar: true`), canos dobrados (`raioCurva`) e perfis/quadros
  com canto vivo (padrão). `secao`: `{ tipo: "circulo", raio, espessura? }`,
  `{ tipo: "retangulo", largura, altura, espessura? }` ou
  `{ tipo: "poligono", pontos }` (com `perfilL`/`perfilU`/`perfilI`/`perfilT`)
- imagem: `material.textura { src, repetir? }` na peça inteira;
  `no.colarAdesivo({ src, face, u?, v?, largura?, altura? })` numa região
  (`face: "lateral"` em `cylinder`/`cone`/`lathe`: `u` = ângulo, `v` = altura)
- animação: `cena.animar(nome, { repetir })` + `.faixa(no, propriedade,
  [[t, valor], ...])`; porta/braço = `angulo` de uma `junta`; confira com
  `cena.conferirAnimacaoTexto(nome)`
- `model { src, tamanho }`
- containers `row`/`column`/`stack`
- `no.face(nome).colocar(alvo, { u, v, gap, orientar, reparentar })`
- `.grade()` e `.distribuir()`
- `layout.ts`: `colocarSobre`, `encostar`, `alinhar`, `centralizarEm`, `empilhar`, `distribuir`, `circular`, `envelope`
- `no.furar({ face, forma: { tipo: "circulo", raio }, u, v })`
- `cena.acoplar({ tipo: "contato" | "pivo", nome?, a: { no, face }, b: { no, face } })`
- `no.mover`, `girar`, `escalar`, `material`, `nomear`
- `bbox()` / `bboxPropria()`, `descrever()`, `avisosTexto()`
- material `{ cor, metalico?, rugosidade?, opacidade?, facetado? }` (`facetado: true` = low poly)

**Pouco documentado (use, mas declare como suposição):**

- `no.criar(tipo, params, opções)` para criar um **filho** no referencial do
  pai. Aparece no README como `fila.criar(...)`.
- O que `mover` faz: se define a posição ou soma um deslocamento. A partir da
  origem dá no mesmo, então use só no nó raiz recém-criado.

**Não documentado (evite):**

- Os params de `sphere`, `cone`, `torus` e `lathe`. Substitua por
  `cylinder`/tronco empilhado, `helix` (serve para argolas) ou `extrude`.
- A chave `escala` no transform.
- Furos não circulares.
- Profundidade parcial de furo.

Se o documento de referência vier anexado, ele tem precedência sobre esta
lista. Quando os documentos se contradizem, use o subconjunto que aparece de
forma consistente em mais de um deles.

---

## 4. Faces: a tabela que você vai consultar o tempo todo

Toda face é derivada da **bbox própria** do dono, no espaço **local** dele.
`u`/`v` são deslocamentos a partir do **centro da face**.

| face | normal | U | V | ponto no mundo `(x, y, z)` → `u, v` (dono sem rotação) |
|---|---|---|---|---|
| `topo`  | `+y` | `+x` | `+z` | `u = x − cx`, `v = z − cz` |
| `base`  | `−y` | `+x` | `−z` | `u = x − cx`, `v = −(z − cz)` |
| `sul`   | `+z` | `−x` | `+y` | `u = −(x − cx)`, `v = y − cy` |
| `norte` | `−z` | `+x` | `+y` | `u = x − cx`, `v = y − cy` |
| `leste` | `+x` | `+z` | `+y` | `u = z − cz`, `v = y − cy` |
| `oeste` | `−x` | `−z` | `+y` | `u = −(z − cz)`, `v = y − cy` |

(`cx, cy, cz` = centro da face do dono, no mundo.)

**O que `colocar` faz com o alvo** (com `orientar` padrão):

- o `+x` local do alvo vai para U;
- o `+y` local vai para a normal (aponta **para fora** da face);
- o `+z` local vai para V;
- a base do alvo encosta exatamente no plano;
- o alvo vira **filho** do dono.

Consequências práticas:

- **Cilindro colocado numa face tem o eixo na normal.** Numa parede, é um
  botão. No topo, é um dial.
- **Box colocado numa parede é autorado "deitado":** `altura` é a espessura
  que sai da parede, `largura` corre em U e `profundidade` corre em V.
- **Encadear é o jeito natural de montar pilhas.** O alvo colocado ganha um
  frame próprio: a face `topo` dele é a que aponta para fora do dono. Numa
  lente presa na frente de um corpo, cada anel vai em `anterior.face("topo")`.
- **`orientar: false` mantém a rotação do alvo** e só encosta. Use quando o
  eixo de extrusão não deve seguir a normal: por exemplo, uma empunhadura
  extrudada na vertical, presa na frente do corpo. Nesse caso a face do alvo
  que encosta é a oposta à normal, e é essa que vai no acoplamento (`"norte"`
  numa face `"sul"`).
- **Coloque um nó antes de dar filhos a ele.** O posicionamento usa a bbox do
  alvo, e com filhos a semântica fica ambígua.

---

## 5. Os três jeitos de posicionar

1. **Relação com peça existente → `face().colocar()` / `layout.ts`.** É o
   padrão, usado em 90% das peças.
2. **Peça definida por fórmula → filho com transform calculado.** Serve para
   marcas ao redor de um dial, dentes, peças em ângulo e vistas explodidas. A
   posição vem de uma conta com constantes nomeadas, nunca de um número
   medido no olho. Crie como filho (`pai.criar(...)`) para herdar o
   referencial.
3. **Coordenada absoluta → só no nó raiz**, derivada de constantes. Exemplo:
   `camera.mover([0, H_BASE + H_CORPO / 2, 0])`.

Distribuição radial em volta do eixo `y` local do pai, com o `+z` da peça
apontando para fora:

```ts
const radial = (pai: NoRef, r: number, a: number, y = 0) => ({
  pai, posicao: [r * Math.sin(a), y, r * Math.cos(a)] as V3, rotacao: [0, a, 0] as V3,
});
```

(`a = 0` aponta para `+z` local do pai. Descubra para onde isso aponta no
mundo seguindo a cadeia de `colocar`. Um anel colocado na face `sul` tem
`+z` local = `+y` do mundo, ou seja, `a = 0` é "em cima".)

---

## 6. Regras para não gerar aviso nem erro

O linter trabalha com **bbox alinhada aos eixos (AABB)** e sempre só avisa.
Os furos são diferentes: eles **lançam erro**, e um erro derruba o modelo
inteiro no viewer.

**Contra "flutuando":** toda peça presa numa parede ou numa face lateral
precisa de um acoplamento, senão aparece como flutuando. Declare junto com o
`colocar`:

- `contato` para peças fixas;
- `pivo` para peças que giram. Exige centros coincidentes, então coloque em
  `u = v = 0`. Para um dial fora do centro, crie antes uma base fixa com
  `contato` e depois o dial sobre ela com `pivo`.

**Contra "interpenetração":**

- A bbox de uma peça redonda é um quadrado. Uma peça pequena perto de um
  cilindro "invade" a bbox dele mesmo sem tocar a superfície.
- **Monte peças redondas como pilha coaxial** (anel sobre anel ao longo do
  eixo), não uma dentro da outra.
- **Peça que se sobrepõe de propósito vira filha** de quem ela sobrepõe:
  vidro dentro de um anel, rosca dentro de um bocal, marcas sobre um dial.
  Pares pai/filho são ignorados.
- Antes de escrever, **faça uma tabela de faixas `[min, max]` em x/y/z** de
  cada peça de cada região e confira que irmãs não se cruzam. Encostar
  (faixa terminando onde a outra começa) é permitido.

**Contra "centros coincidentes":** o limite não está documentado (o exemplo
do README dispara com 5 mm). Evite peças irmãs com o mesmo centro. Deslocar
ao longo da normal costuma bastar.

**Furos (`furar`) — use com cuidado:**

- Só em `box`, `cylinder` reto ou `extrude`.
- Uma face por nó.
- O volume do furo **não pode alcançar outro nó**, senão dá erro
  `atravessa-outro-no`. Nada pode passar pelo furo, nem mesmo um filho.
- Prefira furos cujas duas pontas terminam no ar. Exemplo: um olhal que sai
  do corpo, furado de lado.
- Não confie que "encostar na ponta do furo" é permitido.
- Para "furos" puramente visuais (microfone, alto-falante, fenda de
  parafuso), use discos ou caixas finas escuras sobre a superfície.

**Perfis de `extrude`:**

- O perfil é **um contorno só, sem furos**.
- Para uma coroa (anel vazado, moldura, ocular), percorra o contorno externo
  num sentido e o interno no sentido contrário, deixando uma fenda
  invisível de ~20 µm:

  ```ts
  const FENDA = 1e-5;
  const circuloAberto = (r: number, n = 96): XZ[] => arco(r, FENDA / r, TAU - FENDA / r, n);
  const coroa = (externo: XZ[], interno: XZ[]): XZ[] => [...externo, ...interno.reverse()];
  ```

- **Prefira perfis simétricos em `z`.** Não está garantido se o segundo
  número do perfil vira `+z` ou `−z` no mundo. Um perfil assimétrico pode
  sair espelhado; um simétrico sai certo de qualquer jeito. Para uma
  empunhadura, uma super-elipse (expoente 6) tem as costas quase retas e é
  simétrica.
- Serrilhado (dials, anéis de foco) é um perfil de dentes num `extrude`, não
  dezenas de caixinhas. Isso dá um nó só, sem avisos e com muito detalhe.

**Chão:** confira o ponto mais baixo de tudo que pende para baixo (alavancas,
abas, lentes). Nada pode ficar abaixo de `y = 0`.

---

## 7. Esqueleto recomendado

```ts
import { Cena, type NoRef } from "@snaple/core";

// <Objeto>. Frente = +z (sul), topo = +y.
type V3 = [number, number, number];
type XZ = [number, number];
type Material = { cor: string; metalico?: number; rugosidade?: number; opacidade?: number; facetado?: boolean };
type NomeFace = "topo" | "base" | "norte" | "sul" | "leste" | "oeste";
type Onde = { pai: NoRef; posicao: V3; rotacao?: V3 };

const TAU = 2 * Math.PI;
// medidas nomeadas aqui (nenhum número repetido em duas chamadas)

export function montarCena(): Cena {
  const cena = new Cena();

  const M = {
    metal: { cor: "#c9cdd2", metalico: 0.9, rugosidade: 0.22 },
    // ...
  } satisfies Record<string, Material>;

  const opcoes = (nome: string, material: Material, onde?: Onde) =>
    onde ? { nome, material, transform: { posicao: onde.posicao, rotacao: onde.rotacao ?? ([0, 0, 0] as V3) } }
         : { nome, material };
  const caixa = (nome: string, l: number, a: number, p: number, m: Material, onde?: Onde): NoRef =>
    (onde?.pai ?? cena).criar("box", { largura: l, altura: a, profundidade: p }, opcoes(nome, m, onde));
  const cilindro = (nome: string, r: number, a: number, m: Material, onde?: Onde): NoRef =>
    (onde?.pai ?? cena).criar("cylinder", { raioTopo: r, raioBase: r, altura: a, segmentos: r > 0.008 ? 96 : 32 }, opcoes(nome, m, onde));
  const extrudar = (nome: string, perfil: XZ[], a: number, m: Material, onde?: Onde): NoRef =>
    (onde?.pai ?? cena).criar("extrude", { perfil, altura: a }, opcoes(nome, m, onde));

  const fixar = (dono: NoRef, face: NomeFace, alvo: NoRef, u = 0, v = 0): NoRef => {
    dono.face(face).colocar(alvo, { u, v });
    cena.acoplar({ tipo: "contato", a: { no: dono, face }, b: { no: alvo, face: "base" } });
    return alvo;
  };
  const articular = (dono: NoRef, alvo: NoRef, nome: string): NoRef => {
    dono.face("topo").colocar(alvo);
    cena.acoplar({ tipo: "pivo", nome, a: { no: dono, face: "topo" }, b: { no: alvo, face: "base" } });
    return alvo;
  };

  // raiz: nomeie com o nome do objeto inteiro ("câmera", "mesa") —
  // é o que descrever() usa para abrir a frase ("Uma câmera (...) no centro").
  // ... montagem, região por região, com um comentário de seção em cada uma

  return cena;
}
```

Nomes de nó em português e no singular ("marca de velocidade", "parafuso").
`descrever()` agrupa repetições e decide o gênero pela terminação.

---

## 8. Verificação

**Se você consegue executar código** e tem o repo, rode o script do guia:

```ts
import { montarCena } from "./examples/web/modelos/<nome>.ts";
const cena = montarCena();
console.log(cena.avisosTexto() || "nenhum aviso");
console.log(cena.descrever());
```

Leia cada aviso individualmente e corrija até sobrar só o que for
intencional.

**Se consegue executar código mas não tem a lib**, escreva uma imitação
mínima do core só com o que você usou. Isso já pega a maioria dos erros de
sinal e de encaixe. A imitação precisa ter:

- matriz de rotação XYZ;
- extensão local por tipo;
- `colocar` com a tabela de frames da seção 4 (base do alvo na face, rotação
  `[U N V]`, reparent);
- composição pai → filho.

Com ela:

- imprima as AABBs de mundo;
- liste sobreposições entre nós que não são ancestrais nem acoplados;
- verifique `y < 0`;
- confira se o volume de cada furo alcança algum nó;
- renderize com z-buffer, não com ordem de profundidade, que esconde peças
  finas atrás de faces grandes;
- rode `tsc --strict` contra uma declaração tipada da API documentada.

Diga à pessoa que foi uma imitação, não o core real.

**Se não consegue executar nada**, faça a tabela de faixas da seção 6 à mão
para as regiões apertadas e peça à pessoa que rode o script acima e cole a
saída de volta.

---

## 9. Como responder

- Entregue o arquivo e diga onde salvar.
- Liste, curto, **o que você supôs** (itens "pouco documentados" que usou) e
  **como verificou** (real, imitação ou só conta).
- Não prometa "zero avisos" se você não rodou o linter real.
- Se a pessoa disser "ignore contradições" nos documentos, siga o subconjunto
  consistente, não invente API para reconciliar.

---

## 10. Erros que mais aparecem

- Confundir `u`/`v` com X/Z do mundo. Nas faces `sul`, `base` e `oeste`, um
  dos eixos é invertido; consulte a tabela da seção 4.
- Esquecer que a face `topo` de uma peça colocada numa parede aponta para
  fora da parede, não para cima.
- Criar peças que "cercam" outras como irmãs (vidro dentro de anel) em vez
  de filhas.
- Usar `bbox()` onde a intenção era `bboxPropria()` num helper próprio. Não
  escreva helpers de posicionamento; use `face()`/`layout.ts`.
- Coordenadas cravadas que vieram de "medir no olho", em vez de relação ou
  fórmula.
- Furo por onde passa outra peça. Isso é erro, não aviso.
- Controle giratório sem `pivo`, peça de parede sem `contato`.
- Nome de arquivo repetido no `examples/web/modelos/`.
