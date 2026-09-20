import { Cena, conectar, type NoRef } from "@snaple/core";

/**
 * SNAPLE L-27 — luminária de mesa articulada, estilo braço balanceado por molas.
 * Medidas em metros; +y para cima; a cúpula aponta para +z (sul) e para baixo.
 *
 * Estrutura:
 *   base (lathe maciço) ── feltros, botão, emblema, passa-cabo → cabo espiral → plugue   [face().colocar]
 *     └ colar giratório ── torre (grupo, giro em Y)
 *         ├ prato, garfo, tampas do eixo, âncoras e molas (helix + ganchos torus)
 *         └ ombro (grupo, θ1 em X) ── braço inferior, pinos das molas, espaçadores
 *             └ cotovelo (grupo, θ2) ── manípulo serrilhado, arruelas, braço superior
 *                 └ punho (grupo, θ3) ── articulação, suporte
 *                     └ cabeça ── cúpula (lathe oco) ── aro, soquete, lâmpada com rosca, interruptor
 *
 * Mudar POSE reposiciona o braço inteiro: tudo abaixo de cada articulação está no referencial dela,
 * e as molas são recalculadas a partir das duas pontas.
 *
 * Detalhes repetidos (estrias, ganchos, aro, rosca, lâmpada) são filhos da peça que os carrega:
 * o linter ignora pares pai/filho, então só sobram avisos de contatos entre peças distintas.
 */
type V2 = [number, number];
type V3 = [number, number, number];
type Material = { cor: string; metalico?: number; rugosidade?: number; opacidade?: number };
type Pai = Cena | NoRef;

export function montarCena(): Cena {
  const cena = new Cena();
  const PI = Math.PI;
  const TAU = 2 * PI;

  // ---- pose (radianos) — a única coisa para mexer se quiser outra posição ----
  const POSE = {
    giro: 0.35,      // torre em torno de Y
    ombro: -0.3,     // braço inferior, a partir da vertical (negativo = para trás)
    cotovelo: 1.65,  // braço superior, relativo ao inferior
    punho: -1.8,     // cabeça, relativa ao braço superior
  };

  const M = {
    esmalte: { cor: "#2f4a3c", metalico: 0.15, rugosidade: 0.32 },
    esmalteInterno: { cor: "#e9e4d8", metalico: 0, rugosidade: 0.6 },
    grafite: { cor: "#2a2f30", metalico: 0.6, rugosidade: 0.4 },
    cromo: { cor: "#c4ceca", metalico: 0.95, rugosidade: 0.15 },
    latao: { cor: "#b9985a", metalico: 0.85, rugosidade: 0.3 },
    vermelho: { cor: "#b25843", metalico: 0.1, rugosidade: 0.45 },
    feltro: { cor: "#1a1d1c", metalico: 0, rugosidade: 1 },
    tecido: { cor: "#8f3b2c", metalico: 0, rugosidade: 0.9 },
    baquelite: { cor: "#151716", metalico: 0.05, rugosidade: 0.5 },
    tinta: { cor: "#e8e2cc", metalico: 0, rugosidade: 0.7 },
    vidro: { cor: "#fff3d9", metalico: 0, rugosidade: 0.15, opacidade: 0.92 },
  } satisfies Record<string, Material>;

  // ---- helpers: todos aceitam o pai, para autorar no referencial de cada articulação ----
  const opts = (nome: string, posicao: V3, rotacao: V3, material?: Material) =>
    ({ nome, transform: { posicao, rotacao }, ...(material ? { material } : {}) });
  const grupo = (pai: Pai, nome: string, posicao: V3 = [0, 0, 0], rotacao: V3 = [0, 0, 0]): NoRef =>
    pai.criar("grupo", {}, opts(nome, posicao, rotacao));
  const caixa = (pai: Pai, nome: string, l: number, a: number, p: number, pos: V3, mat: Material, rot: V3 = [0, 0, 0]) =>
    pai.criar("box", { largura: l, altura: a, profundidade: p }, opts(nome, pos, rot, mat));
  const cilindro = (pai: Pai, nome: string, raio: number, altura: number, pos: V3, mat: Material, rot: V3 = [0, 0, 0]) =>
    pai.criar("cylinder", { raioTopo: raio, raioBase: raio, altura, segmentos: 48 }, opts(nome, pos, rot, mat));
  const torus = (pai: Pai, nome: string, raio: number, raioTubo: number, pos: V3, mat: Material, rot: V3 = [0, 0, 0]) =>
    pai.criar("torus", { raio, raioTubo, segmentos: 64, segmentosTubo: 12 }, opts(nome, pos, rot, mat));
  const revolucao = (pai: Pai, nome: string, perfil: V2[], pos: V3, mat: Material, rot: V3 = [0, 0, 0]) =>
    pai.criar("lathe", { perfil, segmentos: 96 }, opts(nome, pos, rot, mat));
  const extrusao = (pai: Pai, nome: string, perfil: V2[], altura: number, pos: V3, mat: Material, rot: V3 = [0, 0, 0]) =>
    pai.criar("extrude", { perfil, altura }, opts(nome, pos, rot, mat));
  const helice = (pai: Pai, nome: string, raio: number, raioTubo: number, passo: number, voltas: number,
    pos: V3, mat: Material, rot: V3 = [0, 0, 0]) =>
    pai.criar("helix", { raio, raioTubo, passo, voltas, segmentosPorVolta: 32, segmentosTubo: 10 }, opts(nome, pos, rot, mat));

  const EIXO_X: V3 = [0, 0, PI / 2]; // leva o eixo +y local de cilindros/lathes para o eixo X

  // Perfis 2D (plano XZ do extrude, x = comprimento, z = largura).
  const arco = (cx: number, raio: number, de: number, ate: number, n: number): V2[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = de + ((ate - de) * i) / n;
      return [cx + raio * Math.cos(a), raio * Math.sin(a)];
    });
  // barra de pontas redondas: centros das pontas em x = 0 e x = comp
  const estadio = (comp: number, raio: number): V2[] =>
    [...arco(comp, raio, -PI / 2, PI / 2, 16), ...arco(0, raio, PI / 2, (3 * PI) / 2, 16)];
  // chapa de base reta e topo redondo, altura total `alt`
  const gota = (alt: number, larg: number): V2[] =>
    [[0, -larg / 2], ...arco(alt - larg / 2, larg / 2, -PI / 2, PI / 2, 16), [0, larg / 2]];

  // Estrias em volta do eixo +y LOCAL de uma peça, criadas como filhas dela.
  const serrilhar = (peca: NoRef, nome: string, raio: number, comp: number, yCentro: number, n: number, esp: number, mat: Material) => {
    const r = raio + esp / 2, larg = (TAU * raio) / n / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      caixa(peca, `${nome}_${i}`, esp, comp, larg, [Math.cos(a) * r, yCentro, Math.sin(a) * r], mat, [0, -a, 0]);
    }
  };

  // ═════════════ 1. BASE — lathe maciço; acessórios presos por face().colocar ═════════════
  const PE_H = 0.002, BASE_R = 0.11, BASE_H = 0.028, TOPO_PLANO_R = 0.075;
  const base = revolucao(cena, "base", [
    [0, 0], [BASE_R - 0.003, 0], [BASE_R, 0.003], [BASE_R, 0.016],
    [BASE_R - 0.012, 0.024], [TOPO_PLANO_R + 0.006, 0.0278], [TOPO_PLANO_R, BASE_H], [0, BASE_H],
  ], [0, PE_H + BASE_H / 2, 0], M.esmalte);

  // três feltros a 120°, sob a base
  const FELTRO_R = 0.085;
  [PI / 2, PI / 2 + TAU / 3, PI / 2 + (2 * TAU) / 3].forEach((a, i) => {
    const feltro = cilindro(cena, `feltro_${i}`, 0.012, PE_H, [0, 0, 0], M.feltro);
    base.face("base").colocar(feltro, { u: Math.cos(a) * FELTRO_R, v: Math.sin(a) * FELTRO_R });
  });

  // botão liga/desliga à frente e emblema de latão à esquerda, no topo plano
  const botao = revolucao(cena, "botao_liga", [[0, 0], [0.009, 0], [0.009, 0.005], [0.0078, 0.0085], [0.004, 0.0098], [0, 0.01]], [0, 0, 0], M.vermelho);
  base.face("topo").colocar(botao, { u: 0, v: 0.055 });
  torus(botao, "aro_botao", 0.0093, 0.0008, [0, -0.005 + 0.0008, 0], M.cromo);
  const emblema = cilindro(cena, "emblema", 0.011, 0.0012, [0, 0, 0], M.latao);
  base.face("topo").colocar(emblema, { u: -0.05, v: 0.032 });
  torus(emblema, "friso_emblema", 0.0085, 0.0005, [0, 0.0006, 0], M.grafite);

  // passa-cabo na traseira, cabo espiral e plugue — a espiral encosta no tampo da mesa
  const PASSA_Y = 0.007; // altura do eixo do cabo acima do chão
  const passaCabo = revolucao(cena, "passa_cabo", [[0, 0], [0.006, 0], [0.006, 0.004], [0.0045, 0.012], [0, 0.012]], [0, 0, 0], M.baquelite);
  base.face("norte").colocar(passaCabo, { v: PASSA_Y - (PE_H + BASE_H / 2) });
  const CABO_TUBO = 0.0016;
  const cabo = helice(cena, "cabo_espiral", PASSA_Y - CABO_TUBO, CABO_TUBO, 0.0036, 42, [0, 0, 0], M.tecido);
  passaCabo.face("topo").colocar(cabo);
  const plugue = caixa(cena, "plugue", 0.022, 0.034, 2 * PASSA_Y, [0, 0, 0], M.baquelite);
  cabo.face("topo").colocar(plugue);
  for (const u of [-0.0065, 0.0065]) {
    const pino = cilindro(cena, `pino_plugue_${u < 0 ? "e" : "d"}`, 0.0022, 0.016, [0, 0, 0], M.cromo);
    plugue.face("topo").colocar(pino, { u });
  }

  // colar giratório de latão no centro; a torre gira sobre ele
  const COLAR_H = 0.018;
  const colar = revolucao(cena, "colar_giratorio", [
    [0, 0], [0.036, 0], [0.036, 0.004], [0.032, 0.007], [0.032, 0.015], [0.029, COLAR_H], [0, COLAR_H],
  ], [0, 0, 0], M.latao);
  base.face("topo").colocar(colar);
  serrilhar(colar, "estria_colar", 0.032, 0.006, 0.011 - COLAR_H / 2, 72, 0.0008, M.latao);

  // ═════════════ 2. TORRE — gira em Y; tudo daqui para cima é autorado localmente ═════════════
  const torre = grupo(colar, "torre", [0, COLAR_H / 2, 0], [0, POSE.giro, 0]);

  const PRATO_H = 0.004, PRATO_R = 0.042;
  cilindro(torre, "prato", PRATO_R, PRATO_H, [0, PRATO_H / 2, 0], M.grafite);

  // medidas transversais (x): braço inferior por fora, superior por dentro, garfo abraçando tudo
  const ESP_BARRA = 0.004;
  const X_INF = 0.009;                          // centro das barras inferiores
  const INF_IN = X_INF - ESP_BARRA / 2;         // 0.007
  const INF_OUT = X_INF + ESP_BARRA / 2;        // 0.011
  const X_SUP = 0.004;                          // centro das barras superiores
  const SUP_IN = X_SUP - ESP_BARRA / 2;         // 0.002
  const SUP_OUT = X_SUP + ESP_BARRA / 2;        // 0.006
  const X_GARFO = INF_OUT + ESP_BARRA / 2;      // garfo encosta na face externa do braço
  const GARFO_OUT = X_GARFO + ESP_BARRA / 2;

  const GARFO_H = 0.07, GARFO_L = 0.032;
  const yOmbro = PRATO_H + GARFO_H - GARFO_L / 2; // centro do arco do garfo = eixo do ombro
  for (const s of [-1, 1]) {
    const lado = s < 0 ? "oeste" : "leste";
    extrusao(torre, `garfo_${lado}`, gota(GARFO_H, GARFO_L), ESP_BARRA, [s * X_GARFO, PRATO_H + GARFO_H / 2, 0], M.grafite, EIXO_X);
    cilindro(torre, `tampa_ombro_${lado}`, 0.007, 0.003, [s * (GARFO_OUT + 0.0015), yOmbro, 0], M.cromo, EIXO_X);
  }

  // ═════════════ 3. BRAÇOS — cadeia de grupos; o comprimento corre em +y local ═════════════
  const L_INF = 0.33, L_SUP = 0.32, TRASEIRA_SUP = 0.035;
  const barra = (pai: NoRef, nome: string, x: number, de: number, ate: number, raio: number) =>
    extrusao(pai, nome, estadio(ate - de, raio), ESP_BARRA, [x, (de + ate) / 2, 0], M.grafite, EIXO_X);
  const espacador = (pai: NoRef, nome: string, meiaFolga: number, raio: number, y: number, mat: Material = M.cromo) =>
    cilindro(pai, nome, raio, 2 * meiaFolga, [0, y, 0], mat, EIXO_X);

  const ombro = grupo(torre, "ombro", [0, yOmbro, 0], [POSE.ombro, 0, 0]);
  const MOLA_Y = 0.13;
  for (const s of [-1, 1]) {
    const lado = s < 0 ? "oeste" : "leste";
    barra(ombro, `braco_inferior_${lado}`, s * X_INF, 0, L_INF, 0.008);
    // pino das molas: da face externa da barra até passar a mola
    cilindro(ombro, `pino_mola_${lado}`, 0.0025, 0.023, [s * (INF_OUT + 0.0115), MOLA_Y, 0], M.cromo, EIXO_X);
  }
  espacador(ombro, "espacador_ombro", INF_IN, 0.006, 0);
  espacador(ombro, "travessa_braco_inferior", INF_IN, 0.004, L_INF * 0.55);

  const cotovelo = grupo(ombro, "cotovelo", [0, L_INF, 0], [POSE.cotovelo, 0, 0]);
  for (const s of [-1, 1]) {
    const lado = s < 0 ? "oeste" : "leste";
    barra(cotovelo, `braco_superior_${lado}`, s * X_SUP, -TRASEIRA_SUP, L_SUP, 0.006);
    cilindro(cotovelo, `arruela_cotovelo_${lado}`, 0.007, INF_IN - SUP_OUT, [s * (SUP_OUT + INF_IN) / 2, 0, 0], M.latao, EIXO_X);
  }
  espacador(cotovelo, "espacador_cotovelo", SUP_IN, 0.005, 0);
  espacador(cotovelo, "espacador_traseiro", SUP_IN, 0.004, -TRASEIRA_SUP);
  // manípulo de aperto (leste) com serrilha; tampa simples (oeste)
  const MANIP_H = 0.0095;
  const manipulo = revolucao(cotovelo, "manipulo_cotovelo",
    [[0, 0], [0.011, 0], [0.011, 0.007], [0.009, 0.009], [0, MANIP_H]],
    [INF_OUT + MANIP_H / 2, 0, 0], M.latao, [0, 0, -PI / 2]);
  serrilhar(manipulo, "estria_manipulo", 0.011, 0.006, 0.0035 - MANIP_H / 2, 36, 0.0009, M.latao);
  cilindro(cotovelo, "tampa_cotovelo", 0.007, 0.003, [-(INF_OUT + 0.0015), 0, 0], M.cromo, EIXO_X);

  const punho = grupo(cotovelo, "punho", [0, L_SUP, 0], [POSE.punho, 0, 0]);
  const ART_R = 0.007, SUPORTE_H = 0.02, FLANGE_H = 0.003;
  espacador(punho, "articulacao_punho", SUP_IN, ART_R, 0, M.grafite);
  for (const s of [-1, 1]) cilindro(punho, `tampa_punho_${s < 0 ? "oeste" : "leste"}`, 0.0065, 0.003, [s * (SUP_OUT + 0.0015), 0, 0], M.cromo, EIXO_X);
  const hHaste = SUPORTE_H - FLANGE_H;
  caixa(punho, "suporte_cupula", 2 * SUP_IN, hHaste, 0.012, [0, -ART_R - hHaste / 2, 0], M.grafite);

  // ═════════════ 4. CABEÇA — cúpula oca por lathe; o eixo da luz é -y local ═════════════
  const cabeca = grupo(punho, "cabeca", [0, -ART_R - SUPORTE_H, 0]); // origem = topo da cúpula
  const R_PESC = 0.016, H_PESC = 0.018, R_DOMO = 0.042, H_DOMO = 0.03, R_BOCA = 0.08, H_SAIA = 0.1, PAREDE = 0.0012;
  const H_CUP = H_PESC + H_DOMO + H_SAIA;
  const externo: V2[] = [[R_PESC, 0], [R_PESC, -H_PESC]];
  for (let i = 1; i <= 12; i++) { // domo: quarto de elipse
    const t = (i / 12) * (PI / 2);
    externo.push([R_PESC + (R_DOMO - R_PESC) * Math.sin(t), -H_PESC - H_DOMO * (1 - Math.cos(t))]);
  }
  for (let i = 1; i <= 12; i++) { // saia: abre em curva suave até a boca
    const s = i / 12;
    externo.push([R_DOMO + (R_BOCA - R_DOMO) * Math.pow(s, 1.35), -H_PESC - H_DOMO - H_SAIA * s]);
  }
  const interno: V2[] = externo.slice().reverse().map(([r, h]) => [r - PAREDE, Math.min(h, -PAREDE)]);
  const cupula = revolucao(cabeca, "cupula", [[0, 0], ...externo, ...interno, [0, -PAREDE]], [0, -H_CUP / 2, 0], M.esmalte);
  // o lathe é uma casca só; a pintura interna clara vem de uma segunda casca rente, filha da cúpula
  const topoCup = H_CUP / 2; // topo da cúpula no referencial dela
  const RECUO = 0.0002; // pintura rente à parede interna, sem tocar nela
  const pintura: V2[] = [...interno.map(([r, h]): V2 => [r - RECUO, Math.min(h, -PAREDE - RECUO)]), [0, -PAREDE - RECUO]];
  // o lathe recentra cada perfil em y: compensa a diferença entre os dois centros
  revolucao(cupula, "pintura_interna", pintura, [0, (-PAREDE - RECUO) / 2, 0], M.esmalteInterno);
  cilindro(cupula, "flange_pescoco", 0.011, FLANGE_H, [0, topoCup + FLANGE_H / 2, 0], M.cromo);
  torus(cupula, "aro_boca", R_BOCA - PAREDE / 2, 0.0018, [0, -topoCup, 0], M.cromo);

  const SOQ_R = 0.0135, SOQ_H = 0.03;
  const ySoquete = topoCup - PAREDE - SOQ_H / 2;
  const soquete = cilindro(cupula, "soquete", SOQ_R, SOQ_H, [0, ySoquete, 0], M.baquelite);

  // lâmpada: bico roscado + bulbo esférico, num só perfil
  const R_BULBO = 0.03, R_BICO = 0.012, H_BICO = 0.012;
  const phi0 = Math.asin(0.014 / R_BULBO), cBulbo = -H_BICO - 0.01 - R_BULBO * Math.cos(phi0);
  const perfilLampada: V2[] = [[0, 0], [R_BICO, 0], [R_BICO, -H_BICO]];
  for (let i = 0; i <= 24; i++) {
    const f = phi0 + ((PI - phi0) * i) / 24;
    perfilLampada.push([R_BULBO * Math.sin(f), cBulbo + R_BULBO * Math.cos(f)]);
  }
  const H_LAMP = -(cBulbo - R_BULBO);
  // filha do soquete: rosqueada nele, então o contato não é aviso
  const lampada = revolucao(soquete, "lampada", perfilLampada, [0, -SOQ_H / 2 - H_LAMP / 2, 0], M.vidro);
  helice(lampada, "rosca_lampada", R_BICO + 0.0004, 0.0006, 0.0034, 2.6, [0, H_LAMP / 2 - H_BICO / 2, 0], M.cromo);

  // interruptor no pescoço, virado para trás (norte local)
  const interruptor = cilindro(cupula, "interruptor", 0.004, 0.006, [0, topoCup - H_PESC / 2, -(R_PESC + 0.003)], M.baquelite, [PI / 2, 0, 0]);
  caixa(interruptor, "tecla_interruptor", 0.005, 0.002, 0.003, [0, -0.004, 0], M.vermelho);

  // ═════════════ 5. MOLAS — conectadas das duas pontas via conectar(), no referencial da torre ═════════════
  const RG = 0.004, TUBO_GANCHO = 0.0008; // raio do gancho e do arame
  const ANCORA = 0.008, xMola = INF_OUT + 0.015, zAncora = -0.024;
  const PASSO_MOLA = 0.0022;
  for (const s of [-1, 1]) {
    const lado = s < 0 ? "oeste" : "leste";
    caixa(torre, `ancora_mola_${lado}`, ANCORA, ANCORA, ANCORA, [s * xMola, PRATO_H + ANCORA / 2, zAncora], M.grafite);
    const B: V3 = [s * xMola, PRATO_H + ANCORA, zAncora];               // topo da âncora
    const T: V3 = [s * xMola, yOmbro + MOLA_Y * Math.cos(POSE.ombro), MOLA_Y * Math.sin(POSE.ombro)]; // eixo do pino
    const dy = T[1] - B[1], dz = T[2] - B[2], dist = Math.hypot(dy, dz);
    const [uy, uz] = [dy / dist, dz / dist];
    // margens do MODELO (não de conectar()): espaço para o gancho de baixo
    // apoiar sem tocar a âncora, e para o de cima abraçar o pino sem cruzá-lo.
    const inicio = 2 * (RG + TUBO_GANCHO), fim = dist - RG;
    // conectar() já desconta `raioTubo` de cada ponta (a ponta ABERTA do tubo
    // vai um pouco além da trajetória — ver bbox.ts) para o tubo bater exato
    // no ponto pedido; somando essa margem de volta aqui, a TRAJETÓRIA da
    // hélice cai exatamente em [inicio, fim], como antes.
    const pontoA: V3 = [B[0], B[1] + uy * (inicio - TUBO_GANCHO), B[2] + uz * (inicio - TUBO_GANCHO)];
    const pontoB: V3 = [B[0], B[1] + uy * (fim + TUBO_GANCHO), B[2] + uz * (fim + TUBO_GANCHO)];
    const mola = conectar(torre, pontoA, pontoB, "helix", { raio: 0.0055, raioTubo: TUBO_GANCHO, passo: PASSO_MOLA },
      { material: M.cromo, nome: `mola_${lado}` });
    const meiaMola = (fim - inicio) / 2;
    torus(mola, `gancho_inferior_${lado}`, RG, TUBO_GANCHO, [0, -meiaMola - RG - TUBO_GANCHO, 0], M.cromo, EIXO_X);
    torus(mola, `gancho_superior_${lado}`, RG, TUBO_GANCHO, [0, meiaMola + RG, 0], M.cromo, EIXO_X);
  }

  // ═════════════ 6. GRAVAÇÕES — fonte de traços própria; cada traço é uma caixa fina em relevo ═════════════
  // Grade de 3 × 6 unidades por caractere, x para a direita, y para cima.
  const FONTE: Record<string, readonly (readonly [number, number, number, number])[]> = {
    S: [[3, 6, 0, 6], [0, 6, 0, 3], [0, 3, 3, 3], [3, 3, 3, 0], [3, 0, 0, 0]],
    N: [[0, 0, 0, 6], [0, 6, 3, 0], [3, 0, 3, 6]],
    A: [[0, 0, 0, 4], [0, 4, 1.5, 6], [1.5, 6, 3, 4], [3, 4, 3, 0], [0, 3, 3, 3]],
    P: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 3, 3], [3, 3, 0, 3]],
    L: [[0, 6, 0, 0], [0, 0, 3, 0]],
    E: [[3, 6, 0, 6], [0, 6, 0, 0], [0, 0, 3, 0], [0, 3, 2.2, 3]],
    "-": [[0.5, 3, 2.5, 3]],
    "2": [[0, 6, 3, 6], [3, 6, 3, 3], [3, 3, 0, 3], [0, 3, 0, 0], [0, 0, 3, 0]],
    "7": [[0, 6, 3, 6], [3, 6, 1, 0]],
  };
  const AVANCO = 4.8; // largura do caractere + espaço, em unidades da grade
  const soma = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const vetorial = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // Euler XYZ intrínseco da base ortonormal (colunas ex, ey, ez), mesma convenção do schema.
  const eulerDaBase = (ex: V3, ey: V3, ez: V3): V3 => {
    const m13 = Math.max(-1, Math.min(1, ez[0]));
    const y = Math.asin(m13);
    return Math.abs(m13) < 0.9999999
      ? [Math.atan2(-ez[1], ez[2]), y, Math.atan2(-ey[0], ex[0])]
      : [Math.atan2(ey[2], ey[1]), y, 0];
  };
  type Plano = { origem: V3; direita: V3; cima: V3; normal: V3 };
  // Um caractere centrado em `origem`, no plano (direita, cima), em relevo ao longo de `normal`.
  const caractere = (pai: NoRef, nome: string, c: string, { origem, direita, cima, normal }: Plano,
    unid: number, traco: number, relevo: number, mat: Material) => {
    (FONTE[c] ?? []).forEach(([x0, y0, x1, y1], i) => {
      const dx = (x1 - x0) * unid, dy = (y1 - y0) * unid, len = Math.hypot(dx, dy);
      const eixo = soma(soma([0, 0, 0], direita, dx / len), cima, dy / len);
      const mx = ((x0 + x1) / 2 - 1.5) * unid, my = ((y0 + y1) / 2 - 3) * unid;
      const centro = soma(soma(soma(origem, direita, mx), cima, my), normal, relevo / 2);
      caixa(pai, `${nome}_${i}`, len + traco, relevo, traco, centro, mat, eulerDaBase(eixo, normal, vetorial(eixo, normal)));
    });
  };
  const textoReto = (pai: NoRef, nome: string, txt: string, p: Plano, unid: number, traco: number, relevo: number, mat: Material) =>
    [...txt].forEach((c, i) => caractere(pai, `${nome}_${i}`, c, { ...p, origem: soma(p.origem, p.direita, (i - (txt.length - 1) / 2) * AVANCO * unid) }, unid, traco, relevo, mat));
  // Texto num arco horizontal de raio `raio`, centrado no ângulo `a0` (0 = norte), lido de fora para dentro.
  const textoCircular = (pai: NoRef, nome: string, txt: string, raio: number, y: number, a0: number, unid: number, traco: number, relevo: number, mat: Material) =>
    [...txt].forEach((c, i) => {
      const a = a0 + ((i - (txt.length - 1) / 2) * AVANCO * unid) / raio;
      caractere(pai, `${nome}_${i}`, c, {
        origem: [raio * Math.sin(a), y, -raio * Math.cos(a)],
        direita: [Math.cos(a), 0, Math.sin(a)], cima: [Math.sin(a), 0, -Math.cos(a)], normal: [0, 1, 0],
      }, unid, traco, relevo, mat);
    });

  const RELEVO = 0.0003;
  textoCircular(base, "letreiro_base", "SNAPLE", 0.058, BASE_H / 2, 0, 0.0013, 0.0007, RELEVO, M.latao);
  textoReto(torre, "modelo_garfo", "L-27", {
    origem: [GARFO_OUT, PRATO_H + 0.02, 0], direita: [0, 0, -1], cima: [0, 1, 0], normal: [1, 0, 0],
  }, 0.0011, 0.0006, RELEVO, M.tinta);

  return cena;
}
