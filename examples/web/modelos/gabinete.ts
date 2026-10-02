import { Cena, type NoRef } from "@snaple/core";

/**
 * Gabinete de computador — modelo de apresentação para Snaple.
 * Coloque este arquivo em examples/web/modelos/.
 * Unidades da cena: metros. Medidas dos helpers: milímetros.
 * Frente: +Z (painel frontal). Laterais: ±X. Vertical: +Y. Fundo: -Z.
 * A lateral esquerda (-X) fica removível para revelar o interior.
 * Construção visual externa, não projeto de fabricação.
 */
type V3 = [number, number, number];
type P2 = [number, number];
type Material = { cor: string; metalico?: number; rugosidade?: number; opacidade?: number };

export const CONFIG = {
  profundidade: 450,
  largura: 210,
  altura: 470,
  espessuraChapa: 0.9,
  segmentos: 96,
  texturaFiltroFrontal: true,
  mostrarRevestimentoInterno: true,
  mostrarPes: false,
  painelLateralAberto: true,
  mostrarColunaDeVentilacao: false,
};

const PI = Math.PI;
const ZERO: V3 = [0, 0, 0];
const FRENTE: V3 = [PI / 2, 0, 0];
const CIMA: V3 = [-PI / 2, 0, 0];
const BASE: V3 = [PI / 2, 0, 0];
const ESQ: V3 = [0, 0, PI / 2];
const DIR: V3 = [0, 0, -PI / 2];
const COSTAS: V3 = [0, PI, 0];
const M = {
  chapa: { cor: "#23282c", metalico: 0.72, rugosidade: 0.34 },
  chapaInterna: { cor: "#4a5259", metalico: 0.66, rugosidade: 0.4 },
  borda: { cor: "#3c444a", metalico: 0.82, rugosidade: 0.26 },
  moldura: { cor: "#14181b", metalico: 0.35, rugosidade: 0.55 },
  malha: { cor: "#0b0e10", metalico: 0.1, rugosidade: 0.8 },
  poeira: { cor: "#1c2124", metalico: 0.05, rugosidade: 0.92 },
  vidroFumê: { cor: "#101418", metalico: 0.5, rugosidade: 0.1, opacidade: 0.55 },
  acrilico: { cor: "#181d22", metalico: 0.15, rugosidade: 0.2, opacidade: 0.72 },
  borracha: { cor: "#141719", metalico: 0, rugosidade: 0.95 },
  preto: { cor: "#080a0c", metalico: 0.12, rugosidade: 0.5 },
  prata: { cor: "#aab3bb", metalico: 0.95, rugosidade: 0.24 },
  jateado: { cor: "#8d959c", metalico: 0.6, rugosidade: 0.78 },
  poeiraFiltro: { cor: "#20262a", metalico: 0.02, rugosidade: 0.95 },
} satisfies Record<string, Material>;

export function montarCena(): Cena {
  const cena = new Cena();
  const mm = (v: V3): V3 => [v[0] / 1000, v[1] / 1000, v[2] / 1000];
  const grupo = (pai: NoRef, nome: string, p: V3 = ZERO, r: V3 = ZERO): NoRef =>
    pai.criar("grupo", {}, { nome, transform: { posicao: mm(p), rotacao: r } });
  const caixa = (pai: NoRef, nome: string, w: number, h: number, d: number, p: V3, mat: Material, r: V3 = ZERO): NoRef =>
    pai.criar("box", { largura: w / 1000, altura: h / 1000, profundidade: d / 1000 }, { nome, material: mat, transform: { posicao: mm(p), rotacao: r } });
  const cilindro = (pai: NoRef, nome: string, raio: number, altura: number, p: V3, mat: Material, r: V3 = FRENTE): NoRef =>
    pai.criar("cylinder", { raioTopo: raio / 1000, raioBase: raio / 1000, altura: altura / 1000, segmentos: CONFIG.segmentos }, { nome, material: mat, transform: { posicao: mm(p), rotacao: r } });
  const toro = (pai: NoRef, nome: string, raio: number, tubo: number, p: V3, mat: Material, r: V3 = FRENTE): NoRef =>
    pai.criar("torus", { raio: raio / 1000, raioTubo: tubo / 1000, segmentos: CONFIG.segmentos, segmentosTubo: 12 }, { nome, material: mat, transform: { posicao: mm(p), rotacao: r } });

  // Retângulo arredondado extrudado: perímetro real, sem empilhar caixas.
  const arredondada = (pai: NoRef, nome: string, w: number, h: number, d: number, raio: number, p: V3, mat: Material, r: V3 = FRENTE): NoRef => {
    const perfil: P2[] = [];
    const rr = Math.min(raio, w / 2, h / 2);
    for (let canto = 0; canto < 4; canto++) {
      const a0 = canto * PI / 2;
      const cx = (canto === 0 || canto === 3 ? 1 : -1) * (w / 2 - rr);
      const cz = (canto < 2 ? 1 : -1) * (h / 2 - rr);
      for (let j = 0; j <= 6; j++) {
        const a = a0 + j * PI / 12;
        perfil.push([(cx + rr * Math.cos(a)) / 1000, (cz + rr * Math.sin(a)) / 1000]);
      }
    }
    return pai.criar("extrude", { perfil, altura: d / 1000, recentrar: true }, { nome, material: mat, transform: { posicao: mm(p), rotacao: r } });
  };
  const parafuso = (pai: NoRef, nome: string, p: V3, r: V3 = ZERO): void => {
    cilindro(pai, nome, 1.3, 0.8, p, M.prata, r);
    const s = grupo(pai, `${nome} — fenda`, p, r);
    caixa(s, "Fenda horizontal", 1.55, 0.22, 0.14, [0, 0, 0.42], M.preto);
    caixa(s, "Fenda vertical", 0.22, 1.55, 0.14, [0, 0, 0.42], M.preto);
  };

  const L = CONFIG.largura;
  const A = CONFIG.altura;
  const P = CONFIG.profundidade;
  const e = CONFIG.espessuraChapa;
  const raiz = cena
    .criar("grupo", {}, { nome: `Gabinete de computador ${L} × ${P} × ${A} mm`, transform: { posicao: [0, A / 2000 + 0.02, 0] } })
    .permitirFlutuacao(
      "o gabinete assenta nos pés/sapatas; painéis, colunas e travessas não encostam no chão",
    );

  const chassis = grupo(raiz, "01 — Chassi, fundo e teto");
  caixa(chassis, "Fundo da chapa", L - 2 * e, e, P - 2 * e, [0, -A / 2 + e / 2, 0], M.chapaInterna);
  caixa(chassis, "Teto da chapa", L - 2 * e, e, P - 2 * e, [0, A / 2 - e / 2, 0], M.chapaInterna);
  arredondada(chassis, "Teto — painel externo", L, P, 1.4, 10, [0, A / 2 + 0.3, 0], M.chapa, CIMA);
  arredondada(chassis, "Placa externa do fundo", L - 4, P - 4, 1.0, 9, [0, -A / 2 - 0.45, 0], M.chapa);
  for (const lado of [-1, 1]) {
    caixa(chassis, `Coluna vertical ${lado > 0 ? "direita" : "esquerda"}`, e, A - 2 * e, 12, [lado * (L / 2 - e / 2), 0, -P / 2 + 21], M.chapaInterna);
    caixa(chassis, `Abas da coluna ${lado > 0 ? "direita" : "esquerda"}`, 20, A - 2 * e, e, [lado * (L / 2 - 11), 0, -P / 2 + 15.5], M.chapaInterna);
    caixa(chassis, `Perfil de encaixe lateral ${lado > 0 ? "direita" : "esquerda"}`, 8, A - 2 * e, 6, [lado * (L / 2 - 5), 0, -P / 2 + 21], M.chapaInterna);
  }
  caixa(chassis, "Viga superior do fundo", L - 2 * e, 18, e, [0, A / 2 - 9.5, -P / 2 + 1.5], M.chapaInterna);
  caixa(chassis, "Viga inferior do fundo", L - 2 * e, 14, e, [0, -A / 2 + 7.5, -P / 2 + 1.5], M.chapaInterna);
  caixa(chassis, "Calha de cabos inferior", L - 40, 3, 26, [0, -A / 2 + 18, P / 2 - 20], M.borda);

  const berco = grupo(chassis, "02 — Berço de armazenamento");
  for (const y of [-58, -93]) {
    for (const lado of [-1, 1]) {
      caixa(berco, `Guia lateral ${y} ${lado > 0 ? "direita" : "esquerda"}`, 6, 15, P - 60, [lado * (L / 2 - 12), y, -35], M.chapaInterna);
    }
    caixa(berco, `Base da gaveta ${y}`, L - 24, e, P - 60, [0, y - 7.5, -35], M.chapaInterna);
    for (const lado of [-1, 1]) {
      caixa(berco, `Ranhura de trilho ${y} ${lado > 0 ? "direita" : "esquerda"}`, 1.4, 8, P - 80, [lado * (L / 2 - 14.7), y - 2, -40], M.borda);
    }
    parafuso(berco, `Parafuso da gaveta ${y}`, [L / 2 - 12, y + 10, P / 2 - 26], ESQ);
  }
  caixa(berco, "Chapa de separação das gavetas", L - 26, e, P - 70, [0, -75.5, -38], M.chapaInterna);

  const painelFrente = grupo(raiz, "03 — Painel frontal", [0, 0, P / 2 + 0.6]);
  arredondada(painelFrente, "Moldura frontal", L, A, 26, 9, [0, 0, 1.0], M.moldura);
  const moldura = arredondada(painelFrente, "Aro frontal", L - 2, A - 2, 1.1, 10, [0, 0, 14.4], M.chapa);
  arredondada(painelFrente, "Tampão de vedação", L - 8, A - 8, 6, 8, [0, 0, -14.6], M.borda);
  arredondada(painelFrente, "Recorte da malha frontal", L - 18, A - 18, 1.5, 12, [0, 0, 11.6], M.malha);
  arredondada(painelFrente, "Vão interno do filtro", L - 26, A - 26, 1.0, 10, [0, 0, 9.4], M.poeira);
  const filtro = grupo(painelFrente, "Painel de malha perfurada", [0, 0, 12.6]);
  for (let linha = 0; linha < 58; linha++) {
    for (let col = 0; col < 26; col++) {
      const x = (col - 12.5) * 6.6;
      const y = (linha - 28.5) * 6.6;
      if (Math.abs(y) > A / 2 - 13 && Math.abs(x) > L / 2 - 24) continue;
      if (CONFIG.texturaFiltroFrontal) {
        caixa(filtro, `Malha ${linha} ${col}`, 3.5, 3.5, 0.6, [x, y, 0], M.poeiraFiltro);
        caixa(filtro, `Perfuração ${linha} ${col}`, 1.5, 1.5, 0.3, [x, y, 0.35], M.malha);
      } else {
        caixa(filtro, `Perfuração ${linha} ${col}`, 1.8, 1.8, 0.4, [x, y, 0.2], M.malha);
      }
    }
  }
  toro(filtro, "Aro do filtro frontal", (L - 30) / 2, 0.6, [0, 0, -0.6], M.borda, CIMA);
  for (let i = 0; i < 26; i++) {
    caixa(filtro, `Aleta de ventilação ${i + 1}`, L - 60, 1.5, 3, [0, (i - 12.5) * 6.2, -0.5], M.poeira, [0, 0, PI / 6]);
  }
  caixa(painelFrente, "Faixa de acabamento inferior", L - 6, 14, 1.6, [0, -A / 2 + 11, 14.8], M.chapa);
  cilindro(painelFrente, "Botão de energia", 7.0, 2.4, [L / 2 - 14, A / 2 - 13, 14.4], M.borda);
  toro(painelFrente, "Aro de destaque do botão", 5.4, 0.5, [L / 2 - 14, A / 2 - 13, 15.6], M.prata);
  cilindro(painelFrente, "Marca de energia", 1.7, 0.3, [L / 2 - 14, A / 2 - 13, 15.7], M.prata);
  for (const y of [-A / 2 + 24, -A / 2 + 42]) {
    cilindro(painelFrente, `Entrada de áudio superior ${y}`, 3.3, 1.6, [L / 2 - 15, y, 14.4], M.preto);
    cilindro(painelFrente, `Entrada de áudio inferior ${y}`, 3.3, 1.6, [L / 2 - 34, y, 14.4], M.preto);
  }
  for (let i = 0; i < 4; i++) {
    if (i === 2 && !CONFIG.mostrarPes) continue;
    const x = -L / 2 + 30 + (i % 2) * 19;
    const y = A / 2 - 20 - Math.floor(i / 2) * 10;
    caixa(painelFrente, `Base do pé ${i + 1}`, 15, 7, 2.2, [x, y, 14.4], M.borda);
    arredondada(painelFrente, `Pé de borracha ${i + 1}`, 6, 5, 0.9, 1.2, [x, y, 15.7], M.borracha);
  }

  const tampaFrente = grupo(painelFrente, "04 — Tampas de acesso frontal");
  arredondada(tampaFrente, "Tampa de baionetas", 34, 26, 3.2, 3, [-L / 2 + 30, A / 2 - 20, 15.7], M.chapa);
  caixa(tampaFrente, "Trava da tampa de baionetas", 9, 3.5, 1.2, [-L / 2 + 12, A / 2 - 20, 17.2], M.borda);
  arredondada(tampaFrente, "Tampa superior", 38, 22, 3.2, 3, [-L / 2 + 34, A / 2 - 47, 15.7], M.chapa);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      caixa(tampaFrente, `Abertura da tampa superior ${i}-${j}`, 5, 4, 0.9, [-L / 2 + 20 + i * 7, A / 2 - 50 + j * 7, 17.4], M.malha);
    }
  }
  caixa(tampaFrente, "Ranhura de abertura", 10, 2.2, 1.0, [-L / 2 + 52, A / 2 - 33, 16.6], M.preto);

  const painelLateral = grupo(raiz, "05 — Painel lateral esquerdo removível", [-L / 2 - 1.6, 0, -6]);
  const molduraLateral = arredondada(painelLateral, "Moldura do painel lateral", A, P - 12, 3.0, 14, ZERO, M.moldura, ESQ);
  arredondada(painelLateral, "Chapa do painel lateral", A - 5, P - 17, 2.2, 12, [-2.2, 0, 0], M.chapa, ESQ);
  arredondada(painelLateral, "Recorte central do painel lateral", A - 26, P - 40, 0.8, 8, [-3.4, 0, 0], M.malha, ESQ);
  const vidro = grupo(painelLateral, "Painel de vidro fumê", [-3.5, 0, 0], ESQ);
  arredondada(vidro, "Chapa de vidro", A - 30, P - 44, 2.0, 7, ZERO, M.vidroFumê);
  arredondada(vidro, "Vedação do vidro", A - 28, P - 42, 0.7, 7, [0.9, 0, 0], M.borracha);
  for (const y of [0.26, 0.02, -0.22]) caixa(vidro, `Travessa do vidro ${y}`, 0.8, 200, 0.6, [1.2, 0, y * 1000], M.borda, ESQ);
  const alcaLateral = grupo(painelLateral, "Puxador traseiro do painel", [-6, -A / 2 + 16, 0]);
  caixa(alcaLateral, "Pino do puxador", 8, 11, 10, ZERO, M.borda);
  toro(alcaLateral, "Anel do puxador", 3.4, 0.9, [0, -0.7, -4], M.prata, CIMA);
  toro(painelLateral, "Saliência da lateral", 3.6, 0.7, [-4.6, A / 2 - 40, -P / 2 + 30], M.borda, ESQ);
  for (const y of [90, -60]) {
    parafuso(painelLateral, `Parafuso prisioneiro ${y}`, [-4.4, y, -P / 2 + 26], ESQ);
    toro(painelLateral, `Apoio do parafuso ${y}`, 2.6, 0.8, [-3.2, y, -P / 2 + 26], M.borda, ESQ);
  }
  caixa(raiz, "Painel lateral direito", 2.6, A, P - 12, [L / 2 + 1.6, 0, -6], M.chapa);

  const painelTras = grupo(raiz, "06 — Painel traseiro e fixações", [0, 0, -P / 2 - 1.8]);
  arredondada(painelTras, "Chapa traseira", L, A, 2.4, 10, ZERO, M.chapa);
  arredondada(painelTras, "Recorte da grade traseira", L - 26, A - 26, 1.0, 9, [-8, 0, -1.6], M.malha);
  for (let linha = 0; linha < 52; linha++) {
    for (let col = 0; col < 20; col++) {
      const x = -L / 2 + 16 + col * 7.6;
      const y = (linha - 25.5) * 7.6;
      if (Math.abs(y) > A / 2 - 14) continue;
      caixa(painelTras, `Colmeia traseira ${linha} ${col}`, 6.2, 6.2, 1.4, [x, y, -2.4], M.poeira);
      caixa(painelTras, `Furo da colmeia ${linha} ${col}`, 4.4, 4.4, 0.6, [x, y, -3.0], M.malha);
    }
  }
  toro(painelTras, "Aro do ventilador traseiro", 61, 1.2, [-8, 0, -2.6], M.borda);
  caixa(painelTras, "Base da chapa de encaixe", 44, 16, 2.4, [-8, A / 2 - 12, -2.6], M.chapaInterna);
  arredondada(painelTras, "Recorte da chapa de encaixe", 32, 8, 1.0, 3, [-8, A / 2 - 12, -4.0], M.malha);
  for (let i = 0; i < 2; i++) {
    caixa(painelTras, `Barra da chapa de encaixe ${i + 1}`, 34, 2.0, 1.2, [-8, A / 2 - 16 + i * 8, -4.6], M.chapaInterna);
  }
  arredondada(painelTras, "Placa de encaixe de expansão", 306, 18, 2.0, 3, [-6, -A / 2 + 30, -2.6], M.chapaInterna);
  const trilhos = grupo(painelTras, "Grade de trilhos de expansão");
  for (let i = 0; i < 7; i++) {
    const y = -A / 2 + 40 + i * 18;
    caixa(trilhos, `Base do trilho ${i + 1}`, 306, 15, 1.6, [0, y, -3.4], M.chapaInterna);
    caixa(trilhos, `Borboleta do trilho ${i + 1}`, 12, 9, 1.4, [0, y + 4, -4.4], M.escuro ? M.preto : M.preto);
    for (let j = 0; j < 11; j++) {
      caixa(trilhos, `Abertura do trilho ${i + 1}-${j + 1}`, 10, 10, 0.8, [-132 + j * 26, y - 1, -4.0], M.malha);
    }
    for (const lado of [-1, 1]) parafuso(trilhos, `Parafuso do trilho ${i + 1} ${lado > 0 ? "direito" : "esquerdo"}`, [lado * 138, y, -4.2], COSTAS);
  }
  for (let i = 0; i < 2; i++) {
    caixa(painelTras, `Base da fonte ${i + 1}`, 90, 22, 1.6, [-44, A - 30 - i * 0, -2.8], M.chapaInterna);
    caixa(painelTras, `Recorte da fonte ${i + 1}`, 70, 14, 0.8, [-44, A - 30, -3.8], M.malha);
  }
  cilindro(painelTras, "Entrada de energia", 15.5, 9, [-L / 2 + 20, A - 30, -5.0], M.preto, COSTAS);
  arredondada(painelTras, "Recorte da entrada de energia", 34, 26, 1.0, 3, [-L / 2 + 20, A - 30, -3.0], M.malha);
  for (let i = 0; i < 3; i++) {
    cilindro(painelTras, `Conector externo ${i + 1}`, 4.2, 2.4, [-L / 2 + 46 + i * 13, A - 30, -4.6], M.borda, COSTAS);
  }
  caixa(painelTras, "Fixação de cabo", 14, 10, 1.4, [L / 2 - 22, -A / 2 + 30, -4.0], M.borda);
  cilindro(painelTras, "Argola de cabo", 4.6, 1.2, [L / 2 - 22, -A / 2 + 30, -5.0], M.prata, COSTAS);
  for (const x of [-L / 2 + 12, L / 2 - 12]) {
    parafuso(painelTras, `Parafuso do painel traseiro ${x}`, [x, -A / 2 + 12, -2.0], COSTAS);
    parafuso(painelTras, `Parafuso superior do painel ${x}`, [x, A / 2 - 12, -2.0], COSTAS);
  }

  const encaixes = grupo(raiz, "07 — Alimentação e encaixe de cabos");
  caixa(encaixes, "Travessa de encaixe da fonte", L - 30, 26, 4, [0, A / 2 - 22, -P / 2 + 30], M.chapaInterna);
  caixa(encaixes, "Base da fonte interna", 150, 3, 140, [0, A / 2 - 36, -P / 2 + 80], M.chapaInterna);
  caixa(encaixes, "Apoio frontal da fonte", 150, 88, 3, [0, A / 2 - 80, -P / 2 + 148], M.chapaInterna);
  for (const x of [-70, 70]) parafuso(encaixes, `Parafuso da fonte ${x}`, [x, A / 2 - 35, -P / 2 + 30], COSTAS);
  caixa(encaixes, "Passa-cabo superior", 44, 10, 8, [L / 2 - 40, A / 2 - 16, -P / 2 + 16], M.borda);
  caixa(encaixes, "Prensa-cabo", 30, 8, 5, [L / 2 - 40, A / 2 - 16, -P / 2 + 22], M.borracha);
  cilindro(encaixes, "Ilhós do passa-cabo", 5.0, 1.0, [L / 2 - 40, A / 2 - 16, -P / 2 + 24.5], M.prata, COSTAS);

  const base = grupo(raiz, "08 — Base, pés e filtro inferior");
  arredondada(base, "Moldura inferior", L, P, 4, 10, [0, -A / 2 - 3.0, 0], M.moldura, CIMA);
  for (const [x, z, nome] of [[-L / 2 + 24, P / 2 - 34, "dianteiro esquerdo"], [L / 2 - 24, P / 2 - 34, "dianteiro direito"], [-L / 2 + 24, -P / 2 + 34, "traseiro esquerdo"], [L / 2 - 24, -P / 2 + 34, "traseiro direito"]]) {
    arredondada(base, `Pé ${nome}`, 26, 20, 1.5, 3, [x, z, -5.2], M.borracha, CIMA);
    caixa(base, `Base do pé ${nome}`, 30, 24, 2.4, [x, z, -3.6], M.borda, CIMA);
    parafuso(base, `Parafuso do pé ${nome}`, [x, z, -4.7], CIMA);
  }
  arredondada(base, "Filtro inferior removível", 190, P - 90, 1.5, 4, [-8, P / 2 - 80, -5.0], M.malha, CIMA);
  for (let i = 0; i < 12; i++) {
    caixa(base, `Aleta do filtro inferior ${i + 1}`, 180, 3.0, 0.8, [-8, P / 2 - 110 + i * 5.4, -5.9], M.poeira, CIMA);
  }
  caixa(base, "Ranhura do filtro", 14, 3, 1.0, [-8, P / 2 - 33, -5.6], M.preto, CIMA);
  if (CONFIG.mostrarColunaDeVentilacao) {
    const coluna = grupo(base, "Coluna de ventilação opcional", [0, 0, -P / 2 + 30], CIMA);
    for (let i = 0; i < 3; i++) {
      caixa(coluna, `Perfil da coluna ${i + 1}`, 6, 6, A - 40, [(i - 1) * 8, 0, 0], M.borda, CIMA);
    }
  }
  return cena;
}
