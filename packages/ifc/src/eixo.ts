/** Conversão de eixo, só aqui — o core nunca vê isto (regra do AGENTS.md).
 *
 * snaple é Y-up, metros, destro. IFC é convencionalmente Z-up. A conversão
 * escolhida é a rotação rígida de -90° em torno do eixo X mundial:
 * `(x, y, z) → (x, -z, y)`. É uma rotação PRÓPRIA (determinante +1, não um
 * espelhamento): preserva ângulos, comprimentos e o sentido destro de tudo
 * que passa por ela — só relabela qual eixo é "para cima". O que era `+y`
 * (cima) vira `+z` (cima); o que era `+z` (sul) vira `-y`.
 *
 * A prova de que isso basta, sem precisar reprocessar cada nível da
 * hierarquia separadamente, está em `mapear.ts`: como a mesma rotação é
 * aplicada de forma consistente à posição e à base de rotação (ex/ey/ez) de
 * cada nó, o resultado é idêntico a girar a cena inteira uma vez só — mas
 * calculado nó a nó a partir do `mundo()` já resolvido pelo core. */
import type { Vec3 } from "@snaple/core";

export function paraZUp(v: Vec3): Vec3 {
  return [v[0], -v[2], v[1]];
}
