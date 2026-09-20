import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena, padraoCircular } from "@snaple/core";

const PI = Math.PI;

test("padraoCircular: posições equidistantes num círculo, preservando a coordenada do eixo", () => {
  const cena = new Cena();
  const disco = cena.criar("cylinder", { raioTopo: 0.5, raioBase: 0.5, altura: 0.02 });
  const nos = padraoCircular(
    disco,
    (i) => disco.criar("box", { largura: 0.01, altura: 0.03, profundidade: 0.005 }, { transform: { posicao: [0, 0.02, 0] } }),
    12,
    { raio: 0.4 },
  );
  assert.equal(nos.length, 12);
  for (const no of nos) {
    const [x, y, z] = no.transform.posicao;
    assert.ok(Math.abs(Math.hypot(x, z) - 0.4) < 1e-9, `raio = ${Math.hypot(x, z)}`);
    assert.ok(Math.abs(y - 0.02) < 1e-12, "coordenada do eixo (y) não foi preservada");
  }
  const angulos = nos.map((no) => Math.atan2(no.transform.posicao[2], no.transform.posicao[0])).sort((a, b) => a - b);
  for (let i = 1; i < angulos.length; i++) {
    const delta = angulos[i]! - angulos[i - 1]!;
    assert.ok(Math.abs(delta - PI / 6) < 1e-9, `passo angular = ${delta}`);
  }
});

test("padraoCircular: orienta cada nó ao longo do eixo por padrão", () => {
  const cena = new Cena();
  const raiz = cena.criar("grupo", {});
  const nos = padraoCircular(raiz, (i) => raiz.criar("box", { largura: 0.01, altura: 0.01, profundidade: 0.01 }), 4, { raio: 0.2 });
  const esperados = [0, PI / 2, PI, (3 * PI) / 2];
  nos.forEach((no, i) => assert.ok(Math.abs(no.transform.rotacao[1] - esperados[i]!) < 1e-9));
});

test("padraoCircular: orientar:false mantém a rotação que fabrica() deu", () => {
  const cena = new Cena();
  const raiz = cena.criar("grupo", {});
  const nos = padraoCircular(
    raiz,
    () => raiz.criar("box", { largura: 0.01, altura: 0.01, profundidade: 0.01 }, { transform: { rotacao: [0, 1.23, 0] } }),
    3,
    { raio: 0.1, orientar: false },
  );
  for (const no of nos) assert.equal(no.transform.rotacao[1], 1.23);
});

test("padraoCircular: eixo diferente de y", () => {
  const cena = new Cena();
  const raiz = cena.criar("grupo", {});
  const nos = padraoCircular(raiz, () => raiz.criar("box", { largura: 0.01, altura: 0.01, profundidade: 0.01 }), 6, { raio: 0.3, eixo: "x" });
  for (const no of nos) {
    const [, y, z] = no.transform.posicao;
    assert.ok(Math.abs(Math.hypot(y, z) - 0.3) < 1e-9);
  }
});

test("padraoCircular: fase desloca o ângulo inicial", () => {
  const cena = new Cena();
  const raiz = cena.criar("grupo", {});
  const nos = padraoCircular(raiz, () => raiz.criar("box", { largura: 0.01, altura: 0.01, profundidade: 0.01 }), 4, { raio: 0.2, fase: PI / 4 });
  assert.ok(Math.abs(nos[0]!.transform.rotacao[1] - PI / 4) < 1e-9);
});

test("padraoCircular: fabrica() devolvendo nó que não é filho do dono dá erro claro", () => {
  const cena = new Cena();
  const raiz = cena.criar("grupo", {});
  const outro = cena.criar("grupo", {});
  assert.throws(
    () => padraoCircular(raiz, () => outro.criar("box", { largura: 0.01, altura: 0.01, profundidade: 0.01 }), 3, { raio: 0.1 }),
    /não é filho de/,
  );
});
