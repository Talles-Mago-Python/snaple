/** Matriz 4x4 em ordem coluna-maior (mesma ordem de memória do WebGL e do
 * Three.js), usada só internamente: a API pública nunca expõe matrizes, só
 * `Transform` (posição/rotação/escala). Rotação é sempre Euler XYZ intrínseca
 * em RADIANOS — a mesma convenção padrão do Three.js (`Object3D.rotation.order
 * === 'XYZ'`), documentada no spec para que outro backend reproduza. */
import { type Vec3, EPS } from "./vetor.ts";

/** 16 números em ordem coluna-maior. */
export type Mat4 = number[];

export function identidade(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Matriz de rotação 3x3 (devolvida como 9 componentes em ordem LINHA-maior)
 * para a ordem de Euler XYZ. Mesmas contas de `Euler.toMatrix4` do Three.js. */
function rot3(rx: number, ry: number, rz: number): number[] {
  const a = Math.cos(rx), b = Math.sin(rx);
  const c = Math.cos(ry), d = Math.sin(ry);
  const e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c,
  ];
}

/** Compõe translação × rotação × escala numa única Mat4. */
export function compor(posicao: Vec3, rotacao: Vec3, escala: Vec3): Mat4 {
  const r = rot3(rotacao[0], rotacao[1], rotacao[2]);
  const [sx, sy, sz] = escala;
  return [
    r[0]! * sx, r[3]! * sx, r[6]! * sx, 0,
    r[1]! * sy, r[4]! * sy, r[7]! * sy, 0,
    r[2]! * sz, r[5]! * sz, r[8]! * sz, 0,
    posicao[0], posicao[1], posicao[2], 1,
  ];
}

/** As três colunas da matriz de rotação pura de um Euler XYZ — os eixos
 * locais (`ex`, `ey`, `ez`) expressos no referencial do pai. Mesma conta de
 * `rot3`, só reorganizada como três `Vec3` em vez de 9 números linha-maior;
 * é o que `compor` já usa internamente (`r[0],r[3],r[6]` = `ex`, etc). */
export function baseDeEuler(rotacao: Vec3): { ex: Vec3; ey: Vec3; ez: Vec3 } {
  const r = rot3(rotacao[0], rotacao[1], rotacao[2]);
  return {
    ex: [r[0]!, r[3]!, r[6]!],
    ey: [r[1]!, r[4]!, r[7]!],
    ez: [r[2]!, r[5]!, r[8]!],
  };
}

/** Inversa de `baseDeEuler`: Euler XYZ intrínseco cuja base de rotação é
 * `(ex, ey, ez)` — mesma convenção do schema (ver `spec/README.md`). Os três
 * vetores devem ser ortonormais (uma base de rotação pura, sem escala nem
 * cisalhamento); use `baseOrtonormal` (`orientacao.ts`) para construir uma a
 * partir de uma única direção.
 *
 * Ângulos de Euler não são únicos: triplas diferentes podem descrever a
 * mesma rotação, e em gimbal lock (`|ez[0]| ≈ 1`, quando `ey` aponta quase
 * na direção de `ex` do mundo) só a SOMA/DIFERENÇA de `rx`/`rz` fica
 * determinada — esta função devolve `rz = 0` nesse caso, por convenção (é o
 * mesmo ramo que `decompor` já usa). `eulerDeBase(...)` reconstrói SEMPRE a
 * mesma base (a rotação em si); reconstrói a mesma TRIPLA numérica só longe
 * do gimbal lock, com ângulos já no intervalo canônico do `atan2`/`asin`. */
export function eulerDeBase(ex: Vec3, ey: Vec3, ez: Vec3): Vec3 {
  // mesma extração que `decompor` faz a partir da 3x3 normalizada por escala
  // (linha-maior: r[0..2]=linha0, r[3..5]=linha1, r[6..8]=linha2)
  const r = [ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2]];
  return rotacaoDeBase3x3(r);
}

/** Extrai Euler XYZ de uma 3x3 normalizada em ordem linha-maior (`[ex.x,
 * ey.x, ez.x, ex.y, ey.y, ez.y, ex.z, ey.z, ez.z]`). Compartilhado por
 * `eulerDeBase` e por `decompor`, que primeiro normaliza por escala. */
function rotacaoDeBase3x3(r: readonly number[]): Vec3 {
  const m13 = Math.min(1, Math.max(-1, r[2]!));
  const ry = Math.asin(m13);
  if (Math.abs(m13) < 0.9999999) {
    return [Math.atan2(-r[5]!, r[8]!), ry, Math.atan2(-r[1]!, r[0]!)];
  }
  return [Math.atan2(r[7]!, r[4]!), ry, 0];
}

export function multiplicar(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let l = 0; l < 4; l++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + l]! * b[c * 4 + k]!;
      out[c * 4 + l] = s;
    }
  }
  return out;
}

/** Aplica a matriz a um ponto (w=1). */
export function aplicarPonto(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z] = p;
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  const iw = Math.abs(w) < EPS ? 1 : 1 / w;
  return [
    (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) * iw,
    (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) * iw,
    (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) * iw,
  ];
}

/** Aplica só a parte 3x3 (rotação+escala) — para direções/normais de eixos
 * uniformemente escalados; a translação é ignorada de propósito. */
export function aplicarDirecao(m: Mat4, v: Vec3): Vec3 {
  const [x, y, z] = v;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z,
    m[1]! * x + m[5]! * y + m[9]! * z,
    m[2]! * x + m[6]! * y + m[10]! * z,
  ];
}

/** Inversa geral (cofatores). Lança se a matriz for singular — o que só
 * acontece com escala zero em algum eixo, um erro do chamador, não um estado
 * que faça sentido "tolerar" com um resultado silenciosamente errado. */
export function inverter(m: Mat4): Mat4 {
  const [
    n11, n21, n31, n41, n12, n22, n32, n42,
    n13, n23, n33, n43, n14, n24, n34, n44,
  ] = m as unknown as number[] & { length: 16 };
  const t11 = n23! * n34! * n42! - n24! * n33! * n42! + n24! * n32! * n43! - n22! * n34! * n43! - n23! * n32! * n44! + n22! * n33! * n44!;
  const t12 = n14! * n33! * n42! - n13! * n34! * n42! - n14! * n32! * n43! + n12! * n34! * n43! + n13! * n32! * n44! - n12! * n33! * n44!;
  const t13 = n13! * n24! * n42! - n14! * n23! * n42! + n14! * n22! * n43! - n12! * n24! * n43! - n13! * n22! * n44! + n12! * n23! * n44!;
  const t14 = n14! * n23! * n32! - n13! * n24! * n32! - n14! * n22! * n33! + n12! * n24! * n33! + n13! * n22! * n34! - n12! * n23! * n34!;
  const det = n11! * t11 + n21! * t12 + n31! * t13 + n41! * t14;
  if (Math.abs(det) < 1e-18) {
    throw new Error("matriz não inversível (escala zero em algum eixo?)");
  }
  const d = 1 / det;
  return [
    t11 * d, (n24! * n33! * n41! - n23! * n34! * n41! - n24! * n31! * n43! + n21! * n34! * n43! + n23! * n31! * n44! - n21! * n33! * n44!) * d,
    (n22! * n34! * n41! - n24! * n32! * n41! + n24! * n31! * n42! - n21! * n34! * n42! - n22! * n31! * n44! + n21! * n32! * n44!) * d,
    (n23! * n32! * n41! - n22! * n33! * n41! - n23! * n31! * n42! + n21! * n33! * n42! + n22! * n31! * n43! - n21! * n32! * n43!) * d,
    t12 * d, (n13! * n34! * n41! - n14! * n33! * n41! + n14! * n31! * n43! - n11! * n34! * n43! - n13! * n31! * n44! + n11! * n33! * n44!) * d,
    (n14! * n32! * n41! - n12! * n34! * n41! - n14! * n31! * n42! + n11! * n34! * n42! + n12! * n31! * n44! - n11! * n32! * n44!) * d,
    (n12! * n33! * n41! - n13! * n32! * n41! + n13! * n31! * n42! - n11! * n33! * n42! - n12! * n31! * n43! + n11! * n32! * n43!) * d,
    t13 * d, (n14! * n23! * n41! - n13! * n24! * n41! - n14! * n21! * n43! + n11! * n24! * n43! + n13! * n21! * n44! - n11! * n23! * n44!) * d,
    (n12! * n24! * n41! - n14! * n22! * n41! + n14! * n21! * n42! - n11! * n24! * n42! - n12! * n21! * n44! + n11! * n22! * n44!) * d,
    (n13! * n22! * n41! - n12! * n23! * n41! - n13! * n21! * n42! + n11! * n23! * n42! + n12! * n21! * n43! - n11! * n22! * n43!) * d,
    t14 * d, (n13! * n24! * n31! - n14! * n23! * n31! + n14! * n21! * n33! - n11! * n24! * n33! - n13! * n21! * n34! + n11! * n23! * n34!) * d,
    (n14! * n22! * n31! - n12! * n24! * n31! - n14! * n21! * n32! + n11! * n24! * n32! + n12! * n21! * n34! - n11! * n22! * n34!) * d,
    (n12! * n23! * n31! - n13! * n22! * n31! + n13! * n21! * n32! - n11! * n23! * n32! - n12! * n21! * n33! + n11! * n22! * n33!) * d,
  ];
}

/** Extrai posição/rotação(Euler XYZ)/escala de uma Mat4.
 *
 * Limitação herdada da própria decomposição TRS (vale igual no Three.js): se
 * um ancestral tem escala NÃO-UNIFORME e o nó tem rotação, o produto das
 * matrizes contém cisalhamento, que não é representável como T·R·S — a
 * decomposição devolve a aproximação ortonormal mais próxima. Documentado no
 * README; a saída continua determinística, só não é exata nesse caso. */
export function decompor(m: Mat4): { posicao: Vec3; rotacao: Vec3; escala: Vec3 } {
  const posicao: Vec3 = [m[12]!, m[13]!, m[14]!];
  let sx = Math.hypot(m[0]!, m[1]!, m[2]!);
  const sy = Math.hypot(m[4]!, m[5]!, m[6]!);
  const sz = Math.hypot(m[8]!, m[9]!, m[10]!);
  // determinante negativo ⇒ espelhamento; convenciona-se jogá-lo no eixo X
  const det =
    m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) -
    m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) +
    m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);
  if (det < 0) sx = -sx;
  const ix = sx === 0 ? 0 : 1 / sx;
  const iy = sy === 0 ? 0 : 1 / sy;
  const iz = sz === 0 ? 0 : 1 / sz;
  // linha-maior 3x3 normalizada
  const r = [
    m[0]! * ix, m[4]! * iy, m[8]! * iz,
    m[1]! * ix, m[5]! * iy, m[9]! * iz,
    m[2]! * ix, m[6]! * iy, m[10]! * iz,
  ];
  return { posicao, rotacao: rotacaoDeBase3x3(r), escala: [sx, sy, sz] };
}
