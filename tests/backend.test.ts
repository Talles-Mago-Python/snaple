import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Cena } from "@snaple/core";
import { construirCena } from "@snaple/three";
import { salaDeJantar } from "./cena-exemplo.ts";

/** O teste que impede o backend de divergir do core: para cada nó, a bbox que
 * o Three.js mede na malha construída tem de bater com a que o core calculou
 * a partir dos parâmetros. Se as convenções (eixo, centragem, rotação da
 * extrusão) saírem de sincronia, é aqui que aparece — em Node, sem GPU. */
/** AABB da malha do próprio Mesh, em coordenadas do mundo.
 * `Box3.setFromObject` não serve: ele percorre os descendentes, então a caixa
 * do tampo viria com as pernas e a xícara dentro. */
function caixaPropria(mesh: THREE.Mesh): THREE.Box3 {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
}

async function conferirBboxes(cena: Cena, tolerancia = 1e-6): Promise<string[]> {
  const { objeto, avisos } = await construirCena(cena, { carregarModelo: async () => null });
  objeto.updateMatrixWorld(true);
  const porId = new Map<string, THREE.Object3D>();
  objeto.traverse((o) => {
    const meta = o.userData.snaple as { id?: string } | undefined;
    if (meta?.id) porId.set(meta.id, o);
  });

  const divergencias: string[] = [];
  for (const m of cena.nosGeometricos()) {
    const alvo = porId.get(m.no.id);
    assert.ok(alvo, `backend não produziu objeto para '${m.no.id}'`);
    const caixa = new THREE.Box3();
    // só a geometria PRÓPRIA do nó: ignora os filhos, como bboxPropria()
    if (alvo instanceof THREE.Mesh) caixa.union(caixaPropria(alvo));
    else for (const filho of alvo.children) {
      // nó fatiado por furo parcial: as fatias são Meshes filhas sem userData
      if (filho instanceof THREE.Mesh && !filho.userData.snaple) {
        caixa.union(caixaPropria(filho));
      }
    }
    if (caixa.isEmpty()) continue;
    const esperado = m.propria!;
    for (const i of [0, 1, 2]) {
      const eixo = "xyz"[i]!;
      const min = caixa.min.getComponent(i);
      const max = caixa.max.getComponent(i);
      if (Math.abs(min - esperado.min[i]!) > tolerancia || Math.abs(max - esperado.max[i]!) > tolerancia) {
        divergencias.push(
          `${m.no.id}.${eixo}: three=[${min}, ${max}] core=[${esperado.min[i]}, ${esperado.max[i]}]`,
        );
      }
    }
  }
  return [...divergencias, ...avisos.filter((a) => a.motivo === "geometria-falhou").map((a) => a.texto)];
}

test("a malha do backend bate com a bbox que o core calculou (sala de jantar)", async () => {
  const { cena } = salaDeJantar();
  assert.deepEqual(await conferirBboxes(cena), []);
});

test("a malha do backend bate com a bbox do core em todas as primitivas", async () => {
  const cena = new Cena();
  cena.criar("box", { largura: 1.2, altura: 0.4, profundidade: 0.8 }, { transform: { posicao: [1, 2, 3] } });
  cena.criar("sphere", { raio: 0.6 }, { transform: { posicao: [-2, 1, 0] } });
  cena.criar("cylinder", { raioTopo: 0.3, raioBase: 0.3, altura: 1.1 }, { transform: { posicao: [0, 3, 0] } });
  cena.criar("cone", { raio: 0.4, altura: 0.9 }, { transform: { posicao: [2, 0, -1] } });
  cena.criar("plane", { largura: 4, profundidade: 2.5 });
  cena.criar("torus", { raio: 0.5, raioTubo: 0.12 }, { transform: { posicao: [0, 1, 4] } });
  cena.criar("extrude", { perfil: [[0, 0], [0.6, 0], [0.6, 0.4], [0.3, 0.7], [0, 0.4]], altura: 0.25 },
    { transform: { posicao: [-3, 0, 2] } });
  cena.criar("lathe", { perfil: [[0.001, 0], [0.25, 0.05], [0.15, 0.3], [0.2, 0.5], [0.001, 0.52]] },
    { transform: { posicao: [4, 0, 0] } });
  // tolerância maior: as primitivas curvas do Three.js são polígonos, e a
  // bbox medida é a do polígono inscrito, não a da curva ideal
  const div = await conferirBboxes(cena, 0.01);
  assert.deepEqual(div, []);
});

test("a malha do backend bate com a bbox do core em nós girados e escalados", async () => {
  const cena = new Cena();
  const pai = cena.criar("grupo", {}, { transform: { posicao: [1, 0, -2], rotacao: [0, Math.PI / 3, 0] } });
  pai.criar("box", { largura: 1, altura: 2, profundidade: 0.5 },
    { transform: { posicao: [0.5, 1, 0], rotacao: [Math.PI / 6, 0, Math.PI / 4], escala: [1.5, 1, 0.8] } });
  assert.deepEqual(await conferirBboxes(cena), []);
});

test("a malha de um nó furado bate com a bbox do core", async () => {
  const cena = new Cena();
  const placa = cena.criar("box", { largura: 0.4, altura: 0.02, profundidade: 0.3 },
    { transform: { posicao: [0, 0.5, 0] } });
  placa.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.05, segmentos: 64 }, u: 0.1, v: -0.05 });
  const bloco = cena.criar("box", { largura: 0.2, altura: 0.1, profundidade: 0.2 },
    { transform: { posicao: [1, 0.05, 0] } });
  bloco.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.02 }, u: 0, v: 0, profundidade: 0.04 });
  const lateral = cena.criar("box", { largura: 0.3, altura: 0.2, profundidade: 0.1 },
    { transform: { posicao: [-1, 0.1, 0] } });
  lateral.furar({ face: "leste", forma: { tipo: "retangulo", largura: 0.04, altura: 0.06 }, u: 0, v: 0 });
  assert.deepEqual(await conferirBboxes(cena, 1e-5), []);
});

test("o backend recusa uma cena de versão ou eixo desconhecidos", async () => {
  const { cena } = salaDeJantar();
  const json = cena.toJSON();
  await assert.rejects(
    () => construirCena({ ...json, version: 2 } as never),
    /versão de cena não suportada/,
  );
  await assert.rejects(
    () => construirCena({ ...json, eixoCima: "z" } as never),
    /só entende cenas Y-up/,
  );
});
