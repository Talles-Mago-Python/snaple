import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena, texto, planoDeFace, planoDeLateral, tracosDoGlifo, produtoEscalar, produtoVetorial } from "@snaple/core";

test("tracosDoGlifo: caractere conhecido tem traços, desconhecido é vazio, normaliza minúsculas", () => {
  assert.ok(tracosDoGlifo("A").length > 0);
  assert.ok(tracosDoGlifo("a").length > 0);
  assert.deepEqual(tracosDoGlifo("a"), tracosDoGlifo("A"));
  assert.deepEqual(tracosDoGlifo("?"), []);
  assert.deepEqual(tracosDoGlifo(" "), []);
});

test("texto() numa face: os traços de UMA letra nunca avisam entre si (linter os trata como um conjunto)", () => {
  const cena = new Cena();
  const placa = cena.criar("box", { largura: 0.3, altura: 0.02, profundidade: 0.15 });
  const plano = planoDeFace(placa.face("topo"), 0, 0);
  texto(placa, "rotulo", "SNAPLE 07", plano, { unidade: 0.01 });

  // avisos entre caracteres DIFERENTES são esperados (texto compacto); o que
  // não pode acontecer é um aviso DENTRO do mesmo índice de caractere
  const porNome = new Map<string, string>();
  const coletar = (no: { id: string; nome?: string; filhos: unknown[] }): void => {
    porNome.set(no.id, no.nome ?? no.id);
    for (const f of no.filhos as typeof no[]) coletar(f);
  };
  coletar(cena.toJSON().raiz as never);
  for (const a of cena.avisos()) {
    if (a.tipo !== "interpenetracao" && a.tipo !== "centros-coincidentes") continue;
    const [na, nb] = a.nos.map((id) => porNome.get(id) ?? id);
    const letraA = /^rotulo_(\d+)_/.exec(na)?.[1];
    const letraB = /^rotulo_(\d+)_/.exec(nb)?.[1];
    assert.notEqual(letraA, letraB, `aviso dentro da mesma letra: ${na} <-> ${nb}`);
  }
});

test("texto(): caractere não suportado é ignorado, mas os outros são escritos", () => {
  const cena = new Cena();
  const placa = cena.criar("box", { largura: 0.2, altura: 0.02, profundidade: 0.1 });
  const plano = planoDeFace(placa.face("topo"), 0, 0);
  const raizes = texto(placa, "x", "A?B", plano);
  assert.equal(raizes.length, 2);
});

test("texto() envolvendo um cilindro (planoDeLateral): sem avisos, direita é tangente à superfície", () => {
  const cena = new Cena();
  const cil = cena.criar("cylinder", { raioTopo: 0.3, raioBase: 0.3, altura: 0.5 });
  const plano = planoDeLateral(cil.lateral(), 0, 0);
  assert.ok(Math.abs(produtoEscalar(plano.direita, plano.normal)) < 1e-9, "direita deveria ser perpendicular à normal");
  texto(cil, "faixa", "ABC", plano, { unidade: 0.02 });
  assert.equal(cena.avisosTexto(), "");
});

test("alinhamento: início/centro/fim deslocam o texto no eixo 'direita'", () => {
  const cena = new Cena();
  const placa = cena.criar("box", { largura: 0.3, altura: 0.02, profundidade: 0.1 });
  const plano = planoDeFace(placa.face("topo"), 0, 0);

  const [inicioRaiz] = texto(placa, "i", "AB", plano, { unidade: 0.01, alinhamento: "inicio" });
  const [centroRaiz] = texto(placa, "c", "AB", plano, { unidade: 0.01, alinhamento: "centro" });
  const [fimRaiz] = texto(placa, "f", "AB", plano, { unidade: 0.01, alinhamento: "fim" });

  // `origem` é onde o texto COMEÇA, está CENTRADO, ou TERMINA — logo o
  // primeiro caractere (índice 0) nasce cada vez mais para trás AO LONGO DO
  // EIXO `direita` conforme o alinhamento avança de início→centro→fim: com
  // início, o primeiro caractere já nasce em torno de `origem`; com fim, o
  // texto inteiro precisa caber ANTES dele. Medido na projeção sobre
  // `direita` (e não numa coordenada de mundo) para o teste não depender de
  // para onde esse eixo aponta em cada face.
  const aoLongoDeDireita = (no: { transform: { posicao: [number, number, number] } }): number =>
    no.transform.posicao[0]! * plano.direita[0]! +
    no.transform.posicao[1]! * plano.direita[1]! +
    no.transform.posicao[2]! * plano.direita[2]!;
  assert.ok(aoLongoDeDireita(inicioRaiz!) > aoLongoDeDireita(centroRaiz!));
  assert.ok(aoLongoDeDireita(centroRaiz!) > aoLongoDeDireita(fimRaiz!));
});

test("planoDeFace: a base (direita, cima, normal) é DESTRA nas seis faces — texto lê de fora, não espelhado", () => {
  const cena = new Cena();
  const caixa = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 });
  for (const face of ["topo", "base", "norte", "sul", "leste", "oeste"] as const) {
    const plano = planoDeFace(caixa.face(face), 0, 0);
    // direita × cima = normal é exatamente o que faz o glifo (desenhado num
    // plano x/y com o observador do lado da normal) não sair espelhado
    const cruz = produtoVetorial(plano.direita, plano.cima);
    assert.ok(
      Math.hypot(cruz[0] - plano.normal[0], cruz[1] - plano.normal[1], cruz[2] - plano.normal[2]) < 1e-12,
      `face ${face}: direita × cima deveria ser a normal (saiu ${cruz} vs ${plano.normal})`,
    );
    // e o texto continua raso sobre a face: direita e cima perpendiculares à normal
    assert.ok(Math.abs(produtoEscalar(plano.direita, plano.normal)) < 1e-12);
    assert.ok(Math.abs(produtoEscalar(plano.cima, plano.normal)) < 1e-12);
  }
  // caso concreto: na face "sul" (normal +z, a frente), o texto corre para +x
  // — a direita de quem está de frente para ela — e não para −x
  const sul = planoDeFace(caixa.face("sul"), 0, 0);
  assert.ok(sul.direita[0]! > 0.99, `direita da face sul deveria apontar para +x, apontou ${sul.direita}`);
});
