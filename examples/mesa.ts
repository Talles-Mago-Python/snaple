/** Monta uma mesa e põe uma xícara em cima — sem calcular uma coordenada.
 *
 *   node examples/mesa.ts
 */
import { Cena, circular } from "@snaple/core";

const cena = new Cena();

// O tampo: a única coordenada absoluta da cena inteira é a altura dele.
const tampo = cena.criar(
  "box",
  { largura: 1.8, altura: 0.06, profundidade: 1.0 },
  { nome: "mesa", transform: { posicao: [0, 0.72, 0] }, material: { cor: "#9c6b45" } },
);

// Quatro pernas na face de baixo, numa grade 2×2 com 12 cm de recuo da borda.
// A base de cada perna encosta exatamente no tampo, e elas nascem apontando
// para fora da face — ou seja, para baixo. Nenhuma conta do lado de cá.
const pernas = [0, 1, 2, 3].map(() =>
  cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.04, altura: 0.69 }, { nome: "perna" }),
);
tampo.face("base").grade(pernas, 2, 2, { gapEntre: 0.12 });

// Quatro cadeiras em círculo em volta.
const cadeiras = [0, 1, 2, 3].map(() =>
  cena.criar(
    "box",
    { largura: 0.45, altura: 0.95, profundidade: 0.45 },
    { nome: "cadeira", transform: { posicao: [0, 0.475, 0] } },
  ),
);
circular(cadeiras, 1.2, { centro: [0, 0, 0] });

// Uma xícara no tampo, 45 cm à esquerda do centro.
const xicara = cena.criar(
  "cylinder", { raioTopo: 0.04, raioBase: 0.03, altura: 0.09 },
  { nome: "xícara", material: { cor: "#f2f2f2" } },
);
tampo.face("topo").colocar(xicara, { u: -0.45, v: 0.1 });

console.log(cena.descrever());
console.log();
console.log("pernas tocam o chão?");
for (const perna of pernas) {
  console.log(`  ${perna.id}: base em y = ${perna.bbox().min[1]}`);
}
console.log(`xícara: base em y = ${xicara.bbox().min[1]}, topo da mesa em y = ${tampo.bboxPropria().max[1]}`);
console.log();
console.log("avisos:", cena.avisosTexto() || "(nenhum)");
