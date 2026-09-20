/** Fonte de traços vetorial (dígitos, A–Z, alguns símbolos) e `texto()`,
 * que grava cada caractere como caixas finas em relevo sobre um `Plano`
 * arbitrário — `planoDeFace`/`planoDeLateral` constroem esse `Plano` a
 * partir de uma `Face` (superfície plana) ou de um ponto de `Lateral`
 * (superfície de revolução), então o mesmo `texto()` grava tanto num rótulo
 * plano quanto ao redor de um cilindro.
 *
 * Cada glifo é uma grade `LARGURA_GRADE × ALTURA_GRADE` (3 × 5 unidades);
 * `unidade` (em `OpcoesTexto`) é o tamanho de uma unidade dessa grade, em
 * metros. Caractere não coberto pela fonte é ignorado silenciosamente (só
 * avança o cursor) — é texto de propósito geral, não um leiaute que deva
 * falhar por um símbolo raro. */
import type { NoRef } from "./cena.ts";
import type { Face } from "./face.ts";
import type { Lateral } from "./lateral.ts";
import { eulerDeBase } from "./matriz.ts";
import type { Material } from "./tipos.ts";
import { type Vec3, escalar, normalizar, num, produtoVetorial, somar } from "./vetor.ts";

function somarEscalado(a: Vec3, direcao: Vec3, k: number): Vec3 {
  return somar(a, escalar(direcao, k));
}

export interface Plano {
  /** Centro do texto, no referencial de `pai`. */
  origem: Vec3;
  /** Direção de leitura (esquerda→direita), unitária. */
  direita: Vec3;
  /** Direção "para cima" no plano do texto, unitária. */
  cima: Vec3;
  /** Direção do relevo (para fora da superfície), unitária. */
  normal: Vec3;
}

export interface OpcoesTexto {
  /** Tamanho de uma unidade da grade do glifo, em metros. Padrão `0.01`. */
  unidade?: number;
  /** Espessura de cada traço, em metros. Padrão `unidade × 0.22`. */
  traco?: number;
  /** Altura do relevo ao longo da normal, em metros. Padrão `unidade × 0.03`. */
  relevo?: number;
  material?: Material;
  /** Onde `plano.origem` cai no texto. Padrão `"centro"`. */
  alinhamento?: "inicio" | "centro" | "fim";
}

const LARGURA_GRADE = 3;
const ALTURA_GRADE = 5;
const AVANCO = 4.5; // largura do caractere + espaço, em unidades de grade

type Traco = readonly [number, number, number, number];

const D: Record<string, readonly Traco[]> = {
  "0": [[0, 0, 3, 0], [3, 0, 3, 5], [3, 5, 0, 5], [0, 5, 0, 0]],
  "1": [[3, 0, 3, 5]],
  "2": [[0, 5, 3, 5], [3, 5, 3, 2.5], [3, 2.5, 0, 2.5], [0, 2.5, 0, 0], [0, 0, 3, 0]],
  "3": [[0, 5, 3, 5], [3, 5, 3, 0], [0, 0, 3, 0], [0, 2.5, 3, 2.5]],
  "4": [[0, 5, 0, 2.5], [0, 2.5, 3, 2.5], [3, 5, 3, 0]],
  "5": [[3, 5, 0, 5], [0, 5, 0, 2.5], [0, 2.5, 3, 2.5], [3, 2.5, 3, 0], [3, 0, 0, 0]],
  "6": [[0, 0, 0, 5], [0, 0, 3, 0], [3, 0, 3, 2.5], [0, 2.5, 3, 2.5]],
  "7": [[0, 5, 3, 5], [3, 5, 3, 0]],
  "8": [[0, 0, 3, 0], [3, 0, 3, 5], [3, 5, 0, 5], [0, 5, 0, 0], [0, 2.5, 3, 2.5]],
  "9": [[0, 5, 3, 5], [0, 5, 0, 2.5], [3, 5, 3, 0], [0, 2.5, 3, 2.5]],
  A: [[0, 0, 0, 3], [0, 3, 1.5, 5], [1.5, 5, 3, 3], [3, 3, 3, 0], [0, 2, 3, 2]],
  B: [[0, 0, 0, 5], [0, 5, 2.3, 5], [2.3, 5, 2.3, 2.5], [0, 2.5, 2.3, 2.5], [2.3, 2.5, 2.3, 0], [0, 0, 2.3, 0]],
  C: [[3, 5, 0, 5], [0, 5, 0, 0], [0, 0, 3, 0]],
  D: [[0, 0, 0, 5], [0, 5, 2, 5], [2, 5, 3, 4], [3, 4, 3, 1], [3, 1, 2, 0], [2, 0, 0, 0]],
  E: [[3, 5, 0, 5], [0, 5, 0, 0], [0, 0, 3, 0], [0, 2.5, 2.3, 2.5]],
  F: [[0, 0, 0, 5], [0, 5, 3, 5], [0, 2.5, 2.3, 2.5]],
  G: [[0, 0, 0, 5], [0, 5, 3, 5], [0, 0, 3, 0], [3, 0, 3, 2.5], [1.5, 2.5, 3, 2.5]],
  H: [[0, 0, 0, 5], [3, 0, 3, 5], [0, 2.5, 3, 2.5]],
  I: [[0, 5, 3, 5], [1.5, 5, 1.5, 0], [0, 0, 3, 0]],
  J: [[3, 5, 3, 1], [3, 1, 1.5, 0], [1.5, 0, 0, 1]],
  K: [[0, 0, 0, 5], [0, 2.5, 3, 5], [0, 2.5, 3, 0]],
  L: [[0, 5, 0, 0], [0, 0, 3, 0]],
  M: [[0, 0, 0, 5], [0, 5, 1.5, 2], [1.5, 2, 3, 5], [3, 5, 3, 0]],
  N: [[0, 0, 0, 5], [0, 5, 3, 0], [3, 0, 3, 5]],
  O: [[0, 0, 3, 0], [3, 0, 3, 5], [3, 5, 0, 5], [0, 5, 0, 0]],
  P: [[0, 0, 0, 5], [0, 5, 2.5, 5], [2.5, 5, 2.5, 2.5], [2.5, 2.5, 0, 2.5]],
  Q: [[0, 0, 3, 0], [3, 0, 3, 5], [3, 5, 0, 5], [0, 5, 0, 0], [1.5, 1.5, 3, 0]],
  R: [[0, 0, 0, 5], [0, 5, 2.5, 5], [2.5, 5, 2.5, 2.5], [2.5, 2.5, 0, 2.5], [1, 2.5, 3, 0]],
  S: [[3, 5, 0, 5], [0, 5, 0, 2.5], [0, 2.5, 3, 2.5], [3, 2.5, 3, 0], [3, 0, 0, 0]],
  T: [[0, 5, 3, 5], [1.5, 5, 1.5, 0]],
  U: [[0, 5, 0, 1], [0, 1, 1.5, 0], [1.5, 0, 3, 1], [3, 1, 3, 5]],
  V: [[0, 5, 1.5, 0], [1.5, 0, 3, 5]],
  W: [[0, 5, 0.75, 0], [0.75, 0, 1.5, 3], [1.5, 3, 2.25, 0], [2.25, 0, 3, 5]],
  X: [[0, 5, 3, 0], [0, 0, 3, 5]],
  Y: [[0, 5, 1.5, 2.5], [3, 5, 1.5, 2.5], [1.5, 2.5, 1.5, 0]],
  Z: [[0, 5, 3, 5], [3, 5, 0, 0], [0, 0, 3, 0]],
  "-": [[0.5, 2.5, 2.5, 2.5]],
  ".": [[1.4, 0, 1.6, 0.15]],
  ":": [[1.4, 1, 1.6, 1], [1.4, 3.5, 1.6, 3.5]],
  "/": [[0, 0, 3, 5]],
  "+": [[0.5, 2.5, 2.5, 2.5], [1.5, 1.5, 1.5, 3.5]],
};

/** Traços de um caractere (maiúsculas normalizadas), ou `[]` se não coberto
 * pela fonte (inclui espaço). */
export function tracosDoGlifo(c: string): readonly Traco[] {
  return D[c.toUpperCase()] ?? [];
}

/** `Plano` tangente a uma `Face` no ponto `(u, v)` — o texto fica raso sobre
 * a superfície plana. */
export function planoDeFace(face: Face, u: number, v: number): Plano {
  const f = face.frame;
  return { origem: face.pontoLocal(u, v), direita: f.u, cima: f.v, normal: f.normal };
}

/** `Plano` tangente a uma superfície de revolução (`Lateral`) no ponto
 * `(ângulo, altura)` — `direita` segue a direção angular (o texto lê "ao
 * redor" do cilindro/lathe), `cima` completa a base a partir da normal
 * real da superfície naquele ponto (então acompanha a inclinação de um
 * tronco de cone ou de um perfil qualquer, não só um cilindro reto). */
export function planoDeLateral(lateral: Lateral, angulo: number, altura: number): Plano {
  const { posicao, normal } = lateral.ponto(angulo, altura);
  const direita: Vec3 = [Math.cos(angulo), 0, -Math.sin(angulo)];
  const cima = normalizar(produtoVetorial(normal, direita));
  return { origem: posicao, direita, cima, normal };
}

/** Escreve `txt` como traços finos em relevo sobre `plano`, como filhos
 * (encadeados) de `pai`. Cada caractere vira uma cadeia pai→filho de
 * caixas — uma por traço — para que o linter (que ignora pares
 * ancestral/descendente) trate os traços de UM caractere como um conjunto
 * só; caracteres diferentes continuam sendo checados entre si normalmente
 * (dois rótulos colados por engano ainda geram aviso). Devolve o primeiro
 * nó (a "raiz") de cada caractere escrito — `[]` para espaço. */
export function texto(
  pai: NoRef, nome: string, txt: string, plano: Plano, opcoes: OpcoesTexto = {},
): NoRef[] {
  const cena = pai.cena;
  const unidade = num(opcoes.unidade, 0.01);
  const traco = num(opcoes.traco, unidade * 0.22);
  const relevo = num(opcoes.relevo, unidade * 0.03);
  const alinhamento = opcoes.alinhamento ?? "centro";

  const caracteres = [...txt];
  const larguraTotal = Math.max(0, caracteres.length - 1) * AVANCO * unidade;
  const offsetAlinhamento =
    alinhamento === "centro" ? -larguraTotal / 2 : alinhamento === "fim" ? -larguraTotal : 0;

  const raizes: NoRef[] = [];
  caracteres.forEach((c, i) => {
    const tracos = tracosDoGlifo(c);
    if (tracos.length === 0) return;
    const origemChar = somarEscalado(plano.origem, plano.direita, offsetAlinhamento + i * AVANCO * unidade);

    let anterior: NoRef | undefined;
    tracos.forEach(([x0, y0, x1, y1], j) => {
      const dx = (x1 - x0) * unidade, dy = (y1 - y0) * unidade;
      const comprimento = Math.hypot(dx, dy) || unidade;
      const eixoTraco = somar(escalar(plano.direita, dx / comprimento), escalar(plano.cima, dy / comprimento));
      const mu = (x0 + x1) / 2 - LARGURA_GRADE / 2;
      const mv = (y0 + y1) / 2 - ALTURA_GRADE / 2;
      const centro = somarEscalado(
        somarEscalado(somarEscalado(origemChar, plano.direita, mu * unidade), plano.cima, mv * unidade),
        plano.normal, relevo / 2,
      );
      const ez = produtoVetorial(eixoTraco, plano.normal);
      const rotacao = eulerDeBase(eixoTraco, plano.normal, ez);

      // sempre criada como filha de `pai`, com `centro`/`rotacao` já no
      // referencial DELE — é o referencial em que este método inteiro
      // calcula tudo. Encadear como filha do traço ANTERIOR (abaixo) é um
      // passo à parte, só para o linter: `reparentar` preserva a pose
      // mundial, então a posição/rotação já corretas aqui não mudam.
      const segmento = pai.criar(
        "box",
        { largura: comprimento + traco, altura: relevo, profundidade: traco },
        { nome: `${nome}_${i}_${j}`, transform: { posicao: centro, rotacao }, ...(opcoes.material ? { material: opcoes.material } : {}) },
      );
      if (anterior) cena.reparentar(segmento.id, anterior.id);
      if (j === 0) raizes.push(segmento);
      anterior = segmento;
    });
  });
  return raizes;
}
