import { Cena } from "@snaple/core";

export function montarCena(): Cena {
  const cena = new Cena();

  // Base de referência — apague ou substitua.
  const base = cena.criar(
    "box",
    { largura: 1, altura: 0.05, profundidade: 1 },
    { nome: "base", transform: { posicao: [0, 0.025, 0] }, material: { cor: "#6b6b6b" } },
  );

  const marcador = cena.criar(
    "sphere",
    { raio: 0.08 },
    { nome: "marcador", material: { cor: "#c85a3c" } },
  );
  base.face("topo").colocar(marcador, { u: 0, v: 0 });

  return cena;
}
