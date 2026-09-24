# Primeiros passos com o snaple

Este guia é para quem nunca usou o snaple e quer **construir um modelo com
as próprias mãos**, escrevendo o código diretamente — sem pedir para uma IA
escrever por você. Não presume nada além do básico de programação (criar
uma variável, chamar uma função). No fim dele você vai ter montado, visto e
exportado seu primeiro modelo.

Depois deste guia, os outros dois documentos de `docs/` viram referência do
dia a dia: [`referencia-rapida.md`](referencia-rapida.md) é a lista de
assinaturas para consultar sem precisar lembrar de nada de cabeça, e
[`guia-de-modelagem.md`](guia-de-modelagem.md) é sobre hábitos de trabalho
para modelos maiores. Nenhum dos dois reexplica o que está aqui.

## O que é o snaple, numa frase

Em vez de dizer **onde** cada peça fica (`x = 0.45, y = 0.76, z = 0.10`),
você diz **como as peças se relacionam** ("essa perna vai embaixo do
tampo, encostada no canto"; "essa xícara fica em cima da mesa") e o snaple
calcula as coordenadas sozinho.

É a diferença entre dar instruções de montagem por telefone para alguém que
nunca viu o móvel ("a perna vai embaixo do tampo, encostada no canto" — funciona
não importa o tamanho exato das peças) e ditar uma lista de medidas em
milímetros (que só funciona se todo mundo tiver as mesmas peças, com as
mesmas medidas, e ninguém errar uma conta no meio do caminho).

## Antes de começar

- **Precisa**: Node.js 24 ou mais recente (rode `node --version` no
  terminal para conferir — o snaple roda os arquivos `.ts` direto, sem
  passo de build separado) e um editor de texto qualquer.
- **Não precisa**: saber Three.js, matemática de matrizes/rotação, nem ter
  feito modelagem 3D antes. Ajuda saber o básico de TypeScript/JavaScript
  (chamar uma função, criar uma variável), mas todo código abaixo está
  escrito por extenso, para copiar e entender aos poucos.
- Dentro da pasta do projeto, instale as dependências uma vez:

  ```bash
  npm install
  ```

## Primeiro contato: o visualizador

```bash
npm run dev
```

Isso abre uma aba no navegador com um visualizador 3D. Deixe essa aba
aberta — o resto deste guia usa ela.

```
┌───────────────────────────────┬─────────────────────────────┐
│                                 │ Modelo: [ robo_frc      ▾ ] │
│                                 │                              │
│           (canvas 3D)          │ [.glb]  [.obj]  [.stl]       │
│                                 │                              │
│                                 │ (aqui entra a cena descrita  │
│                                 │  em prosa, e os avisos)      │
└───────────────────────────────┴─────────────────────────────┘
```

No painel à direita (ou embaixo, se a janela for estreita), o seletor
**Modelo** lista os arquivos de exemplo que já vêm prontos no projeto —
escolha alguns só para ver como funciona:

- **botão esquerdo** do mouse, arrastando: gira a câmera ao redor da cena
- **botão direito**, arrastando: desloca a câmera (pan)
- **roda do mouse**: aproxima/afasta o zoom

Embaixo do seletor tem três botões de exportação (mais sobre eles no fim
deste guia) e um texto em português descrevendo a cena inteira — é a
cena "falando sobre si mesma", e vai ser sua principal ferramenta de
conferência daqui para frente.

## Seu primeiro modelo

Todo modelo do snaple é um arquivo `.ts` dentro de `examples/web/modelos/`
que exporta uma função chamada `montarCena`. É só isso que o visualizador
precisa para listar o arquivo no seletor — nenhum cadastro, nenhuma
configuração extra.

Crie um arquivo novo, `examples/web/modelos/minha-mesa.ts`, com este
conteúdo:

```ts
import { Cena } from "@snaple/core";

export function montarCena(): Cena {
  const cena = new Cena();

  const mesa = cena.criar(
    "box",
    { largura: 1.8, altura: 0.06, profundidade: 1.0 },
    { nome: "mesa", transform: { posicao: [0, 0.72, 0] } },
  );

  return cena;
}
```

Salve o arquivo. Em alguns instantes, uma opção nova `minha-mesa` aparece
no seletor **Modelo** — é assim que o visualizador "descobre" um arquivo
novo, sem precisar reiniciar `npm run dev` nem tocar em nenhum outro
código. Escolha essa opção.

Você deve ver uma placa retangular flutuando no ar — e o painel de texto
muda para exatamente isto:

```
Uma mesa (1.8 × 0.06 × 1 m) no centro. Aviso: mesa flutua 0.69 m acima do
chão, sem nada embaixo.

AVISO: mesa flutua 0.69 m acima do chão, sem nada embaixo
```

(o aviso aparece duas vezes — uma vez dentro da frase em prosa, outra na
lista de avisos logo abaixo; são duas leituras da mesma informação, uma
narrada e outra estruturada). O aviso chama a peça de "mesa" porque esse é o
`nome` que você deu a ela. Um nó sem `nome` aparece pelo **id** interno,
gerado automaticamente (`box_1`) — mais sobre essa distinção no glossário,
no fim deste guia.

Esse aviso é o **linter** da biblioteca: depois de qualquer mudança, ele
confere a cena inteira e avisa quando alguma coisa parece errada (peça
flutuando, duas peças ocupando o mesmo espaço, etc). Ele **nunca trava
nada** — só avisa, porque só quem está modelando sabe se aquilo é mesmo um
erro. Aqui ele está certo: criamos só o tampo, sem nenhum apoio. Vamos
resolver isso.

### Dando apoio à mesa: relação, não coordenada

Troque o `return cena;` pelo trecho abaixo (deixando a `const mesa` como
estava):

```ts
  const pernas = [0, 1, 2, 3].map(() =>
    cena.criar(
      "cylinder",
      { raioTopo: 0.04, raioBase: 0.04, altura: 0.69 },
      { nome: "perna" },
    ),
  );
  mesa.face("base").grade(pernas, 2, 2, { gapEntre: 0.12 });

  return cena;
```

Salve. Quatro pernas aparecem numa grade 2×2 na face de baixo da mesa,
recuadas 12 cm da borda, e a lista de avisos vira `AVISOS: nenhum.` — as
pernas encostam exatamente no chão e exatamente embaixo do tampo, sem gap
nem sobreposição.

Repare no que você **não** escreveu: nenhuma coordenada X/Z de onde cada
perna vai, nenhuma conta de "a que altura do chão a perna precisa
terminar para encostar exatamente embaixo do tampo". `face("base").grade(...)`
resolveu tudo isso sozinho, a partir da posição da mesa e do tamanho das
próprias pernas. Se você mudar a altura da mesa depois, as pernas
acompanham — é essa a ideia central do snaple.

### Colocando algo em cima

Agora uma xícara, apoiada no tampo:

```ts
  const xicara = cena.criar(
    "cylinder",
    { raioTopo: 0.04, raioBase: 0.03, altura: 0.09 },
    { nome: "xícara" },
  );
  mesa.face("topo").colocar(xicara, { u: -0.45, v: 0.1 });

  return cena;
```

`u` e `v` são um deslocamento a partir do **centro** da face `"topo"` da
mesa, medido no próprio plano dessa face — não é X/Z do mundo. De novo,
nenhum número de altura em lugar nenhum: `colocar` já garante que a base da
xícara encosta exatamente no topo da mesa, nem flutuando nem afundada.

O painel agora deve terminar assim:

```
Uma mesa (1.8 × 0.75 × 1 m) a nordeste, com 4 pernas. Uma xícara apoiada
sobre a mesa, levemente à esquerda.

AVISOS: nenhum.
```

Duas coisas para reparar aí: a medida da mesa mudou de `0.06` (só o tampo)
para `0.75` (tampo **mais** pernas) — `descrever()` está resumindo a caixa
que envolve a mesa inteira, não só a peça que você chamou de "mesa". E a
direção mudou de "no centro" para "a nordeste": isso não é a mesa se
movendo, é o CENTRO DE REFERÊNCIA da cena que se deslocou um pouco ao
ganhar uma peça pequena e descentralizada (a xícara). Nenhum dos dois é bug
— é `descrever()` sempre reportando a cena INTEIRA, relativa a si mesma.

### Exercício rápido: provocando um aviso de propósito

Troque `u: -0.45` por `u: -2` e salve. A xícara sai da área da mesa — e o
aviso de "flutuando" volta, porque a base dela deixou de estar apoiada em
cima de alguma coisa (a xícara continua encostando no PLANO da face, só que
fora da área onde a mesa realmente existe). Volte o valor para `-0.45`
antes de continuar, só para conferir que o aviso some de novo.

Esse vaivém — mudar um número, salvar, ler o painel — é o ciclo principal
de trabalhar com o snaple. É bem mais rápido que abrir um programa de 3D
tradicional e arrastar coisas na tela, uma vez que você pega o jeito.

## Exportando seu modelo

Com `minha-mesa` selecionado no seletor, os três botões no painel exportam
a cena **exatamente como está na tela** para um arquivo, que o navegador
baixa direto:

- **`.glb`** — formato mais moderno e compacto; a escolha certa para abrir
  em outro visualizador 3D, importar num motor de jogo, ou mandar para
  alguém conferir sem precisar do snaple instalado.
- **`.obj`** — formato mais antigo e simples, texto puro; útil quando o
  programa de destino não entende `.glb`.
- **`.stl`** — formato usado por fatiadores de impressora 3D. Use este se
  o objetivo final é imprimir a peça.

## Praticando um pouco mais

Antes de ir para os documentos de referência, vale brincar sozinho com o
que já deu para ver:

- Crie umas "cadeiras" (mais caixas) e espalhe elas em círculo ao redor da
  mesa com a função `circular` (veja a assinatura em `referencia-rapida.md`,
  seção "Layout"). Repare que `circular` espaça ângulos iguais — ótimo para
  cadeiras ao redor, mas **não** é a ferramenta certa para trocar a `grade`
  das pernas: numa mesa retangular ela geraria posições nas diagonais, não
  nos quatro cantos.
- Abra `examples/web/modelos/teste.ts` — é um arquivo em branco, pensado
  para rascunhar ideias sem afetar `minha-mesa.ts`.
- Tente fazer um furo na mesa com `mesa.furar({ ... })` — a assinatura e as
  regras (por que alguns furos são recusados) estão na seção "Furo" da
  referência rápida.
- Erre de propósito: troque `"topo"` por `"leste"` na chamada de `colocar`
  e veja a xícara ir para o lado da mesa em vez de em cima. Errar sinal de
  face é o erro mais comum de quem está começando, e ver o resultado
  errado ao vivo ensina mais rápido que qualquer explicação.

## Para onde ir depois

- **[`referencia-rapida.md`](referencia-rapida.md)** — toda assinatura,
  todo tipo de nó, todo parâmetro, numa lista para consultar rápido sem
  precisar decorar nada. Vale ter aberto ao lado sempre que escrever
  código.
- **[`guia-de-modelagem.md`](guia-de-modelagem.md)** — depois que o básico
  já estiver confortável: fluxo de trabalho para modelos maiores, os
  padrões que se repetem (peças em grade, vistas explodidas, peças
  giradas por fórmula), e uma lista de erros comuns.
- **[`README.md`](../README.md)**, seção "Os seis conceitos" — a
  explicação completa de cada ideia por trás da biblioteca (faces, bbox,
  containers de layout, furos, `extrude`/`helix`), para quando "como usar"
  não for mais suficiente e a pergunta virar "por que funciona assim".

## Glossário rápido

Termos usados o tempo todo no código e nesses guias, para quem está vendo
pela primeira vez:

| termo | significado |
|---|---|
| **nó** (`No`/`NoRef`) | uma peça da cena — uma caixa, um cilindro, um grupo. Tudo na árvore é um nó. |
| **id** / **nome** | o `id` identifica o nó sem ambiguidade (`box_1`, gerado sozinho se você não passar um); o `nome` é o rótulo legível que você escolhe ("mesa"). Os textos dos avisos e de `descrever()` usam o `nome` quando existe; o array de `cena.avisos()` guarda sempre os ids. |
| **cena** (`Cena`) | o objeto que guarda a árvore inteira de nós; tudo começa com `new Cena()`. |
| **face** | um dos seis lados de um nó (`topo`, `base`, `norte`, `sul`, `leste`, `oeste`), usado como referência para encostar outra peça nele. |
| **transform** | posição, rotação e escala de um nó, sempre relativas ao **pai** dele na árvore, nunca ao mundo inteiro diretamente. |
| **aviso** | uma mensagem do linter (`cena.avisos()`/`avisosTexto()`) sobre algo que parece errado — nunca impede nada, só avisa. |
| **`descrever()`** | a cena inteira resumida em uma frase de prosa, em português — a forma mais rápida de conferir se o modelo está do jeito que você imaginou. |
| **`montarCena()`** | a função que todo arquivo de modelo precisa exportar; é o que o visualizador chama para saber o que desenhar. |
