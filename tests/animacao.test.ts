import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import * as THREE from "three";
import { Cena, amostrarAnimacao, tempoNoCiclo, type Animacao, type Vec3 } from "@snaple/core";
import { construirCena } from "@snaple/three";

const perto = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;
const pertoV = (a: readonly number[], b: readonly number[], tol = 1e-9) =>
  a.length === b.length && a.every((x, i) => perto(x, b[i]!, tol));

function cenaComCaixa(): { cena: Cena; caixa: ReturnType<Cena["criar"]> } {
  const cena = new Cena();
  const caixa = cena.criar("box", { largura: 0.2, altura: 0.2, profundidade: 0.2 }, { id: "caixa" });
  return { cena, caixa };
}

test("animação: linear, suave e degrau entre quadros; antes do primeiro e depois do último", () => {
  const { cena, caixa } = cenaComCaixa();
  cena.animar("lin").faixa(caixa, "posicao", [[1, [0, 0, 0]], [3, [2, 0, 0]]]);
  cena.animar("suave").faixa(caixa, "posicao", [[0, [0, 0, 0]], [2, [2, 0, 0]]], { interpolacao: "suave" });
  cena.animar("degrau").faixa(caixa, "posicao", [[0, [0, 0, 0]], [2, [2, 0, 0]]], { interpolacao: "degrau" });
  const x = (nome: string, t: number) => cena.poseEm(nome, t).no("caixa").transform.posicao[0];
  assert.equal(x("lin", 0), 0); // antes do primeiro quadro: vale o primeiro
  assert.ok(perto(x("lin", 2), 1));
  assert.equal(x("lin", 3), 2);
  assert.ok(perto(x("suave", 0.5), 2 * (0.25 * 0.25 * (3 - 0.5)))); // smoothstep(0,25)
  assert.ok(perto(x("suave", 1), 1));
  assert.equal(x("degrau", 1.99), 0);
  assert.equal(x("degrau", 2), 2);
});

test("animação: rotação interpola pelo menor arco (slerp) entre orientações", () => {
  const { cena, caixa } = cenaComCaixa();
  cena.animar("girar").faixa(caixa, "rotacao", [[0, [0, 0, 0]], [1, [0, Math.PI / 2, 0]]]);
  assert.ok(pertoV(cena.poseEm("girar", 0.5).no("caixa").transform.rotacao, [0, Math.PI / 4, 0]));
  // de +170° a −170° em z: o menor arco passa por 180°, não por 0°
  cena.animar("curto").faixa(caixa, "rotacao", [[0, [0, 0, (170 * Math.PI) / 180]], [1, [0, 0, (-170 * Math.PI) / 180]]]);
  const z = cena.poseEm("curto", 0.5).no("caixa").transform.rotacao[2];
  assert.ok(perto(Math.abs(z), Math.PI, 1e-6), `z = ${z}`);
});

test("animação: relativo soma à pose em repouso (posição, ângulo), multiplica escala e compõe rotação", () => {
  const cena = new Cena();
  const junta = cena.criar("junta", { eixo: "y", angulo: 0.5 }, { id: "j" });
  const caixa = junta.criar("box", { largura: 1, altura: 1, profundidade: 1 }, {
    id: "c", transform: { posicao: [1, 2, 3], rotacao: [0, Math.PI / 2, 0], escala: [2, 2, 2] },
  });
  cena.animar("rel")
    .faixa(caixa, "posicao", [[0, [0, 0, 0]], [1, [0, 0, 0.3]]], { relativo: true })
    .faixa(caixa, "escala", [[0, [1, 1, 1]], [1, [0.5, 1, 1]]], { relativo: true })
    .faixa(caixa, "rotacao", [[0, [0, 0, 0]], [1, [Math.PI / 2, 0, 0]]], { relativo: true })
    .faixa(junta, "angulo", [[0, 0], [1, 1]], { relativo: true });
  const p = cena.poseEm("rel", 1);
  assert.ok(pertoV(p.no("c").transform.posicao, [1, 2, 3.3]));
  assert.ok(pertoV(p.no("c").transform.escala, [1, 2, 2]));
  assert.equal((p.no("j").params as { angulo: number }).angulo, 1.5);
  // compor no referencial do nó: primeiro o repouso (90° em y), depois 90°
  // em x LOCAL — o eixo x local já foi levado para −z pelo giro em y
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...p.no("c").transform.rotacao, "XYZ"));
  const esperado = new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  assert.ok(pertoV(m.elements, esperado.elements, 1e-9));
  // e o original não mudou
  assert.deepEqual(cena.no("c").transform.posicao, [1, 2, 3]);
});

test("animação: repetir 'nao' para no fim, 'sempre' recomeça, 'vaivem' volta", () => {
  const a = (repetir: Animacao["repetir"]): Animacao => ({ nome: "x", duracao: 2, repetir, faixas: [] });
  assert.equal(tempoNoCiclo(a("nao"), 5), 2);
  assert.equal(tempoNoCiclo(a("sempre"), 5), 1);
  assert.equal(tempoNoCiclo(a("vaivem"), 3), 1);
  assert.equal(tempoNoCiclo(a("vaivem"), 4.5), 0.5);
});

test("poseEm: a cena no instante t tem bbox, faces e linter próprios, sem mexer na original", () => {
  const { cena, caixa } = cenaComCaixa();
  cena.animar("subir").faixa(caixa, "posicao", [[0, [0, 0.1, 0]], [1, [0, 1.1, 0]]]);
  const meio = cena.poseEm("subir", 0.5);
  assert.ok(perto(meio.bbox("caixa").centro[1], 0.6));
  assert.ok(perto(meio.ref("caixa").face("base").origemMundo()[1], 0.5));
  assert.ok(perto(cena.bbox("caixa").centro[1], 0));
});

test("conferirAnimacao: acha a colisão que só acontece NO MEIO do movimento", () => {
  const cena = new Cena();
  cena.criar("box", { largura: 0.1, altura: 1, profundidade: 1 }, { id: "parede", transform: { posicao: [0, 0.5, 0] } });
  const bloco = cena.criar("box", { largura: 0.2, altura: 0.2, profundidade: 0.2 }, {
    id: "bloco", transform: { posicao: [-0.5, 0.1, 0] },
  });
  // atravessa a parede e para do outro lado: início e fim estão livres
  cena.animar("atravessar", { duracao: 2 }).faixa(bloco, "posicao", [[0, [-0.5, 0.1, 0]], [2, [0.5, 0.1, 0]]]);
  assert.equal(cena.avisos().filter((a) => a.tipo === "interpenetracao").length, 0);
  const r = cena.conferirAnimacao("atravessar", { amostras: 20 });
  assert.ok(r.length > 0);
  for (const { t, avisos } of r) {
    assert.ok(t > 0.5 && t < 1.5, `colisão fora do trecho esperado: t=${t}`);
    assert.ok(avisos.some((a) => a.tipo === "interpenetracao"));
  }
  assert.match(cena.conferirAnimacaoTexto("atravessar"), /^t=\d\.\d\d s: .*penetra/m);
});

test("conferirAnimacao: junta que passa do limite durante o movimento", () => {
  const cena = new Cena();
  const j = cena.criar("junta", { eixo: "z", angulo: 0, limites: [-0.5, 0.5] });
  cena.animar("bater").faixa(j, "angulo", [[0, 0], [1, 1]]);
  const r = cena.conferirAnimacao("bater");
  assert.ok(r.some(({ avisos }) => avisos.some((a) => a.tipo === "junta-fora-do-limite")));
  assert.ok(r.every(({ t }) => t > 0.5 - 1e-9));
});

test("animação: faixas inválidas viram erro claro e não são gravadas", () => {
  const { cena, caixa } = cenaComCaixa();
  const a = cena.animar("a");
  assert.throws(() => a.faixa(caixa, "angulo", [[0, 0]]), /só existe em nós 'junta'/);
  assert.throws(() => a.faixa(caixa, "posicao", [[1, [0, 0, 0]], [0.5, [1, 0, 0]]]), /ordem crescente/);
  assert.throws(() => a.faixa(caixa, "cor", [[0, "vermelho"]]), /#rrggbb/);
  assert.throws(() => a.faixa(caixa, "opacidade", [[0, 2]]), /entre 0 e 1/);
  assert.throws(() => a.faixa(caixa, "cor", [[0, "#ff0000"]], { relativo: true }), /relativo/);
  assert.throws(() => a.faixa("nao-existe", "posicao", [[0, [0, 0, 0]]]), /não existe/);
  assert.throws(() => cena.animar("a"), /já existe/);
  assert.throws(() => cena.animar("b", { duracao: 0 }), /duracao/);
  assert.equal(cena.animacao("a").faixas.length, 0);
});

test("animação: remover um nó tira as faixas dele; JSON faz round-trip e valida no schema", () => {
  const { cena, caixa } = cenaComCaixa();
  const outra = cena.criar("sphere", { raio: 0.1 }, { id: "bola" });
  cena.animar("tudo", { repetir: "vaivem" })
    .faixa(caixa, "cor", [[0, "#ff0000"], [1, "#0000ff"]])
    .faixa(outra, "opacidade", [[0, 1], [1, 0]], { interpolacao: "degrau" });
  const json = cena.toJSON();
  const schema = JSON.parse(readFileSync(new URL("../spec/cena.schema.json", import.meta.url), "utf8"));
  const valida = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  assert.ok(valida(json), JSON.stringify(valida.errors, null, 2));
  assert.deepEqual(Cena.deJSON(json).toJSON(), json);

  cena.remover(outra);
  assert.deepEqual(cena.animacao("tudo").faixas.map((f) => f.no), ["caixa"]);
  // cor interpola em RGB
  assert.equal(cena.poseEm("tudo", 0.5).no("caixa").material?.cor, "#800080");
});

test("amostrarAnimacao: degrau usa só os quadros; o resto, a grade + os quadros exatos", () => {
  const { cena, caixa } = cenaComCaixa();
  cena.animar("x").faixa(caixa, "posicao", [[0, [0, 0, 0]], [0.25, [1, 0, 0]], [1, [0, 0, 0]]])
    .faixa(caixa, "opacidade", [[0, 1], [0.5, 0]], { interpolacao: "degrau" });
  const a = amostrarAnimacao(cena.animacao("x"), (id) => cena.no(id), 10);
  const [pos, op] = a.faixas;
  assert.equal(a.duracao, 1);
  assert.deepEqual(op!.tempos, [0, 0.5]);
  assert.ok(op!.discreto);
  assert.ok(pos!.tempos.includes(0.25));
  assert.equal(pos!.tempos.length, 12); // 0, 0.1 … 1 + o quadro em 0.25
});

// ── backend ──────────────────────────────────────────────────────────────

test("backend: o clipe reproduz a pose que o core calcula, em qualquer instante", async () => {
  const cena = new Cena();
  const junta = cena.criar("junta", { eixo: "x", angulo: 0 }, { id: "j", transform: { posicao: [0, 1, 0] } });
  const tampa = junta.criar("box", { largura: 0.4, altura: 0.02, profundidade: 0.4 }, { id: "tampa", transform: { posicao: [0, 0, 0.2] } });
  const bola = cena.criar("sphere", { raio: 0.1 }, { id: "bola" });
  cena.animar("demo", { duracao: 2, repetir: "sempre" })
    .faixa(junta, "angulo", [[0, 0], [2, -4]]) // mais de meia volta: tem de girar o caminho todo
    .faixa(bola, "rotacao", [[0, [0, 0, 0]], [1, [0.3, 1.2, -0.4]], [2, [0, 0, 0]]], { interpolacao: "suave" })
    .faixa(bola, "posicao", [[0, [0, 0, 0]], [2, [1, 0.5, 0]]]);
  const { objeto, animacoes } = await construirCena(cena);
  assert.equal(animacoes.length, 1);
  const mixer = new THREE.AnimationMixer(objeto);
  mixer.clipAction(animacoes[0]!.clip).play();
  const achar = (id: string) => {
    let r: THREE.Object3D | undefined;
    objeto.traverse((o) => { if (o.userData.snaple?.id === id) r = o; });
    return r!;
  };
  for (const t of [0.13, 0.5, 0.77, 1.31, 1.9]) {
    mixer.setTime(t);
    objeto.updateMatrixWorld(true);
    const pose = cena.poseEm("demo", t);
    // a tampa (filha da junta) está onde o core diz que ela está
    const centro = new THREE.Box3().setFromObject(achar("tampa")).getCenter(new THREE.Vector3());
    assert.ok(pertoV(centro.toArray(), pose.bbox(tampa.id).centro, 2e-3), `tampa em t=${t}`);
    const qCore = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(pose.no("bola").transform.rotacao as Vec3), "XYZ"));
    assert.ok(Math.abs(Math.abs(qCore.dot(achar("bola").quaternion)) - 1) < 1e-4, `bola em t=${t}`);
    assert.ok(pertoV(achar("bola").position.toArray(), pose.no("bola").transform.posicao, 1e-6));
  }
});

test("backend: animar a opacidade de um nó não apaga os outros que dividiam o material", async () => {
  const cena = new Cena();
  const a = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { id: "a", material: { cor: "#336699" } });
  cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { id: "b", material: { cor: "#336699" }, transform: { posicao: [2, 0, 0] } });
  cena.animar("sumir").faixa(a, "opacidade", [[0, 1], [1, 0]]);
  const { objeto, animacoes } = await construirCena(cena);
  const malhas = new Map<string, THREE.Mesh>();
  objeto.traverse((o) => { if (o instanceof THREE.Mesh) malhas.set(o.userData.snaple.id, o); });
  assert.notEqual(malhas.get("a")!.material, malhas.get("b")!.material);
  const mixer = new THREE.AnimationMixer(objeto);
  mixer.clipAction(animacoes[0]!.clip).play();
  mixer.setTime(0.5);
  assert.ok(perto((malhas.get("a")!.material as THREE.Material).opacity, 0.5, 1e-6));
  assert.equal((malhas.get("b")!.material as THREE.Material).opacity, 1);
});
