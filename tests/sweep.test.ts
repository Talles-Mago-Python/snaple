import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import * as THREE from "three";
import {
  Cena, ErroFeature, perfilI, perfilL, perfilT, perfilU, resolverVarredura, verticeDoAnel,
  type AnelVarredura, type GeometriaVarredura, type ParamsSweep, type Ponto2D, type Vec3,
} from "@snaple/core";
import { construirCena } from "@snaple/three";

/** Um de cada: canto vivo aberto em 3D, quadro fechado oco, cano dobrado,
 * fio suave aberto e fechado (não plano), perfis estruturais. */
const CASOS: Record<string, ParamsSweep> = {
  cantosVivos3D: {
    caminho: [[0, 0, 0], [0.5, 0, 0], [0.5, 0.3, 0.2], [0.1, 0.6, 0.4]],
    secao: { tipo: "retangulo", largura: 0.04, altura: 0.02 },
  },
  quadroOco: {
    caminho: [[0, 0, 0], [1, 0, 0], [1, 0, 0.5], [0, 0, 0.5]], fechado: true,
    secao: { tipo: "retangulo", largura: 0.02, altura: 0.02, espessura: 0.002 },
  },
  canoDobrado: {
    caminho: [[0, 0, 0], [1, 0, 0], [1, 0.5, 0], [1, 0.5, 1]], raioCurva: 0.15,
    secao: { tipo: "circulo", raio: 0.02, espessura: 0.003 },
  },
  fio: {
    caminho: [[0, 0, 0], [0.3, 0.2, 0.1], [0.6, -0.1, 0.3], [1, 0.1, 0]], suavizar: true,
    secao: { tipo: "circulo", raio: 0.004 },
  },
  anelTorto: {
    caminho: [[1, 0, 0], [0, 0.8, 0.6], [-0.7, 0.2, -0.5], [0.3, -0.6, -0.4], [0.9, 0.5, -0.8]],
    suavizar: true, fechado: true,
    secao: { tipo: "poligono", pontos: perfilT(0.05, 0.04, 0.008) },
  },
  cantoneiraDobrada: {
    caminho: [[0, 0, 0], [0.6, 0, 0], [0.6, 0, 0.6]], cima: [0, 0, -1],
    secao: { tipo: "poligono", pontos: perfilL(0.05, 0.05, 0.005) },
  },
};

function cenaCom(casos: Record<string, ParamsSweep>): Cena {
  const cena = new Cena();
  Object.entries(casos).forEach(([id, p], i) =>
    cena.criar("sweep", p, { id, transform: { posicao: [i * 2, 0, 0], rotacao: [0.3 * i, 0.2, 0] } }));
  return cena;
}

async function malhas(cena: Cena): Promise<Map<string, THREE.Mesh>> {
  const { objeto, avisos } = await construirCena(cena);
  assert.deepEqual(avisos, []);
  objeto.updateMatrixWorld(true);
  const porId = new Map<string, THREE.Mesh>();
  objeto.traverse((o) => {
    const id = (o.userData.snaple as { id?: string } | undefined)?.id;
    if (id && o instanceof THREE.Mesh) porId.set(id, o);
  });
  return porId;
}

test("sweep: a malha do backend tem EXATAMENTE a bbox que o core calculou", async () => {
  const cena = cenaCom(CASOS);
  for (const [id, mesh] of await malhas(cena)) {
    const medida = new THREE.Box3().setFromObject(mesh);
    const esperada = cena.bboxPropria(id);
    for (const i of [0, 1, 2]) {
      assert.ok(Math.abs(medida.min.getComponent(i) - esperada.min[i]!) < 1e-6, `${id}.min[${i}]`);
      assert.ok(Math.abs(medida.max.getComponent(i) - esperada.max[i]!) < 1e-6, `${id}.max[${i}]`);
    }
  }
});

test("sweep: medidas conhecidas — moldura, cano dobrado, orientação da seção", () => {
  const cena = new Cena();
  // moldura 1 × 0.5 no plano XZ, metalon 2 cm: bbox = linha de centro + 2 cm
  const moldura = cena.criar("sweep", CASOS.quadroOco!);
  assert.deepEqual(moldura.bbox().tamanho.map((x) => +x.toFixed(12)), [1.02, 0.02, 0.52]);
  // cano em L com dobra: começa em x=0 (tampa), perna final em x=1 ± raio
  const cano = cena.criar("sweep", {
    caminho: [[0, 0, 0], [1, 0, 0], [1, 0, 1]], raioCurva: 0.2, secao: { tipo: "circulo", raio: 0.01 },
  });
  assert.deepEqual(cano.bbox().tamanho.map((x) => +x.toFixed(12)), [1.01, 0.02, 1.01]);
  // caminho em +x, cima +y: s (largura) vai para ±z, t (altura) para ±y
  const barra = cena.criar("sweep", {
    caminho: [[0, 0, 0], [1, 0, 0]], secao: { tipo: "retangulo", largura: 0.2, altura: 0.1 },
  });
  assert.deepEqual(barra.bbox().tamanho.map((x) => +x.toFixed(12)), [1, 0.1, 0.2]);
});

test("sweep: recentrar:false mantém o caminho nas coordenadas dadas", () => {
  const cena = new Cena();
  const fio = cena.criar("sweep", {
    caminho: [[1, 2, 3], [2, 2, 3]], recentrar: false, secao: { tipo: "circulo", raio: 0.1 },
  });
  const c = fio.bbox();
  assert.deepEqual(c.min.map((x) => +x.toFixed(12)), [1, 1.9, 2.9]);
  assert.deepEqual(c.max.map((x) => +x.toFixed(12)), [2, 2.1, 3.1]);
  // e recentrado (padrão), a mesma peça fica centrada na origem do nó
  const centrado = cena.criar("sweep", { caminho: [[1, 2, 3], [2, 2, 3]], secao: { tipo: "circulo", raio: 0.1 } });
  assert.deepEqual(centrado.bbox().centro.map((x) => +x.toFixed(12)), [0, 0, 0]);
});

test("sweep: nas juntas de canto vivo, os anéis dos dois lados coincidem (sem fresta)", () => {
  for (const nome of ["cantosVivos3D", "quadroOco", "cantoneiraDobrada"] as const) {
    const r = resolverVarredura(CASOS[nome]!);
    const n = r.trechos.length;
    const juntas = CASOS[nome]!.fechado ? n : n - 1;
    for (let k = 0; k < juntas; k++) {
      const fim = r.trechos[k]!.aneis[1]!, ini = r.trechos[(k + 1) % n]!.aneis[0]!;
      for (const p of r.secao.contorno) {
        const a = verticeDoAnel(fim, p), b = verticeDoAnel(ini, p);
        assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-12, `${nome}: junta ${k} abre`);
      }
    }
  }
});

/** Torção entre dois anéis consecutivos: quanto `v` girou em torno da
 * tangente além do que o transporte paralelo explicaria. */
function torcao(a: AnelVarredura, b: AnelVarredura): number {
  const t1 = new THREE.Vector3(...a.tangente), t2 = new THREE.Vector3(...b.tangente);
  const eixo = new THREE.Vector3().crossVectors(t1, t2);
  const v = new THREE.Vector3(...a.v);
  const seno = eixo.length();
  if (seno > 1e-12) v.applyAxisAngle(eixo.normalize(), Math.atan2(seno, t1.dot(t2)));
  const vb = new THREE.Vector3(...b.v);
  return Math.atan2(new THREE.Vector3().crossVectors(v, vb).dot(t2), v.dot(vb));
}

test("sweep fechado não plano: a correção de torção se espalha por igual, sem degrau na costura", () => {
  const r = resolverVarredura(CASOS.anelTorto!);
  const aneis = r.trechos[0]!.aneis;
  const torcoes = aneis.map((a, i) => torcao(a, aneis[(i + 1) % aneis.length]!));
  // o anel é torto de verdade: sem correção a costura teria um degrau
  assert.ok(Math.abs(torcoes[0]!) > 1e-6, "caso de teste devia ter holonomia");
  for (const t of torcoes) assert.ok(Math.abs(t - torcoes[0]!) < 1e-9, `torções desiguais: ${t} vs ${torcoes[0]}`);
});

test("sweep: toda face aponta para fora (winding bate com as normais)", async () => {
  const cena = cenaCom(CASOS);
  for (const [id, mesh] of await malhas(cena)) {
    const pos = mesh.geometry.getAttribute("position"), nor = mesh.geometry.getAttribute("normal");
    const idx = mesh.geometry.index!;
    const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i);
    const n = (i: number) => new THREE.Vector3().fromBufferAttribute(nor, i);
    let invertidas = 0;
    for (let k = 0; k < idx.count; k += 3) {
      const [a, b, c] = [idx.getX(k), idx.getX(k + 1), idx.getX(k + 2)];
      const face = new THREE.Vector3().crossVectors(v(b).sub(v(a)), v(c).sub(v(a)));
      if (face.lengthSq() < 1e-20) continue; // triângulo degenerado
      if (face.dot(n(a).add(n(b)).add(n(c))) < 0) invertidas++;
    }
    assert.equal(invertidas, 0, `'${id}': ${invertidas} triângulos virados para dentro`);
  }
});

test("sweep: normais de um cano reto apontam para longe do eixo (e para dentro do furo)", async () => {
  const cena = new Cena();
  cena.criar("sweep", { caminho: [[0, 0, 0], [1, 0, 0]], secao: { tipo: "circulo", raio: 0.1, espessura: 0.02 } },
    { id: "cano" });
  const mesh = (await malhas(cena)).get("cano")!;
  const pos = mesh.geometry.getAttribute("position"), nor = mesh.geometry.getAttribute("normal");
  for (let i = 0; i < pos.count; i++) {
    const n = new THREE.Vector3().fromBufferAttribute(nor, i);
    if (Math.abs(n.x) > 0.5) continue; // tampas (anel das pontas)
    const radial = new THREE.Vector3(0, pos.getY(i), pos.getZ(i));
    const externo = radial.length() > 0.09;
    const d = n.dot(radial.normalize());
    assert.ok(externo ? d > 0.99 : d < -0.99, `vértice ${i}: normal ${n.toArray()} na parede ${externo ? "externa" : "interna"}`);
  }
});

test("sweep: params impossíveis viram erro claro na geometria, sem derrubar o layout", async () => {
  const cena = new Cena();
  const dobraGrande = cena.criar("sweep", {
    caminho: [[0, 0, 0], [0.1, 0, 0], [0.1, 0, 0.1]], raioCurva: 1, secao: { tipo: "circulo", raio: 0.01 },
  });
  assert.throws(() => dobraGrande.geometria(), /raioCurva.*não cabe/);
  // o layout continua funcionando: a bbox cai para a caixa do caminho
  assert.deepEqual(dobraGrande.bbox().tamanho.map((x) => +x.toFixed(12)), [0.1, 0, 0.1]);

  const volta = cena.criar("sweep", { caminho: [[0, 0, 0], [1, 0, 0], [0, 0, 0.0]], secao: { tipo: "circulo", raio: 0.01 } });
  assert.throws(() => volta.geometria(), /180°/);
  const paredeGrossa = cena.criar("sweep", {
    caminho: [[0, 0, 0], [1, 0, 0]], secao: { tipo: "circulo", raio: 0.01, espessura: 0.01 },
  });
  assert.throws(() => paredeGrossa.geometria(), /espessura/);
  const umPonto = cena.criar("sweep", { caminho: [[0, 0, 0], [0, 0, 0]], secao: { tipo: "circulo", raio: 0.01 } });
  assert.throws(() => umPonto.geometria(), /2 pontos distintos/);

  // o backend avisa em vez de lançar, como com qualquer geometria que falha
  const { avisos } = await construirCena(cena);
  assert.equal(avisos.filter((a) => a.motivo === "geometria-falhou").length, 4);
});

test("sweep: furo não é suportado e diz por quê", () => {
  const cena = new Cena();
  const barra = cena.criar("sweep", { caminho: [[0, 0, 0], [1, 0, 0]], secao: { tipo: "retangulo", largura: 0.1, altura: 0.1 } });
  assert.throws(
    () => barra.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.01 }, u: 0, v: 0 }),
    (e: unknown) => e instanceof ErroFeature && e.motivo === "geometria-nao-extrudavel",
  );
});

test("sweep: editar params atualiza a bbox (o cache é pelo conteúdo, não pelo objeto)", () => {
  const cena = new Cena();
  const fio = cena.criar("sweep", { caminho: [[0, 0, 0], [1, 0, 0]], secao: { tipo: "circulo", raio: 0.01 } });
  assert.equal(+fio.bbox().tamanho[1].toFixed(12), 0.02);
  fio.definirParams({ secao: { tipo: "circulo", raio: 0.05 } });
  assert.equal(+fio.bbox().tamanho[1].toFixed(12), 0.1);
  // a geometria devolvida é uma cópia: mexer nela não suja o cache
  const g = fio.geometria() as GeometriaVarredura;
  g.trechos[0]!.aneis[0]!.ponto = [99, 99, 99];
  assert.notDeepEqual((fio.geometria() as GeometriaVarredura).trechos[0]!.aneis[0]!.ponto, [99, 99, 99]);
});

test("sweep: valida contra o JSON Schema do spec", () => {
  const schema = JSON.parse(readFileSync(new URL("../spec/cena.schema.json", import.meta.url), "utf8"));
  const valida = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  const cena = cenaCom(CASOS);
  assert.ok(valida(cena.toJSON()), JSON.stringify(valida.errors, null, 2));
  const json = cena.toJSON() as unknown as { raiz: { filhos: { params: { secao: unknown } }[] } };
  json.raiz.filhos[0]!.params.secao = { tipo: "estrela", raio: 1 };
  assert.equal(valida(json), false, "o schema devia rejeitar uma seção desconhecida");
});

function area(pts: readonly Ponto2D[]): number {
  let s = 0;
  pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]!; s += a[0] * b[1] - b[0] * a[1]; });
  return s / 2;
}

test("perfis estruturais: anti-horários, centrados, com a área certa", () => {
  const casos: [string, Ponto2D[], number][] = [
    ["L", perfilL(0.05, 0.04, 0.005), 0.05 * 0.005 + (0.04 - 0.005) * 0.005],
    ["U", perfilU(0.06, 0.04, 0.004), 0.06 * 0.004 + 2 * (0.04 - 0.004) * 0.004],
    ["I", perfilI(0.08, 0.12, 0.006, 0.01), 2 * 0.08 * 0.01 + (0.12 - 0.02) * 0.006],
    ["T", perfilT(0.08, 0.06, 0.006, 0.01), 0.08 * 0.01 + (0.06 - 0.01) * 0.006],
  ];
  for (const [nome, pts, esperada] of casos) {
    assert.ok(Math.abs(area(pts) - esperada) < 1e-12, `${nome}: área ${area(pts)} ≠ ${esperada}`);
    const us = pts.map((p) => p[0]), vs = pts.map((p) => p[1]);
    assert.ok(Math.abs(Math.min(...us) + Math.max(...us)) < 1e-12, `${nome} não centrado em s`);
    assert.ok(Math.abs(Math.min(...vs) + Math.max(...vs)) < 1e-12, `${nome} não centrado em t`);
  }
  assert.throws(() => perfilL(0.05, 0.05, 0.05), /espessura/);
});

test("sweep: a bbox acompanha a peça mesmo com o nó girado no mundo", () => {
  const cena = new Cena();
  const p: ParamsSweep = CASOS.cantoneiraDobrada!;
  const no = cena.criar("sweep", p, { transform: { rotacao: [0.4, 1.1, -0.3] } });
  const r = resolverVarredura(p);
  const m = cena.mundo().get(no.id)!.matriz;
  const mundo = new THREE.Matrix4().fromArray(m);
  const caixa = new THREE.Box3();
  for (const t of r.trechos) for (const a of t.aneis) for (const s of r.secao.contorno) {
    caixa.expandByPoint(new THREE.Vector3(...(verticeDoAnel(a, s) as Vec3)).applyMatrix4(mundo));
  }
  const b = no.bbox();
  for (const i of [0, 1, 2]) {
    // AABB mundial da caixa local (inflada): contém os vértices reais girados
    assert.ok(b.min[i]! <= caixa.min.getComponent(i) + 1e-9 && b.max[i]! >= caixa.max.getComponent(i) - 1e-9);
  }
});
