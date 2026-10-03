/**
 * RIFT / 0000 — conceito de robô inspirado em FIRST Robotics Competition.
 * Um modelo paramétrico @snaple/core, não uma réplica nem projeto homologado.
 * Metros, Y-up, frente -Z, Euler XYZ em radianos. Sem I/O e sem Three.js.
 *
 * 4 módulos swerve (direção + roda), elevador inclinado de 2 estágios,
 * intake basculante, punho, garra com 2 roletes, esteira porta-cabos.
 * atualizarPoseFRC() movimenta referências existentes, sem criar geometria.
 * Não inclui física, controle de hardware, cálculo de cargas ou anti-colisão.
 */
import { Cena, type NoRef } from "@snaple/core";
type V3 = [number, number, number];
type P2 = [number, number];
type Pai = Cena | NoRef;
type FaceNome = "topo" | "base" | "norte" | "sul" | "leste" | "oeste";
type Material = { cor: string; metalico: number; rugosidade: number; opacidade?: number };
export type Quatro = [number, number, number, number];
export type ConfiguracaoFRC = "transporte" | "coleta" | "alcance-alto" | "manutencao";
export interface PoseFRC {
  /** Ordem: dianteiro esquerdo, dianteiro direito, traseiro esquerdo, traseiro direito. */
  direcoes: Quatro;
  faseRodas: number;
  /** Curso TOTAL dos dois estágios, medido ao longo do mastro. */
  elevacao: number;
  /** Radianos em torno de X local. */
  anguloIntake: number;
  anguloPunho: number;
  /** Distância livre entre os dois cilindros de preensão, em metros. */
  aberturaGarra: number;
  faseRoletes: number;
}
export interface OpcoesFRC extends Partial<PoseFRC> {
  configuracao?: ConfiguracaoFRC;
  larguraChassi?: number;
  profundidadeChassi?: number;
  alturaMastro?: number;
  inclinacaoMastro?: number;
  /** Identificação fictícia por padrão. De 1 a 4 algarismos, não um time real. */
  numero?: string;
}
export interface ParametrosFRC extends PoseFRC {
  configuracao: ConfiguracaoFRC;
  larguraChassi: number;
  profundidadeChassi: number;
  alturaMastro: number;
  inclinacaoMastro: number;
  numero: string;
}
export interface MontagemFRC {
  cena: Cena;
  parametros: ParametrosFRC;
  direcoes: [NoRef, NoRef, NoRef, NoRef];
  rodas: [NoRef, NoRef, NoRef, NoRef];
  estagio1: NoRef;
  estagio2: NoRef;
  intake: NoRef;
  punho: NoRef;
  garras: [NoRef, NoRef];
  roletesGarra: [NoRef, NoRef];
  cilindrosGarra: [NoRef, NoRef];
  roletesIntake: [NoRef, NoRef];
  elosEsteira: NoRef[];
  polias: NoRef[];
  tcp: NoRef;
  marcoBase: NoRef;
  marcoElevador: NoRef;
}
const PI = Math.PI, TAU = PI * 2, RAD = PI / 180, Z: V3 = [0, 0, 0];
export const MEDIDAS_FRC = {
  raioRoda: 0.0508,
  larguraRoda: 0.038,
  alturaCentroChassi: 0.170,
  alturaTuboChassi: 0.0508,
  espessuraTubo: 0.0022,
  comprimentoIntake: 0.480,
  comprimentoFerramenta: 0.260,
  raioRoleteGarra: 0.028,
  comprimentoEsteira: 0.920,
  raioCurvaEsteira: 0.0375,
  quantidadeElos: 44,
} as const;
export const CONFIGURACOES_FRC: Record<ConfiguracaoFRC, { titulo: string; pose: PoseFRC }> = {
  transporte: { titulo: "Transporte", pose: { direcoes: [0, 0, 0, 0], faseRodas: 0, elevacao: 0.020, anguloIntake: 100 * RAD, anguloPunho: 70 * RAD, aberturaGarra: 0.10, faseRoletes: 0 } },
  coleta: { titulo: "Coleta", pose: { direcoes: [0, 0, 0, 0], faseRodas: 0.4, elevacao: 0, anguloIntake: -40 * RAD, anguloPunho: -30 * RAD, aberturaGarra: 0.20, faseRoletes: 0.7 } },
  "alcance-alto": { titulo: "Alcance alto", pose: { direcoes: [PI / 4, -PI / 4, -PI / 4, PI / 4], faseRodas: 0.8, elevacao: 0.950, anguloIntake: 100 * RAD, anguloPunho: 15 * RAD, aberturaGarra: 0.080, faseRoletes: 0 } },
  manutencao: { titulo: "No pit", pose: { direcoes: [35 * RAD, -35 * RAD, -35 * RAD, 35 * RAD], faseRodas: 1.2, elevacao: 0.400, anguloIntake: 20 * RAD, anguloPunho: 15 * RAD, aberturaGarra: 0.220, faseRoletes: 0.3 } },
};
export const CONFIG_FRC: Readonly<OpcoesFRC> = { configuracao: "transporte" };
const M = {
  metal: { cor: "#bcc7cd", metalico: .86, rugosidade: .28 },
  polido: { cor: "#dae2e5", metalico: .90, rugosidade: .21 },
  aco: { cor: "#697981", metalico: .81, rugosidade: .33 },
  preto: { cor: "#18242d", metalico: .35, rugosidade: .42 },
  carbono: { cor: "#243239", metalico: .10, rugosidade: .67 },
  borracha: { cor: "#192228", metalico: .01, rugosidade: .93 },
  azul: { cor: "#083ab8", metalico: .03, rugosidade: .88 },
  azulMetal: { cor: "#1656bb", metalico: .56, rugosidade: .34 },
  amarelo: { cor: "#e2ed44", metalico: .17, rugosidade: .39 },
  roxo: { cor: "#8054ce", metalico: .02, rugosidade: .75 },
  branco: { cor: "#f0f3ed", metalico: .02, rugosidade: .67 },
  vermelho: { cor: "#e34439", metalico: .04, rugosidade: .58 },
  cabo: { cor: "#283034", metalico: .02, rugosidade: .78 },
  fioAmarelo: { cor: "#edbc32", metalico: .03, rugosidade: .58 },
  verde: { cor: "#307c66", metalico: .12, rugosidade: .55 },
  sinal: { cor: "#7cf1ac", metalico: .02, rugosidade: .32 },
  transparente: { cor: "#9bd4d9", metalico: .05, rugosidade: .22, opacidade: .27 },
} satisfies Record<string, Material>;
function grupo(p: Pai, nome: string, pos: V3 = Z, rot: V3 = Z, id?: string): NoRef {
  return p.criar("grupo", {}, { nome, id, transform: { posicao: [...pos], rotacao: [...rot] } });
}
function caixa(p: Pai, nome: string, d: V3, mat: Material, pos: V3 = Z, rot: V3 = Z): NoRef {
  return p.criar("box", { largura: d[0], altura: d[1], profundidade: d[2] }, { nome, material: mat, transform: { posicao: [...pos], rotacao: [...rot] } });
}
function cilindro(p: Pai, nome: string, r: number, h: number, mat: Material, pos: V3 = Z, rot: V3 = Z, n = 32): NoRef {
  return p.criar("cylinder", { raioTopo: r, raioBase: r, altura: h, segmentos: n }, { nome, material: mat, transform: { posicao: [...pos], rotacao: [...rot] } });
}
function extrusao(p: Pai, nome: string, perfil: P2[], h: number, mat: Material, pos: V3 = Z, rot: V3 = Z): NoRef {
  return p.criar("extrude", { perfil, altura: h }, { nome, material: mat, transform: { posicao: [...pos], rotacao: [...rot] } });
}
function anel(p: Pai, nome: string, ri: number, re: number, h: number, mat: Material, pos: V3 = Z, rot: V3 = Z, n = 36): NoRef {
  return p.criar("lathe", { perfil: [[ri, -h / 2], [re, -h / 2], [re, h / 2], [ri, h / 2], [ri, -h / 2]], segmentos: n }, { nome, material: mat, transform: { posicao: [...pos], rotacao: [...rot] } });
}
function arredondado(w: number, d: number, r: number): P2[] {
  const out: P2[] = [];
  for (let c = 0; c < 4; c++) {
    const x = (c === 0 || c === 3 ? 1 : -1) * (w / 2 - r), z = (c < 2 ? 1 : -1) * (d / 2 - r);
    for (let i = 0; i <= 4; i++) { const a = c * PI / 2 + i * PI / 8; out.push([x + r * Math.cos(a), z + r * Math.sin(a)]); }
  }
  return out;
}
/** Tubo realmente vazado: furo no mesmo eixo da extrusão, antes dos acessórios. */
function tubo(p: Pai, nome: string, w: number, d: number, l: number, mat: Material, pos: V3, rot: V3 = Z): NoRef {
  const t = MEDIDAS_FRC.espessuraTubo;
  return extrusao(p, nome, arredondado(w, d, Math.min(.003, w / 5, d / 5)), l, mat, pos, rot)
    .furar({ face: "topo", forma: { tipo: "retangulo", largura: w - 2 * t, altura: d - 2 * t }, u: 0, v: 0 });
}
function orientarY(a: V3, b: V3): V3 {
  const x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
  return [Math.atan2(z, y), 0, -Math.atan2(x, Math.hypot(y, z))];
}
function barra(p: Pai, nome: string, a: V3, b: V3, r: number, mat: Material, n = 16): NoRef {
  return cilindro(p, nome, r, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), mat,
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], orientarY(a, b), n);
}
function fio(p: Pai, nome: string, a: V3, b: V3, c: V3, d: V3, r: number, mat: Material): void {
  const pontos = Array.from({ length: 13 }, (_, i): V3 => {
    const t = i / 12, q = 1 - t;
    return [0, 1, 2].map(k => q * q * q * a[k]! + 3 * q * q * t * b[k]! + 3 * q * t * t * c[k]! + t * t * t * d[k]!) as V3;
  });
  for (let i = 1; i < pontos.length; i++) barra(p, `${nome} · trecho ${i}`, pontos[i - 1]!, pontos[i]!, r, mat, 10);
}
function textoNumero(p: Pai, numero: string, h = .090): NoRef {
  const g = grupo(p, `identificação fictícia ${numero}`), w = h * .55, t = h * .11;
  const codes = ["abcdef", "bc", "abged", "abgcd", "fgbc", "afgcd", "afgecd", "abc", "abcdefg", "abfgcd"];
  const seg = [[0, .5, 1, 0], [.5, .25, 0, .5], [.5, -.25, 0, .5], [0, -.5, 1, 0], [-.5, -.25, 0, .5], [-.5, .25, 0, .5], [0, 0, 1, 0]];
  [...numero].forEach((c, j) => {
    const ox = (j - (numero.length - 1) / 2) * w * 1.42;
    for (const key of codes[Number(c)]!) { const [x, z, sx, sz] = seg[key.charCodeAt(0) - 97]!; caixa(g, `algarismo ${c}`, [sx ? w : t, .001, sz ? h * .42 : t], M.branco, [ox + x! * w, 0, z! * h]); }
  });
  return g;
}
export function resolverParametrosFRC(o: OpcoesFRC = {}): ParametrosFRC {
  const configuracao = o.configuracao ?? "transporte", preset = CONFIGURACOES_FRC[configuracao];
  if (!preset) throw new RangeError("Configuração FRC desconhecida.");
  const p: ParametrosFRC = { ...preset.pose, ...o, configuracao, direcoes: [...(o.direcoes ?? preset.pose.direcoes)], larguraChassi: o.larguraChassi ?? .7112,
    profundidadeChassi: o.profundidadeChassi ?? .762, alturaMastro: o.alturaMastro ?? .85, inclinacaoMastro: o.inclinacaoMastro ?? -10 * RAD, numero: o.numero ?? "0000" };
  for (const [v, min, max, nome] of [[p.larguraChassi, .66, .90, "largura"], [p.profundidadeChassi, .70, .95, "profundidade"], [p.alturaMastro, .75, 1.10, "mastro"], [p.inclinacaoMastro, -18 * RAD, 0, "inclinação"]] as [number, number, number, string][]) {
    if (!Number.isFinite(v) || v < min || v > max) throw new RangeError(`Fora do intervalo de ${nome}.`);
  }
  if (!/^\d{1,4}$/.test(p.numero)) throw new RangeError("Identificação: de 1 a 4 algarismos.");
  validarPose(p, p.alturaMastro);
  return p;
}
function validarPose(p: PoseFRC, h: number): void {
  if (!Array.isArray(p.direcoes) || p.direcoes.length !== 4 || !p.direcoes.every(Number.isFinite)) throw new RangeError("São necessárias quatro direções finitas, em radianos.");
  for (const k of ["faseRodas", "faseRoletes", "elevacao", "anguloIntake", "anguloPunho", "aberturaGarra"] as const) if (!Number.isFinite(p[k])) throw new RangeError(`Valor não finito em ${k}.`);
  if (p.elevacao < 0 || p.elevacao > 2 * (h - .35) + 1e-9) throw new RangeError("Curso do elevador fora do intervalo.");
  if (p.anguloIntake < -40 * RAD - 1e-9 || p.anguloIntake > 108 * RAD) throw new RangeError("Intake: de −40° a 108°.");
  if (p.anguloPunho < -50 * RAD || p.anguloPunho > 105 * RAD) throw new RangeError("Punho: de −50° a 105°.");
  if (p.aberturaGarra < .040 || p.aberturaGarra > .220) throw new RangeError("Abertura: de 40 a 220 mm.");
}
export function montarCena(): Cena { return construirFRC(CONFIG_FRC).cena; }
export function montarFRC(o: OpcoesFRC = {}): Cena { return construirFRC(o).cena; }
export function construirFRC(o: OpcoesFRC = {}): MontagemFRC {
  const p = resolverParametrosFRC(o), D = MEDIDAS_FRC, cena = new Cena();
  const raiz = grupo(cena, "RIFT / 0000 · conceito FRC", Z, Z, "rift-frc").permitirFlutuacao(
    "vitrine de produto: placas, suportes e acessórios vão parafusados nas " +
      "faces do chassi — contato lateral não conta como apoio",
  );
  const W = p.larguraChassi, L = p.profundidadeChassi, Y = D.alturaCentroChassi, topo = Y + D.alturaTuboChassi / 2;
  // `assentar`/`interfacePivo` são a única fonte de relações espaciais
  // desta montagem: cada peça "apoiada" ou "articulada" declara um
  // acoplamento na cena (`cena.acoplar`), verificável a qualquer momento e
  // em qualquer pose via `cena.conferirMontagem()` — ver o fim do arquivo.
  function assentar(s: NoRef, f: FaceNome, n: NoRef, u = 0, v = 0): NoRef {
    s.face(f).colocar(n, { u, v });
    cena.acoplar({ tipo: "contato", nome: "apoio", a: { no: s, face: f }, b: { no: n, face: "base" } });
    return n;
  }
  function fixacao(s: NoRef, f: FaceNome, u = 0, v = 0, tamanho = .006): void {
    const a = assentar(s, f, anel(s, "arruela", tamanho * .32, tamanho * .86, .0013, M.aco, Z, Z, 18), u, v);
    const h = assentar(a, "topo", cilindro(a, "parafuso sextavado", tamanho * .65, tamanho * .50, M.polido, Z, Z, 6));
    assentar(h, "topo", cilindro(h, "rebaixo da chave", tamanho * .25, .0003, M.preto, Z, Z, 6));
  }
  function motor(s: NoRef, face: FaceNome, u = 0, v = 0, mini = false): NoRef {
    const r = mini ? .021 : .025, h = mini ? .045 : .062;
    const flange = assentar(s, face, cilindro(s, "motor BLDC · flange", r + .004, .006, M.aco), u, v);
    const corpo = assentar(flange, "topo", cilindro(flange, "motor BLDC · carcaça", r, h, M.preto));
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; caixa(corpo, "aleta de refrigeração", [.003, h * .70, .006], M.aco, [(r + .001) * Math.sin(a), 0, (r + .001) * Math.cos(a)], [0, a, 0]); }
    const cap = assentar(corpo, "topo", cilindro(corpo, "motor · tampa encoder", r * .91, .005, M.preto));
    const etiqueta = assentar(cap, "topo", caixa(cap, "selo BLDC", [r * 1.15, .0008, r * .46], M.amarelo));
    for (const x of [-1, 1]) assentar(cap, "topo", caixa(cap, x < 0 ? "CAN" : "alimentação", [.010, .011, .013], x < 0 ? M.cabo : M.vermelho), x * .010, .006);
    fixacao(flange, "topo", r * .8, 0, .004);
    return etiqueta;
  }
  function interfacePivo(nome: string, fixo: NoRef, movel: NoRef, faceFixo: FaceNome = "base", faceMovel: FaceNome = "topo"): void {
    cena.acoplar({ tipo: "pivo", nome, a: { no: fixo, face: faceFixo }, b: { no: movel, face: faceMovel } });
  }
  // ── CHASSI: tubos vazados, travessas e chapas aparafusadas ────────────
  const chassi = grupo(raiz, "01 · chassi e travessas", Z, Z, "sistema-chassi");
  for (const s of [-1, 1]) {
    tubo(chassi, "longarina 1 × 2 pol", .0254, .0508, L, M.metal, [s * (W - .0254) / 2, Y, 0], [PI / 2, 0, 0]);
    tubo(chassi, "travessa de extremidade", .0508, .0254, W - .0508, M.metal, [0, Y, s * (L - .0254) / 2], [0, 0, PI / 2]);
    tubo(chassi, "travessa interna", .0254, .0254, W - .0508, M.aco, [0, topo - .0127, s * L * .18], [0, 0, PI / 2]);
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const pl = extrusao(chassi, "gusset de canto", [[-.053, -.053], [.053, -.053], [.053, -.022], [-.022, -.022], [-.022, .053], [-.053, .053]], .003, M.azulMetal,
      [x * (W / 2 - .041), topo + .0015, z * (L / 2 - .041)], [0, (x === z ? 0 : PI / 2) + (x > 0 ? PI : 0), 0]);
    fixacao(pl, "topo", -.037, -.032); fixacao(pl, "topo", .027, -.038); fixacao(pl, "topo", -.038, .027);
  }
  const deck = caixa(chassi, "painel estrutural usinado", [W - .14, .006, L - .15], M.carbono, [0, topo + .003, 0]);
  for (const x of [-1, 1]) for (let i = 0; i < 6; i++) deck.furar({ face: "topo", forma: { tipo: "retangulo", largura: .030, altura: .014 }, u: x * (W / 2 - .094), v: (i - 2.5) * .085 });
  for (const x of [-1, 1]) for (const z of [-1, 1]) fixacao(deck, "topo", x * (W / 2 - .12), z * (L / 2 - .12));

  // ── QUATRO SWERVES: cada direção é pai de sua roda ───────────────────
  const driv = grupo(raiz, "02 · drivetrain swerve", Z, Z, "sistema-swerve");
  const dirs: NoRef[] = [], rodas: NoRef[] = [];
  const corners: [number, number, string][] = [[-1, -1, "DE"], [1, -1, "DD"], [-1, 1, "TE"], [1, 1, "TD"]];
  corners.forEach(([sx, sz, nome], i) => {
    const m = grupo(driv, `módulo ${nome}`, [sx * (W / 2 - .075), D.raioRoda, sz * (L / 2 - .079)], Z, `modulo-${i}`);
    const base = extrusao(m, "swerve · placa fixa", arredondado(.126, .131, .014), .008, M.aco, [0, .106, 0]);
    for (const x of [-1, 1]) for (const z of [-1, 1]) fixacao(base, "topo", x * .046, z * .048, .005);
    motor(base, "topo", -.030, -.019); motor(base, "topo", .033, .027, true);
    const estator = anel(m, "rolamento de direção · anel fixo", .024, .046, .012, M.polido, [0, .096, 0]);
    const turn = grupo(m, `direção ${nome}`, Z, Z, `mov-direcao-${i}`); dirs.push(turn);
    const rotor = anel(turn, "rolamento de direção · anel móvel", .024, .044, .012, M.azulMetal, [0, .084, 0]);
    interfacePivo(`Swerve ${nome} · direção`, estator, rotor);
    for (const s of [-1, 1]) {
      const cheek = extrusao(turn, "forquilha usinada", [[-.042, -.045], [.042, -.045], [.044, .026], [.022, .050], [-.034, .050]], .005, M.metal, [s * .039, .034, 0], [0, 0, PI / 2]);
      cheek.furar({ face: "topo", forma: { tipo: "circulo", raio: .013, segmentos: 24 }, u: .012, v: 0 });
      fixacao(cheek, s < 0 ? "topo" : "base", -.028, .025, .004);
    }
    cilindro(turn, "eixo de tração", .006, .098, M.aco, Z, [0, 0, -PI / 2]);
    const roda = grupo(turn, `roda 4 pol · ${nome}`, Z, Z, `mov-roda-${i}`); rodas.push(roda);
    anel(roda, "banda de rodagem", .030, D.raioRoda, D.larguraRoda, M.borracha, Z, [0, 0, -PI / 2], 48);
    for (const x of [-.014, 0, .014]) anel(roda, "sulco lateral da banda", .0478, .0510, .0012, M.preto, [x, 0, 0], [0, 0, -PI / 2], 48);
    cilindro(roda, "cubo de alumínio", .027, .043, M.metal, Z, [0, 0, -PI / 2]);
    for (let j = 0; j < 6; j++) {
      const a = j * TAU / 6;
      for (const s of [-1, 1]) cilindro(roda, "janela do cubo", .005, .001, M.preto, [s * .022, .018 * Math.sin(a), .018 * Math.cos(a)], [0, 0, -PI / 2], 14);
      caixa(roda, "faixa de inspeção da roda", [.021, .0012, .006], M.aco, [0, .0509 * Math.cos(a), .0509 * Math.sin(a)], [a, 0, 0]);
    }
    const race = anel(turn, "mancal de eixo · fixo", .006, .013, .006, M.aco, [.035, 0, 0], [0, 0, -PI / 2]);
    const hub = cilindro(roda, "cubo · interface móvel", .010, .012, M.polido, [.026, 0, 0], [0, 0, -PI / 2]);
    interfacePivo(`Swerve ${nome} · roda`, race, hub);
    anel(turn, "coroa de direção", .027, .045, .007, M.preto, [0, .075, 0]);
    for (let j = 0; j < 20; j++) { const a = j * TAU / 20; caixa(turn, "dente da coroa", [.005, .007, .006], M.aco, [.045 * Math.sin(a), .075, .045 * Math.cos(a)], [0, a, 0]); }
  });

  // ── BUMPERS: camada independente da estrutura ───────────────────────
  const bumpers = grupo(raiz, "03 · bumpers azuis / 0000", Z, Z, "sistema-bumpers");
  for (const s of [-1, 1]) {
    const front = extrusao(bumpers, s < 0 ? "bumper dianteiro" : "bumper traseiro", arredondado(W + .120, .073, .014), .145, M.azul, [0, .163, s * (L / 2 + .033)]);
    front.face(s < 0 ? "norte" : "sul").colocar(textoNumero(front, p.numero), { gap: .0008 });
    const side = extrusao(bumpers, "bumper lateral", arredondado(.073, L - .020, .012), .145, M.azul, [s * (W / 2 + .033), .163, 0]);
    side.face(s < 0 ? "oeste" : "leste").colocar(textoNumero(side, p.numero), { gap: .0008 });
    for (const y of [.163 - .060, .163 + .060]) {
      caixa(bumpers, "costura horizontal", [W + .080, .0017, .0014], M.branco, [0, y, s * (L / 2 + .070)]);
      caixa(bumpers, "costura lateral", [.0014, .0017, L - .058], M.branco, [s * (W / 2 + .070), y, 0]);
    }
    for (const x of [-1, 1]) {
      const hook = caixa(chassi, "presilha removível do bumper", [.031, .067, .004], M.aco, [x * W * .29, Y + .020, s * (L / 2 - .012)]);
      fixacao(hook, s < 0 ? "norte" : "sul", 0, 0, .006);
      caixa(bumpers, "aba de tecido", [.035, .048, .003], M.azulMetal, [x * W * .35, .163, s * (L / 2 + .071)]);
    }
  }

  // ── ELETRÔNICA: bateria, distribuição, controlador, rádio, chicotes ──
  const elec = grupo(raiz, "04 · energia e controle", Z, Z, "sistema-eletrica");
  for (const x of [-1, 1]) for (const z of [-1, 1]) cilindro(elec, "apoio elastomérico da bateria", .007, .003, M.borracha, [.16 + x * .040, topo + .0075, L * .285 + z * .080]);
  const tray = caixa(elec, "bandeja da bateria", [.105, .006, .205], M.aco, [.16, topo + .012, L * .285]);
  const bat = assentar(tray, "topo", caixa(tray, "bateria 12 V · volume ilustrativo", [.078, .163, .181], M.preto));
  const lid = assentar(bat, "topo", caixa(bat, "bateria · tampa", [.080, .010, .183], M.preto));
  for (const s of [-1, 1]) {
    assentar(lid, "topo", caixa(lid, s > 0 ? "terminal positivo" : "terminal negativo", [.018, .019, .022], s > 0 ? M.vermelho : M.preto), s * .027, -.052);
    caixa(bat, "cinta da bateria", [.084, .012, .017], M.azulMetal, [0, .085, s * .061]);
    caixa(bat, "cinta vertical", [.003, .17, .017], M.azulMetal, [s * .043, 0, .061]);
  }
  const label = caixa(bat, "etiqueta de bateria", [.060, .071, .001], M.branco);
  bat.face("norte").colocar(label, { orientar: false });
  for (let i = 0; i < 7; i++) caixa(label, "código da bateria", [.033 + (i % 2) * .01, .002, .0005], M.preto, [0, (i - 3) * .007, -.0008]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) cilindro(elec, "espaçador da eletrônica", .0045, .004, M.aco, [-.140 + x * .106, topo + .008, -.029 + z * .150]);
  const plate = caixa(elec, "placa isolante dos controladores", [.237, .006, .33], M.preto, [-.140, topo + .013, -.029]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) fixacao(plate, "topo", x * .106, z * .15, .004);
  const control = assentar(plate, "topo", caixa(plate, "controlador de robô · genérico", [.112, .040, .105], M.preto), -.024, -.082);
  const panel = assentar(control, "topo", caixa(control, "controlador · face de conexões", [.108, .003, .101], M.metal));
  const pcb = assentar(panel, "topo", caixa(panel, "placa de circuito", [.050, .002, .058], M.verde), -.015, .003);
  assentar(pcb, "topo", caixa(pcb, "processador", [.018, .003, .021], M.preto));
  for (let i = 0; i < 6; i++) {
    assentar(panel, "topo", caixa(panel, "borne de sinal", [.011, .014, .013], i % 3 === 0 ? M.azulMetal : M.preto), .039, -.035 + i * .014);
    assentar(panel, "topo", caixa(panel, "LED de estado", [.003, .002, .003], M.sinal), -.045, -.035 + i * .012);
  }
  assentar(panel, "topo", caixa(panel, "Ethernet", [.016, .016, .022], M.fioAmarelo), -.018, -.040);
  const pdp = assentar(plate, "topo", caixa(plate, "distribuição de potência · genérica", [.103, .027, .096], M.preto), -.023, .040);
  const ptop = assentar(pdp, "topo", caixa(pdp, "tampa de distribuição", [.098, .002, .091], M.verde));
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) {
    const f = assentar(ptop, "topo", caixa(ptop, "disjuntor de ramo", [.019, .012, .008], M.preto), s * .035, (i - 3.5) * .010);
    assentar(f, "topo", caixa(f, "marcação de ramo", [.014, .001, .004], M.amarelo));
  }
  const radio = caixa(elec, "rádio de comunicação · genérico", [.066, .025, .068], M.preto, [.098, topo + .0185, -.140]);
  for (let i = 0; i < 5; i++) caixa(radio, "ranhura do rádio", [.045, .0015, .002], M.aco, [0, .013, (i - 2) * .009]);
  const breaker = caixa(elec, "disjuntor principal ilustrativo", [.045, .031, .065], M.preto, [.040, topo + .0215, L * .26]);
  assentar(breaker, "topo", caixa(breaker, "botão de desconexão", [.025, .015, .026], M.vermelho));
  // Rotas estáticas no referencial do chassi, derivadas dos pontos de conexão.
  const yWire = topo + .043;
  corners.forEach(([sx, sz], i) => {
    const end: V3 = [sx * (W / 2 - .080), D.raioRoda + .190, sz * (L / 2 - .079)];
    fio(elec, `alimentação swerve ${i + 1}`, [-.110, yWire, -.020 + i * .018], [sx * .20, yWire + .03, sz * .10], [end[0], end[1] + .045, end[2] * .82], end, .0022, M.vermelho);
    fio(elec, `retorno swerve ${i + 1}`, [-.12, yWire, -.018 + i * .018], [sx * .18, yWire + .025, sz * .12], [end[0] + .008, end[1] + .04, end[2] * .82], [end[0] + .010, end[1], end[2]], .0022, M.cabo);
  });
  fio(elec, "cabo principal positivo", [.187, topo + .195, L * .285 - .052], [.24, topo + .24, .10], [.07, topo + .16, L * .26], [.04, topo + .06, L * .26], .004, M.vermelho);
  fio(elec, "cabo principal negativo", [.133, topo + .195, L * .285 - .052], [.07, topo + .25, .08], [-.08, topo + .12, .09], [-.16, yWire, .040], .004, M.cabo);
  fio(elec, "cabo Ethernet", [-.180, yWire + .04, -.155], [-.13, topo + .16, -.22], [.10, topo + .13, -.23], [.10, yWire, -.15], .0028, M.fioAmarelo);
  for (let i = 0; i < 7; i++) caixa(elec, "abraçadeira do chicote", [.014, .004, .006], M.branco, [-.248, yWire - .018, (i - 3) * .074]);

  // ── MASTRO INCLINADO E CASCATA DE DOIS ESTÁGIOS ─────────────────────
  const mast = grupo(raiz, "05 · elevador em cascata", [0, topo + .020, L * .12], [p.inclinacaoMastro, 0, 0], "sistema-elevador");
  const H = p.alturaMastro, h1 = H - .07;
  for (const s of [-1, 1]) {
    tubo(mast, "mastro fixo", .031, .034, H, M.metal, [s * .173, H / 2, 0]);
    caixa(mast, "pista de rolamento", [.010, H - .06, .002], M.aco, [s * .173, H / 2, -.018]);
    const foot = caixa(mast, "sapata do mastro", [.080, .010, .13], M.azulMetal, [s * .173, .004, .02]);
    for (const x of [-1, 1]) fixacao(foot, "topo", x * .027, .040);
    const a: V3 = [s * .225, .01, .190], b: V3 = [s * .173, H * .60, .018];
    barra(mast, "escora traseira do elevador", a, b, .0127, M.metal, 20);
    const clamp = caixa(mast, "abraçadeira da escora", [.050, .040, .041], M.azulMetal, b); fixacao(clamp, "sul");
    for (let j = 0; j < 4; j++) {
      const br = caixa(mast, "mancal de guia fixo", [.045, .040, .007], M.preto, [s * .162, .12 + j * (H - .24) / 3, -.033]);
      assentar(br, "norte", cilindro(br, "rolamento de guia", .016, .011, M.aco));
    }
  }
  tubo(mast, "travessa superior do mastro", .031, .034, .315, M.metal, [0, H - .0155, 0], [0, 0, PI / 2]);
  const gearbox = caixa(mast, "redutor do elevador", [.112, .063, .040], M.azulMetal, [0, .055, .035]);
  motor(gearbox, "sul");
  const polias: NoRef[] = [];
  function transmissao(parent: NoRef, altura: number, x: number, z: number): void {
    for (const y of [.039, altura - .039]) {
      const pg = grupo(parent, "polia dentada do elevador", [x, y, z], Z, `mov-polia-${polias.length}`); polias.push(pg);
      anel(pg, "polia · denteado", .006, .019, .014, M.azulMetal, Z, [0, 0, -PI / 2]);
      for (const s of [-1, 1]) cilindro(pg, "flange da polia", .022, .002, M.aco, [s * .008, 0, 0], [0, 0, -PI / 2]);
      caixa(pg, "marca da polia", [.017, .006, .006], M.amarelo, [0, .015, 0]);
    }
    for (const s of [-1, 1]) caixa(parent, "correia de elevação", [.012, altura - .078, .0026], M.borracha, [x, altura / 2, z + s * .019]);
    for (let j = 0; j < Math.floor((altura - .10) / .025); j++) caixa(parent, "dente de correia", [.013, .002, .0032], M.aco, [x, .053 + j * .025, z - .020]);
  }
  transmissao(mast, H, -.126, .020);
  const e1 = grupo(mast, "primeiro estágio móvel", [0, .020, -.048], Z, "mov-elevador-1");
  for (const s of [-1, 1]) tubo(e1, "primeiro estágio · perfil", .0254, .0254, h1, M.metal, [s * .133, h1 / 2, 0]);
  for (const y of [.014, h1 - .014]) tubo(e1, "primeiro estágio · travessa", .0254, .0254, .2406, M.metal, [0, y, 0], [0, 0, PI / 2]);
  transmissao(e1, h1, .091, .010);
  const e2 = grupo(e1, "carro final / segundo estágio", [0, .065, -.049], Z, "mov-elevador-2");
  for (const s of [-1, 1]) {
    tubo(e2, "carro final · montante", .022, .026, .38, M.azulMetal, [s * .099, .19, 0]);
    for (const y of [.045, .330]) {
      const roller = cilindro(e2, "roldana de carro", .0155, .018, M.preto, [s * .122, y, .020], [PI / 2, 0, 0]);
      assentar(roller, "topo", cilindro(roller, "tampa de rolamento", .009, .002, M.polido));
    }
  }
  for (const y of [.010, .368]) tubo(e2, "carro final · travessa", .022, .026, .176, M.metal, [0, y, 0], [0, 0, PI / 2]);
  const shield = caixa(e2, "proteção de policarbonato", [.181, .240, .003], M.transparente, [0, .208, -.023]);
  for (const x of [-1, 1]) for (const y of [-1, 1]) fixacao(shield, "norte", x * .079, y * .107, .004);
  // Sinalização e sensor: dispositivos ilustrativos, sem marcas comerciais.
  const head = caixa(mast, "suporte de sinalização", [.062, .006, .056], M.preto, [0, H + .005, .004]);
  const light = assentar(head, "topo", cilindro(head, "sinal luminoso do robô", .019, .035, M.amarelo));
  assentar(light, "topo", cilindro(light, "tampa do sinal", .0195, .005, M.preto));
  const camera = caixa(mast, "câmera de visão", [.055, .027, .021], M.preto, [.076, H - .048, -.041]);
  assentar(camera, "norte", cilindro(camera, "lente da câmera", .009, .008, M.aco));
  for (const s of [-1, 1]) caixa(mast, "faixa de identificação", [.010, H * .65, .001], M.amarelo, [s * .173, H * .53, -.0187]);

  // ── ESTEIRA PORTA-CABOS: comprimento constante, 44 elos reutilizados ─
  const carrier = grupo(mast, "esteira porta-cabos", Z, Z, "sistema-esteira");
  const elos: NoRef[] = [];
  for (let i = 0; i < D.quantidadeElos; i++) {
    const elo = grupo(carrier, `elo ${i + 1}`, Z, Z, `mov-elo-${i}`); elos.push(elo);
    const passo = D.comprimentoEsteira / D.quantidadeElos;
    for (const s of [-1, 1]) caixa(elo, "flanco da esteira", [.004, passo * .86, .013], M.preto, [s * .012, 0, 0]);
    caixa(elo, "travessa do elo", [.020, .004, .011], i % 5 === 0 ? M.azulMetal : M.preto);
  }
  const anchor = caixa(mast, "ancoragem fixa da esteira", [.037, .020, .021], M.aco, [-.222, .095, .040]); fixacao(anchor, "oeste", 0, 0, .004);
  caixa(e1, "ancoragem móvel da esteira", [.035, .020, .022], M.aco, [-.222, .080, .013]);

  // ── PUNHO E GARRA DE ROLETES ────────────────────────────────────────
  const wristBase = grupo(e2, "mancal do punho", [0, .150, -.035]);
  caixa(wristBase, "ponte do punho", [.313, .046, .034], M.metal, [0, 0, .019]);
  for (const s of [-1, 1]) {
    const side = cilindro(wristBase, "mancal lateral do punho", .035, .007, M.azulMetal, [s * .158, 0, 0], [0, 0, -PI / 2]);
    if (s > 0) motor(side, "topo", 0, 0, true);
  }
  const wrist = grupo(wristBase, "punho basculante", Z, Z, "mov-punho");
  const wFixed = anel(wristBase, "punho · pista fixa", .009, .022, .010, M.aco, [.150, 0, 0], [0, 0, -PI / 2]);
  const wRotor = anel(wrist, "punho · pista móvel", .009, .023, .010, M.polido, [.140, 0, 0], [0, 0, -PI / 2]);
  interfacePivo("Punho", wFixed, wRotor);
  cilindro(wrist, "eixo do punho", .009, .310, M.aco, Z, [0, 0, -PI / 2]);
  caixa(wrist, "travessa da garra", [.275, .042, .045], M.azulMetal, [0, 0, -.024]);
  cilindro(wrist, "fuso ilustrativo de abertura", .004, .278, M.polido, [0, -.024, -.041], [0, 0, -PI / 2]);
  const fingers: NoRef[] = [], rollers: NoRef[] = [], gripCyl: NoRef[] = [];
  for (const [i, s] of [[0, -1], [1, 1]] as [number, number][]) {
    const jaw = grupo(wrist, s < 0 ? "garra esquerda" : "garra direita", Z, Z, `mov-garra-${i}`); fingers.push(jaw);
    const cheek = extrusao(jaw, "garra · placa vazada", [[-.040, -.125], [.040, -.125], [.050, .087], [.025, .125], [-.025, .125]], .006, M.metal, [s * .018, 0, -.095], [0, 0, PI / 2]);
    cheek.furar({ face: "topo", forma: { tipo: "retangulo", largura: .028, altura: .143 }, u: 0, v: -.030 });
    for (const z of [-.103, .101]) fixacao(cheek, s < 0 ? "topo" : "base", 0, z, .004);
    caixa(jaw, "patim da abertura", [.034, .039, .032], M.preto, [0, 0, -.024]);
    caixa(jaw, "guia UHMW", [.039, .014, .036], M.branco, [0, -.024, -.024]);
    const rotor = grupo(jaw, "rolete de preensão", [0, 0, -D.comprimentoFerramenta], Z, `mov-rolete-garra-${i}`); rollers.push(rotor);
    const rubber = cilindro(rotor, "rolete de preensão · elastômero", D.raioRoleteGarra, .067, M.roxo, Z, Z, 36); gripCyl.push(rubber);
    for (let j = 0; j < 8; j++) { const a = j * TAU / 8; caixa(rotor, "nervura do rolete", [.004, .052, .004], M.preto, [.0283 * Math.sin(a), 0, .0283 * Math.cos(a)], [0, a, 0]); }
    for (const y of [-.0355, .0355]) cilindro(rotor, "flange do rolete", .017, .004, M.amarelo, [0, y, 0]);
    const bearing = cilindro(jaw, "apoio superior do rolete", .016, .008, M.aco, [0, .0415, -D.comprimentoFerramenta]);
    const mobileFace = cilindro(rotor, "mancal móvel do rolete", .012, .008, M.polido, [0, .0335, 0]);
    interfacePivo(`Garra ${i + 1} · rolete`, bearing, mobileFace);
    motor(bearing, "topo", 0, 0, true);
    barra(jaw, "tirante inferior do rolete", [s * .018, -.033, -.215], [0, -.041, -D.comprimentoFerramenta], .006, M.aco);
  }
  const tcp = caixa(wrist, "TCP · centro de preensão", [.001, .001, .001], M.sinal, [0, 0, -D.comprimentoFerramenta]);

  // ── INTAKE: pivô alto que passa SOBRE o bumper ao descer ─────────────
  const intakeSys = grupo(raiz, "06 · intake articulado", [0, topo + .175, -L / 2 + .060], Z, "sistema-intake");
  for (const s of [-1, 1]) {
    const stanchion = extrusao(intakeSys, "suporte triangular do intake", [[-.095, -.049], [.095, -.049], [.095, .035], [-.070, .105]], .007, M.azulMetal, [s * .274, -.081, .019], [0, 0, PI / 2]);
    fixacao(stanchion, s < 0 ? "topo" : "base", -.060, -.025); fixacao(stanchion, s < 0 ? "topo" : "base", .060, -.025);
  }
  const intake = grupo(intakeSys, "braços basculantes do intake", Z, Z, "mov-intake");
  const inFixed = anel(intakeSys, "intake · mancal fixo", .008, .031, .010, M.polido, [.287, 0, 0], [0, 0, -PI / 2]);
  const inRotor = anel(intake, "intake · mancal móvel", .008, .030, .010, M.azulMetal, [.277, 0, 0], [0, 0, -PI / 2]);
  interfacePivo("Intake · basculamento", inFixed, inRotor);
  cilindro(intake, "eixo do intake", .008, .586, M.aco, Z, [0, 0, -PI / 2]);
  for (const s of [-1, 1]) {
    const side = extrusao(intake, "braço do intake · perfil vazado", [[-.032, -.258], [.032, -.258], [.045, .220], [.019, .258], [-.019, .258]], .007, M.metal, [s * .268, 0, -D.comprimentoIntake / 2], [0, 0, PI / 2]);
    side.furar({ face: "topo", forma: { tipo: "retangulo", largura: .021, altura: .35 }, u: 0, v: 0 });
    for (const z of [-.231, .231]) fixacao(side, s < 0 ? "topo" : "base", 0, z, .005);
    if (s > 0) motor(side, "base", 0, -D.comprimentoIntake / 2, true);
    caixa(intake, "proteção lateral UHMW", [.006, .036, .175], M.branco, [s * .273, -.015, -.375]);
  }
  tubo(intake, "travessa do intake", .020, .020, .529, M.metal, [0, .012, -.082], [0, 0, PI / 2]);
  const intakeRollers: NoRef[] = [];
  for (let k = 0; k < 2; k++) {
    const z = k === 0 ? -D.comprimentoIntake : -.215, radius = k === 0 ? .035 : .029;
    const roll = grupo(intake, k === 0 ? "rolete coletor" : "rolete de transferência", [0, 0, z], Z, `mov-rolete-intake-${k}`); intakeRollers.push(roll);
    cilindro(roll, "eixo hexagonal do intake", .0068, .56, M.aco, Z, [0, 0, -PI / 2], 6);
    for (let j = 0; j < 10; j++) {
      const x = (j - 4.5) * .048;
      anel(roll, "roda complacente", .011, radius, .024, M.roxo, [x, 0, 0], [0, 0, -PI / 2], 32);
      cilindro(roll, "cubo de roda complacente", .013, .026, M.amarelo, [x, 0, 0], [0, 0, -PI / 2], 18);
      for (let t = 0; t < 5; t++) { const a = t * TAU / 5 + (j % 2) * .27; caixa(roll, "corte radial ilustrativo", [.025, .003, radius * .45], M.preto, [x, radius * .67 * Math.sin(a), radius * .67 * Math.cos(a)], [-a, 0, 0]); }
    }
    const fix = cilindro(intake, "intake · rolamento fixo", .018, .010, M.aco, [.277, 0, z], [0, 0, -PI / 2]);
    const mob = cilindro(roll, "intake · cubo móvel", .013, .010, M.polido, [.267, 0, 0], [0, 0, -PI / 2]);
    interfacePivo(`Intake · rolete ${k + 1}`, fix, mob);
    anel(roll, "polia externa do intake", .006, .022, .009, M.azulMetal, [.293, 0, 0], [0, 0, -PI / 2]);
  }
  for (const y of [-.022, .022]) caixa(intake, "correia entre roletes", [.008, .0025, D.comprimentoIntake - .215], M.borracha, [.293, y, -(D.comprimentoIntake + .215) / 2]);
  // Guia de transferência fixa, separada dos braços móveis.
  const feeder = grupo(raiz, "07 · guia de transferência", [0, topo + .105, -.195], [32 * RAD, 0, 0], "sistema-transferencia");
  caixa(feeder, "rampa de policarbonato", [.215, .003, .244], M.transparente);
  for (const s of [-1, 1]) caixa(feeder, "guia lateral da rampa", [.007, .028, .240], M.branco, [s * .112, .012, 0]);
  for (const z of [-.105, .105]) {
    cilindro(feeder, "apoio de transferência", .009, .216, M.preto, [0, .014, z], [0, 0, -PI / 2]);
    for (const s of [-1, 1]) cilindro(feeder, "espaçador da rampa", .006, .046, M.metal, [s * .094, -.025, z]);
  }
  const marcoBase = caixa(mast, "referência do curso · fixa", [.001, .001, .001], M.preto, [0, .235, -.132]);
  const marcoElevador = caixa(wristBase, "referência do curso · móvel", [.001, .001, .001], M.preto);
  const montagem: MontagemFRC = { cena, parametros: p, direcoes: dirs as MontagemFRC["direcoes"], rodas: rodas as MontagemFRC["rodas"], estagio1: e1, estagio2: e2,
    intake, punho: wrist, garras: fingers as MontagemFRC["garras"], roletesGarra: rollers as MontagemFRC["roletesGarra"], cilindrosGarra: gripCyl as MontagemFRC["cilindrosGarra"],
    roletesIntake: intakeRollers as MontagemFRC["roletesIntake"], elosEsteira: elos, polias, tcp, marcoBase, marcoElevador };
  return atualizarPoseFRC(montagem, p);
}
/** Geometria da trajetória em U invertido; comprimento desenvolvido constante. */
export function pontoEsteiraFRC(s: number, elevacao: number): V3 {
  const D = MEDIDAS_FRC, R = D.raioCurvaEsteira, ya = .100, yb = .100 + elevacao / 2;
  const h = (D.comprimentoEsteira + ya + yb - PI * R) / 2;
  const l1 = h - ya, curva = PI * R, x = -.222, za = .040;
  if (s <= l1) return [x, ya + s, za];
  if (s < l1 + curva) { const a = (s - l1) / R; return [x, h + R * Math.sin(a), za - R + R * Math.cos(a)]; }
  return [x, h - (s - l1 - curva), za - 2 * R];
}
/** Atualização atômica da pose; apenas mover()/girar(), nunca criar(). */
export function atualizarPoseFRC(m: MontagemFRC, entrada: Partial<PoseFRC>): MontagemFRC {
  const anterior = m.parametros;
  const p: PoseFRC = {
    direcoes: [...(entrada.direcoes ?? anterior.direcoes)],
    faseRodas: entrada.faseRodas ?? anterior.faseRodas,
    faseRoletes: entrada.faseRoletes ?? anterior.faseRoletes,
    elevacao: entrada.elevacao ?? anterior.elevacao,
    anguloIntake: entrada.anguloIntake ?? anterior.anguloIntake,
    anguloPunho: entrada.anguloPunho ?? anterior.anguloPunho,
    aberturaGarra: entrada.aberturaGarra ?? anterior.aberturaGarra,
  };
  validarPose(p, m.parametros.alturaMastro);
  m.direcoes.forEach((n, i) => n.girar([0, p.direcoes[i]!, 0]));
  m.rodas.forEach(n => n.girar([p.faseRodas, 0, 0]));
  m.estagio1.mover([0, .020 + p.elevacao / 2, -.048]);
  m.estagio2.mover([0, .065 + p.elevacao / 2, -.049]);
  m.intake.girar([p.anguloIntake, 0, 0]); m.punho.girar([p.anguloPunho, 0, 0]);
  m.garras.forEach((n, i) => n.mover([(i === 0 ? -1 : 1) * (p.aberturaGarra / 2 + MEDIDAS_FRC.raioRoleteGarra), 0, 0]));
  m.roletesGarra.forEach((n, i) => n.girar([0, (i === 0 ? 1 : -1) * p.faseRoletes, 0]));
  m.roletesIntake.forEach(n => n.girar([p.faseRoletes, 0, 0]));
  m.polias.forEach(n => n.girar([p.elevacao / (.019 * 2), 0, 0]));
  const passo = MEDIDAS_FRC.comprimentoEsteira / m.elosEsteira.length;
  m.elosEsteira.forEach((n, i) => {
    const s = (i + .5) * passo, a = pontoEsteiraFRC(s - .0001, p.elevacao), b = pontoEsteiraFRC(s + .0001, p.elevacao);
    n.mover(pontoEsteiraFRC(s, p.elevacao)).girar(orientarY(a, b));
  });
  Object.assign(m.parametros, p);
  return m;
}
/** Ponto médio entre as origens de "topo" e "base", no mundo — usado para
 * medidas ad-hoc que não são acoplamentos (abertura da garra, curso do
 * elevador, TCP): não há contato nem articulação entre essas duas faces do
 * MESMO nó, só a leitura de onde ele está. */
export function centro(n: NoRef): V3 {
  const a = n.face("topo").origemMundo(), b = n.face("base").origemMundo(); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}
