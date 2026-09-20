import { Cena } from "@snaple/core";

/**
 * SNAPLE R-01 — estudo de câmera retrô com objetiva 50 mm.
 * Cena independente: copie este arquivo para examples/web/cena.ts.
 * Medidas em metros; +Y para cima; a objetiva aponta para +Z.
 *
 * Usa somente o contrato fornecido: grupo, box, cylinder, torus, lathe,
 * extrude, furos paramétricos e materiais neutros. Sem malhas importadas,
 * texturas, texto nativo, CSG, luzes ou dependência de Three.js.
 *
 * Os componentes usam referenciais locais explícitos. Isso evita depender
 * do sinal de U/V das faces laterais. Furos são feitos antes de inserir
 * as peças que ocupam suas cavidades.
 */
type No = ReturnType<Cena["criar"]>;
type V2 = [number, number];
type V3 = [number, number, number];
type Material = {
  cor: string;
  metalico?: number;
  rugosidade?: number;
  opacidade?: number;
};
type Traco = readonly [number, number, number, number];

export function montarCena(): Cena {
  const cena = new Cena();
  const PI = Math.PI;
  const TAU = 2 * PI;

  // Reduza as estrias para comparar qualidade visual / custo no viewer.
  const DETALHE = {
    segmentos: 64,
    segmentosOptica: 96,
    estriasFoco: 96,
    estriasAbertura: 64,
    estriasFiltro: 80,
    estriasSeletor: 48,
    inscricoes: true,
  } as const;

  const M = {
    metal: { cor: "#b7bbae", metalico: 0.82, rugosidade: 0.34 },
    champagne: { cor: "#c5bca3", metalico: 0.76, rugosidade: 0.38 },
    escovado: { cor: "#8e9690", metalico: 0.85, rugosidade: 0.43 },
    cromo: { cor: "#c4ceca", metalico: 0.94, rugosidade: 0.19 },
    grafite: { cor: "#222b2c", metalico: 0.65, rugosidade: 0.42 },
    preto: { cor: "#111818", metalico: 0.15, rugosidade: 0.7 },
    borracha: { cor: "#202a28", metalico: 0, rugosidade: 0.97 },
    couro: { cor: "#283e35", metalico: 0, rugosidade: 0.93 },
    relevo: { cor: "#354b40", metalico: 0, rugosidade: 0.96 },
    latão: { cor: "#b9985a", metalico: 0.84, rugosidade: 0.3 },
    vermelho: { cor: "#b25843", metalico: 0.18, rugosidade: 0.5 },
    tinta: { cor: "#e8e7d6", metalico: 0, rugosidade: 0.8 },
    gravacao: { cor: "#27322f", metalico: 0, rugosidade: 0.8 },
    lamina: { cor: "#46504e", metalico: 0.8, rugosidade: 0.46 },
    laminaClara: { cor: "#58615c", metalico: 0.8, rugosidade: 0.43 },
    vidro: { cor: "#679b96", metalico: 0.08, rugosidade: 0.09, opacidade: 0.3 },
    vidroInterno: {
      cor: "#667aa0",
      metalico: 0.05,
      rugosidade: 0.1,
      opacidade: 0.24,
    },
    coating: { cor: "#5d9290", metalico: 0.68, rugosidade: 0.2 },
    visor: { cor: "#274247", metalico: 0.25, rugosidade: 0.14 },
    ceu: { cor: "#385d60", metalico: 0, rugosidade: 0.5 },
    montanha: { cor: "#708780", metalico: 0, rugosidade: 0.8 },
    primeiroPlano: { cor: "#30483d", metalico: 0, rugosidade: 0.8 },
  } satisfies Record<string, Material>;

  const grupo = (
    pai: No,
    nome: string,
    posicao: V3 = [0, 0, 0],
    rotacao: V3 = [0, 0, 0],
  ): No => pai.criar("grupo", {}, { nome, transform: { posicao, rotacao } });

  const caixa = (
    pai: No,
    nome: string,
    largura: number,
    altura: number,
    profundidade: number,
    posicao: V3,
    material: Material,
    rotacao: V3 = [0, 0, 0],
  ): No =>
    pai.criar(
      "box",
      { largura, altura, profundidade },
      { nome, transform: { posicao, rotacao }, material },
    );

  const cilindro = (
    pai: No,
    nome: string,
    raio: number,
    altura: number,
    posicao: V3,
    material: Material,
    rotacao: V3 = [0, 0, 0],
  ): No =>
    pai.criar(
      "cylinder",
      { raioTopo: raio, raioBase: raio, altura, segmentos: DETALHE.segmentos },
      { nome, transform: { posicao, rotacao }, material },
    );

  const torus = (
    pai: No,
    nome: string,
    raio: number,
    raioTubo: number,
    posicao: V3,
    material: Material,
    rotacao: V3 = [0, 0, 0],
  ): No =>
    pai.criar(
      "torus",
      { raio, raioTubo, segmentos: DETALHE.segmentos, segmentosTubo: 10 },
      { nome, transform: { posicao, rotacao }, material },
    );

  const revolucao = (
    pai: No,
    nome: string,
    perfil: V2[],
    posicao: V3,
    material: Material,
  ): No =>
    pai.criar(
      "lathe",
      { perfil, segmentos: DETALHE.segmentosOptica },
      { nome, transform: { posicao }, material },
    );

  const extrusao = (
    pai: No,
    nome: string,
    perfil: V2[],
    altura: number,
    posicao: V3,
    material: Material,
    rotacao: V3 = [0, 0, 0],
  ): No =>
    pai.criar(
      "extrude",
      { perfil, altura },
      { nome, transform: { posicao, rotacao }, material },
    );

  // Cantos arredondados autorados como perfil: não é um bevel do renderer.
  const retanguloArredondado = (w: number, d: number, raio: number): V2[] => {
    const r = Math.min(raio, w / 2, d / 2);
    const pontos: V2[] = [];
    const cantos: [number, number, number][] = [
      [w / 2 - r, d / 2 - r, 0],
      [-w / 2 + r, d / 2 - r, PI / 2],
      [-w / 2 + r, -d / 2 + r, PI],
      [w / 2 - r, -d / 2 + r, (3 * PI) / 2],
    ];
    for (const [cx, cz, inicio] of cantos) {
      for (let i = 0; i <= 6; i++) {
        const a = inicio + (i * PI) / 12;
        pontos.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
      }
    }
    return pontos;
  };

  const arredondado = (
    pai: No,
    nome: string,
    w: number,
    h: number,
    d: number,
    raio: number,
    posicao: V3,
    material: Material,
  ): No =>
    extrusao(pai, nome, retanguloArredondado(w, d, raio), h, posicao, material);

  // Um lathe fechado produz uma parede anular, não um cilindro maciço.
  const anel = (
    pai: No,
    nome: string,
    interno: number,
    externo: number,
    altura: number,
    posicao: V3,
    material: Material,
  ): No =>
    revolucao(
      pai,
      nome,
      [
        [interno, -altura / 2],
        [externo, -altura / 2],
        [externo, altura / 2],
        [interno, altura / 2],
        [interno, -altura / 2],
      ],
      posicao,
      material,
    );

  // O backend recentra cada perfil extrudado. Recolocar seu centro preserva
  // as coordenadas originais de polígonos assimétricos (lâminas e paisagem).
  const poligonoNoPlano = (
    pai: No,
    nome: string,
    pontos: V2[],
    y: number,
    espessura: number,
    material: Material,
  ): No => {
    const xs = pontos.map((p) => p[0]);
    const zs = pontos.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    return extrusao(pai, nome, pontos, espessura, [cx, y, cz], material);
  };

  const serrilhar = (
    pai: No,
    nome: string,
    raio: number,
    altura: number,
    quantidade: number,
    espessura: number,
    material: Material,
  ): void => {
    const larguraDente = ((TAU * raio) / quantidade) * 0.43;
    for (let i = 0; i < quantidade; i++) {
      const a = (i * TAU) / quantidade;
      const r = raio + espessura / 2;
      caixa(
        pai,
        `${nome}_${i}`,
        larguraDente,
        altura,
        espessura,
        [r * Math.sin(a), 0, r * Math.cos(a)],
        material,
        [0, a, 0],
      );
    }
  };

  const parafuso = (
    pai: No,
    nome: string,
    posicao: V3,
    raio = 0.0014,
    rotacao: V3 = [0, 0, 0],
    altura = 0.00065,
  ): No => {
    const g = grupo(pai, nome, posicao, rotacao);
    const cabeca = cilindro(
      g,
      `${nome}_cabeca`,
      raio,
      altura,
      [0, altura / 2, 0],
      M.cromo,
    );
    // A fenda é um marcador geométrico raso, não um corte que atravessa o suporte.
    caixa(
      cabeca,
      `${nome}_fenda`,
      raio * 1.35,
      0.00004,
      raio * 0.22,
      [0, altura / 2 + 0.00002, 0],
      M.preto,
      [0, 0.36, 0],
    );
    return g;
  };

  // Fonte técnica vetorial própria: segmentos sólidos finos, não texto nativo.
  // Coordenadas 3 × 5; +Z do plano é a direção de leitura para baixo.
  const seg: Traco[] = [
    [0, 0, 3, 0],
    [3, 0, 3, 2.5],
    [3, 2.5, 3, 5],
    [0, 5, 3, 5],
    [0, 2.5, 0, 5],
    [0, 0, 0, 2.5],
    [0, 2.5, 3, 2.5],
  ];
  const codigos: Record<string, string> = {
    "0": "012345",
    "1": "12",
    "2": "01643",
    "3": "01236",
    "4": "5612",
    "5": "05623",
    "6": "056234",
    "7": "012",
    "8": "0123456",
    "9": "012356",
    A: "012456",
    B: "0123456",
    C: "0543",
    D: "012345",
    E: "05436",
    F: "0546",
    H: "12456",
    J: "1234",
    L: "543",
    O: "012345",
    P: "01546",
    S: "05623",
    U: "12345",
    "-": "6",
  };
  const especiais: Record<string, Traco[]> = {
    N: [
      [0, 5, 0, 0],
      [0, 0, 3, 5],
      [3, 5, 3, 0],
    ],
    M: [
      [0, 5, 0, 0],
      [0, 0, 1.5, 2],
      [1.5, 2, 3, 0],
      [3, 0, 3, 5],
    ],
    R: [seg[0]!, seg[1]!, seg[4]!, seg[5]!, seg[6]!, [0, 2.5, 3, 5]],
    I: [seg[0]!, seg[3]!, [1.5, 0, 1.5, 5]],
    T: [seg[0]!, [1.5, 0, 1.5, 5]],
    V: [
      [0, 0, 1.5, 5],
      [1.5, 5, 3, 0],
    ],
    "/": [[0, 5, 3, 0]],
    "+": [seg[6]!, [1.5, 1, 1.5, 4]],
    ".": [[1.4, 4.85, 1.6, 4.85]],
    ":": [
      [1.4, 1.5, 1.6, 1.5],
      [1.4, 3.5, 1.6, 3.5],
    ],
  };
  const alturaTinta = 0.000035;
  const texto = (
    pai: No,
    nome: string,
    valor: string,
    h: number,
    posicao: V3,
    material: Material,
    rotacao: V3 = [0, 0, 0],
  ): void => {
    if (!DETALHE.inscricoes) return;
    const g = grupo(pai, nome, posicao, rotacao);
    const caracteres = [...valor.toUpperCase()];
    const escala = h / 5;
    const passo = h * 0.85;
    const total = Math.max(0, caracteres.length - 1) * passo + h * 0.6;
    caracteres.forEach((c, i) => {
      const tracos =
        especiais[c] ?? [...(codigos[c] ?? "")].map((n) => seg[Number(n)]!);
      tracos.forEach(([x1, z1, x2, z2], j) => {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const l = Math.hypot(dx, dz) * escala;
        caixa(
          g,
          `${nome}_${i}_${j}`,
          l,
          alturaTinta,
          h * 0.085,
          [
            -total / 2 + i * passo + ((x1 + x2) * escala) / 2,
            alturaTinta / 2,
            ((z1 + z2) * escala) / 2 - h / 2,
          ],
          material,
          [0, -Math.atan2(dz, dx), 0],
        );
      });
    });
  };

  const textoCircular = (
    pai: No,
    nome: string,
    valor: string,
    h: number,
    raio: number,
    y: number,
    centroAngular: number,
    sentido = 1,
  ): void => {
    const letras = [...valor];
    const passo = (h * 0.85) / raio;
    letras.forEach((letra, i) => {
      const a = centroAngular + sentido * (i - (letras.length - 1) / 2) * passo;
      texto(
        pai,
        `${nome}_${i}`,
        letra,
        h,
        [raio * Math.sin(a), y, -raio * Math.cos(a)],
        M.tinta,
        [0, -a + (sentido < 0 ? PI : 0), 0],
      );
    });
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 1. CORPO — a origem da câmera é a face inferior da chapa de base.
  // ═══════════════════════════════════════════════════════════════════════
  const alturaPes = 0.0008;
  const camera = cena.criar(
    "grupo",
    {},
    {
      nome: "camera_snaple_r01",
      transform: { posicao: [0, alturaPes, 0] },
    },
  );

  const base = arredondado(
    camera,
    "chapa_inferior",
    0.148,
    0.004,
    0.047,
    0.004,
    [0, 0.002, 0],
    M.escovado,
  );
  base.furar({
    face: "base",
    forma: { tipo: "circulo", raio: 0.0032, segmentos: 48 },
    u: 0.01,
    v: 0,
    profundidade: 0.0032,
  });
  base.furar({
    face: "base",
    forma: { tipo: "retangulo", largura: 0.032, altura: 0.024 },
    u: -0.047,
    v: 0,
    profundidade: 0.0008,
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      base.furar({
        face: "base",
        forma: { tipo: "circulo", raio: 0.00145 },
        u: sx * 0.064,
        v: sz * 0.018,
        profundidade: 0.00055,
      });
    }
  }

  // Tampa da bateria dentro do rebaixo; rosca do tripé aproximada por anéis.
  caixa(
    base,
    "tampa_bateria",
    0.0313,
    0.00065,
    0.0233,
    [-0.047, -0.002 + 0.00035, 0],
    M.grafite,
  );
  for (let i = 0; i < 8; i++) {
    torus(
      base,
      `filete_rosca_tripe_${i}`,
      0.00305,
      0.00015,
      [0.01, -0.002 + 0.00025 + i * 0.00037, 0],
      M.latão,
    );
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parafuso(
        camera,
        `parafuso_base_${sx}_${sz}`,
        [sx * 0.064, 0.0005, sz * 0.018],
        0.00125,
        [PI, 0, 0],
        0.0005,
      );
      caixa(
        camera,
        `pe_borracha_${sx}_${sz}`,
        0.01,
        alturaPes,
        0.004,
        [sx * 0.048, -alturaPes / 2, sz * 0.02],
        M.borracha,
      );
    }
  }
  caixa(
    camera,
    "trava_bateria",
    0.01,
    0.00016,
    0.003,
    [-0.047, 0.0001, 0.007],
    M.escovado,
  );

  arredondado(
    camera,
    "corpo_magnesio",
    0.144,
    0.073,
    0.043,
    0.006,
    [0, 0.0405, 0],
    M.grafite,
  );
  arredondado(
    camera,
    "tampa_superior",
    0.148,
    0.01,
    0.047,
    0.006,
    [0, 0.082, 0],
    M.champagne,
  );
  arredondado(
    camera,
    "chapa_superior",
    0.146,
    0.0008,
    0.045,
    0.005,
    [0, 0.0874, 0],
    M.metal,
  );
  const Y_TOPO = 0.0878;

  const frente = grupo(camera, "frente", [0, 0.0405, 0.0215], [PI / 2, 0, 0]);
  arredondado(
    frente,
    "revestimento_frontal",
    0.135,
    0.0016,
    0.064,
    0.004,
    [0, 0.0008, 0.0035],
    M.couro,
  );
  const pega = arredondado(
    frente,
    "empunhadura",
    0.026,
    0.006,
    0.064,
    0.007,
    [-0.053, 0.0046, 0.0035],
    M.borracha,
  );
  arredondado(
    pega,
    "couro_empunhadura",
    0.023,
    0.001,
    0.059,
    0.006,
    [0, 0.0035, 0],
    M.couro,
  );
  for (let i = 0; i < 12; i++) {
    caixa(
      pega,
      `sulco_empunhadura_${i}`,
      0.00045,
      0.00025,
      0.044,
      [-0.009 + i * 0.00165, 0.004125, 0],
      M.relevo,
    );
  }

  const marcaFrontal = grupo(
    camera,
    "marca_frontal",
    [0, 0.082, 0.0235],
    [PI / 2, 0, 0],
  );
  texto(
    marcaFrontal,
    "marca_snaple",
    "SNAPLE",
    0.0048,
    [0.003, 0, 0],
    M.gravacao,
  );
  texto(pega, "modelo", "R-01", 0.0022, [0, 0.00428, 0.02], M.tinta);

  const janelaFrontal = arredondado(
    frente,
    "janela_telemetro",
    0.024,
    0.002,
    0.012,
    0.0025,
    [0.051, 0.001, -0.026],
    M.metal,
  );
  arredondado(
    janelaFrontal,
    "vidro_telemetro",
    0.019,
    0.00045,
    0.008,
    0.001,
    [0, 0.001225, 0],
    M.visor,
  );
  caixa(
    janelaFrontal,
    "reflexo_telemetro",
    0.00045,
    0.00005,
    0.006,
    [-0.0067, 0.001475, 0],
    M.coating,
  );
  const janelaAux = arredondado(
    frente,
    "janela_auxiliar",
    0.012,
    0.0014,
    0.006,
    0.001,
    [-0.02, 0.0007, -0.0305],
    M.escovado,
  );
  caixa(
    janelaAux,
    "vidro_auxiliar",
    0.009,
    0.0003,
    0.0036,
    [0, 0.00085, 0],
    M.visor,
  );
  const luzAux = cilindro(
    frente,
    "aro_auxiliar_af",
    0.0026,
    0.0012,
    [-0.035, 0.0022, -0.016],
    M.escovado,
  );
  cilindro(
    luzAux,
    "lente_auxiliar_af",
    0.0018,
    0.0003,
    [0, 0.00075, 0],
    M.vermelho,
  );
  const selo = cilindro(
    frente,
    "selo_vermelho",
    0.0047,
    0.00065,
    [-0.033, 0.001925, 0.019],
    M.vermelho,
  );
  texto(selo, "monograma", "S", 0.0041, [0, 0.000325, 0], M.tinta);

  // ═══════════════════════════════════════════════════════════════════════
  // 2. OBJETIVA — tudo é autorado em Y; o grupo gira o eixo óptico para +Z.
  // ═══════════════════════════════════════════════════════════════════════
  const optica = grupo(
    camera,
    "objetiva_50mm",
    [0.008, 0.041, 0.0231],
    [PI / 2, 0, 0],
  );
  const baioneta = cilindro(
    optica,
    "flange_baioneta",
    0.03,
    0.0024,
    [0, 0.0012, 0],
    M.escovado,
  );
  baioneta.furar({
    face: "topo",
    forma: { tipo: "circulo", raio: 0.0218, segmentos: 96 },
    u: 0,
    v: 0,
  });
  const fixadores: V2[] = [
    [0.0266, 0],
    [0, 0.0266],
    [-0.0266, 0],
    [0, -0.0266],
  ];
  fixadores.forEach(([u, v]) =>
    baioneta.furar({
      face: "topo",
      forma: { tipo: "circulo", raio: 0.0011 },
      u,
      v,
    }),
  );
  fixadores.forEach(([x, z], i) =>
    parafuso(baioneta, `parafuso_baioneta_${i}`, [x, 0.0012, z], 0.00165),
  );
  torus(baioneta, "borda_baioneta", 0.02935, 0.00035, [0, 0.0012, 0], M.cromo);
  cilindro(
    baioneta,
    "indice_montagem",
    0.0011,
    0.00018,
    [-0.0204, 0.00129, -0.0204],
    M.vermelho,
  );

  const inicioBarril = 0.0024;
  const centroBarril = inicioBarril + 0.064 / 2;
  const barril = revolucao(
    optica,
    "barril_oco_perfilado",
    [
      [0.0246, 0],
      [0.0246, 0.006],
      [0.0265, 0.006],
      [0.0265, 0.011],
      [0.0258, 0.011],
      [0.0258, 0.029],
      [0.0267, 0.029],
      [0.0267, 0.04],
      [0.0277, 0.04],
      [0.0277, 0.049],
      [0.0265, 0.049],
      [0.0265, 0.059],
      [0.0242, 0.064],
      [0.0205, 0.064],
      [0.0205, 0.047],
      [0.0215, 0.012],
      [0.0215, 0],
      [0.0246, 0],
    ],
    [0, centroBarril, 0],
    M.grafite,
  );
  const yBarril = (y: number) => y - centroBarril;

  const foco = anel(
    barril,
    "anel_foco",
    0.0258,
    0.0267,
    0.0155,
    [0, yBarril(0.02225), 0],
    M.borracha,
  );
  serrilhar(
    foco,
    "estria_foco",
    0.0267,
    0.0142,
    DETALHE.estriasFoco,
    0.00085,
    M.relevo,
  );
  for (const lado of [-1, 1]) {
    torus(
      foco,
      `limite_foco_${lado}`,
      0.0266,
      0.00035,
      [0, lado * 0.00775, 0],
      M.preto,
    );
  }
  const abertura = anel(
    barril,
    "anel_abertura",
    0.0267,
    0.0275,
    0.0074,
    [0, yBarril(0.0367), 0],
    M.escovado,
  );
  serrilhar(
    abertura,
    "estria_abertura",
    0.0275,
    0.0062,
    DETALHE.estriasAbertura,
    0.0004,
    M.metal,
  );
  torus(abertura, "filete_abertura", 0.02735, 0.0002, [0, 0.0037, 0], M.latão);

  // Cada inscrição tangencia sua própria posição no cilindro, em vez de
  // colocar uma única placa plana "flutuando" sobre a curvatura inteira.
  ["0.7", "1", "2", "5", "INF"].forEach((valor, i) => {
    const a = (i - 2) * 0.44;
    const r = 0.0277;
    const g = grupo(
      barril,
      `escala_foco_${i}`,
      [r * Math.sin(a), yBarril(0.0472), -r * Math.cos(a)],
      [0, -a, 0],
    );
    texto(g, `distancia_${i}`, valor, 0.00175, [0, 0, 0], M.tinta, [
      -PI / 2,
      0,
      0,
    ]);
  });
  const indiceFoco = grupo(
    barril,
    "indice_foco",
    [0, yBarril(0.054), -0.0265],
    [-PI / 2, 0, 0],
  );
  poligonoNoPlano(
    indiceFoco,
    "seta_foco",
    [
      [-0.00065, 0.001],
      [0.00065, 0.001],
      [0, -0.001],
    ],
    0.00003,
    0.00006,
    M.vermelho,
  );

  const frenteLente = cilindro(
    optica,
    "aro_filtro_52",
    0.029,
    0.0028,
    [0, 0.0678, 0],
    M.preto,
  );
  frenteLente.furar({
    face: "topo",
    forma: { tipo: "circulo", raio: 0.0203, segmentos: 96 },
    u: 0,
    v: 0,
  });
  serrilhar(
    frenteLente,
    "estria_filtro",
    0.029,
    0.0019,
    DETALHE.estriasFiltro,
    0.00035,
    M.grafite,
  );
  torus(
    frenteLente,
    "filete_frontal_cromado",
    0.02845,
    0.00025,
    [0, 0.0014, 0],
    M.escovado,
  );
  textoCircular(
    frenteLente,
    "nome_objetiva",
    "SNAPLE 50MM 1:1.4",
    0.00185,
    0.02465,
    0.0014,
    0,
  );
  textoCircular(
    frenteLente,
    "tratamento",
    "MULTI COATED",
    0.0016,
    0.02465,
    0.0014,
    PI,
    -1,
  );
  texto(
    frenteLente,
    "diametro_filtro",
    "52",
    0.0017,
    [0.025, 0.0014, 0],
    M.tinta,
    [0, -PI / 2, 0],
  );

  // Diafragma com nove lâminas: perfis assimétricos, não uma textura.
  const portaIris = anel(
    barril,
    "suporte_diafragma",
    0.0189,
    0.0205,
    0.0014,
    [0, yBarril(0.049), 0],
    M.preto,
  );
  for (let i = 0; i < 9; i++) {
    const a = (i * TAU) / 9;
    const b = ((i + 1) * TAU) / 9;
    const ponto = (r: number, ang: number): V2 => [
      r * Math.cos(ang),
      r * Math.sin(ang),
    ];
    const perfil: V2[] = [
      ponto(0.0197, a + 0.007),
      ponto(0.0197, (a + b) / 2),
      ponto(0.0197, b - 0.007),
      ponto(0.0067, b + 0.28 - 0.007),
      ponto(0.0067, a + 0.28 + 0.007),
    ];
    poligonoNoPlano(
      portaIris,
      `lamina_diafragma_${i}`,
      perfil,
      0.00015,
      0.0003,
      i % 2 === 0 ? M.lamina : M.laminaClara,
    );
  }
  cilindro(
    barril,
    "fundo_optico",
    0.021,
    0.001,
    [0, yBarril(0.013), 0],
    M.preto,
  );
  revolucao(
    barril,
    "elemento_optico_interno",
    [
      [0, -0.0005],
      [0.008, -0.0004],
      [0.0145, 0],
      [0.008, 0.0006],
      [0, 0.0008],
    ],
    [0, yBarril(0.028), 0],
    M.vidroInterno,
  );
  revolucao(
    barril,
    "elemento_optico_frontal",
    [
      [0, -0.00065],
      [0.01, -0.0005],
      [0.018, -0.00025],
      [0.0204, 0],
      [0.0204, 0.00012],
      [0.018, 0.00045],
      [0.01, 0.00105],
      [0, 0.0013],
    ],
    [0, yBarril(0.060325), 0],
    M.vidro,
  );
  anel(
    barril,
    "retentor_vidro",
    0.0195,
    0.0205,
    0.0005,
    [0, yBarril(0.0605), 0],
    M.preto,
  );
  torus(
    barril,
    "coating_borda",
    0.0198,
    0.00013,
    [0, yBarril(0.06055), 0],
    M.coating,
  );

  const liberarLente = cilindro(
    frente,
    "botao_liberar_objetiva",
    0.0029,
    0.0015,
    [0.043, 0.00235, 0.019],
    M.preto,
  );
  cilindro(
    liberarLente,
    "miolo_liberar_objetiva",
    0.00185,
    0.0003,
    [0, 0.0009, 0],
    M.escovado,
  );

  // ═══════════════════════════════════════════════════════════════════════
  // 3. TOPO — seletores, disparador, chave e sapata de flash com contatos.
  // ═══════════════════════════════════════════════════════════════════════
  const seletor = (
    nome: string,
    x: number,
    z: number,
    raio: number,
    valores: readonly string[],
    escuro: boolean,
  ): void => {
    const g = grupo(camera, nome, [x, Y_TOPO, z]);
    cilindro(
      g,
      `${nome}_base`,
      raio + 0.0007,
      0.0012,
      [0, 0.0006, 0],
      M.grafite,
    );
    const corpo = cilindro(
      g,
      `${nome}_corpo`,
      raio,
      0.0048,
      [0, 0.0036, 0],
      M.escovado,
    );
    serrilhar(
      corpo,
      `${nome}_estria`,
      raio,
      0.004,
      DETALHE.estriasSeletor,
      0.0004,
      M.metal,
    );
    const tampa = cilindro(
      g,
      `${nome}_tampa`,
      raio - 0.0004,
      0.0008,
      [0, 0.0064, 0],
      escuro ? M.grafite : M.champagne,
    );
    torus(
      tampa,
      `${nome}_borda`,
      raio - 0.00065,
      0.0002,
      [0, 0.0004, 0],
      M.cromo,
    );
    valores.forEach((valor, i) => {
      const a = (i * TAU) / valores.length;
      texto(
        tampa,
        `${nome}_valor_${i}`,
        valor,
        0.00145,
        [(raio - 0.0025) * Math.sin(a), 0.0004, -(raio - 0.0025) * Math.cos(a)],
        escuro ? M.tinta : M.gravacao,
        [0, -a, 0],
      );
    });
    for (let i = 0; i < 24; i++) {
      const a = (i * TAU) / 24;
      caixa(
        tampa,
        `${nome}_graduacao_${i}`,
        0.00015,
        0.000035,
        i % 4 === 0 ? 0.00075 : 0.0004,
        [
          (raio - 0.0011) * Math.sin(a),
          0.0004175,
          -(raio - 0.0011) * Math.cos(a),
        ],
        escuro ? M.tinta : M.gravacao,
        [0, -a, 0],
      );
    }
    parafuso(tampa, `${nome}_eixo`, [0, 0.0004, 0], 0.0015);
    poligonoNoPlano(
      g,
      `${nome}_indice`,
      [
        [-0.00065, raio + 0.002],
        [0.00065, raio + 0.002],
        [0, raio + 0.0009],
      ],
      0.0001,
      0.0002,
      M.vermelho,
    );
  };
  seletor(
    "seletor_obturador",
    -0.046,
    -0.006,
    0.0104,
    ["B", "30", "60", "125", "250", "500"],
    false,
  );
  seletor("seletor_iso", 0.056, 0.0, 0.01, ["100", "200", "400", "800"], true);

  const disparador = grupo(camera, "disparador", [-0.047, Y_TOPO, 0.015]);
  cilindro(
    disparador,
    "colar_disparador",
    0.0043,
    0.0012,
    [0, 0.0006, 0],
    M.escovado,
  );
  revolucao(
    disparador,
    "botao_disparador",
    [
      [0, 0],
      [0.0033, 0],
      [0.0038, 0.0005],
      [0.0038, 0.0024],
      [0.0032, 0.003],
      [0, 0.003],
    ],
    [0, 0.0027, 0],
    M.cromo,
  );
  cilindro(
    disparador,
    "inserto_disparador",
    0.0025,
    0.0003,
    [0, 0.00435, 0],
    M.vermelho,
  );
  caixa(
    disparador,
    "chave_ligar",
    0.0035,
    0.0007,
    0.002,
    [0.005, 0.0012, 0],
    M.preto,
    [0, -0.3, 0],
  );

  const sapata = grupo(camera, "sapata_flash", [0.006, Y_TOPO, -0.006]);
  arredondado(
    sapata,
    "isolador_sapata",
    0.02,
    0.0012,
    0.023,
    0.001,
    [0, 0.0006, 0],
    M.preto,
  );
  for (const lado of [-1, 1]) {
    caixa(
      sapata,
      `trilho_flash_${lado}`,
      0.0017,
      0.002,
      0.023,
      [lado * 0.009, 0.0022, 0],
      M.cromo,
    );
    caixa(
      sapata,
      `aba_flash_${lado}`,
      0.0035,
      0.00065,
      0.023,
      [lado * 0.00815, 0.003525, 0],
      M.cromo,
    );
  }
  caixa(
    sapata,
    "batente_flash",
    0.016,
    0.0015,
    0.0012,
    [0, 0.00195, -0.0109],
    M.escovado,
  );
  cilindro(
    sapata,
    "contato_central",
    0.0021,
    0.00035,
    [0, 0.001375, -0.001],
    M.latão,
  );
  for (let i = 0; i < 4; i++) {
    const pino = cilindro(
      sapata,
      `isolador_pino_${i}`,
      0.0011,
      0.0003,
      [-0.0042 + i * 0.0028, 0.00135, 0.005],
      M.escovado,
    );
    cilindro(
      pino,
      `contato_pino_${i}`,
      0.00065,
      0.00015,
      [0, 0.000225, 0],
      M.latão,
    );
  }
  texto(
    camera,
    "modelo_no_topo",
    "R-01",
    0.002,
    [0.006, Y_TOPO, 0.014],
    M.gravacao,
  );
  const gradeMic = caixa(
    camera,
    "grade_microfone",
    0.008,
    0.00045,
    0.004,
    [0.032, Y_TOPO + 0.000225, -0.012],
    M.escovado,
  );
  for (const u of [-0.0025, 0, 0.0025]) {
    for (const v of [-0.00085, 0.00085]) {
      gradeMic.furar({
        face: "topo",
        forma: { tipo: "circulo", raio: 0.00042, segmentos: 12 },
        u,
        v,
      });
    }
  }
  const fn = cilindro(
    camera,
    "botao_fn",
    0.0025,
    0.0011,
    [0.032, Y_TOPO + 0.00055, 0.013],
    M.grafite,
  );
  texto(fn, "icone_fn", "F", 0.0018, [0, 0.00055, 0], M.tinta);
  for (const x of [-0.065, 0.068]) {
    parafuso(camera, `parafuso_topo_${x}`, [x, Y_TOPO, -0.016], 0.0011);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. TRASEIRA — visor, LCD, paisagem geométrica, HUD e controles.
  // A rotação adicional em Y mantém a leitura correta vista por trás.
  // ═══════════════════════════════════════════════════════════════════════
  const traseira = grupo(
    camera,
    "traseira",
    [0, 0.0405, -0.0215],
    [-PI / 2, PI, 0],
  );
  arredondado(
    traseira,
    "tampa_traseira",
    0.138,
    0.0014,
    0.066,
    0.004,
    [0, 0.0007, 0],
    M.couro,
  );
  const telaBase = arredondado(
    traseira,
    "moldura_lcd",
    0.08,
    0.0022,
    0.047,
    0.003,
    [-0.013, 0.0025, 0.006],
    M.preto,
  );
  arredondado(
    telaBase,
    "bisel_lcd",
    0.075,
    0.0005,
    0.042,
    0.002,
    [0, 0.00135, 0],
    M.escovado,
  );
  arredondado(
    telaBase,
    "superficie_lcd",
    0.07,
    0.00035,
    0.037,
    0.0013,
    [0, 0.001775, 0],
    M.ceu,
  );
  const imagem = grupo(telaBase, "imagem_lcd", [0, 0.00195, 0]);
  poligonoNoPlano(
    imagem,
    "serra_distante",
    [
      [-0.033, 0.014],
      [-0.033, 0.001],
      [-0.024, -0.005],
      [-0.016, 0.001],
      [-0.003, -0.012],
      [0.01, 0.001],
      [0.021, -0.006],
      [0.033, 0.001],
      [0.033, 0.014],
    ],
    0.00006,
    0.00012,
    M.montanha,
  );
  poligonoNoPlano(
    imagem,
    "serra_proxima",
    [
      [-0.033, 0.015],
      [-0.033, 0.007],
      [-0.014, 0.003],
      [-0.006, 0.007],
      [0.009, -0.001],
      [0.021, 0.004],
      [0.033, 0.002],
      [0.033, 0.015],
    ],
    0.0002,
    0.00012,
    M.primeiroPlano,
  );
  cilindro(
    imagem,
    "sol_lcd",
    0.0026,
    0.00012,
    [0.023, 0.00006, -0.01],
    M.champagne,
  );
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      caixa(
        imagem,
        `foco_horizontal_${sx}_${sz}`,
        0.004,
        0.00008,
        0.00018,
        [sx * 0.01, 0.00032, sz * 0.007],
        M.tinta,
      );
      caixa(
        imagem,
        `foco_vertical_${sx}_${sz}`,
        0.00018,
        0.00008,
        0.003,
        [sx * 0.012, 0.00032, sz * 0.0056],
        M.tinta,
      );
    }
  }
  texto(imagem, "hud_manual", "M", 0.002, [-0.029, 0.0003, -0.0145], M.tinta);
  texto(
    imagem,
    "hud_exposicao",
    "125 F2.8 ISO200",
    0.0015,
    [0, 0.0003, 0.0155],
    M.tinta,
  );
  caixa(
    imagem,
    "bateria_hud",
    0.0047,
    0.00012,
    0.0018,
    [0.029, 0.0003, -0.0145],
    M.tinta,
  );
  caixa(
    imagem,
    "carga_hud",
    0.0034,
    0.00006,
    0.001,
    [0.029, 0.00039, -0.0145],
    M.couro,
  );

  const ocular = arredondado(
    traseira,
    "borracha_ocular",
    0.025,
    0.0045,
    0.015,
    0.004,
    [-0.049, 0.00365, -0.025],
    M.borracha,
  );
  arredondado(
    ocular,
    "aro_ocular",
    0.018,
    0.00055,
    0.0095,
    0.0015,
    [0, 0.002525, 0],
    M.escovado,
  );
  arredondado(
    ocular,
    "vidro_ocular",
    0.015,
    0.0004,
    0.007,
    0.001,
    [0, 0.003, 0],
    M.visor,
  );
  const dioptria = cilindro(
    traseira,
    "ajuste_dioptria",
    0.0031,
    0.0018,
    [-0.03, 0.0023, -0.025],
    M.grafite,
  );
  serrilhar(
    dioptria,
    "estria_dioptria",
    0.0031,
    0.0013,
    20,
    0.00025,
    M.escovado,
  );
  parafuso(dioptria, "eixo_dioptria", [0, 0.0009, 0], 0.0009);

  const polegar = arredondado(
    traseira,
    "apoio_polegar",
    0.018,
    0.004,
    0.022,
    0.0035,
    [0.052, 0.0034, -0.022],
    M.borracha,
  );
  for (let i = 0; i < 7; i++) {
    caixa(
      polegar,
      `ranhura_polegar_${i}`,
      0.012,
      0.0003,
      0.0006,
      [0, 0.00215, -0.007 + i * 0.0023],
      M.relevo,
    );
  }
  const comando = cilindro(
    traseira,
    "dial_traseiro",
    0.0095,
    0.0026,
    [0.051, 0.0027, 0.004],
    M.grafite,
  );
  serrilhar(
    comando,
    "estria_dial_traseiro",
    0.0095,
    0.002,
    40,
    0.0004,
    M.escovado,
  );
  torus(comando, "anel_comando", 0.0071, 0.0003, [0, 0.0013, 0], M.escovado);
  const menu = cilindro(
    comando,
    "botao_menu",
    0.0044,
    0.0011,
    [0, 0.00185, 0],
    M.preto,
  );
  texto(menu, "legenda_menu", "M", 0.0022, [0, 0.00055, 0], M.tinta);
  for (let i = 0; i < 4; i++) {
    const a = (i * PI) / 2;
    caixa(
      comando,
      `marca_comando_${i}`,
      0.0012,
      0.00005,
      0.0004,
      [0.008 * Math.sin(a), 0.001325, 0.008 * Math.cos(a)],
      M.tinta,
      [0, a, 0],
    );
  }
  const play = cilindro(
    traseira,
    "botao_play",
    0.0026,
    0.0012,
    [0.042, 0.002, 0.023],
    M.preto,
  );
  poligonoNoPlano(
    play,
    "icone_play",
    [
      [-0.0007, -0.001],
      [0.001, 0],
      [-0.0007, 0.001],
    ],
    0.00062,
    0.00004,
    M.tinta,
  );
  const apagar = cilindro(
    traseira,
    "botao_apagar",
    0.0026,
    0.0012,
    [0.058, 0.002, 0.023],
    M.preto,
  );
  caixa(
    apagar,
    "lixeira_corpo",
    0.0012,
    0.00004,
    0.00135,
    [0, 0.00062, 0.0002],
    M.tinta,
  );
  caixa(
    apagar,
    "lixeira_tampa",
    0.0017,
    0.00004,
    0.00025,
    [0, 0.00062, -0.00075],
    M.tinta,
  );
  texto(
    traseira,
    "identificacao_traseira",
    "R-01",
    0.00175,
    [-0.013, 0.0014, 0.031],
    M.tinta,
  );
  for (const [x, z] of [
    [-0.064, -0.024],
    [-0.064, 0.025],
    [0.067, -0.027],
    [0.067, 0.027],
  ] as V2[]) {
    parafuso(traseira, `parafuso_traseiro_${x}_${z}`, [x, 0.0014, z], 0.00105);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. LATERAIS — conectores com cavidades reais e olhais para a correia.
  // ═══════════════════════════════════════════════════════════════════════
  const lateral = grupo(
    camera,
    "painel_conexoes",
    [0.072, 0.0405, 0],
    [PI / 2, 0, -PI / 2],
  );
  arredondado(
    lateral,
    "tampa_lateral",
    0.026,
    0.0015,
    0.045,
    0.003,
    [0, 0.00075, 0.005],
    M.borracha,
  );
  const conector = (
    nome: string,
    w: number,
    d: number,
    v: number,
    pinos: number,
  ): void => {
    const moldura = caixa(
      lateral,
      `${nome}_metal`,
      w,
      0.0012,
      d,
      [0, 0.0021, v],
      M.cromo,
    );
    moldura.furar({
      face: "topo",
      forma: { tipo: "retangulo", largura: w - 0.002, altura: d - 0.0018 },
      u: 0,
      v: 0,
      profundidade: 0.001,
    });
    caixa(
      moldura,
      `${nome}_fundo`,
      w - 0.0022,
      0.0001,
      d - 0.002,
      [0, -0.00035, 0],
      M.preto,
    );
    const lingua = caixa(
      moldura,
      `${nome}_lingua`,
      w - 0.004,
      0.00045,
      0.0007,
      [0, -0.000075, 0],
      M.grafite,
    );
    const passo = (w - 0.005) / pinos;
    for (let i = 0; i < pinos; i++) {
      caixa(
        lingua,
        `${nome}_contato_${i}`,
        passo * 0.55,
        0.00008,
        0.00045,
        [(i - (pinos - 1) / 2) * passo, 0.000265, 0],
        M.latão,
      );
    }
  };
  conector("usb_c", 0.0124, 0.0052, 0.004, 8);
  conector("micro_hdmi", 0.01, 0.0044, 0.019, 6);
  const audio = cilindro(
    lateral,
    "entrada_audio",
    0.0023,
    0.0012,
    [0, 0.0021, -0.011],
    M.escovado,
  );
  audio.furar({
    face: "topo",
    forma: { tipo: "circulo", raio: 0.0014 },
    u: 0,
    v: 0,
    profundidade: 0.001,
  });
  texto(lateral, "usb_legenda", "USB", 0.0015, [0, 0.0015, -0.0015], M.tinta);
  texto(lateral, "hdmi_legenda", "HDMI", 0.0014, [0, 0.0015, 0.0135], M.tinta);

  for (const lado of [-1, 1]) {
    const olhal = grupo(
      camera,
      `olhal_correia_${lado}`,
      [lado * 0.072, 0.065, -0.008],
      [0, 0, (-lado * PI) / 2],
    );
    cilindro(
      olhal,
      `base_olhal_${lado}`,
      0.0025,
      0.0028,
      [0, 0.0014, 0],
      M.escovado,
    );
    torus(
      olhal,
      `argola_correia_${lado}`,
      0.004,
      0.00065,
      [0, 0.003, 0],
      M.cromo,
    );
  }

  // Transparência é opacidade de material, não refração física. A rosca usa
  // anéis, não uma hélice. A cena é visual, não um projeto mecânico funcional.
  // O linter por AABB pode sinalizar anéis concêntricos, detalhes muito
  // próximos e fixações laterais. Não tratamos esses avisos como bloqueios.
  return cena;
}



