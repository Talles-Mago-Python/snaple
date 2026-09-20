import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Cena, apontar, conectar, converter, eulerDeBase, baseDeEuler,
  aplicarPonto, inverter, multiplicar, produtoVetorial, distancia,
  type Vec3,
} from "@snaple/core";

const PI = Math.PI;

function aproxV(a: readonly number[], b: readonly number[], tol = 1e-9, msg = ""): void {
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(a[i]! - b[i]!) < tol, `${msg} [${a.join(",")}] != [${b.join(",")}] no eixo ${i}`);
  }
}

test("paraMundo/doMundo: ida e volta numa hierarquia com rotação e escala não uniforme", () => {
  const cena = new Cena();
  const a = cena.criar("grupo", {}, {
    transform: { posicao: [1, 2, 3], rotacao: [0.3, -0.5, 0.7], escala: [1.5, 0.5, 2] },
  });
  const b = a.criar("grupo", {}, {
    transform: { posicao: [-0.4, 0.2, 0.1], rotacao: [0.9, 0.1, -0.2], escala: [2, 1, 0.3] },
  });
  const c = b.criar("box", { largura: 1, altura: 1, profundidade: 1 }, {
    transform: { posicao: [0.05, -0.2, 0.6], rotacao: [-0.4, 1.1, 0.2] },
  });

  for (const no of [a, b, c]) {
    for (const p of [[0, 0, 0], [0.3, -0.7, 0.2], [-1.2, 0.5, 3.1]] as Vec3[]) {
      const mundo = no.paraMundo(p);
      const volta = no.doMundo(mundo);
      aproxV(volta, p, 1e-9, `roundtrip em '${no.no.tipo}'`);
    }
  }
});

test("converter bate com a composição manual de matrizes (não usa doMundo/paraMundo do próprio nó)", () => {
  const cena = new Cena();
  const torre = cena.criar("grupo", {}, { transform: { posicao: [0.5, 0, 0], rotacao: [0, 0.35, 0] } });
  const ombro = torre.criar("grupo", {}, { transform: { posicao: [0, 0.2, 0], rotacao: [-0.3, 0, 0] } });
  const base = cena.criar("grupo", {}, { transform: { posicao: [0, 0, -1], rotacao: [0, PI / 4, 0] } });

  const p: Vec3 = [0.02, 0.05, -0.01];
  const mundo = cena.mundo();
  const mOmbro = mundo.get(ombro.id)!.matriz;
  const mBase = mundo.get(base.id)!.matriz;
  const esperado = aplicarPonto(multiplicar(inverter(mBase), mOmbro), p);

  aproxV(converter(p, ombro, base), esperado, 1e-9);
});

test("converter recusa nós de cenas diferentes", () => {
  const c1 = new Cena();
  const c2 = new Cena();
  const a = c1.criar("grupo", {});
  const b = c2.criar("grupo", {});
  assert.throws(() => converter([0, 0, 0], a, b));
});

test("eulerDeBase(baseDeEuler(e)) reproduz a mesma BASE, incluindo em gimbal lock", () => {
  const amostras: Vec3[] = [
    [0.3, 0.7, -1.1], [0, 0, 0], [PI / 2, 0.2, -0.4],
    [0.1, PI / 2, 0.2], [1.5, -PI / 2, 2.1], [PI, -PI / 3, PI / 6],
  ];
  for (const e of amostras) {
    const b1 = baseDeEuler(e);
    const e2 = eulerDeBase(b1.ex, b1.ey, b1.ez);
    const b2 = baseDeEuler(e2);
    aproxV(b2.ex, b1.ex, 1e-6, `ex para e=${e}`);
    aproxV(b2.ey, b1.ey, 1e-6, `ey para e=${e}`);
    aproxV(b2.ez, b1.ez, 1e-6, `ez para e=${e}`);
  }
});

test("eulerDeBase(baseDeEuler(e)) reproduz os NÚMEROS longe de gimbal lock", () => {
  const amostras: Vec3[] = [[0.3, 0.7, -1.1], [0, 0, 0], [PI / 2, 0.2, -0.4]];
  for (const e of amostras) {
    const b = baseDeEuler(e);
    aproxV(eulerDeBase(b.ex, b.ey, b.ez), e, 1e-9, `e=${e}`);
  }
});

test("apontar: caso já alinhado não mexe na rotação", () => {
  const cena = new Cena();
  const no = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  no.apontar([0, 1, 0]);
  aproxV(no.transform.rotacao, [0, 0, 0]);
});

test("apontar: rotação mínima a partir da identidade (não é a mesma constante EIXO_X histórica, e é isso mesmo)", () => {
  const cena = new Cena();
  const no = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  no.apontar([1, 0, 0]);
  // Rodrigues dá a rotação MÍNIMA — sinal oposto ao EIXO_X=[0,0,PI/2] cravado
  // à mão em examples/web/cena.ts, que é uma escolha igualmente válida (só
  // importa para peças com seção assimétrica, e todas que usam EIXO_X hoje
  // são simétricas em torno do próprio eixo).
  aproxV(no.transform.rotacao, [0, 0, -PI / 2]);
  const base = baseDeEuler(no.transform.rotacao as Vec3);
  aproxV(base.ey, [1, 0, 0], 1e-9, "eixo apontado tem que bater com a direção pedida");
});

test("apontar: direção antipodal ao eixo (caso degenerado do produto vetorial)", () => {
  const cena = new Cena();
  const no = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  no.apontar([0, -1, 0]);
  const base = baseDeEuler(no.transform.rotacao as Vec3);
  aproxV(base.ey, [0, -1, 0], 1e-9);
});

test("apontar: eixo diferente do padrão (x)", () => {
  const cena = new Cena();
  const no = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  no.apontar([0, 1, 0], { eixo: "x" });
  const base = baseDeEuler(no.transform.rotacao as Vec3);
  aproxV(base.ex, [0, 1, 0], 1e-9);
});

test("apontar: direção confinada a um plano reproduz a mesma fórmula de um-eixo-só calculada à mão (caso da mola)", () => {
  const cena = new Cena();
  const no = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  const uy = 0.6, uz = 0.8; // já unitário
  no.apontar([0, uy, uz]);
  aproxV(no.transform.rotacao, [Math.atan2(uz, uy), 0, 0], 1e-9);
});

test("apontar: recusa o vetor nulo", () => {
  const cena = new Cena();
  const no = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  assert.throws(() => no.apontar([0, 0, 0]));
});

test("conectar: cylinder entre dois pontos arbitrários termina exatamente em A e B", () => {
  const cena = new Cena();
  const raiz = cena.criar("grupo", {});
  const A: Vec3 = [0.1, 0.2, -0.3];
  const B: Vec3 = [0.5, 0.9, 0.4];
  const haste = conectar(raiz, A, B, "cylinder", { raioTopo: 0.01, raioBase: 0.01 });

  assert.ok(Math.abs(distancia(A, B) - (haste.params as { altura: number }).altura) < 1e-9);
  // as duas pontas do eixo local (0,±altura/2,0), levadas ao mundo, caem em A e B
  const altura = (haste.params as { altura: number }).altura;
  const pontaA = haste.paraMundo([0, -altura / 2, 0]);
  const pontaB = haste.paraMundo([0, altura / 2, 0]);
  aproxV(pontaA, A, 1e-9);
  aproxV(pontaB, B, 1e-9);
});

test("conectar: forma {no, ponto} converte automaticamente para o referencial do pai", () => {
  const cena = new Cena();
  const torre = cena.criar("grupo", {}, { transform: { posicao: [0.2, 0, 0], rotacao: [0, 0.4, 0] } });
  const ancora = torre.criar("box", { largura: 0.01, altura: 0.01, profundidade: 0.01 }, {
    transform: { posicao: [0.03, 0.05, -0.02] },
  });
  const pai = cena.criar("grupo", {}, { transform: { posicao: [0, 0.5, 0] } });

  const pontoLocalAncora: Vec3 = [0, 0.005, 0];
  const pontoB: Vec3 = [0.1, 0.6, 0.1];
  const peca = conectar(pai, { no: ancora, ponto: pontoLocalAncora }, pontoB, "cylinder", {
    raioTopo: 0.002, raioBase: 0.002,
  });

  const aEsperadoNoMundo = ancora.paraMundo(pontoLocalAncora);
  const altura = (peca.params as { altura: number }).altura;
  aproxV(peca.paraMundo([0, -altura / 2, 0]), aEsperadoNoMundo, 1e-9);
  aproxV(peca.paraMundo([0, altura / 2, 0]), pai.paraMundo(pontoB), 1e-9);
});

test("conectar: helix — voltas descontam 2×raioTubo da distância, e a peça alcança A/B", () => {
  const cena = new Cena();
  const raiz = cena.criar("grupo", {});
  const A: Vec3 = [0.011, 0.004, -0.024];
  const B: Vec3 = [0.011, 0.14, 0.03];
  const raioTubo = 0.0008, passo = 0.0022;
  const mola = conectar(raiz, A, B, "helix", { raio: 0.0055, raioTubo, passo });

  const dist = distancia(A, B);
  const voltasEsperadas = (dist - 2 * raioTubo) / passo;
  assert.ok(Math.abs((mola.params as { voltas: number }).voltas - voltasEsperadas) < 1e-9);

  // a trajetória central (sem a margem das pontas) cobre passo×voltas,
  // centrada no meio — as pontas da TRAJETÓRIA (não do tubo) ficam a
  // raioTubo de A/B ao longo do eixo.
  const alcanceCentral = passo * voltasEsperadas;
  const pontaTrajA = mola.paraMundo([0, -alcanceCentral / 2, 0]);
  const distDePontaAtéA = distancia(pontaTrajA, A);
  assert.ok(Math.abs(distDePontaAtéA - raioTubo) < 1e-9, `distância ${distDePontaAtéA}, esperada ${raioTubo}`);
});

test("conectar: pontos coincidentes dão erro claro", () => {
  const cena = new Cena();
  const raiz = cena.criar("grupo", {});
  assert.throws(() => conectar(raiz, [0, 0, 0], [0, 0, 0], "cylinder", { raioTopo: 0.01, raioBase: 0.01 }));
});

test("produtoVetorial é destro", () => {
  aproxV(produtoVetorial([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  aproxV(produtoVetorial([0, 1, 0], [0, 0, 1]), [1, 0, 0]);
});
