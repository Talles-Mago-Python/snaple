import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena, type AvisoInterpenetracao } from "@snaple/core";

const PI = Math.PI;

/** Teste obrigatório da Fase 2 — duas barras giradas (60° e 30°) cujas AABBs
 * se cruzam bastante (0.22 m em x, 0.72 m em z) mas cujas caixas de verdade,
 * giradas, não se tocam. Confirmado independentemente por Monte Carlo (2M
 * amostras) fora deste arquivo antes de fixar os números. Com a AABB pura
 * (antes da Fase 2) isto gerava um aviso de interpenetração falso. */
test("duas peças giradas cuja AABB se cruza mas as caixas reais não se tocam: sem aviso", () => {
  const cena = new Cena();
  cena.criar("box", { largura: 1.2, altura: 0.1, profundidade: 0.15 }, {
    id: "barra_a", transform: { posicao: [0, 0, 0], rotacao: [0, PI / 3, 0] },
  });
  cena.criar("box", { largura: 1.2, altura: 0.1, profundidade: 0.15 }, {
    id: "barra_b", transform: { posicao: [0.7, 0, -0.2], rotacao: [0, PI / 6, 0] },
  });
  const inter = cena.avisos().filter((a) => a.tipo === "interpenetracao");
  assert.equal(inter.length, 0, `avisos: ${cena.avisosTexto()}`);
});

test("duas peças giradas que realmente se tocam continuam avisando", () => {
  const cena = new Cena();
  // mesma barra da mola-teste em examples/web/cena.ts: duas barras espelhadas
  // (+45°/-45°) cruzando perto do centro — a um gap pequeno, elas se tocam de
  // verdade (não é só a AABB).
  cena.criar("box", { largura: 2, altura: 0.1, profundidade: 0.08 }, {
    id: "barra_a", transform: { posicao: [0, 0, 0], rotacao: [0, PI / 4, 0] },
  });
  cena.criar("box", { largura: 2, altura: 0.1, profundidade: 0.08 }, {
    id: "barra_b", transform: { posicao: [0, 0, 0.1], rotacao: [0, -PI / 4, 0] },
  });
  const inter = cena.avisos().filter((a): a is AvisoInterpenetracao => a.tipo === "interpenetracao");
  assert.equal(inter.length, 1, `avisos: ${cena.avisosTexto()}`);
  // o valor/eixo reportados continuam vindo da AABB, como antes — o SAT só
  // decide SE reportar, não muda a mensagem de um caso que já era genuíno.
  assert.ok(["x", "y", "z"].includes(inter[0]!.eixo));
  assert.ok(inter[0]!.valor > 0);
});

test("caixas não giradas continuam se comportando como antes (OBB == AABB nesse caso)", () => {
  const cena = new Cena();
  cena.criar("box", { largura: 2, altura: 2, profundidade: 2 }, { id: "a", transform: { posicao: [0, 1, 0] } });
  cena.criar("box", { largura: 2, altura: 2, profundidade: 2 }, { id: "b", transform: { posicao: [0.5, 1, 0] } });
  const inter = cena.avisos().filter((a): a is AvisoInterpenetracao => a.tipo === "interpenetracao");
  assert.equal(inter.length, 1);
  assert.equal(inter[0]!.eixo, "x");
  assert.ok(Math.abs(inter[0]!.valor - 1.5) < 1e-9);
});

test("permitirContato: suprime o aviso de interpenetração e aparece como contato-intencional", () => {
  const cena = new Cena();
  const prego = cena.criar("cylinder", { raioTopo: 0.002, raioBase: 0.002, altura: 0.05 }, {
    id: "prego", transform: { posicao: [0.08, 0.02, 0] }, // longe o bastante da tábua para não disparar centros-coincidentes
  });
  cena.criar("box", { largura: 0.3, altura: 0.02, profundidade: 0.3 }, {
    id: "tabua", transform: { posicao: [0, 0.01, 0] },
  });

  // sem permitirContato: interpenetração de verdade (prego cravado na tábua)
  assert.equal(cena.avisos().filter((a) => a.tipo === "interpenetracao").length, 1);
  assert.match(cena.avisosTexto(), /AVISO:/);

  prego.permitirContato("tabua");
  const avisos = cena.avisos();
  assert.equal(avisos.filter((a) => a.tipo === "interpenetracao").length, 0);
  const intencionais = avisos.filter((a) => a.tipo === "contato-intencional");
  assert.equal(intencionais.length, 1);
  assert.deepEqual([...intencionais[0]!.nos].sort(), ["prego", "tabua"]);
  // não é um "problema": fica de fora do texto de avisos
  assert.equal(cena.avisosTexto(), "");
});

test("permitirContato vale numa direção só", () => {
  const cena = new Cena();
  const a = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { id: "a" });
  cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { id: "b", transform: { posicao: [0.5, 0, 0] } });
  a.permitirContato("b"); // só A declara; B não precisa
  assert.equal(cena.avisos().filter((av) => av.tipo === "interpenetracao").length, 0);
  assert.equal(cena.avisos().filter((av) => av.tipo === "contato-intencional").length, 1);
});

test("descrever() resume quantos contatos intencionais foram ignorados", () => {
  const cena = new Cena();
  const a = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, {
    id: "a", nome: "suporte", transform: { posicao: [0, 0.5, 0] },
  });
  const b = cena.criar("cylinder", { raioTopo: 0.1, raioBase: 0.1, altura: 0.5 }, {
    id: "b", nome: "pino", transform: { posicao: [0, 0.5, 0] },
  });
  a.permitirContato(b);
  const texto = cena.descrever();
  assert.match(texto, /1 contato intencional ignorado\./);
  assert.doesNotMatch(texto, /se sobrepõem, mas o contato foi declarado intencional/);
});
