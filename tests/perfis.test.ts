import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena, arco, estadio, gota, retanguloArredondado, poligonoRegular, elipse } from "@snaple/core";

const PI = Math.PI;

test("arco: n+1 pontos, extremos batem com a fórmula, recusa n<1", () => {
  const pts = arco(0, 2, 0, PI / 2, 4);
  assert.equal(pts.length, 5);
  assert.ok(Math.abs(pts[0]![0] - 2) < 1e-12 && Math.abs(pts[0]![1] - 0) < 1e-12);
  assert.ok(Math.abs(pts[4]![0] - 0) < 1e-9 && Math.abs(pts[4]![1] - 2) < 1e-9);
  assert.throws(() => arco(0, 1, 0, 1, 0));
});

test("estadio: extensão total é comp + 2×raio", () => {
  const pts = estadio(3, 0.5);
  const xs = pts.map((p) => p[0]);
  assert.ok(Math.abs(Math.max(...xs) - (3 + 0.5)) < 1e-9);
  assert.ok(Math.abs(Math.min(...xs) - -0.5) < 1e-9);
});

test("gota: extremos nos pontos da base reta", () => {
  const pts = gota(1, 0.4);
  assert.deepEqual(pts[0], [0, -0.2]);
  assert.deepEqual(pts[pts.length - 1], [0, 0.2]);
  const xs = pts.map((p) => p[0]);
  assert.ok(Math.abs(Math.max(...xs) - 1) < 1e-9, "topo deveria alcançar a altura total");
});

test("retanguloArredondado: raio maior que a metade do lado é limitado, e o contorno vira um extrude com a bbox certa", () => {
  const cena = new Cena();
  const perfil = retanguloArredondado(0.4, 0.2, 0.5); // raio pedido maior que profundidade/2
  const peca = cena.criar("extrude", { perfil, altura: 0.05 });
  const bb = peca.bboxPropria();
  assert.ok(Math.abs(bb.tamanho[0]! - 0.4) < 1e-9, `largura = ${bb.tamanho[0]}`);
  assert.ok(Math.abs(bb.tamanho[2]! - 0.2) < 1e-9, `profundidade = ${bb.tamanho[2]}`);
});

test("poligonoRegular: n vértices equidistantes do centro, ângulos igualmente espaçados", () => {
  const pts = poligonoRegular(6, 2);
  assert.equal(pts.length, 6);
  for (const [x, y] of pts) assert.ok(Math.abs(Math.hypot(x, y) - 2) < 1e-9);
  const angs = pts.map(([x, y]) => Math.atan2(y, x)).sort((a, b) => a - b);
  for (let i = 1; i < angs.length; i++) {
    assert.ok(Math.abs(angs[i]! - angs[i - 1]! - PI / 3) < 1e-9);
  }
  assert.throws(() => poligonoRegular(2, 1));
});

test("elipse: pontos satisfazem a equação (x/a)² + (y/b)² = 1", () => {
  const pts = elipse(3, 1.5, 32);
  assert.equal(pts.length, 32);
  for (const [x, y] of pts) {
    const v = (x / 3) ** 2 + (y / 1.5) ** 2;
    assert.ok(Math.abs(v - 1) < 1e-9, `valor = ${v}`);
  }
});
