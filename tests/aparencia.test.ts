import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import * as THREE from "three";
import { AFASTAMENTO_ADESIVO, Cena, derivarAdesivos, type AdesivoPlano, type AdesivoRevolucao } from "@snaple/core";
import { construirCena, type CarregarTextura } from "@snaple/three";

const perto = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;
const pertoV = (a: readonly number[], b: readonly number[], tol = 1e-9) => a.every((x, i) => perto(x, b[i]!, tol));

/** Em Node não há como decodificar PNG: o teste injeta uma imagem 2×2. */
const imagemFalsa: CarregarTextura = async (src) =>
  src.includes("faltando") ? null : new THREE.DataTexture(new Uint8Array(16).fill(255), 2, 2);

test("adesivo em face plana: padrão é a face inteira, legível de fora", () => {
  const cena = new Cena();
  const caixa = cena.criar("box", { largura: 1, altura: 0.5, profundidade: 0.2 })
    .colarAdesivo({ src: "tela.png", face: "sul" })
    .colarAdesivo({ src: "tampo.png", face: "topo" })
    .colarAdesivo({ src: "logo.png", face: "leste", u: 0.03, v: 0.1, largura: 0.1, altura: 0.05 });
  const [sul, topo, leste] = derivarAdesivos(caixa.no) as AdesivoPlano[];
  assert.ok(pertoV(sul!.centro, [0, 0, 0.1 + AFASTAMENTO_ADESIVO]));
  assert.deepEqual([sul!.largura, sul!.altura], [1, 0.5]);
  // olhando a face sul (de +z para −z): direita = +x, topo da imagem = +y
  assert.ok(pertoV(sul!.direita, [1, 0, 0]) && pertoV(sul!.cima, [0, 1, 0]));
  // no topo, o topo da imagem aponta para o norte (−z)
  assert.ok(pertoV(topo!.direita, [1, 0, 0]) && pertoV(topo!.cima, [0, 0, -1]));
  assert.deepEqual([topo!.largura, topo!.altura], [1, 0.2]);
  // (u, v) com a mesma convenção de furar/colocar: na face leste, u = +z
  assert.ok(pertoV(leste!.centro, [0.5 + AFASTAMENTO_ADESIVO, 0.1, 0.03]));
  assert.ok(pertoV(leste!.direita, [0, 0, -1]));
});

test("adesivo: rotação gira a imagem no plano da face", () => {
  const cena = new Cena();
  const caixa = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 })
    .colarAdesivo({ src: "a.png", face: "sul", rotacao: Math.PI / 2 });
  const [a] = derivarAdesivos(caixa.no) as AdesivoPlano[];
  assert.ok(pertoV(a!.direita, [0, 1, 0]) && pertoV(a!.cima, [-1, 0, 0]));
});

test("adesivo na lateral: volta inteira por padrão; largura vira arco medido na altura v", () => {
  const cena = new Cena();
  const lata = cena.criar("cylinder", { raioTopo: 0.033, raioBase: 0.033, altura: 0.12 })
    .colarAdesivo({ src: "rotulo.png", face: "lateral" })
    .colarAdesivo({ src: "logo.png", face: "lateral", u: Math.PI / 2, v: 0.02, largura: 0.033, altura: 0.04 });
  const [rotulo, logo] = derivarAdesivos(lata.no) as AdesivoRevolucao[];
  assert.ok(perto(rotulo!.abertura, 2 * Math.PI));
  assert.ok(pertoV(rotulo!.perfil.flat(), [0.033 + AFASTAMENTO_ADESIVO, -0.06, 0.033 + AFASTAMENTO_ADESIVO, 0.06]));
  assert.ok(perto(logo!.abertura, 1)); // 3,3 cm de arco num raio de 3,3 cm = 1 rad
  assert.ok(perto(logo!.anguloInicio, Math.PI / 2 - 0.5));
  assert.ok(pertoV(logo!.perfil.map((p) => p[1]), [0, 0.04]));
});

test("adesivo na lateral de um lathe: recorta o perfil na faixa de altura e sobe com ela", () => {
  const cena = new Cena();
  // garrafa descrita de cima para baixo: o adesivo tem de subir mesmo assim
  const garrafa = cena.criar("lathe", {
    perfil: [[0.01, 0.3], [0.01, 0.25], [0.04, 0.18], [0.04, 0], [0.001, 0]], recentrar: false,
  }).colarAdesivo({ src: "r.png", face: "lateral", v: 0.18, altura: 0.1 });
  const [a] = derivarAdesivos(garrafa.no) as AdesivoRevolucao[];
  const ys = a!.perfil.map((p) => p[1]);
  assert.ok(ys.every((y, i) => i === 0 || y >= ys[i - 1]!), `perfil não sobe: ${ys}`);
  assert.ok(perto(ys[0]!, 0.13, 1e-3) && perto(ys[ys.length - 1]!, 0.23, 1e-3));
  // o trecho reto (raio 0,04) e o começo do ombro, afastados para fora
  assert.ok(perto(a!.perfil[0]![0], 0.04 + AFASTAMENTO_ADESIVO, 1e-9));
});

test("adesivo: face que o tipo não tem e tamanho inválido viram erro, sem gravar nada", () => {
  const cena = new Cena();
  const bola = cena.criar("sphere", { raio: 0.1 });
  assert.throws(() => bola.colarAdesivo({ src: "a.png", face: "topo" }), /não tem face plana 'topo'/);
  assert.throws(() => bola.colarAdesivo({ src: "a.png", face: "lateral" }), /só existe em cylinder, cone e lathe/);
  const peca = cena.criar("extrude", { perfil: [[0, 0], [1, 0], [0, 1]], altura: 0.1 });
  assert.throws(() => peca.colarAdesivo({ src: "a.png", face: "sul" }), /faces planas: topo, base/);
  const lata = cena.criar("cylinder", { raioTopo: 0.03, raioBase: 0.03, altura: 0.1 });
  assert.throws(() => lata.colarAdesivo({ src: "a.png", face: "sul" }), /use face: "lateral"/);
  const caixa = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }).colarAdesivo({ src: "ok.png", face: "topo" });
  assert.throws(() => caixa.colarAdesivo({ src: "a.png", face: "sul", largura: 0 }), /'largura' precisa ser > 0/);
  assert.equal(caixa.no.adesivos!.length, 1);
  assert.equal(bola.no.adesivos, undefined);
});

async function construir(cena: Cena) {
  const r = await construirCena(cena, { carregarTextura: imagemFalsa });
  r.objeto.updateMatrixWorld(true);
  return r;
}

function peliculas(objeto: THREE.Object3D): THREE.Mesh[] {
  const r: THREE.Mesh[] = [];
  objeto.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.snapleAdesivo) r.push(o); });
  return r;
}

/** Todo triângulo com a face virada para o lado das normais dos vértices. */
function invertidos(m: THREE.Mesh): number {
  const pos = m.geometry.getAttribute("position"), nor = m.geometry.getAttribute("normal");
  const idx = m.geometry.index!;
  let n = 0;
  for (let k = 0; k < idx.count; k += 3) {
    const [a, b, c] = [idx.getX(k), idx.getX(k + 1), idx.getX(k + 2)];
    const va = new THREE.Vector3().fromBufferAttribute(pos, a);
    const face = new THREE.Vector3().crossVectors(
      new THREE.Vector3().fromBufferAttribute(pos, b).sub(va), new THREE.Vector3().fromBufferAttribute(pos, c).sub(va),
    );
    const normal = new THREE.Vector3().fromBufferAttribute(nor, a).add(new THREE.Vector3().fromBufferAttribute(nor, b))
      .add(new THREE.Vector3().fromBufferAttribute(nor, c));
    if (face.lengthSq() > 1e-20 && face.dot(normal) < 0) n++;
  }
  return n;
}

test("backend: películas dos adesivos saem viradas para fora, 0,1 mm acima da superfície", async () => {
  const cena = new Cena();
  cena.criar("box", { largura: 1, altura: 0.5, profundidade: 0.2 }, { id: "monitor" })
    .colarAdesivo({ src: "tela.png", face: "sul", largura: 0.9, altura: 0.4 })
    .colarAdesivo({ src: "t.png", face: "base" });
  cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.03, altura: 0.1 }, { id: "copo", transform: { posicao: [2, 0, 0] } })
    .colarAdesivo({ src: "logo.png", face: "lateral", u: 0.5, largura: 0.05 });
  cena.criar("lathe", { perfil: [[0.001, 0], [0.05, 0.02], [0.03, 0.1], [0.04, 0.2]] }, { id: "vaso", transform: { posicao: [4, 0, 0] } })
    .colarAdesivo({ src: "r.png", face: "lateral" });
  const { objeto, avisos } = await construir(cena);
  assert.deepEqual(avisos, []);
  const ps = peliculas(objeto);
  assert.equal(ps.length, 4);
  for (const p of ps) {
    assert.equal(invertidos(p), 0, `${p.name}: triângulos virados para dentro`);
    assert.ok((p.material as THREE.MeshStandardMaterial).map, `${p.name} sem imagem`);
  }
  const tela = ps.find((p) => p.name === "monitor:adesivo0")!;
  const caixa = new THREE.Box3().setFromObject(tela);
  assert.ok(perto(caixa.min.z, 0.1 + AFASTAMENTO_ADESIVO, 1e-6) && perto(caixa.max.z, 0.1 + AFASTAMENTO_ADESIVO, 1e-6));
  assert.ok(pertoV(caixa.getSize(new THREE.Vector3()).toArray(), [0.9, 0.4, 0], 1e-6));
  // a película do copo acompanha o tronco de cone: raio da superfície + afastamento
  const logo = ps.find((p) => p.name === "copo:adesivo0")!;
  const pos = logo.geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), r = Math.hypot(pos.getX(i), pos.getZ(i));
    const esperado = 0.03 + (0.01 * (y + 0.05)) / 0.1;
    assert.ok(Math.abs(r - esperado) < 2e-4 && r > esperado, `vértice ${i}: raio ${r}, superfície ${esperado}`);
  }
});

test("backend: adesivo não entra na bbox do nó, e a malha do nó continua batendo com o core", async () => {
  const cena = new Cena();
  cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { id: "c" }).colarAdesivo({ src: "a.png", face: "topo" });
  assert.ok(perto(cena.bbox("c").max[1], 0.5));
  const { objeto } = await construir(cena);
  let malha: THREE.Mesh | undefined;
  objeto.traverse((o) => { if (o.userData.snaple?.id === "c") malha = o as THREE.Mesh; });
  malha!.geometry.computeBoundingBox();
  assert.ok(perto(malha!.geometry.boundingBox!.max.y, 0.5, 1e-6));
});

test("backend: textura vai para o material com repetição/giro; imagem ausente vira aviso", async () => {
  const cena = new Cena();
  cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, {
    id: "tabua", material: { textura: { src: "madeira.png", repetir: [3, 1], rotacao: 0.5 } },
  });
  cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, {
    id: "sem", transform: { posicao: [2, 0, 0] }, material: { cor: "#ff0000", textura: { src: "faltando.png" } },
  }).colarAdesivo({ src: "faltando.png", face: "topo" });
  const { objeto, avisos } = await construir(cena);
  const malhas = new Map<string, THREE.Mesh>();
  objeto.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.snaple) malhas.set(o.userData.snaple.id, o); });
  const m = malhas.get("tabua")!.material as THREE.MeshStandardMaterial;
  assert.ok(m.map);
  assert.deepEqual(m.map.repeat.toArray(), [3, 1]);
  assert.equal(m.map.rotation, 0.5);
  assert.equal(m.map.wrapS, THREE.RepeatWrapping);
  assert.equal(m.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(m.color.getHexString(), "ffffff"); // com textura, a cor padrão é branca
  const sem = malhas.get("sem")!.material as THREE.MeshStandardMaterial;
  assert.equal(sem.map, null);
  assert.equal(sem.color.getHexString(), new THREE.Color("#ff0000").getHexString());
  assert.deepEqual(avisos.map((a) => a.motivo).sort(), ["textura-ausente", "textura-ausente"]);
  assert.equal(peliculas(objeto).length, 0);
});

test("backend: sem carregador de imagem fora do navegador, avisa em vez de quebrar", async () => {
  const cena = new Cena();
  cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { material: { textura: { src: "x.png" } } });
  const { avisos } = await construirCena(cena);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!.texto, /fora do navegador/);
});

test("UV canônico: extrude e sweep vão de 0 a 1 e não dão a volta para trás na costura", async () => {
  const cena = new Cena();
  cena.criar("extrude", { perfil: [[0, 0], [0.4, 0], [0.4, 0.2], [0.1, 0.3]], altura: 0.1 }, { id: "ext" });
  cena.criar("sweep", {
    caminho: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], fechado: true, suavizar: true,
    secao: { tipo: "circulo", raio: 0.02 },
  }, { id: "anel", transform: { posicao: [3, 0, 0] } });
  // furo de profundidade parcial fatia o extrude: o v continua contínuo
  cena.criar("box", { largura: 0.3, altura: 0.2, profundidade: 0.3 }, { id: "fatiado", transform: { posicao: [6, 0, 0] } })
    .furar({ face: "topo", forma: { tipo: "circulo", raio: 0.05 }, u: 0, v: 0, profundidade: 0.08 });
  const { objeto } = await construir(cena);
  objeto.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const uv = o.geometry.getAttribute("uv");
    assert.ok(uv, `${o.name} sem uv`);
    const idx = o.geometry.index;
    for (let i = 0; i < uv.count; i++) {
      assert.ok(uv.getX(i) > -1e-6 && uv.getX(i) < 1 + 1e-6 && uv.getY(i) > -1e-6 && uv.getY(i) < 1 + 1e-6,
        `${o.name}: uv fora de 0..1 (${uv.getX(i)}, ${uv.getY(i)})`);
    }
    // nenhum triângulo de PAREDE atravessa a costura (salto de ~1 em u ou
    // v); tampas têm triângulos grandes de verdade. No ExtrudeGeometry, o
    // grupo 1 são as paredes; o sweep fechado não tem tampa
    const paredes = o.geometry.groups[1] ?? { start: 0, count: idx ? idx.count : uv.count };
    for (let k = paredes.start; k < paredes.start + paredes.count; k += 3) {
      const ids = [0, 1, 2].map((j) => (idx ? idx.getX(k + j) : k + j));
      const us = ids.map((i) => uv.getX(i)), vs = ids.map((i) => uv.getY(i));
      // (v pode ir de 0 a 1 num triângulo só: a parede de um extrude é um quad inteiro)
      assert.ok(Math.max(...us) - Math.min(...us) < 0.6, `${o.name}: triângulo ${k / 3} atravessa a costura (${us} / ${vs})`);
    }
  });
});

test("adesivos e textura: round-trip de JSON e schema", () => {
  const cena = new Cena();
  cena.criar("cylinder", { raioTopo: 0.03, raioBase: 0.03, altura: 0.1 }, {
    material: { textura: { src: "lata.png", repetir: [2, 1] } },
  }).colarAdesivo({ src: "r.png", face: "lateral", largura: 0.05 }).colarAdesivo({ src: "t.png", face: "+y" });
  const json = cena.toJSON();
  const schema = JSON.parse(readFileSync(new URL("../spec/cena.schema.json", import.meta.url), "utf8"));
  const valida = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  assert.ok(valida(json), JSON.stringify(valida.errors, null, 2));
  assert.deepEqual(Cena.deJSON(json).toJSON(), json);
});

test("adesivo na lateral de peça oca: fica na parede de FORA, não se divide com a de dentro", () => {
  const cena = new Cena();
  // caneca: sobe por fora, desce por dentro — a faixa do logo cruza as duas
  const caneca = cena.criar("lathe", {
    perfil: [[0.001, 0], [0.04, 0], [0.042, 0.005], [0.042, 0.1], [0.038, 0.1], [0.038, 0.008], [0.001, 0.008]],
    recentrar: false,
  }).colarAdesivo({ src: "logo.png", face: "lateral", v: 0.05, altura: 0.05 });
  const [a] = derivarAdesivos(caneca.no) as AdesivoRevolucao[];
  assert.ok(a!.perfil.every((p) => perto(p[0], 0.042 + AFASTAMENTO_ADESIVO, 1e-9)), JSON.stringify(a!.perfil));
  assert.ok(pertoV(a!.perfil.map((p) => p[1]), [0.025, 0.075]));
});
