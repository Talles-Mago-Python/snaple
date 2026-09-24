import { Cena } from "@snaple/core"; // Ajuste somente o caminho, se o SDK for um módulo local.

/**
 * SETUP DEV — mesa de programação: monitor com editor + terminal desenhados
 * em geometria, teclado mecânico de 60 teclas, mouse, torre com vidro e GPU
 * (duas ventoinhas móveis), caneca, notebook e planta.
 *
 * Metros; +Y para cima; frente em +Z; Euler XYZ em radianos.
 * Apenas grupo, extrude e lathe. Sem Three direto, CSG, assets, luzes ou câmeras.
 *
 * Não executado/verificado: a validação fica com o runtime do projeto.
 *
 * O guia fornece a assinatura de criar(), mas não o schema de acoplar().
 * Os contatos/pivôs são declarados em `acoplamentos`, com planos/eixos LOCAIS
 * e referências reais aos nós; `registrarAcoplamento` adapta-os a
 * cena.acoplar() da sua versão. Sem esse adaptador a geometria é criada,
 * mas os vínculos não são registrados no linter oficial.
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
  /** Texto do monitor, logos e legendas de tecla. */
  inscricoes: boolean;
  /** Borda do tapete, aletas da GPU, pontos de fan, clipe da caneta. */
  miudezas: boolean;
  /** Número de folhas da planta. */
  folhas: number;
}

export const DETALHE: Readonly<Detalhamento> = Object.freeze({
  segmentos: 64,
  segmentosOptica: 96,
  segmentosTubos: 32,
  pontosArco: 8,
  inscricoes: true,
  miudezas: true,
  folhas: 7,
});

export const DETALHE_LEVE: Readonly<Detalhamento> = Object.freeze({
  segmentos: 32,
  segmentosOptica: 48,
  segmentosTubos: 16,
  pontosArco: 4,
  inscricoes: false,
  miudezas: false,
  folhas: 4,
});

type PlanoLocal = { no: No; ponto: V3; normal: V3 };
type EixoLocal = { no: No; ponto: V3; eixo: V3 };

export type AcoplamentoDeclarado =
  | { nome: string; tipo: "contato"; a: PlanoLocal; b: PlanoLocal }
  | { nome: string; tipo: "pivo"; a: EixoLocal; b: EixoLocal };

/** Categoria de cor de sintaxe para os tokens do editor. */
export type CategoriaToken =
  | "kw" | "str" | "fn" | "tipo" | "num" | "var" | "prop" | "com";

export type Token = { t: string; c?: CategoriaToken };
/** Linha do editor: array de tokens, "abstrato" (barras) ou null (vazia). */
export type Linha = Token[] | "abstrato" | null;

export interface OpcoesSetup {
  detalhe?: Partial<Detalhamento>;
  comCaneca?: boolean;
  comNotebook?: boolean;
  comPronta?: boolean;
  /** Ângulo inicial das pás das ventoinhas, em radianos. */
  anguloVentoinha?: number;
  /** Substitui as linhas do editor (padrão: snippet do espresso.ts). */
  codigo?: Linha[];
  /** Substitui as linhas do terminal (texto puro). */
  terminal?: string[];
  registrarAcoplamento?: (cena: Cena, declaracao: AcoplamentoDeclarado) => void;
}

const PI = Math.PI;
const TAU = 2 * PI;
const TINTA = 3.5e-5;
const ORIGEM: V3 = [0, 0, 0];
const SEM_ROTACAO: V3 = [0, 0, 0];
const FRENTE: V3 = [PI / 2, 0, 0];
const TRASEIRA: V3 = [-PI / 2, PI, 0];

const MAT = {
  madeira: { cor: "#C9A87C", metalico: 0.05, rugosidade: 0.45 },
  aco: { cor: "#2A2D30", metalico: 0.7, rugosidade: 0.35 },
  corpoMonitor: { cor: "#17191C", metalico: 0.06, rugosidade: 0.32 },
  vidroTela: { cor: "#9FB8C0", metalico: 0.04, rugosidade: 0.06, opacidade: 0.12 },
  vidroLamina: { cor: "#AFC9D0", metalico: 0.05, rugosidade: 0.07, opacidade: 0.22 },
  telaFundo: { cor: "#1E1E1E", metalico: 0, rugosidade: 0.55 },
  telaTitulo: { cor: "#2D2D30", metalico: 0, rugosidade: 0.5 },
  telaSidebar: { cor: "#252526", metalico: 0, rugosidade: 0.5 },
  telaAtividade: { cor: "#2B2B2B", metalico: 0, rugosidade: 0.5 },
  telaAba: { cor: "#464749", metalico: 0, rugosidade: 0.5 },
  telaGutter: { cor: "#1B1B1B", metalico: 0, rugosidade: 0.55 },
  telaTerm: { cor: "#181818", metalico: 0, rugosidade: 0.55 },
  telaStatus: { cor: "#0E5A8A", metalico: 0.1, rugosidade: 0.4 },
  linhaAtiva: { cor: "#37373D", metalico: 0, rugosidade: 0.5 },
  iconAtivo: { cor: "#858585", metalico: 0, rugosidade: 0.5 },
  iconDim: { cor: "#4E5660", metalico: 0, rugosidade: 0.5 },
  arrasteR: { cor: "#FF5F57", metalico: 0, rugosidade: 0.45 },
  arrasteA: { cor: "#FEBC2E", metalico: 0, rugosidade: 0.45 },
  arrasteV: { cor: "#28C840", metalico: 0, rugosidade: 0.45 },
  pcb: { cor: "#274438", metalico: 0.1, rugosidade: 0.55 },
  chassi: { cor: "#1A1D1F", metalico: 0.35, rugosidade: 0.4 },
  shroud: { cor: "#22262A", metalico: 0.2, rugosidade: 0.42 },
  cobre: { cor: "#B96742", metalico: 0.93, rugosidade: 0.26 },
  cobreEscuro: { cor: "#8A5638", metalico: 0.9, rugosidade: 0.3 },
  ledCiano: { cor: "#2FB9D8", metalico: 0.15, rugosidade: 0.3 },
  borracha: { cor: "#151B1E", metalico: 0, rugosidade: 0.97 },
  baquelite: { cor: "#24282A", metalico: 0.03, rugosidade: 0.34 },
  keycap: { cor: "#2A2E31", metalico: 0.04, rugosidade: 0.42 },
  keycapEspaco: { cor: "#33383B", metalico: 0.04, rugosidade: 0.42 },
  pintura: { cor: "#982D36", metalico: 0.18, rugosidade: 0.34 },
  tintaClara: { cor: "#C8CDD0", metalico: 0, rugosidade: 0.6 },
  tintaDim: { cor: "#8B949E", metalico: 0, rugosidade: 0.6 },
  ceramica: { cor: "#F1EADD", metalico: 0, rugosidade: 0.22 },
  terra: { cor: "#2E241C", metalico: 0, rugosidade: 0.95 },
  folhagem: { cor: "#3E7C4F", metalico: 0, rugosidade: 0.5 },
  capucha: { cor: "#2B2F33", metalico: 0.05, rugosidade: 0.4 },
  papel: { cor: "#E8E4DA", metalico: 0, rugosidade: 0.7 },
  cabos: { cor: "#1A1D1F", metalico: 0, rugosidade: 0.6 },
  logo: { cor: "#4A5258", metalico: 0.2, rugosidade: 0.35 },
} satisfies Record<string, Material>;

const MAT_CODIGO: Record<CategoriaToken | "numLinha" | "term" | "arq" | "arqAtivo", Material> = {
  kw: { cor: "#C586C0", metalico: 0, rugosidade: 0.55 },
  str: { cor: "#CE9178", metalico: 0, rugosidade: 0.55 },
  fn: { cor: "#DCDCAA", metalico: 0, rugosidade: 0.55 },
  tipo: { cor: "#4EC9B0", metalico: 0, rugosidade: 0.55 },
  num: { cor: "#B5CEA8", metalico: 0, rugosidade: 0.55 },
  var: { cor: "#D4D4D4", metalico: 0, rugosidade: 0.55 },
  prop: { cor: "#9CDCFE", metalico: 0, rugosidade: 0.55 },
  com: { cor: "#6A9955", metalico: 0, rugosidade: 0.55 },
  numLinha: { cor: "#6E7681", metalico: 0, rugosidade: 0.6 },
  term: { cor: "#3FC1C9", metalico: 0, rugosidade: 0.55 },
  arq: { cor: "#C9D1D9", metalico: 0, rugosidade: 0.55 },
  arqAtivo: { cor: "#E6EDF3", metalico: 0, rugosidade: 0.5 },
};

// Fonte vetorial segmentada: maiúsculas, minúsculas e pontuação.
// Cada traço é um segmento [x1, z1, x2, z2] na grade 0..1 (z aponta "para baixo").
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
  a: [[0.72, 0.35, 0.72, 0.8], [0.72, 0.8, 0.38, 0.8], [0.38, 0.8, 0.28, 0.62], [0.28, 0.62, 0.38, 0.35], [0.38, 0.35, 0.72, 0.35]],
  b: [[0.3, 0.0, 0.3, 0.8], [0.3, 0.52, 0.68, 0.52], [0.68, 0.52, 0.75, 0.66], [0.75, 0.66, 0.3, 0.8]],
  c: [[0.75, 0.4, 0.45, 0.33], [0.45, 0.33, 0.28, 0.5], [0.28, 0.5, 0.28, 0.62], [0.28, 0.62, 0.45, 0.79], [0.45, 0.79, 0.75, 0.73]],
  d: [[0.7, 0.0, 0.7, 0.8], [0.7, 0.52, 0.32, 0.52], [0.32, 0.52, 0.25, 0.66], [0.25, 0.66, 0.7, 0.8]],
  e: [[0.28, 0.56, 0.75, 0.56], [0.75, 0.56, 0.75, 0.35], [0.75, 0.35, 0.4, 0.35], [0.4, 0.35, 0.28, 0.5], [0.28, 0.5, 0.28, 0.66], [0.28, 0.66, 0.4, 0.8], [0.4, 0.8, 0.78, 0.72]],
  f: [[0.42, 0.0, 0.42, 0.8], [0.25, 0.3, 0.62, 0.3], [0.62, 0.3, 0.62, 0.12], [0.62, 0.12, 0.42, 0.0]],
  g: [[0.72, 0.35, 0.72, 0.8], [0.72, 0.8, 0.38, 0.8], [0.38, 0.8, 0.28, 0.62], [0.28, 0.62, 0.38, 0.35], [0.38, 0.35, 0.72, 0.35], [0.72, 0.8, 0.72, 1.0], [0.72, 1.0, 0.42, 1.0]],
  h: [[0.3, 0.0, 0.3, 0.8], [0.3, 0.48, 0.68, 0.42], [0.68, 0.42, 0.75, 0.58], [0.75, 0.58, 0.75, 0.8]],
  i: [[0.45, 0.3, 0.45, 0.8], [0.4, 0.1, 0.5, 0.1]],
  j: [[0.55, 0.3, 0.55, 0.8], [0.55, 0.8, 0.55, 1.0], [0.55, 1.0, 0.3, 1.0], [0.3, 1.0, 0.25, 0.85], [0.5, 0.1, 0.6, 0.1]],
  k: [[0.3, 0.0, 0.3, 0.8], [0.7, 0.35, 0.3, 0.55], [0.3, 0.55, 0.75, 0.8]],
  l: [[0.45, 0.0, 0.45, 0.8]],
  m: [[0.2, 0.35, 0.2, 0.8], [0.2, 0.42, 0.42, 0.36], [0.42, 0.36, 0.42, 0.8], [0.42, 0.42, 0.64, 0.36], [0.64, 0.36, 0.64, 0.8], [0.64, 0.42, 0.8, 0.38]],
  n: [[0.3, 0.35, 0.3, 0.8], [0.3, 0.42, 0.68, 0.38], [0.68, 0.38, 0.68, 0.8]],
  o: [[0.72, 0.4, 0.72, 0.75], [0.72, 0.75, 0.38, 0.8], [0.38, 0.8, 0.28, 0.62], [0.28, 0.62, 0.38, 0.4], [0.38, 0.4, 0.72, 0.4]],
  p: [[0.3, 0.35, 0.3, 1.0], [0.3, 0.52, 0.68, 0.52], [0.68, 0.52, 0.75, 0.66], [0.75, 0.66, 0.3, 0.8]],
  q: [[0.7, 0.35, 0.7, 1.0], [0.7, 0.52, 0.32, 0.52], [0.32, 0.52, 0.25, 0.66], [0.25, 0.66, 0.7, 0.8]],
  r: [[0.3, 0.35, 0.3, 0.8], [0.3, 0.42, 0.6, 0.35], [0.6, 0.35, 0.72, 0.5]],
  s: [[0.72, 0.42, 0.4, 0.35], [0.4, 0.35, 0.28, 0.5], [0.28, 0.5, 0.45, 0.58], [0.45, 0.58, 0.72, 0.62], [0.72, 0.62, 0.58, 0.79], [0.58, 0.79, 0.28, 0.75]],
  t: [[0.45, 0.05, 0.45, 0.72], [0.45, 0.72, 0.32, 0.8], [0.25, 0.3, 0.65, 0.3]],
  u: [[0.3, 0.35, 0.3, 0.68], [0.3, 0.68, 0.42, 0.8], [0.42, 0.8, 0.58, 0.8], [0.58, 0.8, 0.7, 0.68], [0.7, 0.68, 0.7, 0.35]],
  v: [[0.2, 0.35, 0.48, 0.8], [0.48, 0.8, 0.76, 0.35]],
  w: [[0.15, 0.35, 0.35, 0.8], [0.35, 0.8, 0.48, 0.5], [0.48, 0.5, 0.61, 0.8], [0.61, 0.8, 0.81, 0.35]],
  x: [[0.22, 0.35, 0.78, 0.8], [0.78, 0.35, 0.22, 0.8]],
  y: [[0.2, 0.35, 0.45, 0.68], [0.45, 0.68, 0.8, 0.35], [0.45, 0.68, 0.45, 1.0], [0.45, 1.0, 0.25, 1.0]],
  z: [[0.25, 0.35, 0.75, 0.35], [0.75, 0.35, 0.25, 0.8], [0.25, 0.8, 0.75, 0.8]],
  "(": [[0.7, 0, 0.42, 0.14], [0.42, 0.14, 0.28, 0.5], [0.28, 0.5, 0.42, 0.86], [0.42, 0.86, 0.7, 1]],
  ")": [[0.3, 0, 0.58, 0.14], [0.58, 0.14, 0.72, 0.5], [0.72, 0.5, 0.58, 0.86], [0.58, 0.86, 0.3, 1]],
  "{": [[0.6, 0, 0.35, 0.14], [0.35, 0.14, 0.35, 0.35], [0.35, 0.35, 0.1, 0.5], [0.1, 0.5, 0.35, 0.65], [0.35, 0.65, 0.35, 0.86], [0.35, 0.86, 0.6, 1]],
  "}": [[0.4, 0, 0.65, 0.14], [0.65, 0.14, 0.65, 0.35], [0.65, 0.35, 0.9, 0.5], [0.9, 0.5, 0.65, 0.65], [0.65, 0.65, 0.65, 0.86], [0.65, 0.86, 0.4, 1]],
  "[": [[0.6, 0, 0.6, 1], [0.6, 0, 0.3, 0], [0.6, 1, 0.3, 1]],
  "]": [[0.4, 0, 0.4, 1], [0.4, 0, 0.7, 0], [0.4, 1, 0.7, 1]],
  "<": [[0.8, 0.15, 0.2, 0.5], [0.2, 0.5, 0.8, 0.85]],
  ">": [[0.2, 0.15, 0.8, 0.5], [0.8, 0.5, 0.2, 0.85]],
  ":": [[0.42, 0.18, 0.58, 0.18], [0.42, 0.82, 0.58, 0.82]],
  ";": [[0.42, 0.8, 0.58, 0.8], [0.58, 0.15, 0.45, 0.5], [0.45, 0.5, 0.3, 0.85]],
  ",": [[0.55, 0.5, 0.42, 0.85], [0.42, 0.85, 0.3, 1]],
  ".": [[0.42, 0.88, 0.58, 0.88]],
  "'": [[0.5, 0, 0.5, 0.3]],
  "\"": [[0.3, 0, 0.3, 0.3], [0.7, 0, 0.7, 0.3]],
  "=": [[0, 0.35, 1, 0.35], [0, 0.65, 1, 0.65]],
  "+": [[0.1, 0.5, 0.9, 0.5], [0.5, 0.1, 0.5, 0.9]],
  "-": [[0.1, 0.5, 0.9, 0.5]],
  "/": [[0, 1, 1, 0]],
  "\\": [[0, 0, 1, 1]],
  "_": [[0, 0.85, 1, 0.85]],
  "?": [[0.3, 0, 0.3, 0.35], [0.3, 0.35, 0.7, 0.35], [0.7, 0.35, 0.7, 0.6], [0.7, 0.6, 0.4, 0.6], [0.4, 0.6, 0.4, 0.8], [0.42, 0.95, 0.58, 0.95]],
  "!": [[0.5, 0, 0.5, 0.6], [0.44, 0.88, 0.56, 0.88]],
  "*": [[0.15, 0.25, 0.85, 0.75], [0.85, 0.25, 0.15, 0.75], [0.5, 0.2, 0.5, 0.8]],
  "&": [[0.75, 0.8, 0.25, 0.3], [0.25, 0.3, 0.25, 0.05], [0.25, 0.05, 0.75, 0.05], [0.75, 0.05, 0.75, 0.3], [0.75, 0.3, 0.25, 0.55], [0.25, 0.55, 0.3, 0.8], [0.3, 0.8, 0.7, 0.8], [0.7, 0.8, 0.95, 0.8]],
  "~": [[0.12, 0.45, 0.32, 0.38], [0.32, 0.38, 0.55, 0.46], [0.55, 0.46, 0.8, 0.36]],
  "@": [[0.72, 0.35, 0.72, 0.78], [0.72, 0.78, 0.36, 0.8], [0.36, 0.8, 0.26, 0.62], [0.26, 0.62, 0.36, 0.4], [0.36, 0.4, 0.72, 0.38], [0.72, 0.38, 0.84, 0.3], [0.84, 0.3, 0.92, 0.42]],
  "#": [[0.3, 0.1, 0.2, 0.9], [0.7, 0.1, 0.6, 0.9], [0.1, 0.35, 0.9, 0.35], [0.1, 0.65, 0.9, 0.65]],
  $: [[0.5, 0, 0.5, 1], [0.75, 0.25, 0.42, 0.2], [0.42, 0.2, 0.28, 0.35], [0.28, 0.35, 0.42, 0.5], [0.42, 0.5, 0.72, 0.52], [0.72, 0.52, 0.85, 0.66], [0.85, 0.66, 0.7, 0.8], [0.7, 0.8, 0.4, 0.75]],
  "%": [[0.2, 0, 0.8, 1], [0.25, 0.1, 0.5, 0.1], [0.5, 0.1, 0.5, 0.42], [0.5, 0.42, 0.25, 0.42], [0.25, 0.42, 0.25, 0.1], [0.5, 0.58, 0.75, 0.58], [0.75, 0.58, 0.75, 0.9], [0.75, 0.9, 0.5, 0.9], [0.5, 0.9, 0.5, 0.58]],
  "^": [[0.1, 0.8, 0.5, 0.2], [0.5, 0.2, 0.9, 0.8]],
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
  return [Math.atan2(dz, dy), 0, -Math.atan2(dx, Math.hypot(dy, dz))];
}

export function montarCena(): Cena {
  return montarCenaComRefs().cena;
}

export function montarCenaComRefs(opcoes: OpcoesSetup = {}) {
  const cena = new Cena();
  const d: Detalhamento = { ...DETALHE, ...opcoes.detalhe };
  d.segmentos = Math.round(limitar(d.segmentos, 16, 128));
  d.segmentosOptica = Math.round(limitar(d.segmentosOptica, 24, 160));
  d.segmentosTubos = Math.round(limitar(d.segmentosTubos, 12, 64));
  d.pontosArco = Math.round(limitar(d.pontosArco, 3, 16));
  d.folhas = Math.round(limitar(d.folhas, 3, 12));

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
    return torneado(pai, nome, [
      [interno, -h / 2], [externo, -h / 2], [externo, h / 2],
      [interno, h / 2], [interno, -h / 2],
    ], pos, mat, segmentos, rot);
  }

  function argola(
    pai: Pai, nome: string, raio: number, tubo: number, pos: V3, mat: Material,
    rot: V3 = SEM_ROTACAO,
  ): No {
    const perfil: V2[] = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const a = TAU * i / n;
      perfil.push([raio + tubo * Math.cos(a), tubo * Math.sin(a)]);
    }
    return torneado(pai, nome, perfil, pos, mat, d.segmentos, rot);
  }

  function poligonoNoPlano(pai: Pai, nome: string, pts: V2[], h: number, pos: V3, mat: Material): No {
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

  /** Traço de texto: caixa fina apoiada na face, com contato declarado. */
  function traco(
    pai: No, nome: string, a: V2, b: V2, yFace: number,
    largura: number, mat: Material, h = TINTA, segmentado = true,
  ): No {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const comprimento = Math.max(largura * 0.35, Math.hypot(dx, dz) - (segmentado ? largura : 0));
    const no = bloco(pai, nome, comprimento, h, largura,
      [(a[0] + b[0]) / 2, yFace + h / 2, (a[1] + b[1]) / 2], mat, 0,
      [0, -Math.atan2(dz, dx), 0]);
    contato(`${nome}_relevo`, plano(pai, [0, yFace, 0], [0, 1, 0]), base(no, h));
    return no;
  }

  /**
   * Texto segmentado. `origem` = [x, yFace, zTopoDaLinha]; com alinhar "esq"
   * o texto começa em x; com "centro" x é o centro da linha.
   */
  function texto(
    pai: No, nome: string, conteudo: string, altura: number,
    origem: V3, mat: Material, alinhar: "centro" | "esq" = "centro",
  ): void {
    if (!d.inscricoes) return;
    const gw = altura * 0.6, passo = altura * 0.82;
    const total = Math.max(0, conteudo.length - 1) * passo + gw;
    const x0 = alinhar === "centro" ? origem[0] - total / 2 : origem[0];
    const zTopo = origem[2];
    for (let i = 0; i < conteudo.length; i++) {
      const segmentos = FONTE[conteudo[i]] ?? [];
      segmentos.forEach(([x1, z1, x2, z2], j) => {
        traco(pai, `${nome}_${i}_${j}`,
          [x0 + i * passo + x1 * gw, zTopo + z1 * altura],
          [x0 + i * passo + x2 * gw, zTopo + z2 * altura],
          origem[1], altura * 0.12, mat);
      });
    }
  }

  /** Linha de código com tokens coloridos; retorna o x final (para o cursor). */
  function linhaTokens(
    pai: No, nome: string, tokens: Token[], x0: number,
    yFace: number, zTopo: number, altura: number,
  ): number {
    const gw = altura * 0.6, passo = altura * 0.82;
    if (!d.inscricoes) return x0;
    let cursor = 0, k = 0;
    for (const tok of tokens) {
      const t = typeof tok === "string" ? tok : tok.t;
      const mat = MAT_CODIGO[(typeof tok === "string" ? "var" : tok.c ?? "var")];
      for (const ch of t) {
        const segmentos = FONTE[ch] ?? [];
        segmentos.forEach(([x1, z1, x2, z2]) => {
          traco(pai, `${nome}_${k++}`,
            [x0 + cursor * passo + x1 * gw, zTopo + z1 * altura],
            [x0 + cursor * passo + x2 * gw, zTopo + z2 * altura],
            yFace, altura * 0.12, mat);
        });
        cursor++;
      }
    }
    return x0 + cursor * passo;
  }

  /** Barras abstratas de "código" (determinísticas, variam por linha). */
  function linhaAbstrata(pai: No, nome: string, i: number, x0: number, yFace: number, zTopo: number, altura: number): void {
    const passo = altura * 0.82;
    const cores = [MAT_CODIGO.prop, MAT_CODIGO.str, MAT_CODIGO.fn, MAT_CODIGO.var, MAT_CODIGO.tipo];
    let x = x0;
    const barras = 3 + (i % 3);
    for (let k = 0; k < barras; k++) {
      const comprimento = (2 + ((i * 5 + k * 3) % 5)) * passo;
      const barra = bloco(pai, `${nome}_b${k}`, comprimento, TINTA, altura * 0.14,
        [x + comprimento / 2, yFace + TINTA / 2, zTopo + altura * 0.55], cores[(i + k) % cores.length]);
      contato(`${nome}_b${k}_apoio`, plano(pai, [0, yFace, 0], [0, 1, 0]), base(barra, TINTA));
      x += comprimento + passo;
    }
  }

  /** Painel com referencial local explícito: +y local = normal para fora. */
  function painel(
    pai: No, nome: string, w: number, altura: number, esp: number,
    pos: V3, rot: V3, mat: Material, raio = 0.008,
  ) {
    const referencial = grupo(pai, nome, pos, rot);
    const chapa = bloco(referencial, `${nome}_chapa`, w, esp, altura, [0, esp / 2, 0], mat, raio);
    return { grupo: referencial, chapa, esp, w, altura };
  }

  // -------------------------------------------------------------------------
  // 1. Mesa: tampo de madeira, pés de aço e travessa traseira.
  // -------------------------------------------------------------------------

  const raiz = grupo(cena, "SNAPLE_SETUP_DEV");
  const W_MESA = 1.4, D_MESA = 0.7, H_TAMPO = 0.028, H_PE = 0.72;
  const Y_TOPO = H_PE + H_TAMPO;
  const mesa = grupo(raiz, "mesa");
  const tampo = bloco(mesa, "mesa_tampo", W_MESA, H_TAMPO, D_MESA,
    [0, H_PE + H_TAMPO / 2, 0], MAT.madeira, 0.005);
  const pesMesa: No[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pe = bloco(mesa, `mesa_pe_${sx}_${sz}`, 0.045, H_PE, 0.045,
      [sx * 0.6745, H_PE / 2, sz * 0.3245], MAT.aco, 0.004);
    pesMesa.push(pe);
    contato(`mesa_pe_tampo_${sx}_${sz}`, topo(pe, H_PE), base(tampo, H_TAMPO));
  }
  const travessa = bloco(mesa, "mesa_travessa", 1.304, 0.03, 0.03,
    [0, 0.06, -0.3245], MAT.aco, 0.004);
  contato("travessa_pe_-1", plano(travessa, [-0.652, 0, 0], [-1, 0, 0]),
    plano(pesMesa[0], [0.0225, 0, 0], [1, 0, 0]));
  contato("travessa_pe_1", plano(travessa, [0.652, 0, 0], [1, 0, 0]),
    plano(pesMesa[1], [-0.0225, 0, 0], [-1, 0, 0]));

  const tapete = bloco(mesa, "tapete_teclado", 0.8, 0.004, 0.34,
    [-0.03, Y_TOPO + 0.002, 0.09], MAT.borracha, 0.003);
  contato("tapete_mesa", topo(tampo, H_TAMPO), base(tapete, 0.004));
  if (d.miudezas) {
    // Coordenadas locais do tapete (centro em x=-0.03, z=0.09).
    const bordas: Array<[string, number, number, number, number]> = [
      ["n", 0, -0.164, 0.788, 0.0008],
      ["s", 0, 0.134, 0.788, 0.0008],
      ["l", -0.394, 0, 0.0008, 0.328],
      ["r", 0.394, 0, 0.0008, 0.328],
    ];
    for (const [nome, x, z, w, prof] of bordas) {
      const b = bloco(tapete, `tapete_borda_${nome}`, w, 2e-5, prof,
        [x, 0.002 + 1e-5, z], MAT.tintaDim);
      contato(`tapete_borda_${nome}_apoio`, topo(tapete, 0.004), base(b, 2e-5));
    }
  }

  // -------------------------------------------------------------------------
  // 2. Monitor 24": corpo, vidro, editor de código e terminal em geometria.
  //    Grupo-tela com +y local = normal para fora (frente).
  //    Dentro do grupo-tela: +z local = BAIXO da tela.
  // -------------------------------------------------------------------------

  const X_MON = -0.1, Z_MON = -0.22;
  const monitor = grupo(raiz, "monitor", [X_MON, Y_TOPO, Z_MON]);
  const H_BASE_MON = 0.012, H_PESCOCO = 0.13;
  const baseMon = bloco(monitor, "monitor_base", 0.2, H_BASE_MON, 0.14,
    [0, H_BASE_MON / 2, 0], MAT.chassi, 0.006);
  contato("monitor_base_mesa", topo(tampo, H_TAMPO), base(baseMon, H_BASE_MON));
  const pescoco = bloco(monitor, "monitor_pescoco", 0.04, H_PESCOCO, 0.03,
    [0, H_BASE_MON + H_PESCOCO / 2, 0.01], MAT.chassi, 0.005);
  contato("monitor_pescoco_base", topo(baseMon, H_BASE_MON), base(pescoco, H_PESCOCO));

  const W_BODY = 0.5435, H_BODY = 0.3147, D_BODY = 0.026;
  const Y_BODY_C = H_BASE_MON + H_PESCOCO + H_BODY / 2;
  const corpo = bloco(monitor, "monitor_corpo", W_BODY, H_BODY, D_BODY,
    [0, Y_BODY_C, 0], MAT.corpoMonitor, 0.007);
  contato("monitor_corpo_pescoco", topo(pescoco, H_PESCOCO), base(corpo, H_BODY));

  // Traseira: painel com rotação explícita (texto legível por trás).
  // A chapa fica a +esp/2 no local +y (que aponta para -z), encostando na
  // face traseira do corpo e protruindo 10 mm.
  const traseiraMon = painel(monitor, "monitor_traseira", 0.46, 0.25, 0.01,
    [0, Y_BODY_C, -D_BODY / 2], TRASEIRA, MAT.corpoMonitor, 0.006);
  contato("traseira_corpo", plano(traseiraMon.chapa, [0, -0.005, 0], [0, -1, 0]),
    plano(corpo, [0, 0, -D_BODY / 2], [0, 0, -1]));
  texto(traseiraMon.chapa, "monitor_marca", "SNAPLE", 0.006,
    [0, traseiraMon.esp / 2, -0.03], MAT.logo);
  texto(traseiraMon.chapa, "monitor_medida", "24", 0.003,
    [0, traseiraMon.esp / 2, 0.02], MAT.logo);

  // Grupo-tela: origem na face frontal do corpo; +y local para fora.
  const tela = grupo(monitor, "tela", [0, Y_BODY_C, D_BODY / 2], FRENTE);
  const W_TELA = 0.5215, H_TELA = 0.2927;
  const H_VIDRO = 0.0006;
  const vidro = bloco(tela, "tela_vidro", W_BODY - 0.012, H_VIDRO, H_BODY - 0.012,
    [0, H_VIDRO / 2, 0], MAT.vidroTela, 0.004);
  contato("tela_vidro_corpo", base(vidro, H_VIDRO), plano(corpo, [0, 0, D_BODY / 2], [0, 0, 1]));
  const H_FUNDO = 6e-5;
  const fundo = bloco(tela, "tela_fundo", W_TELA, H_FUNDO, H_TELA,
    [0, H_VIDRO + H_FUNDO / 2, 0], MAT.telaFundo);
  contato("tela_fundo_vidro", base(fundo, H_FUNDO), topo(vidro, H_VIDRO));

  // UI sobre a face do fundo. Coordenadas UI: origem no topo do fundo,
  // +z para baixo. Faixas têm espessura H_UI e base em y = 0 (UI).
  const ui = grupo(tela, "tela_ui", [0, H_VIDRO + H_FUNDO, 0]);
  const H_UI = 6e-5;
  const Z_SUP = -H_TELA / 2, Z_INF = H_TELA / 2;
  const PLANO_FUNDO = plano(fundo, [0, H_FUNDO / 2, 0], [0, 1, 0]);

  // Barra de título
  const H_TIT = 0.018;
  const Z_TIT_C = Z_SUP + H_TIT / 2;
  const titulo = bloco(ui, "ui_titulo", W_TELA, H_UI, H_TIT,
    [0, H_UI / 2, Z_TIT_C], MAT.telaTitulo);
  contato("ui_titulo_fundo", base(titulo, H_UI), PLANO_FUNDO);
  const dots: Material[] = [MAT.arrasteR, MAT.arrasteA, MAT.arrasteV];
  dots.forEach((m, i) => {
    const p = cilindro(titulo, `ui_dot_${i}`, 0.0028, 6e-5,
      [-0.236 + i * 0.0095, H_UI + 3e-5, 0], m, 0, SEM_ROTACAO, d.segmentosTubos);
    contato(`ui_dot_apoio_${i}`, topo(titulo, H_UI), base(p, 6e-5));
  });
  texto(titulo, "ui_titulo_txt", "snaple - setup dev", 0.0028,
    [0, H_UI / 2, -0.0014], MAT.tintaClara);

  // Barra de atividade e sidebar (região do conteúdo, abaixo do título)
  const H_CONTEUDO = H_TELA - H_TIT;
  const Z_CONTEUDO_C = Z_SUP + H_TIT + H_CONTEUDO / 2;
  const W_ATIV = 0.012;
  const xAtiv = -H_TELA / 2 + W_ATIV / 2;
  const atividade = bloco(ui, "ui_atividade", W_ATIV, H_UI, H_CONTEUDO,
    [xAtiv, H_UI / 2, Z_CONTEUDO_C], MAT.telaAtividade);
  contato("ui_atividade_fundo", base(atividade, H_UI), PLANO_FUNDO);
  for (let i = 0; i < 4; i++) {
    const icone = bloco(atividade, `ui_icone_${i}`, 0.005, 3e-5, 0.005,
      [0, H_UI + 1.5e-5, -H_CONTEUDO / 2 + 0.022 + i * 0.021],
      i === 0 ? MAT.iconAtivo : MAT.iconDim);
    contato(`ui_icone_apoio_${i}`, topo(atividade, H_UI), base(icone, 3e-5));
  }

  const W_SIDE = 0.115;
  const xSide = -H_TELA / 2 + W_ATIV + W_SIDE / 2;
  const sidebar = bloco(ui, "ui_sidebar", W_SIDE, H_UI, H_CONTEUDO,
    [xSide, H_UI / 2, Z_CONTEUDO_C], MAT.telaSidebar);
  contato("ui_sidebar_fundo", base(sidebar, H_UI), PLANO_FUNDO);
  const Z_ARQ0 = Z_SUP + H_TIT + 0.016;
  const faixaArquivo = bloco(sidebar, "ui_arquivo_faixa", W_SIDE - 0.006, 3e-5, 0.0068,
    [0, H_UI + 1.5e-5, (Z_ARQ0 + 0.0078 + 0.0013) - Z_CONTEUDO_C], MAT.linhaAtiva);
  contato("ui_arquivo_faixa_apoio", topo(sidebar, H_UI), base(faixaArquivo, 3e-5));
  const arquivos = ["snaple/", "espresso.ts", "setup.ts", "camera.ts", "guia.md", "package.json"];
  arquivos.forEach((arq, i) => {
    const zLocal = (Z_ARQ0 + i * 0.0078) - Z_CONTEUDO_C;
    if (i === 1) {
      texto(faixaArquivo, "ui_arquivo_1", arq, 0.0026,
        [-W_SIDE / 2 + 0.012, 1.5e-5, -0.0013], MAT_CODIGO.arqAtivo, "esq");
    } else {
      texto(sidebar, `ui_arquivo_${i}`, arq, 0.0026,
        [-W_SIDE / 2 + 0.012, H_UI / 2, zLocal], MAT_CODIGO.arq, "esq");
    }
  });
  texto(sidebar, "ui_explorar", "EXPLORAR", 0.0022,
    [-W_SIDE / 2 + 0.007, H_UI / 2, (Z_SUP + H_TIT + 0.006) - Z_CONTEUDO_C], MAT.tintaDim, "esq");

  // Área do editor: guias de abas, gutter e linhas
  const X_EDIT_E = -H_TELA / 2 + W_ATIV + W_SIDE;
  const W_EDIT = H_TELA / 2 - X_EDIT_E;
  const xEditC = X_EDIT_E + W_EDIT / 2;
  const H_ABAS = 0.016;
  const abas = bloco(ui, "ui_abas", W_EDIT, H_UI, H_ABAS,
    [xEditC, H_UI / 2, Z_SUP + H_TIT + H_ABAS / 2], MAT.telaAba);
  contato("ui_abas_fundo", base(abas, H_UI), PLANO_FUNDO);
  const W_ABA = 0.1;
  const aba1 = bloco(abas, "ui_aba_1", W_ABA, 3e-5, H_ABAS - 0.001,
    [X_EDIT_E + W_ABA / 2, H_UI + 1.5e-5, 0], MAT.telaFundo);
  contato("ui_aba_1_apoio", topo(abas, H_UI), base(aba1, 3e-5));
  const aba2 = bloco(abas, "ui_aba_2", W_ABA, 2e-5, H_ABAS - 0.001,
    [X_EDIT_E + W_ABA + 0.002 + W_ABA / 2, H_UI + 1e-5, 0], MAT.telaTitulo);
  contato("ui_aba_2_apoio", topo(abas, H_UI), base(aba2, 2e-5));
  texto(aba1, "ui_aba_1_txt", "espresso.ts", 0.0026,
    [0, 3e-5 / 2, -0.0013], MAT.tintaClara);
  texto(aba2, "ui_aba_2_txt", "setup.ts*", 0.0026,
    [0, 2e-5 / 2, -0.0013], MAT.tintaDim);

  const W_GUTTER = 0.016;
  const Z_GUTTER_SUP = Z_SUP + H_TIT + H_ABAS;
  const H_TERM = 0.086, Z_STATUS = Z_INF - 0.014;
  const H_GUTTER = Z_STATUS - H_TERM - Z_GUTTER_SUP;
  const gutter = bloco(ui, "ui_gutter", W_GUTTER, H_UI, H_GUTTER,
    [X_EDIT_E + W_GUTTER / 2, H_UI / 2, Z_GUTTER_SUP + H_GUTTER / 2], MAT.telaGutter);
  contato("ui_gutter_fundo", base(gutter, H_UI), PLANO_FUNDO);
  const Z_GUTTER_C = Z_GUTTER_SUP + H_GUTTER / 2;

  const LINHAS_CODIGO = opcoes.codigo ?? [
    [
      { t: "import", c: "kw" }, { t: " { " }, { t: "Cena", c: "tipo" },
      { t: " } " }, { t: "from", c: "kw" }, { t: ' "snaple";', c: "str" },
    ],
    null,
    [
      { t: "export", c: "kw" }, { t: " function ", c: "kw" },
      { t: "montarCena", c: "fn" }, { t: "() {" },
    ],
    [
      { t: "  const ", c: "kw" }, { t: "cena" }, { t: " = " },
      { t: "new", c: "kw" }, { t: " " }, { t: "Cena", c: "tipo" }, { t: "();" },
    ],
    [
      { t: "  const ", c: "kw" }, { t: "e02" }, { t: " = " },
      { t: "montarCenaComRefs", c: "fn" }, { t: "({" },
    ],
    "abstrato", "abstrato", "abstrato",
    [{ t: "  });" }],
    [
      { t: "  e02" }, { t: ".ajustarPressao", c: "fn" }, { t: "(" },
      { t: "9", c: "num" }, { t: ");" },
    ],
    [
      { t: "  return", c: "kw" }, { t: " { " }, { t: "cena", c: "prop" },
      { t: ": " }, { t: "e02.cena" }, { t: " };" },
    ],
    [{ t: "}" }],
  ];
  const ALTURA_CODIGO = 0.0031;
  const PASSO_LINHA = 0.0052;
  const X_CODE = X_EDIT_E + W_GUTTER + 0.008;
  const Z_LINHA0 = Z_GUTTER_SUP + 0.009;
  const LINHA_ATIVA = 8; // índice (0-based) da linha com o cursor
  const faixaAtiva = bloco(ui, "ui_linha_ativa", W_EDIT - W_GUTTER, 3e-5, PASSO_LINHA,
    [X_EDIT_E + W_GUTTER + (W_EDIT - W_GUTTER) / 2, 1.5e-5,
     Z_LINHA0 + LINHA_ATIVA * PASSO_LINHA + PASSO_LINHA / 2], MAT.linhaAtiva);
  contato("ui_linha_ativa_apoio", PLANO_FUNDO, base(faixaAtiva, 3e-5));

  LINHAS_CODIGO.forEach((linha, i) => {
    const zTopo = Z_LINHA0 + i * PASSO_LINHA;
    texto(gutter, `ui_numlinha_${i}`, String(i + 1), 0.0024,
      [X_EDIT_E + W_GUTTER / 2, H_UI / 2, zTopo + 0.00035 - Z_GUTTER_C], MAT_CODIGO.numLinha);
    if (linha === "abstrato") {
      linhaAbstrata(ui, `codigo_barras_${i}`, i, X_CODE, H_UI / 2, zTopo, ALTURA_CODIGO);
    } else if (linha) {
      const yFace = i === LINHA_ATIVA ? 3e-5 : H_UI / 2;
      const xFim = linhaTokens(ui, `codigo_${i}`, linha, X_CODE, yFace, zTopo, ALTURA_CODIGO);
      if (i === LINHA_ATIVA) {
        const cursor = bloco(ui, "codigo_cursor", 0.0006, TINTA, ALTURA_CODIGO,
          [xFim + 0.001, 3e-5 + TINTA / 2, zTopo + ALTURA_CODIGO / 2], MAT.tintaClara);
        contato("codigo_cursor_apoio", topo(faixaAtiva, 3e-5), base(cursor, TINTA));
      }
    }
  });

  // Terminal (docked) na parte inferior
  const Z_TERM_C = Z_STATUS - H_TERM / 2;
  const term = bloco(ui, "ui_terminal", W_TELA, H_UI, H_TERM,
    [0, H_UI / 2, Z_TERM_C], MAT.telaTerm);
  contato("ui_terminal_fundo", base(term, H_UI), PLANO_FUNDO);
  if (d.miudezas) {
    bloco(term, "ui_term_icone", 0.004, 3e-5, 0.004,
      [H_TELA / 2 - 0.012, H_UI + 1.5e-5, H_TERM / 2 - 0.011], MAT.iconDim);
  }
  const LINHAS_TERM = opcoes.terminal ?? [
    "$ snaple build",
    "0 avisos - montagem ok",
    "$ snaple run setup.ts",
    "pronto em 42 ms",
  ];
  texto(term, "ui_term_cab", "TERMINAL", 0.002,
    [-H_TELA / 2 + 0.01, H_UI / 2, -H_TERM / 2 + 0.0035], MAT.tintaDim, "esq");
  LINHAS_TERM.forEach((ln, i) => {
    const zTopo = -H_TERM / 2 + 0.0175 + i * 0.0062;
    const x0 = -H_TELA / 2 + 0.01;
    if (ln.startsWith("$ ")) {
      linhaTokens(term, `term_${i}`,
        [{ t: "$", c: "tipo" }, { t: " " }, { t: ln.slice(2) }],
        x0, H_UI / 2, zTopo, 0.0028);
    } else if (i === LINHAS_TERM.length - 1) {
      texto(term, `term_${i}`, ln, 0.0028, [x0, H_UI / 2, zTopo], MAT_CODIGO.term, "esq");
    } else {
      texto(term, `term_${i}`, ln, 0.0028, [x0, H_UI / 2, zTopo], MAT_CODIGO.com, "esq");
    }
  });

  // Barra de status
  const H_STATUS = 0.014;
  const status = bloco(ui, "ui_status", W_TELA, H_UI, H_STATUS,
    [0, H_UI / 2, Z_INF - H_STATUS / 2], MAT.telaStatus);
  contato("ui_status_fundo", base(status, H_UI), PLANO_FUNDO);
  texto(status, "ui_status_esq", "main  TS  UTF-8", 0.0022,
    [-H_TELA / 2 + 0.105, H_UI / 2, -0.0011], MAT.tintaClara);
  texto(status, "ui_status_dir", "Ln 9, Col 24", 0.0022,
    [H_TELA / 2 - 0.075, H_UI / 2, -0.0011], MAT.tintaClara);

  // LED de energia na moldura inferior
  if (d.miudezas) {
    const led = bloco(tela, "monitor_led", 0.005, 3e-5, 0.0012,
      [H_TELA / 2 - 0.014, 1.5e-5, H_BODY / 2 - 0.0055], MAT.ledCiano);
    contato("monitor_led_corpo", base(led, 3e-5), plano(corpo, [0, 0, D_BODY / 2], [0, 0, 1]));
  }

  // Cabo do monitor: soquete embutido na base traseira + corrida no tampo.
  // O cabo roda em -z (rotação [-PI/2, 0, 0]): topo da haste em local -y,
  // face inferior tangente em local -z.
  const soqueteMon = bloco(baseMon, "monitor_soquete", 0.006, 0.005, 0.004,
    [0, -0.0035, -0.068], MAT.baquelite, 0.001);
  embutir(baseMon, soqueteMon, "Soquete de cabo embutido na borda traseira da base do monitor.");
  const cabMon = haste(monitor, "monitor_cabo", [0, 0.0025, -0.07], [0, 0.0025, -0.123],
    0.0025, MAT.cabos);
  contato("monitor_cabo_soquete", plano(cabMon, [0, -0.0265, 0], [0, -1, 0]),
    plano(soqueteMon, [0, 0, -0.002], [0, 0, -1]));
  contato("monitor_cabo_mesa", plano(cabMon, [0, 0, -0.0025], [0, 0, -1]),
    plano(tampo, [0, H_TAMPO / 2, 0], [0, 1, 0]));

  // -------------------------------------------------------------------------
  // 3. Teclado mecânico de 60 teclas sobre o tapete.
  //    Case = fundo sólido + 4 paredes (cavidade real para as teclas).
  // -------------------------------------------------------------------------

  const X_TECL = -0.1, Z_TECL = 0.1;
  const teclado = grupo(raiz, "teclado", [X_TECL, Y_TOPO + 0.004, Z_TECL]);
  const U = 0.0204, LINHA_PITCH = 0.0208, GAP = 0.0022;
  const H_PES_TECL = 0.0015, H_CASE = 0.014, H_TECLA = 0.0038;
  const W_CASE = 15 * U + 0.024, D_CASE = 5 * LINHA_PITCH + 0.03;
  const H_FONDE_CASE = 0.009, H_PAREDE_CASE = H_CASE - H_FONDE_CASE;
  const Y_FONDE_C = H_PES_TECL + H_FONDE_CASE / 2;
  const Y_PAREDE_C = H_PES_TECL + H_FONDE_CASE + H_PAREDE_CASE / 2;
  const H_PLACA_TOP = H_PES_TECL + H_FONDE_CASE + 0.004;

  const pesTecl: No[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pe = bloco(teclado, `teclado_pe_${sx}_${sz}`, 0.012, H_PES_TECL, 0.012,
      [sx * (W_CASE / 2 - 0.016), H_PES_TECL / 2, sz * (D_CASE / 2 - 0.014)],
      MAT.borracha, 0.002);
    pesTecl.push(pe);
    contato(`teclado_pe_tapete_${sx}_${sz}`, topo(tapete, 0.004), base(pe, H_PES_TECL));
  }
  const caseFundo = bloco(teclado, "teclado_fundo", W_CASE, H_FONDE_CASE, D_CASE,
    [0, Y_FONDE_C, 0], MAT.chassi, 0.003);
  pesTecl.forEach((pe, i) => contato(`teclado_fundo_pe_${i}`, topo(pe, H_PES_TECL), base(caseFundo, H_FONDE_CASE)));
  const paredesCase: No[] = [];
  for (const s of [-1, 1]) {
    const z = bloco(teclado, `teclado_parede_z_${s}`, W_CASE, H_PAREDE_CASE, 0.004,
      [0, Y_PAREDE_C, s * (D_CASE / 2 - 0.002)], MAT.chassi, 0.002);
    const x = bloco(teclado, `teclado_parede_x_${s}`, 0.004, H_PAREDE_CASE, D_CASE - 0.008,
      [s * (W_CASE / 2 - 0.002), Y_PAREDE_C, 0], MAT.chassi, 0.002);
    paredesCase.push(z, x);
    contato(`teclado_parede_z_fundo_${s}`, topo(caseFundo, H_FONDE_CASE), base(z, H_PAREDE_CASE));
    contato(`teclado_parede_x_fundo_${s}`, topo(caseFundo, H_FONDE_CASE), base(x, H_PAREDE_CASE));
  }
  const paredeTras = paredesCase[0];
  const placa = bloco(teclado, "teclado_placa", W_CASE - 0.024, 0.004, D_CASE - 0.03,
    [0, H_PES_TECL + H_FONDE_CASE + 0.002, 0], MAT.keycapEspaco);
  contato("teclado_placa_fundo", topo(caseFundo, H_FONDE_CASE), base(placa, 0.004));

  type Tecla = [number, string];
  const TECLADO: Tecla[][] = [
    [[1.5, "ESC"], [1, "1"], [1, "2"], [1, "3"], [1, "4"], [1, "5"], [1, "6"], [1, "7"], [1, "8"], [1, "9"], [1, "0"], [1, "-"], [1, "="], [1.5, "DEL"]],
    [[1.5, "TAB"], [1, "Q"], [1, "W"], [1, "E"], [1, "R"], [1, "T"], [1, "Y"], [1, "U"], [1, "I"], [1, "O"], [1, "P"], [1, "["], [1, "]"], [1, "\\"]],
    [[1.75, "CAPS"], [1, "A"], [1, "S"], [1, "D"], [1, "F"], [1, "G"], [1, "H"], [1, "J"], [1, "K"], [1, "L"], [1, ";"], [1, "'"], [2.25, "RET"]],
    [[2.5, "SHIFT"], [1, "Z"], [1, "X"], [1, "C"], [1, "V"], [1, "B"], [1, "N"], [1, "M"], [1, ","], [1, "."], [1, "/"], [2.5, "SHIFT"]],
    [[1.5, "CTRL"], [1.5, "ALT"], [1.5, "FN"], [6, ""], [1.5, ","], [1.5, "."], [1.5, "/"]],
  ];
  TECLADO.forEach((linha, r) => {
    const z = -2 * LINHA_PITCH + r * LINHA_PITCH;
    let cum = 0;
    linha.forEach(([wU, legenda], c) => {
      const x = -15 * U / 2 + (cum + wU / 2) * U;
      const matTecla = legenda === "S" ? MAT.pintura : (wU >= 6 ? MAT.keycapEspaco : MAT.keycap);
      const tecla = bloco(teclado, `tecla_${r}_${c}`, wU * U - GAP, H_TECLA, LINHA_PITCH - GAP,
        [x, H_PLACA_TOP + H_TECLA / 2, z], matTecla, 0.0016);
      contato(`tecla_${r}_${c}_placa`, topo(placa, 0.004), base(tecla, H_TECLA));
      if (legenda) {
        texto(tecla, `tecla_${r}_${c}_leg`, legenda, legenda.length > 1 ? 0.001 : 0.0011,
          [0, H_TECLA / 2, -0.00055], MAT.tintaClara);
      }
      cum += wU;
    });
  });

  // Cabo do teclado: soquete na base traseira do case + corrida sobre o tapete.
  const soqueteTecl = bloco(caseFundo, "teclado_soquete", 0.006, 0.005, 0.004,
    [0.06, -0.0035, -0.065], MAT.baquelite, 0.001);
  embutir(caseFundo, soqueteTecl, "Soquete de cabo embutido na base traseira do case (filete de 1,5 mm abaixo do fundo, no patamar dos pés).");
  const cabTecl = haste(teclado, "teclado_cabo", [0.06, 0.0025, -0.067], [0.06, 0.0025, -0.443],
    0.0025, MAT.cabos);
  contato("teclado_cabo_soquete", plano(cabTecl, [0, -0.188, 0], [0, -1, 0]),
    plano(soqueteTecl, [0, 0, -0.002], [0, 0, -1]));
  contato("teclado_cabo_tapete", plano(cabTecl, [0, 0, -0.0025], [0, 0, -1]),
    plano(tapete, [0, 0.002, 0], [0, 1, 0]));

  // -------------------------------------------------------------------------
  // 4. Mouse: corpo, botões embutidos, roda móvel e logotipo.
  // -------------------------------------------------------------------------

  const X_MOUSE = 0.17, Z_MOUSE = 0.1;
  const mouse = grupo(raiz, "mouse", [X_MOUSE, Y_TOPO + 0.004, Z_MOUSE]);
  const H_MOUSE = 0.02;
  const corpoMouse = bloco(mouse, "mouse_corpo", 0.064, H_MOUSE, 0.108,
    [0, H_MOUSE / 2, 0], MAT.chassi, 0.01);
  contato("mouse_tapete", topo(tapete, 0.004), base(corpoMouse, H_MOUSE));
  for (const s of [-1, 1]) {
    const botao = bloco(corpoMouse, `mouse_botao_${s}`, 0.0295, 0.0025, 0.04,
      [s * 0.0155, H_MOUSE / 2 - 0.0006, 0.026], MAT.keycapEspaco, 0.008);
    embutir(corpoMouse, botao, "Botão embutido no topo do corpo; sobreposição pai-filho de 1,2 mm intencional.");
  }
  // Mount fixo (eixo do rolete ao longo de x local); o filho gira em torno
  // do próprio eixo (local +y) sem alterar a orientação da montura.
  const rodaMount = grupo(corpoMouse, "mouse_roda_mount", [0, 0.0165, 0.008], [0, 0, PI / 2]);
  const rodaMouse = grupo(rodaMount, "mouse_roda", [0, 0, 0], SEM_ROTACAO);
  const roda = cilindro(rodaMouse, "mouse_roda_cil", 0.0062, 0.0058,
    [0, 0, 0], MAT.borracha, 0.0004, SEM_ROTACAO, d.segmentosTubos);
  embutir(corpoMouse, roda, "Roda de rolagem embutida no corpo; só a crista fica exposta.");
  if (d.miudezas) {
    const entalhe = bloco(roda, "mouse_roda_entalhe", 0.0012, 0.006, 0.003,
      [-0.0056, 0, 0], MAT.baquelite);
    embutir(roda, entalhe, "Entalhe de tração embutido na crista da roda.");
  }
  pivo("pivo_roda_mouse",
    { no: rodaMount, ponto: [0, 0, 0], eixo: [0, 1, 0] },
    { no: rodaMouse, ponto: [0, 0, 0], eixo: [0, 1, 0] });
  if (d.miudezas) {
    const marca = bloco(corpoMouse, "mouse_marca", 0.004, 0.0005, 0.0015,
      [0, H_MOUSE / 2 + 0.00025, -0.035], MAT.pintura);
    contato("mouse_marca_apoio", topo(corpoMouse, H_MOUSE), base(marca, 0.0005));
  }
  const soqueteMouse = bloco(corpoMouse, "mouse_soquete", 0.005, 0.005, 0.004,
    [0, -0.0075, -0.052], MAT.baquelite, 0.001);
  embutir(corpoMouse, soqueteMouse, "Soquete de cabo embutido na traseira baixa do corpo do mouse.");
  const cabMouse = haste(mouse, "mouse_cabo", [0, 0.0025, -0.054], [0, 0.0025, -0.443],
    0.0025, MAT.cabos);
  contato("mouse_cabo_soquete", plano(cabMouse, [0, -0.1945, 0], [0, -1, 0]),
    plano(soqueteMouse, [0, 0, -0.002], [0, 0, -1]));
  contato("mouse_cabo_tapete", plano(cabMouse, [0, 0, -0.0025], [0, 0, -1]),
    plano(tapete, [0, 0.002, 0], [0, 1, 0]));

  // -------------------------------------------------------------------------
  // 5. Torre ATX com vidro lateral, GPU de duas ventoinhas e interior.
  // -------------------------------------------------------------------------

  const X_TORRE = 0.48, Z_TORRE = -0.13;
  const W_TORRE = 0.195, H_TORRE = 0.42, D_TORRE = 0.4;
  const torre = grupo(raiz, "torre", [X_TORRE, Y_TOPO, Z_TORRE]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pe = bloco(torre, `torre_pe_${sx}_${sz}`, 0.03, 0.002, 0.03,
      [sx * (W_TORRE / 2 - 0.03), 0.001, sz * (D_TORRE / 2 - 0.04)],
      MAT.borracha, 0.002);
    contato(`torre_pe_mesa_${sx}_${sz}`, topo(tampo, H_TAMPO), base(pe, 0.002));
  }
  const Y_CH = 0.002, H_CH = H_TORRE - 0.002, Y_CH_C = Y_CH + H_CH / 2;
  const H_PAINEL = H_CH - 0.012;
  const frente = bloco(torre, "torre_frente", W_TORRE, H_PAINEL, 0.006,
    [0, Y_CH_C, D_TORRE / 2 - 0.003], MAT.chassi, 0.003);
  const traseira = bloco(torre, "torre_traseira", W_TORRE, H_PAINEL, 0.006,
    [0, Y_CH_C, -D_TORRE / 2 + 0.003], MAT.chassi, 0.003);
  const teto = bloco(torre, "torre_teto", W_TORRE, 0.006, D_TORRE - 0.012,
    [0, Y_CH + H_CH - 0.003, 0], MAT.chassi, 0.003);
  const chao = bloco(torre, "torre_chao", W_TORRE, 0.006, D_TORRE - 0.012,
    [0, Y_CH + 0.003, 0], MAT.chassi, 0.003);
  const lateralDir = bloco(torre, "torre_lateral_direita", 0.006, H_PAINEL, D_TORRE - 0.012,
    [W_TORRE / 2 - 0.003, Y_CH_C, 0], MAT.chassi, 0.002);
  // Contatos de aresta (planos coincidentes nas bordas de encontro)
  contato("torre_frente_teto", plano(frente, [0, H_PAINEL / 2, 0], [0, 1, 0]), base(teto, 0.006));
  contato("torre_frente_chao", plano(frente, [0, -H_PAINEL / 2, 0], [0, -1, 0]), topo(chao, 0.006));
  contato("torre_traseira_teto", plano(traseira, [0, H_PAINEL / 2, 0], [0, 1, 0]), base(teto, 0.006));
  contato("torre_traseira_chao", plano(traseira, [0, -H_PAINEL / 2, 0], [0, -1, 0]), topo(chao, 0.006));
  contato("torre_lateral_teto", plano(lateralDir, [0, H_PAINEL / 2, 0], [0, 1, 0]), base(teto, 0.006));
  contato("torre_lateral_chao", plano(lateralDir, [0, -H_PAINEL / 2, 0], [0, -1, 0]), topo(chao, 0.006));

  // Moldura do vidro (lado -x) e lâmina de vidro temperado
  const X_VIDRO = -W_TORRE / 2 + 0.003;
  const moldura: No[] = [];
  const molduraY = [-1, 1].map(s => {
    const h = bloco(torre, `torre_moldura_y_${s}`, 0.006, 0.006, D_TORRE - 0.006,
      [X_VIDRO, Y_CH + (s < 0 ? 0.009 : H_CH - 0.009), 0], MAT.chassi, 0.002);
    moldura.push(h);
    if (s < 0) contato("torre_moldura_inf_chao", topo(chao, 0.006), base(h, 0.006));
    else contato("torre_moldura_sup_teto", base(teto, 0.006), topo(h, 0.006));
    return h;
  });
  const molduraZ = [-1, 1].map(s => {
    const v = bloco(torre, `torre_moldura_z_${s}`, 0.006, H_CH - 0.024, 0.006,
      [X_VIDRO, Y_CH_C, s * (D_TORRE / 2 - 0.006)], MAT.chassi, 0.002);
    moldura.push(v);
    contato(`torre_moldura_z_${s}_painel`,
      plano(v, [0, 0, s * 0.003], [0, 0, s]),
      plano(s < 0 ? traseira : frente, [0, 0, (s < 0 ? 1 : -1) * 0.003], [0, 0, s < 0 ? 1 : -1]));
    return v;
  });
  const vidroLam = bloco(torre, "torre_vidro", 0.0035, H_CH - 0.024, D_TORRE - 0.018,
    [X_VIDRO - 0.00125, Y_CH_C, 0], MAT.vidroLamina);
  moldura.forEach((m, i) => contato(`torre_vidro_moldura_${i}`,
    plano(m, [-0.003, 0, 0], [-1, 0, 0]), plano(vidroLam, [-0.00175, 0, 0], [-1, 0, 0])));

  // Travessas internas que ligam teto e piso (estrutura rígida)
  const postes: Array<[number, number]> = [[0.062, -0.15], [0.062, 0.15]];
  postes.forEach(([x, z], i) => {
    const poste = bloco(torre, `torre_poste_${i}`, 0.005, H_CH - 0.012, 0.005,
      [x, Y_CH_C, z], MAT.aco, 0.001);
    contato(`torre_poste_teto_${i}`, base(teto, 0.006), topo(poste, H_CH - 0.012));
    contato(`torre_poste_chao_${i}`, topo(chao, 0.006), base(poste, H_CH - 0.012));
  });

  // Interior: placa-mãe, RAM, GPU com ventoinhas e fonte.
  const interior = grupo(torre, "torre_interior");
  const X_PCB = 0.07, H_PCB = 0.3, D_PCB = 0.36;
  const pcbPlaca = bloco(interior, "torre_pcb", 0.0025, H_PCB, D_PCB,
    [X_PCB, Y_CH_C, 0], MAT.pcb);
  const X_FACE_LATERAL = W_TORRE / 2 - 0.006;
  const X_FACE_PCB = X_PCB + 0.00125;
  const L_STANDOFF = X_FACE_LATERAL - X_FACE_PCB;
  for (const yOff of [0.09, 0.33]) for (const sz of [-1, 1]) {
    const y = Y_CH + yOff;
    const yLocal = y - Y_CH_C;
    const standoff = cilindro(interior, `torre_standoff_${yOff}_${sz}`, 0.0025, L_STANDOFF,
      [(X_FACE_LATERAL + X_FACE_PCB) / 2, y, sz * 0.12],
      MAT.cobreEscuro, 0, [0, 0, PI / 2], d.segmentosTubos);
    contato(`standoff_lateral_${yOff}_${sz}`,
      plano(lateralDir, [-0.003, yLocal, sz * 0.12], [-1, 0, 0]),
      plano(standoff, [0, -L_STANDOFF / 2, 0], [0, -1, 0]));
    contato(`standoff_pcb_${yOff}_${sz}`,
      plano(standoff, [0, L_STANDOFF / 2, 0], [0, 1, 0]),
      plano(pcbPlaca, [0.00125, yLocal, sz * 0.12], [1, 0, 0]));
  }
  // Memórias (duas) apoiadas na face da placa
  for (const i of [0, 1]) {
    const ram = bloco(interior, `torre_ram_${i}`, 0.004, 0.125, 0.008,
      [X_PCB - 0.00325, Y_CH + 0.26, 0.02 + i * 0.022], MAT.keycapEspaco, 0.001);
    contato(`ram_pcb_${i}`, plano(ram, [0.002, 0, 0], [1, 0, 0]),
      plano(pcbPlaca, [-0.00125, 0.05, 0.02 + i * 0.022], [-1, 0, 0]));
    const acento = bloco(ram, `torre_ram_acento_${i}`, 0.0042, 0.0015, 0.0082,
      [0, 0.125 / 2 + 0.00075, 0], MAT.pintura);
    contato(`ram_acento_apoio_${i}`, topo(ram, 0.125), base(acento, 0.0015));
  }
  // Chips pequenos
  for (const [yOff, z, w] of [[0.16, -0.075, 0.012], [0.3, 0.02, 0.008]] as Array<[number, number, number]>) {
    const chip = bloco(interior, `torre_chip_${z}`, 0.003, w, w,
      [X_PCB - 0.00275, Y_CH + yOff, z], MAT.shroud, 0.0005);
    contato(`chip_pcb_${z}`, plano(chip, [0.0015, 0, 0], [1, 0, 0]),
      plano(pcbPlaca, [-0.00125, yOff - 0.21, z], [-1, 0, 0]));
  }

  const H_PSU = 0.156;
  const Y_PSU_TOP = Y_CH + 0.006 + H_PSU;
  const psu = bloco(interior, "torre_psu_shroud", 0.15, H_PSU, D_TORRE - 0.006,
    [-0.018, Y_CH + 0.006 + H_PSU / 2, 0], MAT.chassi, 0.002);
  contato("psu_chao", topo(chao, 0.006), base(psu, H_PSU));

  const W_SHROUD = 0.013, H_SHROUD = 0.105, D_SHROUD = 0.275;
  const X_SHROUD = 0.022;
  const Y_GPU = Y_PSU_TOP + H_SHROUD / 2;
  const shroud = bloco(interior, "torre_gpu_shroud", W_SHROUD, H_SHROUD, D_SHROUD,
    [X_SHROUD, Y_GPU, 0], MAT.shroud, 0.002);
  contato("gpu_psu", topo(psu, H_PSU), base(shroud, H_SHROUD));
  if (d.miudezas) {
    bloco(shroud, "torre_gpu_acento", 0.0132, 0.002, D_SHROUD - 0.01,
      [0, -H_SHROUD / 2 + 0.006, 0], MAT.ledCiano);
    for (let i = 0; i < 9; i++) {
      bloco(shroud, `torre_gpu_alta_${i}`, 0.011, 0.0009, D_SHROUD - 0.015,
        [0.0013, (i - 4) * 0.011, 0], MAT.cobre);
    }
  }
  // Abas que prendem a GPU à placa-mãe
  for (const [s, z] of [[1, 0.09], [-1, -0.09]] as Array<[number, number]>) {
    const y = Y_GPU + s * 0.04;
    const W_ABA = X_FACE_PCB - (X_SHROUD + W_SHROUD / 2);
    const aba = bloco(interior, `torre_gpu_aba_${s}_${z}`, W_ABA, 0.004, 0.008,
      [(X_FACE_PCB + X_SHROUD + W_SHROUD / 2) / 2, y, z], MAT.keycapEspaco, 0.001);
    contato(`gpu_aba_shroud_${s}_${z}`,
      plano(aba, [-W_ABA / 2, 0, 0], [-1, 0, 0]),
      plano(shroud, [W_SHROUD / 2, s * 0.04, z], [1, 0, 0]));
    contato(`gpu_aba_pcb_${s}_${z}`,
      plano(aba, [W_ABA / 2, 0, 0], [1, 0, 0]),
      plano(pcbPlaca, [-0.00125, y - Y_CH_C, z], [-1, 0, 0]));
  }
  // Cabos internos (placa → fonte), retos e paralelos à placa
  const L_CABO_INT = Y_CH_C + H_PCB / 2 + 0.002 - (Y_PSU_TOP + 0.002);
  const caboInt0 = haste(interior, "torre_cabo_0", [X_PCB, Y_CH_C + H_PCB / 2 + 0.002, -0.1],
    [X_PCB, Y_PSU_TOP + 0.002, -0.1], 0.002, MAT.cabos);
  contato("cabo_int0_psu", base(caboInt0, L_CABO_INT), topo(psu, H_PSU));
  const caboInt1 = haste(interior, "torre_cabo_1", [X_PCB, Y_CH_C + H_PCB / 2 + 0.002, 0.1],
    [X_PCB, Y_PSU_TOP + 0.002, 0.1], 0.002, MAT.cabos);
  contato("cabo_int1_psu", base(caboInt1, L_CABO_INT), topo(psu, H_PSU));

  // Ventoinhas da GPU (móveis), voltadas para o vidro (-x)
  const H_PASTILA = 0.005;
  const X_FAN = -W_SHROUD / 2 + H_PASTILA / 2; // aro apoiado na face do shroud
  const anguloVentoinha = opcoes.anguloVentoinha ?? 0;
  const ventoinhas: No[] = [];
  for (const sz of [-1, 1]) {
    // Mount fixo (eixo do fan ao longo de +x local do shroud); o filho gira
    // em torno do próprio eixo (local +y), sem alterar a orientação da montura.
    const fanMount = grupo(shroud, `torre_fan_mount_${sz}`, [X_FAN, 0, sz * 0.078],
      [0, 0, -PI / 2]);
    const fan = grupo(fanMount, `torre_fan_${sz}`, [0, 0, 0], [0, anguloVentoinha, 0]);
    ventoinhas.push(fan);
    const aro = anel(fan, `torre_fan_aro_${sz}`, 0.028, 0.04, H_PASTILA,
      [0, 0, 0], MAT.shroud, SEM_ROTACAO, d.segmentosOptica);
    contato(`fan_aro_shroud_${sz}`, base(aro, H_PASTILA),
      plano(shroud, [-W_SHROUD / 2, 0, sz * 0.078], [-1, 0, 0]));
    const cubo = cilindro(fan, `torre_fan_cubo_${sz}`, 0.01, 0.007,
      [0, -0.0015, 0], MAT.keycapEspaco, 0.0006, SEM_ROTACAO, d.segmentosTubos);
    embutir(shroud, cubo, "Cubo do eixo parcialmente embutido no shroud (via fan-pai); união intencional.");
    if (d.miudezas) {
      const ponto = cilindro(cubo, `torre_fan_ponto_${sz}`, 0.004, 0.0008,
        [0, -0.0035, 0], MAT.ledCiano, 0, SEM_ROTACAO, d.segmentosTubos);
      contato(`fan_ponto_cubo_${sz}`, plano(ponto, [0, 0, 0], [0, -1, 0]),
        plano(cubo, [0, -0.0035, 0], [0, -1, 0]));
    }
    for (let i = 0; i < 7; i++) {
      const a = i * TAU / 7;
      const pata = bloco(cubo, `torre_fan_pata_${sz}_${i}`, 0.018, 0.006, 0.0007,
        [0.0185 * Math.cos(a), 0, 0.0185 * Math.sin(a)], MAT.keycapEspaco, 0.0003,
        [0.55, a, 0]);
      embutir(cubo, pata, "Raiz da pá encaixada no cubo central; união pai-filho intencional.");
    }
    pivo(`pivo_fan_${sz}`,
      { no: fanMount, ponto: [0, 0, 0], eixo: [0, 1, 0] },
      { no: fan, ponto: [0, 0, 0], eixo: [0, 1, 0] });
  }

  // Frente da torre: botão, faixa de LED, logo e portas USB
  const frenteGrp = grupo(torre, "torre_frente_grp", [0, Y_CH_C, D_TORRE / 2], FRENTE);
  const yLocal = (yMundo: number) => yMundo - Y_CH_C;
  const zLocalFrente = (yMundo: number) => -(yMundo - Y_CH_C);
  texto(frenteGrp, "torre_logo", "SNAPLE", 0.0075,
    [0, 0, zLocalFrente(0.33)], MAT.logo);
  const botaoPwr = cilindro(frenteGrp, "torre_botao", 0.006, 0.0008,
    [0.055, 0.0004, zLocalFrente(0.38)], MAT.keycapEspaco, 0.0002,
    SEM_ROTACAO, d.segmentosTubos);
  contato("torre_botao_frente", base(botaoPwr, 0.0008),
    plano(frente, [0.055, yLocal(0.38), 0.003], [0, 0, 1]));
  if (d.miudezas) {
    const anelPwr = anel(frenteGrp, "torre_botao_anel", 0.006, 0.0075, 0.0008,
      [0.055, 0.0004, zLocalFrente(0.38)], MAT.logo);
    contato("torre_botao_anel_frente", base(anelPwr, 0.0008),
      plano(frente, [0.055, yLocal(0.38), 0.003], [0, 0, 1]));
    const faixaLed = bloco(frenteGrp, "torre_faixa_led", 0.003, 0.14, 0.0012,
      [-0.07, 0.0006, 0], MAT.ledCiano);
    contato("torre_faixa_led_frente", base(faixaLed, 0.0012),
      plano(frente, [-0.07, 0, 0.003], [0, 0, 1]));
    for (const i of [0, 1]) {
      const usb = bloco(frenteGrp, `torre_usb_${i}`, 0.009, 0.003, 0.0012,
        [0.02 + i * 0.016, 0.0015, zLocalFrente(0.03)], MAT.baquelite, 0.0004);
      contato(`torre_usb_apoio_${i}`, base(usb, 0.003),
        plano(frente, [0.02 + i * 0.016, yLocal(0.03), 0.003], [0, 0, 1]));
    }
  }
  // Botão no teto: embutido 1,5 mm (unidade pai-filho)
  const botaoTopo = cilindro(teto, "torre_botao_topo", 0.005, 0.0015,
    [0.045, Y_CH + H_CH, -0.15], MAT.keycapEspaco, 0.0003,
    SEM_ROTACAO, d.segmentosTubos);
  embutir(teto, botaoTopo, "Botão de energia embutido no teto; sobreposição pai-filho de 0,75 mm.");

  // Cabo de energia: soquete no piso traseiro + curta corrida à borda da mesa.
  const soqueteTorre = bloco(chao, "torre_soquete", 0.006, 0.005, 0.004,
    [0.05, -0.0025, -0.19], MAT.baquelite, 0.001);
  embutir(chao, soqueteTorre, "Soquete de energia embutido no piso traseiro da torre (filete de 2 mm abaixo do piso, no patamar dos pés).");
  const cabTorre = haste(torre, "torre_cabo", [0.05, 0.0025, -0.192], [0.05, 0.0025, -0.218],
    0.0025, MAT.cabos);
  contato("torre_cabo_soquete", plano(cabTorre, [0, -0.013, 0], [0, -1, 0]),
    plano(soqueteTorre, [0, 0, -0.002], [0, 0, -1]));
  contato("torre_cabo_mesa", plano(cabTorre, [0, 0, -0.0025], [0, 0, -1]),
    plano(tampo, [0, H_TAMPO / 2, 0], [0, 1, 0]));

  // -------------------------------------------------------------------------
  // 6. Caneca de espresso (homenagem à E-02) com alça.
  // -------------------------------------------------------------------------

  let caneca: No | null = null;
  if (opcoes.comCaneca !== false) {
    caneca = grupo(raiz, "caneca", [0.31, Y_TOPO, 0.1]);
    const corpoCaneca = torneado(caneca, "caneca_porcelana", [
      [0, -0.046], [0.03, -0.046], [0.0345, -0.04], [0.036, -0.02],
      [0.036, 0.04], [0.036, 0.046], [0.0325, 0.046], [0.0305, 0.042],
      [0.029, -0.02], [0.0285, -0.038], [0, -0.038], [0, -0.046],
    ], [0, 0.046, 0], MAT.ceramica, d.segmentosOptica);
    contato("caneca_mesa", topo(tampo, H_TAMPO), base(corpoCaneca, 0.092));
    const cafe = cilindro(caneca, "caneca_cafe", 0.0275, 0.004,
      [0, -0.036, 0], { cor: "#4A2E1B", metalico: 0, rugosidade: 0.3 },
      0, SEM_ROTACAO, d.segmentosTubos);
    contato("caneca_cafe_fundo", plano(caneca, [0, -0.038, 0], [0, 1, 0]), base(cafe, 0.004));
    const crema = anel(caneca, "caneca_crema", 0.012, 0.027, 0.0012,
      [0, -0.0334, 0], { cor: "#B9844B", metalico: 0, rugosidade: 0.5 },
      SEM_ROTACAO, d.segmentosTubos);
    contato("caneca_crema_cafe", topo(cafe, 0.004), base(crema, 0.0012));
    const alca = argola(corpoCaneca, "caneca_alca", 0.014, 0.0035,
      [0, 0.006, 0.048], MAT.ceramica, [0, 0, PI / 2]);
    embutir(corpoCaneca, alca, "Alça cerâmica fundida na parede direita; interpenetração pai-filho localizada.");
  }

  // -------------------------------------------------------------------------
  // 7. Notebook com caneta (geometria, sem texto nativo).
  // -------------------------------------------------------------------------

  let notebook: No | null = null;
  if (opcoes.comNotebook !== false) {
    notebook = grupo(raiz, "notebook", [-0.545, Y_TOPO, 0.02], [0, 0.12, 0]);
    const paginas = bloco(notebook, "notebook_paginas", 0.2, 0.0018, 0.27,
      [0, 0.0009, 0], MAT.papel, 0.001);
    contato("notebook_mesa", topo(tampo, H_TAMPO), base(paginas, 0.0018));
    const capa = bloco(notebook, "notebook_capa", 0.205, 0.0028, 0.275,
      [0, 0.0018 + 0.0014, 0], MAT.capucha, 0.002);
    contato("notebook_capa_paginas", topo(paginas, 0.0018), base(capa, 0.0028));
    const elastico = bloco(capa, "notebook_elastico", 0.0015, 0.0032, 0.2752,
      [0.055, 0, 0], MAT.pintura);
    embutir(capa, elastico, "Faixa elástica prensada na capa; sobreposição pai-filho de décimos de mm.");
    texto(capa, "notebook_marca", "snaple", 0.008,
      [0, 0.0014, -0.004], MAT.logo);
    // Caneta deitada na capa
    const caneta = grupo(capa, "caneta", [0.03, 0.0014 + 0.0045, -0.06], [0, 0.5, 0]);
    const canetaLocal = grupo(caneta, "caneta_local", [0, 0, 0], [0, 0, PI / 2]);
    const corpoCaneta = cilindro(canetaLocal, "caneta_corpo", 0.0045, 0.14,
      [0, 0, 0], MAT.chassi, 0.0006, SEM_ROTACAO, d.segmentosTubos);
    // Apoio: plano tangente no gerador mais baixo do cilindro (rotações
    // Ry/Rz preservam o eixo y local, então o "baixo" continua em -y).
    contato("caneta_capa", plano(corpoCaneta, [0, -0.0045, 0], [0, -1, 0]),
      plano(capa, [0.03, 0.0014, -0.06], [0, 1, 0]));
    anel(canetaLocal, "caneta_anilha", 0.0045, 0.0052, 0.014,
      [0, 0.045, 0], MAT.cobre, SEM_ROTACAO, d.segmentosTubos);
    const ponta = torneado(canetaLocal, "caneta_ponta", [
      [0, -0.01], [0.0036, -0.002], [0.0036, 0], [0, 0], [0, -0.01],
    ], [0, -0.07, 0], MAT.borracha, d.segmentosTubos);
    contato("caneta_ponta_corpo", base(corpoCaneta, 0.14), plano(ponta, [0, 0, 0], [0, 1, 0]));
    if (d.miudezas) {
      const clipe = bloco(corpoCaneta, "caneta_clipe", 0.0012, 0.03, 0.0025,
        [0.004, 0.04, 0], MAT.cobre, 0.0004);
      embutir(corpoCaneta, clipe, "Clipe prensado no corpo da caneta; sobreposição pai-filho.");
    }
  }

  // -------------------------------------------------------------------------
  // 8. Planta: vaso torneado, terra e folhas extrudadas.
  // -------------------------------------------------------------------------

  let pronta: No | null = null;
  if (opcoes.comPronta !== false) {
    pronta = grupo(raiz, "pronta", [-0.6, Y_TOPO, -0.2]);
    const vaso = torneado(pronta, "pronta_vaso", [
      [0, -0.055], [0.038, -0.055], [0.043, -0.048], [0.046, -0.02],
      [0.046, 0.048], [0.046, 0.055], [0.041, 0.055], [0.038, 0.049],
      [0.036, 0.012], [0.034, -0.028], [0, -0.036], [0, -0.055],
    ], [0, 0.055, 0], MAT.ceramica, d.segmentosOptica);
    contato("pronta_mesa", topo(tampo, H_TAMPO), base(vaso, 0.11));
    // Terra apoiada no fundo interno do vaso (y = -0.036), raio menor que a
    // parede interna para não interpenetrar.
    const terra = torneado(vaso, "pronta_terra", [
      [0, -0.003], [0.032, -0.002], [0.033, 0.001], [0.031, 0.003], [0, 0.003], [0, -0.003],
    ], [0, -0.033, 0], MAT.terra, d.segmentos);
    for (let i = 0; i < d.folhas; i++) {
      const a = i * 2.399963229728653;
      const s = 0.8 + 0.4 * ((i * 37) % 10) / 10;
      const dx = 0.012 * Math.cos(a), dz = 0.012 * Math.sin(a);
      const folha = grupo(terra, `pronta_folha_${i}`, [dx, 0.003, dz], [-1.12, a, 0]);
      const perfilFolha: V2[] = [
        [0, 0], [0.004 * s, 0.008 * s], [0.0075 * s, 0.024 * s], [0.008 * s, 0.04 * s],
        [0.004 * s, 0.054 * s], [0, 0.06 * s], [-0.004 * s, 0.054 * s],
        [-0.008 * s, 0.04 * s], [-0.0075 * s, 0.024 * s], [-0.004 * s, 0.008 * s], [0, 0],
      ];
      poligonoNoPlano(folha, `pronta_folha_lamina_${i}`, perfilFolha, 0.0014,
        [0, 0, 0.03 * s], MAT.folhagem);
    }
  }

  // -------------------------------------------------------------------------
  // Acoplamentos: aplicação opcional, dependente do schema real do SDK.
  // -------------------------------------------------------------------------

  if (opcoes.registrarAcoplamento) {
    for (const declaracao of acoplamentos) opcoes.registrarAcoplamento(cena, declaracao);
  }

  function girarVentoinhas(rad: number) {
    for (const fan of ventoinhas) fan.girar([0, rad, 0]);
  }
  function girarRoda(rad: number) {
    rodaMouse.girar([0, rad, 0]);
  }

  return {
    cena,
    raiz,
    mesa,
    monitor,
    teclado,
    mouse,
    torre,
    caneca,
    notebook,
    pronta,
    ventoinhas,
    rodaMouse,
    girarVentoinhas,
    girarRoda,
    acoplamentos,
    interferenciasIntencionais,
    detalhe: { ...d },
    ficha: {
      unidade: "m" as const,
      frente: "+z" as const,
      larguraMesa: W_MESA,
      profundidadeMesa: D_MESA,
      alturaMesa: Y_TOPO,
      alturaTopoTorre: Y_TOPO + H_TORRE,
      alturaTopoMonitor: Y_TOPO + H_BASE_MON + H_PESCOCO + H_BODY,
    },
  };
}

/*
 * INTERPENETRAÇÕES INTENCIONAIS (também retornadas por referência):
 * - mouse_botao_-1/+1: botões embutidos no topo do corpo do mouse.
 * - mouse_roda: roda embutida no corpo; apenas a crista fica exposta.
 * - mouse_roda_entalhe: entalhe embutido na crista da roda.
 * - caneca_alca: união cerâmica na parede da caneca-pai.
 * - notebook_elastico: faixa elástica prensada na capa-pai.
 * - caneta_clipe: clipe prensado no corpo da caneta-pai.
 * - torre_fan_pata_*: raízes das pás encaixadas no cubo central-pai.
 * - torre_fan_cubo_*: cubo do eixo parcialmente embutido no shroud (via fan-pai).
 * - torre_botao_topo: botão embutido 0,75 mm no teto-pai.
 * - monitor_soquete / teclado_soquete / mouse_soquete / torre_soquete:
 *   soquetes de cabo embutidos na traseira da base/piso da peça-pai
 *   (filete de 1,5-2 mm abaixo da base, no patamar dos pés).
 * - pronta_folha_*: raiz da folha na superfície da terra (terra-pai).
 *
 * As ventoinhas e o rolete do mouse separam montura (orientação fixa) e
 * filho giratório (rotação em torno do próprio eixo, local +y), de modo que
 * girarVentoinhas()/girarRoda() preservem a orientação de montagem.
 *
 * Tinta do editor é relevo geométrico apoiado (contato declarado), nunca
 * furo ou textura. O vidro da torre e da tela usam OPACIDADE; isto não
 * implementa refração/absorção física.
 * Não se mede bbox() de galhos para conferir faces; os planos declarados
 * são analíticos e continuam válidos com qualquer nível de detalhe.
 */

export default montarCena;

