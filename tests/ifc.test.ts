import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Cena } from "@snaple/core";
import { exportarIFC, type AvisoIFC } from "@snaple/ifc";
import { sha256Hex } from "../packages/ifc/src/sha256.ts";

// ── SHA-256 puro (sem node:crypto — precisa rodar no navegador, ver
// sha256.ts) contra a implementação de referência do próprio Node ──────────

test("sha256Hex bate com node:crypto (vetores conhecidos + bordas de bloco de 64 bytes)", () => {
  const casos = [
    "", "abc", "snaple:project", "café com açúcar",
    "x".repeat(55), "x".repeat(56), "x".repeat(63), "x".repeat(64), "x".repeat(65), "a".repeat(1000),
  ];
  for (const s of casos) {
    const esperado = createHash("sha256").update(s, "utf8").digest("hex");
    assert.equal(sha256Hex(s), esperado, `entrada: '${s.slice(0, 20)}...' (${s.length} chars)`);
  }
});

// ── Um mini-parser de SPF só para os testes ────────────────────────────────
//
// Não é um parser IFC de verdade (não valida o schema) — só o suficiente
// para navegar `#N=TIPO(attrs);` e seguir referências, o que basta para
// conferir estrutura e (no teste de hierarquia) decodificar a posição
// escrita de volta e comparar com a bbox que o CORE calculou.

interface EntidadeSPF { tipo: string; attrs: string[] }

function parseSPF(texto: string): Map<number, EntidadeSPF> {
  const mapa = new Map<number, EntidadeSPF>();
  const linhaRe = /^#(\d+)=([A-Z0-9]+)\((.*)\);$/;
  for (const linha of texto.split("\n")) {
    const m = linhaRe.exec(linha.trim());
    if (!m) continue;
    mapa.set(Number(m[1]), { tipo: m[2]!, attrs: splitTopLevel(m[3]!) });
  }
  return mapa;
}

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let profundidade = 0, atual = "", emString = false;
  for (const c of s) {
    if (c === "'") emString = !emString;
    if (!emString) {
      if (c === "(") profundidade++;
      if (c === ")") profundidade--;
    }
    if (c === "," && profundidade === 0 && !emString) {
      out.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  if (atual.length) out.push(atual);
  return out;
}

function comoRef(attr: string): number {
  const m = /^#(\d+)$/.exec(attr.trim());
  if (!m) throw new Error(`não é uma referência STEP: '${attr}'`);
  return Number(m[1]);
}

function comoNumeros(attr: string): number[] {
  const interno = attr.trim().replace(/^\(/, "").replace(/\)$/, "");
  return splitTopLevel(interno).map(Number);
}

function entidadesDoTipo(mapa: Map<number, EntidadeSPF>, tipo: string): [number, EntidadeSPF][] {
  return [...mapa.entries()].filter(([, e]) => e.tipo === tipo);
}

function contar(texto: string, tipo: string): number {
  return (texto.match(new RegExp(`=${tipo}\\(`, "g")) ?? []).length;
}

/** Posição (`IfcCartesianPoint`) do `ObjectPlacement` de um elemento —
 * atributo 5 (índice 0) de todo `IfcElement` gerado por `elementoBIM`. */
function posicaoDoElemento(mapa: Map<number, EntidadeSPF>, idElemento: number): number[] {
  const elemento = mapa.get(idElemento)!;
  const placement = mapa.get(comoRef(elemento.attrs[5]!))!; // IFCLOCALPLACEMENT
  const axis = mapa.get(comoRef(placement.attrs[1]!))!; // IFCAXIS2PLACEMENT3D
  const ponto = mapa.get(comoRef(axis.attrs[0]!))!; // IFCCARTESIANPOINT
  return comoNumeros(ponto.attrs[0]!);
}

function unicoElemento(mapa: Map<number, EntidadeSPF>): [number, EntidadeSPF] {
  const proxies = entidadesDoTipo(mapa, "IFCBUILDINGELEMENTPROXY");
  assert.equal(proxies.length, 1, "esperava exatamente 1 IfcBuildingElementProxy");
  return proxies[0]!;
}

// ── 1. Cena simples (um box) ───────────────────────────────────────────────

test("box simples: header, cadeia de contexto espacial, 1 elemento, geometria", () => {
  const cena = new Cena();
  cena.criar("box", { largura: 1, altura: 2, profundidade: 3 }, { nome: "caixa" });
  const texto = exportarIFC(cena, { nomeProjeto: "Teste" });

  assert.match(texto, /^ISO-10303-21;/);
  assert.match(texto, /FILE_SCHEMA\(\('IFC4'\)\);/);
  assert.match(texto, /END-ISO-10303-21;\s*$/);

  assert.equal(contar(texto, "IFCPROJECT"), 1);
  assert.equal(contar(texto, "IFCSITE"), 1);
  assert.equal(contar(texto, "IFCBUILDING"), 1);
  assert.equal(contar(texto, "IFCBUILDINGSTOREY"), 1);
  assert.equal(contar(texto, "IFCRELAGGREGATES"), 3, "Project→Site→Building→Storey");
  assert.equal(contar(texto, "IFCRELCONTAINEDINSPATIALSTRUCTURE"), 1);
  assert.equal(contar(texto, "IFCBUILDINGELEMENTPROXY"), 1);
  assert.equal(contar(texto, "IFCEXTRUDEDAREASOLID"), 1);
  assert.equal(contar(texto, "IFCRECTANGLEPROFILEDEF"), 1);

  const mapa = parseSPF(texto);
  const [, proxy] = unicoElemento(mapa);
  assert.match(proxy.attrs[2]!, /'caixa'/, "Name do elemento vem de no.nome");
});

// ── 2. Cada primitiva individualmente ──────────────────────────────────────

const PRIMITIVAS_EXATAS: { tipo: string; params: Record<string, unknown>; esperado: string }[] = [
  { tipo: "box", params: { largura: 1, altura: 1, profundidade: 1 }, esperado: "IFCEXTRUDEDAREASOLID" },
  { tipo: "cylinder", params: { raioTopo: 0.5, raioBase: 0.5, altura: 1 }, esperado: "IFCEXTRUDEDAREASOLID" },
  { tipo: "cone", params: { raio: 0.5, altura: 1 }, esperado: "IFCREVOLVEDAREASOLID" },
  { tipo: "sphere", params: { raio: 0.5 }, esperado: "IFCSPHERE" },
  { tipo: "extrude", params: { perfil: [[0, 0], [1, 0], [1, 1], [0, 1]], altura: 1 }, esperado: "IFCEXTRUDEDAREASOLID" },
  { tipo: "lathe", params: { perfil: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]] }, esperado: "IFCREVOLVEDAREASOLID" },
];

for (const { tipo, params, esperado } of PRIMITIVAS_EXATAS) {
  test(`primitiva '${tipo}' → ${esperado}`, () => {
    const cena = new Cena();
    cena.criar(tipo as never, params as never);
    const texto = exportarIFC(cena);
    assert.ok(contar(texto, esperado) >= 1, `esperava '${esperado}' na saída de '${tipo}':\n${texto}`);
  });
}

const PRIMITIVAS_TESSELADAS: { tipo: string; params: Record<string, unknown> }[] = [
  { tipo: "plane", params: { largura: 1, profundidade: 1 } },
  { tipo: "torus", params: { raio: 0.5, raioTubo: 0.1 } },
  { tipo: "cylinder", params: { raioTopo: 0.2, raioBase: 0.5, altura: 1 } }, // tronco de cone
  { tipo: "helix", params: { raio: 0.1, raioTubo: 0.01, passo: 0.05, voltas: 3 } },
  {
    tipo: "sweep",
    params: { caminho: [[0, 0, 0], [1, 0, 0], [1, 1, 0]], secao: { tipo: "circulo", raio: 0.02 } },
  },
];

for (const { tipo, params } of PRIMITIVAS_TESSELADAS) {
  test(`'${tipo}' sem equivalente direto → IfcFacetedBrep (tesselado, com aviso)`, () => {
    const cena = new Cena();
    cena.criar(tipo as never, params as never);
    const avisos: AvisoIFC[] = [];
    const texto = exportarIFC(cena, { aoAvisar: (a) => avisos.push(a) });
    assert.ok(contar(texto, "IFCFACETEDBREP") >= 1, `esperava IfcFacetedBrep para '${tipo}':\n${texto}`);
    assert.ok(avisos.some((a) => a.motivo === "tesselado"), `esperava aviso 'tesselado' para '${tipo}'`);
  });
}

test("nó 'model' vira caixa proxy + aviso — não há malha para embutir", () => {
  const cena = new Cena();
  cena.criar("model", { src: "inexistente.glb", tamanho: [1, 2, 3] });
  const avisos: AvisoIFC[] = [];
  const texto = exportarIFC(cena, { aoAvisar: (a) => avisos.push(a) });
  assert.equal(contar(texto, "IFCEXTRUDEDAREASOLID"), 1);
  assert.ok(avisos.some((a) => a.motivo === "modelo-proxy"));
});

// ── 3. Hierarquia com transform acumulado ──────────────────────────────────

test("posição final no IFC bate com a bbox própria calculada pelo core (pega erro de conversão de eixo)", () => {
  const cena = new Cena();
  const pai = cena.criar("grupo", {}, { transform: { posicao: [1, 2, 3] } });
  const filho = pai.criar("box", { largura: 0.2, altura: 0.2, profundidade: 0.2 }, {
    transform: { posicao: [0.5, -0.5, 0.25] },
  });
  const centroMundo = filho.bbox().centro; // [1.5, 1.5, 3.25], Y-up

  const texto = exportarIFC(cena);
  const mapa = parseSPF(texto);
  const [id] = unicoElemento(mapa);
  const [x, y, z] = posicaoDoElemento(mapa, id);

  // paraZUp: (x,y,z) -> (x,-z,y)
  assert.ok(Math.abs(x! - centroMundo[0]) < 1e-9, `x: ${x} vs ${centroMundo[0]}`);
  assert.ok(Math.abs(y! - -centroMundo[2]) < 1e-9, `y: ${y} vs ${-centroMundo[2]}`);
  assert.ok(Math.abs(z! - centroMundo[1]) < 1e-9, `z: ${z} vs ${centroMundo[1]}`);
});

test("hierarquia rotacionada: a posição do neto no IFC ainda bate com a bbox do core", () => {
  const cena = new Cena();
  const pai = cena.criar("grupo", {}, { transform: { posicao: [2, 0, 0], rotacao: [0, Math.PI / 2, 0] } });
  const filho = pai.criar("grupo", {}, { transform: { posicao: [1, 0, 0] } });
  const neto = filho.criar("box", { largura: 0.1, altura: 0.1, profundidade: 0.1 });
  const centroMundo = neto.bbox().centro;

  const texto = exportarIFC(cena);
  const mapa = parseSPF(texto);
  const [id] = unicoElemento(mapa);
  const [x, y, z] = posicaoDoElemento(mapa, id);

  assert.ok(Math.abs(x! - centroMundo[0]) < 1e-9, `x: ${x} vs ${centroMundo[0]}`);
  assert.ok(Math.abs(y! - -centroMundo[2]) < 1e-9, `y: ${y} vs ${-centroMundo[2]}`);
  assert.ok(Math.abs(z! - centroMundo[1]) < 1e-9, `z: ${z} vs ${centroMundo[1]}`);
});

// ── 4. Exportar a mesma cena duas vezes → mesmos GUIDs (idealmente arquivo idêntico) ──

test("exportar a mesma cena duas vezes gera o MESMO arquivo (GUIDs e numeração estáveis)", () => {
  const cena = new Cena();
  const tampo = cena.criar("box", { largura: 1.8, altura: 0.06, profundidade: 1 }, { nome: "mesa" });
  const perna = cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.04, altura: 0.7 }, { nome: "perna" });
  tampo.face("base").colocar(perna, { u: 0.8, v: 0.4 });

  const a = exportarIFC(cena, { nomeArquivo: "mesma.ifc" });
  const b = exportarIFC(cena, { nomeArquivo: "mesma.ifc" });
  assert.equal(a, b, "duas exportações da mesma cena deveriam produzir bytes idênticos");

  const guid = (texto: string, tipo: string) => {
    const m = new RegExp(`=${tipo}\\('([^']+)'`).exec(texto);
    assert.ok(m, `não achei ${tipo}`);
    return m![1];
  };
  assert.equal(guid(a, "IFCPROJECT"), guid(b, "IFCPROJECT"));
});

test("GUID de um nó não muda quando OUTRO nó é adicionado depois", () => {
  const cena = new Cena();
  const alvo = cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { nome: "alvo" });
  const antes = exportarIFC(cena);
  cena.criar("sphere", { raio: 0.5 }, { nome: "novo" });
  const depois = exportarIFC(cena);

  const guidDoAlvo = (texto: string) => {
    const mapa = parseSPF(texto);
    const proxies = entidadesDoTipo(mapa, "IFCBUILDINGELEMENTPROXY");
    const doAlvo = proxies.find(([, e]) => e.attrs[7] === `'${alvo.id}'`);
    assert.ok(doAlvo, "não achei o proxy do nó 'alvo' pelo Tag");
    return doAlvo![1].attrs[0];
  };
  assert.equal(guidDoAlvo(antes), guidDoAlvo(depois), "GUID é função do id do nó, não da ordem de criação");
});

// ── 5. Furo paramétrico ────────────────────────────────────────────────────

test("furo paramétrico vira IfcArbitraryProfileDefWithVoids (perfil com buraco, não booleano)", () => {
  const cena = new Cena();
  const placa = cena.criar("box", { largura: 0.5, altura: 0.02, profundidade: 0.3 });
  placa.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.02 }, u: 0, v: 0 });

  const texto = exportarIFC(cena);
  assert.ok(contar(texto, "IFCARBITRARYPROFILEDEFWITHVOIDS") >= 1, texto);
  assert.equal(contar(texto, "IFCBOOLEANRESULT"), 0, "furo não deve gerar operação booleana");
  assert.equal(contar(texto, "IFCBOOLEANCLIPPINGRESULT"), 0);
});

test("furo de profundidade parcial vira mais de um IfcExtrudedAreaSolid (uma fatia por trecho)", () => {
  const cena = new Cena();
  const placa = cena.criar("box", { largura: 0.5, altura: 0.1, profundidade: 0.3 });
  placa.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.02 }, u: 0, v: 0, profundidade: 0.04 });
  const texto = exportarIFC(cena);
  assert.ok(contar(texto, "IFCEXTRUDEDAREASOLID") >= 2, `esperava >=2 fatias:\n${texto}`);
});

// ── 6. Cena de estresse (câmera) ────────────────────────────────────────────

test("exporta a cena da câmera (examples/web/modelos/camera.ts) sem lançar exceção", async () => {
  const { montarCena } = await import("../examples/web/modelos/camera.ts");
  const cena = montarCena();
  const avisos: AvisoIFC[] = [];
  const t0 = performance.now();
  const texto = exportarIFC(cena, { nomeProjeto: "SNAPLE R-01", aoAvisar: (a) => avisos.push(a) });
  const ms = performance.now() - t0;

  const totalNos = cena.nosGeometricos().length;
  const tesselados = avisos.filter((a) => a.motivo === "tesselado");
  const falhas = avisos.filter((a) => a.motivo === "falha");

  console.log(
    `[stress camera.ts] ${totalNos} nós geométricos, ` +
    `arquivo ${(texto.length / 1024).toFixed(1)} KiB, ${ms.toFixed(1)} ms, ` +
    `${tesselados.length} nó(s) em fallback tesselado, ${falhas.length} falha(s).`,
  );
  for (const f of falhas) console.log(`  FALHA: ${f.texto}`);
  for (const t of tesselados.slice(0, 20)) console.log(`  tesselado: ${t.texto}`);

  assert.equal(falhas.length, 0, "nenhum nó deveria falhar ao exportar");
  assert.ok(texto.startsWith("ISO-10303-21;"));
  assert.ok(contar(texto, "IFCRELCONTAINEDINSPATIALSTRUCTURE") <= 1);
});
