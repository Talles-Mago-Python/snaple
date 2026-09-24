/** Snapshot mundial da árvore: para cada nó, a matriz acumulada, a AABB da
 * sua geometria PRÓPRIA e a AABB de toda a sua subárvore.
 *
 * A distinção entre as duas é o que faz `mesa.face("base")` devolver a face
 * de baixo do TAMPO e não a de baixo do conjunto tampo+pernas: faces saem da
 * geometria própria, layout sai da subárvore inteira. */
import { type Mat4, compor, identidade, multiplicar } from "./matriz.ts";
import { type AABB, aabbProprio, aabbDeCentroTamanho, unirAABB } from "./bbox.ts";
import { ehFlex, rotacaoEfetiva } from "./no.ts";
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
    const m = multiplicar(matriz, compor(filho.transform.posicao, rotacaoEfetiva(filho), filho.transform.escala));
    acc = unirAABB(acc, aabbSubarvore(filho, m));
  }
  return acc;
}

/** Extensão da subárvore de `no` no espaço do PAI, ignorando a translação do
 * próprio nó — ou seja: "que caixa esse nó ocupa se eu puser a origem dele
 * em (0,0,0)". Rotação e escala próprias CONTAM. */
export function aabbRelativa(no: No): AABB {
  const m = compor([0, 0, 0], rotacaoEfetiva(no), no.transform.escala);
  return aabbSubarvore(no, m) ?? aabbDeCentroTamanho([0, 0, 0], [0, 0, 0]);
}

export function calcularMundo(raiz: No): Mundo {
  return calcularMundoComTotais(raiz).mundo;
}

/** O snapshot mundial mais o que `atualizarMundo` precisa para depois
 * recalcular só um pedaço dele. */
export interface MundoIncremental {
  mundo: Map<string, NoMundo>;
  /** AABB da subárvore por id, `null` para containers vazios — ao contrário
   * de `NoMundo.total`, que vira um ponto degenerado. É o valor que entra na
   * união do pai. */
  totais: Map<string, AABB | null>;
  /** Algum nó da árvore é `row`/`column`/`stack`? Nesse caso a resolução
   * flex pode mover irmãos e tios de quem mudou, e só o cálculo completo
   * serve. */
  temFlex: boolean;
}

export function calcularMundoComTotais(raiz: No): MundoIncremental {
  const r: MundoIncremental = { mundo: new Map(), totais: new Map(), temFlex: false };
  visitar(raiz, null, null, [], r, null);
  return r;
}

/** O que mudou na árvore desde o último snapshot — ver `atualizarMundo`. */
export interface MudancasMundo {
  /** Nós cuja subárvore inteira precisa ser recalculada (transform/params
   * mudaram, ou o nó acabou de entrar/mudar de pai), com o pai ATUAL de cada
   * um. Nenhum descende de outro — o chamador já filtrou. */
  sujos: readonly { no: No; pai: No | null }[];
  /** Nós que continuam onde estavam, mas perderam um filho: só a caixa total
   * deles (e dos ancestrais) muda. */
  caixas: readonly No[];
  /** Ids que saíram da árvore. */
  removidos: Iterable<string>;
  /** A pré-ordem mudou (reparentamento, remoção)? */
  reordenar: boolean;
}

/** Recalcula só as subárvores sujas e as caixas totais dos ancestrais delas,
 * partindo de um snapshot anterior. Devolve um snapshot NOVO (o anterior
 * continua válido para quem o guardou) ou `null` quando o incremental não
 * serve e o chamador deve recalcular tudo. O resultado é idêntico, número a
 * número, ao de `calcularMundoComTotais` — as contas são as mesmas. */
export function atualizarMundo(
  raiz: No,
  anterior: MundoIncremental,
  mudancas: MudancasMundo,
): MundoIncremental | null {
  if (anterior.temFlex) return null;
  const r: MundoIncremental = {
    mundo: new Map(anterior.mundo),
    totais: new Map(anterior.totais),
    temFlex: false,
  };
  for (const id of mudancas.removidos) {
    r.mundo.delete(id);
    r.totais.delete(id);
  }
  const vistos = new Set<string>();
  // primeiro TODAS as subárvores sujas, depois os ancestrais: dois irmãos
  // sujos precisam estar ambos recalculados antes de o pai reunir as caixas
  for (const { no, pai } of mudancas.sujos) {
    const mPai = pai ? r.mundo.get(pai.id) : null;
    if (mPai === undefined) return null;
    visitar(no, pai, mPai?.matriz ?? null, mPai ? [...mPai.ancestrais, pai!.id] : [], r, vistos);
    if (r.temFlex) return null;
  }
  // cada passada sobe até a raiz; um ancestral comum a várias é refeito mais
  // de uma vez, e a ÚLTIMA já vê todos os filhos atualizados (qualquer
  // caminho que passe por um filho passa depois por ele)
  const inicios = [...mudancas.sujos.map((s) => s.pai), ...mudancas.caixas];
  for (const inicio of inicios) {
    for (let a = inicio ? r.mundo.get(inicio.id) : undefined; a; a = a.pai ? r.mundo.get(a.pai.id) : undefined) {
      let total = a.propria;
      for (const filho of a.no.filhos) {
        const t = r.totais.get(filho.id);
        if (t === undefined) return null;
        total = unirAABB(total, t);
      }
      r.totais.set(a.no.id, total);
      r.mundo.set(a.no.id, { ...a, total: total ?? pontoNaOrigem(a.matriz) });
    }
  }
  // quem itera o mundo (linter, descrever) conta com a pré-ordem da árvore,
  // a mesma do cálculo completo; nó novo teria entrado no fim do Map
  if (mudancas.reordenar || r.mundo.size !== anterior.mundo.size) {
    const ordenado = emPreOrdem(raiz, r.mundo);
    if (!ordenado) return null;
    r.mundo = ordenado;
  }
  return r;
}

function emPreOrdem(raiz: No, mapa: Map<string, NoMundo>): Map<string, NoMundo> | null {
  const ordenado = new Map<string, NoMundo>();
  const pilha = [raiz];
  while (pilha.length) {
    const no = pilha.pop()!;
    const m = mapa.get(no.id);
    if (!m) return null;
    ordenado.set(no.id, m);
    for (let i = no.filhos.length - 1; i >= 0; i--) pilha.push(no.filhos[i]!);
  }
  return ordenado.size === mapa.size ? ordenado : null;
}

function pontoNaOrigem(matriz: Mat4): AABB {
  return aabbDeCentroTamanho([matriz[12]!, matriz[13]!, matriz[14]!], [0, 0, 0]);
}

/** Pré-ordem para as matrizes, pós-ordem para a AABB total: a caixa da
 * subárvore é a própria unida às totais dos filhos, já calculadas. Antes cada
 * nó rodava `aabbSubarvore` na subárvore inteira de novo — O(n·profundidade)
 * — e o resultado é o mesmo, porque a matriz de cada filho é exatamente o
 * mesmo produto `matriz do pai × local`.
 *
 * `vistos` é `null` no cálculo completo (o mapa começa vazio, então `has`
 * basta para achar id duplicado); no incremental o mapa já tem os ids
 * antigos, e duplicado é um id visto duas vezes nesta passada ou que já
 * pertence a OUTRO nó. */
function visitar(
  no: No,
  pai: No | null,
  matrizPai: Mat4 | null,
  ancestrais: readonly string[],
  r: MundoIncremental,
  vistos: Set<string> | null,
): AABB | null {
  const existente = r.mundo.get(no.id);
  if (vistos ? vistos.has(no.id) || (existente && existente.no !== no) : existente) {
    throw new Error(`id duplicado na árvore: '${no.id}'`);
  }
  vistos?.add(no.id);
  if (ehFlex(no)) r.temFlex = true;
  const local = compor(no.transform.posicao, rotacaoEfetiva(no), no.transform.escala);
  const matriz = matrizPai ? multiplicar(matrizPai, local) : local;
  const propria = aabbProprio(no, matriz);
  const entrada: NoMundo = { no, pai, matriz, propria, total: propria!, ancestrais };
  r.mundo.set(no.id, entrada);
  const ancestraisFilhos = [...ancestrais, no.id];
  let total = propria;
  for (const filho of no.filhos) {
    total = unirAABB(total, visitar(filho, no, matriz, ancestraisFilhos, r, vistos));
  }
  r.totais.set(no.id, total);
  // container vazio vira um ponto na própria origem, mas para o PAI continua
  // sem contribuir nada (é o `null` que `aabbSubarvore` devolveria)
  entrada.total = total ?? pontoNaOrigem(matriz);
  return total;
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
