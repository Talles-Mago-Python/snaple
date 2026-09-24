/** Construção e travessia de nós. */
import type {
  Feature, Material, No, ParamsDe, ParamsJunta, TipoNo, Transform, TransformParcial, Validacao,
} from "./tipos.ts";
import { type Vec3, indiceDoEixo } from "./vetor.ts";

export const TIPOS_NO: readonly TipoNo[] = [
  "box", "sphere", "cylinder", "cone", "plane", "torus", "extrude", "lathe", "helix", "sweep",
  "model", "grupo", "row", "column", "stack", "junta",
];

export const TIPOS_CONTAINER: readonly TipoNo[] = ["grupo", "row", "column", "stack", "junta"];
export const TIPOS_FLEX: readonly TipoNo[] = ["row", "column", "stack"];

export function ehContainer(no: No): boolean {
  return TIPOS_CONTAINER.includes(no.tipo);
}

export function ehFlex(no: No): boolean {
  return TIPOS_FLEX.includes(no.tipo);
}

/** A rotação REALMENTE aplicada ao resolver o mundo: para todo nó, exceto
 * `junta`, é `transform.rotacao`. Para `junta`, `transform.rotacao` é
 * ignorada — a rotação vem de `params.angulo` em torno de `params.eixo`. É
 * o que faz mudar a pose de uma junta ser `definirParams`, não
 * `transformar`. Usada em todo lugar que hoje lê `no.transform.rotacao`
 * para montar a matriz de mundo (`mundo.ts`) ou construir a malha
 * (`@snaple/three`). */
export function rotacaoEfetiva(no: No): Vec3 {
  if (no.tipo !== "junta") return no.transform.rotacao;
  const p = no.params as ParamsJunta;
  const r: Vec3 = [0, 0, 0];
  r[indiceDoEixo(p.eixo)] = p.angulo;
  return r;
}

export function transformPadrao(): Transform {
  return { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] };
}

function v3(v: Vec3 | undefined, padrao: Vec3): Vec3 {
  return v ? [v[0], v[1], v[2]] : [padrao[0], padrao[1], padrao[2]];
}

export function mesclarTransform(base: Transform, novo?: TransformParcial): Transform {
  return {
    posicao: v3(novo?.posicao, base.posicao),
    rotacao: v3(novo?.rotacao, base.rotacao),
    escala: v3(novo?.escala, base.escala),
  };
}

export interface OpcoesNo {
  id?: string;
  nome?: string;
  transform?: TransformParcial;
  material?: Material;
  features?: Feature[];
  filhos?: No[];
  validacao?: Validacao;
}

export function criarNo<T extends TipoNo>(
  tipo: T,
  params: ParamsDe<T>,
  opcoes: OpcoesNo = {},
): No<T> {
  if (!TIPOS_NO.includes(tipo)) {
    throw new Error(`tipo de nó inválido: '${tipo}' (use um de ${TIPOS_NO.join(", ")})`);
  }
  return {
    id: opcoes.id ?? "",
    tipo,
    ...(opcoes.nome !== undefined ? { nome: opcoes.nome } : {}),
    params: { ...(params as object) } as ParamsDe<T>,
    transform: mesclarTransform(transformPadrao(), opcoes.transform),
    ...(opcoes.material ? { material: { ...opcoes.material } } : {}),
    filhos: opcoes.filhos ?? [],
    features: opcoes.features ?? [],
    ...(opcoes.validacao ? { validacao: { ...opcoes.validacao } } : {}),
  };
}

/** Percorre a árvore em pré-ordem, dando o nó e o pai (null na raiz). */
export function* percorrer(raiz: No, pai: No | null = null): Generator<{ no: No; pai: No | null }> {
  // pilha explícita em vez de `yield*` recursivo: cada nível de `yield*`
  // repassa o valor por todos os geradores ancestrais, o que custava
  // O(profundidade) por nó visitado
  const pilha: { no: No; pai: No | null }[] = [{ no: raiz, pai }];
  while (pilha.length) {
    const atual = pilha.pop()!;
    yield atual;
    const filhos = atual.no.filhos;
    for (let i = filhos.length - 1; i >= 0; i--) pilha.push({ no: filhos[i]!, pai: atual.no });
  }
}

export function encontrar(raiz: No, id: string): No | null {
  for (const { no } of percorrer(raiz)) if (no.id === id) return no;
  return null;
}

/** Índice `id → { nó, pai }` de toda a subárvore de `raiz`. */
export function indexar(
  raiz: No,
  pai: No | null = null,
  indice = new Map<string, { no: No; pai: No | null }>(),
): Map<string, { no: No; pai: No | null }> {
  for (const entrada of percorrer(raiz, pai)) indice.set(entrada.no.id, entrada);
  return indice;
}

export function clonarNo(no: No): No {
  return structuredClone(no) as No;
}
