/** Gera as texturas procedurais do catálogo local em `public/texturas/`.
 *
 *   node examples/web/texturas/gerar-texturas.ts
 *
 * Sem dependências externas: o PNG é escrito à mão (assinatura + IHDR +
 * IDAT com o zlib do próprio Node + CRC32). Tudo é determinístico (hash,
 * nada de `Math.random`), então rodar de novo recria arquivos idênticos.
 *
 * Cada imagem tem 512×512 e é TILEÁVEL: o ruído de valor usa um reticulado
 * periódico, então `textura.repetir: [n, n]` não mostra emendas. */
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TAM = 512;
const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, "..", "public", "texturas");

/* ── PNG mínimo: RGB 8 bits, sem alpha ─────────────────────────────── */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo: string, dados: Uint8Array): Buffer {
  const tipoBuf = Buffer.from(tipo, "ascii");
  const cab = Buffer.alloc(4);
  cab.writeUInt32BE(dados.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tipoBuf, Buffer.from(dados)])));
  return Buffer.concat([cab, tipoBuf, Buffer.from(dados), crcBuf]);
}

/** Empacota pixels RGB (0–255) num PNG. `rgb` tem 3 bytes por pixel. */
function png(rgb: Uint8Array, largura: number, altura: number): Buffer {
  const linha = largura * 3;
  const bruto = Buffer.alloc((linha + 1) * altura);
  for (let y = 0; y < altura; y++) {
    bruto[y * (linha + 1)] = 0; // filtro "None" em cada linha
    bruto.set(rgb.subarray(y * linha, (y + 1) * linha), y * (linha + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // profundidade de bits
  ihdr[9] = 2; // tipo de cor: RGB verdadeiro
  const assinatura = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    assinatura,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(bruto, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/* ── Ruído de valor tileável (hash determinístico) ─────────────────── */

function hash2(x: number, y: number, semente: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(semente | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const suave = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Ruído de valor em (u, v) ∈ [0, 1), com reticulado de `celX × celY`
 * células — periódico nas duas direções, logo a textura não tem emenda. */
function ruido(u: number, v: number, celX: number, celY: number, semente: number): number {
  const gx = Math.floor(u * celX);
  const gy = Math.floor(v * celY);
  const fx = suave(u * celX - gx);
  const fy = suave(v * celY - gy);
  const x0 = ((gx % celX) + celX) % celX;
  const y0 = ((gy % celY) + celY) % celY;
  const x1 = (x0 + 1) % celX;
  const y1 = (y0 + 1) % celY;
  const a = hash2(x0, y0, semente);
  const b = hash2(x1, y0, semente);
  const c = hash2(x0, y1, semente);
  const d = hash2(x1, y1, semente);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** fBm tileável: soma de oitavas com frequência dobrando. Retorna ~0..1. */
function fbm(u: number, v: number, semente: number, oitavas: number, celX: number, celY = celX): number {
  let soma = 0;
  let peso = 0.5;
  let total = 0;
  let cx = celX;
  let cy = celY;
  for (let o = 0; o < oitavas; o++) {
    soma += peso * ruido(u, v, cx, cy, semente + o * 101);
    total += peso;
    peso *= 0.5;
    cx *= 2;
    cy *= 2;
  }
  return soma / total;
}

const misturar = (a: number, b: number, t: number): number => a + (b - a) * t;

/* ── Receitas: cada uma devolve RGB 0..1 para (u, v, pixel) ────────── */

type Receita = (u: number, v: number, px: number, py: number) => [number, number, number];

const receitas: Record<string, Receita> = {
  /** Concreto cinza manchado, com poros esparsos. */
  concreto_cru(u, v, px, py) {
    const manchas = fbm(u, v, 11, 4, 3);
    const grao = hash2(px, py, 17);
    let valor = 0.60 + 0.14 * (manchas - 0.5) + 0.05 * (grao - 0.5);
    if (hash2(px >> 1, py >> 1, 19) < 0.004) valor -= 0.20; // poro
    return [valor, valor * 0.985, valor * 0.96];
  },

  /** Mármore branco com veios cinza (sin + turbulência, o truque clássico). */
  marmore_branco(u, v) {
    const turb = fbm(u, v, 21, 5, 4);
    const sin1 = Math.abs(Math.sin(2 * Math.PI * (u * 1.5 + v * 0.6 + 2.6 * (turb - 0.5))));
    const veia1 = Math.pow(1 - sin1, 22);
    const turb2 = fbm(u, v, 23, 4, 8);
    const sin2 = Math.abs(Math.sin(2 * Math.PI * (u * 3 - v * 2.2 + 3.2 * (turb2 - 0.5))));
    const veia2 = Math.pow(1 - sin2, 30);
    let valor = 0.935 - 0.52 * veia1 - 0.16 * veia2;
    valor += 0.02 * (fbm(u, v, 29, 3, 16) - 0.5);
    return [valor, valor * 0.993, valor * 0.985];
  },

  /** Linho cru: trama simples, fios alternados em relevo. */
  linho(u, v) {
    const fios = 96;
    const cx = Math.floor(u * fios);
    const cy = Math.floor(v * fios);
    const fx = u * fios - cx;
    const fy = v * fios - cy;
    const urdume = (cx + cy) % 2 === 0;
    const fio = urdume ? Math.sin(Math.PI * fx) : Math.sin(Math.PI * fy);
    const fibra = fbm(u, v, 31, 3, 48);
    const valor = 0.80 + 0.13 * fio + 0.10 * (fibra - 0.5);
    return [valor * 0.96, valor * 0.91, valor * 0.79];
  },

  /** Grama vista de cima: manchas de verde + risco vertical de folha. */
  grama(u, v, px, py) {
    const t = fbm(u, v, 41, 4, 6);
    const folha = 0.85 + 0.30 * hash2(Math.floor(u * 384), 0, 43);
    const brilho = 0.94 + 0.12 * hash2(px, py, 47);
    const r = misturar(0.14, 0.38, t) * folha * brilho;
    const g = misturar(0.27, 0.57, t) * folha * brilho;
    const b = misturar(0.07, 0.17, t) * folha * brilho;
    return [r, g, b];
  },

  /** Granito polido: grãos claros e escuros por limiar de ruído. */
  granito(u, v, px, py) {
    const n = fbm(u, v, 61, 3, 24);
    const g = hash2(px, py, 67);
    let valor: number;
    if (n < 0.30) valor = 0.16 + 0.10 * g;
    else if (n > 0.74) valor = 0.80 + 0.14 * g;
    else valor = 0.46 + 0.16 * (g - 0.5) + 0.08 * (fbm(u, v, 71, 2, 8) - 0.5);
    return [valor, valor * 0.98, valor * 0.95];
  },

  /** Azulejo branco 4×4 com rejunte e leve abaulamento por peça. */
  azulejo_branco(u, v, px, py) {
    const n = 4;
    const fx = u * n - Math.floor(u * n);
    const fy = v * n - Math.floor(v * n);
    const junta = 3 / TAM / (1 / n); // 3 px de rejunte em uv local
    if (fx < junta || fy < junta) {
      const g = 0.60 + 0.04 * (hash2(px, py, 53) - 0.5) * 2;
      return [g, g * 0.975, g * 0.94];
    }
    const cx = Math.floor(u * n);
    const cy = Math.floor(v * n);
    let tom = 0.945 + 0.022 * (hash2(cx, cy, 57) - 0.5) * 2;
    tom -= 0.045 * (Math.hypot(fx - 0.5, fy - 0.5) / 0.7071); // abaulado
    tom += 0.008 * (hash2(px, py, 59) - 0.5) * 2;
    return [tom, tom * 0.998, tom * 0.99];
  },

  /** Carpete cinza-azulado de pelos curtos. */
  carpete_cinza(u, v, px, py) {
    const n = fbm(u, v, 81, 4, 10);
    const g = hash2(px, py, 83);
    const valor = 0.42 + 0.10 * (n - 0.5) + 0.06 * (g - 0.5);
    return [valor * 0.92, valor * 0.95, valor * 1.0];
  },

  /** Papel kraft: fibra horizontal + manchas suaves. */
  papel_kraft(u, v, px, py) {
    const fibra = fbm(u, v, 91, 4, 6, 26); // reticulado alongado no v
    const mancha = fbm(u, v, 97, 3, 3);
    const valor = 0.80 + 0.06 * (fibra - 0.5) + 0.05 * (mancha - 0.5) + 0.015 * (hash2(px, py, 99) - 0.5);
    return [valor * 0.96, valor * 0.79, valor * 0.56];
  },

  /** Fibra de carbono: sarja 2×2, cada tow com brilho cilíndrico. */
  fibra_carbono(u, v, px, py) {
    const cel = 16;
    const cx = Math.floor(u * cel);
    const cy = Math.floor(v * cel);
    const fx = u * cel - cx;
    const fy = v * cel - cy;
    const s = (cx + cy) % 2 === 0 ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
    const valor = 0.10 + 0.24 * s + 0.02 * (hash2(px, py, 103) - 0.5);
    return [valor * 0.92, valor * 0.95, valor * 1.0];
  },

  /** Aço escovado: riscos horizontais + arranhões esparsos. */
  metal_escovado(u, v, px, py) {
    const bandas = ruido(u, v, 3, 120, 111);
    let valor = 0.72 + 0.10 * (bandas - 0.5) + 0.04 * (hash2(px, py, 117) - 0.5);
    if (hash2(py, 0, 113) < 0.0025) valor += 0.14; // arranhão
    return [valor * 0.97, valor * 0.98, valor];
  },

  /** Jeans índigo: sarja diagonal + pontos claros da trama. */
  tecido_jeans(u, v, px, py) {
    const risca = 0.5 + 0.5 * Math.sin(2 * Math.PI * (u + v) * 96);
    let valor = 0.32 + 0.26 * risca + 0.05 * (hash2(px, py, 123) - 0.5);
    if (hash2(px, py, 127) < 0.012) valor += 0.16; // fio de trama claro
    return [valor * 0.42, valor * 0.55, valor * 0.88];
  },
};

/* ── Geração ───────────────────────────────────────────────────────── */

function gerar(nome: string, receita: Receita): string {
  const rgb = new Uint8Array(TAM * TAM * 3);
  for (let py = 0; py < TAM; py++) {
    const v = py / TAM;
    for (let px = 0; px < TAM; px++) {
      const [r, g, b] = receita(px / TAM, v, px, py);
      const i = (py * TAM + px) * 3;
      rgb[i] = Math.round(clamp01(r) * 255);
      rgb[i + 1] = Math.round(clamp01(g) * 255);
      rgb[i + 2] = Math.round(clamp01(b) * 255);
    }
  }
  const caminho = join(SAIDA, `${nome}.png`);
  writeFileSync(caminho, png(rgb, TAM, TAM));
  return caminho;
}

mkdirSync(SAIDA, { recursive: true });

// Remove só o que este script sabe recriar (prefixo `gen_` é proibido aqui:
// as imagens feitas à mão, como as da taverna, não são tocadas).
for (const arquivo of readdirSync(SAIDA)) {
  if (arquivo.endsWith(".png") && arquivo.replace(".png", "") in receitas) {
    unlinkSync(join(SAIDA, arquivo));
  }
}

for (const [nome, receita] of Object.entries(receitas)) {
  const caminho = gerar(nome, receita);
  const { size } = statSync(caminho);
  console.log(`${nome.padEnd(18)} ${(size / 1024).toFixed(0).padStart(4)} kB`);
}
console.log(`\n${Object.keys(receitas).length} texturas em ${SAIDA}`);
