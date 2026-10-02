# Guia de modelagem — escrevendo cenas snaple em código

Nunca usou o snaple? Comece por
[`primeiros-passos.md`](primeiros-passos.md) — este guia aqui presume que
você já montou pelo menos um modelo simples.

Este guia é para quem vai **escrever `.ts` diretamente** contra `@snaple/core`
para montar um modelo (móvel, objeto mecânico, cena qualquer) — não para quem
edita a lib. Para os conceitos da API (faces, layout, furos), leia o
[`README.md`](../README.md) primeiro; este guia não repete o "o quê", foca no
"como trabalhar" na prática: fluxo de escrita, estrutura de arquivo,
verificação e os erros que mais aparecem no meio do caminho.

## Fluxo de trabalho

Escrever um modelo é um loop curto, não um script que você escreve uma vez e
roda no final:

1. **Escreva o arquivo** como uma função `montarCena(): Cena` (seção
   seguinte).
2. **Rode um script de verificação** que chama a função e imprime
   `avisosTexto()` e `descrever()` — sem isso você está voando cego, porque
   nenhuma dessas chamadas abre janela nem precisa de GPU:

   ```ts
   // verificar.ts
   import { montarCena } from "./meu_modelo.ts";

   const cena = montarCena();
   console.log(cena.avisosTexto() || "nenhum aviso");
   console.log(cena.descrever());
   ```

   ```bash
   node verificar.ts
   ```

   Node 24+ executa `.ts` direto por type stripping; não precisa de `tsx`
   nem de passo de build.

3. **Leia a prosa de `descrever()` como se fosse a especificação da peça.**
   Se ela não bate com o que você tinha na cabeça ("a perna devia estar
   embaixo do tampo, não no centro"), o bug está ali, antes de gastar tempo
   com o viewer.
4. **Leia os avisos e decida, um por um, se são esperados.** O linter nunca
   bloqueia (ver `README.md`, seção "O linter de cena") — cabe a você separar
   "flutuando de propósito" (uma prateleira na parede, uma peça de vista
   explodida) de "flutuando por engano" (esqueceu de encostar algo).
5. **Só então** abra o viewer (`npm run dev`) e escolha o arquivo no seletor
   — se ele já mora em `examples/web/modelos/`, aparece sozinho na lista.
   Chegar no viewer com a prosa e os avisos já limpos economiza a maior
   parte das voltas do loop.

Repita até `descrever()` contar exatamente a história que você quer.

## Estrutura de um arquivo de modelo

Todo modelo neste repo segue a mesma forma: um módulo que **exporta uma única
função `montarCena(): Cena`**, sem efeito colateral fora dela (sem `console.log`
solto, sem I/O). Isso é o que permite tanto o viewer quanto um script de
verificação importarem o mesmo arquivo.

```ts
import { Cena, type NoRef } from "@snaple/core";

type V3 = [number, number, number];
type Material = { cor: string; metalico?: number; rugosidade?: number; opacidade?: number };

export function montarCena(): Cena {
  const cena = new Cena();
  const PI = Math.PI;

  // 1. materiais nomeados, um objeto só — nunca cor inline espalhada pelo arquivo
  const M = {
    madeira: { cor: "#8b5a2b", rugosidade: 0.7 } satisfies Material,
    metal: { cor: "#c9cdd1", metalico: 0.85, rugosidade: 0.25 } satisfies Material,
  };

  // 2. helpers curtos para os tipos de nó que a peça usa
  const caixa = (
    nome: string, largura: number, altura: number, profundidade: number,
    posicao: V3, material: Material, rotacao: V3 = [0, 0, 0],
  ): NoRef =>
    cena.criar("box", { largura, altura, profundidade }, { nome, transform: { posicao, rotacao }, material });

  // 3. a montagem em si, relação por relação
  const base = caixa("base", 0.4, 0.02, 0.4, [0, 0.01, 0], M.madeira);
  // ...

  return cena;
}
```

### Por que exportar uma função, e não montar no top-level do módulo

- **Testável.** Um script de verificação chama `montarCena()` quantas vezes
  quiser sem reimportar o módulo.
- **Reaproveitável no viewer.** Qualquer arquivo em `examples/web/modelos/`
  é lido pelo Vite a cada save e listado no seletor; se a montagem fosse
  top-level, um `import` acidental duplicado reconstruiria a cena duas
  vezes.
- **Sem estado global.** Duas cenas diferentes no mesmo processo (por
  exemplo, um teste que monta a peça duas vezes com parâmetros diferentes)
  não compartilham nó nenhum.

### Helpers: crie um por tipo de nó que a peça realmente usa

Não importe um kit de helpers genérico de outro arquivo — cada modelo define
os seus, do tamanho que precisa. Um relógio usa `cilindro`/`caixaBox`/`torus`;
uma mesa só usa `caixa`. O ganho não é reuso entre arquivos, é que a chamada
no corpo da função fica numa linha e lê como a peça, não como boilerplate de
`cena.criar(...)`:

```ts
const cilindro = (
  nome: string, raio: number, altura: number, posicao: V3, material: Material, rotacao: V3 = [0, 0, 0],
): NoRef =>
  cena.criar("cylinder", { raioTopo: raio, raioBase: raio, altura, segmentos: 64 }, { nome, transform: { posicao, rotacao }, material });
```

## Os dois jeitos de posicionar, e quando usar cada um

Isto é o cerne de modelar em código: **quase nunca escreva uma coordenada de
mundo à mão.** Existem exatamente dois casos legítimos para calcular posição
manualmente; todo o resto é uma relação.

### 1. Relação com outra peça já existente → `face().colocar()` / `layout.ts`

"A perna vai na face de baixo do tampo." "A xícara fica em cima da mesa." "As
cadeiras ficam em círculo ao redor da mesa." Nenhuma dessas frases tem um
número em metros — então o código também não deveria ter:

```ts
tampo.face("base").colocar(perna, { u: 0.6, v: 0.3 }); // canto, relativo ao centro da face
colocarSobre(xicara, tampo);
circular(cadeiras, 1.2, { centro: [0, 0, 0] });
```

`u`/`v` em `face().colocar()` **são relativos ao centro da face**, no espaço
local do dono — não coordenadas de mundo, mesmo que o dono esteja girado. Ver
a tabela de frames no README antes de errar sinal de U/V numa face lateral.

### 2. Peça nova, cuja posição é definida por uma fórmula (ângulo, empilhamento) → transform explícito

Um ponteiro de relógio, um dente de engrenagem, uma vista explodida — a
posição não é "relativa a outra peça encostando", é o resultado de uma
fórmula que você mesmo escreve. Aqui sim o `posicao`/`rotacao` explícitos são
a ferramenta certa, mas **calculados**, nunca cravados:

```ts
// ponteiro do relógio: pivô no centro, comprimento na direção do ângulo
const a = fracaoDeVolta * TAU;
const x = Math.sin(a) * (comprimento / 2);
const z = -Math.cos(a) * (comprimento / 2);
caixa("ponteiro_minuto", largura, espessura, comprimento, [x, y, z], M.ponteiro, [0, a, 0]);
```

```ts
// vista explodida: cada camada empilha sobre a anterior + um gap fixo
let cursor = 0;
const empilhar = (altura: number): number => {
  const centro = cursor + altura / 2;
  cursor += altura + GAP_EXPLOSAO;
  return centro;
};
cilindro("caixa_traseira", 0.16, 0.02, [0, empilhar(0.02), 0], M.caixa);
cilindro("bateria", 0.012, 0.008, [0, empilhar(0.008), 0], M.prata);
```

Se você se pegar escrevendo um número de posição que não veio nem de uma
chamada de layout nem de uma fórmula local ao arquivo (um "magic number" que
só funciona porque você mediu no viewer e colou de volta), é sinal de estar
no caso errado — normalmente falta uma relação (`encostar`, `colocarSobre`,
`face().colocar()`) que resolveria aquilo sozinha.

## Peças articuladas ou assentadas: declare a relação, não só a posição

`face().colocar()` garante o encaixe **no momento em que você chama** — mas
se a peça nasceu para se mexer depois (um braço que gira, uma tampa que
abre), nada reconfere sozinho que a relação continua válida depois de
`girar()`/`mover()`/`deslocarMundo()`. Para isso existe `cena.acoplar`: uma
relação entre duas faces, guardada na cena, conferível em **qualquer pose**
— não um cálculo feito uma vez na criação e esquecido.

```ts
const braco = ombro.face("topo").colocar(caixa("braço", ...));
cena.acoplar({ tipo: "pivo", a: { no: ombro, face: "topo" }, b: { no: braco, face: "base" } });

// mais tarde, em qualquer pose:
braco.girar([0, angulo, 0]);              // gira em torno da normal compartilhada
const relatorio = cena.conferirMontagem(); // { passou, erros, piorCaso }
```

Dois tipos: `contato` (mesmo plano, normais opostas — uma peça assentada
sobre outra) e `pivo` (centros coincidentes, normais opostas — o eixo de
giro é a normal compartilhada). **`acoplar` só confere, nunca posiciona** —
quem posiciona continua sendo `face().colocar()`/layout/fórmula, como
sempre; se `conferirMontagem()` falhar, o bug está em como a peça foi
movida depois, não no acoplamento em si. Um par acoplado também para de
gerar aviso de interpenetração/flutuação entre si no linter, e ganha
`acoplamento-violado` se a relação deixar de valer.

Use isso sempre que o modelo tiver uma junta/articulação, ou uma peça
assentada que o resto do código pode mover depois — ver a seção
"[Acoplamentos](../README.md#acoplamentos--verificar-não-resolver)" do
README para a referência completa, e `examples/web/modelos/robo_frc.ts` para um
modelo real com dezenas de acoplamentos conferidos numa varredura de poses.

## Padrões que aparecem em quase todo modelo

### Peça repetida em grade/círculo: crie os nós primeiro, distribua depois

`grade()`, `circular()`, `distribuir()` operam sobre nós **já criados**. O
padrão é sempre "crie N vezes, depois distribua":

```ts
const pernas = [0, 1, 2, 3].map(() =>
  cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.04, altura: 0.69 }, { nome: "perna" }),
);
tampo.face("base").grade(pernas, 2, 2, { gapEntre: 0.12 });
```

### Peça girada ao redor de um pivô (ponteiro, pá de hélice, raio de roda)

Uma peça com um pivô numa ponta (não no centro) é criada **centrada na
própria origem local** como sempre, e a posição de mundo compensa metade do
comprimento na direção do ângulo — é a mesma conta do exemplo do ponteiro
acima. Generalizando: para uma peça de comprimento `L` que pivota num ponto
`P` e aponta na direção do ângulo `a` (medido a partir de "norte" = `-z`,
sentido horário visto de cima):

```ts
const direcao = (angulo: number): [number, number] => [Math.sin(angulo), -Math.cos(angulo)];
const [dx, dz] = direcao(a);
const posicao: V3 = [P[0] + dx * L / 2, P[1], P[2] + dz * L / 2];
// rotacao: [0, a, 0]; o comprimento L vai no eixo `profundidade` do box
```

### Vista explodida: um cursor de empilhamento com gap, não posições cravadas

Ver o exemplo de `empilhar()` acima. O ponto central: **o gap de explosão é
uma constante no topo do arquivo** (`const EXPLOSAO = 0.05`), nunca repetido
inline em cada chamada — trocar o valor uma vez deve reespaçar a peça
inteira. Se uma sub-montagem precisa de um gap menor (ex.: os ponteiros de um
relógio, empilhados entre si com menos folga que as camadas principais), crie
um segundo cursor com sua própria constante, não reaproveite o mesmo número
com significados diferentes.

### Objetos ao redor de um eixo, mas não em círculo perfeito (mesa retangular)

`circular()` espaça ângulos igualmente — perfeito para uma mesa redonda, mas
numa mesa retangular gera cadeiras alinhadas com as diagonais, não com os
lados. Nesse caso não force `circular()`: calcule a posição de cada grupo
como offset explícito ao longo do lado (`largura/4`, por exemplo) e a
rotação como `0` ou `PI` conforme o lado. Ainda é uma fórmula, não um número
solto — só não é a função de layout pronta.

## Verificando sem viewer

Todo o ciclo de feedback rápido (passo 2–4 do fluxo) não precisa de GPU nem
navegador — é por isso que o core existe separado do backend:

```ts
import { montarCena } from "./meu_modelo.ts";
import { writeFileSync } from "node:fs";

const cena = montarCena();
console.log(cena.avisosTexto() || "nenhum aviso");
console.log(cena.descrever());
writeFileSync("/tmp/cena.json", JSON.stringify(cena.toJSON(), null, 2));
```

`cena.toJSON()` é o ponto de entrada para qualquer verificação externa:

- **Servidor MCP** (`packages/mcp`): `carregar_cena_json` lê o arquivo,
  `avisos_cena`/`descrever_cena` reconferem, `exportar_cena` renderiza para
  `.glb`/`.obj`/`.stl` sem abrir navegador (usa `@snaple/three` headless).
- **Viewer web**: salve o arquivo em `examples/web/modelos/` e rode
  `npm run dev` — ele aparece sozinho no seletor, e o painel ao lado do
  canvas mostra os mesmos `descrever()`/`avisosTexto()` que o script
  imprimiu no terminal, então dá para conferir texto contra imagem sem sair
  da página.

## Imagens e movimento

- **Imagem na peça inteira** (madeira, tecido): `material.textura`.
  **Imagem numa região** (tela, rótulo, logo): `no.colarAdesivo(...)` — numa
  face plana, ou em `face: "lateral"` para a superfície curva de
  `cylinder`/`cone`/`lathe`. Imagens ficam em `examples/web/public/` e o
  `src` começa na raiz (`"texturas/x.png"`). Não precisa desenhar imagem:
  `examples/web/texturas/` tem um catálogo com vinte e sete texturas
  procedurais tileáveis (concreto, mármores, madeiras, tijolo, muro de
  pedra, tecidos, areia, neve, lava, couro, cortiça, terrazzo, parquet,
  xadrez, lousa, camuflagem, gelo, chapa diamante…) recriáveis com
  `node examples/web/texturas/gerar-texturas.ts`, mais doze links CC0
  prontos do Poly Haven (`TEXTURAS_PRONTAS` — o navegador baixa direto; se
  cair, vira aviso `textura-ausente` e a peça sai com a cor). Tudo listado em
  `examples/web/texturas/CATALOGO.md`, e a vitrine no viewer (modelo
  `texturas`) mostra uma amostra de cada numa mesa.
- **Peça que se mexe: modele a articulação como `junta`** e anime o
  `angulo` dela, não a `rotacao` da peça. A junta fica no eixo de giro
  (dobradiça na borda da caixa, não no centro da tampa), e o ângulo interpola
  como número, então dá voltas inteiras.
- **Gaveta, pistão, porta de correr:** `posicao` com `relativo: true`, que
  soma à pose onde o layout deixou a peça, em vez de você recalcular a
  posição absoluta.
- **Confira o movimento, não só a pose parada:**
  `cena.conferirAnimacaoTexto(nome)` roda o linter ao longo do ciclo e só
  mostra o que a cena parada não tem.

```ts
const dobradica = caixa.criar("junta", { eixo: "x", angulo: 0, limites: [-1.9, 0] },
  { transform: { posicao: [0, ALTURA / 2, -PROFUNDIDADE / 2] } }); // borda de trás
dobradica.criar("box", { largura: LARGURA, altura: 0.008, profundidade: PROFUNDIDADE },
  { transform: { posicao: [0, 0.004, PROFUNDIDADE / 2] } });
cena.animar("abrir", { repetir: "vaivem" })
  .faixa(dobradica, "angulo", [[0, 0], [1.5, -1.3]], { interpolacao: "suave" });
```

## Checklist antes de considerar o modelo pronto

- [ ] `avisosTexto()` não tem nada além do que você espera de propósito
      (interpenetração deliberada, flutuação de vista explodida ou peça na
      parede) — todo o resto foi corrigido, não ignorado.
- [ ] `descrever()` lê como a descrição que você daria da peça em português,
      sem surpresas de posição ("a leste" quando devia ser "no centro").
- [ ] Nenhuma coordenada de mundo foi cravada à mão sem vir de uma relação ou
      de uma fórmula local ao arquivo (ver seção acima).
- [ ] Constantes de medida (raio, altura, gap) têm nome — nenhum número mágico
      repetido em duas chamadas que deveriam variar juntas.
- [ ] `montarCena()` não tem efeito colateral (I/O, `console.log`) — só
      constrói e devolve a `Cena`.
- [ ] Toda junta/articulação e toda peça assentada que o código move depois
      de criada tem um `cena.acoplar` correspondente, e
      `cena.conferirMontagem()` passa nas poses que importam (ver seção
      acima).
- [ ] Toda animação passa em `cena.conferirAnimacaoTexto(nome)` (vazio), ou
      o que aparece é intencional.

## Erros comuns

- **Confundir `u`/`v` de face com X/Z de mundo.** `u`/`v` são sempre no plano
  local da face do dono; se o dono está girado no mundo, o plano gira junto,
  mas o significado de `u`/`v` para quem chama não muda. Ver a tabela de
  frames no README antes de supor sinal.
- **Calcular a posição de uma peça a partir da posição de outra peça
  manualmente**, em vez de usar `colocarSobre`/`encostar`/`face().colocar()`.
  Além de mais código, qualquer ajuste de medida na peça de origem exige
  reajustar a conta à mão em todo lugar que depende dela — a relação
  declarativa resolve isso de novo sozinha.
- **Reaproveitar `bbox()` onde a intenção era `bboxPropria()`** (ou
  vice-versa) ao escrever um helper próprio de posicionamento. Use
  `face()`/`colocarSobre`/etc. em vez de reimplementar com `bbox()` cru — é
  exatamente para isso que essas funções existem.
- **Ignorar um aviso de interpenetração real por vir junto com avisos
  esperados** (como os "flutuando" de uma vista explodida). Leia cada aviso
  individualmente; não assuma que o bloco inteiro é ruído só porque parte
  dele é.
- **Tentar CSG** (furo não-circular/retangular/poligonal numa face, corte
  passando por duas faces de normais diferentes, subtração de sólidos
  arbitrários). Não está implementado por design — ver "Limitações
  conhecidas" no README.

## Exemplos completos no repositório

Todos menos o último moram em `examples/web/modelos/` — abra o viewer
(`npm run dev`) e escolha qualquer um deles no seletor para ver ao vivo:

- [`examples/web/modelos/vitrine.ts`](../examples/web/modelos/vitrine.ts) —
  textura, adesivos (face plana, lateral de lata e de caneca) e duas
  animações com junta, `relativo` e `degrau`.
- [`examples/web/modelos/camera.ts`](../examples/web/modelos/camera.ts) —
  modelo mais denso do repo (uma câmera fotográfica inteira), bom exemplo de
  biblioteca de helpers ampliada quando a peça tem muitas sub-montagens
  repetidas (texto vetorial, parafusos, serrilhado).
- [`examples/web/modelos/relogio_explodido.ts`](../examples/web/modelos/relogio_explodido.ts)
  — vista explodida em camadas (cada camada é um `grupo`) com cursor de
  empilhamento, sub-montagens com gap próprio (engrenagens dentadas,
  ponteiros em `junta`), peças giradas por fórmula de ângulo (marcadores,
  numerais em relevo) e duas animações: "montagem" (explodida ⇄ montada,
  com cadeia de contatos reais na pose fechada) e "funcionando" (ponteiros
  e engrenagens girando em razão de dentes).
- [`examples/web/modelos/robo_frc.ts`](../examples/web/modelos/robo_frc.ts) —
  dezenas de juntas (`cena.acoplar` tipo `pivo`) e peças aparafusadas (tipo
  `contato`) conferidas com `cena.conferirMontagem()` numa varredura de
  poses; o exemplo de referência para a seção "Peças articuladas ou
  assentadas" acima.
- [`examples/web/modelos/clareira-low-poly.ts`](../examples/web/modelos/clareira-low-poly.ts)
  — estilo low poly: prismas por `extrude`, poucos segmentos, cor chapada e
  variação determinística. Guia do estilo em
  [`guia-low-poly.md`](guia-low-poly.md).
- [`examples/web/modelos/teste.ts`](../examples/web/modelos/teste.ts) —
  ponto de partida em branco (uma base e um marcador), pensado para copiar e
  editar quando o modelo ainda não tem nome definitivo.
- [`examples/oficina.ts`](../examples/oficina.ts) — cena de estresse: 8
  das 9 geometrias paramétricas (todas menos `helix`) mais `model`, furos
  (passante/parcial/polígono), faces com e sem reorientação, os três
  containers flex e as sete funções relacionais, tudo numa cena só. Roda no
  terminal (`node examples/oficina.ts`). Não aparece no viewer: exporta
  `montarOficina()`, não `montarCena()`, e o bloco de execução direta usa
  `process`, que não existe no navegador.
