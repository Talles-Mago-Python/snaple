import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena } from "@snaple/core";

const PI = Math.PI;

test("lateral().colocar num cilindro reto: encosta exatamente no raio, orientado radialmente", () => {
  const cena = new Cena();
  const cil = cena.criar("cylinder", { raioTopo: 0.5, raioBase: 0.5, altura: 1 });
  const caixa = cena.criar("box", { largura: 0.1, altura: 0.05, profundidade: 0.02 });
  cil.lateral().colocar(caixa, { angulo: 0, altura: 0 });
  // ângulo 0 → +z local (mesma convenção do backend); a caixa fica com a
  // face que era "altura" (0.05) encostando no raio 0.5
  assert.ok(Math.abs(caixa.transform.posicao[2] - (0.5 + 0.025)) < 1e-9);
  assert.ok(Math.abs(caixa.transform.posicao[0]) < 1e-9);

  // ângulo PI/2 → +x local
  const caixa2 = cena.criar("box", { largura: 0.1, altura: 0.05, profundidade: 0.02 });
  cil.lateral().colocar(caixa2, { angulo: PI / 2, altura: 0.2 });
  assert.ok(Math.abs(caixa2.transform.posicao[0] - (0.5 + 0.025)) < 1e-9);
  assert.ok(Math.abs(caixa2.transform.posicao[1] - 0.2) < 1e-9);
  assert.ok(Math.abs(caixa2.transform.posicao[2]) < 1e-9);
});

test("lateral().colocar respeita afastamento (gap)", () => {
  const cena = new Cena();
  const cil = cena.criar("cylinder", { raioTopo: 0.3, raioBase: 0.3, altura: 1 });
  const caixa = cena.criar("box", { largura: 0.02, altura: 0.02, profundidade: 0.02 });
  cil.lateral().colocar(caixa, { angulo: 0, altura: 0, afastamento: 0.05 });
  assert.ok(Math.abs(caixa.transform.posicao[2] - (0.3 + 0.05 + 0.01)) < 1e-9);
});

test("lateral() num tronco de cone: normal inclinada, não puramente radial", () => {
  const cena = new Cena();
  // tronco de cone: raio 0.2 na base, 0.5 no topo, altura 1
  const cone = cena.criar("cylinder", { raioBase: 0.2, raioTopo: 0.5, altura: 1 });
  const { posicao, normal } = cone.lateral().ponto(0, 0);
  assert.ok(Math.abs(posicao[2] - 0.35) < 1e-9, `raio no meio deveria ser 0.35, deu ${posicao[2]}`);
  // normal tem componente y não nula — não é puramente radial como no cilindro reto
  assert.ok(Math.abs(normal[1]) > 1e-6, `normal.y = ${normal[1]}, esperava componente vertical`);
  // e continua unitária
  assert.ok(Math.abs(Math.hypot(normal[0], normal[1], normal[2]) - 1) < 1e-9);
});

test("lateral(): a normal bate com a derivada numérica do perfil (lathe)", () => {
  const cena = new Cena();
  // perfil curvo (aproximado por segmentos), não trivial
  const perfil: [number, number][] = [[0.1, -0.3], [0.3, -0.1], [0.35, 0.1], [0.2, 0.3]];
  const vaso = cena.criar("lathe", { perfil, recentrar: false });
  const eps = 1e-6;
  for (const altura of [-0.2, 0, 0.2]) {
    const { normal } = vaso.lateral().ponto(0, altura);
    // derivada numérica do raio em função da altura, no MESMO perfil linear
    // por partes (não precisa reimplementar a interpolação: amostra dois
    // pontos próximos via ponto() de novo e compara com a tangente que a
    // normal deveria ser perpendicular a ela)
    const a = vaso.lateral().ponto(0, altura - eps).posicao;
    const b = vaso.lateral().ponto(0, altura + eps).posicao;
    const tangente = [(b[0] - a[0]) / (2 * eps), (b[1] - a[1]) / (2 * eps), (b[2] - a[2]) / (2 * eps)];
    const tComp = Math.hypot(tangente[0]!, tangente[1]!, tangente[2]!);
    const tUnit = tangente.map((v) => v / tComp);
    const dot = normal[0] * tUnit[0]! + normal[1] * tUnit[1]! + normal[2] * tUnit[2]!;
    assert.ok(Math.abs(dot) < 1e-4, `normal não é perpendicular à tangente numérica em altura=${altura}: dot=${dot}`);
  }
});

test("lateral() fora do perfil dá erro claro", () => {
  const cena = new Cena();
  const cil = cena.criar("cylinder", { raioTopo: 0.3, raioBase: 0.3, altura: 1 });
  assert.throws(() => cil.lateral().ponto(0, 10), /fora do perfil/);
});

test("lateral() só existe em cylinder/lathe", () => {
  const cena = new Cena();
  const esfera = cena.criar("sphere", { raio: 0.3 });
  const caixa = cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  assert.throws(() => esfera.lateral().colocar(caixa, { angulo: 0, altura: 0 }), /só existe em 'cylinder' e 'lathe'/);
});

test("lateral().colocar reparenta por padrão, como face().colocar", () => {
  const cena = new Cena();
  const cil = cena.criar("cylinder", { raioTopo: 0.3, raioBase: 0.3, altura: 1 });
  const caixa = cena.criar("box", { largura: 0.02, altura: 0.02, profundidade: 0.02 });
  cil.lateral().colocar(caixa, { angulo: 0, altura: 0 });
  assert.equal(caixa.pai()!.id, cil.id);
});
