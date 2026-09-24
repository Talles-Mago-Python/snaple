/** Adesivos: imagens coladas numa região da superfície de um nó (rótulo de
 * lata, tela de monitor, logo numa caneca).
 *
 * Como a geometria, o adesivo é guardado só como PARÂMETRO (`no.adesivos`) e
 * o core devolve a receita da película onde a imagem vai: um retângulo no
 * plano de uma face, ou um pedaço da superfície de revolução. O backend só
 * monta a malha e aplica a imagem. Adesivo é aparência — não entra em bbox,
 * layout nem linter. */
import { caixaLocalPropria } from "./bbox.ts";
import { frameDaFace, normalizarFace } from "./face.ts";
import { perfilEfetivo } from "./lateral.ts";
import type { Adesivo, No, NomeFace } from "./tipos.ts";
import {
  type Ponto2D, type Vec3, EPS, escalar, num, produtoVetorial, somar,
} from "./vetor.ts";

/** Quanto a película fica afastada da superfície, ao longo da normal, para
 * não brigar com ela no depth buffer (z-fighting) — 0,1 mm. */
export const AFASTAMENTO_ADESIVO = 1e-4;

/** Película plana: retângulo `largura × altura` centrado em `centro`, com o
 * lado direito da imagem em `direita` e o topo em `cima` (unitários, no
 * espaço local do nó). */
export interface AdesivoPlano {
  tipo: "plano";
  src: string;
  centro: Vec3;
  direita: Vec3;
  cima: Vec3;
  normal: Vec3;
  largura: number;
  altura: number;
}

/** Película numa superfície de revolução em torno de +y local: o `perfil`
 * `(raio, altura)` recortado e já afastado da superfície, varrido de
 * `anguloInicio` por `abertura` radianos (convenção de `lateral()`:
 * `x = r·sin(a)`, `z = r·cos(a)`). A imagem vai da esquerda para a direita
 * no sentido do ângulo e de baixo para cima ao longo do perfil. */
export interface AdesivoRevolucao {
  tipo: "revolucao";
  src: string;
  perfil: Ponto2D[];
  anguloInicio: number;
  abertura: number;
}

export type AdesivoDerivado = AdesivoPlano | AdesivoRevolucao;

/** Faces planas que cada tipo tem de verdade. `extrude` só é plano em
 * `topo`/`base` (as paredes seguem o perfil); `cone` só na base. */
const FACES_PLANAS: Partial<Record<No["tipo"], readonly NomeFace[]>> = {
  box: ["topo", "base", "norte", "sul", "leste", "oeste"],
  plane: ["topo", "base"],
  extrude: ["topo", "base"],
  cylinder: ["topo", "base"],
  cone: ["base"],
};
const TIPOS_LATERAL: readonly No["tipo"][] = ["cylinder", "cone", "lathe"];

/** O topo da imagem em cada face: +y nas verticais, o norte (−z) nas
 * horizontais. A direita sai de `cima × normal`, o que deixa a imagem
 * legível (não espelhada) para quem olha a face de fora. */
function cimaDaImagem(face: NomeFace): Vec3 {
  return face === "topo" || face === "base" ? [0, 0, -1] : [0, 1, 0];
}

/** Receitas das películas de todos os adesivos do nó, no espaço local dele.
 * Lança com mensagem explicando o problema (face que o tipo não tem,
 * tamanho inválido, lateral em tipo sem superfície de revolução). */
export function derivarAdesivos(no: No): AdesivoDerivado[] {
  return (no.adesivos ?? []).map((a, i) => {
    if (!a.src) throw new Error(`adesivo ${i} de '${no.id}' sem 'src'`);
    return a.face === "lateral" ? adesivoLateral(no, a, i) : adesivoPlano(no, a, i);
  });
}

function tamanho(valor: number | undefined, padrao: number, campo: string, id: string, i: number): number {
  const x = valor === undefined ? padrao : num(valor);
  if (!(x > 0)) throw new Error(`adesivo ${i} de '${id}': '${campo}' precisa ser > 0 (recebeu ${x})`);
  return x;
}

function adesivoPlano(no: No, a: Adesivo, i: number): AdesivoPlano {
  const face = normalizarFace(a.face as NomeFace);
  const permitidas = FACES_PLANAS[no.tipo];
  if (!permitidas?.includes(face)) {
    throw new Error(
      `adesivo ${i} de '${no.id}': '${no.tipo}' não tem face plana '${face}'` +
      (permitidas ? ` (faces planas: ${permitidas.join(", ")})` : "") +
      (TIPOS_LATERAL.includes(no.tipo) ? `; para a superfície curva use face: "lateral"` : ""),
    );
  }
  const caixa = caixaLocalPropria(no)!;
  const f = frameDaFace(face);
  const centroCaixa: Vec3 = [
    (caixa.min[0] + caixa.max[0]) / 2, (caixa.min[1] + caixa.max[1]) / 2, (caixa.min[2] + caixa.max[2]) / 2,
  ];
  const plano = f.sinal > 0 ? caixa.max[f.eixoNormal]! : caixa.min[f.eixoNormal]!;
  const centroFace: Vec3 = [...centroCaixa];
  centroFace[f.eixoNormal] = plano;
  let centro = somar(centroFace, somar(escalar(f.u, num(a.u, 0)), escalar(f.v, num(a.v, 0))));
  centro = somar(centro, escalar(f.normal, AFASTAMENTO_ADESIVO));

  let cima = cimaDaImagem(face);
  let direita = produtoVetorial(cima, f.normal);
  const extU = caixa.max[f.eixoU]! - caixa.min[f.eixoU]!;
  const extV = caixa.max[f.eixoV]! - caixa.min[f.eixoV]!;
  // `direita` é paralela a U e `cima` a V em toda face, então o padrão
  // "face inteira" é a extensão da face nesses eixos
  const largura = tamanho(a.largura, extU, "largura", no.id, i);
  const altura = tamanho(a.altura, extV, "altura", no.id, i);
  const r = num(a.rotacao, 0);
  if (r !== 0) {
    const c = Math.cos(r), s = Math.sin(r);
    [direita, cima] = [
      somar(escalar(direita, c), escalar(cima, s)),
      somar(escalar(cima, c), escalar(direita, -s)),
    ];
  }
  return { tipo: "plano", src: a.src, centro, direita, cima, normal: f.normal, largura, altura };
}

function adesivoLateral(no: No, a: Adesivo, i: number): AdesivoRevolucao {
  if (!TIPOS_LATERAL.includes(no.tipo)) {
    throw new Error(
      `adesivo ${i} de '${no.id}': face "lateral" só existe em cylinder, cone e lathe — '${no.id}' é '${no.tipo}'`,
    );
  }
  const perfil = perfilEfetivo(no);
  const ys = perfil.map((p) => p[1]);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const altura = tamanho(a.altura, yMax - yMin, "altura", no.id, i);
  const v = num(a.v, (yMin + yMax) / 2);
  const de = Math.max(yMin, v - altura / 2), ate = Math.min(yMax, v + altura / 2);
  if (ate - de < EPS) {
    throw new Error(`adesivo ${i} de '${no.id}': a faixa de altura ${v - altura / 2}..${v + altura / 2} fica fora da peça (${yMin}..${yMax})`);
  }
  let recorte = recortarPerfil(perfil, de, ate);
  // a imagem sobe com a altura, qualquer que seja a ordem do perfil
  if (recorte[0]![1] > recorte[recorte.length - 1]![1]) recorte = recorte.reverse();

  const raioCentro = raioNaAltura(recorte, Math.min(Math.max(v, de), ate));
  const volta = 2 * Math.PI;
  let abertura = volta;
  if (a.largura !== undefined) {
    const largura = tamanho(a.largura, 0, "largura", no.id, i);
    if (raioCentro < EPS) throw new Error(`adesivo ${i} de '${no.id}': raio zero na altura ${v}, não há arco onde medir 'largura'`);
    abertura = Math.min(volta, largura / raioCentro);
  }
  return {
    tipo: "revolucao",
    src: a.src,
    perfil: afastarPerfil(recorte),
    anguloInicio: num(a.u, 0) - abertura / 2,
    abertura,
  };
}

/** Trecho do perfil com altura entre `de` e `ate`, cortando os segmentos que
 * cruzam os limites. Um perfil que volta (a parede de dentro de uma caneca)
 * passa mais de uma vez pela faixa: fica o trecho MAIS EXTERNO (maior raio
 * médio), que é a superfície vista de fora — o adesivo não vai para dentro. */
function recortarPerfil(perfil: Ponto2D[], de: number, ate: number): Ponto2D[] {
  const trechos: Ponto2D[][] = [];
  let atual: Ponto2D[] | null = null;
  const empurrar = (p: Ponto2D) => {
    const u = atual![atual!.length - 1];
    if (!u || Math.hypot(u[0] - p[0], u[1] - p[1]) > EPS) atual!.push(p);
  };
  const dentro = (p: Ponto2D) => p[1] >= de - EPS && p[1] <= ate + EPS;
  for (let k = 0; k < perfil.length - 1; k++) {
    const p = perfil[k]!, q = perfil[k + 1]!;
    const dy = q[1] - p[1];
    // pontos onde o segmento cruza os limites, em ordem ao longo dele
    const cortes = [de, ate]
      .map((y) => (Math.abs(dy) < EPS ? -1 : (y - p[1]) / dy))
      .filter((t) => t > 0 && t < 1)
      .sort((x, y) => x - y);
    const pts = [p, ...cortes.map((t) => [p[0] + (q[0] - p[0]) * t, p[1] + dy * t] as Ponto2D), q];
    for (let j = 0; j < pts.length - 1; j++) {
      const m: Ponto2D = [(pts[j]![0] + pts[j + 1]![0]) / 2, (pts[j]![1] + pts[j + 1]![1]) / 2];
      if (dentro(m)) {
        if (!atual) trechos.push(atual = []);
        empurrar(pts[j]!);
        empurrar(pts[j + 1]!);
      } else {
        atual = null;
      }
    }
  }
  const raioMedio = (t: Ponto2D[]) => t.reduce((s, p) => s + p[0], 0) / t.length;
  return trechos.reduce((a, b) => (raioMedio(b) > raioMedio(a) ? b : a));
}

function raioNaAltura(perfil: Ponto2D[], y: number): number {
  for (let k = 0; k < perfil.length - 1; k++) {
    const [r0, y0] = perfil[k]!, [r1, y1] = perfil[k + 1]!;
    if (y < Math.min(y0, y1) - EPS || y > Math.max(y0, y1) + EPS) continue;
    const t = Math.abs(y1 - y0) < EPS ? 0 : (y - y0) / (y1 - y0);
    return r0 + (r1 - r0) * t;
  }
  return perfil[0]![0];
}

/** Desloca cada ponto do perfil para fora da superfície (normal média dos
 * segmentos vizinhos, apontando para raio crescente). */
function afastarPerfil(perfil: Ponto2D[]): Ponto2D[] {
  const normal = (k: number): Ponto2D => {
    const [r0, y0] = perfil[k]!, [r1, y1] = perfil[k + 1]!;
    const dr = r1 - r0, dy = y1 - y0;
    const l = Math.hypot(dr, dy) || 1;
    let nr = dy / l, ny = -dr / l;
    if (nr < 0) { nr = -nr; ny = -ny; } // para fora (raio crescente), como em `lateral.ts`
    return [nr, ny];
  };
  return perfil.map((p, k) => {
    const ns = [k > 0 ? normal(k - 1) : null, k < perfil.length - 1 ? normal(k) : null].filter((n): n is Ponto2D => !!n);
    const m: Ponto2D = [ns.reduce((s, n) => s + n[0], 0), ns.reduce((s, n) => s + n[1], 0)];
    const l = Math.hypot(m[0], m[1]) || 1;
    return [p[0] + (m[0] / l) * AFASTAMENTO_ADESIVO, p[1] + (m[1] / l) * AFASTAMENTO_ADESIVO];
  });
}
