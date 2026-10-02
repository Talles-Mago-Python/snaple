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

// ── Escala de milímetros (modelos reais de câmera, ~1000 nós) ────────────

test("centros-coincidentes: peças pequenas vizinhas não geram aviso", () => {
  const cena = new Cena();
  const chapa = cena.criar("box", { largura: 0.13, altura: 0.002, profundidade: 0.08 }, { transform: { posicao: [0, 0.001, 0] } });
  // uma fileira de parafusos de 3 mm a 8 mm um do outro, sobre a chapa:
  // bem dentro dos antigos 3 cm absolutos, mas cada um é uma peça distinta
  const parafusos = [0, 1, 2, 3, 4].map(() =>
    cena.criar("cylinder", { raioTopo: 0.0015, raioBase: 0.0015, altura: 0.003 }));
  parafusos.forEach((p, i) => chapa.face("topo").colocar(p, { u: -0.016 + i * 0.008, v: 0 }));
  const centros = cena.avisos().filter((a) => a.tipo === "centros-coincidentes");
  assert.deepEqual(centros, [], cena.avisosTexto());
});

test("centros-coincidentes: dois nós realmente sobrepostos no mesmo centro continuam avisando", () => {
  const cena = new Cena();
  // duas peças de 5 mm no mesmo lugar — o erro clássico de esquecer de posicionar
  cena.criar("box", { largura: 0.005, altura: 0.005, profundidade: 0.005 }, { id: "a", transform: { posicao: [0, 0.0025, 0] } });
  cena.criar("box", { largura: 0.004, altura: 0.004, profundidade: 0.004 }, { id: "b", transform: { posicao: [0, 0.0025, 0] } });
  const centros = cena.avisos().filter((a) => a.tipo === "centros-coincidentes");
  assert.equal(centros.length, 1, cena.avisosTexto());
  assert.deepEqual((centros[0] as { nos: string[] }).nos, ["a", "b"]);
});

test("nenhum texto de aviso mostra zero para um valor diferente de zero", () => {
  const cena = new Cena();
  // sobreposição de 0.35 mm (passa do TOL_CONTATO, antes saía "0.0004 m")
  cena.criar("box", { largura: 0.01, altura: 0.01, profundidade: 0.01 }, { id: "a", transform: { posicao: [0, 0.005, 0] } });
  cena.criar("box", { largura: 0.01, altura: 0.01, profundidade: 0.01 }, { id: "b", transform: { posicao: [0.00965, 0.005, 0] } });
  // sobreposição de 2 µm — antes saía "0.0000 m"
  cena.criar("box", { largura: 0.01, altura: 0.01, profundidade: 0.01 }, { id: "c", transform: { posicao: [0.1, 0.005, 0] } });
  cena.criar("box", { largura: 0.01, altura: 0.01, profundidade: 0.01 }, { id: "d", transform: { posicao: [0.109998, 0.005, 0] } });
  // flutuando a 0.2 mm
  cena.criar("sphere", { raio: 0.005 }, { id: "e", transform: { posicao: [1, 0.0052, 0] } });

  const avisos = cena.avisos();
  const penetra = (x: string) => avisos.find((a) => a.tipo === "interpenetracao" && (a as AvisoInterpenetracao).nos[0] === x)!;
  assert.equal(penetra("a").texto, "a penetra b em 0.35 mm no eixo x");
  assert.equal(penetra("c").texto, "c penetra d em 0.0020 mm no eixo x");
  assert.equal(avisos.find((a) => a.tipo === "flutuando")!.texto, "e flutua 0.20 mm acima do chão, sem nada embaixo");
  for (const a of avisos) {
    assert.doesNotMatch(a.texto, /(^|[^\d.])0(\.0+)? (m|mm)\b/, a.texto);
    assert.doesNotMatch(a.texto, /0\.0000/, a.texto);
  }
});

test("texto do aviso usa o nome do nó quando existe; o campo estruturado continua com ids", () => {
  const cena = new Cena();
  cena.criar("box", { largura: 2, altura: 2, profundidade: 2 }, { id: "caixa_a", nome: "gaveta", transform: { posicao: [0, 1, 0] } });
  cena.criar("box", { largura: 2, altura: 2, profundidade: 2 }, { id: "caixa_b", transform: { posicao: [0.5, 1, 0] } });
  cena.criar("sphere", { raio: 0.5 }, { id: "bola", nome: "luminária", transform: { posicao: [5, 2.5, 0] } });

  const avisos = cena.avisos();
  const inter = avisos.find((a): a is AvisoInterpenetracao => a.tipo === "interpenetracao")!;
  assert.equal(inter.texto, "gaveta penetra caixa_b em 1.50 m no eixo x"); // sem nome ⇒ id
  assert.deepEqual(inter.nos, ["caixa_a", "caixa_b"]);
  const flut = avisos.find((a) => a.tipo === "flutuando")!;
  assert.equal(flut.texto, "luminária flutua 2.00 m acima do chão, sem nada embaixo");
  assert.equal((flut as { no: string }).no, "bola");
});

test("permitirFlutuacao: o nó some do 'flutuando' e vira aviso intencional, fora do texto", () => {
  const cena = new Cena();
  const prateleira = cena.criar(
    "box", { largura: 0.8, altura: 0.04, profundidade: 0.3 },
    { id: "prateleira", nome: "prateleira", transform: { posicao: [0, 1.4, 0] } },
  );
  assert.ok(cena.avisos().some((a) => a.tipo === "flutuando"), "sanidade: sem declaração, flutua");

  prateleira.permitirFlutuacao("parafusada na parede");

  const avisos = cena.avisos();
  assert.equal(avisos.filter((a) => a.tipo === "flutuando").length, 0);
  const dec = avisos.find((a) => a.tipo === "flutuacao-intencional")!;
  assert.equal(dec.no, "prateleira");
  assert.ok(dec.texto.includes("parafusada na parede"), dec.texto);
  // intencional não é problema: texto e o resumo de descrever() refletem isso
  assert.equal(cena.avisosTexto(), "");
  assert.ok(cena.descrever().includes("1 flutuação intencional ignorada"), cena.descrever());
});

test("permitirFlutuacao no ancestral cobre a subárvore inteira", () => {
  const cena = new Cena();
  const camada = cena.criar("grupo", {}, { id: "camada", nome: "camada", transform: { posicao: [0, 1, 0] } });
  cena.criar("box", { largura: 0.3, altura: 0.05, profundidade: 0.3 }, { pai: "camada", nome: "peça" });
  assert.equal(cena.avisos().filter((a) => a.tipo === "flutuando").length, 1, "sanidade: sem declaração, a peça flutua");

  camada.permitirFlutuacao("vista explodida");

  const avisos = cena.avisos();
  assert.equal(avisos.filter((a) => a.tipo === "flutuando").length, 0);
  assert.equal(avisos.filter((a) => a.tipo === "flutuacao-intencional").length, 1);
});
