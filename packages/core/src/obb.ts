/** Oriented bounding box (OBB) e teste de eixos separadores (SAT) — a versão
 * orientada da AABB usada em `validar.ts` como refinamento de precisão.
 *
 * A OBB de um nó é sempre a mesma caixa local PRÓPRIA que `bbox.ts` já usa
 * (`caixaLocalPropria`), só que levada ao mundo pela rotação/escala REAIS do
 * nó em vez de inflada para os eixos do mundo. É isso que elimina o falso
 * positivo clássico de AABB: duas peças giradas que não se tocam, mas cujas
 * caixas alinhadas aos eixos do mundo (que precisam envolver a peça inteira
 * rotacionada) se sobrepõem mesmo assim. Duas barras giradas 45° cada uma
 * para lados opostos são o caso canônico. */
import { type Mat4, aplicarPonto, baseDeEuler, decompor } from "./matriz.ts";
import { caixaLocalPropria } from "./bbox.ts";
import type { No } from "./tipos.ts";
import { type Vec3, EPS, comprimento, produtoEscalar, produtoVetorial, subtrair } from "./vetor.ts";

export interface OBB {
  /** Centro da caixa, no mundo (não necessariamente a origem do nó — ver o
   * caso `extrude` com `recentrar: false`, cuja caixa local é assimétrica). */
  centro: Vec3;
  /** Os três eixos da caixa, unitários, expressos no mundo. */
  eixos: readonly [Vec3, Vec3, Vec3];
  /** Meia-extensão ao longo de cada eixo correspondente, em metros — já
   * multiplicada pela escala do nó no mundo. */
  meiosEixos: Vec3;
}

/** OBB de um nó a partir da matriz de mundo já resolvida. `null` para
 * containers (sem geometria própria) — mesmo caso em que `caixaLocalPropria`
 * devolve `null`.
 *
 * A rotação/escala usadas vêm de `decompor(matrizMundo)`, a mesma
 * aproximação ortonormal que o resto da lib já assume quando um ancestral
 * tem escala não uniforme + rotação (documentado em `matriz.ts`) — não é uma
 * limitação nova introduzida aqui. */
export function obbDoNo(no: No, matrizMundo: Mat4): OBB | null {
  const caixa = caixaLocalPropria(no);
  if (!caixa) return null;
  const centroLocal: Vec3 = [
    (caixa.min[0] + caixa.max[0]) / 2,
    (caixa.min[1] + caixa.max[1]) / 2,
    (caixa.min[2] + caixa.max[2]) / 2,
  ];
  const { rotacao, escala } = decompor(matrizMundo);
  const base = baseDeEuler(rotacao);
  return {
    centro: aplicarPonto(matrizMundo, centroLocal),
    eixos: [base.ex, base.ey, base.ez],
    meiosEixos: [
      ((caixa.max[0] - caixa.min[0]) / 2) * Math.abs(escala[0]),
      ((caixa.max[1] - caixa.min[1]) / 2) * Math.abs(escala[1]),
      ((caixa.max[2] - caixa.min[2]) / 2) * Math.abs(escala[2]),
    ],
  };
}

/** Raio da sombra da OBB projetada sobre `eixo` (unitário) — soma das
 * meias-extensões ponderada pelo quanto cada eixo da caixa se alinha com o
 * eixo de projeção. Fórmula padrão de SAT para caixas orientadas. */
function raioProjetado(obb: OBB, eixo: Vec3): number {
  return (
    obb.meiosEixos[0] * Math.abs(produtoEscalar(eixo, obb.eixos[0])) +
    obb.meiosEixos[1] * Math.abs(produtoEscalar(eixo, obb.eixos[1])) +
    obb.meiosEixos[2] * Math.abs(produtoEscalar(eixo, obb.eixos[2]))
  );
}

const TOL_EIXO_DEGENERADO = EPS * 1e3;

/** Duas OBBs se sobrepõem se, e só se, NENHUM dos 15 eixos candidatos as
 * separa: os 3 eixos de face de `a`, os 3 de `b`, e os 9 produtos vetoriais
 * de uma aresta de `a` com uma de `b`. Eixos quase degenerados (arestas
 * quase paralelas) são pulados — já cobertos pelos testes de face.
 *
 * `tolerancia` é a folga mínima de sobreposição para responder `true` (padrão
 * 0: contato exato ainda conta como sobreposição, o sentido geométrico puro).
 * O linter passa `TOL_CONTATO` — a fase ampla dele já ignora sobreposições
 * até essa folga, e o SAT precisa usar a MESMA régua: duas peças apenas
 * encostadas ficam com separação de ±ε em cada eixo, e sem a folga a que cai
 * para o lado negativo do arredondamento saía como penetração de 0 m. */
export function obbsSeSobrepoem(a: OBB, b: OBB, tolerancia = 0): boolean {
  const d = subtrair(b.centro, a.centro);
  const candidatos: Vec3[] = [...a.eixos, ...b.eixos];
  for (const ea of a.eixos) {
    for (const eb of b.eixos) candidatos.push(produtoVetorial(ea, eb));
  }
  for (const bruto of candidatos) {
    const c = comprimento(bruto);
    if (c < TOL_EIXO_DEGENERADO) continue;
    const eixo: Vec3 = [bruto[0] / c, bruto[1] / c, bruto[2] / c];
    const dist = Math.abs(produtoEscalar(d, eixo));
    if (dist > raioProjetado(a, eixo) + raioProjetado(b, eixo) - tolerancia) return false;
  }
  return true;
}
