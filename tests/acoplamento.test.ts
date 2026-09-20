import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { Cena } from "@snaple/core";

const ajv = new Ajv2020({ strict: false, allErrors: true });
const valida = ajv.compile(JSON.parse(readFileSync(new URL("../spec/cena.schema.json", import.meta.url), "utf-8")));

test("contato: passa quando as faces estão no mesmo plano com normais opostas", () => {
  const cena = new Cena();
  const chapa = cena.criar("box", { largura: 0.3, altura: 0.01, profundidade: 0.2 }, { nome: "chapa" });
  const bateria = cena.criar("box", { largura: 0.1, altura: 0.05, profundidade: 0.1 }, { nome: "bateria" });
  chapa.face("topo").colocar(bateria);
  cena.acoplar({ tipo: "contato", a: { no: chapa, face: "topo" }, b: { no: bateria, face: "base" } });
  const rel = cena.conferirMontagem();
  assert.equal(rel.passou, true);
  assert.ok(rel.piorCaso!.erroPosicao < 1e-9);
  assert.ok(rel.piorCaso!.erroAngulo < 1e-9);
});

test("contato: falha por deslocamento (fora do plano) ou por normais não opostas, separadamente", () => {
  const cena = new Cena();
  const chapa = cena.criar("box", { largura: 0.3, altura: 0.01, profundidade: 0.2 }, { nome: "chapa" });
  const bateria = cena.criar("box", { largura: 0.1, altura: 0.05, profundidade: 0.1 }, { nome: "bateria" });
  chapa.face("topo").colocar(bateria);
  cena.acoplar({ tipo: "contato", nome: "fixacao", a: { no: chapa, face: "topo" }, b: { no: bateria, face: "base" } });
  cena.deslocarMundo(bateria, [0, 0.02, 0]); // só quebra a coplanaridade — normais continuam opostas
  const relPosicao = cena.conferirMontagem();
  assert.equal(relPosicao.passou, false);
  assert.ok(Math.abs(relPosicao.piorCaso!.erroPosicao - 0.02) < 1e-9);
  assert.ok(relPosicao.piorCaso!.erroAngulo < 1e-9, "só a posição deveria ter piorado");

  const cena2 = new Cena();
  const chapa2 = cena2.criar("box", { largura: 0.3, altura: 0.01, profundidade: 0.2 }, { nome: "chapa" });
  const bateria2 = cena2.criar("box", { largura: 0.1, altura: 0.05, profundidade: 0.1 }, { nome: "bateria" });
  chapa2.face("topo").colocar(bateria2);
  cena2.acoplar({ tipo: "contato", a: { no: chapa2, face: "topo" }, b: { no: bateria2, face: "base" } });
  bateria2.girar([0.2, 0, 0]); // só inclina — o centro continua no plano
  const relAngulo = cena2.conferirMontagem();
  assert.equal(relAngulo.passou, false);
  assert.ok(relAngulo.piorCaso!.erroAngulo > 0.01, `erro de ângulo pequeno demais: ${relAngulo.piorCaso!.erroAngulo}`);
});

test("pivo: passa com centros coincidentes e normais opostas; sobrevive a girar em torno do próprio eixo", () => {
  const cena = new Cena();
  const ombro = cena.criar("cylinder", { raioTopo: 0.05, raioBase: 0.05, altura: 0.02 }, { nome: "ombro" });
  const braco = cena.criar("box", { largura: 0.02, altura: 0.3, profundidade: 0.02 }, { nome: "braço" });
  ombro.face("topo").colocar(braco);
  cena.acoplar({ tipo: "pivo", a: { no: ombro, face: "topo" }, b: { no: braco, face: "base" } });
  assert.equal(cena.conferirMontagem().passou, true);

  braco.girar([0, Math.PI / 3, 0]);
  assert.equal(cena.conferirMontagem().passou, true, "girar em torno do próprio eixo não deveria quebrar o pivô");
});

test("pivo: falha quando os centros se afastam (mesmo com normais ainda opostas)", () => {
  const cena = new Cena();
  const ombro = cena.criar("cylinder", { raioTopo: 0.05, raioBase: 0.05, altura: 0.02 }, { nome: "ombro" });
  const braco = cena.criar("box", { largura: 0.02, altura: 0.3, profundidade: 0.02 }, { nome: "braço" });
  ombro.face("topo").colocar(braco);
  cena.acoplar({ tipo: "pivo", a: { no: ombro, face: "topo" }, b: { no: braco, face: "base" } });
  cena.deslocarMundo(braco, [0.03, 0, 0]);
  const rel = cena.conferirMontagem();
  assert.equal(rel.passou, false);
  assert.ok(Math.abs(rel.piorCaso!.erroPosicao - 0.03) < 1e-9);
});

test("desacoplar remove o acoplamento (por ref e por id)", () => {
  const cena = new Cena();
  const a = cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  const b = cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  const ref = cena.acoplar({ tipo: "contato", a: { no: a, face: "topo" }, b: { no: b, face: "base" } });
  assert.equal(cena.acoplamentos().length, 1);
  cena.desacoplar(ref);
  assert.equal(cena.acoplamentos().length, 0);
  assert.throws(() => cena.desacoplar("acoplamento-inexistente"));
});

test("serialização: toJSON/deJSON preserva id, tipo, nome e referências; contador de id não colide", () => {
  const cena = new Cena();
  const a = cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  const b = cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  const ref = cena.acoplar({ tipo: "pivo", nome: "articulação de teste", a: { no: a, face: "leste" }, b: { no: b, face: "oeste" } });

  const json = cena.toJSON();
  assert.equal(json.acoplamentos?.length, 1);
  assert.deepEqual(json.acoplamentos![0], {
    id: ref.id, tipo: "pivo", nome: "articulação de teste",
    a: { no: a.id, face: "leste" }, b: { no: b.id, face: "oeste" },
  });

  const restaurada = Cena.deJSON(json);
  assert.deepEqual([...restaurada.acoplamentos()], json.acoplamentos);
  const novoRef = restaurada.acoplar({ tipo: "contato", a: { no: a.id, face: "topo" }, b: { no: b.id, face: "base" } });
  assert.notEqual(novoRef.id, ref.id, "novo id não pode colidir com o restaurado");
});

test("serialização: sem acoplamentos, o campo fica ausente no JSON (não um array vazio)", () => {
  const cena = new Cena();
  cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  assert.equal("acoplamentos" in cena.toJSON(), false);
});

test("schema: aceita um documento com acoplamentos válido, recusa um com referência incompleta", () => {
  const cena = new Cena();
  const a = cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  const b = cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  cena.acoplar({ tipo: "contato", a: { no: a, face: "topo" }, b: { no: b, face: "base" } });
  const json = cena.toJSON();
  assert.equal(valida(json), true, JSON.stringify(valida.errors));

  const mau = JSON.parse(JSON.stringify(json));
  delete mau.acoplamentos[0].b;
  assert.equal(valida(mau), false);

  const tipoInvalido = JSON.parse(JSON.stringify(json));
  tipoInvalido.acoplamentos[0].tipo = "solda";
  assert.equal(valida(tipoInvalido), false);
});

test("linter: contato/pivo suprime interpenetração E flutuação entre os dois nós envolvidos", () => {
  const cena = new Cena();
  // "fixo" fica INTEIRAMENTE dentro da faixa de altura de "rotor" (rotor é
  // mais alto e se estende tanto abaixo quanto acima de fixo) — garante
  // interpenetração real E que a checagem geométrica de apoio (que exige o
  // suporte começar no máximo na mesma altura da base do flutuante) não
  // reconheça "fixo" como apoio de "rotor": o bottom de fixo (0.495) fica
  // ACIMA do bottom de rotor (0.49), então fixo não passa no teste de apoio.
  const fixo = cena.criar("cylinder", { raioTopo: 0.02, raioBase: 0.02, altura: 0.01 }, { id: "fixo", transform: { posicao: [0, 0.5, 0] } });
  const rotor = cena.criar("cylinder", { raioTopo: 0.018, raioBase: 0.018, altura: 0.03 }, { id: "rotor", transform: { posicao: [0, 0.505, 0] } });
  const semAcoplamento = cena.avisos();
  assert.ok(semAcoplamento.some((av) => av.tipo === "interpenetracao"), `sem interpenetração: ${cena.avisosTexto()}`);
  assert.ok(semAcoplamento.some((av) => av.tipo === "flutuando" && av.no === "rotor"), `rotor não flutuou: ${cena.avisosTexto()}`);

  cena.acoplar({ tipo: "pivo", a: { no: fixo, face: "topo" }, b: { no: rotor, face: "base" } });
  const comAcoplamento = cena.avisos();
  assert.equal(comAcoplamento.some((av) => av.tipo === "interpenetracao"), false);
  assert.equal(comAcoplamento.some((av) => av.tipo === "flutuando" && av.no === "rotor"), false);
});

test("linter: acoplamento-violado dispara quando a relação deixa de valer, some quando ela volta a valer", () => {
  const cena = new Cena();
  const chapa = cena.criar("box", { largura: 0.3, altura: 0.01, profundidade: 0.2 }, { id: "chapa" });
  const bateria = cena.criar("box", { largura: 0.1, altura: 0.05, profundidade: 0.1 }, { id: "bateria" });
  chapa.face("topo").colocar(bateria);
  cena.acoplar({ tipo: "contato", nome: "fixacao", a: { no: chapa, face: "topo" }, b: { no: bateria, face: "base" } });
  assert.equal(cena.avisos().some((a) => a.tipo === "acoplamento-violado"), false);

  cena.deslocarMundo(bateria, [0, 0.02, 0]);
  const avisos = cena.avisos();
  const violado = avisos.find((a) => a.tipo === "acoplamento-violado");
  assert.ok(violado, "esperava aviso acoplamento-violado");
  assert.deepEqual(violado!.nos, ["chapa", "bateria"]);
  assert.match(cena.avisosTexto(), /acoplamento-violado|fixacao/);

  cena.deslocarMundo(bateria, [0, -0.02, 0]);
  assert.equal(cena.avisos().some((a) => a.tipo === "acoplamento-violado"), false);
});

test("descrever(): frases de pivô e de contato no formato esperado", () => {
  const cena = new Cena();
  const ombro = cena.criar("cylinder", { raioTopo: 0.05, raioBase: 0.05, altura: 0.02 }, { nome: "ombro" });
  const braco = cena.criar("box", { largura: 0.02, altura: 0.3, profundidade: 0.02 }, { nome: "braço" });
  ombro.face("topo").colocar(braco);
  cena.acoplar({ tipo: "pivo", a: { no: ombro, face: "topo" }, b: { no: braco, face: "base" } });

  const cena2 = new Cena();
  const chapa = cena2.criar("box", { largura: 0.3, altura: 0.01, profundidade: 0.2 }, { nome: "chapa" });
  const bateria = cena2.criar("box", { largura: 0.1, altura: 0.05, profundidade: 0.1 }, { nome: "bateria" });
  chapa.face("topo").colocar(bateria);
  cena2.acoplar({ tipo: "contato", a: { no: chapa, face: "topo" }, b: { no: bateria, face: "base" } });

  assert.match(cena.descrever(), /O braço gira em torno do pivô do ombro\./);
  assert.match(cena2.descrever(), /A bateria está assentada sobre a chapa\./);
});

test("remover(): descarta acoplamentos que referenciam o nó removido (ou um descendente dele)", () => {
  const cena = new Cena();
  const a = cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  const grupoB = cena.criar("grupo", {});
  const bFilho = grupoB.criar("box", { largura: 0.05, altura: 0.05, profundidade: 0.05 });
  cena.acoplar({ tipo: "contato", a: { no: a, face: "topo" }, b: { no: bFilho, face: "base" } });
  assert.equal(cena.acoplamentos().length, 1);
  cena.remover(grupoB); // remove o grupo inteiro, incluindo bFilho
  assert.equal(cena.acoplamentos().length, 0);
});
