import { Cena, type NoRef } from "@snaple/core";

// Livro pequeno, 12 × 17 cm, grosso demais para o número de páginas que
// devia ter (4 cm de miolo). Deitado no chão, capa frontal para cima.
// Frente = +z (sul, borda de corte das páginas); lombada = -z (norte);
// cabeça do livro = +x (leste). Sem título na capa — só o fio seco de uma
// moldura vazia e a marca de um rótulo arrancado. Um único fecho de metal
// enferrujado, com fechadura. Cantoneiras em três cantos; a quarta caiu no
// chão quando o canto inchou e rachou. As bordas das páginas estão manchadas
// de sangue seco em camadas, com a digital de um polegar. Na lombada, o couro
// começou a virar pele: os nervos do meio sumiram por baixo dela, e uma veia
// fina e ramificada corre logo abaixo da superfície, cheia de poros. A fita
// marcadora escorre pela cabeça até o chão, e há gotas entre o livro e a
// página caída.

type V3 = [number, number, number];
type XZ = [number, number];
type Material = { cor: string; metalico?: number; rugosidade?: number; opacidade?: number };
type NomeFace = "topo" | "base" | "norte" | "sul" | "leste" | "oeste";
type Onde = { pai?: NoRef; posicao?: V3; rotacao?: V3 };

const TAU = 2 * Math.PI;

// ---- medidas (m) ----
const ALT_CAPA = 0.0028;   // espessura de cada capa
const LARG_CAPA = 0.176;   // x: altura da página (17 cm) + 4 mm de cada lado
const PROF_CAPA = 0.126;   // z: largura do livro (12 cm) + 4 mm de cada lado
const LARG_MIOLO = 0.168;  // x: altura do bloco de páginas
const PROF_MIOLO = 0.118;  // z: largura do bloco de páginas
const ALT_MIOLO = 0.0344;  // y: o bloco fecha a conta dos 4 cm de lombada
const ALT_LIVRO = 2 * ALT_CAPA + ALT_MIOLO;

const SAIDA_LOMBADA = 0.011;             // oco da lombada, além das capas, para -z
const ALT_LOMBADA = ALT_LIVRO + 0.0045;  // lombada inchada: passa da capa frontal
const NERVOS = [-0.07, -0.035, 0, 0.035, 0.07]; // x de cada nervo da lombada
const X_PELE = 0.017;                    // centro da mancha de pele na lombada
const RAIO_ENGOLE = 0.045;               // nervos a menos disso do centro sumiram sob a pele

const X_FECHO = 0.042;                   // fecho fora do centro, puxado para a cabeça
const LARG_FECHO = 0.034;
const SAIDA_FECHO = 0.009;               // espessura da placa para fora da borda
const ALT_FECHO = ALT_LIVRO + 0.0045;    // abraça o livro de baixo a cima
const LARG_TIRA = 0.026;

const X_INCHACO = -0.062;                // canto do inchaço: pé + borda de corte
const Z_INCHACO = 0.040;
const R_INCHACO = 0.019;

const RECUO_FIO = 0.012;                 // moldura de fio seco, recuada da borda da capa
const LARG_FIO = 0.0012;
const CANTONEIRA = 0.02;                 // comprimento de cada perna do L
const LARG_CANTONEIRA = 0.004;

const ALT_PAGINA = 0.00022;
const X_PAGINA = 0.1;
const Z_PAGINA = PROF_CAPA / 2 + SAIDA_FECHO + 0.015 + 0.168 / 2; // 1,5 cm à frente do fecho
const Z_GOTAS = PROF_CAPA / 2 + SAIDA_FECHO + 0.007;               // entre o fecho e a página

const ESP_FITA = 0.0003;
const Z_FITA = -0.03;

// ---- perfis 2D (x, z) ----
/** Mancha orgânica: elipse a×b deformada por harmônicos em cosseno. Simétrica em z,
 *  então sai igual qualquer que seja o sinal que o extrude dá ao eixo z do perfil. */
const organico = (a: number, b: number, harm: Array<[number, number]>, n = 56): XZ[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU;
    const r = 1 + harm.reduce((s, [k, amp]) => s + amp * Math.cos(k * t), 0);
    return [a * r * Math.cos(t), b * r * Math.sin(t)];
  });
const dentroDoOrganico = (a: number, b: number, harm: Array<[number, number]>, x: number, z: number, folga: number) => {
  const t = Math.atan2(z / b, x / a);
  const r = 1 + harm.reduce((s, [k, amp]) => s + amp * Math.cos(k * t), 0);
  return Math.hypot(x / a, z / b) < r * folga;
};

/** Faixa sinuosa (veia): linha central z(x) com meia-largura afinando nas pontas. */
const faixa = (x0: number, x1: number, centro: (x: number) => number, larg: number, n = 64): XZ[] => {
  const xs = Array.from({ length: n }, (_, i) => x0 + ((x1 - x0) * i) / (n - 1));
  const meia = (i: number) => (larg / 2) * (0.3 + 0.7 * Math.sin((Math.PI * i) / (n - 1)));
  return [
    ...xs.map((x, i): XZ => [x, centro(x) + meia(i)]),
    ...xs.map((x, i): XZ => [x, centro(x) - meia(i)]).reverse(),
  ];
};

/** Digital: uma crista em espiral, ida pela borda de fora e volta pela de dentro (contorno único). */
const espiral = (passo: number, crista: number, voltas: number, alongamento: number, n = 400): XZ[] => {
  const ida: XZ[] = [], volta: XZ[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * voltas * TAU, r = passo * (0.6 + t / TAU);
    const c = Math.cos(t), s = Math.sin(t);
    ida.push([alongamento * (r + crista / 2) * c, (r + crista / 2) * s]);
    volta.push([alongamento * (r - crista / 2) * c, (r - crista / 2) * s]);
  }
  return [...ida, ...volta.reverse()];
};

/** Pseudoaleatório determinístico: o modelo sai igual a cada save. */
const sorteio = (semente: number) => () => {
  semente = (semente * 16807) % 2147483647;
  return (semente - 1) / 2147483646;
};

export function montarCena(): Cena {
  const cena = new Cena();

  const M = {
    couro: { cor: "#221611", rugosidade: 0.9 },
    couro_gasto: { cor: "#43301f", rugosidade: 0.95 },
    couro_esticado: { cor: "#3f2317", rugosidade: 0.65 }, // o inchaço estica o couro
    fio_seco: { cor: "#140c08", rugosidade: 0.8 },
    papel: { cor: "#d8cda9", rugosidade: 1 },
    papel_solto: { cor: "#e3d9b9", rugosidade: 1 },
    sangue: { cor: "#5c1d14", rugosidade: 0.7 },
    sangue_seco: { cor: "#43120c", rugosidade: 0.75 },
    sangue_quase_preto: { cor: "#2d0a07", rugosidade: 0.8 },
    metal_ferrugem: { cor: "#7c4a2a", metalico: 0.6, rugosidade: 0.75 },
    ferrugem_escura: { cor: "#4e2b18", metalico: 0.4, rugosidade: 0.9 },
    ferrugem_viva: { cor: "#9a4e22", metalico: 0.2, rugosidade: 0.95 },
    buraco: { cor: "#0a0605", rugosidade: 1 },
    pele: { cor: "#a86955", rugosidade: 0.55, opacidade: 0.72 }, // translúcida: a veia aparece por baixo
    veia: { cor: "#3d1018", rugosidade: 0.4 },
    poro: { cor: "#5e352c", rugosidade: 0.8 },
    seda: { cor: "#4a0c12", rugosidade: 0.45 },
    tinta: { cor: "#57503f", rugosidade: 0.9 },
    tinta_manuscrita: { cor: "#33171b", rugosidade: 0.85 },
  } satisfies Record<string, Material>;

  // ---- criação: filhos por fórmula usam `pai` + transform no referencial dele ----
  const opcoes = (nome: string, material: Material, onde: Onde = {}) => ({
    nome,
    material,
    ...(onde.pai ? { pai: onde.pai } : {}),
    ...(onde.posicao ? { transform: { posicao: onde.posicao, rotacao: onde.rotacao ?? ([0, 0, 0] as V3) } } : {}),
  });
  const caixa = (nome: string, [l, a, p]: V3, m: Material, onde?: Onde): NoRef =>
    cena.criar("box", { largura: l, altura: a, profundidade: p }, opcoes(nome, m, onde));
  const disco = (nome: string, r: number, a: number, m: Material, onde?: Onde): NoRef =>
    cena.criar("cylinder", { raioTopo: r, raioBase: r, altura: a, segmentos: 32 }, opcoes(nome, m, onde));
  const extrudar = (nome: string, perfil: XZ[], a: number, m: Material, onde?: Onde, recentrar = true): NoRef =>
    cena.criar("extrude", { perfil, altura: a, recentrar }, opcoes(nome, m, onde));

  // encosta o alvo na face e declara a relação — peça de parede sem
  // acoplamento aparece como "flutuando" no linter
  const fixar = (dono: NoRef, face: NomeFace, alvo: NoRef, u = 0, v = 0): NoRef => {
    dono.face(face).colocar(alvo, { u, v });
    cena.acoplar({ tipo: "contato", a: { no: dono, face }, b: { no: alvo, face: "base" } });
    return alvo;
  };

  // ════════ corpo do livro ════════
  const livro = caixa("livro", [LARG_CAPA, ALT_CAPA, PROF_CAPA], M.couro, { posicao: [0, ALT_CAPA / 2, 0] });
  const miolo = fixar(livro, "topo", caixa("miolo", [LARG_MIOLO, ALT_MIOLO, PROF_MIOLO], M.papel));
  const capa = fixar(miolo, "topo", caixa("capa frontal", [LARG_CAPA, ALT_CAPA, PROF_CAPA], M.couro));

  // ════════ lombada: o couro começando a virar pele ════════
  // Encosta só nas capas e sobe 4,5 mm acima da capa frontal: inchada.
  // Face "topo" da lombada = para fora (-z); U = +x, V = +y.
  const lombada = fixar(livro, "norte", caixa("lombada", [LARG_CAPA, SAIDA_LOMBADA, ALT_LOMBADA], M.couro), 0, (ALT_LOMBADA - ALT_CAPA) / 2);

  // nervos em relevo — só os que a pele ainda não engoliu
  for (const x of NERVOS)
    if (Math.abs(x - X_PELE) > RAIO_ENGOLE)
      fixar(lombada, "topo", caixa("nervo da lombada", [0.004, 0.0015, ALT_LOMBADA - 0.0065], M.couro_gasto), x, 0);

  // anel de transição: couro esticado, já sem o grão
  const transicao = fixar(lombada, "topo",
    extrudar("couro virando pele", organico(0.036, 0.016, [[2, 0.06], [3, 0.05], [5, 0.03]]), 0.0003, M.couro_esticado),
    X_PELE, 0);

  // a pele por cima
  const PELE: [number, number, Array<[number, number]>] = [0.026, 0.011, [[2, 0.05], [3, -0.04], [4, 0.03]]];
  const pele = fixar(transicao, "topo", extrudar("pele na lombada", organico(...PELE), 0.0005, M.pele));

  // dentro da espessura da pele (0,5 mm), em duas camadas que não se cruzam:
  // embaixo a veia, em cima o que sobrou dos nervos engolidos — os dois
  // aparecem através da pele translúcida
  const Y_VEIA = -0.00015, Y_RESTO = 0.00005, ESP_INTERNA = 0.00012;
  for (const x of NERVOS)
    if (Math.abs(x - X_PELE) <= RAIO_ENGOLE)
      caixa("nervo engolido pela pele", [0.003, ESP_INTERNA, 0.009], M.couro_gasto, { pai: pele, posicao: [x - X_PELE, Y_RESTO, 0] });

  // recentrar: false — o traçado da veia e do ramo está em coordenadas da pele,
  // e é isso que faz o ramo nascer em cima da veia
  const centroVeia = (x: number) => 0.0022 * Math.sin(x * 190) + 0.0012 * Math.sin(x * 430 + 1.3);
  const X_RAMO = 0.006;
  const veia = extrudar("veia", faixa(-0.006, 0.02, centroVeia, 0.0011), ESP_INTERNA, M.veia,
    { pai: pele, posicao: [0, Y_VEIA, 0] }, false);
  extrudar("ramo da veia", faixa(X_RAMO, X_RAMO + 0.01, (x) => centroVeia(X_RAMO) + (x - X_RAMO) * 0.35, 0.0006),
    ESP_INTERNA, M.veia, { pai: veia, posicao: [0, 0, 0] }, false);

  // poros espalhados numa grade com jitter, só dentro da pele
  const acaso = sorteio(7);
  for (let x = -0.022; x <= 0.022; x += 0.004)
    for (let z = -0.009; z <= 0.009; z += 0.004) {
      const px = x + (acaso() - 0.5) * 0.002, pz = z + (acaso() - 0.5) * 0.002;
      if (acaso() < 0.4 || !dentroDoOrganico(...PELE, px, pz, 0.8)) continue;
      if (NERVOS.some((n) => Math.abs(n - X_PELE - px) < 0.003)) continue; // não em cima de um nervo engolido
      fixar(pele, "topo", disco("poro", 0.00035 + acaso() * 0.00015, 0.0001, M.poro), px, pz);
    }

  // ════════ fecho de metal enferrujado, na borda de corte ════════
  // Ancorado no plano da borda da capa frontal e descendo até o chão.
  const fecho = caixa("fecho", [LARG_FECHO, SAIDA_FECHO, ALT_FECHO], M.metal_ferrugem);
  capa.face("sul").colocar(fecho, { u: -X_FECHO, v: ALT_FECHO / 2 - (ALT_LIVRO - ALT_CAPA / 2) });
  cena.acoplar({ tipo: "contato", a: { no: capa, face: "sul" }, b: { no: fecho, face: "base" } });

  // ferrugem em manchas, não em retângulo (face "topo" do fecho: U = -x, V = +y)
  const FERRUGENS: Array<[number, number, number, number, Material]> = [
    [0.009, 0.012, 0.005, 0.004, M.ferrugem_escura],
    [-0.01, -0.013, 0.004, 0.006, M.ferrugem_viva],
    [0.011, -0.01, 0.003, 0.003, M.ferrugem_escura],
  ];
  for (const [u, v, a, b, m] of FERRUGENS)
    fixar(fecho, "topo", extrudar("ferrugem no fecho", organico(a, b, [[2, 0.07], [3, 0.05]]), 0.0003, m), u, v);

  // botão com fechadura
  const botao = fixar(fecho, "topo", disco("botão do fecho", 0.0045, 0.0025, M.metal_ferrugem), -0.004, 0.002);
  const buraco = fixar(botao, "topo", disco("buraco da fechadura", 0.0007, 0.0001, M.buraco), 0, 0.0008);
  caixa("fenda da fechadura", [0.0005, 0.0001, 0.0016], M.buraco, { pai: buraco, posicao: [0, 0, -0.0016] });

  // tira que atravessa a capa até o fecho, com dois rebites
  const tira = fixar(capa, "topo", caixa("tira do fecho", [LARG_TIRA, 0.0012, 0.062], M.metal_ferrugem), X_FECHO, 0.032);
  for (const u of [-0.008, 0.008]) fixar(tira, "topo", disco("rebite", 0.0014, 0.0005, M.ferrugem_escura), u, 0.024);

  // ════════ capa: moldura vazia, rótulo arrancado, cantoneiras, canto inchado ════════
  const XF = LARG_CAPA / 2 - RECUO_FIO, ZF = PROF_CAPA / 2 - RECUO_FIO;
  const ZF_CURTO = ZF - LARG_FIO / 2 - 0.0001; // traços em z param antes de cruzar os de x
  const fio = (x0: number, x1: number, z0: number, z1: number) =>
    fixar(capa, "topo", caixa("fio seco da moldura", [x1 - x0, 0.0002, z1 - z0], M.fio_seco), (x0 + x1) / 2, (z0 + z1) / 2);
  // o canto inchado e a tira interrompem a moldura
  const BORDA_INCHACO = { x: X_INCHACO + R_INCHACO * 1.12 + 0.0015, z: Z_INCHACO - R_INCHACO * 1.12 - 0.001 };
  const TIRA = { x0: X_FECHO - LARG_TIRA / 2 - 0.001, x1: X_FECHO + LARG_TIRA / 2 + 0.001 };
  fio(-XF - LARG_FIO / 2, XF + LARG_FIO / 2, -ZF - LARG_FIO / 2, -ZF + LARG_FIO / 2);
  fio(BORDA_INCHACO.x, TIRA.x0, ZF - LARG_FIO / 2, ZF + LARG_FIO / 2);
  fio(TIRA.x1, XF + LARG_FIO / 2, ZF - LARG_FIO / 2, ZF + LARG_FIO / 2);
  fio(XF - LARG_FIO / 2, XF + LARG_FIO / 2, -ZF_CURTO, ZF_CURTO);
  fio(-XF - LARG_FIO / 2, -XF + LARG_FIO / 2, -ZF_CURTO, BORDA_INCHACO.z);

  // onde devia haver um título: couro mais claro e restos de papel colado
  const rotulo = fixar(capa, "topo", caixa("marca do rótulo arrancado", [0.05, 0.0002, 0.03], M.couro_gasto), -0.01, -0.008);
  const RESTOS: Array<[number, number, number, number]> = [
    [-0.021, 0.012, 0.005, 0.003],
    [0.02, -0.011, 0.007, 0.0025],
    [0.021, 0.0125, 0.003, 0.002],
  ];
  for (const [u, v, l, p] of RESTOS) fixar(rotulo, "topo", caixa("resto do rótulo", [l, 0.00015, p], M.papel_solto), u, v);

  // desgaste na borda do pé, entre as cantoneiras
  fixar(capa, "topo", caixa("desgaste na borda", [0.004, 0.00025, 0.08], M.couro_gasto), -(LARG_CAPA / 2 - 0.002), 0);

  // cantoneiras: duas pernas de um L, sem se cruzar; o canto (-x, +z) não tem
  const cantoneira = (sx: number, sz: number) => {
    const bx = sx * LARG_CAPA / 2, bz = sz * PROF_CAPA / 2;
    fixar(capa, "topo", caixa("cantoneira", [CANTONEIRA, 0.0006, LARG_CANTONEIRA], M.metal_ferrugem),
      bx - sx * CANTONEIRA / 2, bz - sz * LARG_CANTONEIRA / 2);
    fixar(capa, "topo", caixa("cantoneira", [LARG_CANTONEIRA, 0.0006, CANTONEIRA - LARG_CANTONEIRA], M.metal_ferrugem),
      bx - sx * LARG_CANTONEIRA / 2, bz - sz * (LARG_CANTONEIRA + (CANTONEIRA - LARG_CANTONEIRA) / 2));
  };
  cantoneira(1, 1);
  cantoneira(1, -1);
  cantoneira(-1, -1);

  // inchaço em três camadas (domo), rachado no alto
  const HARM_INCHACO: Array<[number, number]> = [[2, 0.09], [4, 0.03]];
  const baseInchaco = fixar(capa, "topo",
    extrudar("inchaço no canto", organico(R_INCHACO, R_INCHACO, HARM_INCHACO), 0.0012, M.couro_esticado), X_INCHACO, Z_INCHACO);
  const meioInchaco = fixar(baseInchaco, "topo", extrudar("inchaço no canto", organico(R_INCHACO * 0.7, R_INCHACO * 0.7, HARM_INCHACO), 0.001, M.couro_esticado));
  const altoInchaco = fixar(meioInchaco, "topo", extrudar("inchaço no canto", organico(R_INCHACO * 0.4, R_INCHACO * 0.4, HARM_INCHACO), 0.0008, M.couro_esticado));
  caixa("rachadura no couro", [0.011, 0.0001, 0.0005], M.sangue_quase_preto, { pai: altoInchaco, posicao: [0.003, 0.00045, -0.002], rotacao: [0, 0.6, 0] });

  // ════════ sangue seco nas bordas das páginas, em camadas ════════
  // camada larga na borda de corte (sul do miolo: U = -x, V = +y)…
  const mancha = fixar(miolo, "sul",
    extrudar("mancha na borda de corte", organico(0.052, 0.0092, [[2, 0.05], [3, 0.04], [5, 0.03]]), 0.0007, M.sangue), -0.02, -0.006);
  // …camada mais escura, menor, do lado oposto ao fecho (atrás dele ficaria
  // escondida), onde o polegar segurava…
  const manchaProfunda = fixar(mancha, "topo",
    extrudar("mancha profunda", organico(0.026, 0.0065, [[2, 0.06], [3, -0.05]]), 0.0006, M.sangue_seco), 0.02, -0.002);
  // …e a digital do polegar: uma crista em espiral, quase preta
  fixar(manchaProfunda, "topo", extrudar("marca de dedo", espiral(0.0012, 0.0005, 3.5, 1.35), 0.0003, M.sangue_quase_preto), 0.005, -0.001);
  // escoado pela cabeça (leste: U = +z) e pelo pé (oeste: U = -z) do bloco
  fixar(miolo, "leste", extrudar("mancha na cabeça", organico(0.024, 0.008, [[2, 0.06], [3, 0.04]]), 0.0007, M.sangue), 0.03, -0.006);
  fixar(miolo, "oeste", extrudar("mancha no pé", organico(0.02, 0.007, [[2, -0.05], [3, 0.05]]), 0.0007, M.sangue_seco), 0.02, -0.008);

  // ════════ páginas soltas escapando pela borda de corte ════════
  // Filhas do miolo (sobreposição com o pai é ignorada pelo linter), cada
  // uma saindo para +z com sua inclinação; todas longe do fecho em x.
  const PAGINAS_SOLTA: Array<{ l: number; p: number; pos: V3; rot: V3 }> = [
    { l: 0.092, p: 0.135, pos: [-0.036, 0.0058, 0.0105], rot: [0.012, 0.07, 0] },
    { l: 0.1, p: 0.126, pos: [-0.044, 0.0102, 0.012], rot: [-0.018, -0.055, 0] },
    { l: 0.086, p: 0.132, pos: [-0.028, 0.0142, 0.009], rot: [0.022, 0.035, 0] },
  ];
  for (const pag of PAGINAS_SOLTA)
    caixa("página solta", [pag.l, 0.00025, pag.p], M.papel_solto, { pai: miolo, posicao: pag.pos, rotacao: pag.rot });

  // ════════ fita marcadora: sai pela cabeça e escorre até o chão ════════
  // Três trechos filhos do miolo (referencial: centro do miolo), com folgas
  // de décimos de mm entre eles para as caixas não se cruzarem.
  const Y_MIOLO = ALT_CAPA + ALT_MIOLO / 2;         // centro do miolo no mundo
  const Y_FITA = 0.004;                              // entre as páginas, acima do meio
  const X_SAIDA = LARG_CAPA / 2 + 0.006;             // ponta que passa da capa
  const QUEDA = Y_MIOLO + Y_FITA - ESP_FITA / 2;     // até o chão
  const AVANCO = 0.018;
  const angulo = Math.atan2(QUEDA, AVANCO);
  const L_QUEDA = Math.hypot(QUEDA, AVANCO);
  caixa("fita marcadora", [X_SAIDA - 0.066, ESP_FITA, 0.006], M.seda,
    { pai: miolo, posicao: [(0.066 + X_SAIDA) / 2, Y_FITA, Z_FITA] });
  caixa("fita marcadora", [L_QUEDA, ESP_FITA, 0.006], M.seda,
    { pai: miolo, posicao: [X_SAIDA + 0.0003 + AVANCO / 2, Y_FITA - QUEDA / 2, Z_FITA], rotacao: [0, 0, -angulo] });
  caixa("fita marcadora", [0.035, ESP_FITA, 0.006], M.seda,
    { pai: miolo, posicao: [X_SAIDA + 0.0007 + AVANCO + 0.0175, ESP_FITA / 2 - Y_MIOLO, Z_FITA - 0.002], rotacao: [0, 0.12, 0] });

  // ════════ a página que caiu no chão, com a anotação ════════
  // Sem rotação de propósito: o linter é AABB, e linhas finas giradas
  // cruzam as bounding boxes umas das outras sem se tocar de verdade.
  const ESPACO_LINHA = 0.0065;
  const ALT_LINHA = 0.0001;
  const pagina = caixa("página caída", [0.118, ALT_PAGINA, 0.168], M.papel_solto, { posicao: [X_PAGINA, ALT_PAGINA / 2, Z_PAGINA] });

  // texto impresso: linhas de comprimento variado, terminação de parágrafo
  const COMPRIMENTOS = [
    0.088, 0.091, 0.085, 0.09, 0.062, 0.09, 0.091, 0.088, 0.041, 0.09, 0.09, 0.086, 0.078, 0.045,
  ];
  const Y_TINTA = ALT_PAGINA / 2 + ALT_LINHA / 2;
  const linhas = COMPRIMENTOS.map((comp, k) =>
    caixa("texto impresso", [comp, ALT_LINHA, 0.0018], M.tinta,
      { pai: pagina, posicao: [(k % 2 ? 1 : -1) * 0.003, Y_TINTA, -0.042 + k * ESPACO_LINHA] }),
  );

  // anotação manuscrita por cima do texto: traços escuros inclinados,
  // filhos das linhas longas que servem de hospedeiro
  const ANOTACOES: Array<{ hospede: number; dx: number; comp: number; incl: number }> = [
    { hospede: 2, dx: 0.004, comp: 0.072, incl: 0.05 },
    { hospede: 6, dx: -0.005, comp: 0.06, incl: -0.06 },
    { hospede: 10, dx: 0.002, comp: 0.055, incl: 0.04 },
  ];
  for (const a of ANOTACOES)
    caixa("anotação", [a.comp, 0.00008, 0.0012], M.tinta_manuscrita,
      { pai: linhas[a.hospede], posicao: [a.dx, ALT_LINHA / 2 + 0.00004, 0], rotacao: [0, a.incl, 0] });

  // rabiscos curtos nas margens (encostados na superfície da página)
  const RABISCOS: Array<[number, number, number, number]> = [
    [0.018, 0.058, 0.022, 0.18],
    [-0.014, -0.057, 0.016, -0.22],
  ];
  for (const [x, z, comp, incl] of RABISCOS)
    caixa("anotação", [comp, 0.00008, 0.0012], M.tinta_manuscrita,
      { pai: pagina, posicao: [x, ALT_PAGINA / 2 + 0.00004, z], rotacao: [0, incl, 0] });

  // sangue no canto da página caída — mancha, não retângulo
  extrudar("sangue na página caída", organico(0.01, 0.007, [[2, 0.08], [3, 0.06]]), 0.00006, M.sangue_seco,
    { pai: pagina, posicao: [0.045, ALT_PAGINA / 2 + 0.00003, 0.062], rotacao: [0, 0.4, 0] });

  // ════════ no chão ════════
  // gotas entre o fecho e a página caída
  const GOTAS: Array<[number, number, number]> = [
    [-0.03, 0, 0.0035],
    [-0.019, 0.002, 0.0022],
    [-0.042, -0.001, 0.0016],
  ];
  for (const [x, dz, r] of GOTAS)
    extrudar("gota de sangue", organico(r, r * 0.85, [[2, 0.08], [3, 0.05]]), 0.00018, M.sangue_quase_preto,
      { posicao: [x, 0.00009, Z_GOTAS + dz], rotacao: [0, x * 40, 0] });

  // a cantoneira que faltava no canto inchado, caída ao lado do livro
  const cantoneiraCaida = caixa("cantoneira caída", [CANTONEIRA, 0.0006, LARG_CANTONEIRA], M.ferrugem_escura,
    { posicao: [-LARG_CAPA / 2 - 0.025, 0.0003, Z_INCHACO + 0.035], rotacao: [0, 0.6, 0] });
  caixa("cantoneira caída", [LARG_CANTONEIRA, 0.0006, CANTONEIRA - LARG_CANTONEIRA], M.ferrugem_escura,
    { pai: cantoneiraCaida, posicao: [CANTONEIRA / 2 - LARG_CANTONEIRA / 2, 0, CANTONEIRA / 2] });

  return cena;
}
