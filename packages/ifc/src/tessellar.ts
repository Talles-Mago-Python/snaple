/** Tesselação de fallback: gera triângulos puros (sem THREE.js — este pacote
 * roda em Node puro) para as geometrias sem equivalente paramétrico direto
 * em IFC. Usada por `helix`, `torus`, `sweep`, tronco de cone (`cylinder`
 * com `raioTopo != raioBase`) e `plane`. Ver README do pacote, tabela de
 * mapeamento, para a lista completa e a perda que cada uma documenta (malha
 * facetada em vez de superfície analítica — mesma perda que qualquer
 * exportador de malha, não uma limitação introduzida por este backend).
 *
 * `verticeDoAnel`/`resolverVarredura` vêm do CORE (não do backend Three.js):
 * são a mesma matemática que já garante a bbox exata do `sweep`, então a
 * malha tesselada aqui cabe exatamente na bbox que o core calculou. */
import {
  type AnelVarredura, type GeometriaVarredura, type Ponto2D, type TrechoVarredura,
  type Vec3, verticeDoAnel,
} from "@snaple/core";

export type Triangulo = readonly [Vec3, Vec3, Vec3];

/** Escala componente a componente — a única forma de escala que uma malha
 * tesselada nunca perde precisão, mesmo não-uniforme (ao contrário dos
 * sólidos CSG/paramétricos: ver `geometria.ts`). */
function esc(p: Vec3, s: Vec3): Vec3 {
  return [p[0] * s[0], p[1] * s[1], p[2] * s[2]];
}

/** Quadrilátero → dois triângulos, ordem consistente para a normal sair do
 * lado esperado quando os 4 pontos estão em ordem anti-horária vistos de
 * fora. */
function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3): Triangulo[] {
  return [[a, b, c], [a, c, d]];
}

export function tesselarPlano(largura: number, profundidade: number, escala: Vec3): Triangulo[] {
  const hx = (largura / 2) * escala[0], hz = (profundidade / 2) * escala[2];
  const a: Vec3 = [-hx, 0, -hz], b: Vec3 = [hx, 0, -hz], c: Vec3 = [hx, 0, hz], d: Vec3 = [-hx, 0, hz];
  return quad(a, b, c, d);
}

/** Tronco de cone (ou cone/cilindro degenerados quando um raio é 0):
 * `segmentos` fatias, duas tampas (fan a partir do centro) + laterais. */
export function tesselarTroncoCone(
  raioTopo: number, raioBase: number, altura: number, segmentos: number, escala: Vec3,
): Triangulo[] {
  const n = Math.max(3, Math.round(segmentos));
  const tris: Triangulo[] = [];
  const anelBase: Vec3[] = [], anelTopo: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cos = Math.cos(a), sin = Math.sin(a);
    anelBase.push(esc([raioBase * cos, -altura / 2, raioBase * sin], escala));
    anelTopo.push(esc([raioTopo * cos, altura / 2, raioTopo * sin], escala));
  }
  const centroBase = esc([0, -altura / 2, 0], escala);
  const centroTopo = esc([0, altura / 2, 0], escala);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (raioBase > 1e-12) tris.push([centroBase, anelBase[j]!, anelBase[i]!]);
    if (raioTopo > 1e-12) tris.push([centroTopo, anelTopo[i]!, anelTopo[j]!]);
    tris.push(...quad(anelBase[i]!, anelBase[j]!, anelTopo[j]!, anelTopo[i]!));
  }
  return tris;
}

/** Esfera (fallback só para escala não-uniforme, onde deixa de ser uma
 * esfera de verdade e `IfcSphere` não serve mais — ver `geometria.ts`):
 * grade latitude × longitude, polos degenerados nos dois extremos. */
export function tesselarEsfera(raio: number, segmentos: number, escala: Vec3): Triangulo[] {
  const n = Math.max(3, Math.round(segmentos)), m = Math.max(2, Math.round(segmentos / 2));
  const aneis: Vec3[][] = [];
  for (let j = 0; j <= m; j++) {
    const phi = (j / m) * Math.PI;
    const y = raio * Math.cos(phi), r = raio * Math.sin(phi);
    const linha: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      linha.push(esc([r * Math.cos(a), y, r * Math.sin(a)], escala));
    }
    aneis.push(linha);
  }
  const tris: Triangulo[] = [];
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) tris.push(...quad(aneis[j]![i]!, aneis[j]![i + 1]!, aneis[j + 1]![i + 1]!, aneis[j + 1]![i]!));
  }
  return tris;
}

/** Toro: grade `segmentos × segmentosTubo` de anéis, fechada nas duas
 * direções (superfície sem tampas). */
export function tesselarToro(
  raio: number, raioTubo: number, segmentos: number, segmentosTubo: number, escala: Vec3,
): Triangulo[] {
  const n = Math.max(3, Math.round(segmentos)), m = Math.max(3, Math.round(segmentosTubo));
  const pontos: Vec3[][] = [];
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2;
    const linha: Vec3[] = [];
    for (let j = 0; j < m; j++) {
      const phi = (j / m) * Math.PI * 2;
      const r = raio + raioTubo * Math.cos(phi);
      linha.push(esc([r * Math.cos(theta), raioTubo * Math.sin(phi), r * Math.sin(theta)], escala));
    }
    pontos.push(linha);
  }
  const tris: Triangulo[] = [];
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      tris.push(...quad(pontos[i]![j]!, pontos[i2]![j]!, pontos[i2]![j2]!, pontos[i]![j2]!));
    }
  }
  return tris;
}

/** Tubo de seção circular sobre o caminho helicoidal — mesma parametrização
 * usada para a bbox analítica no core (`meiaExtensaoLocal`, caso `helix`) e
 * para a malha do backend Three.js (`CurvaHelice`). O referencial do tubo em
 * cada anel é construído projetando a direção radial (perpendicular ao eixo
 * `y`) no plano normal à tangente — estável em qualquer hélice não
 * degenerada (raio e passo > 0), sem o "flip" que um frame de Frenet puro
 * teria nos pontos de curvatura mínima. */
export function tesselarHelice(
  raio: number, raioTubo: number, passo: number, voltas: number,
  segmentosPorVolta: number, segmentosTubo: number, escala: Vec3,
): Triangulo[] {
  const nAneis = Math.max(2, Math.round(segmentosPorVolta * voltas));
  const nTubo = Math.max(3, Math.round(segmentosTubo));
  const alturaTotal = passo * voltas;
  const ponto = (t: number): Vec3 => {
    const angulo = t * voltas * Math.PI * 2;
    return [raio * Math.cos(angulo), -alturaTotal / 2 + t * alturaTotal, raio * Math.sin(angulo)];
  };
  const tangente = (t: number): Vec3 => {
    const angulo = t * voltas * Math.PI * 2;
    const dAng = voltas * Math.PI * 2;
    const v: Vec3 = [-raio * dAng * Math.sin(angulo), alturaTotal, raio * dAng * Math.cos(angulo)];
    const c = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / c, v[1] / c, v[2] / c];
  };
  const aneis: Vec3[][] = [];
  for (let i = 0; i <= nAneis; i++) {
    const t = i / nAneis;
    const p = ponto(t), tg = tangente(t);
    // radial: direção do eixo y até p, achatada no plano normal à tangente
    const radial: Vec3 = [Math.cos(t * voltas * Math.PI * 2), 0, Math.sin(t * voltas * Math.PI * 2)];
    const dot = radial[0] * tg[0] + radial[1] * tg[1] + radial[2] * tg[2];
    const nrm: Vec3 = [radial[0] - dot * tg[0], radial[1] - dot * tg[1], radial[2] - dot * tg[2]];
    const cn = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
    const n0: Vec3 = [nrm[0] / cn, nrm[1] / cn, nrm[2] / cn];
    // binormal = tangente × normal — completa o referencial do tubo
    const b0: Vec3 = [
      tg[1] * n0[2] - tg[2] * n0[1], tg[2] * n0[0] - tg[0] * n0[2], tg[0] * n0[1] - tg[1] * n0[0],
    ];
    const linha: Vec3[] = [];
    for (let j = 0; j < nTubo; j++) {
      const a = (j / nTubo) * Math.PI * 2;
      const cos = Math.cos(a) * raioTubo, sin = Math.sin(a) * raioTubo;
      linha.push(esc([
        p[0] + n0[0] * cos + b0[0] * sin,
        p[1] + n0[1] * cos + b0[1] * sin,
        p[2] + n0[2] * cos + b0[2] * sin,
      ], escala));
    }
    aneis.push(linha);
  }
  const tris: Triangulo[] = [];
  for (let i = 0; i < nAneis; i++) {
    for (let j = 0; j < nTubo; j++) {
      const j2 = (j + 1) % nTubo;
      tris.push(...quad(aneis[i]![j]!, aneis[i]![j2]!, aneis[i + 1]![j2]!, aneis[i + 1]![j]!));
    }
  }
  return tris;
}

/** Perfil (`ParamsLathe.perfil`, já `[raio, altura]` recentrado pelo core)
 * varrido em torno do eixo `y` local — fallback só usado quando a escala do
 * nó não é uniforme no plano XZ (a revolução exata deixa de valer, ver
 * `geometria.ts`). Sem tampas: como no core, um perfil que não termina em
 * raio 0 gera uma superfície aberta nas pontas — a mesma perda documentada
 * para `lathe` sem `recentrar`. */
export function tesselarLathe(perfil: readonly Ponto2D[], segmentos: number, escala: Vec3): Triangulo[] {
  const n = Math.max(3, Math.round(segmentos));
  const aneis: Vec3[][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cos = Math.cos(a), sin = Math.sin(a);
    aneis.push(perfil.map(([raio, altura]) => esc([raio * cos, altura, raio * sin], escala)));
  }
  const tris: Triangulo[] = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k + 1 < perfil.length; k++) {
      tris.push(...quad(aneis[i]![k]!, aneis[i]![k + 1]!, aneis[i + 1]![k + 1]!, aneis[i + 1]![k]!));
    }
  }
  return tris;
}

// ── Sweep ────────────────────────────────────────────────────────────────

function normal3(anel: AnelVarredura, n: Ponto2D): Vec3 {
  return [
    anel.u[0] * n[0] + anel.v[0] * n[1],
    anel.u[1] * n[0] + anel.v[1] * n[1],
    anel.u[2] * n[0] + anel.v[2] * n[1],
  ];
}

function produtoVetorial(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function produtoEscalar(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Colunas de um laço fechado da seção — versão sem normal/UV do que
 * `packages/three/src/geometria.ts` faz (`colunasDoLaco`): só a posição 2D
 * importa aqui, a normal de cada triângulo sai do produto vetorial na hora
 * de fechar a face, não precisa ser pré-computada por vértice. */
function reordenarLoop(pts: readonly Ponto2D[], suave: boolean): Ponto2D[] {
  if (suave) return [...pts, pts[0]!]; // costura: repete o primeiro
  const dup: Ponto2D[] = [];
  for (let i = 0; i < pts.length; i++) dup.push(pts[i]!, pts[(i + 1) % pts.length]!);
  return dup;
}

/** Porta para TS puro (sem `THREE.Vector3`) a costura de anéis que
 * `packages/three/src/geometria.ts` (`varredura`) já faz para o backend
 * Three.js — mesma lógica, saída em triângulos puros em vez de
 * `BufferGeometry`. Reusa `verticeDoAnel` do core: por isso os vértices
 * batem exatamente com a bbox que o core já calculou para o `sweep`. */
export function tesselarSweep(d: GeometriaVarredura, escala: Vec3): Triangulo[] {
  const tris: Triangulo[] = [];
  const lacos = [d.secao.contorno, ...d.secao.furos].map((l) => ({
    pts: reordenarLoop(l, d.secao.suave),
    pares: d.secao.suave
      ? Array.from({ length: l.length }, (_, i) => [i, i + 1] as [number, number])
      : Array.from({ length: l.length }, (_, i) => [2 * i, 2 * i + 1] as [number, number]),
  }));
  const normaisDoLaco = (pts: readonly Ponto2D[], suave: boolean): Ponto2D[] => {
    const n = suave ? pts.length - 1 : pts.length / 2;
    const normalAresta = (i: number): Ponto2D => {
      const a = pts[suave ? i : 2 * i]!, b = pts[suave ? (i + 1) % (pts.length - 1) : 2 * i + 1]!;
      const ds = b[0] - a[0], dt = b[1] - a[1];
      const l = Math.hypot(ds, dt) || 1;
      return [dt / l, -ds / l];
    };
    if (!suave) return Array.from({ length: n }, (_, i) => normalAresta(i)).flatMap((nm) => [nm, nm]);
    return Array.from({ length: pts.length }, (_, i) => {
      const a = normalAresta((i - 1 + n) % n), b = normalAresta(i % n);
      const l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
      return [(a[0] + b[0]) / l, (a[1] + b[1]) / l] as Ponto2D;
    });
  };
  const trechosProcessados = (trecho: TrechoVarredura): AnelVarredura[] =>
    trecho.fechado ? [...trecho.aneis, trecho.aneis[0]!] : trecho.aneis;

  for (const trecho of d.trechos) {
    const aneis = trechosProcessados(trecho);
    for (let li = 0; li < lacos.length; li++) {
      const { pts, pares } = lacos[li]!;
      const normais = normaisDoLaco(pts, d.secao.suave);
      for (let r = 0; r + 1 < aneis.length; r++) {
        const a0 = aneis[r]!, a1 = aneis[r + 1]!;
        for (const [ia, ib] of pares) {
          const p00 = esc(verticeDoAnel(a0, pts[ia]!), escala);
          const p10 = esc(verticeDoAnel(a0, pts[ib]!), escala);
          const p11 = esc(verticeDoAnel(a1, pts[ib]!), escala);
          const p01 = esc(verticeDoAnel(a1, pts[ia]!), escala);
          const n = normal3(a0, normais[ia]!);
          // orienta o quad para a normal declarada, testando o produto
          // vetorial do triângulo contra ela (mesmo teste de `three/geometria.ts`)
          const face = produtoVetorial([p10[0] - p00[0], p10[1] - p00[1], p10[2] - p00[2]],
            [p11[0] - p00[0], p11[1] - p00[1], p11[2] - p00[2]]);
          if (produtoEscalar(face, n) >= 0) tris.push([p00, p10, p11], [p00, p11, p01]);
          else tris.push([p00, p11, p10], [p00, p01, p11]);
        }
      }
    }
  }

  if (d.tampas && d.trechos.length) {
    const contorno = d.secao.contorno;
    const primeiro = d.trechos[0]!.aneis[0]!;
    const ultimoTrecho = d.trechos[d.trechos.length - 1]!.aneis;
    const ultimo = ultimoTrecho[ultimoTrecho.length - 1]!;
    for (const [anel, sinal] of [[primeiro, -1], [ultimo, 1]] as const) {
      const pontos = contorno.map((p) => esc(verticeDoAnel(anel, p), escala));
      // fan simples a partir do primeiro ponto — válido para os perfis
      // convexos que `perfis.ts` produz; perfil côncavo tesselado por este
      // fallback pode sair com uma tampa incorreta (ver README, perdas).
      for (let i = 1; i + 1 < pontos.length; i++) {
        if (sinal < 0) tris.push([pontos[0]!, pontos[i + 1]!, pontos[i]!]);
        else tris.push([pontos[0]!, pontos[i]!, pontos[i + 1]!]);
      }
    }
  }
  return tris;
}
