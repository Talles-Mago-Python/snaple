import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena } from "@snaple/core";
import { salaDeJantar } from "./cena-exemplo.ts";

/** Teste obrigatório 7 — `descrever()` numa cena montada. O texto literal
 * gerado está fixado aqui: se a prosa mudar, o teste quebra e a mudança é
 * deliberada, não silenciosa. */
test("descrever() numa sala de jantar montada", () => {
  const { cena } = salaDeJantar();
  const texto = cena.descrever();
  console.log(`\n  descrever() →\n  ${texto}\n`);
  assert.equal(
    texto,
    "Uma mesa (1.8 × 0.75 × 1 m) no centro, com 4 pernas. " +
    "Quatro cadeiras ao redor da mesa, distribuídas em círculo de raio 1.20 m. " +
    "Uma xícara apoiada sobre a mesa, levemente à esquerda.",
  );
});

test("descrever() inclui os avisos ativos", () => {
  const { cena, cadeiras } = salaDeJantar();
  // empurra uma cadeira para dentro da mesa
  cena.deslocarMundo(cadeiras[0]!.id, [-0.5, 0, 0]);
  const texto = cena.descrever();
  console.log(`\n  descrever() com aviso →\n  ${texto}\n`);
  assert.match(texto, /Aviso: /);
  assert.match(texto, /penetra/);
  // a mesa NÃO se moveu, então continua "no centro": o centroide é estável
  assert.match(texto, /Uma mesa \(1\.8 × 0\.75 × 1 m\) no centro/);
  // e o círculo quebrou, então as cadeiras passam a ser descritas uma a uma
  assert.doesNotMatch(texto, /ao redor da mesa/);
});

test("cena vazia", () => {
  assert.equal(new Cena().descrever(), "Cena vazia.");
});

test("sem nome semântico, cai no substantivo do tipo", () => {
  const cena = new Cena();
  cena.criar("sphere", { raio: 0.5 }, { transform: { posicao: [0, 0.5, 0] } });
  assert.match(cena.descrever(), /^Uma esfera \(1 × 1 × 1 m\) no centro\.$/);
});
