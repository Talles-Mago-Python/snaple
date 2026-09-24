/** Tradução da geometria DERIVADA do core para `THREE.BufferGeometry`.
 *
 * Toda conversão de convenção mora aqui. O core não sabe que o Three.js
 * existe: ele diz "extruda este contorno com estes buracos ao longo deste
 * eixo"; quem sabe que `ExtrudeGeometry` nasce no plano XY e cresce em +Z, ou
 * que `PlaneGeometry`/`TorusGeometry` nascem em XY e precisam girar para o
 * Y-up do core, é este arquivo. */
import * as THREE from "three";
import type {
  GeometriaDerivada, GeometriaExtrusao, GeometriaRevolucao, GeometriaHelice, GeometriaVarredura,
  ParteExtrusao, AnelVarredura, Vec3,
} from "@snaple/core";
import { verticeDoAnel } from "@snaple/core";
import type { Ponto2D } from "@snaple/core";

function n(v: unknown, padrao: number): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : padrao;
}

/** Uma geometria derivada pode virar MAIS DE UMA BufferGeometry: um furo de
 * profundidade parcial fatia a peça em trechos com conjuntos de furos
 * diferentes, e cada trecho é uma extrusão própria (é assim que o furo
 * parcial sai sem CSG). */
export function construirGeometrias(d: GeometriaDerivada): THREE.BufferGeometry[] {
  switch (d.tipo) {
    case "vazia":
      return [];
    case "modelo":
      return [caixaProxy(d.tamanho)];
    case "revolucao":
      return [revolucao(d)];
    case "helice":
      return [helice(d)];
    case "varredura":
      return [varredura(d)];
    case "extrusao":
      return extrusao(d);
    case "primitiva":
      return [primitiva(d.primitiva, d.params)];
    default: {
      const _e: never = d;
      throw new Error(`geometria derivada desconhecida: ${JSON.stringify(_e)}`);
    }
  }
}

export function caixaProxy(tamanho: readonly number[]): THREE.BoxGeometry {
  return new THREE.BoxGeometry(n(tamanho[0], 1), n(tamanho[1], 1), n(tamanho[2], 1));
}

function primitiva(tipo: string, p: Record<string, unknown>): THREE.BufferGeometry {
  switch (tipo) {
    case "box":
      return new THREE.BoxGeometry(n(p.largura, 1), n(p.altura, 1), n(p.profundidade, 1));
    case "sphere": {
      const seg = n(p.segmentos, 32);
      return new THREE.SphereGeometry(n(p.raio, 1), seg, Math.max(2, Math.round(seg / 2)));
    }
    case "cylinder":
      return new THREE.CylinderGeometry(
        n(p.raioTopo, 1), n(p.raioBase, 1), n(p.altura, 1), n(p.segmentos, 32),
      );
    case "cone":
      return new THREE.ConeGeometry(n(p.raio, 1), n(p.altura, 1), n(p.segmentos, 32));
    case "plane": {
      // core: plano em XZ, normal +y — Three: plano em XY, normal +z
      const g = new THREE.PlaneGeometry(n(p.largura, 1), n(p.profundidade, 1));
      g.rotateX(-Math.PI / 2);
      return g;
    }
    case "torus": {
      // core: anel em XZ, eixo +y — Three: anel em XY, eixo +z
      const g = new THREE.TorusGeometry(
        n(p.raio, 1), n(p.raioTubo, 0.25), n(p.segmentosTubo, 16), n(p.segmentos, 32),
      );
      g.rotateX(-Math.PI / 2);
      return g;
    }
    default:
      throw new Error(`primitiva sem tradução para Three.js: '${tipo}'`);
  }
}

function revolucao(d: GeometriaRevolucao): THREE.BufferGeometry {
  const pontos = d.perfil.map((p) => new THREE.Vector2(p[0], p[1]));
  return new THREE.LatheGeometry(pontos, d.segmentos);
}

/** Caminho helicoidal em torno de +y, já centrado — mesma convenção que o
 * core usa para a bbox analítica (`raio` fixo no plano XZ, `y` de
 * `-passo·voltas/2` a `+passo·voltas/2`). `TubeGeometry` varre um tubo de
 * seção circular ao longo desta curva. */
class CurvaHelice extends THREE.Curve<THREE.Vector3> {
  readonly raio: number;
  readonly passo: number;
  readonly voltas: number;

  constructor(raio: number, passo: number, voltas: number) {
    super();
    this.raio = raio;
    this.passo = passo;
    this.voltas = voltas;
  }

  override getPoint(t: number, alvo = new THREE.Vector3()): THREE.Vector3 {
    const alturaTotal = this.passo * this.voltas;
    const angulo = t * this.voltas * Math.PI * 2;
    return alvo.set(
      this.raio * Math.cos(angulo),
      -alturaTotal / 2 + t * alturaTotal,
      this.raio * Math.sin(angulo),
    );
  }
}

function helice(d: GeometriaHelice): THREE.BufferGeometry {
  const curva = new CurvaHelice(d.raio, d.passo, d.voltas);
  const segmentosTubulares = Math.max(2, Math.round(d.segmentosPorVolta * d.voltas));
  return new THREE.TubeGeometry(curva, segmentosTubulares, d.raioTubo, d.segmentosTubo, false);
}

function formaDaParte(parte: ParteExtrusao): THREE.Shape {
  const forma = new THREE.Shape(parte.contorno.map(paraVec2));
  for (const furo of parte.furos) forma.holes.push(new THREE.Path(furo.map(paraVec2)));
  return forma;
}

function paraVec2(p: Ponto2D): THREE.Vector2 {
  return new THREE.Vector2(p[0], p[1]);
}

function extrusao(d: GeometriaExtrusao): THREE.BufferGeometry[] {
  const rot = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(d.rotacao[0], d.rotacao[1], d.rotacao[2], "XYZ"),
  );
  // as fatias de um furo parcial compartilham o mesmo V ao longo do eixo
  const zMin = Math.min(...d.partes.map((p) => p.deslocamento - p.altura / 2));
  const zMax = Math.max(...d.partes.map((p) => p.deslocamento + p.altura / 2));
  return d.partes.map((parte) => {
    const forma = formaDaParte(parte);
    let g: THREE.BufferGeometry;
    if (Math.abs(parte.altura) < 1e-12) {
      // superfície sem espessura (um `plane` furado): não há o que extrudar
      g = new THREE.ShapeGeometry(forma);
      normalizarUVPlano(g, parte.contorno);
    } else {
      g = new THREE.ExtrudeGeometry(forma, {
        depth: parte.altura,
        bevelEnabled: false,
        curveSegments: 1,
        UVGenerator: geradorUV(parte, parte.deslocamento - parte.altura / 2 - zMin, zMax - zMin),
      });
      // ExtrudeGeometry cresce de z=0 a z=depth; centra a fatia e a
      // reposiciona no eixo pelo deslocamento que o core calculou
      g.translate(0, 0, parte.deslocamento - parte.altura / 2);
    }
    g.applyMatrix4(rot);
    g.computeVertexNormals();
    return g;
  });
}

// ── UV canônico ──────────────────────────────────────────────────────────
//
// Toda superfície vai de 0 a 1 em (u, v), para uma `textura` se comportar
// igual em qualquer tipo (ver `spec/README.md`). As primitivas do Three.js já
// fazem isso; `extrude` e `sweep` são montados aqui:
//  - tampas: o contorno normalizado pela própria caixa 2D;
//  - paredes: u = posição ao longo do perímetro do laço (0 a 1), v = posição
//    ao longo da extrusão/do caminho (0 a 1).

function caixa2D(pts: readonly Ponto2D[]): { min: Ponto2D; tam: Ponto2D } {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const min: Ponto2D = [Math.min(...xs), Math.min(...ys)];
  return { min, tam: [Math.max(...xs) - min[0] || 1, Math.max(...ys) - min[1] || 1] };
}

function normalizarUVPlano(g: THREE.BufferGeometry, contorno: readonly Ponto2D[]): void {
  const { min, tam } = caixa2D(contorno);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - min[0]) / tam[0], (uv.getY(i) - min[1]) / tam[1]);
}

/** Posição de cada ponto dos laços ao longo do próprio perímetro, 0..1. A
 * chave é a coordenada: o `ExtrudeGeometry` pode inverter a ordem dos laços,
 * então índice não serve. */
function perimetros(lacos: readonly (readonly Ponto2D[])[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const laco of lacos) {
    const acum = [0];
    for (let i = 1; i <= laco.length; i++) {
      const a = laco[i - 1]!, b = laco[i % laco.length]!;
      acum.push(acum[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = acum[laco.length]! || 1;
    laco.forEach((p, i) => m.set(chave2D(p[0], p[1]), acum[i]! / total));
  }
  return m;
}

function chave2D(x: number, y: number): string {
  return `${x.toFixed(9)},${y.toFixed(9)}`;
}

function geradorUV(parte: ParteExtrusao, zInicio: number, zTotal: number): THREE.ExtrudeGeometryOptions["UVGenerator"] {
  const { min, tam } = caixa2D(parte.contorno);
  const s = perimetros([parte.contorno, ...parte.furos]);
  const total = zTotal || 1;
  return {
    generateTopUV(_g, v, a, b, c) {
      return [a, b, c].map((i) => new THREE.Vector2((v[i * 3]! - min[0]) / tam[0], (v[i * 3 + 1]! - min[1]) / tam[1]));
    },
    generateSideWallUV(_g, v, a, b, c, d) {
      // a/d estão num ponto do laço, b/c no vizinho; o z vai de 0 a `altura`
      const u = (i: number) => s.get(chave2D(v[i * 3]!, v[i * 3 + 1]!)) ?? 0;
      let ua = u(a), ub = u(b);
      // a aresta que fecha o laço vai do fim (≈1) de volta ao início (0)
      if (Math.abs(ua - ub) > 0.5) { if (ua < ub) ua += 1; else ub += 1; }
      const w = (i: number) => (zInicio + v[i * 3 + 2]!) / total;
      return [new THREE.Vector2(ua, w(a)), new THREE.Vector2(ub, w(b)), new THREE.Vector2(ub, w(c)), new THREE.Vector2(ua, w(d))];
    },
  };
}

/** Uma coluna da seção ao longo do caminho: o ponto 2D, a normal 2D que ele
 * leva e o `u` da textura (posição no perímetro, 0..1). `pares` diz quais
 * colunas vizinhas formam uma faixa de quads. */
interface ColunasSecao {
  colunas: { p: Ponto2D; n: Ponto2D; u: number }[];
  pares: [number, number][];
}

/** Colunas de um laço fechado da seção. Suave (círculo): um vértice por
 * ponto, normal = média das arestas vizinhas. Facetada (retângulo, perfis):
 * dois vértices por aresta, com a normal da própria aresta — é o que deixa a
 * quina viva. A normal `(dt, -ds)` aponta para FORA do material tanto no
 * contorno (anti-horário) quanto nos furos (horários). */
function colunasDoLaco(laco: readonly Ponto2D[], suave: boolean): ColunasSecao {
  const n = laco.length;
  const normalDaAresta = (i: number): Ponto2D => {
    const a = laco[i]!, b = laco[(i + 1) % n]!;
    const ds = b[0] - a[0], dt = b[1] - a[1];
    const l = Math.hypot(ds, dt) || 1;
    return [dt / l, -ds / l];
  };
  const acum = [0];
  for (let i = 1; i <= n; i++) {
    const a = laco[i - 1]!, b = laco[i % n]!;
    acum.push(acum[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const u = (i: number) => acum[i]! / (acum[n]! || 1);
  if (suave) {
    // n+1 colunas: a última repete o primeiro ponto com u = 1, para a
    // textura não dar a volta para trás na costura
    const colunas = Array.from({ length: n + 1 }, (_, i) => {
      const a = normalDaAresta((i - 1 + n) % n), b = normalDaAresta(i % n);
      const l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
      return { p: laco[i % n]!, n: [(a[0] + b[0]) / l, (a[1] + b[1]) / l] as Ponto2D, u: u(i) };
    });
    return { colunas, pares: Array.from({ length: n }, (_, i) => [i, i + 1] as [number, number]) };
  }
  const colunas: { p: Ponto2D; n: Ponto2D; u: number }[] = [];
  const pares: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const nm = normalDaAresta(i);
    colunas.push({ p: laco[i]!, n: nm, u: u(i) }, { p: laco[(i + 1) % n]!, n: nm, u: u(i + 1) });
    pares.push([2 * i, 2 * i + 1]);
  }
  return { colunas, pares };
}

/** Costura os anéis que o core resolveu. As posições saem de
 * `verticeDoAnel`, a mesma função da bbox do core — por isso a malha cabe
 * exatamente na caixa que o layout usou. */
function varredura(d: GeometriaVarredura): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const vertice = (q: Vec3, n: Vec3, uv: Ponto2D): number => {
    pos.push(q[0], q[1], q[2]);
    nor.push(n[0], n[1], n[2]);
    uvs.push(uv[0], uv[1]);
    return pos.length / 3 - 1;
  };
  // v da textura: comprimento acumulado da linha de centro, 0..1 no caminho todo
  const todos = d.trechos.flatMap((t) => (t.fechado ? [...t.aneis, t.aneis[0]!] : t.aneis));
  let comprimento = 0;
  const vDoAnel = new Map<AnelVarredura, number>();
  todos.forEach((anel, i) => {
    if (i > 0) {
      const a = todos[i - 1]!.ponto, b = anel.ponto;
      comprimento += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    if (!vDoAnel.has(anel)) vDoAnel.set(anel, comprimento);
  });
  const vFinal = comprimento || 1;
  const normal3 = (anel: AnelVarredura, n: Ponto2D): Vec3 => [
    anel.u[0] * n[0] + anel.v[0] * n[1],
    anel.u[1] * n[0] + anel.v[1] * n[1],
    anel.u[2] * n[0] + anel.v[2] * n[1],
  ];
  /** Triângulo `a b c` na ordem cuja face aponta para o lado de `n`. */
  const triangulo = (a: number, b: number, c: number, n: Vec3) => {
    const p = (i: number) => new THREE.Vector3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
    const face = new THREE.Vector3().crossVectors(p(b).sub(p(a)), p(c).sub(p(a)));
    if (face.x * n[0] + face.y * n[1] + face.z * n[2] >= 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  };

  const lacos = [d.secao.contorno, ...d.secao.furos].map((l) => colunasDoLaco(l, d.secao.suave));
  for (const trecho of d.trechos) {
    // fechado: o primeiro anel é repetido no fim com v = 1 (mesma posição),
    // para a textura não voltar de 1 para 0 na costura
    const aneis = trecho.fechado ? [...trecho.aneis, trecho.aneis[0]!] : trecho.aneis;
    for (const { colunas, pares } of lacos) {
      const base = aneis.map((anel, r) => {
        const primeiro = pos.length / 3;
        const v = (r === aneis.length - 1 && trecho.fechado ? comprimento : vDoAnel.get(anel)!) / vFinal;
        for (const c of colunas) vertice(verticeDoAnel(anel, c.p), normal3(anel, c.n), [c.u, v]);
        return primeiro;
      });
      for (let r = 0; r < base.length - 1; r++) {
        const r2 = r + 1;
        for (const [a, b] of pares) {
          const a0 = base[r]! + a, b0 = base[r]! + b, a1 = base[r2]! + a, b1 = base[r2]! + b;
          const n = normal3(aneis[r]!, colunas[a]!.n);
          triangulo(a0, b0, b1, n);
          triangulo(a0, b1, a1, n);
        }
      }
    }
  }

  if (d.tampas && d.trechos.length) {
    const contorno = d.secao.contorno.map(paraVec2);
    const furos = d.secao.furos.map((f) => f.map(paraVec2));
    const faces = THREE.ShapeUtils.triangulateShape(contorno, furos);
    const pontos = [d.secao.contorno, ...d.secao.furos].flat();
    const { min, tam } = caixa2D(d.secao.contorno);
    const primeiro = d.trechos[0]!.aneis[0]!;
    const ultimoTrecho = d.trechos[d.trechos.length - 1]!.aneis;
    const ultimo = ultimoTrecho[ultimoTrecho.length - 1]!;
    for (const [anel, sinal] of [[primeiro, -1], [ultimo, 1]] as const) {
      const n: Vec3 = [anel.tangente[0] * sinal, anel.tangente[1] * sinal, anel.tangente[2] * sinal];
      const base = pos.length / 3;
      for (const p of pontos) vertice(verticeDoAnel(anel, p), n, [(p[0] - min[0]) / tam[0], (p[1] - min[1]) / tam[1]]);
      for (const [a, b, c] of faces) triangulo(base + a!, base + b!, base + c!, n);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}
