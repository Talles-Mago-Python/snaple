import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena, aplicarPonto, aplicarDirecao, aabbNoEspacoDe } from "@snaple/core";

const PI = Math.PI;

function aproxV(a: readonly number[], b: readonly number[], tol = 1e-9, msg = ""): void {
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i]! - b[i]!) < tol, `${msg} [${a}] != [${b}] no eixo ${i}`);
}

test("origemMundo/normalMundo/eixosMundo batem com a matriz calculada à mão, num dono girado E escalado", () => {
  const cena = new Cena();
  const pai = cena.criar("grupo", {}, { transform: { posicao: [1, 2, -3], rotacao: [0.3, -0.7, 0.4], escala: [1, 1, 1] } });
  const dono = pai.criar("box", { largura: 0.4, altura: 0.2, profundidade: 0.6 }, {
    transform: { posicao: [0.1, -0.2, 0.3], rotacao: [0.5, 1.1, -0.2], escala: [2, 0.5, 1.3] },
  });

  const mundo = cena.mundo();
  const m = mundo.get(dono.id)!.matriz;

  for (const nome of ["topo", "base", "norte", "sul", "leste", "oeste"] as const) {
    const face = dono.face(nome);
    const origemLocal = face.origemLocal();
    const esperadoOrigem = aplicarPonto(m, origemLocal);
    aproxV(face.origemMundo(), esperadoOrigem, 1e-9, `origemMundo(${nome})`);

    const f = face.frame;
    const normalizar = (v: readonly number[]): number[] => {
      const c = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
      return [v[0]! / c, v[1]! / c, v[2]! / c];
    };
    aproxV(face.normalMundo(), normalizar(aplicarDirecao(m, f.normal)), 1e-9, `normalMundo(${nome})`);
    const eixos = face.eixosMundo();
    aproxV(eixos.u, normalizar(aplicarDirecao(m, f.u)), 1e-9, `eixosMundo(${nome}).u`);
    aproxV(eixos.v, normalizar(aplicarDirecao(m, f.v)), 1e-9, `eixosMundo(${nome}).v`);

    // eixosMundo/normalMundo continuam unitários mesmo com escala não uniforme
    assert.ok(Math.abs(Math.hypot(...face.normalMundo()) - 1) < 1e-9);
    assert.ok(Math.abs(Math.hypot(...eixos.u) - 1) < 1e-9);
    assert.ok(Math.abs(Math.hypot(...eixos.v) - 1) < 1e-9);
  }
});

test("colocar: gap desloca exatamente ao longo da normal, sem gap encosta em 0", () => {
  const cena = new Cena();
  const base = cena.criar("box", { largura: 0.5, altura: 0.1, profundidade: 0.5 });
  const semGap = cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  base.face("topo").colocar(semGap);
  assert.ok(Math.abs(semGap.bbox().min[1]! - base.bboxPropria().max[1]!) < 1e-12);

  const comGap = cena.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  base.face("topo").colocar(comGap, { gap: 0.03 });
  assert.ok(Math.abs(comGap.bbox().min[1]! - (base.bboxPropria().max[1]! + 0.03)) < 1e-12);
});

test("colocar: orientar:false mantém a rotação do alvo, mas ainda encosta a base na face", () => {
  const cena = new Cena();
  // dono girado em Y: a face "leste" NÃO fica alinhada com o eixo X do
  // mundo, então a checagem de contato abaixo precisa projetar na normal
  // real, não comparar bboxes alinhadas aos eixos do mundo.
  const dono = cena.criar("box", { largura: 0.4, altura: 0.4, profundidade: 0.4 }, { transform: { rotacao: [0, PI / 5, 0] } });
  const alvo = cena.criar("box", { largura: 0.05, altura: 0.05, profundidade: 0.05 }, { transform: { rotacao: [0.7, -1.1, 0.3] } });
  const rotacaoAntes = [...alvo.transform.rotacao];
  const face = dono.face("leste");
  // reparentar:false isola o efeito de orientar: sem isso, colocar() ainda
  // reparentaria o alvo sob `dono` (que está girado) e o `transform.rotacao`
  // LOCAL mudaria só para preservar a orientação de MUNDO — comportamento
  // correto de reparentar(), mas não o que este teste quer isolar.
  face.colocar(alvo, { orientar: false, reparentar: false });
  assert.deepEqual([...alvo.transform.rotacao], rotacaoAntes);

  // bbox do alvo no referencial do DONO (mesma função que Face#assentar usa
  // internamente): a borda "leste" (min de x, já que sinal da face é +1)
  // tem que encostar exatamente na metade da largura do dono — 0.2 m —
  // mesmo com o alvo rotacionado arbitrariamente e orientar:false.
  const caixaNoDono = aabbNoEspacoDe(cena, alvo.id, dono.id);
  assert.ok(Math.abs(caixaNoDono.min[0]! - 0.2) < 1e-9, `esperava min.x = 0.2, ficou em ${caixaNoDono.min[0]}`);
});
