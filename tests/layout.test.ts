import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena, colocarSobre, encostar, alinhar, empilhar, centralizarEm, circular, distribuir } from "@snaple/core";

/** Teste obrigatório 3 — `row` com 4 nós de tamanhos diferentes e
 * `justify: space-between`: o espaçamento tem de ser igual entre BORDAS. */
test("row + space-between: espaçamento igual entre BORDAS, com tamanhos diferentes", () => {
  const cena = new Cena();
  const fila = cena.criar("row", { extensao: 10, justify: "space-between", align: "center" });
  const larguras = [0.5, 2, 1.25, 3];
  const nos = larguras.map((l) =>
    fila.criar("box", { largura: l, altura: 1, profundidade: 1 }),
  );

  const caixas = nos.map((n) => n.bbox());
  const vaos = caixas.slice(1).map((c, i) => c.min[0] - caixas[i]!.max[0]);
  for (const v of vaos) {
    assert.ok(Math.abs(v - vaos[0]!) < 1e-12, `vãos desiguais: ${vaos.join(", ")}`);
  }
  // livre = 10 - 6.75 = 3.25, dividido por 3 vãos
  assert.ok(Math.abs(vaos[0]! - 3.25 / 3) < 1e-12, `vão = ${vaos[0]}`);
  // e as bordas externas encostam nas pontas da extensão declarada
  assert.ok(Math.abs(caixas[0]!.min[0] - -5) < 1e-12);
  assert.ok(Math.abs(caixas[3]!.max[0] - 5) < 1e-12);
  // largura total conferida pelas bordas, não pelos centros
  const total = caixas[3]!.max[0] - caixas[0]!.min[0];
  assert.ok(Math.abs(total - 10) < 1e-12, `total = ${total}`);
});

test("row sem extensão empacota com gap e centra na origem", () => {
  const cena = new Cena();
  const fila = cena.criar("row", { gap: 0.5 });
  const nos = [1, 2, 1].map((l) => fila.criar("box", { largura: l, altura: 1, profundidade: 1 }));
  const caixas = nos.map((n) => n.bbox());
  assert.ok(Math.abs(caixas[1]!.min[0] - caixas[0]!.max[0] - 0.5) < 1e-12);
  assert.ok(Math.abs(caixas[2]!.min[0] - caixas[1]!.max[0] - 0.5) < 1e-12);
  const total = caixas[2]!.max[0] - caixas[0]!.min[0];
  assert.ok(Math.abs(total - 5) < 1e-12, `total = ${total}`);
  assert.ok(Math.abs((caixas[2]!.max[0] + caixas[0]!.min[0]) / 2) < 1e-12, "não centrou na origem");
});

test("column/stack usam os eixos y e z", () => {
  const cena = new Cena();
  const col = cena.criar("column", { gap: 0.1 });
  const a = col.criar("box", { largura: 1, altura: 0.4, profundidade: 1 });
  const b = col.criar("box", { largura: 1, altura: 0.6, profundidade: 1 });
  assert.ok(Math.abs(b.bbox().min[1] - a.bbox().max[1] - 0.1) < 1e-12);

  const pilha = cena.criar("stack", { gap: 0.2 });
  const c = pilha.criar("box", { largura: 1, altura: 1, profundidade: 0.3 });
  const d = pilha.criar("box", { largura: 1, altura: 1, profundidade: 0.7 });
  assert.ok(Math.abs(d.bbox().min[2] - c.bbox().max[2] - 0.2) < 1e-12);
});

test("align aplica-se aos dois eixos cruzados", () => {
  const cena = new Cena();
  const fila = cena.criar("row", { gap: 0, align: "start" });
  const alto = fila.criar("box", { largura: 1, altura: 2, profundidade: 1 });
  const baixo = fila.criar("box", { largura: 1, altura: 0.5, profundidade: 1 });
  assert.ok(Math.abs(alto.bbox().min[1] - baixo.bbox().min[1]) < 1e-12, "não alinhou a base");
});

test("containers aninhados resolvem de baixo para cima", () => {
  const cena = new Cena();
  const fora = cena.criar("row", { gap: 1 });
  const dentro = fora.criar("column", { gap: 0 });
  dentro.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  dentro.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  const vizinho = fora.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  assert.ok(Math.abs(dentro.bbox().tamanho[1] - 2) < 1e-12, "coluna não somou os filhos");
  assert.ok(Math.abs(vizinho.bbox().min[0] - dentro.bbox().max[0] - 1) < 1e-12);
});

test("colocarSobre não deixa gap nem penetração", () => {
  const cena = new Cena();
  const mesa = cena.criar("box", { largura: 2, altura: 0.8, profundidade: 1 }, { transform: { posicao: [1, 0.4, 2] } });
  const copo = cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.04, altura: 0.12 });
  colocarSobre(copo, mesa);
  assert.equal(copo.bbox().min[1] - mesa.bbox().max[1], 0);
  assert.deepEqual(copo.bbox().centro.slice(0, 1), [1]);
});

test("encostar usa bordas e aceita gap", () => {
  const cena = new Cena();
  const a = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  const b = cena.criar("box", { largura: 3, altura: 1, profundidade: 1 });
  encostar(b, a, "leste", 0.25);
  assert.ok(Math.abs(b.bbox().min[0] - a.bbox().max[0] - 0.25) < 1e-12);
  encostar(b, a, "norte", 0);
  assert.ok(Math.abs(b.bbox().max[2] - a.bbox().min[2]) < 1e-12);
});

test("alinhar, empilhar, centralizarEm e circular", () => {
  const cena = new Cena();
  const nos = [1, 2, 3].map((k) =>
    cena.criar("box", { largura: 1, altura: k, profundidade: 1 }, { transform: { posicao: [k * 3, k, 0] } }),
  );
  alinhar(nos, "y", "start");
  const base = nos.map((n) => n.bbox().min[1]);
  assert.ok(Math.max(...base) - Math.min(...base) < 1e-12, `bases: ${base}`);

  empilhar(nos, "topo", 0.1);
  assert.ok(Math.abs(nos[1]!.bbox().min[1] - nos[0]!.bbox().max[1] - 0.1) < 1e-12);

  const sala = cena.criar("box", { largura: 6, altura: 3, profundidade: 6 }, { transform: { posicao: [0, 1.5, 0] } });
  const tapete = cena.criar("plane", { largura: 2, profundidade: 2 });
  centralizarEm(tapete, sala, "xz");
  assert.deepEqual(tapete.bbox().centro, [0, 0, 0]);

  const cadeiras = [0, 1, 2, 3].map(() => cena.criar("box", { largura: 0.4, altura: 0.9, profundidade: 0.4 }));
  circular(cadeiras, 1.2, { centro: [0, 0, 0] });
  const dists = cadeiras.map((c) => Math.hypot(c.bbox().centro[0], c.bbox().centro[2]));
  for (const d of dists) assert.ok(Math.abs(d - 1.2) < 1e-12, `raio ${d}`);
  const angs = cadeiras.map((c) => Math.atan2(c.bbox().centro[2], c.bbox().centro[0]));
  for (let i = 1; i < angs.length; i++) {
    const bruto = ((angs[i]! - angs[i - 1]!) * 180) / Math.PI;
    const delta = ((bruto % 360) + 360) % 360; // atan2 dá a volta em ±180
    assert.ok(Math.abs(delta - 90) < 1e-9, `ângulo ${delta}`);
  }
});

test("distribuir opera sobre bordas mesmo com tamanhos diferentes", () => {
  const cena = new Cena();
  const nos = [0.5, 2, 1, 1.5].map((l, i) =>
    cena.criar("box", { largura: l, altura: 1, profundidade: 1 }, { transform: { posicao: [i * 0.3 - 5, 0, 0] } }),
  );
  const sala = cena.criar("box", { largura: 12, altura: 3, profundidade: 6 });
  distribuir(nos, { eixo: "x", justify: "space-between", dentro: sala });
  const ordenados = [...nos].sort((a, b) => a.bbox().centro[0] - b.bbox().centro[0]).map((n) => n.bbox());
  const vaos = ordenados.slice(1).map((c, i) => c.min[0] - ordenados[i]!.max[0]);
  for (const v of vaos) assert.ok(Math.abs(v - vaos[0]!) < 1e-12, `vãos: ${vaos.join(", ")}`);
});
