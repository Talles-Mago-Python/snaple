import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { Cena } from "@snaple/core";
import { construirCena } from "@snaple/three";
import { renderizar, renderizarPng, codificarPng } from "../packages/mcp/src/render.ts";

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Implementação de CRC32 independente da de `render.ts`, só para o teste
 * conferir o CRC gravado sem reusar o código sob teste. */
function crc32Referencia(buf: Buffer): number {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

test("codificarPng: estrutura válida, round-trip do zlib, e CRC do IHDR bate com uma implementação independente", () => {
  const largura = 4, altura = 3;
  const rgb = new Uint8Array(largura * altura * 3);
  for (let i = 0; i < rgb.length; i += 3) { rgb[i] = 10; rgb[i + 1] = 20; rgb[i + 2] = 30; }
  const png = codificarPng(rgb, largura, altura);

  assert.ok(png.subarray(0, 8).equals(ASSINATURA_PNG));
  assert.equal(png.readUInt32BE(16), largura); // IHDR.largura
  assert.equal(png.readUInt32BE(20), altura); // IHDR.altura
  assert.equal(png[24], 8); // bit depth
  assert.equal(png[25], 2); // color type RGB

  const ihdrTipoEDados = png.subarray(12, 12 + 4 + 13);
  const crcGravado = png.readUInt32BE(12 + 4 + 13);
  assert.equal(crcGravado, crc32Referencia(ihdrTipoEDados));

  const idatTamanho = png.readUInt32BE(33);
  const idatDados = png.subarray(33 + 8, 33 + 8 + idatTamanho);
  const bruto = inflateSync(idatDados);
  assert.equal(bruto.length, altura * (1 + largura * 3));
  for (let y = 0; y < altura; y++) {
    const off = y * (1 + largura * 3);
    assert.equal(bruto[off], 0); // filtro "none"
    assert.equal(bruto[off + 1], 10);
    assert.equal(bruto[off + 2], 20);
    assert.equal(bruto[off + 3], 30);
  }
});

test("renderizar: um objeto centrado aparece no meio do quadro, o fundo aparece nos cantos", async () => {
  const cena = new Cena();
  cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { material: { cor: "#3366cc" } });
  const { objeto } = await construirCena(cena, { carregarModelo: async () => null });

  for (const vista of ["iso", "frente", "lado", "topo"] as const) {
    const { rgb, largura, altura } = renderizar(objeto, { vista, largura: 120, altura: 90 });
    const centro = (Math.floor(altura / 2) * largura + Math.floor(largura / 2)) * 3;
    const canto = 0;
    assert.notDeepEqual([rgb[centro], rgb[centro + 1], rgb[centro + 2]], [235, 235, 232], `vista=${vista}: centro deveria ter a caixa, não o fundo`);
    assert.deepEqual([rgb[canto], rgb[canto + 1], rgb[canto + 2]], [235, 235, 232], `vista=${vista}: canto deveria ser fundo`);
  }
});

test("renderizar: dois objetos em profundidades diferentes respeitam oclusão (z-buffer)", async () => {
  const cena = new Cena();
  // uma caixa grande atrás de uma pequena, alinhadas com a câmera de frente:
  // vistas de 'frente' (+z olhando para -z), a caixa da frente (mais +z) deve
  // cobrir a de trás no centro do quadro
  cena.criar("box", { largura: 1, altura: 1, profundidade: 0.2 }, { material: { cor: "#204080" }, transform: { posicao: [0, 0, -1] } });
  cena.criar("box", { largura: 0.3, altura: 0.3, profundidade: 0.2 }, { material: { cor: "#c02020" }, transform: { posicao: [0, 0, 1] } });
  const { objeto } = await construirCena(cena, { carregarModelo: async () => null });
  const { rgb, largura, altura } = renderizar(objeto, { vista: "frente", largura: 120, altura: 90 });
  const centro = (Math.floor(altura / 2) * largura + Math.floor(largura / 2)) * 3;
  // vermelho (caixa da frente) deve dominar no centro, não o azul escuro de trás
  assert.ok(rgb[centro]! > rgb[centro + 2]!, `pixel central [${rgb[centro]},${rgb[centro + 1]},${rgb[centro + 2]}] deveria ser avermelhado (oclusão errada?)`);
});

test("renderizarPng devolve um Buffer com a assinatura PNG", async () => {
  const cena = new Cena();
  cena.criar("sphere", { raio: 0.5 });
  const { objeto } = await construirCena(cena, { carregarModelo: async () => null });
  const png = renderizarPng(objeto, { largura: 64, altura: 48 });
  assert.ok(png.subarray(0, 8).equals(ASSINATURA_PNG));
});

test("renderizar: cena vazia não lança, devolve só o fundo", async () => {
  const cena = new Cena();
  const { objeto } = await construirCena(cena, { carregarModelo: async () => null });
  const { rgb } = renderizar(objeto, { largura: 32, altura: 24 });
  for (let i = 0; i < rgb.length; i += 3) {
    assert.deepEqual([rgb[i], rgb[i + 1], rgb[i + 2]], [235, 235, 232]);
  }
});
