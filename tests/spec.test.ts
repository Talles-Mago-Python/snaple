import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { Cena } from "@snaple/core";
import { salaDeJantar } from "./cena-exemplo.ts";

const schema = JSON.parse(readFileSync(new URL("../spec/cena.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
const valida = ajv.compile(schema);

/** O schema em `spec/` é o contrato normativo: o que o core emite tem de
 * passar por ele, senão o contrato e a implementação divergiram. */
test("a cena de exemplo valida contra o JSON Schema do spec", () => {
  const { cena } = salaDeJantar();
  const json = cena.toJSON();
  assert.ok(valida(json), JSON.stringify(valida.errors, null, 2));
});

test("toda combinação de tipo de nó valida contra o schema", () => {
  const cena = new Cena();
  cena.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  cena.criar("sphere", { raio: 0.5, segmentos: 48 });
  cena.criar("cylinder", { raioTopo: 0.2, raioBase: 0.3, altura: 1 });
  cena.criar("cone", { raio: 0.3, altura: 0.8 });
  cena.criar("plane", { largura: 4, profundidade: 4 });
  cena.criar("torus", { raio: 0.5, raioTubo: 0.12 });
  cena.criar("extrude", { perfil: [[0, 0], [1, 0], [1, 1], [0, 1]], altura: 0.3 });
  cena.criar("lathe", { perfil: [[0, 0], [0.3, 0.1], [0.2, 0.5], [0, 0.6]] });
  cena.criar("model", { src: "a.glb", tamanho: [1, 1, 1] });
  const linha = cena.criar("row", { extensao: 5, gap: 0.1, justify: "space-between", align: "end" });
  linha.criar("column", { gap: 0.05 });
  cena.criar("stack", {});
  cena.criar("grupo", {});
  const placa = cena.criar("box", { largura: 0.5, altura: 0.02, profundidade: 0.5 });
  placa.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.03 }, u: 0.1, v: 0.1 });
  placa.furar({ face: "base", forma: { tipo: "retangulo", largura: 0.05, altura: 0.05 }, u: -0.1, v: 0, profundidade: 0.01 });
  placa.furar({ face: "topo", forma: { tipo: "poligono", pontos: [[0, 0.02], [0.02, -0.01], [-0.02, -0.01]] }, u: -0.2, v: -0.2 });

  const json = cena.toJSON();
  assert.ok(valida(json), JSON.stringify(valida.errors, null, 2));
});

test("o schema recusa documentos inválidos", () => {
  const { cena } = salaDeJantar();
  const mau = cena.toJSON() as unknown as { version: number };
  mau.version = 2;
  assert.equal(valida(mau), false);

  const semTransform = JSON.parse(JSON.stringify(cena.toJSON()));
  delete semTransform.raiz.filhos[0].transform;
  assert.equal(valida(semTransform), false);

  const modelFurado = JSON.parse(JSON.stringify(cena.toJSON()));
  modelFurado.raiz.filhos.push({
    id: "m1", tipo: "model", params: { src: "x.glb", tamanho: [1, 1, 1] },
    transform: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] },
    filhos: [], features: [{ tipo: "furo", face: "topo", forma: { tipo: "circulo", raio: 0.1 }, u: 0, v: 0 }],
  });
  assert.equal(valida(modelFurado), false, "o schema devia proibir furo em nó 'model'");
});
