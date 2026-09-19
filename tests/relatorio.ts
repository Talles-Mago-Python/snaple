/** Relatório de verificação dos 8 testes obrigatórios, com os valores reais.
 *
 *   node tests/relatorio.ts
 *
 * As asserções vivem na suíte (`npm test`); este script existe para mostrar
 * os NÚMEROS, não só o ✔. */
import * as THREE from "three";
import { Cena, ErroFeature, type AvisoInterpenetracao, type GeometriaExtrusao } from "@snaple/core";
import { construirGeometrias } from "@snaple/three";
import { salaDeJantar } from "./cena-exemplo.ts";

const linha = (n: number, titulo: string) =>
  console.log(`\n${"─".repeat(72)}\n${n}. ${titulo}\n${"─".repeat(72)}`);

// ── 1 ────────────────────────────────────────────────────────────────────
linha(1, "Mesa (box) + 4 pernas via face.base.grade");
{
  const cena = new Cena();
  const tampo = cena.criar("box", { largura: 1.2, altura: 0.05, profundidade: 0.8 },
    { nome: "mesa", transform: { posicao: [0, 0.725, 0] } });
  const pernas = [0, 1, 2, 3].map(() =>
    cena.criar("cylinder", { raioTopo: 0.03, raioBase: 0.03, altura: 0.7 }, { nome: "perna" }));
  tampo.face("base").grade(pernas, 2, 2, { gapEntre: 0.08 });
  for (const p of pernas) {
    const b = p.bbox();
    console.log(`  ${p.id}: base y = ${b.min[1]}   topo y = ${b.max[1]}   (x=${b.centro[0]}, z=${b.centro[2]})`);
  }
  const t = tampo.bboxPropria();
  console.log(`  tampo: base y = ${t.min[1]}   topo y = ${t.max[1]}`);
  console.log(`  conjunto: y de ${tampo.bbox().min[1]} a ${tampo.bbox().max[1]}`);
  console.log(`  avisos: ${cena.avisosTexto() || "(nenhum)"}`);
}

// ── 2 ────────────────────────────────────────────────────────────────────
linha(2, "face.topo.colocar(xicara)");
{
  const cena = new Cena();
  const tampo = cena.criar("box", { largura: 1.2, altura: 0.05, profundidade: 0.8 },
    { nome: "mesa", transform: { posicao: [0, 0.725, 0] } });
  const xicara = cena.criar("cylinder", { raioTopo: 0.04, raioBase: 0.03, altura: 0.09 }, { nome: "xícara" });
  tampo.face("topo").colocar(xicara, { u: -0.3, v: 0.1 });
  const topo = tampo.bboxPropria().max[1];
  const base = xicara.bbox().min[1];
  console.log(`  topo da mesa   = ${topo}`);
  console.log(`  base da xícara = ${base}`);
  console.log(`  diferença      = ${Math.abs(base - topo)}   (limite pedido: < 1e-6)`);
  console.log(`  centro da xícara em (x, z) = (${xicara.bbox().centro[0]}, ${xicara.bbox().centro[2]})  ← (u, v) pedidos`);
}

// ── 3 ────────────────────────────────────────────────────────────────────
linha(3, "row com 4 nós de tamanhos diferentes, justify: space-between");
{
  const cena = new Cena();
  const fila = cena.criar("row", { extensao: 10, justify: "space-between" });
  const larguras = [0.5, 2, 1.25, 3];
  const nos = larguras.map((l) => fila.criar("box", { largura: l, altura: 1, profundidade: 1 }));
  const caixas = nos.map((n) => n.bbox());
  console.log(`  larguras: ${larguras.join(", ")}  (soma = ${larguras.reduce((a, b) => a + b)})`);
  caixas.forEach((c, i) => console.log(`  ${nos[i]!.id}: x de ${c.min[0]} a ${c.max[0]}`));
  const vaos = caixas.slice(1).map((c, i) => c.min[0] - caixas[i]!.max[0]);
  console.log(`  vãos entre BORDAS: ${vaos.map((v) => v.toFixed(15)).join("  ")}`);
  console.log(`  esperado (10 - 6.75) / 3 = ${(3.25 / 3).toFixed(15)}`);
  console.log(`  extensão ocupada: ${caixas[3]!.max[0] - caixas[0]!.min[0]} (declarada: 10)`);
}

// ── 4 ────────────────────────────────────────────────────────────────────
linha(4, "Furo paramétrico numa placa");
{
  const cena = new Cena();
  const placa = cena.criar("box", { largura: 0.4, altura: 0.02, profundidade: 0.3 }, { nome: "placa" });
  placa.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.05, segmentos: 64 }, u: 0.1, v: -0.05 });

  const g = placa.geometria() as GeometriaExtrusao;
  console.log(`  geometria derivada: ${g.tipo}, eixo ${g.eixo}, ${g.partes.length} fatia(s), ${g.partes[0]!.furos.length} furo(s) de ${g.partes[0]!.furos[0]!.length} pontos`);

  const dentro = (m: THREE.BufferGeometry, r: number) => {
    const pos = m.getAttribute("position");
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.hypot(pos.getX(i) - 0.1, pos.getZ(i) + 0.05) < r - 1e-6) n++;
    }
    return n;
  };
  const malha = construirGeometrias(g)[0]!;
  const lisa = construirGeometrias(cena.criar("box", { largura: 0.4, altura: 0.02, profundidade: 0.3 }).geometria())[0]!;
  console.log(`  vértices da malha furada: ${malha.getAttribute("position").count}  (placa lisa: ${lisa.getAttribute("position").count})`);
  console.log(`  vértices DENTRO do furo r=0.05: ${dentro(malha, 0.05)}  ← 0 significa que o furo existe`);
  console.log(`  bbox da placa (furo não muda a caixa): ${placa.bbox().tamanho.join(" × ")}`);

  const texto = JSON.stringify(cena.toJSON());
  const proibidos = ["position", "vertices", "indices", "attributes", "Float32"];
  console.log(`  estado serializado contém malha? ${proibidos.some((p) => texto.includes(p))}`);
  console.log(`  feature no estado: ${JSON.stringify(cena.toJSON().raiz.filhos[0]!.features[0])}`);

  placa.atualizarFuro(0, { forma: { tipo: "circulo", raio: 0.08, segmentos: 64 } });
  const g2 = placa.geometria() as GeometriaExtrusao;
  const c = g2.partes[0]!.furos[0]!.reduce((a, p) => [a[0] + p[0] / 64, a[1] + p[1] / 64], [0, 0]);
  const r = Math.max(...g2.partes[0]!.furos[0]!.map((p) => Math.hypot(p[0] - c[0]!, p[1] - c[1]!)));
  console.log(`  após atualizarFuro(raio 0.05 → 0.08): raio regerado = ${r}`);
  console.log(`  vértices DENTRO do novo furo: ${dentro(construirGeometrias(g2)[0]!, 0.08)}`);
}

// ── 5 ────────────────────────────────────────────────────────────────────
linha(5, "Furo em nó model");
{
  const cena = new Cena();
  const cadeira = cena.criar("model", { src: "assets/cadeira.glb", tamanho: [0.45, 0.9, 0.5] }, { nome: "cadeira" });
  try {
    cadeira.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.01 }, u: 0, v: 0 });
    console.log("  ERRO: não lançou!");
  } catch (e) {
    const f = e as ErroFeature;
    console.log(`  ${f.name} (motivo: ${f.motivo}, nó: ${f.noId})`);
    console.log(`  ${f.message}`);
    console.log(`  nó continua íntegro: features = ${JSON.stringify(cadeira.no.features)}, geometria = ${cadeira.geometria().tipo}`);
  }
}

// ── 6 ────────────────────────────────────────────────────────────────────
linha(6, "Dois nós interpenetrando");
{
  const cena = new Cena();
  cena.criar("box", { largura: 2, altura: 2, profundidade: 2 }, { id: "caixa_a", transform: { posicao: [0, 1, 0] } });
  cena.criar("box", { largura: 2, altura: 2, profundidade: 2 }, { id: "caixa_b", transform: { posicao: [0.5, 1, 0] } });
  const a = cena.avisos()[0] as AvisoInterpenetracao;
  console.log(`  caixas 2×2×2 com centros a 0.5 em x ⇒ sobreposição esperada = ${2 - 0.5}`);
  console.log(`  aviso estruturado: ${JSON.stringify({ tipo: a.tipo, nos: a.nos, eixo: a.eixo, valor: a.valor })}`);
  console.log(`  aviso em texto:    ${cena.avisosTexto()}`);
}

// ── 7 ────────────────────────────────────────────────────────────────────
linha(7, "descrever() numa cena montada");
{
  const { cena, cadeiras } = salaDeJantar();
  console.log(`  ${cena.descrever()}`);
  cena.deslocarMundo(cadeiras[0]!.id, [-0.5, 0, 0]);
  console.log(`\n  (depois de empurrar uma cadeira para dentro da mesa)`);
  console.log(`  ${cena.descrever()}`);
}

// ── 8 ────────────────────────────────────────────────────────────────────
linha(8, "Roundtrip: serializar → desserializar → comparar");
{
  const { cena, tampo } = salaDeJantar();
  tampo.furar({ face: "topo", forma: { tipo: "retangulo", largura: 0.1, altura: 0.08 }, u: 0.5, v: 0 });
  const antes = cena.toJSON();
  const texto = JSON.stringify(antes);
  const volta = Cena.deJSON(JSON.parse(texto));
  const depois = JSON.stringify(volta.toJSON());
  console.log(`  tamanho do JSON: ${texto.length} bytes, ${cena.nosGeometricos().length} nós geométricos`);
  console.log(`  JSON idêntico byte a byte? ${texto === depois}`);
  console.log(`  descrever() idêntico?      ${volta.descrever() === cena.descrever()}`);
  console.log(`  geometria derivada igual?  ${JSON.stringify(volta.geometria(tampo.id)) === JSON.stringify(cena.geometria(tampo.id))}`);
  console.log(`  bbox igual?                ${JSON.stringify(volta.bbox(tampo.id)) === JSON.stringify(cena.bbox(tampo.id))}`);
}

console.log();
