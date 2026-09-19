/** Layout declarativo: funções relacionais sobre nós já criados.
 *
 * Divisão de responsabilidade com `face.ts`: estas funções operam sobre as
 * AABBs alinhadas aos EIXOS DO MUNDO ("põe a xícara em cima da mesa", "encosta
 * o armário na parede leste"). Para posicionar relativo à face própria de um
 * nó girado, use `no.face(...).colocar(...)`, que faz as contas no
 * referencial do dono da face.
 *
 * Em todas elas: gap e distribuição operam sobre as BORDAS da bounding box,
 * nunca sobre os centros — é o que mantém o espaçamento correto quando os
 * objetos têm tamanhos diferentes. */
import { type AABB, unirTodas } from "./bbox.ts";
import { distribuirEm1D } from "./face.ts";
import { normalizarFace, frameDaFace } from "./face.ts";
import type { Cena, NoRef } from "./cena.ts";
import type { Align, FaceEntrada, Justify } from "./tipos.ts";
import { type Eixo, type IndiceEixo, type Vec3, indiceDoEixo, num } from "./vetor.ts";

export type Alinhamento = "centro" | "inicio" | "fim";

function cenaDe(nos: readonly NoRef[]): Cena {
  const primeiro = nos[0];
  if (!primeiro) throw new Error(`a operação precisa de pelo menos um nó`);
  return primeiro.cena;
}

function caixaDe(n: NoRef): AABB {
  return n.bbox();
}

/** AABB que envolve um conjunto de nós. */
export function envelope(nos: readonly NoRef[]): AABB {
  const u = unirTodas(nos.map(caixaDe));
  if (!u) throw new Error(`envelope precisa de pelo menos um nó`);
  return u;
}

/** Apoia `a` exatamente em cima de `b`: a base de `a` encosta no topo de `b`,
 * sem gap nem penetração. `alinhamento` controla X e Z. */
export function colocarSobre(a: NoRef, b: NoRef, opcoes: { alinhamento?: Alinhamento; gap?: number } = {}): NoRef {
  const alinhamento = opcoes.alinhamento ?? "centro";
  const gap = num(opcoes.gap, 0);
  const cb = caixaDe(b);
  a.cena.definirBordaMundo(a.id, 1, "min", cb.max[1]! + gap);
  for (const i of [0, 2] as IndiceEixo[]) {
    const alvo = alinhamento === "centro" ? cb.centro[i]! : alinhamento === "inicio" ? cb.min[i]! : cb.max[i]!;
    const borda = alinhamento === "centro" ? "centro" : alinhamento === "inicio" ? "min" : "max";
    a.cena.definirBordaMundo(a.id, i, borda, alvo);
  }
  return a;
}

/** Encosta `a` num dos lados de `b`, com `gap` entre as BORDAS. Nos outros
 * dois eixos, centraliza `a` em `b`. */
export function encostar(a: NoRef, b: NoRef, lado: FaceEntrada, gap = 0): NoRef {
  const frame = frameDaFace(normalizarFace(lado));
  const i = frame.eixoNormal;
  const cb = caixaDe(b);
  if (frame.sinal > 0) a.cena.definirBordaMundo(a.id, i, "min", cb.max[i]! + gap);
  else a.cena.definirBordaMundo(a.id, i, "max", cb.min[i]! - gap);
  for (const k of [0, 1, 2] as IndiceEixo[]) {
    if (k === i) continue;
    a.cena.definirBordaMundo(a.id, k, "centro", cb.centro[k]!);
  }
  return a;
}

/** Alinha as bboxes num eixo. `start` = menor coordenada, `end` = maior. */
export function alinhar(nos: readonly NoRef[], eixo: Eixo, modo: Align = "center"): readonly NoRef[] {
  if (nos.length === 0) return nos;
  const i = indiceDoEixo(eixo);
  const caixas = nos.map(caixaDe);
  const alvo =
    modo === "start" ? Math.min(...caixas.map((c) => c.min[i]!))
    : modo === "end" ? Math.max(...caixas.map((c) => c.max[i]!))
    : caixas.reduce((s, c) => s + c.centro[i]!, 0) / caixas.length;
  const borda = modo === "start" ? "min" : modo === "end" ? "max" : "centro";
  for (const n of nos) n.cena.definirBordaMundo(n.id, i, borda, alvo);
  return nos;
}

/** Centraliza `a` em `b` só nos eixos pedidos ("tapete no centro da sala"
 * sem levantar o tapete do chão: `eixos: "xz"`). */
export function centralizarEm(a: NoRef, b: NoRef, eixos: string = "xz"): NoRef {
  const cb = caixaDe(b);
  for (const letra of eixos.toLowerCase()) {
    const i = indiceDoEixo(letra as Eixo);
    a.cena.definirBordaMundo(a.id, i, "centro", cb.centro[i]!);
  }
  return a;
}

/** Empilha na ordem da lista, cada um encostado no anterior. */
export function empilhar(nos: readonly NoRef[], direcao: FaceEntrada = "topo", gap = 0): readonly NoRef[] {
  for (let k = 1; k < nos.length; k++) encostar(nos[k]!, nos[k - 1]!, direcao, gap);
  return nos;
}

export interface OpcoesDistribuir {
  eixo?: Eixo;
  justify?: Justify;
  gap?: number;
  /** Faixa total a ocupar. Padrão: a extensão atual do conjunto. */
  extensao?: number;
  /** Alternativa a `extensao`: usa a extensão da bbox deste nó como faixa. */
  dentro?: NoRef;
  /** Centro da faixa. Padrão: o centro atual do conjunto (ou de `dentro`). */
  centro?: number;
  /** `false` mantém a ordem da lista. Padrão: ordena pela posição atual no
   * eixo, para que o resultado não dependa da ordem em que os nós foram
   * passados. */
  ordenar?: boolean;
}

/** Distribui nós ao longo de um eixo do mundo com a semântica de
 * `justify-content` do CSS, sobre as bordas. */
export function distribuir(nos: readonly NoRef[], opcoes: OpcoesDistribuir = {}): readonly NoRef[] {
  if (nos.length === 0) return nos;
  const i = indiceDoEixo(opcoes.eixo ?? "x");
  const lista = opcoes.ordenar === false
    ? [...nos]
    : [...nos].sort((a, b) => caixaDe(a).centro[i]! - caixaDe(b).centro[i]!);

  const conjunto = opcoes.dentro ? caixaDe(opcoes.dentro) : envelope(lista);
  const extensao = opcoes.extensao ?? conjunto.tamanho[i]!;
  const centro = opcoes.centro ?? conjunto.centro[i]!;
  const tamanhos = lista.map((n) => caixaDe(n).tamanho[i]!);
  const centros = distribuirEm1D(tamanhos, extensao, num(opcoes.gap, 0), opcoes.justify ?? "space-between");
  lista.forEach((n, k) => n.cena.definirBordaMundo(n.id, i, "centro", centro + centros[k]!));
  return nos;
}

export interface OpcoesCircular {
  /** Centro do círculo: um nó, um ponto, ou (padrão) o centro atual do
   * conjunto. */
  centro?: NoRef | Vec3;
  /** Plano do círculo. Padrão `xz` (chão). */
  plano?: "xz" | "xy" | "yz";
  /** Ângulo do primeiro nó, em radianos. Padrão 0. */
  anguloInicial?: number;
}

/** Distribui os nós em círculo, com ângulos igualmente espaçados. */
export function circular(nos: readonly NoRef[], raio: number, opcoes: OpcoesCircular = {}): readonly NoRef[] {
  if (nos.length === 0) return nos;
  const cena = cenaDe(nos);
  const plano = opcoes.plano ?? "xz";
  const [ia, ib]: [IndiceEixo, IndiceEixo] =
    plano === "xz" ? [0, 2] : plano === "xy" ? [0, 1] : [1, 2];
  const centro: Vec3 = Array.isArray(opcoes.centro)
    ? opcoes.centro
    : opcoes.centro
      ? opcoes.centro.bbox().centro
      : envelope(nos).centro;
  const passo = (Math.PI * 2) / nos.length;
  const a0 = num(opcoes.anguloInicial, 0);
  nos.forEach((n, k) => {
    const ang = a0 + passo * k;
    const alvo: Vec3 = [...centro];
    alvo[ia] = centro[ia]! + Math.cos(ang) * raio;
    alvo[ib] = centro[ib]! + Math.sin(ang) * raio;
    // só move nos dois eixos do plano — o terceiro fica onde estava
    const atual = n.bbox().centro;
    const terceiro = ([0, 1, 2] as IndiceEixo[]).find((i) => i !== ia && i !== ib)!;
    alvo[terceiro] = atual[terceiro]!;
    cena.definirCentroMundo(n.id, alvo);
  });
  return nos;
}
