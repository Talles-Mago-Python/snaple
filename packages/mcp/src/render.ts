/** Rasterizador de software puro-CPU — sem GPU, sem `headless-gl`, sem
 * binário nativo. `@snaple/three` já constrói a malha inteira em Node puro
 * (é o que `exportar_cena` usa); este módulo só soma um z-buffer manual,
 * sombreamento plano e um cortador de plano próximo por cima disso, e
 * codifica o resultado como PNG usando só `node:zlib` (a única peça do
 * formato que o Node não expõe pronta é o CRC32, ~20 linhas abaixo).
 *
 * Não é renderização de produção: sem anti-aliasing, sem sombra, uma luz
 * direcional fixa. O objetivo é um agente enxergar forma e proporção sem
 * precisar de GPU — para isso já chega. */
import { deflateSync } from "node:zlib";
import * as THREE from "three";

// ── PNG ──────────────────────────────────────────────────────────────────

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let tabelaCrc32Cache: Uint32Array | null = null;
function tabelaCrc32(): Uint32Array {
  if (tabelaCrc32Cache) return tabelaCrc32Cache;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  tabelaCrc32Cache = t;
  return t;
}

function crc32(buf: Uint8Array): number {
  const t = tabelaCrc32();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunkPng(tipo: string, dados: Uint8Array): Buffer {
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), Buffer.from(dados)]);
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo), 0);
  return Buffer.concat([tamanho, corpo, crc]);
}

/** Codifica um buffer RGB de 8 bits (sem alfa), `largura × altura × 3`
 * bytes, linha a linha de cima para baixo, como PNG. */
export function codificarPng(rgb: Uint8Array, largura: number, altura: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // profundidade de bits
  ihdr[9] = 2; // tipo de cor: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // compressão/filtro/interlace padrão

  const bytesPorLinha = largura * 3;
  const bruto = Buffer.alloc(altura * (1 + bytesPorLinha));
  for (let y = 0; y < altura; y++) {
    const destino = y * (1 + bytesPorLinha);
    bruto[destino] = 0; // filtro "none" nesta linha — formato exige um byte por linha
    Buffer.from(rgb.buffer, rgb.byteOffset + y * bytesPorLinha, bytesPorLinha).copy(bruto, destino + 1);
  }
  const idat = deflateSync(bruto);

  return Buffer.concat([
    ASSINATURA_PNG,
    chunkPng("IHDR", ihdr),
    chunkPng("IDAT", idat),
    chunkPng("IEND", new Uint8Array(0)),
  ]);
}

// ── Rasterização ─────────────────────────────────────────────────────────

export type Vista = "iso" | "frente" | "lado" | "topo" | readonly [number, number, number];

export interface OpcoesRenderizar {
  vista?: Vista;
  /** Ponto para onde a câmera olha. Padrão: o centro da bbox da cena. */
  alvo?: readonly [number, number, number];
  /** Distância da câmera até `alvo`. Padrão: cabe a cena inteira no quadro. */
  distancia?: number;
  largura?: number;
  altura?: number;
}

const COR_FUNDO: [number, number, number] = [235, 235, 232];
const LUZ_DIRECAO = new THREE.Vector3(0.5, 0.8, 0.6).normalize();
const LUZ_AMBIENTE = 0.35;

function direcaoDaVista(vista: Vista): THREE.Vector3 {
  if (Array.isArray(vista)) return new THREE.Vector3(vista[0], vista[1], vista[2]).normalize();
  switch (vista) {
    case "frente": return new THREE.Vector3(0, 0, 1);
    case "lado": return new THREE.Vector3(1, 0, 0);
    case "topo": return new THREE.Vector3(0, 1, 0);
    case "iso":
    default: return new THREE.Vector3(1, 1, 1).normalize();
  }
}

interface Triangulo {
  /** Vértices em espaço de MUNDO. */
  p: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  cor: readonly [number, number, number];
}

function corDoMaterial(material: THREE.Material | THREE.Material[]): [number, number, number] {
  const m = Array.isArray(material) ? material[0] : material;
  const cor = (m as THREE.MeshStandardMaterial | undefined)?.color ?? new THREE.Color(0xcccccc);
  return [Math.round(cor.r * 255), Math.round(cor.g * 255), Math.round(cor.b * 255)];
}

/** Extrai triângulos em espaço de mundo (posição já multiplicada por
 * `matrixWorld`) de toda malha na subárvore, uma cor por malha (o
 * sombreamento em si é plano, por triângulo, calculado depois). */
function coletarTriangulos(raiz: THREE.Object3D): Triangulo[] {
  raiz.updateMatrixWorld(true);
  const triangulos: Triangulo[] = [];
  raiz.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geom = obj.geometry;
    const pos = geom.attributes.position;
    if (!pos) return;
    const indice = geom.index;
    const cor = corDoMaterial(obj.material);
    const lerVertice = (i: number): THREE.Vector3 =>
      new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(obj.matrixWorld);
    const n = indice ? indice.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const i0 = indice ? indice.getX(i) : i;
      const i1 = indice ? indice.getX(i + 1) : i + 1;
      const i2 = indice ? indice.getX(i + 2) : i + 2;
      triangulos.push({ p: [lerVertice(i0), lerVertice(i1), lerVertice(i2)], cor });
    }
  });
  return triangulos;
}

/** Sutherland-Hodgman contra o único plano `z = -near` (espaço de câmera,
 * que olha para -Z): mantém a parte do polígono mais longe que `near`. */
function cortarPertoDoPlano(pontos: THREE.Vector3[], near: number): THREE.Vector3[] {
  const dentro = (p: THREE.Vector3): boolean => p.z <= -near;
  const saida: THREE.Vector3[] = [];
  for (let i = 0; i < pontos.length; i++) {
    const atual = pontos[i]!;
    const proximo = pontos[(i + 1) % pontos.length]!;
    const atualDentro = dentro(atual);
    if (atualDentro) saida.push(atual);
    if (atualDentro !== dentro(proximo)) {
      const t = (-near - atual.z) / (proximo.z - atual.z);
      saida.push(new THREE.Vector3().lerpVectors(atual, proximo, t));
    }
  }
  return saida;
}

interface PontoTela { x: number; y: number; z: number }

function paraTela(p: THREE.Vector3, projecao: THREE.Matrix4, largura: number, altura: number): PontoTela {
  const clip = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(projecao);
  const ndcX = clip.x / clip.w, ndcY = clip.y / clip.w, ndcZ = clip.z / clip.w;
  return { x: ((ndcX + 1) / 2) * largura, y: ((1 - ndcY) / 2) * altura, z: ndcZ };
}

function rasterizarTriangulo(
  buffer: Uint8Array, zbuffer: Float32Array, largura: number, altura: number,
  a: PontoTela, b: PontoTela, c: PontoTela, cor: readonly [number, number, number],
): void {
  // normaliza para sentido anti-horário positivo, para o teste de dentro/fora
  const area2 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(area2) < 1e-9) return;
  const [p0, p1, p2] = area2 < 0 ? [a, c, b] : [a, b, c];
  const areaFinal = Math.abs(area2);

  const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)));
  const maxX = Math.min(largura - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x)));
  const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)));
  const maxY = Math.min(altura - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y)));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = (p1.x - px) * (p2.y - py) - (p1.y - py) * (p2.x - px);
      const w1 = (p2.x - px) * (p0.y - py) - (p2.y - py) * (p0.x - px);
      const w2 = areaFinal - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = (w0 * p0.z + w1 * p1.z + w2 * p2.z) / areaFinal;
      const idx = y * largura + x;
      if (z < zbuffer[idx]!) {
        zbuffer[idx] = z;
        const o = idx * 3;
        buffer[o] = cor[0]; buffer[o + 1] = cor[1]; buffer[o + 2] = cor[2];
      }
    }
  }
}

/** Renderiza `objeto` (a árvore que `@snaple/three` já construiu) para um
 * buffer RGB de `largura × altura × 3` bytes — puro CPU, sem GPU, sem
 * dependência nativa. */
export function renderizar(objeto: THREE.Object3D, opcoes: OpcoesRenderizar = {}): { rgb: Uint8Array; largura: number; altura: number } {
  const largura = opcoes.largura ?? 480;
  const altura = opcoes.altura ?? 360;

  const bbox = new THREE.Box3().setFromObject(objeto);
  const vazio = bbox.isEmpty();
  const centro = vazio ? new THREE.Vector3(0, 0, 0) : bbox.getCenter(new THREE.Vector3());
  const raio = vazio ? 1 : Math.max(bbox.getSize(new THREE.Vector3()).length() / 2, 1e-3);

  const alvo = opcoes.alvo ? new THREE.Vector3(...opcoes.alvo) : centro;
  const fov = 40;
  // distância que garante a esfera da bbox inteira dentro do campo de visão
  const distanciaMinima = raio / Math.sin((fov * Math.PI) / 360);
  const distancia = opcoes.distancia ?? distanciaMinima * 1.15;
  const near = Math.max(distancia - raio * 3, distancia * 0.01, 1e-4);
  const far = distancia + raio * 3 + 1e-3;

  const posicaoCamera = alvo.clone().add(direcaoDaVista(opcoes.vista ?? "iso").multiplyScalar(distancia));
  const cima = Math.abs(direcaoDaVista(opcoes.vista ?? "iso").dot(new THREE.Vector3(0, 1, 0))) > 0.999
    ? new THREE.Vector3(0, 0, -1) // olhando de cima/baixo: "cima" da imagem aponta para o norte (-z)
    : new THREE.Vector3(0, 1, 0);

  const camera = new THREE.PerspectiveCamera(fov, largura / altura, near, far);
  camera.position.copy(posicaoCamera);
  camera.up.copy(cima);
  camera.lookAt(alvo);
  camera.updateMatrixWorld(true);

  const triangulos = coletarTriangulos(objeto);

  const rgb = new Uint8Array(largura * altura * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = COR_FUNDO[0]; rgb[i + 1] = COR_FUNDO[1]; rgb[i + 2] = COR_FUNDO[2];
  }
  const zbuffer = new Float32Array(largura * altura).fill(Infinity);

  for (const tri of triangulos) {
    const normalMundo = new THREE.Vector3()
      .subVectors(tri.p[1], tri.p[0])
      .cross(new THREE.Vector3().subVectors(tri.p[2], tri.p[0]))
      .normalize();
    const sombra = Math.max(0, normalMundo.dot(LUZ_DIRECAO));
    const intensidade = Math.min(1, LUZ_AMBIENTE + (1 - LUZ_AMBIENTE) * sombra);
    const cor: [number, number, number] = [
      Math.round(tri.cor[0] * intensidade),
      Math.round(tri.cor[1] * intensidade),
      Math.round(tri.cor[2] * intensidade),
    ];

    const pontosVista = tri.p.map((p) => p.clone().applyMatrix4(camera.matrixWorldInverse));
    const cortado = cortarPertoDoPlano(pontosVista, near);
    for (let i = 1; i + 1 < cortado.length; i++) {
      const a = paraTela(cortado[0]!, camera.projectionMatrix, largura, altura);
      const b = paraTela(cortado[i]!, camera.projectionMatrix, largura, altura);
      const c = paraTela(cortado[i + 1]!, camera.projectionMatrix, largura, altura);
      rasterizarTriangulo(rgb, zbuffer, largura, altura, a, b, c, cor);
    }
  }

  return { rgb, largura, altura };
}

export function renderizarPng(objeto: THREE.Object3D, opcoes: OpcoesRenderizar = {}): Buffer {
  const { rgb, largura, altura } = renderizar(objeto, opcoes);
  return codificarPng(rgb, largura, altura);
}
