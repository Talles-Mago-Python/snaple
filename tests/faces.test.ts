import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena } from "@snaple/core";

/** Teste obrigatório 1 — mesa (box) + 4 pernas via `face.base.grade(...)`.
 * É o bug do protótipo Python: perna flutuando ou afundada. Aqui a posição é
 * derivada da bbox, então não existe caminho de código que produza gap. */
test("mesa + 4 pernas por face.base.grade: pernas tocam y=0 e o tampo fica na altura certa", () => {
  const cena = new Cena();
  const ALTURA_PERNA = 0.7;
  const ESPESSURA = 0.05;

  const tampo = cena.criar(
    "box",
    { largura: 1.2, altura: ESPESSURA, profundidade: 0.8 },
    { nome: "mesa", transform: { posicao: [0, ALTURA_PERNA + ESPESSURA / 2, 0] } },
  );

  const pernas = [0, 1, 2, 3].map(() =>
    cena.criar("cylinder", { raioTopo: 0.03, raioBase: 0.03, altura: ALTURA_PERNA }, { nome: "perna" }),
  );

  tampo.face("base").grade(pernas, 2, 2, { gapEntre: 0.08 });

  for (const perna of pernas) {
    const b = perna.bbox();
    assert.ok(Math.abs(b.min[1] - 0) < 1e-9, `perna ${perna.id}: base em y=${b.min[1]}, esperado 0`);
    assert.ok(Math.abs(b.max[1] - ALTURA_PERNA) < 1e-9, `perna ${perna.id}: topo em y=${b.max[1]}`);
  }

  const bt = tampo.bboxPropria();
  assert.ok(Math.abs(bt.min[1] - ALTURA_PERNA) < 1e-12, `base do tampo em ${bt.min[1]}`);
  assert.ok(Math.abs(bt.max[1] - (ALTURA_PERNA + ESPESSURA)) < 1e-12, `topo do tampo em ${bt.max[1]}`);

  // a bbox do conjunto vai do chão ao topo do tampo
  const conjunto = tampo.bbox();
  assert.ok(Math.abs(conjunto.min[1]) < 1e-9);
  assert.ok(Math.abs(conjunto.max[1] - 0.75) < 1e-12);

  // e nenhuma perna flutua nem penetra nada
  assert.deepEqual(cena.avisos(), []);
});

/** Teste obrigatório 2 — `face.topo.colocar(xicara)`. */
test("face.topo.colocar: a base da xícara toca o tampo com diferença < 1e-6", () => {
  const cena = new Cena();
  const tampo = cena.criar(
    "box",
    { largura: 1.2, altura: 0.05, profundidade: 0.8 },
    { nome: "mesa", transform: { posicao: [0, 0.725, 0] } },
  );
  const xicara = cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.03, altura: 0.09 }, { nome: "xícara" });

  tampo.face("topo").colocar(xicara, { u: -0.3, v: 0.1 });

  const topoMesa = tampo.bboxPropria().max[1];
  const baseXicara = xicara.bbox().min[1];
  const diff = Math.abs(baseXicara - topoMesa);
  assert.ok(diff < 1e-6, `diferença ${diff} (topo da mesa ${topoMesa}, base da xícara ${baseXicara})`);
  assert.equal(diff, 0, `esperado contato exato, não só dentro da tolerância`);

  // e caiu no (u,v) pedido: u→x, v→z na face topo
  const c = xicara.bbox().centro;
  assert.ok(Math.abs(c[0] - -0.3) < 1e-12, `x=${c[0]}`);
  assert.ok(Math.abs(c[2] - 0.1) < 1e-12, `z=${c[2]}`);
});

test("colocar numa face lateral orienta o nó para fora dela", () => {
  const cena = new Cena();
  const parede = cena.criar("box", { largura: 3, altura: 2.4, profundidade: 0.1 }, { nome: "parede" });
  // o nó é autorado deitado: o +y LOCAL dele é o que vai apontar para fora da
  // face, então `altura` é a espessura do quadro
  const quadro = cena.criar("box", { largura: 0.4, altura: 0.03, profundidade: 0.3 }, { nome: "quadro" });
  parede.face("sul").colocar(quadro, { u: 0.5, v: 0.6 });

  const b = quadro.bbox();
  // encosta exatamente na face sul (+z) da parede
  assert.ok(Math.abs(b.min[2] - 0.05) < 1e-12, `z min = ${b.min[2]}`);
  // o +y local virou +z: a espessura (0.03) fica em z, e o `profundidade`
  // local (0.3), que seguiu V=+y, vira a altura na parede
  assert.ok(Math.abs(b.tamanho[2] - 0.03) < 1e-12, `espessura em z = ${b.tamanho[2]}`);
  assert.ok(Math.abs(b.tamanho[1] - 0.3) < 1e-12, `altura em y = ${b.tamanho[1]}`);
  assert.ok(Math.abs(b.tamanho[0] - 0.4) < 1e-12, `largura em x = ${b.tamanho[0]}`);
  // u=-x e v=+y na face sul
  assert.ok(Math.abs(b.centro[0] - -0.5) < 1e-12, `x = ${b.centro[0]}`);
  assert.ok(Math.abs(b.centro[1] - 0.6) < 1e-12, `y = ${b.centro[1]}`);
  // e o quadro virou filho da parede: mover a parede leva o quadro junto
  assert.equal(quadro.pai()?.id, parede.id);
});

test("face de um nó girado: as contas saem no referencial do dono", () => {
  const cena = new Cena();
  const base = cena.criar(
    "box", { largura: 1, altura: 0.2, profundidade: 1 },
    { transform: { rotacao: [0, 0, Math.PI / 2] } },
  );
  const cubo = cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  base.face("topo").colocar(cubo);
  // com a base girada 90° em z, o "topo" dela aponta para -x
  const b = cubo.bbox();
  assert.ok(Math.abs(b.max[0] - -0.1) < 1e-12, `x max = ${b.max[0]}`);
  assert.ok(Math.abs(b.tamanho[0] - 0.1) < 1e-12);
});
