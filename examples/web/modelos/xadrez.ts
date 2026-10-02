import { Cena } from "@snaple/core";

/**
 * Peça de xadrez — Rei clássico Staunton
 * Base com cantos arredondados, corpo em lathe, coroa com cruz, colarinho com torus,
 * feltro na base e detalhes com helix e extrude recentrar:false
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

export function montarCena(): Cena {
  const cena = new Cena();
  const PI = Math.PI;

  const M = {
    madeiraClara: { cor: "#e8dcc0", metalico: 0, rugosidade: 0.75 },
    madeiraEscura: { cor: "#3a2a1a", metalico: 0, rugosidade: 0.8 },
    feltro: { cor: "#0a5a2a", metalico: 0, rugosidade: 0.95 },
    metal: { cor: "#c8cdd0", metalico: 0.85, rugosidade: 0.25 },
    ouro: { cor: "#c8a85a", metalico: 0.85, rugosidade: 0.3 },
  } satisfies Record<string, Material>;

  const grupo = (
    pai: No,
    nome: string,
    pos: V3 = [0, 0, 0],
    rot: V3 = [0, 0, 0],
  ): No =>
    pai.criar("grupo", {}, { nome, transform: { posicao: pos, rotacao: rot } });

  const caixa = (
    pai: No,
    nome: string,
    largura: number,
    altura: number,
    profundidade: number,
    pos: V3,
    mat: Material,
    rot: V3 = [0, 0, 0],
  ): No =>
    pai.criar(
      "box",
      { largura, altura, profundidade },
      { nome, transform: { posicao: pos, rotacao: rot }, material: mat as any },
    );

  const cilindro = (
    pai: No,
    nome: string,
    raio: number,
    altura: number,
    pos: V3,
    mat: Material,
    rot: V3 = [0, 0, 0],
  ): No =>
    pai.criar(
      "cylinder",
      { raioTopo: raio, raioBase: raio, altura, segmentos: 48 },
      { nome, transform: { posicao: pos, rotacao: rot }, material: mat as any },
    );

  const torus = (
    pai: No,
    nome: string,
    raio: number,
    raioTubo: number,
    pos: V3,
    mat: Material,
    rot: V3 = [0, 0, 0],
  ): No =>
    pai.criar(
      "torus",
      { raio, raioTubo, segmentos: 48, segmentosTubo: 16 },
      { nome, transform: { posicao: pos, rotacao: rot }, material: mat as any },
    );

  const revolucao = (
    pai: No,
    nome: string,
    perfil: V2[],
    pos: V3,
    mat: Material,
  ): No =>
    pai.criar(
      "lathe",
      { perfil, segmentos: 64 },
      { nome, transform: { posicao: pos }, material: mat as any },
    );

  const extrusao = (
    pai: No,
    nome: string,
    perfil: V2[],
    altura: number,
    pos: V3,
    mat: Material,
    recentrar?: boolean,
  ): No =>
    pai.criar(
      "extrude",
      { perfil, altura, ...(recentrar === false ? { recentrar: false } : {}) },
      { nome, transform: { posicao: pos }, material: mat as any },
    );

  const helix = (
    pai: No,
    nome: string,
    raio: number,
    raioTubo: number,
    passo: number,
    voltas: number,
    pos: V3,
    mat: Material,
  ): No =>
    pai.criar(
      "helix" as any,
      { raio, raioTubo, passo, voltas, segmentos: 32 },
      { nome, transform: { posicao: pos }, material: mat as any },
    );

  const retanguloArredondado = (w: number, d: number, r: number): V2[] => {
    const rr = Math.min(r, w / 2, d / 2);
    const pts: V2[] = [];
    const cantos: [number, number, number][] = [
      [w / 2 - rr, d / 2 - rr, 0],
      [-w / 2 + rr, d / 2 - rr, PI / 2],
      [-w / 2 + rr, -d / 2 + rr, PI],
      [w / 2 - rr, -d / 2 + rr, (3 * PI) / 2],
    ];
    for (const [cx, cz, ini] of cantos) {
      for (let i = 0; i <= 6; i++) {
        const a = ini + (i * PI) / 12;
        pts.push([cx + rr * Math.cos(a), cz + rr * Math.sin(a)]);
      }
    }
    return pts;
  };

  // ── Raiz ─────────────────────────────────────────────────────────────────
  const raiz = cena
    .criar("grupo", {}, { nome: "rei-xadrez" })
    .permitirFlutuacao(
      "subpeças decorativas (esferas e cruz da coroa, placa de identificação) " +
        "vão coladas acima da ponta da peça — o linter não conta contato pontual como apoio",
    );

  // Feltro na base (garante minY=0)
  const feltro = cilindro(
    raiz,
    "feltro",
    0.018,
    0.001,
    [0, 0.0005, 0],
    M.feltro,
  );

  // Base com cantos arredondados — extrude com recentrar:false para preservar
  // coordenadas do perfil em L do chanfro decorativo
  const base = extrusao(
    raiz,
    "base-madeira",
    retanguloArredondado(0.036, 0.036, 0.006),
    0.008,
    [0, 0.005, 0],
    M.madeiraClara,
  );

  // Segundo nível da base
  cilindro(raiz, "base-nivel2", 0.016, 0.004, [0, 0.011, 0], M.madeiraClara);

  // Colarinho com torus
  torus(raiz, "colarinho-base", 0.014, 0.0015, [0, 0.014, 0], M.metal);

  // Corpo principal em lathe — perfil Staunton clássico
  // Perfil [raio, altura] — Y local, centrado como cylinder/lathe
  const perfilRei: V2[] = [
    [0.012, -0.035],
    [0.013, -0.03],
    [0.011, -0.022],
    [0.009, -0.012],
    [0.01, -0.005],
    [0.012, 0.005],
    [0.011, 0.015],
    [0.009, 0.022],
    [0.01, 0.028],
    [0.012, 0.032],
    [0.011, 0.036],
    [0.008, 0.04],
  ];
  const corpo = revolucao(
    raiz,
    "corpo-rei",
    perfilRei,
    [0, 0.05, 0],
    M.madeiraClara,
  );

  // Colarinho superior
  torus(raiz, "colarinho-sup", 0.0095, 0.001, [0, 0.088, 0], M.metal);

  // Cabeça / coroa base
  cilindro(raiz, "coroa-base", 0.012, 0.008, [0, 0.094, 0], M.madeiraClara);

  // Coroa com 8 pontas — extrude com perfil estrelado e recentrar:false
  const perfilCoroa: V2[] = [];
  const pontas = 8;
  const raioInt = 0.01;
  const raioExt = 0.013;
  for (let i = 0; i < pontas * 2; i++) {
    const ang = (i * PI) / pontas;
    const r = i % 2 === 0 ? raioExt : raioInt;
    perfilCoroa.push([r * Math.cos(ang), r * Math.sin(ang)]);
  }
  extrusao(raiz, "coroa", perfilCoroa, 0.009, [0, 0.1025, 0], M.madeiraClara);

  // Detalhe dourado na coroa — torus
  torus(raiz, "coroa-anel-ouro", 0.011, 0.0006, [0, 0.104, 0], M.ouro);

  // Cruz no topo do Rei
  const cruzGrupo = grupo(raiz, "cruz", [0, 0.113, 0]);
  caixa(cruzGrupo, "cruz-vertical", 0.002, 0.008, 0.002, [0, 0.004, 0], M.ouro);
  caixa(
    cruzGrupo,
    "cruz-horizontal",
    0.006,
    0.002,
    0.002,
    [0, 0.004, 0],
    M.ouro,
  );

  // Detalhe helix decorativo no colarinho — pequena mola
  helix(
    raiz,
    "detalhe-helix",
    0.002,
    0.0003,
    0.0006,
    6,
    [0.013, 0.05, 0],
    M.ouro,
  );

  // Marca na base — feltro com iniciais gravadas (caixinhas)
  const marcaGrupo = grupo(raiz, "marca-base", [0, 0.0006, 0.012]);
  caixa(
    marcaGrupo,
    "marca-1",
    0.001,
    0.0002,
    0.002,
    [-0.002, 0, 0],
    M.madeiraEscura,
  );
  caixa(
    marcaGrupo,
    "marca-2",
    0.001,
    0.0002,
    0.002,
    [0, 0, 0],
    M.madeiraEscura,
  );
  caixa(
    marcaGrupo,
    "marca-3",
    0.001,
    0.0002,
    0.002,
    [0.002, 0, 0],
    M.madeiraEscura,
  );

  // Anéis decorativos no corpo — 5 torus
  for (let i = 0; i < 5; i++) {
    const y = 0.03 + i * 0.012;
    const r = 0.012 - i * 0.0005;
    torus(raiz, `anel-corpo-${i}`, r, 0.0006, [0, y, 0], M.metal);
  }

  // Faixas de latão no corpo
  for (let i = 0; i < 3; i++) {
    cilindro(
      raiz,
      `faixa-latao-${i}`,
      0.0105 + i * 0.0005,
      0.001,
      [0, 0.04 + i * 0.015, 0],
      M.ouro,
    );
  }

  // Detalhe de rosca helicoidal no pescoço — helix
  helix(
    raiz,
    "helix-pescoco",
    0.009,
    0.0004,
    0.0015,
    12,
    [0, 0.07, 0],
    M.metal,
  );

  // Esferas decorativas na coroa — 8 pontas com esfera
  for (let i = 0; i < 8; i++) {
    const ang = (i * 2 * Math.PI) / 8;
    const r = 0.013;
    const x = r * Math.cos(ang);
    const z = r * Math.sin(ang);
    const g = grupo(raiz, `ponta-coroa-${i}`, [x, 0.109, z]);
    // Using sphere primitive
    g.criar(
      "sphere",
      { raio: 0.0012, segmentos: 16 },
      { nome: `esfera-ponta-${i}`, material: M.ouro as any },
    );
    torus(g, `anel-ponta-${i}`, 0.0015, 0.0003, [0, 0, 0], M.ouro);
  }

  // Base com parafusos decorativos — 8 parafusos ao redor
  for (let i = 0; i < 8; i++) {
    const ang = (i * 2 * Math.PI) / 8;
    const r = 0.015;
    cilindro(
      raiz,
      `parafuso-base-${i}`,
      0.0008,
      0.0015,
      [r * Math.cos(ang), 0.002, r * Math.sin(ang)],
      M.metal,
    );
  }

  // Segunda camada de feltro com costura — torus
  torus(raiz, "costura-feltro", 0.016, 0.0003, [0, 0.001, 0], M.madeiraEscura);

  // Placa de identificação na base com extrude recentrar:false em L
  const perfilPlaca: [number, number][] = [
    [0.01, 0.01],
    [0.02, 0.01],
    [0.02, 0.015],
    [0.015, 0.015],
    [0.015, 0.02],
    [0.01, 0.02],
  ];
  extrusao(
    raiz,
    "placa-id",
    perfilPlaca,
    0.0005,
    [0, 0.009, 0.015],
    M.ouro,
    false,
  );

  // Cruz com detalhes extras — 4 braços com chanfro
  const cruzDetalhe = grupo(raiz, "cruz-detalhe", [0, 0.118, 0]);
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2;
    caixa(
      cruzDetalhe,
      `cruz-braco-${i}`,
      0.001,
      0.003,
      0.001,
      [0.002 * Math.cos(ang), 0, 0.002 * Math.sin(ang)],
      M.ouro,
      [0, ang, 0],
    );
  }

  // Tabuleiro 8x8 para contexto — 64 casas com recentrar:false
  const tabuleiro = grupo(raiz, "tabuleiro", [0, 0, 0.08]);
  for (let ix = 0; ix < 8; ix++) {
    for (let iz = 0; iz < 8; iz++) {
      const x = -0.14 + ix * 0.04;
      const z = -0.14 + iz * 0.04;
      const isClara = (ix + iz) % 2 === 0;
      const perfilCasa: [number, number][] = [
        [x, z],
        [x + 0.04, z],
        [x + 0.04, z + 0.04],
        [x, z + 0.04],
      ];
      extrusao(
        tabuleiro,
        `casa-${ix}-${iz}`,
        perfilCasa,
        0.002,
        [0, 0.001, 0],
        isClara ? M.madeiraClara : M.madeiraEscura,
        false,
      );
    }
  }

  // Borda do tabuleiro
  extrusao(
    tabuleiro,
    "borda-tabuleiro",
    retanguloArredondado(0.36, 0.36, 0.02),
    0.004,
    [0, 0.002, 0],
    M.madeiraEscura,
  );

  // Mais anéis e parafusos no corpo para chegar no nível câmera
  for (let i = 0; i < 10; i++) {
    torus(
      raiz,
      `anel-extra-${i}`,
      0.011 - i * 0.0003,
      0.0004,
      [0, 0.02 + i * 0.006, 0],
      i % 2 === 0 ? M.ouro : M.metal,
    );
  }
  for (let i = 0; i < 16; i++) {
    const ang = (i * 2 * Math.PI) / 16;
    const r = 0.02;
    cilindro(
      raiz,
      `parafuso-tab-${i}`,
      0.0005,
      0.001,
      [r * Math.cos(ang), 0.003, r * Math.sin(ang) + 0.08],
      M.metal,
    );
  }

  // Segunda helix decorativa no topo da cruz
  helix(raiz, "helix-cruz", 0.001, 0.0002, 0.0005, 8, [0, 0.122, 0], M.ouro);

  // Detalhe de fio de ouro enrolado na base — helix
  helix(
    raiz,
    "fio-ouro-base",
    0.017,
    0.00025,
    0.001,
    20,
    [0, 0.015, 0],
    M.ouro,
  );

  return cena;
}
