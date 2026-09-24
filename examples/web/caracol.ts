/**
 * Caracol — escada em hélice: 20 degraus girando 72° por degrau, balaústres em
 * cima de degraus JÁ GIRADOS e corrimão helicoidal dependurado no mesmo encaixe
 * que o montante superior.
 *
 * Duas classes de posicionamento convivem aqui, como o guia descreve:
 *
 *   · os degraus são posição por FÓRMULA (azimute, altura) — não existe
 *     primitiva de "caracol" na lib, e um degrau em balanço é um corpo rígido
 *     com ângulo próprio;
 *   · o balaústre é RELAÇÃO — nasce na face de cima do degrau e herda a
 *     rotação dele, sem ninguém recalcular nada.
 *
 * Convenção de ângulo igual à do guia: azimute medido do norte (−z), crescendo
 * no sentido horário visto de cima. Para apontar o +x LOCAL de uma peça na
 * direção do azimute a: `rotacao.y = π/2 − a`.
 */

import { Cena, type NoRef } from "@snaple/core";

type V3 = [number, number, number];
type V2 = [number, number];
type Material = { cor: string; metalico?: number; rugosidade?: number; opacidade?: number };
type Dim3 = { largura: number; altura: number; profundidade: number };
type DimCil = { raio: number; altura: number };

const ORIGEM: V3 = [0, 0, 0];

// ── medidas ─────────────────────────────────────────────────────────────────

const MED = {
  piso: 0.02,
  degraus: 20,
  porVolta: 5,
  espelho: 0.07,
  raioMontante: 0.045,
  recuo: 0.1,
  espessuraDegrau: 0.012,
  larguraDegrau: 0.09,
  uBalaustre: 0.06,
  alturaBalaustre: 0.3,
  ladoBalaustre: 0.012,
  raioTubo: 0.008,
  topoMontante: 1.76,
};

const PEDESTAL: Dim3 = { largura: 0.5, altura: MED.piso, profundidade: 0.5 };
const BALAUSTRE: Dim3 = {
  largura: MED.ladoBalaustre,
  altura: MED.alturaBalaustre,
  profundidade: MED.ladoBalaustre,
};

/** Azimute → direção no plano (x, z). 0 = norte (−z), sentido horário. */
const direcao = (azimute: number): V2 => [Math.sin(azimute), -Math.cos(azimute)];

/** Rotação em Y que leva o +x LOCAL da peça para a direção do azimute. */
const rotacaoParaX = (azimute: number): V3 => [0, Math.PI / 2 - azimute, 0];

/** O que o viewer importa. */
export function montarCena(): Cena {
  return detalhado().cena;
}

/** Seam de instrumentação — ver o cabeçalho de `modelos/engrenagens.ts`. */
export function detalhado() {
  const cena = new Cena();

  const M = {
    chao: { cor: "#171a20", rugosidade: 0.9 } satisfies Material,
    montante: { cor: "#2a2f38", rugosidade: 0.55 } satisfies Material,
    degrau: { cor: "#e9e3d8", rugosidade: 0.7 } satisfies Material,
    degrauDeApoio: { cor: "#3f7d5a", rugosidade: 0.6 } satisfies Material,
    balaustre: { cor: "#8a8f98", metalico: 0.6, rugosidade: 0.35 } satisfies Material,
    corrimao: { cor: "#c85a3c", metalico: 0.45, rugosidade: 0.3 } satisfies Material,
    sinaleiro: { cor: "#d9b26a", metalico: 0.8, rugosidade: 0.2 } satisfies Material,
  };

  const caixa = (
    nome: string,
    d: Dim3,
    material: Material,
    posicao: V3 = ORIGEM,
    rotacao: V3 = ORIGEM,
  ): NoRef => cena.criar("box", d, { nome, transform: { posicao, rotacao }, material });

  const cilindro = (nome: string, d: DimCil, material: Material): NoRef =>
    cena.criar(
      "cylinder",
      { raioTopo: d.raio, raioBase: d.raio, altura: d.altura, segmentos: 64 },
      { nome, material },
    );

  // ── derivados: tudo sai de MED, nada é medido no viewer ───────────────────
  const raioDoDegrau = MED.raioMontante + MED.recuo; // centro do degrau
  const raioDoCorrimao = raioDoDegrau + MED.uBalaustre; // por onde o tubo passa
  const voltas = MED.degraus / MED.porVolta; // 4
  const passo = MED.porVolta * MED.espelho; // 0,35 m por volta
  const yDoPrimeiroDegrau = MED.piso + MED.espessuraDegrau / 2;

  // O corrimão é um tubo helicoidal: a meia-altura declarada é
  // passo·voltas/2 + raioTubo, então ESTE é o y onde o tubo começa. Os topos dos
  // balaústres têm que cair dentro de [base, base + passo·voltas + 2·raioTubo].
  const baseDaBanda =
    yDoPrimeiroDegrau + MED.espessuraDegrau / 2 + MED.alturaBalaustre - MED.espelho / 2 - MED.raioTubo;

  // ── montantes ────────────────────────────────────────────────────────────
  const pedestal = caixa("pedestal", PEDESTAL, M.chao, [0, PEDESTAL.altura / 2, 0]);

  // o montante é CORTADO onde o corrimão começa: a face de cima dele é o encaixe
  // do tubo E do trecho superior do próprio montante — dois filhos na mesma face
  const montanteInferior = cilindro(
    "montante inferior",
    { raio: MED.raioMontante, altura: baseDaBanda - MED.piso },
    M.montante,
  );
  pedestal.face("topo").colocar(montanteInferior, { u: 0, v: 0 });

  const corrimao = cena.criar(
    "helix",
    { raio: raioDoCorrimao, raioTubo: MED.raioTubo, passo, voltas },
    { nome: "corrimão", material: M.corrimao },
  );
  montanteInferior.face("topo").colocar(corrimao, { u: 0, v: 0 });

  const montanteSuperior = cilindro(
    "montante superior",
    { raio: MED.raioMontante, altura: MED.topoMontante - baseDaBanda },
    M.montante,
  );
  montanteInferior.face("topo").colocar(montanteSuperior, { u: 0, v: 0 });

  const sinaleiro = cena.criar(
    "sphere",
    { raio: 0.045, segmentos: 64 },
    { nome: "sinaleiro", material: M.sinaleiro },
  );
  montanteSuperior.face("topo").colocar(sinaleiro, { u: 0, v: 0 });

  // ── degraus e balaústres ─────────────────────────────────────────────────
  const degraus: NoRef[] = [];
  const balaustres: NoRef[] = [];

  for (let i = 0; i < MED.degraus; i += 1) {
    const azimute = (i / MED.porVolta) * 2 * Math.PI;
    const [dx, dz] = direcao(azimute);
    const y = yDoPrimeiroDegrau + i * MED.espelho;

    const degrau = caixa(
      `degrau ${String(i + 1).padStart(2, "0")}`,
      { largura: 2 * MED.recuo, altura: MED.espessuraDegrau, profundidade: MED.larguraDegrau },
      i % MED.porVolta === 0 ? M.degrauDeApoio : M.degrau,
      [raioDoDegrau * dx, y, raioDoDegrau * dz],
      rotacaoParaX(azimute),
    );

    // balaústre na face de cima de um dono JÁ GIRADO: se a tabela U/V valer, ele
    // sai na direção radial certa e girado junto — sem ninguém calcular ângulo
    const balaustre = caixa("balaústre", BALAUSTRE, M.balaustre);
    degrau.face("topo").colocar(balaustre, { u: MED.uBalaustre, v: 0 });

    degraus.push(degrau);
    balaustres.push(balaustre);
  }

  return {
    cena,
    pedestal,
    montanteInferior,
    montanteSuperior,
    corrimao,
    sinaleiro,
    degraus,
    balaustres,
    // derivados, expostos para conferir contra as medições
    raioDoDegrau,
    raioDoCorrimao,
    baseDaBanda,
    passo,
    voltas,
    yDoPrimeiroDegrau,
  };
}
