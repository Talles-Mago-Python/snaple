/**
 * MOTOR V8 — modelo paramétrico de apresentação para @snaple/core.
 * Unidade: metro. Y para cima. Virabrequim: Z. Frente: -Z.
 * V8 OHV a 90°, 16 válvulas, virabrequim cross-plane, aspiração natural.
 * Sem imports de renderizador, arquivos externos, I/O ou efeitos colaterais.
 *
 * Entrada padrão: montarCena().
 * Alternativas: montarMotorV8({ vista: "corte" | "explodido" }).
 * As vistas são reconstruções geométricas, não CSG nem transparência.
 * Modelo ilustrativo, não um projeto dimensionado para fabricação.
 */
import { Cena, type NoRef } from "@snaple/core";

type V3 = [number, number, number];
type P2 = [number, number];
type Pai = Cena | NoRef;
type FaceNome = "topo" | "base" | "norte" | "sul" | "leste" | "oeste";
type Mat = { cor: string; metalico: number; rugosidade: number; opacidade?: number };
export type VistaV8 = "montado" | "corte" | "explodido";
export interface OpcoesV8 {
  vista: VistaV8;
  /** Radianos: altera coerentemente moentes, pistões e bielas. */
  anguloVirabrequim: number;
}
export const CONFIG_V8: Readonly<OpcoesV8> = {
  vista: "montado",
  anguloVirabrequim: Math.PI * 23 / 180,
};
export const MEDIDAS_V8 = {
  diametroCilindro: 0.10325,
  curso: 0.092,
  entreEixosCilindros: 0.116,
  comprimentoBiela: 0.155,
  alturaCompressao: 0.031,
  deslocamentoBancadas: 0.022,
  anguloEntreBancadas: Math.PI / 2,
} as const;

const PI = Math.PI;
const TAU = PI * 2;
const ORIGEM: V3 = [0, 0, 0];
const M = {
  bloco:     { cor: "#a22b24", metalico: 0.56, rugosidade: 0.37 },
  corte:     { cor: "#ee865b", metalico: 0.60, rugosidade: 0.28 },
  aluminio:  { cor: "#bcc6cf", metalico: 0.86, rugosidade: 0.31 },
  usinado:   { cor: "#dbe1e4", metalico: 0.94, rugosidade: 0.20 },
  aco:       { cor: "#626f79", metalico: 0.92, rugosidade: 0.29 },
  ferro:     { cor: "#424b53", metalico: 0.78, rugosidade: 0.43 },
  tampa:     { cor: "#26363f", metalico: 0.75, rugosidade: 0.32 },
  preto:     { cor: "#131b22", metalico: 0.24, rugosidade: 0.45 },
  borracha:  { cor: "#182024", metalico: 0.02, rugosidade: 0.82 },
  junta:     { cor: "#444d48", metalico: 0.34, rugosidade: 0.67 },
  cobre:     { cor: "#bc763d", metalico: 0.89, rugosidade: 0.26 },
  latao:     { cor: "#c4a462", metalico: 0.87, rugosidade: 0.28 },
  escape:    { cor: "#b5a088", metalico: 0.90, rugosidade: 0.34 },
  solda:     { cor: "#777477", metalico: 0.88, rugosidade: 0.35 },
  ceramica:  { cor: "#eee7d5", metalico: 0.02, rugosidade: 0.26 },
  azul:      { cor: "#25506a", metalico: 0.08, rugosidade: 0.69 },
  filtro:    { cor: "#193d51", metalico: 0.60, rugosidade: 0.33 },
  amarelo:   { cor: "#edb84a", metalico: 0.15, rugosidade: 0.39 },
} satisfies Record<string, Mat>;

function grupo(p: Pai, nome: string, pos: V3 = ORIGEM, rot: V3 = ORIGEM): NoRef {
  return p.criar("grupo", {}, { nome, transform: { posicao: pos, rotacao: rot } });
}
function caixa(p: Pai, nome: string, d: V3, mat: Mat, pos: V3 = ORIGEM, rot: V3 = ORIGEM): NoRef {
  return p.criar("box", { largura: d[0], altura: d[1], profundidade: d[2] },
    { nome, material: mat, transform: { posicao: pos, rotacao: rot } });
}
function cilindro(p: Pai, nome: string, r: number, h: number, mat: Mat,
  pos: V3 = ORIGEM, rot: V3 = ORIGEM, segmentos = 48): NoRef {
  return p.criar("cylinder", { raioTopo: r, raioBase: r, altura: h, segmentos },
    { nome, material: mat, transform: { posicao: pos, rotacao: rot } });
}
function esfera(p: Pai, nome: string, r: number, mat: Mat, pos: V3, segmentos = 12): NoRef {
  return p.criar("sphere", { raio: r, segmentos }, { nome, material: mat, transform: { posicao: pos } });
}
function torno(p: Pai, nome: string, perfil: P2[], mat: Mat,
  pos: V3 = ORIGEM, rot: V3 = ORIGEM, segmentos = 64): NoRef {
  // A biblioteca centraliza a geometria. Reintroduzimos o centro do perfil
  // no frame da peça, preservando alturas funcionais como a coroa do pistão.
  const meio = (Math.min(...perfil.map(q => q[1])) + Math.max(...perfil.map(q => q[1]))) / 2;
  const [rx, ry, rz] = rot;
  const eixo: V3 = [-Math.cos(ry) * Math.sin(rz),
    Math.cos(rx) * Math.cos(rz) - Math.sin(rx) * Math.sin(ry) * Math.sin(rz),
    Math.sin(rx) * Math.cos(rz) + Math.cos(rx) * Math.sin(ry) * Math.sin(rz)];
  const centro: V3 = [pos[0] + eixo[0] * meio, pos[1] + eixo[1] * meio, pos[2] + eixo[2] * meio];
  return p.criar("lathe", { perfil: perfil.map(([r, y]): P2 => [r, y - meio]), segmentos },
    { nome, material: mat, transform: { posicao: centro, rotacao: rot } });
}
function anel(p: Pai, nome: string, ri: number, re: number, h: number,
  mat: Mat, pos: V3 = ORIGEM, rot: V3 = ORIGEM): NoRef {
  return torno(p, nome, [[ri, -h / 2], [re, -h / 2], [re, h / 2], [ri, h / 2], [ri, -h / 2]], mat, pos, rot);
}
function toro(p: Pai, nome: string, r: number, rt: number, mat: Mat,
  pos: V3 = ORIGEM, rot: V3 = ORIGEM): NoRef {
  return p.criar("torus", { raio: r, raioTubo: rt, segmentos: 56, segmentosTubo: 8 },
    { nome, material: mat, transform: { posicao: pos, rotacao: rot } });
}
function extrusao(p: Pai, nome: string, perfil: P2[], h: number, mat: Mat,
  pos: V3 = ORIGEM, recentrar = true, rot: V3 = ORIGEM): NoRef {
  return p.criar("extrude", { perfil, altura: h, recentrar },
    { nome, material: mat, transform: { posicao: pos, rotacao: rot } });
}
function retanguloArredondado(l: number, d: number, r: number, n = 6): P2[] {
  const pontos: P2[] = [];
  for (let canto = 0; canto < 4; canto++) {
    const a0 = canto * PI / 2;
    const cx = (canto === 0 || canto === 3 ? 1 : -1) * (l / 2 - r);
    const cz = (canto < 2 ? 1 : -1) * (d / 2 - r);
    for (let j = 0; j <= n; j++) {
      const a = a0 + j / n * PI / 2;
      pontos.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  }
  return pontos;
}
/** Polígono desenhado em XY e extrudado em Z; preserva a origem do desenho. */
function placaXY(p: Pai, nome: string, perfil: P2[], esp: number, mat: Mat,
  pos: V3 = ORIGEM, rz = 0): NoRef {
  const g = grupo(p, nome, pos, [0, 0, rz]);
  extrusao(g, nome + " · perfil", perfil.map(([x, y]): P2 => [x, -y]), esp, mat,
    [0, 0, -esp / 2], false, [PI / 2, 0, 0]);
  return g;
}
function mistura(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function distancia(a: V3, b: V3): number { return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
/** Euler XYZ que leva +Y ao vetor (b-a), inclusive em trechos oblíquos. */
function orientarY(a: V3, b: V3): V3 {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  return [Math.atan2(dz, dy), 0, -Math.atan2(dx, Math.hypot(dy, dz))];
}
function haste(p: Pai, nome: string, a: V3, b: V3, r: number, mat: Mat, segmentos = 16): NoRef {
  return cilindro(p, nome, r, distancia(a, b), mat, mistura(a, b, 0.5), orientarY(a, b), segmentos);
}
/** Catmull–Rom aberta. As extremidades coincidem exatamente com as conexões. */
function curva(controle: V3[], passos: number): V3[] {
  const resultado: V3[] = [];
  for (let k = 0; k <= passos; k++) {
    const u = k / passos * (controle.length - 1);
    const i = Math.min(Math.floor(u), controle.length - 2), t = u - i;
    const a = controle[Math.max(0, i - 1)], b = controle[i];
    const c = controle[i + 1], d = controle[Math.min(controle.length - 1, i + 2)];
    resultado.push([0, 1, 2].map(e => 0.5 * (
      2 * b[e] + (-a[e] + c[e]) * t +
      (2 * a[e] - 5 * b[e] + 4 * c[e] - d[e]) * t * t +
      (-a[e] + 3 * b[e] - 3 * c[e] + d[e]) * t * t * t
    )) as V3);
  }
  return resultado;
}
function tubo(p: Pai, nome: string, controle: V3[], r: number, mat: Mat, passos = 24): NoRef {
  const g = grupo(p, nome), pontos = curva(controle, passos);
  for (let i = 0; i < pontos.length - 1; i++) {
    haste(g, `trecho ${i + 1}`, pontos[i], pontos[i + 1], r, mat, 20);
    // As esferas são uniões deliberadas: evitam frestas nas curvas segmentadas.
    if (i > 0) esfera(g, `concordância ${i}`, r, mat, pontos[i]);
  }
  return g;
}
/** Grupo com base em y=0: todas as alturas vêm da arruela e da cabeça. */
function parafuso(p: Pai, nome: string, r = 0.0047): NoRef {
  const g = grupo(p, nome);
  const hArruela = r * 0.25;
  const arruela = anel(g, "arruela", r * 0.47, r * 1.28, hArruela, M.aco, [0, hArruela / 2, 0]);
  const cabeca = cilindro(g, "cabeça sextavada", r, r * 0.80, M.usinado, ORIGEM, ORIGEM, 6);
  arruela.face("topo").colocar(cabeca);
  const marca = cilindro(g, "estampo da cabeça", r * 0.36, r * 0.055, M.ferro, ORIGEM, ORIGEM, 6);
  cabeca.face("topo").colocar(marca);
  return g;
}
function fixar(dono: NoRef, face: FaceNome, u: number, v: number, nome: string, r = 0.0047): NoRef {
  const g = parafuso(dono, nome, r);
  dono.face(face).colocar(g, { u, v });
  return g;
}
function parafusoPlano(p: Pai, nome: string, pos: V3, rot: V3, r = 0.0047): NoRef {
  return parafuso(p, nome, r).mover(pos).girar(rot);
}
function pontosCirculo(n: number, r: number, angulo = 0): P2[] {
  return Array.from({ length: n }, (_, i): P2 => [r * Math.cos(angulo + i * TAU / n), r * Math.sin(angulo + i * TAU / n)]);
}
/** Seção anular aberta, em XZ, sem subtração de sólidos. */
function setorAnular(ri: number, re: number, inicio: number, fim: number, n = 40): P2[] {
  const a: P2[] = [], b: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = inicio + (fim - inicio) * i / n;
    a.push([re * Math.cos(t), re * Math.sin(t)]);
    b.unshift([ri * Math.cos(t), ri * Math.sin(t)]);
  }
  return [...a, ...b];
}
function emblemaV8(p: Pai, escala = 1): NoRef {
  const g = grupo(p, "emblema V8 em relevo");
  const tracos: [P2, P2][] = [
    [[-0.027, -0.013], [-0.018, 0.013]], [[-0.018, 0.013], [-0.009, -0.013]],
    [[0.001, -0.013], [0.019, -0.013]], [[0.001, 0], [0.019, 0]],
    [[0.001, 0.013], [0.019, 0.013]], [[0.001, -0.013], [0.001, 0.013]],
    [[0.019, -0.013], [0.019, 0.013]],
  ];
  tracos.forEach(([a, b], i) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    caixa(g, `traço ${i + 1}`, [0.0026 * escala, 0.0013, Math.hypot(dx, dz) * escala], M.usinado,
      [(a[0] + b[0]) * escala / 2, 0.00065, (a[1] + b[1]) * escala / 2], [0, Math.atan2(dx, dz), 0]);
  });
  return g;
}

interface Polia2D { x: number; y: number; r: number; lado: 1 | -1 }
/** Tangentes exatas entre polias; lado=-1 é contato pelo dorso da correia. */
function trajetoCorreia(rodas: Polia2D[], resolucao = 100): P2[] {
  const entrada: number[] = [], saida: number[] = [];
  rodas.forEach((a, i) => {
    const j = (i + 1) % rodas.length, b = rodas[j];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    const n = Math.atan2(dy, dx) + Math.acos((a.lado * a.r - b.lado * b.r) / d);
    saida[i] = n + (a.lado < 0 ? PI : 0);
    entrada[j] = n + (b.lado < 0 ? PI : 0);
  });
  const pontos: P2[] = [];
  rodas.forEach((r, i) => {
    let delta = saida[i] - entrada[i];
    if (r.lado > 0) { while (delta >= 0) delta -= TAU; }
    else { while (delta <= 0) delta += TAU; }
    const n = Math.max(3, Math.ceil(Math.abs(delta) / TAU * resolucao));
    for (let j = 0; j <= n; j++) {
      const a = entrada[i] + delta * j / n;
      pontos.push([r.x + r.r * Math.cos(a), r.y + r.r * Math.sin(a)]);
    }
  });
  return pontos;
}
function amostrarFechada(pontos: P2[], n: number): { p: P2; tangente: P2 }[] {
  const compr = pontos.map((a, i) => {
    const b = pontos[(i + 1) % pontos.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  const total = compr.reduce((a, b) => a + b, 0);
  return Array.from({ length: n }, (_, k) => {
    let d = k * total / n, i = 0;
    while (i < compr.length - 1 && d > compr[i]) d -= compr[i++];
    const a = pontos[i], b = pontos[(i + 1) % pontos.length], t = d / compr[i];
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as P2,
      tangente: [(b[0] - a[0]) / compr[i], (b[1] - a[1]) / compr[i]] as P2 };
  });
}

export function montarCena(): Cena { return montarMotorV8(CONFIG_V8); }

export function montarMotorV8(opcoes: Partial<OpcoesV8> = {}): Cena {
  const opt: OpcoesV8 = { ...CONFIG_V8, ...opcoes };
  const cena = new Cena();
  const motor = grupo(cena, "V8 6.2 · OHV · 90 graus · cross-plane");
  const corte = opt.vista === "corte", expl = opt.vista === "explodido" ? 1 : 0;
  const D = MEDIDAS_V8;
  const rCil = D.diametroCilindro / 2, rCamisa = rCil + 0.0028;
  const R = D.curso / 2, L = D.comprimentoBiela;
  const deck = R + L + D.alturaCompressao;
  const pe = 0.074, hBanco = deck - pe;
  const largBanco = 0.149, comprBanco = 0.476;
  const hCab = 0.064, largCab = 0.157, comprCab = 0.482;
  const juntaCab = 0.0013, yCab = deck + juntaCab;
  const yTopoCab = yCab + hCab;
  const yCam = 0.102;
  const zCil = Array.from({ length: 4 }, (_, i) => (i - 1.5) * D.entreEixosCilindros);
  const fase = [0, PI / 2, 3 * PI / 2, PI];
  const aBanco = D.anguloEntreBancadas / 2, sn = Math.sin(aBanco), cs = Math.cos(aBanco);
  function globalBanco(s: number, x: number, y: number, z: number): V3 {
    return [cs * x + s * sn * y, -s * sn * x + cs * y, z + s * D.deslocamentoBancadas / 2];
  }

  // ───────────────────── 01. FUNDIÇÃO E CAMISAS ─────────────────────
  const fundicao = grupo(motor, "01 · bloco e fundição");
  const bancos: { s: number; no: NoRef; estrutura: NoRef; cab: NoRef | null; tampa: NoRef | null }[] = [];
  for (const s of [-1, 1]) {
    const seccionado = corte && s === 1;
    const banco = grupo(fundicao, s < 0 ? "bancada esquerda · 1 3 5 7" : "bancada direita · 2 4 6 8",
      [0, 0, s * D.deslocamentoBancadas / 2], [0, 0, -s * aBanco]);
    let bloco: NoRef;
    if (seccionado) {
      // Metade interna do bloco, com quatro recessos semicirculares no CONTORNO.
      const perfil: P2[] = [[-largBanco / 2, -comprBanco / 2], [0, -comprBanco / 2]];
      zCil.forEach(z => {
        perfil.push([0, z - rCamisa]);
        for (let j = 0; j <= 32; j++) {
          const a = -PI / 2 + PI * j / 32;
          perfil.push([-rCamisa * Math.cos(a), z + rCamisa * Math.sin(a)]);
        }
      });
      perfil.push([0, comprBanco / 2], [-largBanco / 2, comprBanco / 2]);
      bloco = extrusao(banco, "bloco em seção longitudinal aberta", perfil, hBanco, M.bloco, [0, pe, 0], false);
      for (let j = 0; j <= 4; j++) {
        const z = j === 0 ? -comprBanco / 2 + 0.002 : j === 4 ? comprBanco / 2 - 0.002 : (zCil[j - 1] + zCil[j]) / 2;
        caixa(banco, "borda usinada do corte", [0.0008, hBanco, 0.004], M.corte, [0, pe + hBanco / 2, z]);
      }
    } else {
      bloco = caixa(banco, "bloco com quatro alojamentos passantes", [largBanco, hBanco, comprBanco], M.bloco, [0, pe + hBanco / 2, 0]);
      // Cortar ANTES de inserir camisas, pistões e componentes na região furada.
      zCil.forEach(z => bloco.furar({ face: "topo", forma: { tipo: "circulo", raio: rCamisa, segmentos: 64 }, u: 0, v: z }));
    }
    zCil.forEach((z, i) => {
      if (seccionado) {
        extrusao(banco, `camisa ${i + 1} · meia seção`, setorAnular(rCil, rCamisa, PI / 2, 3 * PI / 2), hBanco,
          M.aco, [0, pe, z], false);
      } else {
        anel(banco, `camisa de aço ${i + 1}`, rCil, rCamisa, hBanco, M.aco, [0, pe + hBanco / 2, z]);
      }
      // Anel de fogo aberto no lado seccionado; nunca fecha a janela do corte.
      extrusao(banco, `anel de fogo ${i + 1}`, setorAnular(rCil, rCamisa + 0.0014,
        seccionado ? PI / 2 : 0.002, seccionado ? 3 * PI / 2 : TAU - 0.002), 0.0011, M.usinado,
        [0, deck - 0.0011, z], false);
    });
    if (!seccionado) {
      const faceFora: FaceNome = s > 0 ? "leste" : "oeste";
      for (let i = 0; i < 3; i++) {
        const z = (zCil[i] + zCil[i + 1]) / 2;
        const selo = torno(banco, `selo de expansão ${i + 1}`, [[0, -0.002], [0.018, -0.002], [0.020, 0], [0.0185, 0.003], [0, 0.003]], M.aco);
        bloco.face(faceFora).colocar(selo, { u: s * z, v: -0.014 });
      }
      for (let i = 0; i <= 4; i++) {
        const nervura = caixa(banco, `nervura de fundição ${i + 1}`, [0.006, 0.005, hBanco - 0.029], M.bloco);
        bloco.face(faceFora).colocar(nervura, { u: s * (i - 2) * 0.106, v: 0 });
      }
    }

    // Cabeçotes e tampas ocos são furados antes do trem de válvulas.
    const cabGrupo = grupo(banco, "cabeçote e distribuição superior", [0, 0.065 * expl, 0]);
    let cab: NoRef | null = null, tampa: NoRef | null = null;
    if (!seccionado) {
      const junta = caixa(cabGrupo, "junta multicamada do cabeçote", [largCab + 0.001, juntaCab, comprCab], M.junta,
        [0, deck + juntaCab / 2, 0]);
      zCil.forEach(z => junta.furar({ face: "topo", forma: { tipo: "circulo", raio: rCil + 0.0009, segmentos: 48 }, u: 0, v: z }));
      cab = extrusao(cabGrupo, "cabeçote de alumínio · câmaras rebaixadas",
        retanguloArredondado(largCab, comprCab, 0.011), hCab, M.aluminio, [0, yCab + hCab / 2, 0]);
      zCil.forEach(z => cab!.furar({ face: "base", forma: { tipo: "circulo", raio: 0.046, segmentos: 48 }, u: 0, v: -z, profundidade: 0.0055 }));
      const tampaGrupo = grupo(cabGrupo, "tampa de válvulas removível", [0, 0.077 * expl, 0]);
      const baseTampa = caixa(tampaGrupo, "junta da tampa", [0.145, 0.002, 0.462], M.junta, [0, yTopoCab + 0.001, 0]);
      baseTampa.furar({ face: "topo", forma: { tipo: "retangulo", largura: 0.124, altura: 0.437 }, u: 0, v: 0 });
      tampa = extrusao(tampaGrupo, "tampa oca com cantos arredondados", retanguloArredondado(0.145, 0.458, 0.013), 0.060, M.tampa,
        [0, yTopoCab + 0.002 + 0.030, 0]);
      tampa.furar({ face: "base", forma: { tipo: "retangulo", largura: 0.123, altura: 0.431 }, u: 0, v: 0, profundidade: 0.054 });
      for (let j = 0; j < 5; j++) {
        const aleta = caixa(tampaGrupo, `aleta longitudinal ${j + 1}`, [0.0043, 0.003, 0.399], M.usinado);
        tampa.face("topo").colocar(aleta, { u: -s * (0.009 + j * 0.009), v: 0 });
      }
      for (const u of [-0.057, 0.057]) for (const v of [-0.19, 0, 0.19]) fixar(tampa, "topo", u, v, "parafuso cativo da tampa", 0.004);
      for (const u of [-0.063, 0.063]) for (let j = 0; j < 5; j++) fixar(cab, "topo", u, (j - 2) * 0.106, "parafuso de cabeçote", 0.0044);
      const placa = caixa(tampaGrupo, "plaqueta V8", [0.047, 0.0012, 0.041], M.preto);
      tampa.face("topo").colocar(placa, { u: -s * 0.028, v: -0.080, gap: 0.003 });
      placa.face("topo").colocar(emblemaV8(tampaGrupo, 0.70));
    } else {
      caixa(cabGrupo, "seção interna do cabeçote", [0.011, hCab, comprCab], M.aluminio,
        [-largCab / 2 + 0.0055, yCab + hCab / 2, 0]);
      zCil.forEach(z => caixa(cabGrupo, "ponte do cabeçote seccionado", [0.041, 0.008, 0.007], M.corte,
        [-0.032, yTopoCab - 0.004, z + 0.047]));
    }
    bancos.push({ s, no: banco, estrutura: cabGrupo, cab, tampa });
  }

  const caixaBaixa = grupo(fundicao, "caixa inferior do virabrequim");
  for (const s of [-1, 1]) if (!(corte && s === 1)) {
    const parede = caixa(caixaBaixa, "parede lateral do bloco", [0.018, 0.161, 0.51], M.bloco, [s * 0.102, -0.0135, 0]);
    for (let i = 0; i < 5; i++) {
      const nervura = caixa(caixaBaixa, "reforço vertical inferior", [0.013, 0.005, 0.125], M.bloco);
      parede.face(s > 0 ? "leste" : "oeste").colocar(nervura, { u: (i - 2) * 0.108 });
    }
  }
  for (const s of [-1, 1]) {
    if (corte && s === -1) continue;
    const anteparo = caixa(caixaBaixa, s < 0 ? "anteparo dianteiro" : "anteparo traseiro", [0.222, 0.230, 0.019], M.bloco,
      [0, 0.020, s * (0.255 + 0.0095)]);
    anteparo.furar({ face: "norte", forma: { tipo: "circulo", raio: 0.031, segmentos: 48 }, u: 0, v: -0.020 });
    anteparo.furar({ face: "norte", forma: { tipo: "circulo", raio: 0.0165, segmentos: 40 }, u: 0, v: yCam - 0.020 });
  }

  // ───────────────────── 02. VIRABREQUIM CROSS-PLANE ─────────────────────
  const girante = grupo(motor, "02 · conjunto girante");
  const virabrequim = grupo(girante, "virabrequim cross-plane · cinco mancais");
  for (let i = 0; i < 5; i++) {
    const z = (i - 2) * D.entreEixosCilindros;
    cilindro(virabrequim, `munhão principal ${i + 1}`, 0.0294, 0.046, M.usinado, [0, 0, z], [PI / 2, 0, 0]);
    const cap = grupo(girante, `capa de mancal ${i + 1}`, [0, 0, z]);
    const perfil = setorAnular(0.0300, 0.047, PI, TAU).map(([x, y]): P2 => [x, y]);
    placaXY(cap, "ponte semicircular inferior", perfil, 0.031, M.ferro);
    placaXY(cap, "bronzina inferior", setorAnular(0.0295, 0.0300, PI, TAU), 0.029, M.latao);
    for (const s of [-1, 1]) {
      const orelha = caixa(cap, "orelha do mancal", [0.031, 0.026, 0.031], M.ferro, [s * 0.048, -0.014, 0]);
      fixar(orelha, "base", 0, 0, "parafuso de mancal", 0.0062);
    }
  }
  const perfilMassa: P2[] = [[-0.029, 0.059], [0.029, 0.059], [0.045, 0.029], [0.062, -0.025],
    [0.057, -0.060], [0.031, -0.078], [-0.031, -0.078], [-0.057, -0.060], [-0.062, -0.025], [-0.045, 0.029]];
  zCil.forEach((z, i) => {
    const phi = opt.anguloVirabrequim + fase[i];
    const q: V3 = [R * Math.sin(phi), R * Math.cos(phi), z];
    cilindro(virabrequim, `moente de bielas ${i + 1}`, 0.0239, 0.052, M.usinado, q, [PI / 2, 0, 0]);
    for (const s of [-1, 1]) {
      const massa = placaXY(virabrequim, `contrapeso ${i * 2 + (s < 0 ? 1 : 2)}`, perfilMassa, 0.018, M.ferro,
        [0, 0, z + s * 0.034], -phi);
      cilindro(massa, "inserto de balanceamento", 0.010, 0.0184, M.aco, [0, -0.050, 0], [PI / 2, 0, 0]);
    }
  });
  cilindro(virabrequim, "ponta dianteira e chaveta", 0.021, 0.076, M.usinado, [0, 0, -0.286], [PI / 2, 0, 0]);
  caixa(virabrequim, "chaveta do damper", [0.007, 0.006, 0.031], M.aco, [0, 0.021, -0.316]);
  cilindro(virabrequim, "flange traseira", 0.046, 0.043, M.aco, [0, 0, 0.2785], [PI / 2, 0, 0]);

  // Pistões e bielas: solução exata da equação do mecanismo biela-manivela.
  for (const { s } of bancos) {
    const g = grupo(girante, `pistões e bielas · lado ${s < 0 ? "esquerdo" : "direito"}`,
      [0, 0, s * D.deslocamentoBancadas / 2], [0, 0, -s * aBanco]);
    zCil.forEach((z, i) => {
      const phi = opt.anguloVirabrequim + fase[i];
      const qx = R * Math.sin(phi), qy = R * Math.cos(phi);
      const lateral = cs * qx - s * sn * qy;
      const axial = s * sn * qx + cs * qy;
      const proj = Math.sqrt(L * L - lateral * lateral);
      const yPino = axial + proj;
      const numero = i * 2 + (s < 0 ? 1 : 2);
      const pistao = grupo(g, `pistão ${numero} · forjado com três canaletas`, [0, yPino, z]);
      const rp = rCil - 0.00025;
      const perfil: P2[] = [[0.043, -0.026], [rp, -0.026], [rp, 0.006], [rp - 0.0015, 0.006],
        [rp - 0.0015, 0.009], [rp, 0.009], [rp, 0.015], [rp - 0.0013, 0.015],
        [rp - 0.0013, 0.017], [rp, 0.017], [rp, 0.022], [rp - 0.0013, 0.022],
        [rp - 0.0013, 0.024], [rp, 0.024], [rp, 0.030], [rp - 0.0015, 0.031],
        [0.033, 0.031], [0.027, 0.028], [0, 0.028], [0, 0.021], [0.043, 0.021], [0.043, -0.026]];
      torno(pistao, "corpo oco, saia, canaletas e coroa côncava", perfil, M.aluminio);
      [0.0075, 0.016, 0.023].forEach((y, j) => {
        const ang = j * TAU / 3;
        extrusao(pistao, j === 0 ? "anel raspador de óleo" : `anel de compressão ${j}`,
          setorAnular(rp - 0.00125, rCil - 0.000025, 0.014, TAU - 0.014, 64), j === 0 ? 0.0021 : 0.00155,
          j === 0 ? M.latao : M.ferro, [0, y - (j === 0 ? 0.00105 : 0.000775), 0], false, [0, ang, 0]);
      });
      cilindro(pistao, "pino de pistão", 0.0080, 0.081, M.usinado, ORIGEM, [PI / 2, 0, 0]);
      for (const j of [-1, 1]) {
        anel(pistao, "bossagem do pino", 0.0081, 0.013, 0.015, M.aluminio, [0, 0, j * 0.031], [PI / 2, 0, 0]);
        toro(pistao, "trava do pino", 0.0092, 0.00065, M.aco, [0, 0, j * 0.0408], [PI / 2, 0, 0]);
      }
      const biela = grupo(g, `biela ${numero} · seção I`, [lateral, axial, z], [0, 0, Math.atan2(lateral, proj)]);
      anel(biela, "cabeça da biela", 0.0251, 0.033, 0.018, M.aco, ORIGEM, [PI / 2, 0, 0]);
      anel(biela, "bronzina do moente", 0.0240, 0.0251, 0.0178, M.latao, ORIGEM, [PI / 2, 0, 0]);
      anel(biela, "pé da biela", 0.0081, 0.0137, 0.018, M.aco, [0, L, 0], [PI / 2, 0, 0]);
      anel(biela, "bucha do pé", 0.0080, 0.0088, 0.0181, M.latao, [0, L, 0], [PI / 2, 0, 0]);
      placaXY(biela, "alma forjada", [[-0.014, 0.025], [0.014, 0.025], [0.0082, L - 0.011], [-0.0082, L - 0.011]], 0.006, M.aco);
      for (const f of [-1, 1]) placaXY(biela, "aba de reforço da seção I",
        [[-0.015, 0.026], [0.015, 0.026], [0.010, L - 0.010], [-0.010, L - 0.010]], 0.003, M.usinado, [0, 0, f * 0.007]);
      for (const x of [-0.025, 0.025]) {
        const aba = caixa(biela, "orelha da capa de biela", [0.010, 0.022, 0.018], M.aco, [x, -0.007, 0]);
        fixar(aba, "base", 0, 0, "parafuso de biela", 0.0035);
      }
      for (const x of [-0.029, 0.029]) caixa(biela, "linha de separação da capa", [0.009, 0.0005, 0.0182], M.preto, [x, -0.011, 0]);
    });
  }

  // ───────────────────── 03. COMANDO, TUCHOS E 16 VÁLVULAS ─────────────────────
  const distribuicao = grupo(motor, "03 · distribuição OHV");
  const comando = grupo(distribuicao, "comando central · dezesseis ressaltos", [0, yCam, 0]);
  cilindro(comando, "eixo do comando", 0.0115, 0.537, M.usinado, ORIGEM, [PI / 2, 0, 0]);
  for (let i = 0; i < 5; i++) anel(comando, "mancal do comando", 0.0116, 0.0170, 0.012, M.latao,
    [0, 0, (i - 2) * D.entreEixosCilindros], [PI / 2, 0, 0]);
  bancos.forEach(({ s, no, estrutura, cab, tampa }) => {
    zCil.forEach((z, i) => {
      for (let v = 0; v < 2; v++) {
        const zv = z + (v === 0 ? -0.017 : 0.017);
        const faseValvula = opt.anguloVirabrequim / 2 + fase[i] / 2 + (s < 0 ? PI / 4 : 0) + v * 1.9;
        const perfilLobo: P2[] = [];
        for (let j = 0; j < 48; j++) {
          const a = j * TAU / 48, r = 0.015 + 0.008 * Math.pow(Math.max(0, Math.cos(a)), 4);
          perfilLobo.push([r * Math.sin(a), r * Math.cos(a)]);
        }
        placaXY(comando, `ressalto ${i * 4 + (s < 0 ? 0 : 2) + v + 1}`, perfilLobo, 0.008, M.aco,
          [0, 0, zv + s * D.deslocamentoBancadas / 2], faseValvula);
        const px = -s * 0.059;
        const tucho = cilindro(no, "tucho hidráulico", 0.0091, 0.031, M.aco, [px, 0.091, zv]);
        toro(no, "canal de óleo do tucho", 0.0092, 0.0005, M.preto, [px, 0.096, zv]);
        const topoTucho = esfera(no, "copo esférico do tucho", 0.0050, M.usinado, [px, 0.109, zv]);
        // A haste é longa por projeto; seus extremos vêm dos pontos funcionais.
        haste(no, "vareta de comando", [px, 0.109, zv], [px, yTopoCab + 0.041, zv], 0.0031, M.usinado);
        const vx = (v === 0 ? -s : s) * 0.020;
        const vg = grupo(estrutura, `${v === 0 ? "admissão" : "escape"} · cilindro ${i * 2 + (s < 0 ? 1 : 2)}`);
        const rVal = v === 0 ? 0.0188 : 0.0160;
        torno(vg, "prato e haste da válvula", [[0, -0.003], [rVal - 0.002, -0.003], [rVal, -0.001], [rVal, 0.001],
          [0.006, 0.008], [0.0029, 0.013], [0.0029, hCab + 0.043], [0, hCab + 0.043], [0, -0.003]],
          M.usinado, [vx, yCab + 0.004, zv]);
        anel(vg, "sede da válvula", rVal - 0.002, rVal + 0.0017, 0.003, M.aco, [vx, yCab + 0.004, zv]);
        anel(vg, "guia da válvula", 0.003, 0.0058, 0.041, M.latao, [vx, yCab + 0.037, zv]);
        anel(vg, "assento da mola", 0.005, 0.0133, 0.0024, M.aco, [vx, yTopoCab + 0.0012, zv]);
        vg.criar("helix", { raio: 0.0097, raioTubo: 0.00145, passo: 0.0045, voltas: 7,
          segmentosPorVolta: 28, segmentosTubo: 8 },
          { nome: "mola helicoidal de válvula · 7 espiras", material: M.aco,
            transform: { posicao: [vx, yTopoCab + 0.0024 + 7 * 0.0045 / 2, zv] } });
        const retentor = anel(vg, "prato retentor da mola", 0.0032, 0.0124, 0.003, M.usinado, [vx, yTopoCab + 0.036, zv]);
        toro(vg, "chavetas bipartidas", 0.0036, 0.0010, M.ferro, [vx, yTopoCab + 0.038, zv]);
        const bal = caixa(vg, "balancim roletado", [Math.abs(vx - px) + 0.014, 0.010, 0.014], M.aluminio,
          [(px + vx) / 2, yTopoCab + 0.046, zv]);
        cilindro(vg, "rolete do balancim", 0.0055, 0.015, M.aco, [vx, yTopoCab + 0.042, zv], [PI / 2, 0, 0]);
        cilindro(vg, "eixo do balancim", 0.0055, 0.022, M.usinado, [(px + vx) / 2, yTopoCab + 0.046, zv], [PI / 2, 0, 0]);
        fixar(bal, "topo", 0, 0, "regulagem do balancim", 0.0033);
        // Referências mantidas semanticamente no grafo; não é necessário I/O.
        void tucho; void topoTucho; void retentor;
      }
      if (!cab || !tampa) return;
      const faceFora: FaceNome = s > 0 ? "leste" : "oeste";
      const vela = grupo(estrutura, `vela de ignição ${i + 1}`);
      const sext = cilindro(vela, "sextavado da vela", 0.0092, 0.009, M.usinado, [0, 0.0045, 0], ORIGEM, 6);
      torno(vela, "isolador cerâmico nervurado", [[0, 0.009], [0.0058, 0.009], [0.0058, 0.016], [0.0064, 0.017],
        [0.0056, 0.019], [0.0064, 0.021], [0.0056, 0.023], [0.0064, 0.025], [0.0056, 0.027],
        [0.0058, 0.031], [0, 0.031], [0, 0.009]], M.ceramica);
      cilindro(vela, "cachimbo isolante", 0.0080, 0.017, M.borracha, [0, 0.036, 0]);
      cab.face(faceFora).colocar(vela, { u: s * (z + 0.026), v: -0.018 });
      void sext;
      const bobina = caixa(estrutura, `bobina individual ${i + 1}`, [0.030, 0.019, 0.039], M.preto);
      tampa.face("topo").colocar(bobina, { u: s * 0.029, v: z });
      const conector = caixa(estrutura, "conector selado da bobina", [0.014, 0.010, 0.014], M.borracha);
      bobina.face("norte").colocar(conector);
      fixar(bobina, "topo", 0, 0.012, "fixação da bobina", 0.0031);
      // Cabo curto, todo no frame da bancada; acompanha a abertura do cabeçote.
      tubo(estrutura, `cabo de ignição ${i + 1}`, [
        [s * (largCab / 2 + 0.0445), yCab + hCab / 2 - 0.018, z + 0.026],
        [s * 0.133, yTopoCab + 0.015, z + 0.032],
        [s * 0.109, yTopoCab + 0.075, z],
        [s * 0.041, yTopoCab + 0.071 + 0.077 * expl, z],
      ], 0.0033, M.borracha, 18);
    });
    if (tampa) {
      tubo(estrutura, "chicote de injeção e ignição", [
        [s * 0.047, yTopoCab + 0.087 + 0.077 * expl, -0.225],
        [s * 0.050, yTopoCab + 0.087 + 0.077 * expl, -0.13],
        [s * 0.050, yTopoCab + 0.087 + 0.077 * expl, 0.20],
      ], 0.0042, M.preto, 20);
      if (s < 0) {
        const gargalo = cilindro(estrutura, "gargalo de óleo", 0.019, 0.017, M.aluminio);
        tampa.face("topo").colocar(gargalo, { u: -s * 0.022, v: 0.129 });
        const tampao = cilindro(estrutura, "tampa de abastecimento de óleo", 0.023, 0.012, M.preto);
        gargalo.face("topo").colocar(tampao);
        pontosCirculo(12, 0.021).forEach(([x, z], j) => {
          caixa(tampao, "recartilhado da tampa", [0.0045, 0.010, 0.003], M.preto,
            [x, 0, z], [0, -j * TAU / 12, 0]);
        });
        const pega = caixa(estrutura, "pega da tampa de óleo", [0.032, 0.003, 0.006], M.amarelo);
        tampao.face("topo").colocar(pega);
      }
    }
  });

  // ───────────────────── 04. CÁRTER E LUBRIFICAÇÃO ─────────────────────
  const oleo = grupo(motor, "04 · lubrificação e cárter");
  const carter = grupo(oleo, "cárter removível", [0, -0.125 * expl, 0]);
  const yFlange = -0.099, alturaPan = 0.105, yTopoPan = yFlange - 0.005;
  for (const s of [-1, 1]) {
    const trilho = caixa(carter, "flange lateral do cárter", [0.017, 0.010, 0.526], M.aluminio, [s * 0.105, yFlange, 0]);
    const junta = caixa(carter, "junta lateral do cárter", [0.017, 0.0015, 0.526], M.junta);
    trilho.face("topo").colocar(junta);
    for (let i = 0; i < 8; i++) fixar(trilho, "base", 0, (i - 3.5) * 0.065, "parafuso do cárter", 0.0041);
  }
  for (const s of [-1, 1]) {
    const trilho = caixa(carter, "flange transversal do cárter", [0.193, 0.010, 0.017], M.aluminio, [0, yFlange, s * 0.2545]);
    for (const x of [-0.060, 0, 0.060]) fixar(trilho, "base", x, 0, "parafuso do cárter", 0.0041);
  }
  if (!corte) {
    const pan = extrusao(carter, "cuba oca do cárter", retanguloArredondado(0.205, 0.509, 0.014), alturaPan, M.aluminio,
      [0, yTopoPan - alturaPan / 2, 0]);
    pan.furar({ face: "topo", forma: { tipo: "retangulo", largura: 0.181, altura: 0.480 }, u: 0, v: 0, profundidade: alturaPan - 0.006 });
    for (const s of [-1, 1]) for (let j = 0; j < 10; j++) {
      const nervura = caixa(carter, "nervura externa do cárter", [0.007, 0.004, alturaPan - 0.020], M.aluminio);
      pan.face(s > 0 ? "leste" : "oeste").colocar(nervura, { u: (j - 4.5) * 0.046 });
    }
    const bujao = parafuso(carter, "bujão de drenagem", 0.009);
    pan.face("sul").colocar(bujao, { v: -0.031 });
  } else {
    caixa(carter, "fundo do cárter aberto", [0.205, 0.006, 0.509], M.aluminio, [0, yTopoPan - alturaPan + 0.003, 0]);
    caixa(carter, "parede interna preservada do cárter", [0.012, alturaPan - 0.006, 0.509], M.aluminio,
      [-0.0965, yTopoPan - (alturaPan - 0.006) / 2, 0]);
    for (const s of [-1, 1]) caixa(carter, "parede transversal do cárter em corte", [0.103, alturaPan - 0.006, 0.014], M.aluminio,
      [-0.051, yTopoPan - (alturaPan - 0.006) / 2, s * 0.2475]);
  }
  for (let i = 0; i < 6; i++) caixa(carter, "aleta inferior do cárter", [0.008, 0.006, 0.44], M.aluminio,
    [(i - 2.5) * 0.031, yTopoPan - alturaPan - 0.003, 0]);
  const pescador = grupo(oleo, "pescador e bomba de óleo");
  anel(pescador, "corpo da bomba gerotor", 0.023, 0.053, 0.023, M.aluminio, [0, 0, -0.245], [PI / 2, 0, 0]);
  tubo(pescador, "tubo do pescador", [[0.039, -0.028, -0.244], [0.065, -0.108, -0.196],
    [0.051, -0.164, 0.009], [0.003, -0.169, 0.128]], 0.009, M.aco, 26);
  const tela = cilindro(pescador, "crivo do pescador", 0.039, 0.008, M.ferro, [0.003, -0.174, 0.128]);
  for (let i = -4; i <= 4; i++) {
    const x = i * 0.007, len = 2 * Math.sqrt(0.034 * 0.034 - x * x);
    const nerv = caixa(pescador, "grade do crivo", [0.0013, 0.0008, len], M.usinado);
    tela.face("base").colocar(nerv, { u: x });
  }
  const filtro = grupo(oleo, "filtro de óleo rosqueado", [0.117, -0.043, 0.140], [0, 0, -3 * PI / 4]);
  const adaptador = cilindro(filtro, "adaptador do filtro", 0.034, 0.018, M.aluminio, [0, 0.009, 0]);
  const lataFiltro = torno(filtro, "carcaça do filtro", [[0, 0.018], [0.032, 0.018], [0.034, 0.021], [0.034, 0.084],
    [0.030, 0.093], [0, 0.096], [0, 0.018]], M.filtro);
  toro(filtro, "costura da carcaça", 0.0338, 0.0014, M.usinado, [0, 0.025, 0]);
  for (let j = 0; j < 14; j++) {
    const a = j * TAU / 14;
    caixa(filtro, "estria para chave de filtro", [0.003, 0.017, 0.001], M.tampa,
      [0.032 * Math.sin(a), 0.081, 0.032 * Math.cos(a)], [0, a, 0]);
  }
  void adaptador; void lataFiltro;
  tubo(oleo, "tubo-guia da vareta de óleo", [[0.085, -0.094, -0.070], [0.134, 0.006, -0.110],
    [0.164, 0.173, -0.130], [0.176, 0.267, -0.130]], 0.0030, M.aco, 24);
  toro(oleo, "alça amarela da vareta", 0.011, 0.0028, M.amarelo, [0.178, 0.279, -0.130], [PI / 2, 0, -0.20]);

  // ───────────────────── 05. ADMISSÃO, COMBUSTÍVEL E BORBOLETA ─────────────────────
  const adm = grupo(motor, "05 · admissão e injeção", [0, 0.15 * expl, 0]);
  const vale = caixa(adm, "tampa do vale", [0.158, 0.017, 0.447], M.aluminio, [0, 0.181, 0]);
  for (const u of [-0.065, 0.065]) for (const v of [-0.197, 0, 0.197]) fixar(vale, "topo", u, v, "fixação do vale", 0.004);
  const plenum = extrusao(adm, "plenum de admissão", retanguloArredondado(0.168, 0.379, 0.035), 0.079, M.tampa, [0, 0.380, -0.009]);
  const tampaPlenum = extrusao(adm, "tampa superior do plenum", retanguloArredondado(0.174, 0.385, 0.035), 0.005, M.aluminio);
  plenum.face("topo").colocar(tampaPlenum);
  for (const u of [-0.064, 0.064]) for (const v of [-0.14, -0.05, 0.05, 0.14]) fixar(tampaPlenum, "topo", u, v, "parafuso do plenum", 0.0037);
  for (const u of [-0.041, -0.026, 0.026, 0.041]) {
    const nerv = caixa(adm, "aleta do plenum", [0.004, 0.004, 0.278], M.tampa);
    tampaPlenum.face("topo").colocar(nerv, { u });
  }
  const placaLogo = caixa(adm, "placa central V8", [0.089, 0.002, 0.057], M.preto);
  tampaPlenum.face("topo").colocar(placaLogo, { v: -0.040, gap: 0.004 });
  placaLogo.face("topo").colocar(emblemaV8(adm, 1.3));
  for (const s of [-1, 1]) {
    zCil.forEach((z, i) => {
      const fim = globalBanco(s, -s * (largCab / 2 + 0.008), yCab + 0.032, z);
      const inicio: V3 = [s * 0.074, 0.368, z * 0.87];
      tubo(adm, `duto individual de admissão ${i * 2 + (s < 0 ? 1 : 2)}`,
        [inicio, [s * 0.116, 0.353, z * 0.93], [s * 0.145, 0.304, fim[2]], fim], 0.0185, M.aluminio, 22);
      const injBase = globalBanco(s, -s * 0.078, yCab + 0.052, z);
      const injTopo: V3 = [s * 0.106, 0.336, fim[2]];
      haste(adm, "corpo do injetor", injBase, injTopo, 0.0070, M.preto);
      haste(adm, "colar do injetor", mistura(injBase, injTopo, 0.60), mistura(injBase, injTopo, 0.77), 0.008, M.latao);
      const plug = caixa(adm, "conector do injetor", [0.013, 0.012, 0.013], M.preto, mistura(injBase, injTopo, 0.74));
      void plug;
    });
    cilindro(adm, "flauta de combustível", 0.0103, 0.443, M.aco, [s * 0.105, 0.344, s * D.deslocamentoBancadas / 2], [PI / 2, 0, 0]);
    for (const z of [-0.148, 0.148]) {
      const apoio = caixa(adm, "suporte da flauta", [0.034, 0.008, 0.017], M.aluminio, [s * 0.099, 0.326, z]);
      fixar(apoio, "topo", -s * 0.010, 0, "parafuso do suporte da flauta", 0.0031);
    }
    for (const z of [-0.229, 0.229]) cilindro(adm, "conexão sextavada da flauta", 0.012, 0.015, M.latao,
      [s * 0.105, 0.344, z + s * D.deslocamentoBancadas / 2], [PI / 2, 0, 0], 6);
  }
  tubo(adm, "ponte de combustível", [[-0.105, 0.344, 0.239], [-0.093, 0.367, 0.268],
    [0.093, 0.367, 0.268], [0.105, 0.344, 0.261]], 0.0047, M.borracha, 24);
  const tbi = grupo(adm, "corpo de borboleta de 88 mm", [0, 0.375, -0.235], [-PI / 2, 0, 0]);
  const corpoTBI = anel(tbi, "corpo usinado da borboleta", 0.044, 0.054, 0.072, M.aluminio);
  const labio = anel(tbi, "lábio de entrada", 0.044, 0.057, 0.006, M.usinado);
  corpoTBI.face("topo").colocar(labio);
  cilindro(tbi, "disco da borboleta semiaberta", 0.0427, 0.0015, M.latao, ORIGEM, [0, 0, 0.35]);
  haste(tbi, "eixo da borboleta", [-0.052, 0, 0], [0.052, 0, 0], 0.0037, M.aco);
  const servo = caixa(tbi, "atuador eletrônico da borboleta", [0.033, 0.044, 0.055], M.preto);
  corpoTBI.face("leste").colocar(servo, { orientar: false });
  for (const [u, v] of pontosCirculo(4, 0.062, PI / 4)) {
    const orelha = cilindro(tbi, "orelha do corpo de borboleta", 0.010, 0.012, M.aluminio, [u, -0.025, v]);
    fixar(orelha, "topo", 0, 0, "fixação do corpo de borboleta", 0.0037);
  }

  // ───────────────────── 06. COLETORES TUBULARES 4–1 ─────────────────────
  const escapamento = grupo(motor, "06 · escapamento tubular 4 em 1");
  for (const s of [-1, 1]) {
    if (corte && s === 1) continue;
    const cabInfo = bancos.find(b => b.s === s)!;
    zCil.forEach((z, i) => {
      const inicio = globalBanco(s, s * (largCab / 2 + 0.004), yCab + 0.036 + 0.065 * expl, z);
      if (cabInfo.cab) {
        const f: FaceNome = s > 0 ? "leste" : "oeste";
        const flange = extrusao(cabInfo.estrutura, "flange individual do escape", retanguloArredondado(0.077, 0.046, 0.010), 0.006, M.aco);
        cabInfo.cab.face(f).colocar(flange, { u: s * z, v: 0.004 });
        flange.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.0167, segmentos: 36 }, u: 0, v: 0 });
        for (const u of [-0.030, 0.030]) fixar(flange, "topo", u, 0, "prisioneiro de escape", 0.004);
      }
      const laneX = (i % 2 === 0 ? -1 : 1) * 0.0135;
      const laneY = (i < 2 ? -1 : 1) * 0.014;
      const fim: V3 = [s * (0.350 + laneX), -0.084 + laneY, 0.295];
      tubo(escapamento, `primário ${i * 2 + (s < 0 ? 1 : 2)}`, [inicio,
        [s * (0.291 + i * 0.012), inicio[1] - 0.006, inicio[2]],
        [s * (0.362 + (3 - i) * 0.017), 0.049, inicio[2] + 0.035],
        [s * (0.377 + laneX), -0.059 + laneY, 0.203 + i * 0.009], fim], 0.0183, M.escape, 32);
      toro(escapamento, "cordão de solda no coletor", 0.0184, 0.0012, M.solda,
        [fim[0], fim[1], fim[2] - 0.004], [PI / 2, 0, 0]);
    });
    const col = grupo(escapamento, "junção 4 em 1 e saída", [s * 0.350, -0.084, 0.337], [PI / 2, 0, 0]);
    torno(col, "coletor cônico oco", [[0.038, -0.042], [0.041, -0.042], [0.029, 0.042], [0.0265, 0.042], [0.038, -0.042]], M.escape);
    const flange = anel(col, "flange de saída", 0.0265, 0.045, 0.007, M.aco, [0, 0.0455, 0]);
    pontosCirculo(3, 0.037, PI / 2).forEach(([u, v]) => fixar(flange, "topo", u, v, "parafuso da saída do escape", 0.0043));
    anel(col, "bocal de saída visivelmente aberto", 0.0265, 0.0284, 0.026, M.escape, [0, 0.062, 0]);
    const sonda = grupo(escapamento, "sonda lambda", [s * 0.383, -0.084, 0.323], [0, 0, -s * PI / 2]);
    cilindro(sonda, "sextavado da sonda", 0.008, 0.012, M.aco, ORIGEM, ORIGEM, 6);
    cilindro(sonda, "corpo da sonda lambda", 0.006, 0.024, M.ceramica, [0, 0.013, 0]);
  }

  // ───────────────────── 07. CORRENTE E TAMPA FRONTAL ─────────────────────
  const frente = grupo(motor, "07 · sincronismo e acessórios dianteiros");
  const zCorrente = -0.292;
  function engrenagem(p: Pai, nome: string, r: number, dentes: number, pos: V3): NoRef {
    const g = grupo(p, nome, pos, [PI / 2, 0, 0]);
    const disco = anel(g, "corpo da engrenagem", 0.009, r - 0.0019, 0.008, M.aco);
    for (let i = 0; i < dentes; i++) {
      const a = i * TAU / dentes;
      caixa(g, "dente usinado", [r * TAU / dentes * 0.43, 0.0075, 0.004], M.usinado,
        [r * Math.sin(a), 0, r * Math.cos(a)], [0, a, 0]);
    }
    fixar(disco, "base", 0, 0, "parafuso central do sincronismo", 0.0075);
    return g;
  }
  engrenagem(frente, "pinhão do virabrequim · 20 dentes", 0.0255, 20, [0, 0, zCorrente]);
  engrenagem(frente, "coroa do comando · 40 dentes", 0.051, 40, [0, yCam, zCorrente]);
  const caminhoCorrente = trajetoCorreia([{ x: 0, y: 0, r: 0.0278, lado: 1 }, { x: 0, y: yCam, r: 0.0533, lado: 1 }]);
  const elos = amostrarFechada(caminhoCorrente, 68);
  elos.forEach(({ p, tangente }, i) => {
    const elo = grupo(frente, `elo de corrente ${i + 1}`, [p[0], p[1], zCorrente], [0, 0, -Math.atan2(tangente[0], tangente[1])]);
    for (const s of [-1, 1]) {
      caixa(elo, "placa lateral do elo", [0.0048, 0.0086, 0.0013], i % 2 ? M.aco : M.usinado, [0, 0, s * 0.006]);
      for (const y of [-0.0035, 0.0035]) cilindro(elo, "cabeça de pino", 0.0023, 0.0017, M.aco,
        [0, y, s * 0.0064], [PI / 2, 0, 0], 12);
    }
    cilindro(elo, "rolete de corrente", 0.0024, 0.0105, M.aco, [0, 0.0035, 0], [PI / 2, 0, 0], 12);
  });
  caixa(frente, "patim do tensionador da corrente", [0.011, 0.050, 0.015], M.preto, [0.041, 0.044, zCorrente]);
  if (!corte) {
    const cobertura = grupo(frente, "tampa frontal removível", [0, 0, -0.110 * expl]);
    const perfil: P2[] = [[-0.107, -0.076], [0.107, -0.076], [0.122, -0.031], [0.114, 0.113],
      [0.077, 0.170], [-0.077, 0.170], [-0.114, 0.113], [-0.122, -0.031]];
    placaXY(cobertura, "junta da tampa frontal", perfil, 0.0015, M.junta, [0, 0, -0.307]);
    placaXY(cobertura, "tampa frontal fundida", perfil, 0.020, M.aluminio, [0, 0, -0.318]);
    anel(cobertura, "bossagem do retentor frontal", 0.024, 0.047, 0.012, M.aluminio, [0, 0, -0.334], [PI / 2, 0, 0]);
    anel(cobertura, "retentor do virabrequim", 0.021, 0.028, 0.005, M.borracha, [0, 0, -0.342], [PI / 2, 0, 0]);
    perfil.forEach(([x, y], i) => parafusoPlano(cobertura, `parafuso frontal ${i + 1}`,
      [x * 0.90, y * 0.90 + 0.003, -0.328], [-PI / 2, 0, 0], 0.0045));
    for (let i = 0; i < 6; i++) {
      const a = -PI / 4 + i * PI / 5;
      haste(cobertura, "nervura da tampa frontal", [0.047 * Math.cos(a), 0.047 * Math.sin(a), -0.332],
        [0.092 * Math.cos(a), 0.029 + 0.093 * Math.sin(a), -0.332], 0.0037, M.aluminio);
    }
  }

  // ───────────────────── 08. PERIFÉRICOS E CORREIA 6PK ─────────────────────
  const acess = grupo(frente, "periféricos completos", [0, 0, -0.110 * expl]);
  const zCorreia = -0.409;
  const rodas: Polia2D[] = [
    { x: 0, y: 0, r: 0.063, lado: 1 },
    { x: -0.174, y: 0.176, r: 0.049, lado: 1 },
    { x: 0, y: 0.193, r: 0.052, lado: -1 },
    { x: 0.191, y: 0.266, r: 0.039, lado: 1 },
    { x: 0.185, y: 0.076, r: 0.029, lado: 1 },
    { x: 0.075, y: 0.105, r: 0.026, lado: -1 },
  ];
  const nomesRodas = ["damper do virabrequim", "polia da direção hidráulica", "polia da bomba d'água",
    "polia do alternador", "polia tensionadora", "polia guia de retorno"];
  rodas.forEach((r, i) => {
    const g = grupo(acess, nomesRodas[i], [r.x, r.y, zCorreia], [PI / 2, 0, 0]);
    const miolo = cilindro(g, "núcleo da polia", r.r - 0.004, 0.025, i === 0 ? M.ferro : M.aco);
    for (let j = 0; j < 7; j++) toro(g, r.lado < 0 ? "linha da pista lisa" : "garganta da polia",
      r.r - 0.001, r.lado < 0 ? 0.00025 : 0.0009, M.ferro, [0, (j - 3) * 0.0031, 0]);
    for (const s of [-1, 1]) anel(g, "borda da polia", r.r - 0.008, r.r + 0.001, 0.0016, M.usinado, [0, s * 0.0124, 0]);
    fixar(miolo, "base", 0, 0, "parafuso da polia", i === 0 ? 0.010 : 0.006);
    if (i < 4) pontosCirculo(i === 0 ? 6 : 5, r.r * 0.61).forEach(([u, v]) => {
      const janela = cilindro(g, "rebaixo escuro da face da polia", r.r * 0.105, 0.0008, M.preto);
      miolo.face("base").colocar(janela, { u, v });
    });
  });
  torno(acess, "amortecedor harmônico", [[0, -0.024], [0.048, -0.024], [0.059, -0.017], [0.059, 0.017],
    [0.048, 0.024], [0, 0.024], [0, -0.024]], M.ferro, [0, 0, -0.368], [PI / 2, 0, 0]);
  toro(acess, "elastômero do damper", 0.057, 0.0022, M.borracha, [0, 0, -0.367], [PI / 2, 0, 0]);
  const caminho = trajetoCorreia(rodas, 160);
  const correia = grupo(acess, "correia serpentina EPDM · 6PK");
  caminho.forEach((a, i) => {
    const b = caminho[(i + 1) % caminho.length], dx = b[0] - a[0], dy = b[1] - a[1];
    caixa(correia, `segmento de correia ${i + 1}`, [0.0028, Math.hypot(dx, dy) + 0.00015, 0.020], M.borracha,
      [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, zCorreia], [0, 0, -Math.atan2(dx, dy)]);
    haste(correia, "borda reforçada da correia", [a[0], a[1], zCorreia - 0.010], [b[0], b[1], zCorreia - 0.010], 0.0004, M.ferro, 8);
  });
  // Suportes fundidos de periféricos, triangulados até a face frontal do bloco.
  for (const [i, x, y] of [[0, -0.174, 0.176], [1, 0.191, 0.266], [2, 0.185, 0.076]] as const) {
    placaXY(acess, `suporte de periférico ${i + 1}`,
      [[x * 0.43 - 0.018, 0.076], [x * 0.43 + 0.018, 0.076], [x + 0.016, y + 0.022], [x - 0.022, y + 0.022]],
      0.015, M.aluminio, [0, 0, -0.323]);
    parafusoPlano(acess, "fixação do suporte", [x * 0.43, 0.088, -0.332], [-PI / 2, 0, 0], 0.006);
  }
  const tensor = caixa(acess, "braço do tensionador automático", [0.027, 0.071, 0.023], M.aluminio,
    [0.172, 0.117, -0.377], [0, 0, -0.22]);
  cilindro(acess, "mola encapsulada do tensionador", 0.026, 0.030, M.tampa, [0.164, 0.147, -0.364], [PI / 2, 0, 0]);
  void tensor;

  // Alternador: carcaças abertas, estator de cobre, rotor, aletas e tirantes.
  const alternador = grupo(acess, "alternador ventilado", [0.191, 0.266, -0.326]);
  for (const s of [-1, 1]) {
    const tampaAlt = anel(alternador, "carcaça vazada do alternador", 0.025, 0.061, 0.017, M.aluminio, [0, 0, s * 0.047], [PI / 2, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      caixa(alternador, "raio de ventilação do alternador", [0.009, 0.041, 0.016], M.aluminio,
        [0.037 * Math.sin(a), 0.037 * Math.cos(a), s * 0.047], [0, 0, -a]);
    }
    void tampaAlt;
  }
  cilindro(alternador, "rotor do alternador", 0.030, 0.095, M.ferro, ORIGEM, [PI / 2, 0, 0]);
  for (let i = 0; i < 18; i++) {
    const a = i * TAU / 18, x = 0.047 * Math.sin(a), y = 0.047 * Math.cos(a);
    haste(alternador, "bobinado de cobre", [x, y, -0.036], [x, y, 0.036], 0.0057, M.cobre);
    for (const z of [-0.035, 0.035]) toro(alternador, "cabeça de bobina do estator", 0.005, 0.0015, M.cobre,
      [x, y, z], [PI / 2, 0, 0]);
    caixa(alternador, "nervura axial da carcaça", [0.008, 0.006, 0.079], M.aluminio,
      [0.058 * Math.sin(a), 0.058 * Math.cos(a), 0], [0, 0, -a]);
  }
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + i * PI / 2, x = 0.061 * Math.sin(a), y = 0.061 * Math.cos(a);
    haste(alternador, "tirante do alternador", [x, y, -0.056], [x, y, 0.056], 0.0032, M.aco);
    parafusoPlano(alternador, "porca do tirante", [x, y, -0.056], [-PI / 2, 0, 0], 0.004);
  }
  cilindro(alternador, "eixo do alternador", 0.008, 0.105, M.usinado, [0, 0, -0.043], [PI / 2, 0, 0]);
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    caixa(alternador, "pá da ventoinha do alternador", [0.013, 0.024, 0.004], M.aco,
      [0.040 * Math.sin(a), 0.040 * Math.cos(a), -0.065], [0.18, 0, -a + 0.22]);
  }
  const terminal = cilindro(alternador, "borne positivo isolado", 0.007, 0.015, M.preto, [0.031, 0.027, 0.063], [PI / 2, 0, 0]);
  fixar(terminal, "topo", 0, 0, "porca do borne", 0.004);

  // Bomba d'água, mangueira de silicone e abraçadeiras de aço.
  const bombaAgua = grupo(acess, "bomba de água e termostato", [0, 0.193, -0.336]);
  torno(bombaAgua, "carcaça da bomba de água", [[0, -0.045], [0.039, -0.045], [0.053, -0.020], [0.051, 0.018],
    [0.027, 0.044], [0, 0.044], [0, -0.045]], M.aluminio, ORIGEM, [PI / 2, 0, 0]);
  cilindro(bombaAgua, "eixo da bomba de água", 0.011, 0.066, M.usinado, [0, 0, -0.044], [PI / 2, 0, 0]);
  tubo(acess, "mangueira superior do arrefecimento", [[-0.027, 0.219, -0.318], [-0.073, 0.251, -0.306],
    [-0.072, 0.304, -0.264], [-0.029, 0.332, -0.243]], 0.0185, M.azul, 26);
  const termostato = anel(acess, "gargalo do termostato", 0.015, 0.021, 0.030, M.aluminio,
    [-0.022, 0.332, -0.239], [0, 0, PI / 2]);
  for (const [a, b] of [
    [[-0.027, 0.219, -0.318], [-0.044, 0.232, -0.313]],
    [[-0.046, 0.325, -0.250], [-0.029, 0.332, -0.243]],
  ] as [V3, V3][]) {
    const bra = anel(acess, "abraçadeira de mangueira", 0.0185, 0.0195, 0.007, M.usinado, mistura(a, b, 0.5), orientarY(a, b));
    const fecho = caixa(acess, "fecho de abraçadeira", [0.008, 0.007, 0.006], M.aco);
    bra.face("leste").colocar(fecho, { orientar: false });
  }
  void termostato;

  const direcao = grupo(acess, "bomba e reservatório hidráulico", [-0.174, 0.176, -0.337]);
  cilindro(direcao, "corpo da bomba hidráulica", 0.043, 0.076, M.ferro, ORIGEM, [PI / 2, 0, 0]);
  cilindro(direcao, "eixo da bomba hidráulica", 0.010, 0.049, M.usinado, [0, 0, -0.051], [PI / 2, 0, 0]);
  const reserva = cilindro(direcao, "reservatório hidráulico", 0.031, 0.056, M.preto, [-0.013, 0.059, 0.010]);
  const tampaReserva = cilindro(direcao, "tampa do reservatório", 0.034, 0.010, M.preto, ORIGEM, ORIGEM, 16);
  reserva.face("topo").colocar(tampaReserva);
  const conexao = cilindro(direcao, "conexão hidráulica", 0.0073, 0.016, M.latao, [0.012, -0.026, 0.044], [PI / 2, 0, 0], 6);
  void conexao;

  // ───────────────────── 09. VOLANTE, ARRANQUE E COXINS ─────────────────────
  const traseira = grupo(motor, "09 · volante e motor de partida");
  const volante = grupo(traseira, "volante removível", [0, 0, 0.312 + 0.12 * expl], [PI / 2, 0, 0]);
  const disco = cilindro(volante, "disco do volante com alívios", 0.144, 0.018, M.aco, ORIGEM, ORIGEM, 96);
  disco.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.031, segmentos: 48 }, u: 0, v: 0 });
  pontosCirculo(6, 0.079, PI / 6).forEach(([u, v]) => disco.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.013, segmentos: 32 }, u, v }));
  for (const [u, v] of pontosCirculo(6, 0.051)) fixar(disco, "topo", u, v, "parafuso do volante", 0.0061);
  const pista = anel(volante, "pista retificada da embreagem", 0.099, 0.137, 0.0016, M.usinado);
  disco.face("topo").colocar(pista);
  for (const r of [0.106, 0.116, 0.128]) toro(volante, "marca concêntrica da retífica", r, 0.00017, M.aco, [0, 0.0107, 0]);
  anel(volante, "cremalheira do arranque", 0.138, 0.148, 0.012, M.ferro);
  for (let i = 0; i < 132; i++) {
    const a = i * TAU / 132;
    caixa(volante, `dente da cremalheira ${i + 1}`, [0.0037, 0.011, 0.0064], M.aco,
      [0.149 * Math.sin(a), 0, 0.149 * Math.cos(a)], [0, a, 0]);
  }
  const partida = grupo(traseira, "motor de partida e solenoide", [0.169, -0.032, 0.240]);
  cilindro(partida, "carcaça do motor de partida", 0.035, 0.122, M.preto, ORIGEM, [PI / 2, 0, 0]);
  for (const z of [-0.058, 0.058]) cilindro(partida, "tampa do motor de partida", 0.037, 0.013, M.aluminio, [0, 0, z], [PI / 2, 0, 0]);
  cilindro(partida, "solenoide do arranque", 0.018, 0.075, M.aco, [0.012, 0.047, -0.003], [PI / 2, 0, 0]);
  engrenagem(partida, "pinhão de partida", 0.017, 11, [0, 0, 0.071]);
  for (const x of [-0.021, 0.021]) haste(partida, "tirante do motor de partida", [x, -0.020, -0.065], [x, -0.020, 0.065], 0.0025, M.aco);
  const fixacao = grupo(motor, "10 · suportes de montagem e sensores");
  for (const s of [-1, 1]) {
    placaXY(fixacao, "suporte triangular do motor", [[s * 0.104, 0.005], [s * 0.205, -0.025], [s * 0.104, -0.068]],
      0.041, M.aluminio, [0, 0, 0.005]);
    anel(fixacao, "olhal do coxim", 0.016, 0.032, 0.046, M.aco, [s * 0.198, -0.024, 0.005], [PI / 2, 0, 0]);
    anel(fixacao, "isolador de borracha do coxim", 0.007, 0.016, 0.047, M.borracha,
      [s * 0.198, -0.024, 0.005], [PI / 2, 0, 0]);
    cilindro(fixacao, "bucha passante do coxim", 0.0068, 0.052, M.usinado, [s * 0.198, -0.024, 0.005], [PI / 2, 0, 0]);
  }
  const sensor = grupo(fixacao, "sensor de posição do virabrequim", [0.072, 0.017, 0.278]);
  const sensorBase = caixa(sensor, "flange do sensor", [0.027, 0.033, 0.007], M.preto);
  const sensorPlug = caixa(sensor, "conector do sensor", [0.016, 0.015, 0.020], M.preto);
  sensorBase.face("sul").colocar(sensorPlug, { v: -0.004, orientar: false });
  fixar(sensorBase, "sul", 0, 0.011, "parafuso do sensor", 0.003);
  tubo(fixacao, "chicote traseiro do sensor", [[0.072, 0.016, 0.299], [0.110, 0.080, 0.291],
    [0.078, 0.198, 0.272], [0.056, 0.275, 0.239]], 0.0033, M.preto, 25);

  // Nada é serializado ou executado aqui: o chamador decide como usar a cena.
  // Contatos de fundição, soldas e assentamentos podem produzir avisos de
  // interpenetração deliberada. Não use esses avisos como análise estrutural.
  return cena;
}

