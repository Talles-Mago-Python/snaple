/** Faces como planos de trabalho.
 *
 * Uma face é um plano 2D local derivado da bounding box PRÓPRIA do nó, com
 * origem no centro da face e eixos U/V no plano. Colocar algo numa face é
 * dizer (u, v) — nunca uma coordenada de mundo. Quem chama não calcula nada.
 *
 * Por que isso elimina o bug de objeto flutuando/afundado POR CONSTRUÇÃO: a
 * posição final não é escolhida pelo chamador nem por uma heurística, é
 * derivada da AABB do nó colocado. A borda dele no sentido contrário à
 * normal é levada EXATAMENTE ao plano da face; não existe caminho de código
 * em que sobre um gap ou uma penetração.
 *
 * Referencial: todas as contas acontecem no espaço LOCAL do dono da face,
 * onde a normal é sempre um eixo — mesmo que o dono esteja girado no mundo.
 *
 * Frames U/V/normal por face (n = V × U, destro; o nó colocado tem seu +X→U,
 * +Y→n, +Z→V):
 *
 * | face   | normal | U   | V   |
 * |--------|--------|-----|-----|
 * | topo   | +y     | +x  | +z  |
 * | base   | -y     | +x  | -z  |
 * | leste  | +x     | +z  | +y  |
 * | oeste  | -x     | -z  | +y  |
 * | sul    | +z     | -x  | +y  |
 * | norte  | -z     | +x  | +y  |
 */
import { type AABB, aabbDeMinMax, caixaLocalPropria } from "./bbox.ts";
import { aplicarDirecao, compor, decompor, inverter, multiplicar } from "./matriz.ts";
import type { AlvoNo, Cena, NoRef } from "./cena.ts";
import { aabbNoEspacoDe } from "./cena.ts";
import type { FaceEntrada, No, NomeFace } from "./tipos.ts";
import { type IndiceEixo, type Ponto2D, type Vec3, num } from "./vetor.ts";

const ALIASES: Record<string, NomeFace> = {
  topo: "topo", base: "base", norte: "norte", sul: "sul", leste: "leste", oeste: "oeste",
  "+y": "topo", "-y": "base", "-z": "norte", "+z": "sul", "+x": "leste", "-x": "oeste",
  // tolerados por serem o vocabulário do módulo Python que originou a lib
  cima: "topo", baixo: "base",
};

export function normalizarFace(nome: FaceEntrada | string): NomeFace {
  const n = ALIASES[String(nome).toLowerCase()];
  if (!n) {
    throw new Error(
      `face inválida: '${String(nome)}' ` +
      `(use topo|base|norte|sul|leste|oeste ou +y|-y|-z|+z|+x|-x)`,
    );
  }
  return n;
}

export interface FrameFace {
  /** Normal apontando para FORA do nó, em coordenadas locais do dono. */
  normal: Vec3;
  u: Vec3;
  v: Vec3;
  /** Índice do eixo da normal (0=x, 1=y, 2=z). */
  eixoNormal: IndiceEixo;
  eixoU: IndiceEixo;
  eixoV: IndiceEixo;
  sinal: 1 | -1;
}

const FRAMES: Record<NomeFace, FrameFace> = {
  topo:  { normal: [0, 1, 0],  u: [1, 0, 0],  v: [0, 0, 1],  eixoNormal: 1, eixoU: 0, eixoV: 2, sinal: 1 },
  base:  { normal: [0, -1, 0], u: [1, 0, 0],  v: [0, 0, -1], eixoNormal: 1, eixoU: 0, eixoV: 2, sinal: -1 },
  leste: { normal: [1, 0, 0],  u: [0, 0, 1],  v: [0, 1, 0],  eixoNormal: 0, eixoU: 2, eixoV: 1, sinal: 1 },
  oeste: { normal: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0],  eixoNormal: 0, eixoU: 2, eixoV: 1, sinal: -1 },
  sul:   { normal: [0, 0, 1],  u: [-1, 0, 0], v: [0, 1, 0],  eixoNormal: 2, eixoU: 0, eixoV: 1, sinal: 1 },
  norte: { normal: [0, 0, -1], u: [1, 0, 0],  v: [0, 1, 0],  eixoNormal: 2, eixoU: 0, eixoV: 1, sinal: -1 },
};

export function frameDaFace(nome: NomeFace): FrameFace {
  return FRAMES[nome];
}

/** Onde a borda da AABB do nó colocado encosta no ponto (u,v) pedido. */
export type Alinhamento = "centro" | "inicio" | "fim";

export interface OpcoesColocar {
  /** Coordenada no eixo U da face, em metros a partir do centro da face. */
  u?: number;
  /** Coordenada no eixo V da face. */
  v?: number;
  alinhamento?: Alinhamento;
  /** Folga entre a face e a base do nó. 0 (padrão) = encosta exatamente. */
  gap?: number;
  /** `false` mantém a rotação atual do nó em vez de orientá-lo para fora da
   * face. A base continua encostando na face. */
  orientar?: boolean;
  /** `false` deixa o nó onde ele está na árvore em vez de adotá-lo como
   * filho do dono da face. A posição final é a mesma; o que muda é se mover
   * o dono depois leva o nó junto. */
  reparentar?: boolean;
}

export interface OpcoesDistribuir extends Omit<OpcoesColocar, "u" | "v"> {
  /** Eixo do plano da face ao longo do qual distribuir. */
  eixo?: "u" | "v";
  /** Extensão total da faixa; padrão: a extensão da própria face nesse eixo. */
  extensao?: number;
  gapEntre?: number;
  justify?: "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly";
  /** Deslocamento no outro eixo do plano. */
  offset?: number;
}

export interface OpcoesGrade extends Omit<OpcoesColocar, "u" | "v"> {
  /** Espaçamento entre BORDAS. Número = mesmo gap nos dois eixos. */
  gapEntre?: number | Ponto2D;
  /** Extensão da grade em (U, V); padrão: a extensão da face. */
  extensao?: Ponto2D;
  /** `true` (padrão) espalha as células pela extensão da face; `false`
   * empacota tudo no centro usando só `gapEntre`. */
  espalhar?: boolean;
}

export class Face {
  readonly cena: Cena;
  readonly idDono: string;
  readonly nome: NomeFace;

  constructor(cena: Cena, idDono: string, nome: FaceEntrada) {
    this.cena = cena;
    this.idDono = idDono;
    this.nome = normalizarFace(nome);
  }

  get dono(): No { return this.cena.no(this.idDono); }
  get frame(): FrameFace { return FRAMES[this.nome]; }

  /** AABB do dono no seu PRÓPRIO espaço local, considerando só a GEOMETRIA
   * PRÓPRIA — é a caixa de onde a face é derivada.
   *
   * Usar a subárvore aqui seria um bug sutil e cumulativo: a face `base` de
   * um tampo passaria a ser a base do conjunto tampo+pernas assim que a
   * primeira perna fosse colocada, e cada perna seguinte nasceria mais
   * embaixo que a anterior. Containers, que não têm geometria própria, caem
   * para a subárvore por definição. */
  caixaLocal(): AABB {
    const c = caixaLocalPropria(this.dono);
    if (c) return aabbDeMinMax(c.min, c.max);
    return aabbNoEspacoDe(this.cena, this.idDono, this.idDono);
  }

  /** Extensão da face nos eixos (U, V), em metros. */
  extensao(): Ponto2D {
    const caixa = this.caixaLocal();
    const f = this.frame;
    return [caixa.tamanho[f.eixoU]!, caixa.tamanho[f.eixoV]!];
  }

  /** Origem da face (centro do retângulo) em coordenadas locais do dono. */
  origemLocal(): Vec3 {
    const caixa = this.caixaLocal();
    const f = this.frame;
    const o: Vec3 = [...caixa.centro];
    o[f.eixoNormal] = f.sinal > 0 ? caixa.max[f.eixoNormal]! : caixa.min[f.eixoNormal]!;
    return o;
  }

  /** Origem da face em coordenadas do MUNDO — para quem precisa desenhar um
   * indicador visual da face; o layout não usa. */
  origemMundo(): Vec3 {
    const m = this.cena.mundo().get(this.idDono)!.matriz;
    const o = this.origemLocal();
    return [
      m[0]! * o[0] + m[4]! * o[1] + m[8]! * o[2] + m[12]!,
      m[1]! * o[0] + m[5]! * o[1] + m[9]! * o[2] + m[13]!,
      m[2]! * o[0] + m[6]! * o[1] + m[10]! * o[2] + m[14]!,
    ];
  }

  /** Normal da face no espaço do mundo (normalizada). */
  normalMundo(): Vec3 {
    const m = this.cena.mundo().get(this.idDono)!.matriz;
    const n = aplicarDirecao(m, this.frame.normal);
    const c = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / c, n[1] / c, n[2] / c];
  }

  /** Eixos U/V da face no espaço do mundo (normalizados) — mesma ideia de
   * `normalMundo()`, para quem precisa do plano inteiro (não só a normal),
   * por exemplo para orientar algo "de lado" em vez de "para fora". */
  eixosMundo(): { u: Vec3; v: Vec3 } {
    const m = this.cena.mundo().get(this.idDono)!.matriz;
    const unit = (v: Vec3): Vec3 => {
      const c = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / c, v[1] / c, v[2] / c];
    };
    return { u: unit(aplicarDirecao(m, this.frame.u)), v: unit(aplicarDirecao(m, this.frame.v)) };
  }

  /** Ponto (u,v) do plano da face em coordenadas locais do dono. */
  pontoLocal(u: number, v: number): Vec3 {
    const o = this.origemLocal();
    const f = this.frame;
    return [
      o[0] + f.u[0] * u + f.v[0] * v,
      o[1] + f.u[1] * u + f.v[1] * v,
      o[2] + f.u[2] * u + f.v[2] * v,
    ];
  }

  // ── Operações ─────────────────────────────────────────────────────────

  /** Posiciona `alvo` na face: a borda dele encosta no plano EXATAMENTE e
   * ele nasce orientado para fora. Se o nó ainda não tem pai, vira filho do
   * dono da face. */
  colocar(alvo: AlvoNo | NoRef, opcoes: OpcoesColocar = {}): NoRef {
    const cena = this.cena;
    const no = cena.no(alvo as AlvoNo);
    if (no.id === this.idDono) throw new Error(`'${no.id}' não pode ser colocado na própria face`);
    // Colocar algo numa face faz dele parte daquele objeto: o padrão é
    // adotá-lo, para que mover o dono depois leve o que está nele junto.
    if (opcoes.reparentar !== false && cena.paiDe(no.id)?.id !== this.idDono) {
      cena.reparentar(no.id, this.idDono);
    }
    if (opcoes.orientar !== false) this.#orientar(no);
    this.#assentar(no, num(opcoes.u, 0), num(opcoes.v, 0), opcoes.alinhamento ?? "centro", num(opcoes.gap, 0));
    return cena.ref(no.id);
  }

  /** Distribui vários nós ao longo de um eixo do plano da face, com a
   * mesma semântica de `justify` do flexbox — sobre BORDAS. */
  distribuir(alvos: readonly (AlvoNo | NoRef)[], opcoes: OpcoesDistribuir = {}): NoRef[] {
    const eixo = opcoes.eixo ?? "u";
    const extensaoFace = this.extensao();
    const extensao = num(opcoes.extensao, eixo === "u" ? extensaoFace[0] : extensaoFace[1]);
    const gap = num(opcoes.gapEntre, 0);
    const justify = opcoes.justify ?? "space-between";
    const offset = num(opcoes.offset, 0);

    const refs = alvos.map((a) => this.colocar(a, { ...opcoes, u: 0, v: 0 }));
    const iEixo = eixo === "u" ? this.frame.eixoU : this.frame.eixoV;
    const tamanhos = refs.map((r) => aabbNoEspacoDe(this.cena, r.id, this.idDono).tamanho[iEixo]!);
    const posicoes = distribuirEm1D(tamanhos, extensao, gap, justify);

    refs.forEach((r, k) => {
      const c = posicoes[k]!;
      const u = eixo === "u" ? c : offset;
      const v = eixo === "u" ? offset : c;
      this.#assentar(r.no, u, v, "centro", num(opcoes.gap, 0));
    });
    return refs;
  }

  /** Arranja os nós numa grade `colunas × linhas` no plano da face. */
  grade(
    alvos: readonly (AlvoNo | NoRef)[],
    colunas: number,
    linhas?: number,
    opcoes: OpcoesGrade = {},
  ): NoRef[] {
    const n = alvos.length;
    if (colunas < 1) throw new Error(`grade precisa de pelo menos 1 coluna (recebeu ${colunas})`);
    const nLinhas = linhas ?? Math.ceil(n / colunas);
    const gap = opcoes.gapEntre ?? 0;
    const [gapU, gapV] = typeof gap === "number" ? [gap, gap] : gap;
    const extFace = this.extensao();
    const [extU, extV] = opcoes.extensao ?? extFace;
    const espalhar = opcoes.espalhar !== false;

    const refs = alvos.map((a) => this.colocar(a, { ...opcoes, u: 0, v: 0 }));
    const caixas = refs.map((r) => aabbNoEspacoDe(this.cena, r.id, this.idDono));
    const f = this.frame;
    const larguras = caixas.map((c) => c.tamanho[f.eixoU]!);
    const alturas = caixas.map((c) => c.tamanho[f.eixoV]!);
    const celulaU = Math.max(...larguras);
    const celulaV = Math.max(...alturas);

    const centrosU = espalhar
      ? distribuirEm1D(new Array(colunas).fill(celulaU), extU - 2 * num(gapU, 0), 0, "space-between")
      : distribuirEm1D(new Array(colunas).fill(celulaU), colunas * celulaU + (colunas - 1) * gapU, gapU, "center");
    const centrosV = espalhar
      ? distribuirEm1D(new Array(nLinhas).fill(celulaV), extV - 2 * num(gapV, 0), 0, "space-between")
      : distribuirEm1D(new Array(nLinhas).fill(celulaV), nLinhas * celulaV + (nLinhas - 1) * gapV, gapV, "center");

    refs.forEach((r, k) => {
      const col = k % colunas;
      const lin = Math.floor(k / colunas);
      if (lin >= nLinhas) {
        throw new Error(
          `grade de ${colunas}×${nLinhas} não comporta ${n} nós ` +
          `(sobram ${n - colunas * nLinhas})`,
        );
      }
      this.#assentar(r.no, centrosU[col]!, centrosV[lin]!, "centro", num(opcoes.gap, 0));
    });
    return refs;
  }

  // ── Internos ──────────────────────────────────────────────────────────

  /** Gira o nó para que o +Y local dele aponte na direção da normal da face
   * (e o +X local siga U). Escreve a rotação no espaço do pai real do nó. */
  #orientar(no: No): void {
    const cena = this.cena;
    const mundo = cena.mundo();
    const mDono = mundo.get(this.idDono)!.matriz;
    const f = this.frame;
    // base desejada no mundo: colunas = imagens de X, Y, Z locais do nó
    const U = aplicarDirecao(mDono, f.u);
    const N = aplicarDirecao(mDono, f.normal);
    const V = aplicarDirecao(mDono, f.v);
    const mDesejada = [
      ...unit(U), 0,
      ...unit(N), 0,
      ...unit(V), 0,
      0, 0, 0, 1,
    ];
    const pai = cena.paiDe(no.id);
    const mPai = pai ? mundo.get(pai.id)!.matriz : compor([0, 0, 0], [0, 0, 0], [1, 1, 1]);
    const local = multiplicar(inverter(mPai), mDesejada);
    no.transform.rotacao = decompor(local).rotacao;
    cena.invalidar();
  }

  /** Leva a borda do nó (no sentido contrário à normal) ao plano da face, e
   * o centro dele ao ponto (u,v). Tudo no espaço local do dono. */
  #assentar(no: No, u: number, v: number, alinhamento: Alinhamento, gap: number): void {
    const cena = this.cena;
    const f = this.frame;
    const alvoLocal = this.pontoLocal(u, v);
    const caixa = aabbNoEspacoDe(cena, no.id, this.idDono);

    const delta: Vec3 = [0, 0, 0];
    // eixo da normal: a borda oposta à normal encosta no plano (+ gap)
    const planoCoord = alvoLocal[f.eixoNormal]! + f.sinal * gap;
    const bordaAtual = f.sinal > 0 ? caixa.min[f.eixoNormal]! : caixa.max[f.eixoNormal]!;
    delta[f.eixoNormal] = planoCoord - bordaAtual;
    // eixos do plano: alinhamento pedido em relação ao ponto (u,v)
    for (const i of [f.eixoU, f.eixoV] as IndiceEixo[]) {
      const eixoDaFace = i === f.eixoU ? f.u : f.v;
      const sentido = eixoDaFace[i]! >= 0 ? 1 : -1;
      const atual =
        alinhamento === "centro" ? caixa.centro[i]!
        : (alinhamento === "inicio") === (sentido > 0) ? caixa.min[i]! : caixa.max[i]!;
      delta[i] = alvoLocal[i]! - atual;
    }

    const mDono = cena.mundo().get(this.idDono)!.matriz;
    cena.deslocarMundo(no.id, aplicarDirecao(mDono, delta));
  }
}

function unit(v: Vec3): Vec3 {
  const c = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / c, v[1] / c, v[2] / c];
}

/** Centros resultantes de distribuir `tamanhos` numa faixa de `extensao`
 * centrada em 0, com a semântica de `justify-content` do CSS aplicada às
 * BORDAS. Compartilhada por `Face.distribuir`/`Face.grade` e por
 * `layout.distribuir`. */
export function distribuirEm1D(
  tamanhos: readonly number[],
  extensao: number,
  gap: number,
  justify: NonNullable<OpcoesDistribuir["justify"]>,
): number[] {
  const n = tamanhos.length;
  if (n === 0) return [];
  const conteudo = tamanhos.reduce((a, b) => a + b, 0) + gap * (n - 1);
  const livre = Math.max(0, extensao - conteudo);
  let cursor = -extensao / 2;
  let entre = gap;
  switch (justify) {
    case "start": break;
    case "end": cursor += livre; break;
    case "center": cursor += livre / 2; break;
    case "space-between":
      if (n > 1) entre = gap + livre / (n - 1); else cursor += livre / 2;
      break;
    case "space-around": {
      const faixa = livre / n;
      entre = gap + faixa; cursor += faixa / 2; break;
    }
    case "space-evenly": {
      const faixa = livre / (n + 1);
      entre = gap + faixa; cursor += faixa; break;
    }
  }
  const centros: number[] = [];
  for (let k = 0; k < n; k++) {
    centros.push(cursor + tamanhos[k]! / 2);
    cursor += tamanhos[k]! + entre;
  }
  return centros;
}
