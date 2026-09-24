/** Animação por quadros-chave, guardada na cena como dado (`CenaJSON.
 * animacoes`) — mesma regra do resto: o estado guarda parâmetros, o core
 * avalia, o backend traduz.
 *
 * O core é a fonte da verdade do movimento: `valorEm` define o valor de cada
 * faixa em qualquer instante, `poseEm` devolve a cena inteira naquele
 * instante (com bbox, faces, linter funcionando), e `amostrarAnimacao` é o
 * que o backend usa para montar o clipe — ele não reimplementa interpolação
 * nenhuma. */
import { eulerDeBase } from "./matriz.ts";
import type {
  Animacao, FaixaAnimacao, Interpolacao, No, PropriedadeAnimavel, RepeticaoAnimacao, ValorAnimado,
} from "./tipos.ts";
import type { Vec3 } from "./vetor.ts";

export const PROPRIEDADES_ANIMAVEIS: readonly PropriedadeAnimavel[] = [
  "posicao", "rotacao", "escala", "angulo", "opacidade", "cor",
];
const INTERPOLACOES: readonly Interpolacao[] = ["linear", "suave", "degrau"];
const REPETICOES: readonly RepeticaoAnimacao[] = ["nao", "sempre", "vaivem"];
const COR = /^#[0-9a-f]{6}$/i;

// ── Validação ────────────────────────────────────────────────────────────

/** Confere uma faixa contra o nó que ela anima. Lança explicando o erro —
 * uma faixa inválida nunca chega a ser gravada na cena. */
export function validarFaixa(faixa: FaixaAnimacao, no: No): void {
  const onde = `faixa '${faixa.propriedade}' de '${faixa.no}'`;
  if (!PROPRIEDADES_ANIMAVEIS.includes(faixa.propriedade)) {
    throw new Error(`propriedade '${faixa.propriedade}' não é animável (use ${PROPRIEDADES_ANIMAVEIS.join(", ")})`);
  }
  if (faixa.propriedade === "angulo" && no.tipo !== "junta") {
    throw new Error(`${onde}: 'angulo' só existe em nós 'junta' ('${no.id}' é '${no.tipo}'); para girar outro nó, anime 'rotacao'`);
  }
  if (faixa.relativo && (faixa.propriedade === "opacidade" || faixa.propriedade === "cor")) {
    throw new Error(`${onde}: 'relativo' não se aplica a '${faixa.propriedade}'`);
  }
  if (faixa.interpolacao !== undefined && !INTERPOLACOES.includes(faixa.interpolacao)) {
    throw new Error(`${onde}: interpolação '${faixa.interpolacao}' inválida (use ${INTERPOLACOES.join(", ")})`);
  }
  if (!faixa.quadros?.length) throw new Error(`${onde}: precisa de ao menos 1 quadro`);
  faixa.quadros.forEach((q, i) => {
    if (!Number.isFinite(q.t) || q.t < 0) throw new Error(`${onde}: quadro ${i} com t inválido (${q.t})`);
    if (i > 0 && q.t <= faixa.quadros[i - 1]!.t) {
      throw new Error(`${onde}: os quadros precisam estar em ordem crescente de t (quadro ${i}: ${q.t} depois de ${faixa.quadros[i - 1]!.t})`);
    }
    validarValor(faixa.propriedade, q.valor, `${onde}, quadro ${i}`);
  });
}

function validarValor(p: PropriedadeAnimavel, v: ValorAnimado, onde: string): void {
  switch (p) {
    case "posicao": case "rotacao": case "escala":
      if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) {
        throw new Error(`${onde}: '${p}' espera [x, y, z] (recebeu ${JSON.stringify(v)})`);
      }
      return;
    case "angulo":
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${onde}: 'angulo' espera um número em radianos`);
      return;
    case "opacidade":
      if (typeof v !== "number" || !(v >= 0 && v <= 1)) throw new Error(`${onde}: 'opacidade' espera um número entre 0 e 1`);
      return;
    case "cor":
      if (typeof v !== "string" || !COR.test(v)) throw new Error(`${onde}: 'cor' espera '#rrggbb' (recebeu ${JSON.stringify(v)})`);
      return;
  }
}

export function validarAnimacao(a: Pick<Animacao, "nome" | "duracao" | "repetir">): void {
  if (!a.nome) throw new Error("animação precisa de 'nome'");
  if (a.duracao !== undefined && !(a.duracao > 0)) throw new Error(`animação '${a.nome}': 'duracao' precisa ser > 0`);
  if (a.repetir !== undefined && !REPETICOES.includes(a.repetir)) {
    throw new Error(`animação '${a.nome}': 'repetir' inválido '${a.repetir}' (use ${REPETICOES.join(", ")})`);
  }
}

// ── Tempo ────────────────────────────────────────────────────────────────

/** Duração efetiva: a declarada, ou o último quadro de todas as faixas. */
export function duracaoDe(a: Animacao): number {
  if (a.duracao !== undefined) return a.duracao;
  let d = 0;
  for (const f of a.faixas) d = Math.max(d, f.quadros[f.quadros.length - 1]?.t ?? 0);
  return d;
}

/** Leva um tempo qualquer (segundos desde o play) para o tempo dentro de um
 * ciclo, conforme `repetir`. */
export function tempoNoCiclo(a: Animacao, t: number): number {
  const d = duracaoDe(a);
  if (d <= 0) return 0;
  const repetir = a.repetir ?? "nao";
  if (repetir === "nao") return Math.min(Math.max(t, 0), d);
  if (repetir === "sempre") return ((t % d) + d) % d;
  const m = ((t % (2 * d)) + 2 * d) % (2 * d);
  return m <= d ? m : 2 * d - m;
}

// ── Avaliação ────────────────────────────────────────────────────────────

/** Valor ABSOLUTO que a faixa impõe no instante `t` (já no ciclo), dado o
 * nó em repouso (é dele que vêm as bases dos valores `relativo`). */
export function valorEm(faixa: FaixaAnimacao, repouso: No, t: number): ValorAnimado {
  return absoluto(faixa, repouso, interpolar(faixa, t));
}

function interpolar(faixa: FaixaAnimacao, t: number): ValorAnimado {
  const qs = faixa.quadros;
  if (t <= qs[0]!.t) return qs[0]!.valor;
  const ultimo = qs[qs.length - 1]!;
  if (t >= ultimo.t) return ultimo.valor;
  let k = 0;
  while (qs[k + 1]!.t <= t) k++;
  const a = qs[k]!, b = qs[k + 1]!;
  const modo = faixa.interpolacao ?? "linear";
  if (modo === "degrau") return a.valor;
  let s = (t - a.t) / (b.t - a.t);
  if (modo === "suave") s = s * s * (3 - 2 * s);
  return misturar(faixa.propriedade, a.valor, b.valor, s);
}

function misturar(p: PropriedadeAnimavel, a: ValorAnimado, b: ValorAnimado, s: number): ValorAnimado {
  if (p === "rotacao") return eulerDeQuat(slerp(quatDeEuler(a as Vec3), quatDeEuler(b as Vec3), s));
  if (p === "cor") {
    const ca = rgb(a as string), cb = rgb(b as string);
    return hex(ca.map((x, i) => x + (cb[i]! - x) * s) as Vec3);
  }
  if (typeof a === "number") return a + ((b as number) - a) * s;
  const va = a as Vec3, vb = b as Vec3;
  return [va[0] + (vb[0] - va[0]) * s, va[1] + (vb[1] - va[1]) * s, va[2] + (vb[2] - va[2]) * s];
}

function absoluto(faixa: FaixaAnimacao, no: No, v: ValorAnimado): ValorAnimado {
  if (!faixa.relativo) return v;
  const t = no.transform;
  switch (faixa.propriedade) {
    case "posicao": {
      const d = v as Vec3;
      return [t.posicao[0] + d[0], t.posicao[1] + d[1], t.posicao[2] + d[2]];
    }
    case "escala": {
      const k = v as Vec3;
      return [t.escala[0] * k[0], t.escala[1] * k[1], t.escala[2] * k[2]];
    }
    case "rotacao":
      // composta no referencial do próprio nó: q = q_repouso · q_quadro
      return eulerDeQuat(multiplicarQuat(quatDeEuler(t.rotacao), quatDeEuler(v as Vec3)));
    case "angulo":
      return (no.params as { angulo: number }).angulo + (v as number);
    default:
      return v;
  }
}

/** Aplica os valores da animação no instante `t` (já no ciclo) aos nós,
 * IN-PLACE. `repouso` dá a pose de referência de cada nó (para `relativo`)
 * e precisa ser uma cópia intocada — os nós de `destino` vão mudar. */
export function aplicarPose(
  a: Animacao,
  t: number,
  repouso: (id: string) => No,
  destino: (id: string) => No,
): void {
  for (const f of a.faixas) {
    const valor = valorEm(f, repouso(f.no), t);
    const no = destino(f.no);
    switch (f.propriedade) {
      case "posicao": no.transform.posicao = [...(valor as Vec3)]; break;
      case "rotacao": no.transform.rotacao = [...(valor as Vec3)]; break;
      case "escala": no.transform.escala = [...(valor as Vec3)]; break;
      case "angulo": (no.params as { angulo: number }).angulo = valor as number; break;
      case "opacidade": no.material = { ...no.material, opacidade: valor as number }; break;
      case "cor": no.material = { ...no.material, cor: valor as string }; break;
    }
  }
}

// ── Amostragem para backends ─────────────────────────────────────────────

export interface FaixaAmostrada {
  no: string;
  propriedade: PropriedadeAnimavel;
  /** `true` (faixa `degrau`): segure cada valor até o próximo tempo, sem
   * interpolar. Os tempos são os dos próprios quadros. */
  discreto: boolean;
  tempos: number[];
  /** Valores ABSOLUTOS (já resolvido `relativo`), um por tempo. Rotação em
   * Euler XYZ; interpolar linearmente entre amostras vizinhas (ou slerp, na
   * rotação) reproduz o movimento com erro desprezível. */
  valores: ValorAnimado[];
}

export interface AnimacaoAmostrada {
  nome: string;
  duracao: number;
  repetir: RepeticaoAnimacao;
  faixas: FaixaAmostrada[];
}

/** Amostra cada faixa em `fps` quadros por segundo ao longo de um ciclo (mais
 * os instantes exatos dos quadros-chave). É o que um backend converte em
 * clipe de animação — interpolação, `suave` e `relativo` já vêm resolvidos. */
export function amostrarAnimacao(a: Animacao, repouso: (id: string) => No, fps = 30): AnimacaoAmostrada {
  const duracao = duracaoDe(a);
  const grade: number[] = [];
  const n = Math.max(1, Math.ceil(duracao * fps));
  for (let i = 0; i <= n; i++) grade.push((duracao * i) / n);
  return {
    nome: a.nome,
    duracao,
    repetir: a.repetir ?? "nao",
    faixas: a.faixas.map((f) => {
      const no = repouso(f.no);
      const discreto = f.interpolacao === "degrau";
      const chaves = f.quadros.map((q) => q.t).filter((t) => t <= duracao);
      const tempos = discreto
        ? (chaves.length ? chaves : [0])
        : [...new Set([...grade, ...chaves])].sort((x, y) => x - y);
      return {
        no: f.no,
        propriedade: f.propriedade,
        discreto,
        tempos,
        valores: tempos.map((t) => valorEm(f, no, t)),
      };
    }),
  };
}

// ── Quatérnios (só internos: a API pública fala Euler XYZ) ────────────────

type Quat = [number, number, number, number]; // x, y, z, w

/** Mesmas contas de `Quaternion.setFromEuler` do Three.js, ordem XYZ. */
function quatDeEuler(e: Vec3): Quat {
  const c1 = Math.cos(e[0] / 2), c2 = Math.cos(e[1] / 2), c3 = Math.cos(e[2] / 2);
  const s1 = Math.sin(e[0] / 2), s2 = Math.sin(e[1] / 2), s3 = Math.sin(e[2] / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

function eulerDeQuat(q: Quat): Vec3 {
  const [x, y, z, w] = q;
  // colunas da matriz de rotação = imagens dos eixos locais
  const ex: Vec3 = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)];
  const ey: Vec3 = [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)];
  const ez: Vec3 = [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
  return eulerDeBase(ex, ey, ez);
}

function multiplicarQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Interpolação esférica pelo MENOR arco entre as duas orientações. */
function slerp(a: Quat, b: Quat, s: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let ka: number, kb: number;
  if (cos > 0.9999) {
    ka = 1 - s; kb = s;
  } else {
    const ang = Math.acos(cos), sen = Math.sin(ang);
    ka = Math.sin((1 - s) * ang) / sen;
    kb = Math.sin(s * ang) / sen;
  }
  const q: Quat = [ka * a[0] + kb * bx, ka * a[1] + kb * by, ka * a[2] + kb * bz, ka * a[3] + kb * bw];
  const l = Math.hypot(...q);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

function rgb(h: string): Vec3 {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(c: Vec3): string {
  return "#" + c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("");
}
