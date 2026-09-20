/** Padrões repetidos ao redor de um eixo LOCAL de um nó — serrilhas,
 * parafusos em círculo, marcadores de mostrador. Generaliza o padrão manual
 * de `for (i) { const a = i/n*TAU; criar(..., [cos(a)*r, y, sin(a)*r], ...,
 * [0,-a,0]) }` que aparecia repetido (e reimplementado de forma diferente
 * cada vez) em mais de um modelo autorado à mão contra esta lib. */
import type { NoRef } from "./cena.ts";
import { type Eixo, type Vec3, indiceDoEixo } from "./vetor.ts";

export interface OpcoesPadraoCircular {
  /** Raio do círculo, em metros. */
  raio: number;
  /** Eixo LOCAL do dono ao redor do qual distribuir. Padrão `"y"` — o eixo
   * de `cylinder`/`lathe`/`helix`. */
  eixo?: Eixo;
  /** Ângulo do primeiro elemento, em radianos. Padrão 0. */
  fase?: number;
  /** `false` mantém a rotação que `fabrica` já deu ao nó, só reposiciona.
   * Padrão `true`: gira cada nó por `ângulo` em torno de `eixo`, para que
   * dentes/parafusos radiais fiquem virados para fora por construção. */
  orientar?: boolean;
}

/** Cria `n` nós via `fabrica(i)` (que deve criar cada um como filho de
 * `dono`, por exemplo `dono.criar(...)`) e os distribui em círculo de
 * `raio`, ângulos igualmente espaçados a partir de `fase`, no plano
 * perpendicular a `eixo` — no referencial LOCAL de `dono`, não no mundo. A
 * coordenada de `fabrica(i)` ao longo do próprio `eixo` é preservada (é
 * assim que dá para escrever uma fileira de parafusos numa altura fixa,
 * só variando o ângulo). */
export function padraoCircular(
  dono: NoRef,
  fabrica: (i: number) => NoRef,
  n: number,
  opcoes: OpcoesPadraoCircular,
): NoRef[] {
  if (n < 1) throw new Error(`padraoCircular precisa de pelo menos 1 elemento (recebeu ${n})`);
  const cena = dono.cena;
  const iEixo = indiceDoEixo(opcoes.eixo ?? "y");
  const outros = ([0, 1, 2] as const).filter((i) => i !== iEixo);
  const passo = (Math.PI * 2) / n;
  const fase = opcoes.fase ?? 0;
  const orientar = opcoes.orientar !== false;

  const nos: NoRef[] = [];
  for (let i = 0; i < n; i++) {
    const no = fabrica(i);
    if (no.pai()?.id !== dono.id) {
      throw new Error(
        `padraoCircular: 'fabrica(${i})' devolveu '${no.id}', que não é filho de '${dono.id}' — crie o nó com 'dono.criar(...)'`,
      );
    }
    const a = fase + i * passo;
    const posicao: Vec3 = [...no.transform.posicao];
    posicao[outros[0]!] = Math.cos(a) * opcoes.raio;
    posicao[outros[1]!] = Math.sin(a) * opcoes.raio;
    const transform: { posicao: Vec3; rotacao?: Vec3 } = { posicao };
    if (orientar) {
      const rotacao: Vec3 = [0, 0, 0];
      rotacao[iEixo] = a;
      transform.rotacao = rotacao;
    }
    cena.transformar(no.id, transform);
    nos.push(no);
  }
  return nos;
}
