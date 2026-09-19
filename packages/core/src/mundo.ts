/** Snapshot mundial da árvore: para cada nó, a matriz acumulada, a AABB da
 * sua geometria PRÓPRIA e a AABB de toda a sua subárvore.
 *
 * A distinção entre as duas é o que faz `mesa.face("base")` devolver a face
 * de baixo do TAMPO e não a de baixo do conjunto tampo+pernas: faces saem da
 * geometria própria, layout sai da subárvore inteira. */
import { type Mat4, compor, identidade, multiplicar } from "./matriz.ts";
import { type AABB, aabbProprio, aabbDeCentroTamanho, unirAABB } from "./bbox.ts";
import { percorrer } from "./no.ts";
import type { No } from "./tipos.ts";

export interface NoMundo {
  no: No;
  pai: No | null;
  /** Matriz local→mundo, já com toda a cadeia de ancestrais. */
  matriz: Mat4;
  /** AABB só da geometria do próprio nó. `null` em containers. */
  propria: AABB | null;
  /** AABB do nó + toda a subárvore. Nunca `null` (containers vazios viram um
   * ponto degenerado na origem do container). */
  total: AABB;
  /** Ancestrais, da raiz até o pai direto. */
  ancestrais: readonly string[];
}

export type Mundo = ReadonlyMap<string, NoMundo>;

/** AABB da subárvore de `no` num espaço arbitrário, dada a matriz acumulada
 * do próprio `no`. Usada tanto aqui quanto pelo layout flex, que precisa da
 * extensão de um filho ANTES de decidir onde colocá-lo. */
export function aabbSubarvore(no: No, matriz: Mat4): AABB | null {
  let acc = aabbProprio(no, matriz);
  for (const filho of no.filhos) {
    const m = multiplicar(matriz, compor(filho.transform.posicao, filho.transform.rotacao, filho.transform.escala));
    acc = unirAABB(acc, aabbSubarvore(filho, m));
  }
  return acc;
}

/** Extensão da subárvore de `no` no espaço do PAI, ignorando a translação do
 * próprio nó — ou seja: "que caixa esse nó ocupa se eu puser a origem dele
 * em (0,0,0)". Rotação e escala próprias CONTAM. */
export function aabbRelativa(no: No): AABB {
  const m = compor([0, 0, 0], no.transform.rotacao, no.transform.escala);
  return aabbSubarvore(no, m) ?? aabbDeCentroTamanho([0, 0, 0], [0, 0, 0]);
}

export function calcularMundo(raiz: No): Mundo {
  const mapa = new Map<string, NoMundo>();
  const matrizes = new Map<string, Mat4>();
  const ancestraisDe = new Map<string, string[]>();

  for (const { no, pai } of percorrer(raiz)) {
    if (mapa.has(no.id)) {
      throw new Error(`id duplicado na árvore: '${no.id}'`);
    }
    const local = compor(no.transform.posicao, no.transform.rotacao, no.transform.escala);
    const matriz = pai ? multiplicar(matrizes.get(pai.id)!, local) : local;
    matrizes.set(no.id, matriz);
    const ancestrais = pai ? [...ancestraisDe.get(pai.id)!, pai.id] : [];
    ancestraisDe.set(no.id, ancestrais);
    mapa.set(no.id, {
      no,
      pai,
      matriz,
      propria: aabbProprio(no, matriz),
      total: aabbSubarvore(no, matriz)
        ?? aabbDeCentroTamanho([matriz[12]!, matriz[13]!, matriz[14]!], [0, 0, 0]),
      ancestrais,
    });
  }
  return mapa;
}

/** Matriz do pai de `id` (identidade se for raiz) — usada para converter um
 * ponto do mundo para o espaço local onde `transform.posicao` é gravada. */
export function matrizDoPai(mundo: Mundo, id: string): Mat4 {
  const m = mundo.get(id);
  if (!m) throw new Error(`nó '${id}' não está na cena`);
  return m.pai ? mundo.get(m.pai.id)!.matriz : identidade();
}

/** `a` é ancestral ou descendente de `b`? Pares assim são ignorados na
 * detecção de interpenetração (uma perna DEVE tocar o tampo). */
export function saoParentes(mundo: Mundo, a: string, b: string): boolean {
  const ma = mundo.get(a), mb = mundo.get(b);
  if (!ma || !mb) return false;
  return ma.ancestrais.includes(b) || mb.ancestrais.includes(a);
}
