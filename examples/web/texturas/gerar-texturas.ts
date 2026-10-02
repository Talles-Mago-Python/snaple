/** Gera as texturas procedurais do catálogo local em `public/texturas/`.
 *
 *   node examples/web/texturas/gerar-texturas.ts
 *
 * Sem dependências externas: o PNG é escrito à mão (assinatura + IHDR +
 * IDAT com o zlib do próprio Node + CRC32). Tudo é determinístico (hash,
 * nada de `Math.random`), então rodar de novo recria arquivos idênticos.
 *
 * Cada imagem tem 512×512 e é TILEÁVEL: o ruído de valor e o Voronoi usam
 * reticulados periódicos, então `textura.repetir: [n, n]` não mostra emenda. */
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

/* ── Ruído de valor e Voronoi, ambos tileáveis ─────────────────────── */

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
const misturar = (a: number, b: number, t: number): number => a + (b - a) * t;

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

/** Voronoi tileável em reticulado `cel × cel` com jitter `jitter` (0..1).
 * Devolve distâncias ao ponto mais próximo (`d1`) e ao segundo (`d2` —
 * `d2 - d1` pequeno = fronteira de célula), além do id da célula dona. */
function voronoi(u: number, v: number, cel: number, jitter: number, semente: number): { d1: number; d2: number; cx: number; cy: number } {
  const gx = Math.floor(u * cel);
  const gy = Math.floor(v * cel);
  let d1 = 9;
  let d2 = 9;
  let nx = 0;
  let ny = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = (((gx + dx) % cel) + cel) % cel;
      const cy = (((gy + dy) % cel) + cel) % cel;
      const px = (gx + dx + 0.5 + (hash2(cx, cy, semente) - 0.5) * jitter) / cel;
      const py = (gy + dy + 0.5 + (hash2(cx, cy, semente + 1) - 0.5) * jitter) / cel;
      const d = (u - px) * (u - px) + (v - py) * (v - py);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        nx = cx;
        ny = cy;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return { d1: Math.sqrt(d1), d2: Math.sqrt(d2), cx: nx, cy: ny };
}

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

  /* ── leva 2 ─────────────────────────────────────────────────────── */

  /** Carvalho claro: veios verticais longos + fibra fina. */
  madeira_clara(u, v, px, py) {
    const turb = fbm(u, v, 131, 2, 5, 2); // ondulação mansa ao longo do veio
    const fibra = ruido(u, v, 64, 4, 137);
    const fase = 0.8 * (turb - 0.5) + 0.2 * (fibra - 0.5);
    const veia = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * (u * 6 + fase)), 6);
    const valor = 0.80 - 0.32 * veia + 0.05 * (fibra - 0.5) + 0.015 * (hash2(px, py, 139) - 0.5);
    return [valor * 0.93, valor * 0.71, valor * 0.45];
  },

  /** Nogueira escura: mesmos veios, paleta fechada. */
  madeira_escura(u, v, px, py) {
    const turb = fbm(u, v, 141, 2, 5, 2);
    const fibra = ruido(u, v, 68, 4, 147);
    const fase = 0.9 * (turb - 0.5) + 0.2 * (fibra - 0.5);
    const veia = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * (u * 7 + fase)), 5);
    const valor = 0.54 - 0.30 * veia + 0.05 * (fibra - 0.5) + 0.015 * (hash2(px, py, 149) - 0.5);
    return [valor * 0.72, valor * 0.47, valor * 0.27];
  },

  /** Tijolo vermelho em fiadas alternadas, com argamassa. */
  tijolo_vermelho(u, v, px, py) {
    const fila = Math.floor(v * 8);
    const desloca = fila % 2 === 1 ? 0.5 : 0;
    const bx = u * 4 + desloca;
    const col = Math.floor(bx);
    const fx = bx - col;
    const fy = v * 8 - fila;
    const junta = 3 / TAM; // 3 px em uv global
    if (fx < junta * 4 || fy < junta * 8) {
      const g = 0.62 + 0.05 * (hash2(px, py, 151) - 0.5) * 2;
      return [g, g * 0.97, g * 0.92];
    }
    const id = hash2(((col % 4) + 4) % 4, ((fila % 8) + 8) % 8, 157);
    const queima = id < 0.15 ? 0.82 : 1; // tijolo queimado, mais escuro
    const n = 0.94 + 0.06 * (fbm(u, v, 163, 3, 16) - 0.5) * 2 + 0.03 * (hash2(px, py, 167) - 0.5);
    const tom = (0.55 + 0.10 * (id - 0.5) * 2) * queima * n;
    return [tom, tom * 0.40, tom * 0.30];
  },

  /** Muro de pedra: Voronoi com argamassa nas fronteiras. */
  pedra_muro(u, v, px, py) {
    const vo = voronoi(u, v, 6, 0.9, 171);
    const fronteira = vo.d2 - vo.d1;
    if (fronteira < 0.012) {
      const g = 0.34 + 0.05 * (hash2(px, py, 173) - 0.5) * 2;
      return [g, g * 0.97, g * 0.93];
    }
    const id = hash2(vo.cx, vo.cy, 179);
    const somb = 1 - 0.25 * Math.min(1, vo.d1 * 6); // escurece na borda da pedra
    const tom = (0.38 + 0.22 * id) * somb + 0.04 * (hash2(px, py, 181) - 0.5);
    const quente = id > 0.5 ? 1.02 : 0.98;
    return [tom * quente, tom, tom * (2 - quente) * 0.99];
  },

  /** Areia de praia com ondulações de vento. */
  areia(u, v, px, py) {
    const ondula = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * 14 + 1.6 * (fbm(u, v, 191, 3, 4) - 0.5)));
    const grao = hash2(px, py, 193);
    const valor = 0.82 + 0.05 * ondula + 0.04 * (grao - 0.5) + 0.03 * (fbm(u, v, 197, 3, 8) - 0.5);
    return [valor, valor * 0.90, valor * 0.69];
  },

  /** Neve fofa com cintilações. */
  neve(u, v, px, py) {
    let valor = 0.93 + 0.05 * (fbm(u, v, 211, 4, 5) - 0.5) + 0.015 * (hash2(px, py, 213) - 0.5);
    if (hash2(px, py, 217) < 0.004) valor = 1; // cintila
    return [valor * 0.97, valor * 0.99, valor];
  },

  /** Lava: basalto rachado com veios incandescentes. */
  lava(u, v) {
    const turb = fbm(u, v, 221, 5, 5);
    const sin = Math.abs(Math.sin(2 * Math.PI * (u * 3 + v * 2 + 3.2 * (turb - 0.5))));
    const racha = Math.pow(1 - sin, 10);
    const nucleo = Math.pow(1 - sin, 26);
    const rocha = 0.07 + 0.05 * fbm(u, v, 227, 3, 12);
    const r = rocha + 0.95 * racha;
    const g = rocha * 0.9 + 0.35 * racha + 0.4 * nucleo;
    const b = rocha * 0.9 + 0.05 * racha + 0.15 * nucleo;
    return [r, g, b];
  },

  /** Couro preto: células de Voronoi vincadas + grão fino. */
  couro_preto(u, v, px, py) {
    const vo = voronoi(u, v, 14, 0.85, 231);
    const vinco = clamp01(1 - (vo.d2 - vo.d1) * 14); // 1 na fronteira
    let valor = 0.13 + 0.05 * fbm(u, v, 233, 3, 24) + 0.012 * (hash2(px, py, 239) - 0.5);
    valor -= 0.06 * vinco;
    valor += 0.05 * clamp01(vo.d1 * 8 - 0.6); // centro da célula levanta
    return [valor, valor * 0.97, valor * 0.93];
  },

  /** Cortiça: manchas castanhas de tamanhos variados. */
  cortica(u, v, px, py) {
    const vo = voronoi(u, v, 10, 1.0, 241);
    const id = hash2(vo.cx, vo.cy, 251);
    const bordo = clamp01(1 - (vo.d2 - vo.d1) * 10);
    let tom = 0.55 + 0.25 * id - 0.12 * bordo + 0.05 * (hash2(px, py, 253) - 0.5);
    if (id < 0.2) tom *= 0.8; // mancha escura
    return [tom * 0.94, tom * 0.76, tom * 0.50];
  },

  /** Terrazzo: cacos coloridos esparsos em massa clara. */
  terrazzo(u, v, px, py) {
    const massa = 0.87 + 0.02 * (hash2(px, py, 257) - 0.5);
    const vo = voronoi(u, v, 12, 0.9, 263);
    const id = hash2(vo.cx, vo.cy, 271);
    if (id > 0.50 || vo.d1 > 0.045 + 0.045 * hash2(vo.cx, vo.cy, 277)) {
      const b = 0.9 * massa;
      return [b, b * 0.99, b * 0.97];
    }
    // caco: cor sorteada por célula
    const qual = Math.floor(hash2(vo.cx, vo.cy, 281) * 5);
    const paleta: [number, number, number][] = [
      [0.20, 0.20, 0.22], // grafite
      [0.55, 0.28, 0.20], // terracota
      [0.42, 0.45, 0.30], // oliva
      [0.75, 0.73, 0.70], // osso
      [0.30, 0.36, 0.45], // ardósia
    ];
    const [r, g, b] = paleta[qual]!;
    const n = 0.95 + 0.05 * hash2(px, py, 283);
    return [r * n, g * n, b * n];
  },

  /** Parquet de tábuas quadriculadas, veio alternado por placa. */
  parquet(u, v, px, py) {
    const n = 4;
    const cx = Math.floor(u * n);
    const cy = Math.floor(v * n);
    const fx = u * n - cx;
    const fy = v * n - cy;
    if (fx < 0.015 || fy < 0.015) return [0.16, 0.10, 0.06]; // fresta
    const horizontal = (cx + cy) % 2 === 0;
    const fase = hash2(cx, cy, 293) * 6;
    const t = horizontal ? fy : fx;
    const veia = 0.5 + 0.5 * Math.sin(2 * Math.PI * (t * 5 + fase + 2 * (fbm(u, v, 307, 3, 8) - 0.5)));
    const tom = (0.62 + 0.10 * (hash2(cx, cy, 309) - 0.5) * 2) * (0.85 + 0.15 * veia);
    return [tom * 0.92, tom * 0.70, tom * 0.44];
  },

  /** Piso xadrez de salão, com desgaste. */
  xadrez(u, v, px, py) {
    const n = 8;
    const cx = Math.floor(u * n);
    const cy = Math.floor(v * n);
    const preto = (cx + cy) % 2 === 0;
    const desgaste = 0.94 + 0.06 * (fbm(u, v, 311, 3, 6) - 0.5) * 2 + 0.02 * (hash2(px, py, 313) - 0.5);
    const base = preto ? 0.09 : 0.84;
    const valor = base * desgaste;
    return [valor, valor * (preto ? 0.98 : 0.99), valor * (preto ? 0.95 : 0.97)];
  },

  /** Lousa de sala de aula com restos de giz. */
  lousa(u, v, px, py) {
    let valor = 0.075 + 0.03 * (fbm(u, v, 317, 3, 4) - 0.5);
    const giz = fbm(u, v, 331, 3, 8, 3); // manchas alongadas
    valor += 0.10 * Math.pow(clamp01(giz * 1.4 - 0.55), 2);
    valor += 0.008 * (hash2(px, py, 337) - 0.5);
    return [valor * 0.92, valor, valor * 0.95];
  },

  /** Camuflagem de quatro tons em manchas de ruído. */
  camuflagem(u, v) {
    const n = fbm(u, v, 341, 4, 5);
    const m = fbm(u, v, 347, 3, 9);
    const t = n * 0.7 + m * 0.3;
    if (t < 0.38) return [0.15, 0.17, 0.10];
    if (t < 0.52) return [0.36, 0.33, 0.18];
    if (t < 0.66) return [0.25, 0.16, 0.09];
    return [0.10, 0.10, 0.08];
  },

  /** Gelo azulado com trincas internas. */
  gelo(u, v, px, py) {
    let valor = 0.90 + 0.04 * (fbm(u, v, 353, 3, 6) - 0.5);
    const turb = fbm(u, v, 359, 4, 6);
    const sin1 = Math.abs(Math.sin(2 * Math.PI * (u * 2.2 - v * 1.4 + 2.4 * (turb - 0.5))));
    const trinca = Math.pow(1 - sin1, 30);
    const r = valor * 0.80 - 0.25 * trinca;
    const g = valor * 0.93 - 0.10 * trinca;
    const b = valor;
    const bolha = hash2(px, py, 367) < 0.002 ? 1 : 0;
    return [r + bolha * 0.1, g + bolha * 0.1, b + bolha * 0.05];
  },

  /** Borracha com chapa diamante (losangos em relevo alternado). */
  borracha_diamante(u, v) {
    const cel = 8;
    const cx = Math.floor(u * cel);
    const cy = Math.floor(v * cel);
    const fx = u * cel - cx;
    const fy = v * cel - cy;
    const espelha = (cx + cy) % 2 === 0;
    const a = espelha ? fx : 1 - fx;
    const losango = Math.abs(a - 0.5) + Math.abs(fy - 0.5);
    if (losango < 0.28) {
      const brilho = 0.24 + 0.14 * (1 - (a + fy)); // luz vem de cima-esquerda
      return [brilho, brilho, brilho * 1.05];
    }
    return [0.12, 0.12, 0.13];
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

// Remove só o que este script sabe recriar (as imagens desenhadas à mão,
// como as da taverna, não são tocadas).
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
