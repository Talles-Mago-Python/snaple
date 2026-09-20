import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena, compor, aplicarPonto, multiplicar } from "@snaple/core";

const PI = Math.PI;

test("junta: a rotação do subtree vem de params.angulo, não de transform.rotacao", () => {
  const cena = new Cena();
  const junta = cena.criar("junta", { eixo: "x", angulo: PI / 6 }, { transform: { posicao: [0, 1, 0] } });
  const filho = junta.criar("box", { largura: 0.1, altura: 1, profundidade: 0.1 }, { transform: { posicao: [0, 0.5, 0] } });

  // ponto esperado calculado à mão via compor(), com a rotação vindo de fora
  const mJunta = compor([0, 1, 0], [PI / 6, 0, 0], [1, 1, 1]);
  const mFilho = compor([0, 0.5, 0], [0, 0, 0], [1, 1, 1]);
  const esperado = aplicarPonto(mJunta, aplicarPonto(mFilho, [0, 0, 0]));
  const real = filho.paraMundo([0, 0, 0]);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(real[i]! - esperado[i]!) < 1e-9);
});

test("junta: transform.rotacao setado diretamente é ignorado", () => {
  const cena = new Cena();
  const junta = cena.criar("junta", { eixo: "y", angulo: 0 }, { transform: { rotacao: [0, 1.5, 0] } });
  const filho = junta.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 }, { transform: { posicao: [1, 0, 0] } });
  assert.deepEqual(filho.bbox().centro, [1, 0, 0]);
});

test("junta: definirParams muda a pose (a subárvore acompanha)", () => {
  const cena = new Cena();
  const junta = cena.criar("junta", { eixo: "z", angulo: 0 });
  const filho = junta.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 }, { transform: { posicao: [1, 0, 0] } });
  assert.ok(Math.abs(filho.bbox().centro[0]! - 1) < 1e-9);
  junta.definirParams({ angulo: PI / 2 });
  assert.ok(Math.abs(filho.bbox().centro[0]!) < 1e-9);
  assert.ok(Math.abs(filho.bbox().centro[1]! - 1) < 1e-9);
});

test("junta: cadeia de juntas (ombro → cotovelo), cada uma no referencial da anterior", () => {
  const cena = new Cena();
  const ombro = cena.criar("junta", { eixo: "x", angulo: PI / 2 });
  const cotovelo = ombro.criar("junta", { eixo: "x", angulo: -PI / 2 }, { transform: { posicao: [0, 1, 0] } });
  const mao = cotovelo.criar("box", { largura: 0.05, altura: 0.05, profundidade: 0.05 }, { transform: { posicao: [0, 1, 0] } });

  const mOmbro = compor([0, 0, 0], [PI / 2, 0, 0], [1, 1, 1]);
  const mCotovelo = multiplicar(mOmbro, compor([0, 1, 0], [-PI / 2, 0, 0], [1, 1, 1]));
  const esperado = aplicarPonto(mCotovelo, [0, 1, 0]);
  const real = mao.paraMundo([0, 0, 0]);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(real[i]! - esperado[i]!) < 1e-9, `eixo ${i}: ${real[i]} != ${esperado[i]}`);
});

test("junta: ângulo dentro dos limites não avisa; fora avisa em graus", () => {
  const cena = new Cena();
  const ok = cena.criar("junta", { eixo: "y", angulo: 0.5, limites: [-1, 1] }, { id: "ok" });
  ok.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  assert.equal(cena.avisos().filter((a) => a.tipo === "junta-fora-do-limite").length, 0);

  const cena2 = new Cena();
  const fora = cena2.criar("junta", { eixo: "y", angulo: 2, limites: [-1, 1] }, { id: "fora" });
  fora.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  const avisos = cena2.avisos().filter((a) => a.tipo === "junta-fora-do-limite");
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0]!.no, "fora");
  assert.match(avisos[0]!.texto, /114\.6°/);
  assert.match(cena2.avisosTexto(), /AVISO: fora: ângulo/);
});

test("junta: sem limites declarados, nunca avisa", () => {
  const cena = new Cena();
  const j = cena.criar("junta", { eixo: "x", angulo: 100 });
  j.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  assert.equal(cena.avisos().filter((a) => a.tipo === "junta-fora-do-limite").length, 0);
});

test("descrever() fala da junta em graus, com concordância de gênero", () => {
  const cena = new Cena();
  const cotovelo = cena.criar("junta", { eixo: "x", angulo: PI / 6 }, { nome: "cotovelo" });
  cotovelo.criar("box", { largura: 0.1, altura: 1, profundidade: 0.1 }, { transform: { posicao: [0, 0.5, 0] } });
  const semNome = cena.criar("junta", { eixo: "y", angulo: 0 });
  semNome.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });

  const texto = cena.descrever();
  assert.match(texto, /Cotovelo dobrado a 30°\./);
  assert.match(texto, /Junta dobrada a 0°\./); // sem nome, rótulo padrão "junta" (feminino)
});
