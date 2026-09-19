/** Layout flex em 3D: `row` com `justify: space-between` distribui pelas
 * BORDAS, então objetos de tamanhos diferentes ficam com vãos iguais.
 *
 *   node examples/prateleira.ts
 */
import { Cena } from "@snaple/core";

const cena = new Cena();

const tabua = cena.criar(
  "box", { largura: 1.2, altura: 0.03, profundidade: 0.25 },
  { nome: "prateleira", transform: { posicao: [0, 1.4, 0] } },
);

// uma `row` como filha da prateleira, ocupando a largura útil dela
const fila = cena.criar("row", { extensao: 1.1, justify: "space-between", align: "start" }, { pai: tabua.id });

const livros = [0.04, 0.09, 0.03, 0.06, 0.05].map((espessura, i) =>
  fila.criar(
    "box", { largura: espessura, altura: 0.22 + i * 0.01, profundidade: 0.16 },
    { nome: "livro" },
  ),
);

// a fila ainda está na origem do pai; apoia ela no topo da tábua
tabua.face("topo").colocar(fila, { reparentar: false });

const caixas = livros.map((l) => l.bbox());
console.log("vãos entre bordas:");
for (let i = 1; i < caixas.length; i++) {
  console.log(`  ${(caixas[i]!.min[0] - caixas[i - 1]!.max[0]).toFixed(6)} m`);
}
console.log("\nbases dos livros (align: start ⇒ todos na mesma altura):");
console.log(" ", caixas.map((c) => c.min[1].toFixed(4)).join("  "));
console.log("\ntopo da prateleira:", tabua.bboxPropria().max[1]);
console.log();
console.log(cena.descrever());
// O aviso de "flutua" está CORRETO: nesta cena não há parede nem suporte
// embaixo da prateleira. O linter olha apoio por baixo, então objeto fixado
// em parede sempre aparece como flutuando — é aviso, nunca bloqueio.
