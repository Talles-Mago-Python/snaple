import { Cena, type NoRef } from "@snaple/core";

/**
 * Relógio de parede em vista explodida: cada camada (caixa traseira,
 * bateria, placa de movimento com engrenagens, mostrador, ponteiros, vidro
 * e aro frontal) é separada ao longo de +Y para expor a montagem interna.
 *
 * Medidas em metros; +Y para cima. Ângulos em radianos.
 * Convenção de "12 horas" = direção -Z (norte), sentido horário visto de cima.
 */
type V3 = [number, number, number];
type Material = {
  cor: string;
  metalico?: number;
  rugosidade?: number;
  opacidade?: number;
};

export function montarCena(): Cena {
  const cena = new Cena();
  const PI = Math.PI;
  const TAU = 2 * PI;

  const M = {
    caixa: { cor: "#2b2f33", metalico: 0.7, rugosidade: 0.4 } satisfies Material,
    prata: { cor: "#c9cdd1", metalico: 0.85, rugosidade: 0.25 } satisfies Material,
    latao: { cor: "#b08d3e", metalico: 0.8, rugosidade: 0.32 } satisfies Material,
    mostrador: { cor: "#f5f1e6", metalico: 0, rugosidade: 0.6 } satisfies Material,
    marcador: { cor: "#1c1c1c", metalico: 0.1, rugosidade: 0.5 } satisfies Material,
    ponteiro: { cor: "#1c1c1c", metalico: 0.3, rugosidade: 0.4 } satisfies Material,
    ponteiroSegundos: { cor: "#b23a2f", metalico: 0.2, rugosidade: 0.4 } satisfies Material,
    vidro: { cor: "#bfe0e0", metalico: 0.05, rugosidade: 0.08, opacidade: 0.28 } satisfies Material,
    cromo: { cor: "#d8dde0", metalico: 0.9, rugosidade: 0.15 } satisfies Material,
  };

  const cilindro = (
    nome: string,
    raio: number,
    altura: number,
    posicao: V3,
    material: Material,
    rotacao: V3 = [0, 0, 0],
  ): NoRef =>
    cena.criar(
      "cylinder",
      { raioTopo: raio, raioBase: raio, altura, segmentos: 64 },
      { nome, transform: { posicao, rotacao }, material },
    );

  const caixaBox = (
    nome: string,
    largura: number,
    altura: number,
    profundidade: number,
    posicao: V3,
    material: Material,
    rotacao: V3 = [0, 0, 0],
  ): NoRef =>
    cena.criar(
      "box",
      { largura, altura, profundidade },
      { nome, transform: { posicao, rotacao }, material },
    );

  const torus = (
    nome: string,
    raio: number,
    raioTubo: number,
    posicao: V3,
    material: Material,
  ): NoRef =>
    cena.criar(
      "torus",
      { raio, raioTubo, segmentos: 64, segmentosTubo: 16 },
      { nome, transform: { posicao }, material },
    );

  /** Direção radial no plano XZ: fração 0 = 12h (-Z), sentido horário. */
  const direcao = (fracaoVolta: number, raio: number): [number, number] => {
    const a = fracaoVolta * TAU;
    return [Math.sin(a) * raio, -Math.cos(a) * raio];
  };

  // ── Explosão ao longo de Y ───────────────────────────────────────────
  const EXPLOSAO = 0.05;
  let cursor = 0;
  const empilhar = (altura: number): number => {
    const centro = cursor + altura / 2;
    cursor += altura + EXPLOSAO;
    return centro;
  };

  // 1. Caixa traseira ────────────────────────────────────────────────────
  const ALTURA_CAIXA = 0.02;
  const RAIO_CAIXA = 0.16;
  cilindro("caixa_traseira", RAIO_CAIXA, ALTURA_CAIXA, [0, empilhar(ALTURA_CAIXA), 0], M.caixa);

  // 2. Bateria ────────────────────────────────────────────────────────────
  const ALTURA_BATERIA = 0.008;
  cilindro("bateria", 0.012, ALTURA_BATERIA, [0, empilhar(ALTURA_BATERIA), 0], M.prata);

  // 3. Placa de movimento + trem de engrenagens ──────────────────────────
  const ALTURA_PLACA = 0.006;
  const yPlaca = empilhar(ALTURA_PLACA);
  cilindro("placa_movimento", 0.09, ALTURA_PLACA, [0, yPlaca, 0], M.latao);

  const yTopoPlaca = yPlaca + ALTURA_PLACA / 2;
  const GAP_ENGRENAGEM = 0.002;
  const engrenagem = (nome: string, raio: number, altura: number, x: number, z: number): void => {
    cilindro(nome, raio, altura, [x, yTopoPlaca + GAP_ENGRENAGEM + altura / 2, z], M.latao);
  };
  engrenagem("engrenagem_central", 0.035, 0.006, 0, 0);
  engrenagem("engrenagem_media", 0.02, 0.005, 0.06, 0.03);
  engrenagem("engrenagem_pequena", 0.012, 0.004, -0.055, 0.035);

  // 4. Mostrador com marcadores de hora ───────────────────────────────────
  const ALTURA_MOSTRADOR = 0.01;
  const yMostrador = empilhar(ALTURA_MOSTRADOR);
  cilindro("mostrador", 0.15, ALTURA_MOSTRADOR, [0, yMostrador, 0], M.mostrador);

  const yTopoMostrador = yMostrador + ALTURA_MOSTRADOR / 2;
  const RAIO_MARCADORES = 0.13;
  const ALTURA_MARCADOR = 0.003;
  for (let i = 0; i < 12; i++) {
    const principal = i % 3 === 0; // 12, 3, 6, 9
    const [x, z] = direcao(i / 12, RAIO_MARCADORES);
    caixaBox(
      `marcador_${i}`,
      principal ? 0.012 : 0.006,
      ALTURA_MARCADOR,
      principal ? 0.02 : 0.012,
      [x, yTopoMostrador + ALTURA_MARCADOR / 2, z],
      M.marcador,
      [0, (i / 12) * TAU, 0],
    );
  }

  // 5. Ponteiros (mini-pilha logo acima do mostrador) ─────────────────────
  const horas = 10;
  const minutos = 10;
  const segundos = 30;
  const fracaoHora = ((horas % 12) + minutos / 60) / 12;
  const fracaoMinuto = minutos / 60;
  const fracaoSegundo = segundos / 60;

  const ponteiro = (
    nome: string,
    comprimento: number,
    largura: number,
    espessura: number,
    fracaoVolta: number,
    y: number,
    material: Material,
  ): void => {
    const a = fracaoVolta * TAU;
    const x = Math.sin(a) * (comprimento / 2);
    const z = -Math.cos(a) * (comprimento / 2);
    caixaBox(nome, largura, espessura, comprimento, [x, y, z], material, [0, a, 0]);
  };

  const EXPLOSAO_MINI = 0.015;
  let cursorMini = yTopoMostrador;
  const empilharMini = (altura: number): number => {
    cursorMini += EXPLOSAO_MINI;
    const centro = cursorMini + altura / 2;
    cursorMini += altura;
    return centro;
  };

  ponteiro("ponteiro_hora", 0.08, 0.012, 0.004, fracaoHora, empilharMini(0.004), M.ponteiro);
  ponteiro("ponteiro_minuto", 0.115, 0.008, 0.0035, fracaoMinuto, empilharMini(0.0035), M.ponteiro);
  ponteiro("ponteiro_segundo", 0.13, 0.003, 0.003, fracaoSegundo, empilharMini(0.003), M.ponteiroSegundos);
  cilindro("tampa_central", 0.012, 0.006, [0, empilharMini(0.006), 0], M.latao);

  cursor = cursorMini + EXPLOSAO;

  // 6. Vidro (cristal) ──────────────────────────────────────────────────
  const ALTURA_VIDRO = 0.006;
  cilindro("vidro", 0.155, ALTURA_VIDRO, [0, empilhar(ALTURA_VIDRO), 0], M.vidro);

  // 7. Aro frontal ─────────────────────────────────────────────────────
  const ALTURA_ARO = 0.01;
  torus("aro_frontal", 0.16, 0.008, [0, empilhar(ALTURA_ARO) - ALTURA_ARO / 2 + 0.008, 0], M.cromo);

  return cena;
}
