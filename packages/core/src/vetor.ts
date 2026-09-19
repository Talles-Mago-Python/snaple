/** Vetores e números. Unidade do projeto: METROS. Convenção de eixo: Y-up,
 * destro (+x leste, +y cima, +z sul). Ver `spec/README.md`. */

/** Ponto/direção em 3D, sempre em metros. */
export type Vec3 = [number, number, number];
/** Ponto 2D num plano de trabalho (face, perfil de extrusão/revolução). */
export type Ponto2D = [number, number];
/** Índice de eixo: 0=x, 1=y, 2=z. */
export type IndiceEixo = 0 | 1 | 2;
/** Nome de eixo tal como aparece na API pública. */
export type Eixo = "x" | "y" | "z";

export const EIXOS: readonly Eixo[] = ["x", "y", "z"];

/** Tolerância padrão para comparações de posição, em metros (1 µm).
 * Abaixo disto duas coordenadas são "a mesma" para efeito de layout. */
export const EPS = 1e-9;

export function indiceDoEixo(eixo: Eixo): IndiceEixo {
  const i = EIXOS.indexOf(eixo);
  if (i < 0) throw new Error(`eixo inválido: '${eixo}' (use 'x', 'y' ou 'z')`);
  return i as IndiceEixo;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function clonarVec3(v: Vec3): Vec3 {
  return [v[0], v[1], v[2]];
}

export function somar(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtrair(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function escalar(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

export function comprimento(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function normalizar(v: Vec3): Vec3 {
  const c = comprimento(v);
  return c < EPS ? [0, 0, 0] : [v[0] / c, v[1] / c, v[2] / c];
}

export function distancia(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Converte qualquer entrada numérica duvidosa num número finito.
 * Params vindos de JSON externo podem trazer `null`/string — sem isto, um
 * `NaN` se propagaria silenciosamente por toda a bounding box. */
export function num(v: unknown, padrao = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : padrao;
}

/** Arredonda para `casas` casas decimais. Usado só na formatação de texto
 * (avisos, `descrever()`), nunca no cálculo de layout. */
export function arred(v: number, casas = 3): number {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}
