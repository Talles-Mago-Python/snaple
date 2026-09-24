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
export * from "./obb.ts";
export * from "./no.ts";
export * from "./mundo.ts";
export * from "./flex.ts";
export * from "./face.ts";
export * from "./geometria.ts";
export * from "./varredura.ts";
export * from "./adesivos.ts";
export * from "./animacao.ts";
export * from "./validar.ts";
export * from "./descrever.ts";
export {
  Cena, NoRef, AcoplamentoRef, AnimacaoRef, ID_RAIZ, aabbNoEspacoDe,
  type AlvoNo, type OpcoesCriar, type ConferenciaAnimacao,
} from "./cena.ts";
export {
  erroDoAcoplamento, type ErroDoAcoplamento, type ErroAcoplamento, type RelatorioMontagem,
} from "./acoplamento.ts";
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
export { Lateral, perfilEfetivo, type OpcoesLateralColocar } from "./lateral.ts";
export { padraoCircular, type OpcoesPadraoCircular } from "./padroes.ts";
export {
  arco, estadio, gota, retanguloArredondado, poligonoRegular, elipse,
  perfilL, perfilU, perfilI, perfilT,
} from "./perfis.ts";
export {
  texto, planoDeFace, planoDeLateral, tracosDoGlifo,
  type Plano, type OpcoesTexto,
} from "./texto.ts";
