import { Cena } from "@snaple/core"; // Ajuste somente o caminho, se o SDK for um módulo local.

/**
 * SNAPLE E-02 — máquina de espresso com a lateral direita aberta.
 * Metros; +Y para cima; frente em +Z; Euler XYZ em radianos.
 * Apenas grupo, extrude e lathe. Sem Three direto, CSG, assets, luzes ou câmeras.
 *
 * Não executado/verificado: a validação fica com o runtime do projeto.
 *
 * O guia fornece a assinatura de criar(), mas não o schema de acoplar().
 * Para não inventar esse schema, os contatos/pivôs são declarados em
 * `acoplamentos`, com planos/eixos LOCAIS e referências reais aos nós.
 * `registrarAcoplamento` permite adaptá-los a cena.acoplar() da sua versão.
 * Sem esse adaptador a geometria é criada, mas os vínculos não são registrados
 * no linter oficial. Pontos de um contato representam PLANOS, não pinos.
 */

type V2 = [number, number];
type V3 = [number, number, number];
type No = ReturnType<Cena["criar"]>;
type Pai = Cena | No;
type Material = {
  cor: string;
  metalico?: number;
  rugosidade?: number;
  opacidade?: number;
};

export interface Detalhamento {
  segmentos: number;
  segmentosOptica: number;
  segmentosTubos: number;
  pontosArco: number;
  estriasRegistro: number;
  barrasBandeja: number;
  barrasTeto: number;
  marcasManometro: number;
  inscricoes: boolean;
  miudezas: boolean;
}

export const DETALHE: Readonly<Detalhamento> = Object.freeze({
  segmentos: 64,
  segmentosOptica: 96,
  segmentosTubos: 32,
  pontosArco: 8,
  estriasRegistro: 48,
  barrasBandeja: 29,
  barrasTeto: 19,
  marcasManometro: 48,
  inscricoes: true,
  miudezas: true,
});

export const DETALHE_LEVE: Readonly<Detalhamento> = Object.freeze({
  segmentos: 32,
  segmentosOptica: 48,
  segmentosTubos: 16,
  pontosArco: 4,
  estriasRegistro: 24,
  barrasBandeja: 19,
  barrasTeto: 11,
  marcasManometro: 24,
  inscricoes: false,
  miudezas: false,
});

type PlanoLocal = { no: No; ponto: V3; normal: V3 };
type EixoLocal = { no: No; ponto: V3; eixo: V3 };

export type AcoplamentoDeclarado =
  | { nome: string; tipo: "contato"; a: PlanoLocal; b: PlanoLocal }
  | { nome: string; tipo: "pivo"; a: EixoLocal; b: EixoLocal };

export interface OpcoesEspresso {
  detalhe?: Partial<Detalhamento>;
  lateralFechada?: boolean;
  comXicara?: boolean;
  /** Fração da altura útil do reservatório, limitada a 0.05…0.94. */
  nivelAgua?: number;
  /** Valor inicial do instrumento: 0…16 bar. */
  pressao?: number;
  registrarAcoplamento?: (cena: Cena, declaracao: AcoplamentoDeclarado) => void;
}

const PI = Math.PI;
const TAU = 2 * PI;
const TINTA = 3.5e-5;
const ORIGEM: V3 = [0, 0, 0];
const SEM_ROTACAO: V3 = [0, 0, 0];
const FRENTE: V3 = [PI / 2, 0, 0];
const TRASEIRA: V3 = [-PI / 2, PI, 0];
const DIREITA: V3 = [PI / 2, 0, -PI / 2];
const ESQUERDA: V3 = [PI / 2, 0, PI / 2];

const MAT = {
  pintura: { cor: "#982D36", metalico: 0.18, rugosidade: 0.34 },
  pinturaEscura: { cor: "#671F29", metalico: 0.12, rugosidade: 0.42 },
  inox: { cor: "#BEC8CB", metalico: 0.94, rugosidade: 0.24 },
  cromo: { cor: "#DDE5E7", metalico: 1, rugosidade: 0.095 },
  aluminio: { cor: "#829094", metalico: 0.83, rugosidade: 0.43 },
  cobre: { cor: "#B96742", metalico: 0.93, rugosidade: 0.26 },
  latao: { cor: "#BC9854", metalico: 0.86, rugosidade: 0.24 },
  borracha: { cor: "#151B1E", metalico: 0, rugosidade: 0.97 },
  baquelite: { cor: "#24282A", metalico: 0.03, rugosidade: 0.34 },
  grafite: { cor: "#303A3E", metalico: 0.48, rugosidade: 0.46 },
  mostrador: { cor: "#EFE8D7", metalico: 0, rugosidade: 0.72 },
  tintaClara: { cor: "#F1E7D3", metalico: 0, rugosidade: 0.68 },
  tintaEscura: { cor: "#263337", metalico: 0, rugosidade: 0.76 },
  tintaVermelha: { cor: "#B74634", metalico: 0, rugosidade: 0.57 },
  vidro: { cor: "#C5E7E6", metalico: 0.025, rugosidade: 0.1, opacidade: 0.27 },
  tanque: { cor: "#BCDADD", metalico: 0, rugosidade: 0.15, opacidade: 0.23 },
  agua: { cor: "#8FCBD1", metalico: 0, rugosidade: 0.09, opacidade: 0.12 },
  silicone: { cor: "#D5D8CE", metalico: 0, rugosidade: 0.52 },
  ceramica: { cor: "#F1EADD", metalico: 0, rugosidade: 0.22 },
  cafe: { cor: "#412315", metalico: 0, rugosidade: 0.24 },
  crema: { cor: "#B9844B", metalico: 0, rugosidade: 0.51 },
  bolha: { cor: "#D8AE71", metalico: 0, rugosidade: 0.6 },
  ambar: { cor: "#DD9B36", metalico: 0.04, rugosidade: 0.24 },
} satisfies Record<string, Material>;

// Fonte vetorial segmentada: cada traço é geometria, nunca texto do renderer.
type Traco = readonly [number, number, number, number];
const FONTE: Readonly<Record<string, readonly Traco[]>> = {
  A: [[0, 1, 0.5, 0], [0.5, 0, 1, 1], [0.22, 0.58, 0.78, 0.58]],
  B: [[0, 0, 0, 1], [0, 0, 0.8, 0], [0.8, 0, 1, 0.2], [1, 0.2, 0.8, 0.5], [0, 0.5, 0.8, 0.5], [0.8, 0.5, 1, 0.72], [1, 0.72, 0.8, 1], [0.8, 1, 0, 1]],
  C: [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 1, 1]],
  D: [[0, 0, 0, 1], [0, 0, 0.65, 0], [0.65, 0, 1, 0.25], [1, 0.25, 1, 0.75], [1, 0.75, 0.65, 1], [0.65, 1, 0, 1]],
  E: [[0, 0, 0, 1], [0, 0, 1, 0], [0, 0.5, 0.8, 0.5], [0, 1, 1, 1]],
  F: [[0, 0, 0, 1], [0, 0, 1, 0], [0, 0.5, 0.8, 0.5]],
  G: [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0.55], [1, 0.55, 0.55, 0.55]],
  H: [[0, 0, 0, 1], [1, 0, 1, 1], [0, 0.5, 1, 0.5]],
  I: [[0, 0, 1, 0], [0.5, 0, 0.5, 1], [0, 1, 1, 1]],
  J: [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0.7]],
  K: [[0, 0, 0, 1], [1, 0, 0, 0.55], [0.25, 0.4, 1, 1]],
  L: [[0, 0, 0, 1], [0, 1, 1, 1]],
  M: [[0, 1, 0, 0], [0, 0, 0.5, 0.55], [0.5, 0.55, 1, 0], [1, 0, 1, 1]],
  N: [[0, 1, 0, 0], [0, 0, 1, 1], [1, 1, 1, 0]],
  O: [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]],
  P: [[0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 1, 0.5], [1, 0.5, 0, 0.5]],
  Q: [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0], [0.55, 0.65, 1.1, 1.1]],
  R: [[0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 1, 0.5], [1, 0.5, 0, 0.5], [0.45, 0.5, 1, 1]],
  S: [[1, 0, 0, 0], [0, 0, 0, 0.5], [0, 0.5, 1, 0.5], [1, 0.5, 1, 1], [1, 1, 0, 1]],
  T: [[0, 0, 1, 0], [0.5, 0, 0.5, 1]],
  U: [[0, 0, 0, 1], [0, 1, 1, 1], [1, 1, 1, 0]],
  V: [[0, 0, 0.5, 1], [0.5, 1, 1, 0]],
  W: [[0, 0, 0.2, 1], [0.2, 1, 0.5, 0.45], [0.5, 0.45, 0.8, 1], [0.8, 1, 1, 0]],
  X: [[0, 0, 1, 1], [1, 0, 0, 1]],
  Y: [[0, 0, 0.5, 0.5], [1, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 1]],
  Z: [[0, 0, 1, 0], [1, 0, 0, 1], [0, 1, 1, 1]],
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
  "-": [[0.1, 0.5, 0.9, 0.5]],
  "+": [[0.1, 0.5, 0.9, 0.5], [0.5, 0.1, 0.5, 0.9]],
  ".": [[0.45, 0.93, 0.55, 0.93]],
  "/": [[0, 1, 1, 0]],
  " ": [],
};

function limitar(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function perfilRetangulo(w: number, d: number, raio: number, passos: number): V2[] {
  const r = limitar(raio, 0, Math.min(w, d) / 2);
  if (r === 0) return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const centros: V2[] = [
    [w / 2 - r, d / 2 - r], [-w / 2 + r, d / 2 - r],
    [-w / 2 + r, -d / 2 + r], [w / 2 - r, -d / 2 + r],
  ];
  const pontos: V2[] = [];
  centros.forEach(([cx, cz], canto) => {
    for (let i = 0; i <= passos; i++) {
      const a = canto * PI / 2 + (i / passos) * PI / 2;
      pontos.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  });
  return pontos;
}

function orientacaoEntre(a: V3, b: V3): V3 {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  // Rx(x) Rz(z) transforma +Y na direção desejada, para Euler XYZ.
  return [Math.atan2(dz, dy), 0, -Math.atan2(dx, Math.hypot(dy, dz))];
}

export function montarCena(): Cena {
  return montarCenaComRefs().cena;
}

export function montarCenaComRefs(opcoes: OpcoesEspresso = {}) {
  const cena = new Cena();
  const d: Detalhamento = { ...DETALHE, ...opcoes.detalhe };
  d.segmentos = Math.round(limitar(d.segmentos, 16, 128));
  d.segmentosOptica = Math.round(limitar(d.segmentosOptica, 24, 160));
  d.segmentosTubos = Math.round(limitar(d.segmentosTubos, 12, 64));
  d.pontosArco = Math.round(limitar(d.pontosArco, 3, 16));
  d.estriasRegistro = Math.round(limitar(d.estriasRegistro, 12, 96));
  d.barrasBandeja = Math.round(limitar(d.barrasBandeja, 9, 49));
  d.barrasTeto = Math.round(limitar(d.barrasTeto, 7, 31));
  d.marcasManometro = 8 * Math.round(limitar(d.marcasManometro, 16, 80) / 8);

  const acoplamentos: AcoplamentoDeclarado[] = [];
  const interferenciasIntencionais: Array<{ pai: No; filho: No; motivo: string }> = [];

  const plano = (no: No, ponto: V3, normal: V3): PlanoLocal => ({ no, ponto, normal });
  const topo = (no: No, h: number) => plano(no, [0, h / 2, 0], [0, 1, 0]);
  const base = (no: No, h: number) => plano(no, [0, -h / 2, 0], [0, -1, 0]);
  function contato(nome: string, a: PlanoLocal, b: PlanoLocal) {
    acoplamentos.push({ nome, tipo: "contato", a, b });
  }
  function pivo(nome: string, a: EixoLocal, b: EixoLocal) {
    acoplamentos.push({ nome, tipo: "pivo", a, b });
  }
  function embutir(pai: No, filho: No, motivo: string) {
    interferenciasIntencionais.push({ pai, filho, motivo });
  }

  function grupo(pai: Pai, nome: string, pos: V3 = ORIGEM, rot: V3 = SEM_ROTACAO): No {
    return pai.criar("grupo", {}, {
      nome, transform: { posicao: [...pos], rotacao: [...rot] },
    });
  }

  function extrudado(
    pai: Pai, nome: string, perfil: V2[], h: number, pos: V3, mat: Material,
    rot: V3 = SEM_ROTACAO,
  ): No {
    return pai.criar("extrude", { perfil, altura: h }, {
      nome, transform: { posicao: [...pos], rotacao: [...rot] }, material: { ...mat },
    });
  }

  function bloco(
    pai: Pai, nome: string, w: number, h: number, profundidade: number,
    pos: V3, mat: Material, raio = 0, rot: V3 = SEM_ROTACAO,
  ): No {
    return extrudado(pai, nome, perfilRetangulo(w, profundidade, raio, d.pontosArco), h, pos, mat, rot);
  }

  function torneado(
    pai: Pai, nome: string, perfil: V2[], pos: V3, mat: Material,
    segmentos = d.segmentos, rot: V3 = SEM_ROTACAO,
  ): No {
    return pai.criar("lathe", { perfil, segmentos }, {
      nome, transform: { posicao: [...pos], rotacao: [...rot] }, material: { ...mat },
    });
  }

  function cilindro(
    pai: Pai, nome: string, r: number, h: number, pos: V3, mat: Material,
    chanfro = 0, rot: V3 = SEM_ROTACAO, segmentos = d.segmentos,
  ): No {
    const c = limitar(chanfro, 0, Math.min(r * 0.45, h * 0.45));
    const perfil: V2[] = c > 0
      ? [[0, -h / 2], [r - c, -h / 2], [r, -h / 2 + c], [r, h / 2 - c], [r - c, h / 2], [0, h / 2], [0, -h / 2]]
      : [[0, -h / 2], [r, -h / 2], [r, h / 2], [0, h / 2], [0, -h / 2]];
    return torneado(pai, nome, perfil, pos, mat, segmentos, rot);
  }

  function anel(
    pai: Pai, nome: string, interno: number, externo: number, h: number,
    pos: V3, mat: Material, rot: V3 = SEM_ROTACAO, segmentos = d.segmentos,
  ): No {
    // Bore verdadeiro, aberto nas duas pontas. Nada de disco/tampão de furo.
    return torneado(pai, nome, [
      [interno, -h / 2], [externo, -h / 2], [externo, h / 2],
      [interno, h / 2], [interno, -h / 2],
    ], pos, mat, segmentos, rot);
  }

  function argola(
    pai: Pai, nome: string, raio: number, tubo: number, pos: V3, mat: Material,
    rot: V3 = SEM_ROTACAO,
  ): No {
    // Torus expresso como lathe: utiliza somente o schema documentado.
    const perfil: V2[] = [];
    const n = d.miudezas ? 20 : 12;
    for (let i = 0; i <= n; i++) {
      const a = TAU * i / n;
      perfil.push([raio + tubo * Math.cos(a), tubo * Math.sin(a)]);
    }
    return torneado(pai, nome, perfil, pos, mat, d.segmentos, rot);
  }

  function poligonoNoPlano(pai: Pai, nome: string, pts: V2[], h: number, pos: V3, mat: Material): No {
    // Recentra manualmente X/Z. A posição do desenho não muda com seu envelope.
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    return extrudado(pai, nome, pts.map(([x, z]) => [x - cx, z - cz]), h,
      [pos[0] + cx, pos[1], pos[2] + cz], mat);
  }

  function haste(pai: Pai, nome: string, a: V3, b: V3, r: number, mat: Material): No {
    const h = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    return cilindro(pai, nome, r, h,
      [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], mat,
      0, orientacaoEntre(a, b), d.segmentosTubos);
  }

  function hexagono(pai: Pai, nome: string, r: number, h: number, pos: V3, mat: Material, rot: V3 = SEM_ROTACAO): No {
    const perfil: V2[] = Array.from({ length: 6 }, (_, i) => [r * Math.cos(i * TAU / 6), r * Math.sin(i * TAU / 6)]);
    return extrudado(pai, nome, perfil, h, pos, mat, rot);
  }

  function traco(
    pai: No, nome: string, a: V2, b: V2, yFace: number,
    largura: number, mat: Material, h = TINTA, segmentado = false,
  ): No {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const comprimento = Math.max(largura * 0.35, Math.hypot(dx, dz) - (segmentado ? largura : 0));
    const no = bloco(pai, nome, comprimento, h, largura,
      [(a[0] + b[0]) / 2, yFace + h / 2, (a[1] + b[1]) / 2], mat, 0,
      [0, -Math.atan2(dz, dx), 0]);
    contato(`${nome}_relevo`, plano(pai, [0, yFace, 0], [0, 1, 0]), base(no, h));
    return no;
  }

  function texto(pai: No, nome: string, conteudo: string, altura: number, centro: V3, mat = MAT.tintaClara) {
    if (!d.inscricoes) return;
    const letras = conteudo.toUpperCase();
    const gw = altura * 0.6, passo = altura * 0.82;
    const total = Math.max(0, letras.length - 1) * passo + gw;
    const x0 = centro[0] - total / 2, z0 = centro[2] - altura / 2;
    for (let i = 0; i < letras.length; i++) {
      const segmentos = FONTE[letras[i]] ?? [];
      segmentos.forEach(([x1, z1, x2, z2], j) => {
        traco(pai, `${nome}_${i}_${j}`,
          [x0 + i * passo + x1 * gw, z0 + z1 * altura],
          [x0 + i * passo + x2 * gw, z0 + z2 * altura],
          centro[1], altura * 0.11, mat, TINTA, true);
      });
    }
  }

  function parafuso(pai: No, nome: string, posNaFace: V3, r = 0.0025): No {
    const H = 0.0012;
    const cabeca = cilindro(pai, nome, r, H,
      [posNaFace[0], posNaFace[1] + H / 2, posNaFace[2]], MAT.inox, 0.00025,
      SEM_ROTACAO, d.segmentosTubos);
    contato(`${nome}_assento`, plano(pai, [0, posNaFace[1], 0], [0, 1, 0]), base(cabeca, H));
    if (d.miudezas) {
      // Fenda representada por marcador raso; não é um corte fictício.
      traco(cabeca, `${nome}_fenda`, [-r * 0.62, 0], [r * 0.62, 0], H / 2, 0.00045, MAT.tintaEscura, 2e-5);
    }
    return cabeca;
  }

  function painel(
    pai: No, nome: string, w: number, altura: number, esp: number,
    pos: V3, rot: V3, mat: Material, raio = 0.008,
  ) {
    // +Y local sempre aponta para fora; X/Z são o plano de autoria.
    const referencial = grupo(pai, nome, pos, rot);
    const chapa = bloco(referencial, `${nome}_chapa`, w, esp, altura, [0, esp / 2, 0], mat, raio);
    return { grupo: referencial, chapa, esp, w, altura };
  }

  function circuito(
    pai: No, nome: string, pontos: V3[], raio: number, material: Material,
    materialConexao = MAT.latao, ladoConexao = 0.012,
  ) {
    // Trajetos ortogonais. Cada tubo termina na FACE da conexão, sem atravessá-la.
    const g = grupo(pai, nome);
    const metade = ladoConexao / 2;
    const conexoes = pontos.map((p, i) => bloco(g, `${nome}_conexao_${i}`,
      ladoConexao, ladoConexao, ladoConexao, p, materialConexao, 0.001));
    const tubos: No[] = [];
    for (let i = 0; i < pontos.length - 1; i++) {
      const a = pontos[i], b = pontos[i + 1];
      const delta: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l = Math.hypot(...delta);
      const u: V3 = [delta[0] / l, delta[1] / l, delta[2] / l];
      const inicio: V3 = [a[0] + u[0] * metade, a[1] + u[1] * metade, a[2] + u[2] * metade];
      const fim: V3 = [b[0] - u[0] * metade, b[1] - u[1] * metade, b[2] - u[2] * metade];
      const tubo = haste(g, `${nome}_tubo_${i}`, inicio, fim, raio, material);
      tubos.push(tubo);
      const h = l - ladoConexao;
      contato(`${nome}_entrada_${i}`,
        plano(conexoes[i], [u[0] * metade, u[1] * metade, u[2] * metade], u), base(tubo, h));
      contato(`${nome}_saida_${i}`, topo(tubo, h),
        plano(conexoes[i + 1], [-u[0] * metade, -u[1] * metade, -u[2] * metade], [-u[0], -u[1], -u[2]]));
    }
    return { grupo: g, conexoes, tubos, ladoConexao };
  }

  // -------------------------------------------------------------------------
  // 1. Envelope estrutural. Todas as alturas de apoio derivam destas âncoras.
  // -------------------------------------------------------------------------

  const raiz = grupo(cena, "SNAPLE_E02");
  const W_BASE = 0.320, D_BASE = 0.360;
  const H_PE = 0.016, H_BASE = 0.014, H_PISO = 0.006;
  const Y_BASE_INF = H_PE;
  const Y_BASE_SUP = Y_BASE_INF + H_BASE;
  const Y_PISO = Y_BASE_SUP + H_PISO;
  const Y_TETO_INF = 0.345;
  const H_CORPO = Y_TETO_INF - Y_PISO;
  const Y_CORPO_C = (Y_PISO + Y_TETO_INF) / 2;
  const X_LATERAL = 0.147;
  const Z_TRAS = -0.158;
  const Z_FRENTE = 0.067;
  const D_CORPO = Z_FRENTE - Z_TRAS;
  const Z_CORPO_C = (Z_FRENTE + Z_TRAS) / 2;

  const pes: No[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pes.push(torneado(raiz, `pe_${sx}_${sz}`, [
      [0, -H_PE / 2], [0.013, -H_PE / 2], [0.016, -H_PE / 2 + 0.003],
      [0.016, H_PE / 2 - 0.003], [0.0125, H_PE / 2], [0, H_PE / 2], [0, -H_PE / 2],
    ], [sx * 0.127, H_PE / 2, sz * 0.146], MAT.borracha, d.segmentosTubos));
  }
  const baseMaquina = bloco(raiz, "base_pintada", W_BASE, H_BASE, D_BASE,
    [0, (Y_BASE_INF + Y_BASE_SUP) / 2, 0], MAT.pinturaEscura, 0.015);
  pes.forEach((pe, i) => contato(`pe_base_${i}`, topo(pe, H_PE), base(baseMaquina, H_BASE)));
  const piso = bloco(raiz, "chassi_inox", W_BASE - 0.006, H_PISO, D_BASE - 0.006,
    [0, Y_BASE_SUP + H_PISO / 2, 0], MAT.inox, 0.013);
  contato("base_chassi", topo(baseMaquina, H_BASE), base(piso, H_PISO));

  const montantes: No[] = [];
  for (const sx of [-1, 1]) for (const z of [Z_TRAS + 0.008, Z_FRENTE - 0.008]) {
    const n = bloco(raiz, `montante_${sx}_${z}`, 0.009, H_CORPO, 0.010,
      [sx * (X_LATERAL - 0.008), Y_CORPO_C, z], MAT.aluminio, 0.0015);
    montantes.push(n);
    contato(`apoio_montante_${sx}_${z}`, topo(piso, H_PISO), base(n, H_CORPO));
  }

  const lateralE = painel(raiz, "lateral_esquerda", D_CORPO, H_CORPO, 0.004,
    [-X_LATERAL, Y_CORPO_C, Z_CORPO_C], ESQUERDA, MAT.pintura, 0.016);
  contato("lateralE_chassi", topo(piso, H_PISO),
    plano(lateralE.chapa, [0, 0, H_CORPO / 2], [0, 0, 1]));
  texto(lateralE.chapa, "marca_lateral", "SNAPLE", 0.009, [0, lateralE.esp / 2, -0.014]);
  texto(lateralE.chapa, "modelo_lateral", "E-02", 0.004, [0, lateralE.esp / 2, 0.004]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parafuso(lateralE.chapa, `lateralE_parafuso_${sx}_${sz}`,
      [sx * (D_CORPO / 2 - 0.020), lateralE.esp / 2, sz * (H_CORPO / 2 - 0.024)]);
  }

  const traseira = painel(raiz, "traseira", 0.294, H_CORPO, 0.003,
    [0, Y_CORPO_C, Z_TRAS], TRASEIRA, MAT.pinturaEscura, 0.010);
  contato("traseira_chassi", topo(piso, H_PISO),
    plano(traseira.chapa, [0, 0, H_CORPO / 2], [0, 0, 1]));
  texto(traseira.chapa, "serie", "SNAPLE E-02", 0.004, [0, traseira.esp / 2, 0.090]);
  texto(traseira.chapa, "especificacao", "230 V / 1200 W", 0.0025, [0, traseira.esp / 2, 0.100]);

  // Conector traseiro realmente aberto, composto de bordas e um fundo recuado.
  const tomada = grupo(traseira.chapa, "tomada", [0, traseira.esp / 2, 0.124]);
  const W_TOM = 0.034, D_TOM = 0.024, T_TOM = 0.003, H_TOM = 0.009;
  const fundoTomada = bloco(tomada, "tomada_fundo", W_TOM, 0.001, D_TOM,
    [0, 0.0005, 0], MAT.borracha, 0.002);
  contato("tomada_assento", topo(traseira.chapa, traseira.esp), base(fundoTomada, 0.001));
  for (const s of [-1, 1]) {
    bloco(tomada, `tomada_borda_x_${s}`, T_TOM, H_TOM, D_TOM,
      [s * (W_TOM - T_TOM) / 2, 0.001 + H_TOM / 2, 0], MAT.baquelite);
    bloco(tomada, `tomada_borda_z_${s}`, W_TOM - 2 * T_TOM, H_TOM, T_TOM,
      [0, 0.001 + H_TOM / 2, s * (D_TOM - T_TOM) / 2], MAT.baquelite);
  }
  for (let i = 0; i < 3; i++) {
    const pino = bloco(fundoTomada, `tomada_pino_${i}`, 0.004, 0.005, 0.0015,
      [(i - 1) * 0.008, 0.0005 + 0.0025, i === 1 ? -0.004 : 0.003], MAT.latao);
    contato(`tomada_pino_assento_${i}`, topo(fundoTomada, 0.001), base(pino, 0.005));
  }

  const tampaLateral = opcoes.lateralFechada
    ? painel(raiz, "tampa_lateral_direita", D_CORPO, H_CORPO, 0.004,
      [X_LATERAL, Y_CORPO_C, Z_CORPO_C], DIREITA, MAT.pintura, 0.016)
    : null;
  if (tampaLateral) {
    contato("lateralD_chassi", topo(piso, H_PISO),
      plano(tampaLateral.chapa, [0, 0, H_CORPO / 2], [0, 0, 1]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parafuso(tampaLateral.chapa, `lateralD_parafuso_${sx}_${sz}`,
        [sx * (D_CORPO / 2 - 0.020), 0.002, sz * (H_CORPO / 2 - 0.024)]);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Tampa superior removível: bandeja de xícaras e guarda-corpo.
  // -------------------------------------------------------------------------

  const tampaSuperior = grupo(raiz, "tampa_superior", [0, Y_TETO_INF, Z_CORPO_C]);
  const H_TAMPA = 0.004;
  const teto = bloco(tampaSuperior, "teto_inox", 0.304, H_TAMPA, D_CORPO + 0.004,
    [0, H_TAMPA / 2, 0], MAT.inox, 0.012);
  montantes.forEach((n, i) => contato(`montante_teto_${i}`, topo(n, H_CORPO), base(teto, H_TAMPA)));
  contato("lateralE_teto", plano(lateralE.chapa, [0, 0, -H_CORPO / 2], [0, 0, -1]), base(teto, H_TAMPA));
  contato("traseira_teto", plano(traseira.chapa, [0, 0, -H_CORPO / 2], [0, 0, -1]), base(teto, H_TAMPA));
  for (let i = 0; i < d.barrasTeto; i++) {
    const x = -0.111 + 0.222 * i / (d.barrasTeto - 1);
    const barra = bloco(teto, `teto_regua_${i}`, 0.0038, 0.0015, 0.164,
      [x, H_TAMPA / 2 + 0.00075, 0], MAT.grafite, 0.0015);
    contato(`teto_regua_apoio_${i}`, topo(teto, H_TAMPA), base(barra, 0.0015));
  }
  const Y_RAIL = H_TAMPA + 0.024;
  const X_RAIL = 0.132, Z_RAIL = D_CORPO / 2 - 0.020;
  const H_RAIL = 0.005;
  const postes: No[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const poste = cilindro(tampaSuperior, `teto_poste_${sx}_${sz}`, 0.003, 0.024,
      [sx * X_RAIL, H_TAMPA + 0.012, sz * Z_RAIL], MAT.cromo, 0.0003,
      SEM_ROTACAO, d.segmentosTubos);
    postes.push(poste);
    contato(`teto_poste_apoio_${sx}_${sz}`, topo(teto, H_TAMPA), base(poste, 0.024));
  }
  for (const sz of [-1, 1]) {
    const travessa = bloco(tampaSuperior, `teto_guarda_transversal_${sz}`,
      2 * X_RAIL + 0.006, H_RAIL, 0.006, [0, Y_RAIL + H_RAIL / 2, sz * Z_RAIL], MAT.cromo, 0.0025);
    const p0 = sz < 0 ? postes[0] : postes[1];
    const p1 = sz < 0 ? postes[2] : postes[3];
    contato(`guarda_${sz}_pe0`, topo(p0, 0.024), base(travessa, H_RAIL));
    contato(`guarda_${sz}_pe1`, topo(p1, 0.024), base(travessa, H_RAIL));
  }
  for (const sx of [-1, 1]) {
    bloco(tampaSuperior, `teto_guarda_lateral_${sx}`, 0.006, H_RAIL, 2 * Z_RAIL - 0.006,
      [sx * X_RAIL, Y_RAIL + H_RAIL / 2, 0], MAT.cromo, 0.002);
  }

  // -------------------------------------------------------------------------
  // 3. Fachada, manômetro, botões e registro serrilhado.
  // -------------------------------------------------------------------------

  const Y_FASCIA_INF = 0.249;
  const H_FASCIA = Y_TETO_INF - Y_FASCIA_INF;
  const fachada = painel(raiz, "fachada", 0.294, H_FASCIA, 0.008,
    [0, (Y_FASCIA_INF + Y_TETO_INF) / 2, Z_FRENTE], FRENTE, MAT.pintura, 0.012);
  contato("fachada_teto", plano(fachada.chapa, [0, 0, -H_FASCIA / 2], [0, 0, -1]), base(teto, H_TAMPA));
  const Y_FACE_F = fachada.esp / 2;
  texto(fachada.chapa, "marca_frontal", "SNAPLE", 0.0062, [-0.084, Y_FACE_F, -0.028]);
  texto(fachada.chapa, "modelo_frontal", "E-02", 0.0030, [-0.084, Y_FACE_F, -0.015]);
  texto(fachada.chapa, "legenda_liga", "LIGA", 0.0025, [-0.108, Y_FACE_F, 0.035]);
  texto(fachada.chapa, "legenda_cafe", "CAFE", 0.0025, [-0.068, Y_FACE_F, 0.035]);
  texto(fachada.chapa, "legenda_vapor", "VAPOR", 0.0025, [0.105, Y_FACE_F, 0.035]);

  function botao(nome: string, x: number, matCentro: Material) {
    const suporte = cilindro(fachada.chapa, `${nome}_base`, 0.010, 0.0025,
      [x, Y_FACE_F + 0.00125, 0.013], MAT.cromo, 0.0005);
    contato(`${nome}_fachada`, topo(fachada.chapa, fachada.esp), base(suporte, 0.0025));
    const corpo = cilindro(suporte, `${nome}_corpo`, 0.0079, 0.003,
      [0, 0.00125 + 0.0015, 0], MAT.baquelite, 0.00065);
    contato(`${nome}_corpo_apoio`, topo(suporte, 0.0025), base(corpo, 0.003));
    const centro = cilindro(corpo, `${nome}_centro`, 0.0037, 0.00025,
      [0, 0.0015 + 0.000125, 0], matCentro, 0.00008,
      SEM_ROTACAO, d.segmentosTubos);
    contato(`${nome}_centro_apoio`, topo(corpo, 0.003), base(centro, 0.00025));
    return corpo;
  }
  const botaoLiga = botao("botao_liga", -0.108, MAT.ambar);
  const botaoCafe = botao("botao_cafe", -0.068, MAT.inox);
  // O centro âmbar é material opaco colorido, não luz/emissão.

  const medidor = grupo(fachada.chapa, "manometro", [0.015, Y_FACE_F, -0.002]);
  const H_MOLDURA = 0.006, H_LABIO = 0.0015;
  const moldura = anel(medidor, "manometro_carcaça", 0.027, 0.033, H_MOLDURA,
    [0, H_MOLDURA / 2, 0], MAT.cromo, SEM_ROTACAO, d.segmentosOptica);
  contato("manometro_fachada", topo(fachada.chapa, fachada.esp), base(moldura, H_MOLDURA));
  const H_MOSTRADOR = 0.0017;
  const mostrador = cilindro(medidor, "manometro_mostrador", 0.02695, H_MOSTRADOR,
    [0, H_MOSTRADOR / 2, 0], MAT.mostrador, 0, SEM_ROTACAO, d.segmentosOptica);
  contato("mostrador_fachada", topo(fachada.chapa, fachada.esp), base(mostrador, H_MOSTRADOR));

  for (let i = 0; i <= d.marcasManometro; i++) {
    const t = i / d.marcasManometro;
    const ang = -3 * PI / 4 + t * 3 * PI / 2;
    const grande = i % (d.marcasManometro / 8) === 0;
    const r0 = grande ? 0.0187 : 0.0206, r1 = 0.023;
    traco(mostrador, `manometro_marca_${i}`,
      [Math.sin(ang) * r0, -Math.cos(ang) * r0],
      [Math.sin(ang) * r1, -Math.cos(ang) * r1],
      H_MOSTRADOR / 2, grande ? 0.0005 : 0.00028,
      t > 0.75 ? MAT.tintaVermelha : MAT.tintaEscura);
  }
  for (const v of [0, 4, 8, 12, 16]) {
    const a = -3 * PI / 4 + (v / 16) * 3 * PI / 2;
    texto(mostrador, `manometro_numero_${v}`, String(v), 0.0027,
      [0.0142 * Math.sin(a), H_MOSTRADOR / 2, -0.0142 * Math.cos(a)], MAT.tintaEscura);
  }
  texto(mostrador, "manometro_unidade", "BAR", 0.0027, [0, H_MOSTRADOR / 2, 0.009], MAT.tintaEscura);
  const H_EIXO = 0.0011;
  const eixoPonteiro = cilindro(mostrador, "manometro_eixo", 0.0014, H_EIXO,
    [0, H_MOSTRADOR / 2 + H_EIXO / 2, 0], MAT.latao, 0, SEM_ROTACAO, d.segmentosTubos);
  contato("eixo_mostrador", topo(mostrador, H_MOSTRADOR), base(eixoPonteiro, H_EIXO));
  let pressaoAtual = limitar(opcoes.pressao ?? 9, 0, 16);
  const anguloPressao = (v: number) => -3 * PI / 4 + (v / 16) * 3 * PI / 2;
  const ponteiroManometro = grupo(eixoPonteiro, "ponteiro_movel", [0, H_EIXO / 2, 0],
    [0, -anguloPressao(pressaoAtual), 0]);
  pivo("pivo_ponteiro", { no: eixoPonteiro, ponto: [0, H_EIXO / 2, 0], eixo: [0, 1, 0] },
    { no: ponteiroManometro, ponto: [0, 0, 0], eixo: [0, 1, 0] });
  const H_AGULHA = 0.00018;
  poligonoNoPlano(ponteiroManometro, "agulha", [
    [-0.0007, 0.004], [-0.0007, -0.012], [0, -0.021],
    [0.0007, -0.012], [0.0007, 0.004],
  ], H_AGULHA, [0, H_AGULHA / 2, 0], MAT.tintaVermelha);
  cilindro(ponteiroManometro, "agulha_cubo", 0.0020, 0.0007,
    [0, H_AGULHA + 0.00035, 0], MAT.grafite, 0.00015, SEM_ROTACAO, d.segmentosTubos);

  const H_VIDRO = 0.0007;
  const vidroManometro = cilindro(medidor, "manometro_vidro", 0.02695, H_VIDRO,
    [0, H_MOLDURA - H_VIDRO / 2, 0], MAT.vidro, 0.00015, SEM_ROTACAO, d.segmentosOptica);
  const labio = anel(medidor, "manometro_labio", 0.0259, 0.033, H_LABIO,
    [0, H_MOLDURA + H_LABIO / 2, 0], MAT.inox, SEM_ROTACAO, d.segmentosOptica);
  contato("moldura_labio", topo(moldura, H_MOLDURA), base(labio, H_LABIO));
  contato("vidro_labio", topo(vidroManometro, H_VIDRO), base(labio, H_LABIO));

  const H_COLAR = 0.003, H_REGISTRO = 0.019;
  const colarRegistro = cilindro(fachada.chapa, "registro_colar", 0.0195, H_COLAR,
    [0.105, Y_FACE_F + H_COLAR / 2, 0.003], MAT.cromo, 0.00045);
  contato("registro_fachada", topo(fachada.chapa, fachada.esp), base(colarRegistro, H_COLAR));
  const registroVapor = grupo(colarRegistro, "registro_vapor_movel", [0, H_COLAR / 2, 0], [0, -0.35, 0]);
  pivo("pivo_registro", { no: colarRegistro, ponto: [0, H_COLAR / 2, 0], eixo: [0, 1, 0] },
    { no: registroVapor, ponto: [0, 0, 0], eixo: [0, 1, 0] });
  const R_REGISTRO = 0.0177;
  const corpoRegistro = cilindro(registroVapor, "registro_baquelite", R_REGISTRO, H_REGISTRO,
    [0, H_REGISTRO / 2, 0], MAT.baquelite, 0.0012);
  contato("registro_assento", topo(colarRegistro, H_COLAR), base(corpoRegistro, H_REGISTRO));
  for (let i = 0; i < d.estriasRegistro; i++) {
    const a = i * TAU / d.estriasRegistro;
    const e = 0.0011;
    const dente = bloco(corpoRegistro, `registro_estria_${i}`,
      TAU * R_REGISTRO / d.estriasRegistro * 0.43, H_REGISTRO - 0.004, e,
      [R_REGISTRO * Math.sin(a), 0, R_REGISTRO * Math.cos(a)], MAT.baquelite, 0,
      [0, a, 0]);
    embutir(corpoRegistro, dente, "Serrilha pai-filho: metade dos 1,1 mm de espessura embutida no registro.");
  }
  const H_TAMPA_REG = 0.0012;
  const tampaRegistro = cilindro(corpoRegistro, "registro_tampa_inox", 0.0129, H_TAMPA_REG,
    [0, H_REGISTRO / 2 + H_TAMPA_REG / 2, 0], MAT.inox, 0.00025);
  contato("registro_tampa", topo(corpoRegistro, H_REGISTRO), base(tampaRegistro, H_TAMPA_REG));
  traco(tampaRegistro, "registro_indice", [0, -0.004], [0, -0.010], H_TAMPA_REG / 2, 0.0011, MAT.tintaEscura);
  texto(fachada.chapa, "registro_menos", "-", 0.003, [0.079, Y_FACE_F, -0.021]);
  texto(fachada.chapa, "registro_mais", "+", 0.003, [0.130, Y_FACE_F, -0.021]);

  // Espelho inferior, sem uma chapa lateral direita escondendo o mecanismo.
  const Y_ESPELHO_INF = 0.088;
  const H_ESPELHO = Y_FASCIA_INF - Y_ESPELHO_INF;
  const espelho = painel(raiz, "espelho_extracao", 0.267, H_ESPELHO, 0.004,
    [0, (Y_ESPELHO_INF + Y_FASCIA_INF) / 2, Z_FRENTE], FRENTE, MAT.inox, 0.007);
  contato("espelho_fachada",
    plano(espelho.chapa, [0, 0, -H_ESPELHO / 2], [0, 0, -1]),
    plano(fachada.chapa, [0, 0, H_FASCIA / 2], [0, 0, 1]));

  // -------------------------------------------------------------------------
  // 4. Cabeçote e porta-filtro móvel, com cabo de baquelite e duas saídas.
  // -------------------------------------------------------------------------

  const X_GRUPO = -0.030, Z_GRUPO = 0.119;
  const Y_CABECOTE_TOP = Y_FASCIA_INF;
  const H_CABECOTE = 0.036, H_JUNTA = 0.003, H_CESTO = 0.026;
  const grupoExtracao = grupo(raiz, "grupo_extracao", [X_GRUPO, Y_CABECOTE_TOP, Z_GRUPO]);
  const cabecote = torneado(grupoExtracao, "cabecote_cromado", [
    [0, -H_CABECOTE / 2], [0.034, -H_CABECOTE / 2], [0.042, -0.014],
    [0.045, -0.008], [0.045, 0.010], [0.041, H_CABECOTE / 2],
    [0, H_CABECOTE / 2], [0, -H_CABECOTE / 2],
  ], [0, -H_CABECOTE / 2, 0], MAT.cromo, d.segmentosOptica);
  const Z_ESPELHO_FORA = Z_FRENTE + espelho.esp;
  const Z_BRACO_FIM = Z_GRUPO - 0.036;
  const D_BRACO = Z_BRACO_FIM - Z_ESPELHO_FORA;
  const braco = bloco(cabecote, "cabecote_braco", 0.064, 0.022, D_BRACO,
    [0, 0.004, (Z_BRACO_FIM + Z_ESPELHO_FORA) / 2 - Z_GRUPO], MAT.inox, 0.001);
  embutir(cabecote, braco, "Braço de fundição embutido no dorso do cabeçote; união pai-filho intencional.");
  contato("cabecote_espelho", topo(espelho.chapa, espelho.esp),
    plano(braco, [0, 0, -D_BRACO / 2], [0, 0, -1]));
  const junta = anel(grupoExtracao, "junta_grupo", 0.023, 0.037, H_JUNTA,
    [0, -H_CABECOTE - H_JUNTA / 2, 0], MAT.borracha);
  contato("cabecote_junta", base(cabecote, H_CABECOTE), topo(junta, H_JUNTA));
  const portaFiltro = grupo(grupoExtracao, "porta_filtro_movel", [0, -H_CABECOTE - H_JUNTA, 0], [0, -0.26, 0]);
  pivo("baioneta_portafiltro", { no: junta, ponto: [0, -H_JUNTA / 2, 0], eixo: [0, 1, 0] },
    { no: portaFiltro, ponto: [0, 0, 0], eixo: [0, 1, 0] });
  const cesto = torneado(portaFiltro, "portafiltro_taca", [
    [0, -H_CESTO / 2], [0.023, -H_CESTO / 2], [0.031, -0.009],
    [0.039, 0.006], [0.040, 0.010], [0.040, H_CESTO / 2],
    [0.0355, H_CESTO / 2], [0.0345, 0.007], [0.025, -0.008],
    [0, -0.008], [0, -H_CESTO / 2],
  ], [0, -H_CESTO / 2, 0], MAT.cromo, d.segmentosOptica);
  contato("junta_portafiltro", base(junta, H_JUNTA), topo(cesto, H_CESTO));

  const H_PONTE_CABO = 0.032;
  const hasteCabo = cilindro(cesto, "portafiltro_ponte_cabo", 0.0078, H_PONTE_CABO,
    [0, H_CESTO / 2 - 0.010, 0.045], MAT.inox, 0.0005, FRENTE, d.segmentosTubos);
  embutir(cesto, hasteCabo, "Espiga do cabo entra na parede do porta-filtro; encaixe pai-filho, não ramo solto.");
  const L_CABO = 0.112;
  const cabo = torneado(hasteCabo, "portafiltro_cabo", [
    [0, -L_CABO / 2], [0.010, -L_CABO / 2], [0.0125, -0.048],
    [0.0135, -0.028], [0.016, 0.027], [0.0155, 0.049],
    [0.012, L_CABO / 2], [0, L_CABO / 2], [0, -L_CABO / 2],
  ], [0, H_PONTE_CABO / 2 + L_CABO / 2, 0], MAT.baquelite, d.segmentos);
  contato("espiga_cabo", topo(hasteCabo, H_PONTE_CABO), base(cabo, L_CABO));
  const fimCabo = cilindro(cabo, "portafiltro_medalhao", 0.009, 0.0011,
    [0, L_CABO / 2 + 0.00055, 0], MAT.pintura, 0.0002, SEM_ROTACAO, d.segmentosTubos);
  contato("cabo_medalhao", topo(cabo, L_CABO), base(fimCabo, 0.0011));

  const H_DISTRIBUIDOR = 0.006;
  const distribuidor = bloco(portaFiltro, "portafiltro_distribuidor", 0.037, H_DISTRIBUIDOR, 0.012,
    [0, -H_CESTO - H_DISTRIBUIDOR / 2, 0], MAT.cromo, 0.004);
  contato("cesto_distribuidor", base(cesto, H_CESTO), topo(distribuidor, H_DISTRIBUIDOR));
  const H_BICO = 0.014;
  for (const s of [-1, 1]) {
    const bico = anel(portaFiltro, `portafiltro_bico_${s}`, 0.0030, 0.0049, H_BICO,
      [s * 0.0125, -H_CESTO - H_DISTRIBUIDOR - H_BICO / 2, 0], MAT.cromo,
      SEM_ROTACAO, d.segmentosTubos);
    contato(`distribuidor_bico_${s}`, base(distribuidor, H_DISTRIBUIDOR), topo(bico, H_BICO));
  }

  // -------------------------------------------------------------------------
  // 5. Bandeja: fundo, quatro paredes e grelha com vãos reais.
  // -------------------------------------------------------------------------

  const bandeja = grupo(raiz, "bandeja", [0, Y_PISO, 0.122]);
  const W_BAND = 0.278, D_BAND = 0.108;
  const H_FUNDO_BAND = 0.002, H_PAREDE = 0.023, T_PAREDE = 0.003;
  const fundoBandeja = bloco(bandeja, "bandeja_fundo", W_BAND, H_FUNDO_BAND, D_BAND,
    [0, H_FUNDO_BAND / 2, 0], MAT.grafite);
  contato("bandeja_chassi", topo(piso, H_PISO), base(fundoBandeja, H_FUNDO_BAND));
  for (const s of [-1, 1]) {
    const transversal = bloco(bandeja, `bandeja_parede_z_${s}`, W_BAND, H_PAREDE, T_PAREDE,
      [0, H_FUNDO_BAND + H_PAREDE / 2, s * (D_BAND - T_PAREDE) / 2], MAT.inox);
    const lateral = bloco(bandeja, `bandeja_parede_x_${s}`, T_PAREDE, H_PAREDE, D_BAND - 2 * T_PAREDE,
      [s * (W_BAND - T_PAREDE) / 2, H_FUNDO_BAND + H_PAREDE / 2, 0], MAT.inox);
    contato(`bandeja_parede_z_assento_${s}`, topo(fundoBandeja, H_FUNDO_BAND), base(transversal, H_PAREDE));
    contato(`bandeja_parede_x_assento_${s}`, topo(fundoBandeja, H_FUNDO_BAND), base(lateral, H_PAREDE));
  }
  const H_APOIO_GRELHA = 0.017, H_GRELHA = 0.003;
  const Y_GRELHA_INF = H_FUNDO_BAND + H_APOIO_GRELHA;
  const Y_GRELHA_SUP = Y_PISO + Y_GRELHA_INF + H_GRELHA;
  const apoiosGrelha: No[] = [];
  for (const s of [-1, 1]) {
    const apoio = bloco(bandeja, `grelha_apoio_${s}`, W_BAND - 2 * T_PAREDE, H_APOIO_GRELHA, 0.005,
      [0, H_FUNDO_BAND + H_APOIO_GRELHA / 2, s * 0.044], MAT.grafite);
    apoiosGrelha.push(apoio);
    contato(`grelha_apoio_fundo_${s}`, topo(fundoBandeja, H_FUNDO_BAND), base(apoio, H_APOIO_GRELHA));
  }
  const barrasGrelha: No[] = [];
  for (let i = 0; i < d.barrasBandeja; i++) {
    const x = -0.128 + 0.256 * i / (d.barrasBandeja - 1);
    const barra = bloco(bandeja, `grelha_barra_${i}`, 0.0034, H_GRELHA, 0.098,
      [x, Y_GRELHA_INF + H_GRELHA / 2, 0], MAT.inox, 0.0013);
    barrasGrelha.push(barra);
    apoiosGrelha.forEach((apoio, j) => contato(`grelha_barra_${i}_apoio_${j}`, topo(apoio, H_APOIO_GRELHA), base(barra, H_GRELHA)));
  }

  // -------------------------------------------------------------------------
  // 6. Xícara cerâmica oca e superfície de espresso, apoiada na grelha.
  // -------------------------------------------------------------------------

  let xicara: No | null = null;
  if (opcoes.comXicara !== false) {
    xicara = grupo(raiz, "xicara", [X_GRUPO, Y_GRELHA_SUP, 0.123]);
    const H_XICARA = 0.064;
    const corpo = torneado(xicara, "xicara_porcelana", [
      [0, -H_XICARA / 2], [0.020, -H_XICARA / 2], [0.023, -0.029],
      [0.025, -0.020], [0.0345, 0.0295], [0.0345, 0.031],
      [0.0335, H_XICARA / 2], [0.0313, H_XICARA / 2],
      [0.0305, 0.0305], [0.021, -0.025], [0, -0.025], [0, -H_XICARA / 2],
    ], [0, H_XICARA / 2, 0], MAT.ceramica, d.segmentosOptica);
    const indicesApoio = barrasGrelha.map((_, i) => i).filter(i => {
      const x = -0.128 + 0.256 * i / (d.barrasBandeja - 1);
      return Math.abs(x - X_GRUPO) < 0.018;
    });
    indicesApoio.forEach(i => contato(`xicara_grelha_${i}`, topo(barrasGrelha[i], H_GRELHA), base(corpo, H_XICARA)));
    const alca = argola(corpo, "xicara_alca", 0.0125, 0.0035, [-0.043, 0.003, 0], MAT.ceramica, FRENTE);
    embutir(corpo, alca, "Alça cerâmica fundida na parede esquerda; interpenetração pai-filho localizada.");

    const Y_CAFE = H_XICARA - 0.008;
    const Y_LIQUIDO_INF = 0.007;
    const raioInterno = (y: number) => 0.021 + (0.0305 - 0.021) * ((y - 0.007) / (0.0625 - 0.007));
    const R_CAFE = raioInterno(Y_CAFE);
    const H_CAFE = 0.00025;
    const H_LIQUIDO = Y_CAFE - H_CAFE - Y_LIQUIDO_INF;
    const FOLGA_CAFE = 0.00008;
    const liquido = torneado(xicara, "espresso_liquido", [
      [0, -H_LIQUIDO / 2], [raioInterno(Y_LIQUIDO_INF) - FOLGA_CAFE, -H_LIQUIDO / 2],
      [raioInterno(Y_CAFE - H_CAFE) - FOLGA_CAFE, H_LIQUIDO / 2],
      [0, H_LIQUIDO / 2], [0, -H_LIQUIDO / 2],
    ], [0, Y_LIQUIDO_INF + H_LIQUIDO / 2, 0], MAT.cafe, d.segmentosOptica);
    contato("cafe_fundo_xicara", plano(corpo, [0, Y_LIQUIDO_INF - H_XICARA / 2, 0], [0, 1, 0]), base(liquido, H_LIQUIDO));
    const cafe = torneado(xicara, "espresso_crema", [
      [0, -H_CAFE / 2], [raioInterno(Y_CAFE - H_CAFE) - FOLGA_CAFE, -H_CAFE / 2],
      [R_CAFE - FOLGA_CAFE, H_CAFE / 2], [0, H_CAFE / 2], [0, -H_CAFE / 2],
    ], [0, Y_CAFE - H_CAFE / 2, 0], MAT.crema, d.segmentosOptica);
    contato("crema_cafe", topo(liquido, H_LIQUIDO), base(cafe, H_CAFE));
    const menisco = anel(cafe, "espresso_menisco", R_CAFE - 0.0010, R_CAFE - FOLGA_CAFE, 0.00008,
      [0, H_CAFE / 2 + 0.00004, 0], MAT.cafe, SEM_ROTACAO, d.segmentosOptica);
    contato("menisco_crema", topo(cafe, H_CAFE), base(menisco, 0.00008));
    if (d.miudezas) for (let i = 0; i < 17; i++) {
      const a = i * 2.399963229728653;
      const r = 0.022 * Math.sqrt((i + 1) / 18);
      const h = 4e-5;
      const bolha = cilindro(cafe, `crema_bolha_${i}`, 0.00028 + (i % 4) * 0.00013, h,
        [r * Math.cos(a), H_CAFE / 2 + h / 2, r * Math.sin(a)],
        i % 3 === 0 ? MAT.cafe : MAT.bolha, 0, SEM_ROTACAO, 12);
      contato(`crema_bolha_apoio_${i}`, topo(cafe, H_CAFE), base(bolha, h));
    }
  }

  // -------------------------------------------------------------------------
  // 7. Interior exposto: reservatório, caldeira, bomba e circuitos rígidos.
  // -------------------------------------------------------------------------

  const interior = grupo(raiz, "interior_exposto");
  const X_TANQUE = 0.086, Z_TANQUE = -0.1065;
  const W_TANQUE = 0.066, D_TANQUE = 0.085, H_TANQUE = 0.204;
  const T_TANQUE = 0.0018, H_FUNDO_TANQUE = 0.003;
  const H_BASE_TANQUE = 0.008;
  const Y_TANQUE_INF = Y_PISO + H_BASE_TANQUE;
  const suporteTanque = bloco(interior, "reservatorio_berco", W_TANQUE + 0.006, H_BASE_TANQUE, D_TANQUE + 0.006,
    [X_TANQUE, Y_PISO + H_BASE_TANQUE / 2, Z_TANQUE], MAT.borracha, 0.003);
  contato("berco_tanque_chassi", topo(piso, H_PISO), base(suporteTanque, H_BASE_TANQUE));
  const reservatorio = grupo(interior, "reservatorio", [X_TANQUE, Y_TANQUE_INF, Z_TANQUE]);
  const fundoTanque = bloco(reservatorio, "reservatorio_fundo", W_TANQUE, H_FUNDO_TANQUE, D_TANQUE,
    [0, H_FUNDO_TANQUE / 2, 0], MAT.tanque);
  contato("reservatorio_berco_assento", topo(suporteTanque, H_BASE_TANQUE), base(fundoTanque, H_FUNDO_TANQUE));
  const H_PAREDE_TANQUE = H_TANQUE - H_FUNDO_TANQUE;
  const paredesTanque: No[] = [];
  let paredeDireitaTanque: No | undefined;
  let paredeFrontalTanque: No | undefined;
  for (const s of [-1, 1]) {
    const x = bloco(reservatorio, `reservatorio_parede_x_${s}`, T_TANQUE, H_PAREDE_TANQUE, D_TANQUE - 2 * T_TANQUE,
      [s * (W_TANQUE - T_TANQUE) / 2, H_FUNDO_TANQUE + H_PAREDE_TANQUE / 2, 0], MAT.tanque);
    const z = bloco(reservatorio, `reservatorio_parede_z_${s}`, W_TANQUE, H_PAREDE_TANQUE, T_TANQUE,
      [0, H_FUNDO_TANQUE + H_PAREDE_TANQUE / 2, s * (D_TANQUE - T_TANQUE) / 2], MAT.tanque);
    paredesTanque.push(x, z);
    contato(`reservatorio_parede_x_apoio_${s}`, topo(fundoTanque, H_FUNDO_TANQUE), base(x, H_PAREDE_TANQUE));
    contato(`reservatorio_parede_z_apoio_${s}`, topo(fundoTanque, H_FUNDO_TANQUE), base(z, H_PAREDE_TANQUE));
    if (s === 1) { paredeDireitaTanque = x; paredeFrontalTanque = z; }
  }
  // Paredes encontram-se por topo, sem sobreposição de vidro nos cantos.
  // Água e vidro usam OPACIDADE; isto não implementa refração/absorção física.
  const FOLGA_AGUA = 0.00012;
  const H_AGUA = (H_TANQUE - H_FUNDO_TANQUE - 0.006) * limitar(opcoes.nivelAgua ?? 0.67, 0.05, 0.94);
  const agua = bloco(reservatorio, "reservatorio_agua", W_TANQUE - 2 * T_TANQUE - 2 * FOLGA_AGUA,
    H_AGUA, D_TANQUE - 2 * T_TANQUE - 2 * FOLGA_AGUA,
    [0, H_FUNDO_TANQUE + H_AGUA / 2, 0], MAT.agua);
  contato("agua_fundo", topo(fundoTanque, H_FUNDO_TANQUE), base(agua, H_AGUA));

  const tampaReservatorio = grupo(reservatorio, "tampa_reservatorio", [0, H_TANQUE, 0]);
  const H_TAMPA_TANQUE = 0.007;
  const tampaTanque = bloco(tampaReservatorio, "reservatorio_tampa", W_TANQUE + 0.004, H_TAMPA_TANQUE,
    D_TANQUE + 0.004, [0, H_TAMPA_TANQUE / 2, 0], MAT.baquelite, 0.004);
  paredesTanque.forEach((n, i) => contato(`reservatorio_tampa_assento_${i}`, topo(n, H_PAREDE_TANQUE), base(tampaTanque, H_TAMPA_TANQUE)));
  texto(tampaTanque, "reservatorio_h2o", "H2O", 0.004, [0, H_TAMPA_TANQUE / 2, 0.024]);
  for (const s of [-1, 1]) {
    const pe = bloco(tampaTanque, `reservatorio_alca_pe_${s}`, 0.005, 0.009, 0.008,
      [s * 0.013, H_TAMPA_TANQUE / 2 + 0.0045, -0.007], MAT.baquelite, 0.001);
    contato(`reservatorio_alca_apoio_${s}`, topo(tampaTanque, H_TAMPA_TANQUE), base(pe, 0.009));
  }
  bloco(tampaTanque, "reservatorio_alca_travessa", 0.031, 0.004, 0.008,
    [0, H_TAMPA_TANQUE / 2 + 0.009 + 0.002, -0.007], MAT.baquelite, 0.002);

  if (paredeDireitaTanque) {
    const escala = grupo(paredeDireitaTanque, "reservatorio_escala",
      [T_TANQUE / 2, 0, 0], DIREITA);
    for (let i = 0; i <= 8; i++) {
      const z = 0.073 - i * 0.018;
      traco(escala, `reservatorio_nivel_${i}`, [-0.024, z], [-0.024 + (i % 2 ? 0.005 : 0.009), z],
        0, 0.0006, MAT.tintaEscura, TINTA);
    }
    texto(escala, "reservatorio_max", "MAX", 0.003, [0, 0, -0.080], MAT.tintaEscura);
    texto(escala, "reservatorio_min", "MIN", 0.003, [0, 0, 0.081], MAT.tintaEscura);
  }

  const X_CALD = -0.042, Z_CALD = -0.041;
  const Y_CALD_INF = 0.086, H_CALD = 0.174, R_CALD = 0.054;
  const Y_CALD_SUP = Y_CALD_INF + H_CALD;
  const H_PE_CALD = Y_CALD_INF - Y_PISO;
  const apoiosCaldeira: No[] = [];
  for (const s of [-1, 1]) {
    const apoio = cilindro(interior, `caldeira_apoio_${s}`, 0.007, H_PE_CALD,
      [X_CALD + s * 0.017, Y_PISO + H_PE_CALD / 2, Z_CALD], MAT.latao, 0.0007,
      SEM_ROTACAO, d.segmentosTubos);
    apoiosCaldeira.push(apoio);
    contato(`caldeira_apoio_chassi_${s}`, topo(piso, H_PISO), base(apoio, H_PE_CALD));
  }
  const caldeira = torneado(interior, "caldeira_cobre", [
    [0, -H_CALD / 2], [0.028, -H_CALD / 2], [0.044, -H_CALD / 2 + 0.006],
    [0.051, -H_CALD / 2 + 0.017], [R_CALD, -H_CALD / 2 + 0.027],
    [R_CALD, H_CALD / 2 - 0.026], [0.050, H_CALD / 2 - 0.012],
    [0.040, H_CALD / 2 - 0.004], [0.029, H_CALD / 2],
    [0, H_CALD / 2], [0, -H_CALD / 2],
  ], [X_CALD, Y_CALD_INF + H_CALD / 2, Z_CALD], MAT.cobre, d.segmentosOptica);
  apoiosCaldeira.forEach((n, i) => contato(`caldeira_assento_${i}`, topo(n, H_PE_CALD), base(caldeira, H_CALD)));
  for (const s of [-1, 1]) {
    const cinta = anel(caldeira, `caldeira_cinta_${s}`, R_CALD, R_CALD + 0.0025, 0.009,
      [0, s * 0.048, 0], MAT.inox);
    const orelha = bloco(cinta, `caldeira_cinta_orelha_${s}`, 0.010, 0.009, 0.010,
      [R_CALD + 0.0025, 0, 0], MAT.inox, 0.001);
    embutir(cinta, orelha, "Orelha de aperto soldada à cinta circular; união pai-filho intencional.");
    parafuso(orelha, `caldeira_cinta_parafuso_${s}`, [0, 0.0045, 0], 0.003);
  }
  const H_PORCA = 0.006;
  const porcaTermostato = hexagono(caldeira, "caldeira_termostato_porca", 0.010, H_PORCA,
    [-0.014, H_CALD / 2 + H_PORCA / 2, 0], MAT.latao);
  contato("termostato_caldeira", topo(caldeira, H_CALD), base(porcaTermostato, H_PORCA));
  const termostato = cilindro(porcaTermostato, "caldeira_termostato", 0.0067, 0.010,
    [0, H_PORCA / 2 + 0.005, 0], MAT.baquelite, 0.0008, SEM_ROTACAO, d.segmentosTubos);
  contato("termostato_porca", topo(porcaTermostato, H_PORCA), base(termostato, 0.010));

  const X_BOMBA = 0.083, Y_BOMBA = 0.102, Z_BOMBA = 0.001;
  const R_BOMBA = 0.020, R_CINTA_BOMBA = R_BOMBA + 0.002;
  const L_BOMBA = 0.061, H_TAMPA_BOMBA = 0.007;
  const H_BERCO_BOMBA = Y_BOMBA - R_CINTA_BOMBA - Y_PISO;
  const bercoBomba = bloco(interior, "bomba_berco", 0.046, H_BERCO_BOMBA, 0.045,
    [X_BOMBA, Y_PISO + H_BERCO_BOMBA / 2, Z_BOMBA], MAT.borracha, 0.004);
  contato("bomba_berco_chassi", topo(piso, H_PISO), base(bercoBomba, H_BERCO_BOMBA));
  const bomba = cilindro(interior, "bomba_corpo", R_BOMBA, L_BOMBA,
    [X_BOMBA, Y_BOMBA, Z_BOMBA], MAT.aluminio, 0.0012, FRENTE);
  const tampasBomba: No[] = [];
  for (const s of [-1, 1]) {
    const tampa = cilindro(bomba, `bomba_tampa_${s}`, 0.0185, H_TAMPA_BOMBA,
      [0, s * (L_BOMBA / 2 + H_TAMPA_BOMBA / 2), 0], MAT.baquelite, 0.0005);
    tampasBomba.push(tampa);
    contato(`bomba_tampa_assento_${s}`, s < 0 ? base(bomba, L_BOMBA) : topo(bomba, L_BOMBA),
      s < 0 ? topo(tampa, H_TAMPA_BOMBA) : base(tampa, H_TAMPA_BOMBA));
  }
  const cintaBomba = anel(bomba, "bomba_cinta_vermelha", R_BOMBA, R_CINTA_BOMBA, 0.026,
    [0, 0, 0], MAT.pintura);
  contato("bomba_cinta_berco", topo(bercoBomba, H_BERCO_BOMBA),
    plano(cintaBomba, [0, 0, R_CINTA_BOMBA], [0, 0, 1]));
  const H_RISER = 0.017, Z_RISER = 0.024;
  const riser = hexagono(interior, "bomba_saida_latao", 0.007, H_RISER,
    [X_BOMBA, Y_BOMBA + R_BOMBA + H_RISER / 2, Z_RISER], MAT.latao);
  contato("bomba_saida", plano(bomba, [0, 0, -R_BOMBA], [0, 0, -1]), base(riser, H_RISER));

  const L_CON = 0.012;
  const Y_SAIDA_BOMBA = Y_BOMBA + R_BOMBA + H_RISER;
  const principal = circuito(interior, "circuito_pressurizado", [
    [X_BOMBA, Y_SAIDA_BOMBA + L_CON / 2, Z_RISER],
    [X_BOMBA, 0.292, Z_RISER],
    [X_CALD + 0.014, 0.292, Z_RISER],
    [X_CALD + 0.014, 0.292, Z_CALD],
    [X_CALD + 0.014, Y_CALD_SUP + L_CON / 2, Z_CALD],
  ], 0.0036, MAT.cobre);
  contato("circuito_bomba", topo(riser, H_RISER), base(principal.conexoes[0], L_CON));
  contato("circuito_caldeira", topo(caldeira, H_CALD), base(principal.conexoes[4], L_CON));

  const vaporInterno = circuito(interior, "circuito_vapor", [
    [X_CALD + R_CALD + L_CON / 2, 0.211, Z_CALD],
    [0.105, 0.211, Z_CALD], [0.105, 0.211, 0.043],
    [0.105, 0.294, 0.043], [0.105, 0.294, Z_FRENTE - L_CON / 2],
  ], 0.0032, MAT.cobre);
  contato("vapor_caldeira", plano(caldeira, [R_CALD, 0, 0], [1, 0, 0]),
    plano(vaporInterno.conexoes[0], [-L_CON / 2, 0, 0], [-1, 0, 0]));
  contato("vapor_fachada", plano(vaporInterno.conexoes[4], [0, 0, L_CON / 2], [0, 0, 1]),
    base(fachada.chapa, fachada.esp));

  const Z_ENTRADA_BOMBA = Z_BOMBA - L_BOMBA / 2 - H_TAMPA_BOMBA;
  const Z_TANQUE_FRENTE = Z_TANQUE + D_TANQUE / 2;
  const alimentacao = circuito(interior, "mangueira_alimentacao", [
    [X_BOMBA, 0.067, Z_TANQUE_FRENTE + L_CON / 2],
    [X_BOMBA, 0.067, Z_ENTRADA_BOMBA - L_CON / 2],
    [X_BOMBA, Y_BOMBA, Z_ENTRADA_BOMBA - L_CON / 2],
  ], 0.0032, MAT.silicone, MAT.baquelite);
  if (paredeFrontalTanque) {
    contato("mangueira_tanque", plano(paredeFrontalTanque, [0, 0, T_TANQUE / 2], [0, 0, 1]),
      plano(alimentacao.conexoes[0], [0, 0, -L_CON / 2], [0, 0, -1]));
  }
  contato("mangueira_bomba", plano(alimentacao.conexoes[2], [0, 0, L_CON / 2], [0, 0, 1]),
    base(tampasBomba[0], H_TAMPA_BOMBA));

  // -------------------------------------------------------------------------
  // 8. Lança de vapor: peças retas, junta mecânica e bico com bore real.
  // -------------------------------------------------------------------------

  const X_VAPOR = 0.113, Y_VAPOR = 0.231;
  const Z_ESPELHO_EXT = Z_FRENTE + espelho.esp;
  const H_MONTAGEM_VAPOR = 0.016;
  const montagemVapor = cilindro(raiz, "vapor_montagem", 0.011, H_MONTAGEM_VAPOR,
    [X_VAPOR, Y_VAPOR, Z_ESPELHO_EXT + H_MONTAGEM_VAPOR / 2], MAT.cromo, 0.001, FRENTE);
  contato("vapor_montagem_espelho", topo(espelho.chapa, espelho.esp), base(montagemVapor, H_MONTAGEM_VAPOR));
  const Z_LANCA = Z_ESPELHO_EXT + H_MONTAGEM_VAPOR;
  const lancaVapor = grupo(raiz, "lanca_vapor", [X_VAPOR, Y_VAPOR, Z_LANCA]);
  const H_JOELHO_V = 0.012;
  const juntaVapor = bloco(lancaVapor, "vapor_junta", 0.013, H_JOELHO_V, 0.012,
    [0, 0, H_JOELHO_V / 2], MAT.cromo, 0.004);
  contato("lanca_montagem", topo(montagemVapor, H_MONTAGEM_VAPOR),
    plano(juntaVapor, [0, 0, -H_JOELHO_V / 2], [0, 0, -1]));
  const Y_JOELHO = -0.076;
  const A: V3 = [0, -H_JOELHO_V / 2, H_JOELHO_V / 2];
  const B: V3 = [0, Y_JOELHO + 0.006, H_JOELHO_V / 2];
  const tuboVertical = haste(lancaVapor, "vapor_haste_vertical", A, B, 0.0035, MAT.cromo);
  contato("lanca_junta_haste", base(juntaVapor, H_JOELHO_V), base(tuboVertical, Math.abs(B[1] - A[1])));
  const joelho = bloco(lancaVapor, "vapor_joelho", 0.012, 0.012, 0.012,
    [0, Y_JOELHO, H_JOELHO_V / 2], MAT.baquelite, 0.003);
  contato("lanca_haste_joelho", topo(tuboVertical, Math.abs(B[1] - A[1])), topo(joelho, 0.012));
  const P0: V3 = [0.006, Y_JOELHO, H_JOELHO_V / 2];
  const P1: V3 = [0.029, Y_JOELHO, H_JOELHO_V / 2];
  const trechoHorizontal = haste(lancaVapor, "vapor_desvio", P0, P1, 0.0035, MAT.cromo);
  contato("vapor_joelho_desvio", plano(joelho, [0.006, 0, 0], [1, 0, 0]), base(trechoHorizontal, 0.023));
  const joelhoFinal = bloco(lancaVapor, "vapor_joelho_final", 0.010, 0.010, 0.010,
    [P1[0] + 0.005, Y_JOELHO, H_JOELHO_V / 2], MAT.cromo, 0.002);
  contato("vapor_desvio_final", topo(trechoHorizontal, 0.023), plano(joelhoFinal, [-0.005, 0, 0], [-1, 0, 0]));
  const H_PONTEIRA = 0.040;
  const ponteira = anel(lancaVapor, "vapor_ponteira_oca", 0.0025, 0.0042, H_PONTEIRA,
    [P1[0] + 0.005, Y_JOELHO - 0.005 - H_PONTEIRA / 2, H_JOELHO_V / 2], MAT.cromo,
    SEM_ROTACAO, d.segmentosTubos);
  contato("vapor_joelho_ponteira", base(joelhoFinal, 0.010), topo(ponteira, H_PONTEIRA));

  // -------------------------------------------------------------------------
  // Acoplamentos: aplicação opcional, dependente do schema real do SDK.
  // Não há I/O, logs, alterações de visibilidade ou verificações automáticas.
  // -------------------------------------------------------------------------

  if (opcoes.registrarAcoplamento) {
    for (const declaracao of acoplamentos) opcoes.registrarAcoplamento(cena, declaracao);
  }

  function ajustarPressao(valor: number) {
    const novaPressao = limitar(valor, 0, 16);
    ponteiroManometro.girar([0, -(anguloPressao(novaPressao) - anguloPressao(pressaoAtual)), 0]);
    pressaoAtual = novaPressao;
  }

  return {
    cena,
    raiz,
    registroVapor,
    ponteiroManometro,
    portaFiltro,
    tampaSuperior,
    tampaReservatorio,
    tampaLateral: tampaLateral?.grupo ?? null,
    xicara,
    reservatorio,
    agua,
    caldeira,
    bomba,
    lancaVapor,
    botaoLiga,
    botaoCafe,
    ajustarPressao,
    acoplamentos,
    interferenciasIntencionais,
    detalhe: { ...d },
    ficha: {
      unidade: "m" as const,
      frente: "+z" as const,
      abertura: "+x" as const,
      larguraBase: W_BASE,
      profundidadeBase: D_BASE,
      alturaGuardaCorpo: Y_TETO_INF + Y_RAIL + H_RAIL,
      alturaApoioXicara: Y_GRELHA_SUP,
      // O cabo do porta-filtro se projeta além da base. Não confundir com bbox.
    },
  };
}

/*
 * INTERPENETRAÇÕES INTENCIONAIS (também retornadas por referência):
 * - registro_estria_0…N: meia espessura embutida no cilindro-pai.
 * - cabecote_braco: união de fundição no próprio cabeçote-pai.
 * - portafiltro_ponte_cabo: espiga encaixada na taça-pai.
 * - xicara_alca: união cerâmica na parede da xícara-pai.
 * - caldeira_cinta_orelha_-1/+1: orelhas soldadas às respectivas cintas-pai.
 *
 * Tinta/fendas são relevos geométricos apoiados, não furos ou texturas.
 * Aros, bicos e taça são perfis fechados de lathe, com aberturas geométricas.
 * Não se mede bbox() de galhos para conferir faces; os planos acima são
 * analíticos e continuam válidos quando detalhes são adicionados aos nós.
 */

export default montarCena;
