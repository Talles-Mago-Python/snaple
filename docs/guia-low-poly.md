# Guia de estilo low poly

Este guia presume que você já leu o
[`guia-de-modelagem.md`](guia-de-modelagem.md). Ele não repete o fluxo de
trabalho (escrever, rodar `avisosTexto()`/`descrever()`, só então abrir o
viewer); foca no que muda quando o objetivo é o visual **low poly**: poucas
faces, facetas visíveis, cor chapada.

Exemplo completo para acompanhar:
[`examples/web/modelos/clareira-low-poly.ts`](../examples/web/modelos/clareira-low-poly.ts)
(uma ilha com casinha, pinheiros e pedras; aparece sozinho no seletor do
viewer).

## O que faz uma peça parecer low poly

Três coisas, nesta ordem de importância:

1. **Silhueta legível com poucos lados.** Um pinheiro é três cones de 6
   lados empilhados; ninguém precisa de 32. Se a peça continua reconhecível
   com o contorno recortado em papel, o número de faces está certo.
2. **Faces planas com cor chapada.** Nada de textura, nada de brilho. O
   relevo aparece porque cada faceta recebe a luz num ângulo diferente, e
   não por causa de detalhe pintado.
3. **Paleta curta.** Uns 2 tons por material (luz e sombra: `folha` e
   `folhaClara`), e cor diferente em peças vizinhas no lugar de geometria
   extra. Uma porta é uma caixa marrom encostada na parede, sem batente nem
   maçaneta.

O resto (proporções exageradas, peças sobrepostas, variação entre cópias)
vem nas seções abaixo.

## Facetado: `material.facetado: true`

Por padrão o `@snaple/three` desenha `cylinder`, `cone`, `sphere`, `lathe`
e `torus` com **normais suaves**. Com poucos segmentos a silhueta sai
poligonal, mas o sombreamento continua arredondado, como uma bola de gude
de 6 lados. `facetado: true` no material troca isso por sombreamento
chapado: cada face recebe uma cor só, e as facetas aparecem.

```ts
cena.criar("sphere", { raio: 0.2, segmentos: 5 }, {
  material: { cor: "#9aa0a6", rugosidade: 1, facetado: true },
});
```

Em `box` e `extrude` o campo não muda nada, porque as faces já são planas.
Mesmo assim, coloque em todos os materiais da cena (o helper `chapado` da
seção Material faz isso): assim ninguém precisa lembrar em quais tipos ele
faz efeito.

## Qual tipo de nó usar

| Quero | Use |
|---|---|
| bloco, parede, degrau | `box` |
| prisma de N lados (tronco, coluna, pilar) | `extrude` com `perfil` = polígono regular |
| prisma irregular (ilha, rocha deitada, terreno) | `extrude` com polígono irregular |
| telhado de duas águas, cunha | `extrude` com perfil triangular, deitado |
| cone, copa de pinheiro | `cone` com `segmentos` 5–8 |
| tronco afinando | `cylinder` com `raioTopo ≠ raioBase`, `segmentos` 5–7 |
| pedra, arbusto | `sphere` com `segmentos` 5–6 + `escala` não uniforme |
| vaso, garrafa | `lathe` com 4–6 pontos no perfil e `segmentos` 6–8 |

**Para prisma de lados retos, prefira `extrude` a `cylinder`.** O visual é
o mesmo, mas a bbox do `extrude` sai dos vértices reais, e a do `cylinder`
não (ver "Encostar peças de poucos segmentos", abaixo).

### Polígono regular e irregular para `extrude`

```ts
type V2 = [number, number];

/** Polígono regular de `n` lados no plano XZ. */
function poligono(raio: number, n: number, fase = 0): V2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = fase + (i / n) * 2 * Math.PI;
    return [raio * Math.cos(a), raio * Math.sin(a)] as V2;
  });
}

/** Mesmo polígono com cada vértice empurrado para dentro/fora de forma
 * DETERMINÍSTICA: o modelo sai igual toda vez que roda. */
function irregular(raio: number, n: number, jitter: number, semente: number): V2[] {
  return poligono(raio, n).map(([x, z], i) => {
    const k = 1 + jitter * Math.sin(semente * 12.9898 + i * 78.233);
    return [x * k, z * k] as V2;
  });
}

cena.criar("extrude", { perfil: poligono(0.08, 6), altura: 0.5 }, { nome: "coluna" });
cena.criar("extrude", { perfil: irregular(2.4, 9, 0.1, 7), altura: 0.12 }, { nome: "ilha" });
```

Não use `Math.random()`. O modelo é uma função pura (ver
`guia-de-modelagem.md`), e com sorteio cada recarga do viewer mostra uma
cena diferente e os avisos do linter mudam de uma execução para outra.

### Deitar um prisma (telhado)

O `extrude` cresce em `+y` a partir de um perfil no plano XZ. Para um
telhado de duas águas, desenhe o triângulo com a cumeeira em `+z` e gire
**−90° em x**: o `z` do perfil vira `+y` (cumeeira para cima) e o
comprimento da extrusão fica ao longo de `z`:

```ts
const telhado = cena.criar("extrude", {
  perfil: [[-0.5, 0], [0.5, 0], [0, 0.45]], altura: 0.85,
}, { nome: "telhado", transform: { rotacao: [-Math.PI / 2, 0, 0] } });
colocarSobre(telhado, casa);
```

Com `+90°` o triângulo sai de ponta-cabeça.

## Quantos segmentos

| peça | `segmentos` |
|---|---|
| copa de árvore, cone de destaque | 5–7 |
| tronco, poste | 5–6 |
| pedra, arbusto (`sphere`) | 5–6 (a esfera ganha `segmentos/2` anéis) |
| roda, prato, objeto em close | 8–10 |
| `torus` (pneu, boia) | `segmentos` 8, `segmentosTubo` 4–5 |
| `sweep` com seção `circulo` | `secao.segmentos` 4–6, `segmentos` do caminho 3–4 |

Número **ímpar** (5, 7) deixa a peça menos "mecânica" que 6 ou 8: nenhum
lado fica paralelo ao oposto. Abaixo de 5 a peça vira pirâmide ou prisma
triangular, o que pode ser exatamente o desejado (cristal, pedra pontuda).

## Encostar peças de poucos segmentos: a bbox é o círculo, não o polígono

Para `cylinder`, `cone`, `lathe` e `sphere`, a bbox do core usa o **raio
cheio**, o do círculo que passa pelos vértices, qualquer que seja
`segmentos`. Com poucos lados, o meio de cada face fica bem mais para
dentro que isso. Na direção de uma face, a distância real do centro é
`raio · cos(π/segmentos)`:

| segmentos | folga máxima entre bbox e peça |
|---|---|
| 5 | 19% do raio |
| 6 | 13% |
| 8 | 8% |
| 32 | 0,5% |

Consequência: `encostar`/`colocarSobre` pelo **lado** de uma peça dessas
pode deixar um vão visível, e o linter não avisa, porque para ele as bboxes
se tocam. Por cima ou por baixo (topo/base) não há folga, porque as tampas
são planas.

Como resolver, conforme o caso:

- Se a peça é um prisma (lados retos), use `extrude` com polígono: a bbox
  do `extrude` sai dos vértices reais do perfil, e o contato lateral fica
  exato.
- Se precisa ser `cylinder`/`cone`, compense com `gap` negativo
  (`encostar(a, b, "leste", -raio * (1 - Math.cos(Math.PI / n)))`) e declare
  `a.permitirContato(b)`.
- Nas peças orgânicas (pedra encostada na parede), um vão pequeno quase
  nunca aparece. Deixe como está.

## Variação sem cópia exata

Três pinheiros iguais parecem carimbo. Varie com parâmetros, não com
sorteio:

- **Altura/escala por instância**: o helper recebe `altura` e deriva tudo
  dela (`raio: 0.38 * altura`).
- **Girar camadas em y**: em copas empilhadas, gire cada cone meio lado
  (`rotacao: [0, i * Math.PI / n, 0]`) para as arestas não se alinharem.
- **Escala não uniforme**: `sphere` com `escala: [1, 0.6, 1]` vira seixo;
  `[1.2, 0.7, 0.9]` vira pedra torta.
- **Rotação em y diferente por instância**: com poucos segmentos, girar
  muda bastante a silhueta.

## Peças sobrepostas de propósito

No low poly é comum afundar uma peça na outra: camadas de copa, telhado
comendo a parede, pedra enterrada no chão. Isso é interpenetração para o
linter. Declare quando for intencional:

```ts
colocarSobre(cone, conePorBaixo, { gap: -0.4 * alturaDoDeBaixo }); // afunda 40%
cone.permitirContato(conePorBaixo);
```

Sem `permitirContato`, o aviso aparece em `avisosTexto()`, e um aviso
esperado no meio dos outros esconde os de verdade.

## Material

```ts
const chapado = (cor: string): Material => ({ cor, rugosidade: 1, metalico: 0, facetado: true });
```

- `facetado: true` sempre (ver a seção sobre ele, acima).
- `rugosidade: 1`, `metalico: 0`. Com brilho especular, cada faceta ganha
  um reflexo próprio, e a peça fica parecendo plástico em vez de low poly.
- **Sem `textura`.** Onde precisar de informação visual (janela, placa),
  use uma peça fina de outra cor, ou um adesivo com a imagem também
  chapada, sem gradiente.
- `emissivo` para luz que o estilo pede: janela acesa, lampião, cristal.
  Dá conta sem geometria extra.
- Evite `opacidade < 1`. A transparência mostra as faces de trás e deixa
  a peça confusa.
- Escolha a paleta antes de modelar e guarde num objeto `PALETA` no topo
  do arquivo (ver o exemplo). Mudar o clima da cena inteira vira trocar
  meia dúzia de cores.

## Escala de detalhe

- **Não modele o que é menor que ~5% da peça que o contém.** Maçaneta,
  dobradiça, parafuso: some ou vira uma cor.
- **Exagere as proporções que dão identidade.** Telhado mais inclinado e
  com mais beiral, copa mais larga, porta mais baixa: a silhueta carrega o
  estilo, e ela pode ser caricata.
- **Mesma densidade em toda a cena.** Uma peça de 32 segmentos no meio de
  prismas de 6 lados chama atenção como erro, não como detalhe.

## Checklist

- [ ] Todo material tem `facetado: true`.
- [ ] Prismas de lados retos são `extrude`, não `cylinder`.
- [ ] Nenhum `segmentos` ficou no padrão (32): foi escolhido de propósito.
- [ ] Nenhum `Math.random()`: a variação vem de parâmetros ou de um hash
      determinístico.
- [ ] Material chapado (`rugosidade: 1`, `metalico: 0`, sem textura) e cores
      vindas de uma `PALETA`.
- [ ] Peças de poucos segmentos encostadas **pelo lado** foram conferidas no
      viewer (folga da bbox).
- [ ] Toda sobreposição de propósito tem `permitirContato`, e
      `avisosTexto()` sai limpo.
