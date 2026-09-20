/** @snaple/core — layout 3D declarativo.
 *
 * Convenções do projeto, válidas em toda a API:
 *  - Unidade: METROS.
 *  - Eixo vertical: **Y-up**, sistema destro. +x = leste, -x = oeste,
 *    +y = cima, -y = baixo, +z = sul, -z = norte.
 *  - Rotação: Euler XYZ intrínseca, em RADIANOS.
 *  - Nenhum backend de render é importado aqui, nem nada de DOM: este pacote
 *    roda em Node puro e é testável sem GPU/navegador.
 */
export * from "./vetor.ts";
export * from "./tipos.ts";
export * from "./bbox.ts";
export * from "./no.ts";
export * from "./mundo.ts";
export * from "./flex.ts";
export * from "./face.ts";
export * from "./geometria.ts";
export * from "./validar.ts";
export * from "./descrever.ts";
export { Cena, NoRef, ID_RAIZ, aabbNoEspacoDe, type AlvoNo, type OpcoesCriar } from "./cena.ts";
export {
  colocarSobre, encostar, alinhar, centralizarEm, empilhar, distribuir,
  circular, envelope,
  type OpcoesDistribuir as OpcoesDistribuirLayout,
  type OpcoesCircular,
} from "./layout.ts";
export {
  compor, decompor, inverter, multiplicar, aplicarPonto, aplicarDirecao, identidade,
  baseDeEuler, eulerDeBase, type Mat4,
} from "./matriz.ts";
export { converter, apontar, conectar, type PontoRef, type OpcoesApontar, type OpcoesConectar } from "./orientacao.ts";
