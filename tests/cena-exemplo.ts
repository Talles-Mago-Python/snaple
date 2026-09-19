import { Cena, circular, type NoRef } from "@snaple/core";

/** Cena de referência usada pelo teste de `descrever()` e pelo exemplo do
 * README: mesa com 4 pernas, 4 cadeiras ao redor, uma xícara no tampo. */
export function salaDeJantar(): { cena: Cena; tampo: NoRef; xicara: NoRef; cadeiras: NoRef[] } {
  const cena = new Cena();

  const tampo = cena.criar(
    "box", { largura: 1.8, altura: 0.06, profundidade: 1.0 },
    { nome: "mesa", transform: { posicao: [0, 0.72, 0] } },
  );
  const pernas = [0, 1, 2, 3].map(() =>
    cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.04, altura: 0.69 }, { nome: "perna" }),
  );
  tampo.face("base").grade(pernas, 2, 2, { gapEntre: 0.12 });

  const cadeiras = [0, 1, 2, 3].map(() =>
    cena.criar("box", { largura: 0.45, altura: 0.95, profundidade: 0.45 },
      { nome: "cadeira", transform: { posicao: [0, 0.475, 0] } }),
  );
  circular(cadeiras, 1.2, { centro: [0, 0, 0] });

  const xicara = cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.03, altura: 0.09 }, { nome: "xícara" });
  tampo.face("topo").colocar(xicara, { u: -0.45, v: 0.1 });

  return { cena, tampo, xicara, cadeiras };
}
