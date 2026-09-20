/** Bounding box alinhada aos eixos (AABB), derivada de tipo + params +
 * transform. Não há round-trip a render em lugar nenhum daqui — é a base de
 * todo o resto da lib e roda em Node puro.
 *
 * INVARIANTE CENTRAL: toda geometria paramétrica desta lib é **centrada na
 * própria origem local**. Rotacionar um conjunto de pontos simétrico em torno
 * da origem preserva a simetria (R(-v) = -R(v)), então o centro da AABB
 * mundial de um nó sem filhos é sempre o ponto (0,0,0) local levado para o
 * mundo — qualquer que seja a rotação. É isso que permite a `colocar`/
 * `encostar`/`distribuir` só calcularem "que centro eu quero" e escreverem de
 * volta, sem nunca resolverem "onde foi parar o centro depois de girar".
 *
 * A AABB de um nó rotacionado é a caixa alinhada aos eixos que ENVOLVE a
 * geometria girada ("inflada"), não uma OBB exata. */
import { type Mat4, aplicarPonto } from "./matriz.ts";
import { type Vec3, type Ponto2D, type IndiceEixo, num, EPS } from "./vetor.ts";
import type {
  No, TipoNo, ParamsBox, ParamsSphere, ParamsCylinder, ParamsCone,
  ParamsPlane, ParamsTorus, ParamsExtrude, ParamsLathe, ParamsHelix, ParamsModel,
} from "./tipos.ts";

export interface AABB {
  min: Vec3;
  max: Vec3;
  centro: Vec3;
  tamanho: Vec3;
}

export function aabbDeMinMax(min: Vec3, max: Vec3): AABB {
  return {
    min: [min[0], min[1], min[2]],
    max: [max[0], max[1], max[2]],
    centro: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    tamanho: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

export function aabbDeCentroTamanho(centro: Vec3, tamanho: Vec3): AABB {
  const h: Vec3 = [tamanho[0] / 2, tamanho[1] / 2, tamanho[2] / 2];
  return aabbDeMinMax(
    [centro[0] - h[0], centro[1] - h[1], centro[2] - h[2]],
    [centro[0] + h[0], centro[1] + h[1], centro[2] + h[2]],
  );
}

export function unirAABB(a: AABB | null, b: AABB | null): AABB | null {
  if (!a) return b;
  if (!b) return a;
  return aabbDeMinMax(
    [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  );
}

export function unirTodas(caixas: readonly (AABB | null)[]): AABB | null {
  return caixas.reduce<AABB | null>((acc, c) => unirAABB(acc, c), null);
}

/** Sobreposição por eixo (negativa = separação). */
export function sobreposicao(a: AABB, b: AABB): Vec3 {
  return [0, 1, 2].map(
    (i) => Math.min(a.max[i]!, b.max[i]!) - Math.max(a.min[i]!, b.min[i]!),
  ) as Vec3;
}

/** Sobrepostas nos 3 eixos por mais que `folga`. */
export function seInterpenetram(a: AABB, b: AABB, folga = EPS): boolean {
  const s = sobreposicao(a, b);
  return s[0] > folga && s[1] > folga && s[2] > folga;
}

/** Sobreposição nos dois eixos que NÃO são `eixo` — "está por cima?". */
export function sobrepoeNoPlano(a: AABB, b: AABB, eixo: IndiceEixo, folga = EPS): boolean {
  const s = sobreposicao(a, b);
  return [0, 1, 2].every((i) => i === eixo || s[i]! > folga);
}

// ── Meia-extensão local por tipo de geometria ────────────────────────────

/** Meia-extensão (half-extents) da geometria do nó, no espaço local dele,
 * ANTES da própria transform. `null` para containers (`grupo`/`row`/`column`/
 * `stack`), que não têm geometria própria — a extensão deles vem dos filhos.
 *
 * `features` não entram: um furo remove material, nunca aumenta a AABB. */
export function meiaExtensaoLocal(no: No): Vec3 | null {
  const p = no.params as Record<string, unknown>;
  switch (no.tipo as TipoNo) {
    case "box": {
      const q = p as unknown as ParamsBox;
      return [num(q.largura, 1) / 2, num(q.altura, 1) / 2, num(q.profundidade, 1) / 2];
    }
    case "sphere": {
      const r = num((p as unknown as ParamsSphere).raio, 1);
      return [r, r, r];
    }
    case "cylinder": {
      const q = p as unknown as ParamsCylinder;
      const r = Math.max(num(q.raioTopo, 1), num(q.raioBase, 1));
      return [r, num(q.altura, 1) / 2, r];
    }
    case "cone": {
      const q = p as unknown as ParamsCone;
      const r = num(q.raio, 1);
      return [r, num(q.altura, 1) / 2, r];
    }
    case "plane": {
      const q = p as unknown as ParamsPlane;
      // espessura EXATAMENTE zero: um plano é uma superfície, e é isso que
      // faz "apoiado sobre o chão" dar diferença 0, não 0.001.
      return [num(q.largura, 1) / 2, 0, num(q.profundidade, 1) / 2];
    }
    case "torus": {
      const q = p as unknown as ParamsTorus;
      const r = num(q.raio, 1), rt = num(q.raioTubo, 0.25);
      return [r + rt, rt, r + rt];
    }
    case "extrude": {
      const q = p as unknown as ParamsExtrude;
      const e = extensaoPerfil(q.perfil ?? []);
      return [e.meio[0], num(q.altura, 1) / 2, e.meio[1]];
    }
    case "lathe": {
      const q = p as unknown as ParamsLathe;
      const pts = q.perfil ?? [];
      if (pts.length === 0) return [0, 0, 0];
      const raios = pts.map((pt) => Math.abs(num(pt[0])));
      const ys = pts.map((pt) => num(pt[1]));
      const r = Math.max(...raios);
      return [r, (Math.max(...ys) - Math.min(...ys)) / 2, r];
    }
    case "helix": {
      // Analítica, sem tocar em malha: no plano XZ o tubo nunca passa de
      // raio + raioTubo do eixo (a trajetória fica a `raio` fixo, e o tubo
      // soma no máximo `raioTubo` a partir daquele ponto).
      //
      // Em Y, a trajetória cobre `passo × voltas`, mas isso SUBESTIMA a
      // malha real: nas duas pontas abertas do tubo, a "tampa" (círculo
      // perpendicular à TANGENTE, não ao eixo Y) pode ir além do y da própria
      // trajetória — o quanto depende do ângulo de passo. No limite de passo
      // raso (quase um anel achatado — o caso `mola`/`cabo espiralado` com
      // poucas voltas de passo curto), esse excesso tende a `raioTubo`
      // inteiro. Somar essa margem nas duas pontas é o que garante que a
      // malha do backend sempre CABE dentro da bbox que o core declarou —
      // confirmado contra a malha real do TubeGeometry em
      // `tests/backend.test.ts`.
      const q = p as unknown as ParamsHelix;
      const raioTubo = num(q.raioTubo, 0.01);
      const alcanceXZ = num(q.raio, 0.1) + raioTubo;
      const alturaTotal = Math.abs(num(q.passo, 0.05)) * num(q.voltas, 1);
      return [alcanceXZ, alturaTotal / 2 + raioTubo, alcanceXZ];
    }
    case "model": {
      const t = (p as unknown as ParamsModel).tamanho ?? [1, 1, 1];
      return [num(t[0], 1) / 2, num(t[1], 1) / 2, num(t[2], 1) / 2];
    }
    case "grupo":
    case "row":
    case "column":
    case "stack":
    case "junta":
      return null;
    default: {
      const _exaustivo: never = no.tipo as never;
      throw new Error(`tipo de nó desconhecido: '${String(_exaustivo)}'`);
    }
  }
}

/** Extensão de um perfil 2D: meia-extensão e centro (para recentrar o perfil
 * na origem local, mantendo a invariante de simetria). */
export function extensaoPerfil(pontos: readonly Ponto2D[]): { meio: Ponto2D; centro: Ponto2D } {
  if (pontos.length === 0) return { meio: [0, 0], centro: [0, 0] };
  const us = pontos.map((p) => num(p[0]));
  const vs = pontos.map((p) => num(p[1]));
  const minU = Math.min(...us), maxU = Math.max(...us);
  const minV = Math.min(...vs), maxV = Math.max(...vs);
  return {
    meio: [(maxU - minU) / 2, (maxV - minV) / 2],
    centro: [(minU + maxU) / 2, (minV + maxV) / 2],
  };
}

export interface CaixaLocal { min: Vec3; max: Vec3 }

/** Caixa local PRÓPRIA de um nó: como `meiaExtensaoLocal`, mas expressa como
 * min/max em vez de meia-extensão, o que permite representar geometria
 * DESCENTRADA da origem — hoje só `extrude` com `recentrar: false` usa isso.
 * Para todo o resto, `min = -max` (a mesma caixa simétrica de sempre). */
export function caixaLocalPropria(no: No): CaixaLocal | null {
  if (no.tipo === "extrude" && (no.params as ParamsExtrude).recentrar === false) {
    const q = no.params as ParamsExtrude;
    const { meio, centro } = extensaoPerfil(q.perfil ?? []);
    const meiaAltura = num(q.altura, 1) / 2;
    return {
      min: [centro[0] - meio[0], -meiaAltura, centro[1] - meio[1]],
      max: [centro[0] + meio[0], meiaAltura, centro[1] + meio[1]],
    };
  }
  // Simétrico ao caso de `extrude` acima, mas no eixo Y (o da revolução) em
  // vez do plano XZ: o raio continua sempre simétrico em torno do eixo (é
  // um sólido de revolução), só a faixa de altura fica como o perfil
  // declarou, sem recentrar.
  if (no.tipo === "lathe" && (no.params as ParamsLathe).recentrar === false) {
    const q = no.params as ParamsLathe;
    const pts = q.perfil ?? [];
    if (pts.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
    const r = Math.max(...pts.map((pt) => Math.abs(num(pt[0]))));
    const ys = pts.map((pt) => num(pt[1]));
    return { min: [-r, Math.min(...ys), -r], max: [r, Math.max(...ys), r] };
  }
  const h = meiaExtensaoLocal(no);
  if (!h) return null;
  return { min: [-h[0], -h[1], -h[2]], max: [h[0], h[1], h[2]] };
}

/** AABB mundial da geometria própria do nó: os 8 cantos da caixa local
 * levados pela matriz acumulada, e min/max em cada eixo. Generaliza para
 * caixa local assimétrica (ver `caixaLocalPropria`) — para o caso comum,
 * simétrico, o resultado é idêntico a inflar ±meia-extensão como antes. */
export function aabbProprio(no: No, matriz: Mat4): AABB | null {
  const caixa = caixaLocalPropria(no);
  if (!caixa) return null;
  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const sx of [caixa.min[0], caixa.max[0]]) {
    for (const sy of [caixa.min[1], caixa.max[1]]) {
      for (const sz of [caixa.min[2], caixa.max[2]]) {
        const c = aplicarPonto(matriz, [sx, sy, sz]);
        for (let i = 0; i < 3; i++) {
          if (c[i]! < min[i]!) min[i] = c[i]!;
          if (c[i]! > max[i]!) max[i] = c[i]!;
        }
      }
    }
  }
  return aabbDeMinMax(min, max);
}
