/** Orientação e conexão entre referenciais: derivar rotação a partir de uma
 * direção (`apontar`), converter um ponto entre o espaço local de dois nós
 * (`converter`, sobre `NoRef.paraMundo`/`doMundo` em `cena.ts`), e criar uma
 * peça cujo eixo vai de um ponto a outro (`conectar`).
 *
 * Funções livres, mesmo padrão de `layout.ts`: recebem `NoRef` e mutam a
 * cena através dele, sem guardar estado próprio. */
import type { NoRef } from "./cena.ts";
import { eulerDeBase } from "./matriz.ts";
import type { Material, ParamsDe, ParamsHelix } from "./tipos.ts";
import {
  type Eixo, type Vec3, EPS,
  comprimento, distancia, escalar, normalizar, produtoEscalar, produtoVetorial, somar, subtrair,
} from "./vetor.ts";

// ── apontar ──────────────────────────────────────────────────────────────

export interface OpcoesApontar {
  /** Eixo local que deve apontar em `direcao`. Padrão `"y"` — o eixo de
   * `cylinder`/`lathe`/`helix`. */
  eixo?: Eixo;
  /** Referência de "cima" para fixar o giro (roll) em torno do próprio eixo
   * apontado. Sem isto, usa a rotação MÍNIMA a partir da base identidade —
   * é por isso que `apontar(no, [0,1,0])` com `eixo: "y"` (o caso já
   * alinhado) não mexe na rotação, e `apontar` num plano (ex.: uma mola cujo
   * início e fim só diferem em y/z) cai exatamente na mesma fórmula de
   * rotação de um só eixo que dava para calcular à mão nesse caso. */
  cima?: Vec3;
}

function eixoIdentidade(eixo: Eixo): Vec3 {
  return eixo === "x" ? [1, 0, 0] : eixo === "y" ? [0, 1, 0] : [0, 0, 1];
}

/** Um eixo do mundo garantidamente não quase-paralelo a `v` — usado como
 * semente para resolver os casos degenerados (direção oposta ao eixo
 * identidade, ou `cima` quase paralelo à direção pedida). */
function referenciaNaoParalela(v: Vec3): Vec3 {
  return Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
}

/** Rotação MÍNIMA que leva `eixoIdentidade(eixo)` até `alvo` (fórmula de
 * rotação de Rodrigues aplicada aos três eixos da base identidade). Reduz
 * exatamente à identidade quando `alvo` já é o próprio eixo; no caso
 * degenerado (`alvo` exatamente oposto ao eixo) usa qualquer eixo
 * perpendicular para o giro de 180°, já que não há um "mínimo" único ali. */
function baseMinima(alvo: Vec3, eixo: Eixo): { ex: Vec3; ey: Vec3; ez: Vec3 } {
  const idEx: Vec3 = [1, 0, 0], idEy: Vec3 = [0, 1, 0], idEz: Vec3 = [0, 0, 1];
  const idAlvo = eixoIdentidade(eixo);
  const cosT = Math.max(-1, Math.min(1, produtoEscalar(idAlvo, alvo)));
  const eixoRot = produtoVetorial(idAlvo, alvo);
  const sinT = comprimento(eixoRot);

  let k: Vec3;
  let s: number;
  if (sinT < EPS * 1e3) {
    if (cosT > 0) return { ex: idEx, ey: idEy, ez: idEz };
    k = normalizar(produtoVetorial(idAlvo, referenciaNaoParalela(idAlvo)));
    s = 0;
  } else {
    k = escalar(eixoRot, 1 / sinT);
    s = sinT;
  }
  const rot = (v: Vec3): Vec3 =>
    somar(
      somar(escalar(v, cosT), escalar(produtoVetorial(k, v), s)),
      escalar(k, produtoEscalar(k, v) * (1 - cosT)),
    );
  return { ex: rot(idEx), ey: rot(idEy), ez: rot(idEz) };
}

/** Base ortonormal com `alvo` no eixo pedido e o giro (roll) fixado por
 * `cimaPedido`: ao contrário de `baseMinima`, não é a rotação "mais curta" a
 * partir da identidade — é a construção clássica de "olhar para" com uma
 * referência de cima, para quando o chamador se importa com o giro em torno
 * do próprio eixo apontado (ex.: manter uma face plana de uma peça virada
 * para um lado consistente ao longo de uma cadeia de segmentos). */
function baseComCima(alvo: Vec3, eixo: Eixo, cimaPedido: Vec3): { ex: Vec3; ey: Vec3; ez: Vec3 } {
  const cima = normalizar(cimaPedido);
  const referencia =
    Math.abs(produtoEscalar(alvo, cima)) > 1 - EPS * 1e3 ? referenciaNaoParalela(alvo) : cima;
  // ex0 × alvo = ez0 por construção — é essa relação cíclica que a
  // permutação abaixo preserva para os outros dois eixos.
  const ex0 = normalizar(produtoVetorial(alvo, referencia));
  const ez0 = produtoVetorial(ex0, alvo);
  if (eixo === "y") return { ex: ex0, ey: alvo, ez: ez0 };
  if (eixo === "z") return { ex: ez0, ey: ex0, ez: alvo };
  return { ex: alvo, ey: ez0, ez: ex0 }; // eixo === "x"
}

/** Gira `no` para que o eixo local pedido (padrão `y`) aponte em `direcao`,
 * dada no referencial do PAI atual do nó — o mesmo espaço onde
 * `transform.rotacao` é gravado. Sobrescreve a rotação inteira, mesma
 * semântica de `face().colocar()` com `orientar: true` (o padrão): não
 * compõe com a rotação anterior. */
export function apontar(no: NoRef, direcao: Vec3, opcoes: OpcoesApontar = {}): NoRef {
  if (comprimento(direcao) < EPS) {
    throw new Error(`apontar: 'direcao' não pode ser o vetor nulo (nó '${no.id}')`);
  }
  const eixo = opcoes.eixo ?? "y";
  const alvo = normalizar(direcao);
  const base = opcoes.cima ? baseComCima(alvo, eixo, opcoes.cima) : baseMinima(alvo, eixo);
  no.cena.transformar(no.id, { rotacao: eulerDeBase(base.ex, base.ey, base.ez) });
  return no;
}

// ── converter ────────────────────────────────────────────────────────────

/** Leva o ponto `p`, dado no referencial local de `de`, para o referencial
 * local de `para` — os dois precisam estar na mesma `Cena`. Equivale a
 * `para.doMundo(de.paraMundo(p))`, escrito por extenso para não obrigar o
 * chamador a nomear o mundo como um passo intermediário. */
export function converter(p: Vec3, de: NoRef, para: NoRef): Vec3 {
  if (de.cena !== para.cena) {
    throw new Error(`converter: 'de' ('${de.id}') e 'para' ('${para.id}') precisam estar na mesma Cena`);
  }
  return para.doMundo(de.paraMundo(p));
}

// ── conectar ─────────────────────────────────────────────────────────────

/** Um ponto no referencial de `pai`, ou um ponto no referencial de outro nó
 * (convertido automaticamente). */
export type PontoRef = Vec3 | { no: NoRef; ponto: Vec3 };

export interface OpcoesConectar {
  nome?: string;
  material?: Material;
  /** Repassado para `apontar` — fixa o giro em torno do eixo da peça. Sem
   * isto, `conectar` usa a rotação mínima (ver `OpcoesApontar.cima`); como
   * `cylinder`/`cone`/`helix` são todos de revolução em torno do próprio
   * eixo, o giro raramente importa visualmente. */
  cima?: Vec3;
}

type TipoConectavel = "cylinder" | "cone" | "helix";
type ParamsConectar<T extends TipoConectavel> = T extends "helix"
  ? Omit<ParamsHelix, "voltas">
  : Omit<ParamsDe<T>, "altura">;

function resolverPonto(pai: NoRef, ref: PontoRef): Vec3 {
  return Array.isArray(ref) ? ref : converter(ref.ponto, ref.no, pai);
}

/** Cria (como filho de `pai`) um nó cujo eixo `+y` vai de `a` até `b`, no
 * referencial de `pai`: posição no ponto médio, orientação via `apontar`, e
 * o parâmetro de comprimento (`altura` para `cylinder`/`cone`; `voltas` para
 * `helix`) derivado da distância entre os pontos — por isso o TIPO de
 * `params` exclui esse campo: não há como o chamador passar um valor
 * conflitante, a ambiguidade é eliminada em tempo de compilação.
 *
 * Para `helix`, a distância é descontada em `2 × raioTubo` antes de dividir
 * por `passo`: são as pontas abertas do tubo (a "tampa" de cada ponta vai
 * até `raioTubo` além do fim da trajetória — ver o comentário do caso
 * `helix` em `bbox.ts`), então `voltas` é calculado para que a peça
 * *visualmente* termine em `a`/`b`, não para que a trajetória central
 * termine lá. Margem de gancho/conector específica de um modelo (como os
 * ganchos de uma mola) continua sendo decisão de quem chama, adicionada
 * depois como filhos — `conectar` só resolve a geometria do `helix` em si. */
export function conectar<T extends TipoConectavel>(
  pai: NoRef,
  a: PontoRef,
  b: PontoRef,
  tipo: T,
  params: ParamsConectar<T>,
  opcoes: OpcoesConectar = {},
): NoRef {
  const A = resolverPonto(pai, a);
  const B = resolverPonto(pai, b);
  const dist = distancia(A, B);
  if (dist < EPS) {
    throw new Error(`conectar: 'a' e 'b' são o mesmo ponto (distância ${dist})`);
  }
  const meio: Vec3 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];

  const paramsFinais =
    tipo === "helix"
      ? (() => {
          const p = params as Omit<ParamsHelix, "voltas">;
          const voltas = (dist - 2 * p.raioTubo) / p.passo;
          if (!(voltas > 0)) {
            throw new Error(
              `conectar: distância (${dist}) pequena demais para 'raioTubo' (${p.raioTubo}) e 'passo' (${p.passo})`,
            );
          }
          return { ...p, voltas };
        })()
      : { ...(params as object), altura: dist };

  const no = pai.criar(tipo, paramsFinais as ParamsDe<T>, {
    ...(opcoes.nome ? { nome: opcoes.nome } : {}),
    ...(opcoes.material ? { material: opcoes.material } : {}),
    transform: { posicao: meio },
  });
  apontar(no, subtrair(B, A), { eixo: "y", ...(opcoes.cima ? { cima: opcoes.cima } : {}) });
  return no;
}
