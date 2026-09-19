import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Cena, ErroFeature, type GeometriaExtrusao } from "@snaple/core";
import { construirCena, construirGeometrias } from "@snaple/three";

/** Conta vértices da malha que caem dentro do círculo do furo (no plano XZ,
 * em coordenadas locais). Se o furo existe de verdade, esse número é 0. */
function verticesDentroDoFuro(g: THREE.BufferGeometry, centroXZ: [number, number], raio: number): number {
  const pos = g.getAttribute("position");
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i) - centroXZ[0], pos.getZ(i) - centroXZ[1]);
    if (d < raio - 1e-6) n++;
  }
  return n;
}

/** Teste obrigatório 4 — furo paramétrico numa placa. */
test("furo numa placa: geometria tem o furo, o estado não tem malha, e regerar com outro raio funciona", () => {
  const cena = new Cena();
  const placa = cena.criar("box", { largura: 0.4, altura: 0.02, profundidade: 0.3 }, { nome: "placa" });
  placa.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.05, segmentos: 64 }, u: 0.1, v: -0.05 });

  // 1. a receita derivada tem o furo
  const d = placa.geometria() as GeometriaExtrusao;
  assert.equal(d.tipo, "extrusao");
  assert.equal(d.eixo, "y");
  assert.equal(d.partes.length, 1, "furo passante = uma fatia só");
  assert.equal(d.partes[0]!.furos.length, 1);
  assert.equal(d.partes[0]!.furos[0]!.length, 64);

  // 2. a malha gerada tem o furo (nenhum vértice dentro dele)
  const [malha] = construirGeometrias(d);
  assert.ok(malha, "backend não produziu geometria");
  assert.equal(verticesDentroDoFuro(malha!, [0.1, -0.05], 0.05), 0);
  // ...e a malha ganhou vértices em relação à mesma placa sem furo
  const semFuro = construirGeometrias(cena.criar("box", { largura: 0.4, altura: 0.02, profundidade: 0.3 }).geometria())[0]!;
  assert.ok(
    malha!.getAttribute("position").count > semFuro.getAttribute("position").count,
    "a malha com furo devia ter mais vértices que a lisa",
  );
  // a bbox da placa não muda: um furo remove material, não aumenta a caixa
  assert.deepEqual(placa.bbox().tamanho.map((v) => +v.toFixed(9)), [0.4, 0.02, 0.3]);

  // 3. o ESTADO continua sem malha: só parâmetros
  const json = JSON.stringify(cena.toJSON());
  for (const proibido of ["position", "vertices", "indices", "normal", "attributes", "BufferGeometry"]) {
    assert.ok(!json.includes(proibido), `o estado serializado contém '${proibido}'`);
  }
  const noJSON = cena.toJSON().raiz.filhos.find((f) => f.id === placa.id)!;
  assert.deepEqual(noJSON.features, [
    { tipo: "furo", face: "topo", forma: { tipo: "circulo", raio: 0.05, segmentos: 64 }, u: 0.1, v: -0.05 },
  ]);

  // 4. mudar o raio e regerar
  placa.atualizarFuro(0, { forma: { tipo: "circulo", raio: 0.08, segmentos: 64 } });
  const d2 = placa.geometria() as GeometriaExtrusao;
  const contorno = d2.partes[0]!.furos[0]!;
  const centro = contorno.reduce((a, p) => [a[0] + p[0] / 64, a[1] + p[1] / 64], [0, 0]);
  const raiosReais = contorno.map((p) => Math.hypot(p[0] - centro[0]!, p[1] - centro[1]!));
  assert.ok(Math.abs(Math.max(...raiosReais) - 0.08) < 1e-9, `raio regerado = ${Math.max(...raiosReais)}`);
  const malha2 = construirGeometrias(d2)[0]!;
  assert.equal(verticesDentroDoFuro(malha2, [0.1, -0.05], 0.08), 0);
  // o estado continua sendo só parâmetro
  assert.equal((cena.toJSON().raiz.filhos.find((f) => f.id === placa.id)!.features[0] as
    { forma: { raio: number } }).forma.raio, 0.08);
});

test("furo de profundidade parcial fatia a peça sem CSG", () => {
  const cena = new Cena();
  const bloco = cena.criar("box", { largura: 0.2, altura: 0.1, profundidade: 0.2 });
  bloco.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.02 }, u: 0, v: 0, profundidade: 0.04 });
  const d = bloco.geometria() as GeometriaExtrusao;
  assert.equal(d.partes.length, 2, "esperava 2 fatias: trecho furado + trecho maciço");
  const furada = d.partes.find((p) => p.furos.length === 1)!;
  const macica = d.partes.find((p) => p.furos.length === 0)!;
  assert.ok(Math.abs(furada.altura - 0.04) < 1e-12, `fatia furada = ${furada.altura}`);
  assert.ok(Math.abs(macica.altura - 0.06) < 1e-12, `fatia maciça = ${macica.altura}`);
  // a fatia furada fica do lado da face topo
  assert.ok(furada.deslocamento > macica.deslocamento);
});

test("furo numa face lateral usa o eixo daquela face", () => {
  const cena = new Cena();
  const bloco = cena.criar("box", { largura: 0.3, altura: 0.2, profundidade: 0.1 });
  bloco.furar({ face: "leste", forma: { tipo: "retangulo", largura: 0.04, altura: 0.06 }, u: 0, v: 0 });
  const d = bloco.geometria() as GeometriaExtrusao;
  assert.equal(d.eixo, "x");
  assert.equal(d.partes[0]!.furos.length, 1);
});

/** Teste obrigatório 5 — furo em nó `model`: erro claro, não crash. */
test("furo em nó model dá erro claro", () => {
  const cena = new Cena();
  const cadeira = cena.criar("model", { src: "assets/cadeira.glb", tamanho: [0.45, 0.9, 0.5] }, { nome: "cadeira" });
  let erro: unknown;
  try {
    cadeira.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.01 }, u: 0, v: 0 });
  } catch (e) {
    erro = e;
  }
  assert.ok(erro instanceof ErroFeature, `esperava ErroFeature, veio ${erro}`);
  assert.equal((erro as ErroFeature).motivo, "malha-importada");
  assert.equal((erro as ErroFeature).noId, cadeira.id);
  assert.match((erro as Error).message, /malha importada/);
  // e o nó continua íntegro: a tentativa não deixou feature pela metade
  assert.deepEqual(cadeira.no.features, []);
  assert.equal(cadeira.geometria().tipo, "modelo");
});

test("furo em geometria não-extrudável dá erro claro", () => {
  const cena = new Cena();
  for (const [tipo, params] of [
    ["sphere", { raio: 0.5 }],
    ["cone", { raio: 0.3, altura: 1 }],
    ["torus", { raio: 0.4, raioTubo: 0.1 }],
  ] as const) {
    const no = cena.criar(tipo, params as never);
    assert.throws(
      () => no.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.01 }, u: 0, v: 0 }),
      (e: unknown) => e instanceof ErroFeature && e.motivo === "geometria-nao-extrudavel",
      `${tipo} devia recusar o furo`,
    );
  }
  // cilindro RETO é extrudável; tronco de cone não é
  const reto = cena.criar("cylinder", { raioTopo: 0.2, raioBase: 0.2, altura: 0.5 });
  reto.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.05 }, u: 0, v: 0 });
  assert.equal(reto.geometria().tipo, "extrusao");
  const tronco = cena.criar("cylinder", { raioTopo: 0.1, raioBase: 0.2, altura: 0.5 });
  assert.throws(
    () => tronco.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.02 }, u: 0, v: 0 }),
    (e: unknown) => e instanceof ErroFeature && e.motivo === "geometria-nao-extrudavel",
  );
});

test("furos em faces de normais diferentes dão erro em vez de gambiarra", () => {
  const cena = new Cena();
  const bloco = cena.criar("box", { largura: 0.3, altura: 0.3, profundidade: 0.3 });
  bloco.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.03 }, u: 0, v: 0 });
  assert.throws(
    () => bloco.furar({ face: "leste", forma: { tipo: "circulo", raio: 0.03 }, u: 0, v: 0 }),
    (e: unknown) => e instanceof ErroFeature && e.motivo === "faces-conflitantes",
  );
  // o primeiro furo continua lá e válido
  assert.equal(bloco.no.features.length, 1);
});

test("furo que atravessaria outro nó dá erro apontando o nó", () => {
  const cena = new Cena();
  const placaA = cena.criar("box", { largura: 0.3, altura: 0.02, profundidade: 0.3 }, { transform: { posicao: [0, 0.01, 0] } });
  cena.criar("box", { largura: 0.3, altura: 0.02, profundidade: 0.3 }, { id: "placa_b", transform: { posicao: [0, -0.02, 0] } });
  assert.throws(
    () => placaA.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.01 }, u: 0, v: 0, profundidade: 0.06 }),
    (e: unknown) => e instanceof ErroFeature && e.motivo === "atravessa-outro-no" && /placa_b/.test(e.message),
  );
});

test("furo maior que a peça dá erro", () => {
  const cena = new Cena();
  const placa = cena.criar("box", { largura: 0.1, altura: 0.01, profundidade: 0.1 });
  assert.throws(
    () => placa.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.09 }, u: 0, v: 0 }),
    (e: unknown) => e instanceof ErroFeature && e.motivo === "furo-maior-que-o-no",
  );
});

test("o backend desenha caixa proxy e avisa quando o model não carrega", async () => {
  const cena = new Cena();
  cena.criar("model", { src: "nao/existe.glb", tamanho: [0.5, 1, 0.4] }, { id: "modelo_ausente" });
  const { objeto, avisos } = await construirCena(cena, { carregarModelo: async () => null });
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0]!.motivo, "modelo-ausente");
  assert.match(avisos[0]!.texto, /caixa proxy/);
  const proxy = objeto.getObjectByName("modelo_ausente")!;
  const caixa = new THREE.Box3().setFromObject(proxy);
  const t = new THREE.Vector3();
  caixa.getSize(t);
  // Float32 na BufferGeometry: compara com tolerância, não por igualdade
  for (const [real, esperado] of [[t.x, 0.5], [t.y, 1], [t.z, 0.4]] as const) {
    assert.ok(Math.abs(real - esperado) < 1e-6, `proxy ${real} ≠ ${esperado}`);
  }
});

test("o backend avisa quando a bbox real diverge da declarada, sem corrigir", async () => {
  const cena = new Cena();
  cena.criar("model", { src: "qualquer.glb", tamanho: [1, 1, 1] }, { id: "divergente" });
  const carregado = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1));
  const { objeto, avisos } = await construirCena(cena, { carregarModelo: async () => carregado });
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0]!.motivo, "bbox-divergente");
  assert.match(avisos[0]!.texto, /nada foi reescalado/);
  // não reescalou: o objeto entregue mantém o tamanho real do arquivo
  const caixa = new THREE.Box3().setFromObject(objeto.getObjectByName("divergente")!);
  const t = new THREE.Vector3();
  caixa.getSize(t);
  assert.ok(Math.abs(t.x - 2) < 1e-6, `x = ${t.x}`);
});
