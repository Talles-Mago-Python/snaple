/** Containers de layout com vocabulário de flexbox — `row` (eixo X),
 * `column` (eixo Y), `stack` (eixo Z).
 *
 * O vocabulário é deliberadamente o do CSS (`gap`, `justify`, `align`,
 * `space-between`...): quem usa a lib já sabe o que cada um faz, e a
 * intuição vem de graça. A diferença que importa: aqui tudo opera sobre as
 * BORDAS da bounding box de cada filho, não sobre os centros — é o que faz
 * `space-between` dar espaçamento igual mesmo com filhos de tamanhos
 * diferentes.
 *
 * Como em flexbox, o container MANDA: a posição do filho no eixo principal e
 * nos dois eixos cruzados é sobrescrita na resolução. Quem precisa de
 * posição livre usa `grupo`, que não posiciona nada. */
import { aabbRelativa } from "./mundo.ts";
import { ehFlex } from "./no.ts";
import type { Align, Justify, No, ParamsFlex, TipoNo } from "./tipos.ts";
import { type IndiceEixo, num } from "./vetor.ts";

const EIXO_PRINCIPAL: Partial<Record<TipoNo, IndiceEixo>> = { row: 0, column: 1, stack: 2 };

const JUSTIFY_VALIDOS: readonly Justify[] = [
  "start", "center", "end", "space-between", "space-around", "space-evenly",
];
const ALIGN_VALIDOS: readonly Align[] = ["start", "center", "end"];

/** Resolve os containers flex da árvore, de baixo para cima: a extensão de um
 * filho que é ele próprio um `row` só é conhecida depois que os netos dele
 * foram posicionados. */
export function resolverFlex(raiz: No): void {
  for (const filho of raiz.filhos) resolverFlex(filho);
  if (ehFlex(raiz)) posicionarFilhos(raiz);
}

function posicionarFilhos(container: No): void {
  const eixo = EIXO_PRINCIPAL[container.tipo]!;
  const p = container.params as ParamsFlex;
  const gap = num(p.gap, 0);
  const justify = validar("justify", p.justify ?? "center", JUSTIFY_VALIDOS);
  const align = validar("align", p.align ?? "center", ALIGN_VALIDOS);
  const filhos = container.filhos;
  const n = filhos.length;
  if (n === 0) return;

  const caixas = filhos.map(aabbRelativa);
  const tamanhos = caixas.map((c) => c.tamanho[eixo]!);
  const conteudo = tamanhos.reduce((a, b) => a + b, 0) + gap * (n - 1);

  const temExtensao = p.extensao !== undefined;
  const extensao = temExtensao ? num(p.extensao, conteudo) : conteudo;
  const livre = Math.max(0, extensao - conteudo);
  const inicio = -extensao / 2;

  let cursor = inicio;
  let entre = gap;
  switch (justify) {
    case "start": break;
    case "end": cursor += livre; break;
    case "center": cursor += livre / 2; break;
    case "space-between":
      if (n > 1) entre = gap + livre / (n - 1);
      else cursor += livre / 2;
      break;
    case "space-around": {
      const faixa = livre / n;
      entre = gap + faixa;
      cursor += faixa / 2;
      break;
    }
    case "space-evenly": {
      const faixa = livre / (n + 1);
      entre = gap + faixa;
      cursor += faixa;
      break;
    }
  }

  // Eixos cruzados: a "linha" tem o tamanho do maior filho (mesma regra do
  // cross size de flexbox), e `align` posiciona dentro dela.
  const cruzados = ([0, 1, 2] as IndiceEixo[]).filter((i) => i !== eixo);
  const linha = new Map<IndiceEixo, number>();
  for (const i of cruzados) linha.set(i, Math.max(...caixas.map((c) => c.tamanho[i]!)));

  filhos.forEach((filho, k) => {
    const caixa = caixas[k]!;
    const pos = filho.transform.posicao;
    pos[eixo] = cursor - caixa.min[eixo]!;
    cursor += tamanhos[k]! + entre;
    for (const i of cruzados) {
      const meiaLinha = linha.get(i)! / 2;
      const alvo =
        align === "start" ? -meiaLinha - caixa.min[i]!
        : align === "end" ? meiaLinha - caixa.max[i]!
        : -caixa.centro[i]!;
      pos[i] = alvo;
    }
  });
}

function validar<T extends string>(campo: string, valor: T, validos: readonly T[]): T {
  if (!validos.includes(valor)) {
    throw new Error(`${campo} inválido: '${valor}' (use um de ${validos.join(" | ")})`);
  }
  return valor;
}
