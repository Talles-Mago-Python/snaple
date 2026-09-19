/** Geometria DERIVADA: a receita que um backend segue para construir malha.
 *
 * O estado nunca guarda vértices. Um furo é um parâmetro no nó; aqui ele
 * vira um contorno 2D com buracos, que o backend extruda. É por isso que
 * mudar o raio do furo e regerar funciona, que o furo serializa em JSON, e
 * que ele sobrevive à troca de backend.
 *
 * Furo de profundidade parcial também sai sem CSG: o eixo da extrusão é
 * fatiado nos intervalos onde o conjunto de furos ativos é constante, e cada
 * fatia vira uma extrusão própria. Um furo passante é o caso degenerado com
 * uma fatia só.
 *
 * CSG é ponto de extensão futuro e NÃO está implementado: os casos que
 * exigiriam CSG (furos em faces de normais diferentes no mesmo nó, furo em
 * geometria não-extrudável, furo em malha importada) retornam erro
 * explicando por quê, nunca um resultado silenciosamente errado. */
import { type AABB, meiaExtensaoLocal, extensaoPerfil, sobreposicao } from "./bbox.ts";
import { frameDaFace, normalizarFace } from "./face.ts";
import { ehContainer } from "./no.ts";
import type { Cena } from "./cena.ts";
import type {
  FeatureFuro, FormaFuro, No, NomeFace, ParamsCylinder, ParamsExtrude,
  ParamsLathe, ParamsModel, ParamsPlane, ParamsBox, TipoGeometria,
} from "./tipos.ts";
import { type Eixo, type IndiceEixo, type Ponto2D, type Vec3, EPS, arred, num } from "./vetor.ts";

/** Erro de feature impossível. Tipo próprio para quem usa a lib poder
 * distinguir "pedi algo que essa geometria não suporta" de um bug. */
export class ErroFeature extends Error {
  readonly noId: string;
  readonly motivo: MotivoErroFeature;

  constructor(message: string, noId: string, motivo: MotivoErroFeature) {
    super(message);
    this.name = "ErroFeature";
    this.noId = noId;
    this.motivo = motivo;
  }
}

export type MotivoErroFeature =
  | "malha-importada"
  | "geometria-nao-extrudavel"
  | "faces-conflitantes"
  | "atravessa-outro-no"
  | "furo-maior-que-o-no";

/** Uma fatia da extrusão: contorno externo + buracos, no plano da forma. */
export interface ParteExtrusao {
  /** Contorno fechado no plano da forma (shape-XY), sentido anti-horário. */
  contorno: Ponto2D[];
  /** Buracos, no mesmo plano. Listas fechadas, sentido horário. */
  furos: Ponto2D[][];
  /** Comprimento da fatia ao longo do eixo de extrusão (shape-Z). */
  altura: number;
  /** Centro da fatia ao longo do eixo de extrusão, relativo à origem local. */
  deslocamento: number;
}

/** Contrato normativo core→backend. A forma 2D vive sempre no plano XY com
 * extrusão em +Z (o referencial nativo de qualquer extrusor); `rotacao` leva
 * esse referencial para o espaço local do nó. */
export interface GeometriaExtrusao {
  tipo: "extrusao";
  partes: ParteExtrusao[];
  /** Euler XYZ (rad) a aplicar na geometria extrudada. */
  rotacao: Vec3;
  /** Eixo local ao longo do qual a extrusão acontece — informativo. */
  eixo: Eixo;
}

export interface GeometriaRevolucao {
  tipo: "revolucao";
  /** Pontos `[raio, altura]`, já recentrados em torno da origem local. */
  perfil: Ponto2D[];
  segmentos: number;
}

export interface GeometriaPrimitiva {
  tipo: "primitiva";
  primitiva: TipoGeometria;
  params: Record<string, unknown>;
}

export interface GeometriaModelo {
  tipo: "modelo";
  src: string;
  /** Bounding box DECLARADA, em metros. O layout já usou este valor. */
  tamanho: Vec3;
}

export interface GeometriaVazia {
  tipo: "vazia";
}

export type GeometriaDerivada =
  | GeometriaPrimitiva | GeometriaExtrusao | GeometriaRevolucao
  | GeometriaModelo | GeometriaVazia;

// ── Referencial da forma por eixo de extrusão ────────────────────────────

/** Para cada eixo de extrusão local: a rotação a aplicar na geometria
 * extrudada (que nasce em XY/+Z) e as imagens dos eixos da forma no espaço
 * local — `X'` e `Y'` são usadas para projetar pontos locais no plano da
 * forma. Todas são rotações puras, então o sentido (handedness) do contorno
 * é preservado e as normais saem para fora. */
const REFERENCIAL: Record<Eixo, { rotacao: Vec3; X: Vec3; Y: Vec3 }> = {
  // Rx(-90°): Z'→+y, X'→+x, Y'→-z
  y: { rotacao: [-Math.PI / 2, 0, 0], X: [1, 0, 0], Y: [0, 0, -1] },
  // Ry(+90°): Z'→+x, X'→-z, Y'→+y
  x: { rotacao: [0, Math.PI / 2, 0], X: [0, 0, -1], Y: [0, 1, 0] },
  // identidade
  z: { rotacao: [0, 0, 0], X: [1, 0, 0], Y: [0, 1, 0] },
};

const EIXO_NOME: readonly Eixo[] = ["x", "y", "z"];

/** Projeta um ponto local no plano da forma do eixo de extrusão dado. */
function paraForma(p: Vec3, eixo: Eixo): Ponto2D {
  const r = REFERENCIAL[eixo];
  return [
    p[0] * r.X[0] + p[1] * r.X[1] + p[2] * r.X[2],
    p[0] * r.Y[0] + p[1] * r.Y[1] + p[2] * r.Y[2],
  ];
}

// ── Contornos ────────────────────────────────────────────────────────────

export function retangulo(largura: number, altura: number, centro: Ponto2D = [0, 0]): Ponto2D[] {
  const hx = largura / 2, hy = altura / 2;
  const [cx, cy] = centro;
  return [
    [cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy],
  ];
}

export function circulo(raio: number, segmentos = 32, centro: Ponto2D = [0, 0]): Ponto2D[] {
  const n = Math.max(3, Math.floor(segmentos));
  const pts: Ponto2D[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([centro[0] + Math.cos(a) * raio, centro[1] + Math.sin(a) * raio]);
  }
  return pts;
}

function contornoDaForma(forma: FormaFuro, centro: Ponto2D): Ponto2D[] {
  switch (forma.tipo) {
    case "circulo":
      return circulo(num(forma.raio, 0.1), num(forma.segmentos, 32), centro);
    case "retangulo":
      return retangulo(num(forma.largura, 0.1), num(forma.altura, 0.1), centro);
    case "poligono": {
      const pts = forma.pontos ?? [];
      if (pts.length < 3) throw new Error(`polígono de furo precisa de ao menos 3 pontos`);
      return pts.map((p) => [centro[0] + num(p[0]), centro[1] + num(p[1])] as Ponto2D);
    }
    default: {
      const _e: never = forma;
      throw new Error(`forma de furo desconhecida: ${JSON.stringify(_e)}`);
    }
  }
}

// ── Derivação ────────────────────────────────────────────────────────────

export function derivarGeometria(cena: Cena, no: No): GeometriaDerivada {
  if (ehContainer(no)) return { tipo: "vazia" };

  if (no.tipo === "model") {
    const p = no.params as ParamsModel;
    if (no.features.length > 0) {
      throw new ErroFeature(
        `não dá para furar '${no.id}': é um nó 'model' (malha importada de ` +
        `'${p.src}'), não uma geometria paramétrica — não há parâmetros a ` +
        `regerar com o furo incluído. Recorte o furo na malha de origem, ou ` +
        `substitua o nó por uma geometria paramétrica equivalente.`,
        no.id, "malha-importada",
      );
    }
    return { tipo: "modelo", src: p.src, tamanho: [...(p.tamanho ?? [1, 1, 1])] as Vec3 };
  }

  const furos = no.features.filter((f): f is FeatureFuro => f.tipo === "furo");
  if (furos.length === 0) {
    if (no.tipo === "extrude") return extrusaoSimples(no);
    if (no.tipo === "lathe") return revolucao(no);
    return { tipo: "primitiva", primitiva: no.tipo as TipoGeometria, params: { ...(no.params as object) } };
  }

  return extrusaoComFuros(cena, no, furos);
}

function extrusaoSimples(no: No): GeometriaExtrusao {
  const p = no.params as ParamsExtrude;
  const pts = p.perfil ?? [];
  if (pts.length < 3) throw new Error(`'${no.id}': perfil de 'extrude' precisa de ao menos 3 pontos`);
  const { centro } = extensaoPerfil(pts);
  // perfil declarado em (x, z) local → plano da forma do eixo y
  const contorno = pts.map((q) => paraForma([num(q[0]) - centro[0], 0, num(q[1]) - centro[1]], "y"));
  return {
    tipo: "extrusao",
    eixo: "y",
    rotacao: REFERENCIAL.y.rotacao,
    partes: [{ contorno, furos: [], altura: num(p.altura, 1), deslocamento: 0 }],
  };
}

function revolucao(no: No): GeometriaRevolucao {
  const p = no.params as ParamsLathe;
  const pts = p.perfil ?? [];
  if (pts.length < 2) throw new Error(`'${no.id}': perfil de 'lathe' precisa de ao menos 2 pontos`);
  const ys = pts.map((q) => num(q[1]));
  const meio = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    tipo: "revolucao",
    perfil: pts.map((q) => [Math.abs(num(q[0])), num(q[1]) - meio] as Ponto2D),
    segmentos: num(p.segmentos, 32),
  };
}

/** Base extrudável do nó ao longo de um eixo pedido: contorno da seção e
 * comprimento. `null` quando a geometria não é uma extrusão nesse eixo. */
function baseExtrudavel(no: No, eixo: Eixo): { contorno: Ponto2D[]; altura: number } | null {
  const h = meiaExtensaoLocal(no);
  if (!h) return null;
  const i = EIXO_NOME.indexOf(eixo) as IndiceEixo;
  switch (no.tipo) {
    case "box": {
      const q = no.params as ParamsBox;
      const dim: Vec3 = [num(q.largura, 1), num(q.altura, 1), num(q.profundidade, 1)];
      const outros = ([0, 1, 2] as IndiceEixo[]).filter((k) => k !== i);
      const a = outros[0]!, b = outros[1]!;
      const ca: Vec3 = [0, 0, 0]; ca[a] = dim[a]! / 2;
      const cb: Vec3 = [0, 0, 0]; cb[b] = dim[b]! / 2;
      const fa = paraForma(ca, eixo), fb = paraForma(cb, eixo);
      // a seção é um retângulo alinhado aos eixos da forma; monta pelos cantos
      const cantos: Ponto2D[] = [
        [-fa[0] - fb[0], -fa[1] - fb[1]],
        [fa[0] - fb[0], fa[1] - fb[1]],
        [fa[0] + fb[0], fa[1] + fb[1]],
        [-fa[0] + fb[0], -fa[1] + fb[1]],
      ];
      return { contorno: garantirAntiHorario(cantos), altura: dim[i]! };
    }
    case "cylinder": {
      if (eixo !== "y") return null;
      const q = no.params as ParamsCylinder;
      const rt = num(q.raioTopo, 1), rb = num(q.raioBase, 1);
      if (Math.abs(rt - rb) > EPS) return null; // tronco de cone: não é extrusão
      return { contorno: circulo(rt, num(q.segmentos, 32)), altura: num(q.altura, 1) };
    }
    case "plane": {
      if (eixo !== "y") return null;
      const q = no.params as ParamsPlane;
      const contorno = garantirAntiHorario([
        paraForma([-num(q.largura, 1) / 2, 0, -num(q.profundidade, 1) / 2], "y"),
        paraForma([num(q.largura, 1) / 2, 0, -num(q.profundidade, 1) / 2], "y"),
        paraForma([num(q.largura, 1) / 2, 0, num(q.profundidade, 1) / 2], "y"),
        paraForma([-num(q.largura, 1) / 2, 0, num(q.profundidade, 1) / 2], "y"),
      ]);
      return { contorno, altura: 0 };
    }
    case "extrude": {
      if (eixo !== "y") return null;
      const base = extrusaoSimples(no);
      return { contorno: base.partes[0]!.contorno, altura: base.partes[0]!.altura };
    }
    default:
      return null;
  }
}

function extrusaoComFuros(cena: Cena, no: No, furos: readonly FeatureFuro[]): GeometriaExtrusao {
  const faces = furos.map((f) => normalizarFace(f.face));
  const eixos = new Set(faces.map((f) => EIXO_NOME[frameDaFace(f).eixoNormal]!));
  if (eixos.size > 1) {
    throw new ErroFeature(
      `'${no.id}' tem furos em faces de normais diferentes (${[...eixos].join(", ")}). ` +
      `Regerar a geometria exige um único eixo de extrusão; furos cruzados ` +
      `precisariam de CSG, que esta versão não implementa. Separe o nó em ` +
      `partes, uma por direção de furo.`,
      no.id, "faces-conflitantes",
    );
  }
  const eixo = [...eixos][0]!;
  const base = baseExtrudavel(no, eixo);
  if (!base) {
    throw new ErroFeature(
      `não dá para furar '${no.id}' (tipo '${no.tipo}') na direção ${eixo}: ` +
      `essa geometria não é a extrusão de um perfil 2D nesse eixo, então não ` +
      `há perfil onde inserir o furo. Tipos furáveis: box (qualquer eixo), ` +
      `cylinder reto, plane e extrude (eixo y). Um furo aqui precisaria de CSG.`,
      no.id, "geometria-nao-extrudavel",
    );
  }

  const h = meiaExtensaoLocal(no)!;
  const iEixo = EIXO_NOME.indexOf(eixo) as IndiceEixo;
  const meia = h[iEixo]!;

  // Cada furo vira um intervalo [a, b] no eixo de extrusão + um contorno.
  interface FuroResolvido { de: number; ate: number; contorno: Ponto2D[]; rotulo: string }
  const resolvidos: FuroResolvido[] = furos.map((f, k) => {
    const face = faces[k]!;
    const frame = frameDaFace(face);
    const plano = frame.sinal > 0 ? meia : -meia;
    const profundidade = f.profundidade === undefined ? 2 * meia : num(f.profundidade, 2 * meia);
    if (profundidade <= 0) throw new Error(`'${no.id}': profundidade de furo precisa ser > 0`);
    const fim = plano - frame.sinal * Math.min(profundidade, 2 * meia);
    const de = Math.min(plano, fim), ate = Math.max(plano, fim);
    // centro do furo no espaço local: ponto (u,v) no plano da face
    const centroLocal: Vec3 = [0, 0, 0];
    centroLocal[frame.eixoU] = frame.u[frame.eixoU]! * num(f.u);
    centroLocal[frame.eixoV] = frame.v[frame.eixoV]! * num(f.v);
    const centroForma = paraForma(centroLocal, eixo);
    const contorno = contornoDaForma(f.forma, centroForma);
    verificarCabe(no, base.contorno, contorno);
    return { de, ate, contorno: garantirHorario(contorno), rotulo: `${face}@(${arred(num(f.u))},${arred(num(f.v))})` };
  });

  verificarNaoAtravessaOutroNo(cena, no, furos, faces);

  // Fatia o eixo nos pontos onde o conjunto de furos ativos muda.
  const cortes = new Set<number>([-meia, meia]);
  for (const r of resolvidos) { cortes.add(r.de); cortes.add(r.ate); }
  const ordenados = [...cortes].sort((a, b) => a - b).filter((c) => c >= -meia - EPS && c <= meia + EPS);

  const partes: ParteExtrusao[] = [];
  const contornoBase = garantirAntiHorario(base.contorno);
  if (base.altura === 0) {
    // superfície sem espessura (plane): uma parte só, furos todos ativos
    partes.push({ contorno: contornoBase, furos: resolvidos.map((r) => r.contorno), altura: 0, deslocamento: 0 });
  } else {
    for (let k = 0; k + 1 < ordenados.length; k++) {
      const a = ordenados[k]!, b = ordenados[k + 1]!;
      if (b - a <= EPS) continue;
      const meio = (a + b) / 2;
      const ativos = resolvidos.filter((r) => r.de < meio && meio < r.ate).map((r) => r.contorno);
      partes.push({ contorno: contornoBase, furos: ativos, altura: b - a, deslocamento: meio });
    }
  }

  return { tipo: "extrusao", eixo, rotacao: REFERENCIAL[eixo].rotacao, partes };
}

/** Um furo maior que a própria peça não é um furo — é um erro de parâmetro. */
function verificarCabe(no: No, contorno: readonly Ponto2D[], furo: readonly Ponto2D[]): void {
  const ext = (pts: readonly Ponto2D[]) => {
    const us = pts.map((p) => p[0]), vs = pts.map((p) => p[1]);
    return { minU: Math.min(...us), maxU: Math.max(...us), minV: Math.min(...vs), maxV: Math.max(...vs) };
  };
  const c = ext(contorno), f = ext(furo);
  if (f.minU < c.minU - EPS || f.maxU > c.maxU + EPS || f.minV < c.minV - EPS || f.maxV > c.maxV + EPS) {
    throw new ErroFeature(
      `o furo pedido em '${no.id}' sai para fora da peça ` +
      `(furo ocupa [${arred(f.minU)}, ${arred(f.maxU)}] × [${arred(f.minV)}, ${arred(f.maxV)}], ` +
      `peça ocupa [${arred(c.minU)}, ${arred(c.maxU)}] × [${arred(c.minV)}, ${arred(c.maxV)}]). ` +
      `Reduza a forma ou aproxime (u, v) do centro da face.`,
      no.id, "furo-maior-que-o-no",
    );
  }
}

/** Um furo é sempre LOCAL a um nó. Se o volume perfurado alcança outro nó da
 * cena, o usuário provavelmente quis um furo atravessando as duas peças — e
 * isso não existe: cada peça precisa do seu próprio furo. */
function verificarNaoAtravessaOutroNo(
  cena: Cena, no: No, furos: readonly FeatureFuro[], faces: readonly NomeFace[],
): void {
  let mundo;
  try {
    mundo = cena.mundo();
  } catch {
    return; // nó ainda não está na cena: nada com que colidir
  }
  const meu = mundo.get(no.id);
  if (!meu?.propria) return;

  furos.forEach((f, k) => {
    const frame = frameDaFace(faces[k]!);
    const caixa = meu.propria!;
    const i = frame.eixoNormal;
    const extensaoNo = caixa.tamanho[i]!;
    const profundidade = f.profundidade === undefined ? extensaoNo : num(f.profundidade, extensaoNo);
    if (profundidade <= extensaoNo + EPS) return; // fica dentro do próprio nó

    // volume da broca: a caixa do nó, estendida além da face oposta
    const sobra = profundidade - extensaoNo;
    const broca: AABB = {
      min: [...caixa.min] as Vec3, max: [...caixa.max] as Vec3,
      centro: [...caixa.centro] as Vec3, tamanho: [...caixa.tamanho] as Vec3,
    };
    if (frame.sinal > 0) broca.min[i] = caixa.min[i]! - sobra;
    else broca.max[i] = caixa.max[i]! + sobra;

    for (const outro of mundo!.values()) {
      if (outro.no.id === no.id || !outro.propria) continue;
      if (outro.ancestrais.includes(no.id) || meu.ancestrais.includes(outro.no.id)) continue;
      const s = sobreposicao(broca, outro.propria);
      if (s[0]! > EPS && s[1]! > EPS && s[2]! > EPS) {
        throw new ErroFeature(
          `o furo pedido em '${no.id}' (face ${faces[k]}, profundidade ` +
          `${arred(profundidade)} m) atravessa também o nó '${outro.no.id}'. ` +
          `Um furo pertence a um único nó: dê um furo a cada peça, alinhando ` +
          `(u, v), em vez de um furo só que varre as duas.`,
          no.id, "atravessa-outro-no",
        );
      }
    }
  });
}

/** Área com sinal (shoelace). Positiva = anti-horário. */
export function areaComSinal(pts: readonly Ponto2D[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Contorno externo anti-horário e furos horários: é o que faz as normais
 * saírem para fora em qualquer extrusor, sem o backend precisar adivinhar. */
export function garantirAntiHorario(pts: Ponto2D[]): Ponto2D[] {
  return areaComSinal(pts) < 0 ? [...pts].reverse() : pts;
}

export function garantirHorario(pts: Ponto2D[]): Ponto2D[] {
  return areaComSinal(pts) > 0 ? [...pts].reverse() : pts;
}
