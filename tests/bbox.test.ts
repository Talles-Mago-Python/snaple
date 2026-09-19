import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena } from "@snaple/core";

const PERTO = 1e-9;

test("bbox de primitiva na origem é simétrica", () => {
  const cena = new Cena();
  const b = cena.criar("box", { largura: 2, altura: 1, profundidade: 4 }).bbox();
  assert.deepEqual(b.min, [-1, -0.5, -2]);
  assert.deepEqual(b.max, [1, 0.5, 2]);
  assert.deepEqual(b.tamanho, [2, 1, 4]);
});

test("escala e translação entram na bbox", () => {
  const cena = new Cena();
  const b = cena
    .criar("sphere", { raio: 1 }, { transform: { posicao: [2, 3, -1], escala: [1, 2, 1] } })
    .bbox();
  assert.deepEqual(b.centro, [2, 3, -1]);
  assert.deepEqual(b.tamanho, [2, 4, 2]);
});

test("caixa girada 45° em y: diagonal vira 2√2 e o eixo do giro fica intacto", () => {
  const cena = new Cena();
  const b = cena
    .criar("box", { largura: 2, altura: 2, profundidade: 2 }, { transform: { rotacao: [0, Math.PI / 4, 0] } })
    .bbox();
  assert.ok(Math.abs(b.tamanho[0] - 2 * Math.SQRT2) < 1e-12, `x=${b.tamanho[0]}`);
  assert.ok(Math.abs(b.tamanho[2] - 2 * Math.SQRT2) < 1e-12, `z=${b.tamanho[2]}`);
  assert.ok(Math.abs(b.tamanho[1] - 2) < 1e-12, `y=${b.tamanho[1]}`);
});

test("hierarquia: a bbox do filho soma a transform do pai", () => {
  const cena = new Cena();
  const pai = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { transform: { posicao: [5, 0, 0] } });
  const filho = pai.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { transform: { posicao: [0, 2, 0] } });
  assert.deepEqual(filho.bbox().centro, [5, 2, 0]);
  // a bbox do PAI inclui a subárvore; a própria, não
  assert.deepEqual(pai.bbox().max, [5.5, 2.5, 0.5]);
  assert.deepEqual(pai.bboxPropria().max, [5.5, 0.5, 0.5]);
});

test("mover pelo mundo grava a posição LOCAL certa sob um pai deslocado", () => {
  const cena = new Cena();
  const pai = cena.criar("grupo", {}, { transform: { posicao: [10, 0, 0], rotacao: [0, Math.PI / 2, 0] } });
  const filho = pai.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  cena.definirCentroMundo(filho.id, [10, 3, 0]);
  const c = filho.bbox().centro;
  assert.ok(Math.hypot(c[0] - 10, c[1] - 3, c[2] - 0) < PERTO, `centro=${c}`);
});
