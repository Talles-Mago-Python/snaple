import { Cena } from "@snaple/core";

/**
 * Relógio de parede em vista explodida (v2): cada camada é um `grupo`
 * separado ao longo de +Y — caixa traseira com gancho de parede e contatos
 * de bateria, bateria de botão com anel isolante, placa de movimento com
 * trem de engrenagens DENTADAS, cristal de quartzo e bobina com núcleo,
 * mostrador com 60 traços de minuto + índices aplicados + numerais em
 * relevo, ponteiros afilados em juntas (eixo y), vidro abaulado e aro
 * cromado.
 *
 * Animações (o viewer lista e toca; a primeira abre tocando):
 *   - "montagem": as camadas fecham numa pilha montada (e reabrem),
 *     `repetir: "vaivem"` — cada grupo ganha UMA faixa de `posicao`;
 *   - "funcionando": ponteiros (juntas) e engrenagens giram travados em
 *     razão de dentes / 60 s — o mecanismo "vive" na vista explodida.
 *
 * Medidas em metros; +Y para cima. Ângulos em radianos.
 * "12 horas" = direção -Z (norte), sentido horário visto de cima — por isso
 * junta/rotação de ponteiro usa ângulo NEGATIVO (eixo +y positivo gira
 * anti-horário visto de cima).
 *
 * A flutuação das camadas na pose explodida é da natureza da vista: cada
 * grupo de camada declara `permitirFlutuacao` (o linter lista como
 * intencional ignorada) e, na pose montada da animação, cada camada assenta
 * na de baixo. Uniões deliberadas (dente–cubo–pino, engrenagens vizinhas,
 * contrapeso do segundos) são declaradas com `permitirContato`.
 */
type V2 = [number, number];
type V3 = [number, number, number];
type No = ReturnType<Cena["criar"]>;
type Material = {
  cor: string;
  metalico?: number;
  rugosidade?: number;
  opacidade?: number;
};

/** Dígitos em traços [x1, z1, x2, z2] na grade 0..1 (z aponta "para baixo"),
 * mesmo padrão de fonte segmentada dos demais modelos — só o que o
 * mostrador precisa. */
type Traco = readonly [number, number, number, number];
const DIGITOS: Readonly<Record<string, readonly Traco[]>> = {
  "0": [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]],
  "1": [[0.2, 0.2, 0.6, 0], [0.6, 0, 0.6, 1], [0.2, 1, 1, 1]],
  "2": [[0, 0, 1, 0], [1, 0, 1, 0.5], [1, 0.5, 0, 0.5], [0, 0.5, 0, 1], [0, 1, 1, 1]],
  "3": [[0, 0, 1, 0], [1, 0, 1, 1], [0, 0.5, 1, 0.5], [0, 1, 1, 1]],
  "4": [[0, 0, 0, 0.5], [0, 0.5, 1, 0.5], [1, 0, 1, 1]],
  "5": [[1, 0, 0, 0], [0, 0, 0, 0.5], [0, 0.5, 1, 0.5], [1, 0.5, 1, 1], [1, 1, 0, 1]],
  "6": [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0.5], [1, 0.5, 0, 0.5]],
  "7": [[0, 0, 1, 0], [1, 0, 0.25, 1]],
  "8": [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0], [0, 0.5, 1, 0.5]],
  "9": [[1, 1, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0.5], [0, 0.5, 1, 0.5]],
};

export function montarCena(): Cena {
  const cena = new Cena();
  const PI = Math.PI;
  const TAU = 2 * PI;

  const M = {
    caixa: { cor: "#2b2f33", metalico: 0.7, rugosidade: 0.4 } satisfies Material,
    prata: { cor: "#c9cdd1", metalico: 0.85, rugosidade: 0.25 } satisfies Material,
    latao: { cor: "#b08d3e", metalico: 0.8, rugosidade: 0.32 } satisfies Material,
    lataoClaro: { cor: "#d3b264", metalico: 0.85, rugosidade: 0.28 } satisfies Material,
    mostrador: { cor: "#f5f1e6", metalico: 0, rugosidade: 0.6 } satisfies Material,
    marcador: { cor: "#1c1c1c", metalico: 0.1, rugosidade: 0.5 } satisfies Material,
    ponteiro: { cor: "#1c1c1c", metalico: 0.3, rugosidade: 0.4 } satisfies Material,
    ponteiroSegundos: { cor: "#b23a2f", metalico: 0.2, rugosidade: 0.4 } satisfies Material,
    vidro: { cor: "#bfe0e0", metalico: 0.05, rugosidade: 0.08, opacidade: 0.28 } satisfies Material,
    cromo: { cor: "#d8dde0", metalico: 0.9, rugosidade: 0.15 } satisfies Material,
    cobre: { cor: "#b96742", metalico: 0.9, rugosidade: 0.28 } satisfies Material,
    chip: { cor: "#17181a", metalico: 0.1, rugosidade: 0.5 } satisfies Material,
    plastico: { cor: "#e8e6df", metalico: 0, rugosidade: 0.55 } satisfies Material,
  };

  const caixaBox = (
    pai: No, nome: string, largura: number, altura: number, profundidade: number,
    posicao: V3, material: Material, rotacao: V3 = [0, 0, 0],
  ): No =>
    pai.criar("box", { largura, altura, profundidade },
      { nome, transform: { posicao, rotacao }, material });

  const cilindro = (
    pai: No, nome: string, raio: number, altura: number, posicao: V3,
    material: Material, rotacao: V3 = [0, 0, 0], segmentos = 48,
  ): No =>
    pai.criar("cylinder", { raioTopo: raio, raioBase: raio, altura, segmentos },
      { nome, transform: { posicao, rotacao }, material });

  const extrudado = (
    pai: No, nome: string, perfil: V2[], altura: number, posicao: V3,
    material: Material, rotacao: V3 = [0, 0, 0],
  ): No =>
    pai.criar("extrude", { perfil, altura },
      { nome, transform: { posicao, rotacao }, material });

  /** Superfície de revolução com alturas como declaradas (recentrar: false). */
  const torneado = (pai: No, nome: string, perfil: V2[], posicao: V3, material: Material, segmentos = 64): No =>
    pai.criar("lathe", { perfil, segmentos, recentrar: false },
      { nome, transform: { posicao }, material });

  /** Direção radial no plano XZ: fração 0 = 12h (-Z), sentido horário. */
  const direcao = (fracaoVolta: number, raio: number): [number, number] => {
    const a = fracaoVolta * TAU;
    return [Math.sin(a) * raio, -Math.cos(a) * raio];
  };
  const polar = (angulo: number, raio: number): [number, number] =>
    [Math.sin(angulo) * raio, -Math.cos(angulo) * raio];

  // ── Engrenagem: disco com dentes trapezoidais (extrude no plano XZ) ─────
  function perfilEngrenagem(dentes: number, raioRaiz: number, raioTopo: number): V2[] {
    const pts: V2[] = [];
    const passo = TAU / dentes;
    for (let i = 0; i < dentes; i++) {
      const a0 = i * passo;
      pts.push(
        [Math.sin(a0) * raioRaiz, -Math.cos(a0) * raioRaiz],
        [Math.sin(a0 + 0.22 * passo) * raioRaiz, -Math.cos(a0 + 0.22 * passo) * raioRaiz],
        [Math.sin(a0 + 0.32 * passo) * raioTopo, -Math.cos(a0 + 0.32 * passo) * raioTopo],
        [Math.sin(a0 + 0.58 * passo) * raioTopo, -Math.cos(a0 + 0.58 * passo) * raioTopo],
        [Math.sin(a0 + 0.68 * passo) * raioRaiz, -Math.cos(a0 + 0.68 * passo) * raioRaiz],
      );
    }
    return pts;
  }

  // ── Pilhas: explodida (gap EXPLOSAO) e montada (cadeia de contatos) ─────
  const EXPLOSAO = 0.05;
  const ALTURA_CAIXA = 0.022;    // local -0.011..+0.011
  const ALTURA_BATERIA = 0.0085; // local -0.004..+0.0045 (cruz inclusive)
  const ALTURA_MOVIMENTO = 0.02;   // placa (-0.003) .. topo do pino (+0.017)
  const ALTURA_MOSTRADOR = 0.011;  // disco + relevo de índices/numerais
  const ALTURA_PONTEIROS = 0.017;  // hora(0) .. topo da tampa (+0.017)
  const ALTURA_VIDRO = 0.008;
  const ALTURA_ARO = 0.02;

  const CAMADAS = [
    ALTURA_CAIXA, ALTURA_BATERIA, ALTURA_MOVIMENTO, ALTURA_MOSTRADOR,
    ALTURA_PONTEIROS, ALTURA_VIDRO, ALTURA_ARO,
  ];

  const yExplodido: number[] = [];
  {
    let cursor = 0;
    for (const h of CAMADAS) {
      yExplodido.push(cursor + h / 2);
      cursor += h + EXPLOSAO;
    }
  }

  // Montada: cadeia de contatos reais (quem assenta em quem). Alturas LOCAIS
  // de assentamento no referencial de cada grupo:
  const FUNDO_GANCHO = -0.014;     // ponto mais baixo da caixa montada
  const TOPO_CONTATOS = 0.013;     // topo das lâminas de contato da caixa
  const FUNDO_BATERIA = -0.004;
  const TOPO_BATERIA = 0.0044;     // topo da cruz da bateria
  const FUNDO_PLACA = -0.003;
  const TOPO_PINO_ENGRENAGEM = 0.017;
  const FUNDO_MOSTRADOR = -0.003;
  const TOPO_DISCO = 0.003;        // onde a hora assenta
  const TOPO_TAMPA_REL = 0.0085;   // topo da tampa central (local ponteiros)
  const FUNDO_VIDRO = -0.002;
  const PRATELEIRA_VIDRO = 0.002;  // topo da borda plana onde o aro assenta
  const FUNDO_ARO = -0.007;

  const yMontado: number[] = new Array<number>(CAMADAS.length).fill(0);
  yMontado[0] = -FUNDO_GANCHO; // gancho encosta no chão
  yMontado[1] = yMontado[0]! + TOPO_CONTATOS - FUNDO_BATERIA;
  yMontado[2] = yMontado[1]! + TOPO_BATERIA - FUNDO_PLACA;
  yMontado[3] = yMontado[2]! + TOPO_PINO_ENGRENAGEM - FUNDO_MOSTRADOR;
  yMontado[4] = yMontado[3]! + TOPO_DISCO + ALTURA_PONTEIROS / 2;
  yMontado[5] = yMontado[4]! + TOPO_TAMPA_REL - FUNDO_VIDRO;
  yMontado[6] = yMontado[5]! + PRATELEIRA_VIDRO - FUNDO_ARO;

  const camada = (nome: string, i: number): No =>
    cena
      .criar("grupo", {}, { nome, transform: { posicao: [0, yExplodido[i]!, 0] } })
      .permitirFlutuacao(
        "vista explodida: a camada só assenta na de baixo com a animação 'montagem' fechada",
      );

  // ═══ 1. Caixa traseira ─────────────────────────────────────────────────
  const caixa = camada("caixa_traseira", 0);
  // Disco sólido com canto arredondado (o linter não representa cavidades:
  // peças "dentro" da concha virariam interpenetração).
  torneado(caixa, "caixa_concha", [
    [0, -0.011], [0.15, -0.011], [0.16, -0.006], [0.16, 0.011], [0, 0.011], [0, -0.011],
  ], [0, 0, 0], M.caixa);
  // Gancho de parede: aba soldada no verso, com furo passante.
  const gancho = extrudado(caixa, "caixa_gancho", [
    [-0.011, -0.012], [0.011, -0.012], [0.011, 0.014], [0.007, 0.02],
    [-0.007, 0.02], [-0.011, 0.014],
  ], 0.003, [0, -0.011 - 0.0015, 0.168], M.caixa);
  gancho.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.0035, segmentos: 24 }, u: 0, v: 0.008 });
  // Contatos da bateria no topo: lâmina "+" e mola "−" (a bateria assenta neles).
  caixaBox(caixa, "caixa_contato_pos", 0.004, 0.002, 0.012, [0.009, 0.011 + 0.001, 0], M.prata);
  cilindro(caixa, "caixa_contato_neg", 0.003, 0.002, [-0.009, 0.011 + 0.001, 0], M.prata, [0, 0, 0], 24);

  // ═══ 2. Bateria de botão ───────────────────────────────────────────────
  const bateria = camada("bateria", 1);
  cilindro(bateria, "bateria_corpo", 0.0115, 0.0054, [0, -0.0013, 0], M.prata);
  // Anel isolante entre corpo e tampa.
  torneado(bateria, "bateria_anel", [
    [0.009, 0.0014], [0.0118, 0.0014], [0.0118, 0.0026], [0.009, 0.0026], [0.009, 0.0014],
  ], [0, 0, 0], M.plastico, 32);
  cilindro(bateria, "bateria_tampa", 0.009, 0.0014, [0, 0.0033, 0], M.prata);
  // Sinal "+" em relevo: cruz extrudada numa peça só.
  extrudado(bateria, "bateria_mais", [
    [-0.0006, -0.002], [0.0006, -0.002], [0.0006, -0.0006], [0.002, -0.0006],
    [0.002, 0.0006], [0.0006, 0.0006], [0.0006, 0.002], [-0.0006, 0.002],
    [-0.0006, 0.0006], [-0.002, 0.0006], [-0.002, -0.0006], [-0.0006, -0.0006],
  ], 0.0004, [0, 0.004 + 0.0002, 0], M.marcador);

  // ═══ 3. Placa de movimento + trem de engrenagens ───────────────────────
  const movimento = camada("movimento", 2);
  const Y_PLACA_TOPO = 0.003;
  const placa = cilindro(movimento, "mov_placa", 0.09, 0.006, [0, 0, 0], M.latao, [0, 0, 0], 64);
  // Três parafusos de fixação na borda da placa.
  for (let i = 0; i < 3; i++) {
    const [x, z] = direcao(i / 3 + 1 / 12, 0.08);
    cilindro(movimento, `mov_parafuso_${i}`, 0.0035, 0.002, [x, Y_PLACA_TOPO + 0.001, z], M.cromo, [0, 0, 0], 24);
  }
  // Cristal de quartzo e circuito integrado.
  cilindro(movimento, "mov_quartzo", 0.004, 0.011, [-0.055, Y_PLACA_TOPO + 0.0055, -0.03], M.prata, [0, 0, 0], 24);
  const [chipX, chipZ] = polar(3.3, 0.075); // longe do raio girado das engrenagens
  caixaBox(movimento, "mov_chip", 0.014, 0.003, 0.009, [chipX, Y_PLACA_TOPO + 0.0015, chipZ], M.chip);
  // Bobina do motor de passo: anel de cobre em pé + núcleo que atravessa.
  const bobina = torneado(movimento, "mov_bobina", [
    [0.004, 0], [0.007, 0], [0.007, 0.008], [0.004, 0.008], [0.004, 0],
  ], [-0.02, Y_PLACA_TOPO, 0.062], M.cobre, 32);
  const nucleo = caixaBox(movimento, "mov_nucleo", 0.005, 0.013, 0.005, [-0.02, Y_PLACA_TOPO + 0.0065, 0.062], M.chip);
  placa.permitirContato(bobina);
  placa.permitirContato(nucleo);
  bobina.permitirContato(nucleo); // núcleo dentro do carretel (a OBB da revolução é cheia)

  // Trem de engrenagens: central → média → pequena, 2 mm entre círculos de
  // topo (dentes à vista; o quadrado envolvente vizinho é contato declarado).
  const DENTES = { central: 20, media: 12, pequena: 8 } as const;
  const RAIO_TOPO = { central: 0.036, media: 0.022, pequena: 0.013 } as const;
  const FOLGA_DENTE = 0.002;
  const posCentral: [number, number] = [0, 0];
  const angMedia = 1.1;
  const posMedia: [number, number] = [
    posCentral[0] + polar(angMedia, RAIO_TOPO.central + RAIO_TOPO.media + FOLGA_DENTE)[0],
    posCentral[1] + polar(angMedia, RAIO_TOPO.central + RAIO_TOPO.media + FOLGA_DENTE)[1],
  ];
  const angPequena = 2.6;
  const posPequena: [number, number] = [
    posMedia[0] + polar(angPequena, RAIO_TOPO.media + RAIO_TOPO.pequena + FOLGA_DENTE)[0],
    posMedia[1] + polar(angPequena, RAIO_TOPO.media + RAIO_TOPO.pequena + FOLGA_DENTE)[1],
  ];

  interface Engrenagem { no: No; dentes: number }
  function engrenagem(nome: string, dentes: number, raioTopo: number, espessura: number, pos: [number, number]): Engrenagem {
    const raioRaiz = raioTopo - 0.004;
    const y = Y_PLACA_TOPO + FOLGA_DENTE + espessura / 2;
    const g = extrudado(movimento, nome, perfilEngrenagem(dentes, raioRaiz, raioTopo), espessura, [pos[0], y, pos[1]], M.lataoClaro);
    const cubo = cilindro(movimento, `${nome}_cubo`, raioRaiz * 0.35, espessura + 0.003, [pos[0], y + 0.0015, pos[1]], M.latao, [0, 0, 0], 24);
    // Pino-eixo: da placa até acima do cubo (atravessa a engrenagem — união).
    const topoPino = y + espessura / 2 + 0.006;
    const pino = cilindro(movimento, `${nome}_pino`, 0.0015, topoPino - Y_PLACA_TOPO,
      [pos[0], (Y_PLACA_TOPO + topoPino) / 2, pos[1]], M.prata, [0, 0, 0], 12);
    g.permitirContato(cubo);
    g.permitirContato(pino);
    cubo.permitirContato(pino);
    return { no: g, dentes };
  }
  const engCentral = engrenagem("mov_engrenagem_central", DENTES.central, RAIO_TOPO.central, 0.006, posCentral);
  const engMedia = engrenagem("mov_engrenagem_media", DENTES.media, RAIO_TOPO.media, 0.005, posMedia);
  const engPequena = engrenagem("mov_engrenagem_pequena", DENTES.pequena, RAIO_TOPO.pequena, 0.004, posPequena);
  engCentral.no.permitirContato(engMedia.no);
  engMedia.no.permitirContato(engPequena.no);

  // ═══ 4. Mostrador ──────────────────────────────────────────────────────
  const mostrador = camada("mostrador", 3);
  const Y_MOST_TOPO = 0.003;
  cilindro(mostrador, "mostrador_disco", 0.15, 0.006, [0, 0, 0], M.mostrador, [0, 0, 0], 96);

  // 60 traços de minuto no anel externo; a cada 5, índice de hora aplicado.
  const RAIO_MINUTO = 0.141;
  const RAIO_INDICE = 0.126;
  for (let i = 0; i < 60; i++) {
    const hora = i % 5 === 0;
    const raio = hora ? RAIO_INDICE : RAIO_MINUTO;
    const comprimento = hora ? 0.018 : 0.007;
    const largura = hora ? 0.006 : 0.0018;
    const a = (i / 60) * TAU;
    const [x, z] = direcao(i / 60, raio);
    caixaBox(mostrador, hora ? `mostrador_indice_${i / 5}` : `mostrador_minuto_${i}`,
      largura, 0.0025, comprimento, [x, Y_MOST_TOPO + 0.00125, z], M.marcador, [0, a, 0]);
  }

  // Numerais 1–12 em relevo, topo voltado para fora (grupo girado -a).
  // Folga de 1,2 mm nas emendas dos traços: caixas giradas que só se tocam
  // esbarram na tolerância do SAT de OBBs.
  const RAIO_NUMERAL = 0.096;
  const ALTURA_NUMERAL = 0.026;
  const GW = ALTURA_NUMERAL * 0.6;
  const PASSO_NUM = ALTURA_NUMERAL * 0.82;
  const TRAÇO = ALTURA_NUMERAL * 0.13;
  const FOLHA_TRAÇO = 0.0022;
  const RELEVO = 0.0004;
  for (let h = 1; h <= 12; h++) {
    const texto = String(h);
    const a = (h / 12) * TAU;
    const [x, z] = direcao(h / 12, RAIO_NUMERAL);
    const g = cena.criar("grupo", {}, {
      nome: `mostrador_numero_${h}`,
      pai: mostrador,
      transform: { posicao: [x, Y_MOST_TOPO + RELEVO / 2, z], rotacao: [0, -a, 0] },
    });
    const total = (texto.length - 1) * PASSO_NUM + GW;
    const x0 = -total / 2;
    texto.split("").forEach((ch, ci) => {
      // Traços consecutivos do mesmo glifo se fundem nas emendas (união).
      const tracos: No[] = [];
      (DIGITOS[ch] ?? []).forEach(([x1, z1, x2, z2], si) => {
        const dx = (x2 - x1) * GW;
        const dz = (z2 - z1) * ALTURA_NUMERAL;
        const comprimento = Math.max(TRAÇO * 0.35, Math.hypot(dx, dz) - TRAÇO - FOLHA_TRAÇO);
        const mx = x0 + ci * PASSO_NUM + ((x1 + x2) / 2) * GW;
        const mz = -ALTURA_NUMERAL / 2 + ((z1 + z2) / 2) * ALTURA_NUMERAL;
        tracos.push(caixaBox(g, `mostrador_num_${h}_${ci}_${si}`, comprimento, RELEVO, TRAÇO,
          [mx, RELEVO / 2, mz], M.marcador, [0, -Math.atan2(dz, dx), 0]));
      });
      for (let t = 1; t < tracos.length; t++) tracos[t - 1]!.permitirContato(tracos[t]!);
    });
  }

  // ═══ 5. Ponteiros em juntas (pivô no centro) ───────────────────────────
  const ponteiros = camada("ponteiros", 4);
  const horas = 10;
  const minutos = 10;
  const segundos = 30;
  const fracaoHora = ((horas % 12) + minutos / 60) / 12;
  const fracaoMinuto = minutos / 60;
  const fracaoSegundo = segundos / 60;
  // Horário visto de cima é sentido horário → ângulo de junta NEGATIVO.
  const angHora = -fracaoHora * TAU;
  const angMinuto = -fracaoMinuto * TAU;
  const angSegundo = -fracaoSegundo * TAU;

  // Sub-pilha própria: cada ponteiro assenta no de baixo (contato no centro);
  // o da hora assenta no disco do mostrador na pose montada. Planos LOCAIS
  // (origem do grupo = fundo da hora):
  const P_BASE = -ALTURA_PONTEIROS / 2;
  const Y_HORA = P_BASE;                 // 0 .. 0.0035
  const Y_MINUTO = P_BASE + 0.0035;      // encosta no topo da hora
  const Y_BUCHA = P_BASE + 0.0065;       // bucha entre minuto e segundo
  const Y_SEGUNDO = P_BASE + 0.0085;     // encosta no topo da bucha
  const Y_TAMPA = P_BASE + 0.011;        // encosta no topo do segundo

  function ponteiro(
    nome: string, perfil: V2[], espessura: number, angulo: number, y: number, material: Material,
  ): No {
    const junta = ponteiros.criar("junta", { eixo: "y", angulo }, {
      nome: `${nome}_pivo`, transform: { posicao: [0, y + espessura / 2, 0] },
    });
    extrudado(junta, nome, perfil, espessura, [0, 0, 0], material);
    return junta;
  }

  // Formas afiladas: cauda curta para o lado +z, ponta para -z (12h em ângulo 0).
  const juntaHora = ponteiro("ponteiro_hora", [
    [-0.009, 0.02], [0.009, 0.02], [0.006, -0.015], [0.0022, -0.068],
    [0, -0.078], [-0.0022, -0.068], [-0.006, -0.015],
  ], 0.0035, angHora, Y_HORA, M.ponteiro);
  const juntaMinuto = ponteiro("ponteiro_minuto", [
    [-0.007, 0.03], [0.007, 0.03], [0.004, -0.03], [0.0016, -0.1],
    [0, -0.112], [-0.0016, -0.1], [-0.004, -0.03],
  ], 0.003, angMinuto, Y_MINUTO, M.ponteiro);
  // Bucha de latão entre minuto e segundo (afasta os centros das bboxes).
  cilindro(ponteiros, "ponteiro_bucha", 0.0025, 0.002, [0, Y_BUCHA + 0.001, 0], M.latao, [0, 0, 0], 16);
  const juntaSegundo = ponteiros.criar("junta", { eixo: "y", angulo: angSegundo }, {
    nome: "ponteiro_segundo_pivo", transform: { posicao: [0, Y_SEGUNDO + 0.00125, 0] },
  });
  // Cauda longa clássica desloca o centro da bbox para longe do minuto
  // (evita o aviso de centros coincidentes do feixe).
  const segBarra = extrudado(juntaSegundo, "ponteiro_segundo", [
    [-0.0016, 0.06], [0.0016, 0.06], [0.0016, -0.118], [0.0007, -0.128],
    [-0.0007, -0.128], [-0.0016, -0.118],
  ], 0.0025, [0, 0, 0], M.ponteiroSegundos);
  // Contrapeso circular na cauda do ponteiro de segundos (união declarada).
  const contrapeso = cilindro(juntaSegundo, "ponteiro_segundo_contrapeso", 0.006, 0.0025, [0, 0, 0.045], M.ponteiroSegundos, [0, 0, 0], 24);
  segBarra.permitirContato(contrapeso);
  // Tampa central de latão por cima do feixe.
  cilindro(ponteiros, "ponteiro_tampa", 0.011, 0.006, [0, Y_TAMPA + 0.003, 0], M.latao, [0, 0, 0], 32);

  // ═══ 6. Vidro abaulado ─────────────────────────────────────────────────
  const vidro = camada("vidro", 5);
  // Abaulado no centro, prateleira plana externa (0.14–0.155) p/ o aro.
  const vidroCristal = torneado(vidro, "vidro_cristal", [
    [0, 0.006], [0.06, 0.0052], [0.11, 0.0034], [0.14, 0.002], [0.155, 0.002],
    [0.155, -0.002], [0, -0.002], [0, 0.006],
  ], [0, 0, 0], M.vidro, 96);

  // ═══ 7. Aro frontal cromado ────────────────────────────────────────────
  const aro = camada("aro_frontal", 6);
  // Bezel fundo: abraça a borda do vidro (união declarada vidro×aro).
  const aroAnilha = torneado(aro, "aro_anilha", [
    [0.15, -0.007], [0.168, -0.007], [0.168, 0.006], [0.16, 0.013],
    [0.15, 0.013], [0.15, -0.007],
  ], [0, 0, 0], M.cromo, 96);
  vidroCristal.permitirContato(aroAnilha);

  // ── Animação 1: montagem (explodida ⇄ montada) ─────────────────────────
  const camadas = [caixa, bateria, movimento, mostrador, ponteiros, vidro, aro];
  const DUR_MONTAGEM = 3;
  const aMontagem = cena.animar("montagem", { duracao: DUR_MONTAGEM, repetir: "vaivem" });
  camadas.forEach((g, i) => {
    aMontagem.faixa(g, "posicao",
      [[0, [0, yExplodido[i]!, 0]], [DUR_MONTAGEM, [0, yMontado[i]!, 0]]],
      { interpolacao: "suave" });
  });

  // ── Animação 2: funcionando (ponteiros + engrenagens giram) ────────────
  const DUR_FUNDO = 6;
  const aFundo = cena.animar("funcionando", { duracao: DUR_FUNDO, repetir: "sempre" });
  // Segunda mão: 1 volta; minuto 1/60 de volta; hora 1/720 — razão real.
  aFundo.faixa(juntaSegundo, "angulo", [[0, angSegundo], [DUR_FUNDO, angSegundo - TAU]]);
  aFundo.faixa(juntaMinuto, "angulo", [[0, angMinuto], [DUR_FUNDO, angMinuto - TAU / 60]]);
  aFundo.faixa(juntaHora, "angulo", [[0, angHora], [DUR_FUNDO, angHora - TAU / 720]]);
  // Engrenagens travadas em razão de dentes (sentidos alternados).
  const GIRO_CENTRAL = PI; // meia volta em 6 s
  aFundo.faixa(engCentral.no, "rotacao", [[0, [0, 0, 0]], [DUR_FUNDO, [0, GIRO_CENTRAL, 0]]]);
  aFundo.faixa(engMedia.no, "rotacao", [[0, [0, 0, 0]], [DUR_FUNDO, [0, -GIRO_CENTRAL * DENTES.central / DENTES.media, 0]]]);
  aFundo.faixa(engPequena.no, "rotacao", [[0, [0, 0, 0]], [DUR_FUNDO, [0, GIRO_CENTRAL * DENTES.central / DENTES.pequena, 0]]]);

  return cena;
}

export default montarCena;
