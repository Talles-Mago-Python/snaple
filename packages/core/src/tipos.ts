/** Modelo de dados da cena. Tudo aqui é JSON puro e serializável.
 *
 * Regra inegociável do projeto: **o estado nunca guarda malha**. Só
 * parâmetros. Vértices/índices são SEMPRE derivados (ver `geometria.ts`), o
 * que é o que mantém um furo editável depois de feito e faz a cena sobreviver
 * à troca de backend. */
import type { Ponto2D, Vec3 } from "./vetor.ts";

/** Versão do formato de cena serializado. Incrementada só em mudança
 * incompatível; o JSON Schema normativo vive em `spec/cena.schema.json`. */
export const VERSAO_CENA = 1 as const;

// ── Transform ────────────────────────────────────────────────────────────

/** Rotação em RADIANOS, Euler XYZ intrínseca. Escala é multiplicativa. */
export interface Transform {
  posicao: Vec3;
  rotacao: Vec3;
  escala: Vec3;
}

export type TransformParcial = Partial<Transform>;

// ── Tipos de nó ──────────────────────────────────────────────────────────

/** Geometrias paramétricas. Todas centradas na PRÓPRIA origem local — ver
 * `bbox.ts` para por que essa invariante simplifica todo o resto. */
export type TipoGeometria =
  | "box" | "sphere" | "cylinder" | "cone" | "plane" | "torus"
  | "extrude" | "lathe";

/** Nó que referencia um arquivo externo por `src`, com `tamanho` declarado. */
export type TipoModelo = "model";

/** Containers: não têm geometria própria, só organizam filhos. */
export type TipoContainer = "grupo" | "row" | "column" | "stack";

export type TipoNo = TipoGeometria | TipoModelo | TipoContainer;

// ── Params por tipo ──────────────────────────────────────────────────────

export interface ParamsBox { largura: number; altura: number; profundidade: number }
export interface ParamsSphere { raio: number; segmentos?: number }
/** `raioTopo`/`raioBase` diferentes dão um tronco de cone; iguais, um
 * cilindro reto (o único caso em que `furo` é possível sem CSG). */
export interface ParamsCylinder { raioTopo: number; raioBase: number; altura: number; segmentos?: number }
export interface ParamsCone { raio: number; altura: number; segmentos?: number }
/** Superfície plana no plano XZ local (normal = +y), espessura zero. */
export interface ParamsPlane { largura: number; profundidade: number }
/** Anel no plano XZ local, eixo de simetria em +y. */
export interface ParamsTorus { raio: number; raioTubo: number; segmentos?: number; segmentosTubo?: number }
/** Perfil 2D fechado no plano XZ local (u=x, v=z), extrudado ao longo de +y. */
export interface ParamsExtrude { perfil: Ponto2D[]; altura: number }
/** Perfil `[raio, altura]` revolucionado em torno do eixo +y local. */
export interface ParamsLathe { perfil: Ponto2D[]; segmentos?: number }
/** Objeto por referência. `tamanho` é a bounding box DECLARADA e é o que o
 * layout usa — sem carregar o arquivo, exatamente como `width`/`height` num
 * `<img>`. Se `src` não existir, o backend desenha uma caixa proxy. */
export interface ParamsModel { src: string; tamanho: Vec3 }

export type Justify =
  | "start" | "center" | "end"
  | "space-between" | "space-around" | "space-evenly";
export type Align = "start" | "center" | "end";

/** Params comuns a `row`/`column`/`stack`. `extensao` é o tamanho do
 * container no eixo principal, em metros; sem ele os filhos ficam apenas
 * empacotados com `gap` e centrados na origem do container (não há espaço
 * livre a distribuir, então `justify` space-* vira `center`). */
export interface ParamsFlex {
  extensao?: number;
  gap?: number;
  justify?: Justify;
  align?: Align;
}

export type ParamsGrupo = Record<string, never>;

/** Mapa tipo → forma dos params. É o que dá autocomplete correto em
 * `cena.criar('box', { ... })` sem `any`. */
export interface ParamsPorTipo {
  box: ParamsBox;
  sphere: ParamsSphere;
  cylinder: ParamsCylinder;
  cone: ParamsCone;
  plane: ParamsPlane;
  torus: ParamsTorus;
  extrude: ParamsExtrude;
  lathe: ParamsLathe;
  model: ParamsModel;
  grupo: ParamsGrupo;
  row: ParamsFlex;
  column: ParamsFlex;
  stack: ParamsFlex;
}

export type ParamsDe<T extends TipoNo> = ParamsPorTipo[T];
export type ParamsQualquer = ParamsPorTipo[TipoNo];

// ── Faces ────────────────────────────────────────────────────────────────

/** Nomes semânticos das 6 faces. Os aliases de eixo são aceitos em toda a
 * API e normalizados para estes nomes. */
export type NomeFace = "topo" | "base" | "norte" | "sul" | "leste" | "oeste";
export type AliasFace = "+y" | "-y" | "-z" | "+z" | "+x" | "-x";
export type FaceEntrada = NomeFace | AliasFace;

// ── Features ─────────────────────────────────────────────────────────────

export interface FormaCirculo { tipo: "circulo"; raio: number; segmentos?: number }
export interface FormaRetangulo { tipo: "retangulo"; largura: number; altura: number }
/** Polígono fechado no plano da face, coordenadas (u,v) relativas ao centro
 * do furo — não ao centro da face. */
export interface FormaPoligono { tipo: "poligono"; pontos: Ponto2D[] }
export type FormaFuro = FormaCirculo | FormaRetangulo | FormaPoligono;

/** Furo paramétrico. Fica GUARDADO no nó (é estado, não uma operação
 * destrutiva): muda-se o raio e a geometria é regerada.
 * `u`/`v` são coordenadas no plano da face, com origem no centro da face.
 * `profundidade` omitida = furo passante. */
export interface FeatureFuro {
  tipo: "furo";
  face: FaceEntrada;
  forma: FormaFuro;
  u: number;
  v: number;
  profundidade?: number;
}

export type Feature = FeatureFuro;

// ── Material ─────────────────────────────────────────────────────────────

/** Descrição de aparência NEUTRA — deliberadamente sem nenhum nome de campo
 * do Three.js. Cada backend traduz para o seu próprio modelo de material. */
export interface Material {
  cor?: string;
  metalico?: number;
  rugosidade?: number;
  opacidade?: number;
  aramado?: boolean;
}

// ── Nó ───────────────────────────────────────────────────────────────────

export interface No<T extends TipoNo = TipoNo> {
  id: string;
  tipo: T;
  /** Rótulo semântico opcional ("mesa", "xícara"). É o que permite
   * `descrever()` gerar prosa em vez de dizer "uma box". */
  nome?: string;
  params: ParamsPorTipo[T];
  transform: Transform;
  material?: Material;
  filhos: No[];
  features: Feature[];
}

export type NoQualquer = No<TipoNo>;

// ── Cena serializada ─────────────────────────────────────────────────────

export interface CenaJSON {
  version: typeof VERSAO_CENA;
  /** Sempre "m" na v1. Explícito para que nenhum backend precise adivinhar. */
  unidade: "m";
  /** Sempre "y" na v1. Um backend Z-up converte na fronteira dele. */
  eixoCima: "y";
  raiz: No;
}
