import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena, VERSAO_CENA } from "@snaple/core";
import { salaDeJantar } from "./cena-exemplo.ts";

/** Teste obrigatório 8 — roundtrip: serializar → desserializar → estado
 * idêntico. */
test("roundtrip preserva o estado byte a byte", () => {
  const { cena } = salaDeJantar();
  cena.ref(cena.raiz.filhos[0]!.id).furar({
    face: "topo", forma: { tipo: "retangulo", largura: 0.1, altura: 0.08 }, u: 0.5, v: 0,
  });

  const antes = cena.toJSON();
  const texto = JSON.stringify(antes);
  const volta = Cena.deJSON(JSON.parse(texto) as typeof antes);
  const depois = volta.toJSON();

  assert.equal(JSON.stringify(depois), texto);
  assert.deepEqual(depois, antes);
  assert.equal(antes.version, VERSAO_CENA);
  assert.equal(antes.unidade, "m");
  assert.equal(antes.eixoCima, "y");

  // e a cena desserializada calcula a mesma geometria e a mesma prosa
  assert.equal(volta.descrever(), cena.descrever());
  assert.deepEqual(volta.avisos(), cena.avisos());
  const id = cena.raiz.filhos[0]!.id;
  assert.deepEqual(volta.geometria(id), cena.geometria(id));
  assert.deepEqual(volta.bbox(id), cena.bbox(id));
});

test("criar nós depois de desserializar não colide com os ids existentes", () => {
  const { cena } = salaDeJantar();
  const volta = Cena.deJSON(cena.toJSON());
  const ids = new Set<string>();
  for (const f of volta.raiz.filhos) ids.add(f.id);
  const novo = volta.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  assert.ok(!ids.has(novo.id), `id reutilizado: ${novo.id}`);
  assert.equal(volta.raiz.filhos.filter((f) => f.id === novo.id).length, 1);
});

test("versão incompatível é recusada com erro claro", () => {
  assert.throws(
    () => Cena.deJSON({ version: 2, unidade: "m", eixoCima: "y", raiz: new Cena().raiz } as never),
    /versão de cena não suportada: 2/,
  );
});

test("o estado serializado nunca contém malha", () => {
  const { cena } = salaDeJantar();
  const texto = JSON.stringify(cena.toJSON());
  for (const proibido of ["position", "vertices", "indices", "attributes", "itemSize", "Float32"]) {
    assert.ok(!texto.includes(proibido), `estado contém '${proibido}'`);
  }
  assert.ok(texto.includes('"params"'));
  assert.ok(texto.includes('"transform"'));
});
