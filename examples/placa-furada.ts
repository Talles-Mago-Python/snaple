/** Furo paramétrico: o furo é estado, não um corte. Muda-se o raio e
 * regera-se — sem CSG, sem malha guardada em lugar nenhum.
 *
 *   node examples/placa-furada.ts
 */
import { Cena, ErroFeature, type GeometriaExtrusao } from "@snaple/core";

const cena = new Cena();
const placa = cena.criar(
  "box", { largura: 0.30, altura: 0.012, profundidade: 0.20 },
  { nome: "placa", material: { cor: "#3f6f4f" } },
);

// quatro furos de montagem, passantes
for (const [u, v] of [[-0.12, -0.07], [0.12, -0.07], [-0.12, 0.07], [0.12, 0.07]] as const) {
  placa.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.004, segmentos: 24 }, u, v });
}
// e um rasgo retangular no meio, só até a metade da espessura
placa.furar({
  face: "topo",
  forma: { tipo: "retangulo", largura: 0.08, altura: 0.03 },
  u: 0, v: 0, profundidade: 0.006,
});

const g = placa.geometria() as GeometriaExtrusao;
console.log(`geometria derivada: ${g.tipo} no eixo ${g.eixo}, ${g.partes.length} fatia(s)`);
for (const parte of g.partes) {
  console.log(`  fatia altura=${parte.altura.toFixed(4)} m, ${parte.furos.length} furo(s)`);
}
console.log("bbox da placa:", placa.bbox().tamanho);

// o estado continua sendo só parâmetro
console.log("\nfeatures no estado:");
console.log(JSON.stringify(placa.no.features, null, 2));

// mudar um furo é uma edição, não um novo corte
placa.atualizarFuro(0, { forma: { tipo: "circulo", raio: 0.006, segmentos: 24 } });
console.log("\nraio do primeiro furo depois da edição:",
  (placa.no.features[0] as { forma: { raio: number } }).forma.raio);

// e o que não dá para fazer sem CSG falha alto
try {
  placa.furar({ face: "leste", forma: { tipo: "circulo", raio: 0.002 }, u: 0, v: 0 });
} catch (e) {
  if (!(e instanceof ErroFeature)) throw e;
  console.log(`\nErroFeature (${e.motivo}):\n  ${e.message}`);
}
