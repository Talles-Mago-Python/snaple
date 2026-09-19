import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena, type AvisoInterpenetracao } from "@snaple/core";

/** Teste obrigatório 6 — dois nós interpenetrando: aviso com o valor certo. */
test("interpenetração: aviso com o valor da sobreposição", () => {
  const cena = new Cena();
  // duas caixas de 2×2×2 com centros a 0.5 de distância em x ⇒ sobrepõem 1.5
  cena.criar("box", { largura: 2, altura: 2, profundidade: 2 }, { id: "caixa_a", transform: { posicao: [0, 1, 0] } });
  cena.criar("box", { largura: 2, altura: 2, profundidade: 2 }, { id: "caixa_b", transform: { posicao: [0.5, 1, 0] } });

  const avisos = cena.avisos();
  const inter = avisos.filter((a): a is AvisoInterpenetracao => a.tipo === "interpenetracao");
  assert.equal(inter.length, 1, `avisos: ${JSON.stringify(avisos)}`);
  assert.deepEqual(inter[0]!.nos, ["caixa_a", "caixa_b"]);
  assert.equal(inter[0]!.eixo, "x");
  assert.ok(Math.abs(inter[0]!.valor - 1.5) < 1e-12, `valor = ${inter[0]!.valor}`);
  assert.equal(inter[0]!.texto, "caixa_a penetra caixa_b em 1.50 m no eixo x");
  assert.equal(cena.avisosTexto(), "AVISO: caixa_a penetra caixa_b em 1.50 m no eixo x");
});

test("pai/filho não contam como interpenetração", () => {
  const cena = new Cena();
  const tampo = cena.criar("box", { largura: 1, altura: 0.05, profundidade: 1 }, { transform: { posicao: [0, 0.7, 0] } });
  const perna = cena.criar("cylinder", { raioTopo: 0.03, raioBase: 0.03, altura: 0.7 });
  tampo.face("base").colocar(perna, { u: 0.4, v: 0.4 });
  // encaixe deliberado: a perna sobe 0.02 para dentro do tampo
  cena.deslocarMundo(perna.id, [0, 0.02, 0]);
  assert.equal(cena.avisos().filter((a) => a.tipo === "interpenetracao").length, 0);
});

test("nó flutuando é avisado com a altura", () => {
  const cena = new Cena();
  cena.criar("sphere", { raio: 0.5 }, { id: "bola", transform: { posicao: [0, 2.5, 0] } });
  const avisos = cena.avisos();
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0]!.tipo, "flutuando");
  assert.equal(avisos[0]!.texto, "bola flutua 2.00 m acima do chão, sem nada embaixo");
});

test("nó apoiado em outro não é avisado como flutuando", () => {
  const cena = new Cena();
  const mesa = cena.criar("box", { largura: 1, altura: 0.8, profundidade: 1 }, { transform: { posicao: [0, 0.4, 0] } });
  const copo = cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.04, altura: 0.1 });
  mesa.face("topo").colocar(copo);
  assert.deepEqual(cena.avisos(), []);
});

test("centros coincidentes são avisados", () => {
  const cena = new Cena();
  cena.criar("box", { largura: 0.3, altura: 0.3, profundidade: 0.3 }, { id: "um", transform: { posicao: [0, 0.15, 0] } });
  cena.criar("sphere", { raio: 0.1 }, { id: "dois", transform: { posicao: [0.005, 0.15, 0] } });
  const aviso = cena.avisos().find((a) => a.tipo === "centros-coincidentes");
  assert.ok(aviso, `avisos: ${cena.avisosTexto()}`);
  assert.match(aviso!.texto, /um e dois têm praticamente o mesmo centro/);
});

test("avisos são avisos, nunca bloqueios", () => {
  const cena = new Cena();
  cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { transform: { posicao: [0, 5, 0] } });
  // a cena continua utilizável e serializável mesmo com aviso ativo
  assert.equal(cena.avisos().length, 1);
  assert.equal(cena.toJSON().raiz.filhos.length, 1);
});
