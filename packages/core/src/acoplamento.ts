/** Acoplamentos: relações declaradas entre duas faces de dois nós, guardadas
 * como estado da cena e VERIFICADAS sob demanda — nunca resolvidas. O
 * layout continua vindo inteiramente de `face().colocar()`, dos containers e
 * das fórmulas do modelo; um acoplamento só confere, a qualquer momento e em
 * qualquer pose, se uma relação que deveria valer ainda vale.
 *
 * `contato`: as duas faces no mesmo plano, normais opostas — uma peça
 * assentada sobre outra. `pivo`: os CENTROS coincidem (não só o plano) e as
 * normais ficam opostas — o eixo de giro é a normal compartilhada. */
import type { Cena } from "./cena.ts";
import { Face } from "./face.ts";
import type { Acoplamento, TipoAcoplamento } from "./tipos.ts";
import { distancia, produtoEscalar, subtrair } from "./vetor.ts";

/** Erro de um acoplamento, já calculado das faces atuais: `erroPosicao` em
 * metros, `erroAngulo` em radianos (0 = normais exatamente opostas).
 * Separados de propósito — são grandezas de naturezas diferentes, e um
 * relatório útil não devia somá-las num número só. */
export interface ErroDoAcoplamento {
  erroPosicao: number;
  erroAngulo: number;
}

/** Calcula o erro atual de `ac` a partir das faces reais no mundo — a MESMA
 * conta usada por `Cena.conferirMontagem` e pelo linter (`validar.ts`), para
 * as duas nunca divergirem. */
export function erroDoAcoplamento(cena: Cena, ac: Acoplamento): ErroDoAcoplamento {
  const fa = new Face(cena, ac.a.no, ac.a.face);
  const fb = new Face(cena, ac.b.no, ac.b.face);
  const oa = fa.origemMundo(), ob = fb.origemMundo();
  const na = fa.normalMundo(), nb = fb.normalMundo();

  const dif = subtrair(oa, ob);
  const erroPosicao =
    ac.tipo === "pivo"
      ? distancia(oa, ob) // centros coincidentes: distância completa
      : Math.abs(produtoEscalar(dif, na)); // contato: só a componente ao longo da normal (coplanaridade)

  const cosseno = Math.max(-1, Math.min(1, -produtoEscalar(na, nb)));
  const erroAngulo = Math.acos(cosseno); // 0 quando as normais são EXATAMENTE opostas

  return { erroPosicao, erroAngulo };
}

export interface ErroAcoplamento extends ErroDoAcoplamento {
  id: string;
  tipo: TipoAcoplamento;
  nome?: string;
  nos: [string, string];
  passou: boolean;
}

export interface RelatorioMontagem {
  passou: boolean;
  tolerancia: number;
  erros: ErroAcoplamento[];
  /** O acoplamento com o maior erro (posição ou ângulo, o que for pior
   * relativo à tolerância) — `null` se não houver acoplamento nenhum. */
  piorCaso: ErroAcoplamento | null;
}

/** Monta o relatório de `cena.conferirMontagem`. Função livre para poder ser
 * testada isoladamente; `Cena.conferirMontagem` só chama isto. */
export function conferirMontagem(
  cena: Cena, acoplamentos: readonly Acoplamento[], tolerancia: number,
): RelatorioMontagem {
  const erros: ErroAcoplamento[] = acoplamentos.map((ac) => {
    const { erroPosicao, erroAngulo } = erroDoAcoplamento(cena, ac);
    return {
      id: ac.id, tipo: ac.tipo, ...(ac.nome !== undefined ? { nome: ac.nome } : {}),
      nos: [ac.a.no, ac.b.no] as [string, string], erroPosicao, erroAngulo,
      passou: erroPosicao <= tolerancia && erroAngulo <= tolerancia,
    };
  });
  let piorCaso: ErroAcoplamento | null = null;
  for (const e of erros) {
    if (!piorCaso || Math.max(e.erroPosicao, e.erroAngulo) > Math.max(piorCaso.erroPosicao, piorCaso.erroAngulo)) piorCaso = e;
  }
  return { passou: erros.every((e) => e.passou), tolerancia, erros, piorCaso };
}
