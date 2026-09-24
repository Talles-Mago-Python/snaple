import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registrarFerramentas } from "../packages/mcp/src/ferramentas.ts";
import { reiniciarCena } from "../packages/mcp/src/estado.ts";

/** As tools novas de adesivo/animação, pelo protocolo de verdade (cliente e
 * servidor MCP ligados em memória). */
async function conectar(): Promise<Client> {
  reiniciarCena();
  const server = new McpServer({ name: "snaple-teste", version: "0" });
  registrarFerramentas(server);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "teste", version: "0" });
  await client.connect(b);
  return client;
}

/** `criar_no` devolve o id gerado na primeira linha. */
async function criar(client: Client, args: Record<string, unknown>): Promise<string> {
  const r = await chamar(client, "criar_no", args);
  assert.equal(r.erro, false, r.texto);
  return r.texto.split("\n")[0]!.trim();
}

async function chamar(client: Client, name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args }) as { content: { type: string; text?: string }[]; isError?: boolean };
  return { erro: !!r.isError, texto: r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"), r };
}

test("mcp: colar_adesivo valida a face; criar_animacao já confere o movimento", async () => {
  const c = await conectar();
  await criar(c, { tipo: "box", params: { largura: 0.1, altura: 1, profundidade: 1 }, transform: { posicao: [0, 0.5, 0] } });
  const bloco = await criar(c, { tipo: "box", params: { largura: 0.2, altura: 0.2, profundidade: 0.2 }, transform: { posicao: [-0.5, 0.1, 0] } });
  assert.equal((await chamar(c, "colar_adesivo", { id: bloco, src: "a.png", face: "sul" })).erro, false);
  const ruim = await chamar(c, "colar_adesivo", { id: bloco, src: "a.png", face: "lateral" });
  assert.ok(ruim.erro && /só existe em cylinder, cone e lathe/.test(ruim.texto));

  const criada = await chamar(c, "criar_animacao", {
    nome: "atravessar", duracao: 2,
    faixas: [{ no: bloco, propriedade: "posicao", quadros: [[0, [0, 0, 0]], [2, [1, 0, 0]]], relativo: true }],
  });
  assert.equal(criada.erro, false);
  assert.match(criada.texto, /DURANTE O MOVIMENTO:\nt=.*penetra/);
  // faixa inválida: tudo ou nada — a animação antiga continua intacta
  const falha = await chamar(c, "criar_animacao", {
    nome: "atravessar", substituir: true,
    faixas: [
      { no: bloco, propriedade: "posicao", quadros: [[0, [0, 0, 0]]] },
      { no: bloco, propriedade: "angulo", quadros: [[0, 1]] },
    ],
  });
  assert.ok(falha.erro && /só existe em nós 'junta'/.test(falha.texto));
  assert.match((await chamar(c, "conferir_animacao", { nome: "atravessar" })).texto, /penetra/);
  assert.match((await chamar(c, "descrever_cena", {})).texto, /Animação "atravessar" \(2 s, uma vez\)/);
});

test("mcp: renderizar_png numa pose da animação e .glb exportado com o clipe", async () => {
  const c = await conectar();
  const j = await criar(c, { tipo: "junta", params: { eixo: "y", angulo: 0 } });
  await criar(c, { tipo: "box", pai: j, params: { largura: 1, altura: 0.1, profundidade: 0.1 }, transform: { posicao: [0.5, 0.05, 0] }, material: { textura: { src: "metal.png" } } });
  const anim = await chamar(c, "criar_animacao", { nome: "girar", repetir: "sempre", faixas: [{ no: j, propriedade: "angulo", quadros: [[0, 0], [4, 6.283]] }] });
  assert.equal(anim.erro, false, anim.texto);

  const png = await chamar(c, "renderizar_png", { animacao: "girar", t: 1, largura: 64, altura: 48 });
  assert.equal(png.erro, false);
  assert.ok(png.r.content.some((x) => x.type === "image"));
  // a textura não é "problema" no PNG: um aviso só, explicando o limite
  assert.match(png.texto, /não aparecem neste PNG/);

  const dir = await mkdtemp(join(tmpdir(), "snaple-"));
  const caminho = join(dir, "girar.glb");
  assert.equal((await chamar(c, "exportar_cena", { formato: "glb", caminho })).erro, false);
  const glb = await readFile(caminho);
  const tamJson = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + tamJson).toString("utf8"));
  assert.equal(gltf.animations?.length, 1);
  assert.equal(gltf.animations[0].name, "girar");
  assert.equal(gltf.animations[0].channels[0].target.path, "rotation");
});
