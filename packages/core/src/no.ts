/** Construção e travessia de nós. */
import type {
  Feature, Material, No, ParamsDe, TipoNo, Transform, TransformParcial,
} from "./tipos.ts";
import type { Vec3 } from "./vetor.ts";

export const TIPOS_NO: readonly TipoNo[] = [
  "box", "sphere", "cylinder", "cone", "plane", "torus", "extrude", "lathe",
  "model", "grupo", "row", "column", "stack",
];

export const TIPOS_CONTAINER: readonly TipoNo[] = ["grupo", "row", "column", "stack"];
export const TIPOS_FLEX: readonly TipoNo[] = ["row", "column", "stack"];

export function ehContainer(no: No): boolean {
  return TIPOS_CONTAINER.includes(no.tipo);
}

export function ehFlex(no: No): boolean {
  return TIPOS_FLEX.includes(no.tipo);
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
  };
}

/** Percorre a árvore em pré-ordem, dando o nó e o pai (null na raiz). */
export function* percorrer(raiz: No, pai: No | null = null): Generator<{ no: No; pai: No | null }> {
  yield { no: raiz, pai };
  for (const filho of raiz.filhos) yield* percorrer(filho, raiz);
}

export function encontrar(raiz: No, id: string): No | null {
  for (const { no } of percorrer(raiz)) if (no.id === id) return no;
  return null;
}

export function clonarNo(no: No): No {
  return structuredClone(no) as No;
}
