/** Texturas e adesivos: a parte da aparência que depende de imagem.
 *
 * O core já resolveu tudo o que é geometria (UV canônico de cada tipo, a
 * película de cada adesivo); aqui só se carrega a imagem e se monta o
 * material/a malha. Imagem que não carrega vira aviso, nunca erro: a peça
 * continua sendo desenhada com a cor do material. */
import * as THREE from "three";
import type { AdesivoDerivado, AdesivoPlano, AdesivoRevolucao, Material, Textura } from "@snaple/core";

/** Carregador de imagem (`textura.src`/`adesivo.src`). Devolve `null` quando
 * não há imagem — a peça sai só com a cor, e o backend avisa. */
export type CarregarTextura = (src: string) => Promise<THREE.Texture | null>;

const semNavegador = () => typeof (globalThis as { document?: unknown }).document === "undefined";

/** Padrão: `THREE.TextureLoader` no navegador. Fora dele (Node, testes) não
 * há como decodificar imagem, então devolve `null` — passe um
 * `carregarTextura` próprio se precisar. */
export const carregadorTexturaPadrao: CarregarTextura = async (src) => {
  if (semNavegador()) return null;
  return new THREE.TextureLoader().loadAsync(src);
};

/** Imagens carregadas uma vez por `src` numa construção; cada uso ganha um
 * `clone()` (que compartilha a imagem na GPU) com repetição/giro próprios. */
export class CacheImagens {
  readonly #carregar: CarregarTextura;
  readonly #base = new Map<string, Promise<THREE.Texture | null>>();

  constructor(carregar: CarregarTextura) {
    this.#carregar = carregar;
  }

  /** Uma cópia da imagem, ou o motivo de ela não ter vindo. */
  async obter(src: string): Promise<{ textura: THREE.Texture } | { erro: string }> {
    let p = this.#base.get(src);
    if (!p) {
      p = this.#carregar(src).catch(() => null);
      this.#base.set(src, p);
    }
    const base = await p;
    if (!base) {
      return { erro: semNavegador() && this.#carregar === carregadorTexturaPadrao
        ? `sem carregador de imagem fora do navegador (passe 'carregarTextura')`
        : `não foi possível carregar '${src}'` };
    }
    const t = base.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return { textura: t };
  }
}

/** Aplica `textura` (repetição e giro) a uma cópia da imagem. */
export function configurarTextura(t: THREE.Texture, textura: Textura): THREE.Texture {
  const [ru, rv] = textura.repetir ?? [1, 1];
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ru, rv);
  t.center.set(0.5, 0.5);
  t.rotation = textura.rotacao ?? 0;
  return t;
}

/** Material da película de um adesivo: a imagem por cima da peça, com um
 * empurrão no depth buffer além do afastamento físico, para não piscar com a
 * superfície. O alfa do PNG RECORTA o formato (`alphaTest`) em vez de
 * misturar: película transparente entra na fila ordenada por distância e
 * some atrás de outro objeto transparente (o chão de sombra, um vidro) que
 * calhe de ser desenhado antes dela. */
export function materialAdesivo(mapa: THREE.Texture, base: Material | undefined): THREE.MeshStandardMaterial {
  mapa.wrapS = mapa.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshStandardMaterial({
    map: mapa,
    alphaTest: 0.5,
    metalness: base?.metalico ?? 0,
    roughness: base?.rugosidade ?? 1,
    flatShading: base?.facetado ?? false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** Malha da película de um adesivo, no espaço local do nó. */
export function geometriaAdesivo(a: AdesivoDerivado): THREE.BufferGeometry {
  return a.tipo === "plano" ? peliculaPlana(a) : peliculaRevolucao(a);
}

function peliculaPlana(a: AdesivoPlano): THREE.BufferGeometry {
  const canto = (su: number, sv: number) => [0, 1, 2].map(
    (i) => a.centro[i]! + a.direita[i]! * su * a.largura / 2 + a.cima[i]! * sv * a.altura / 2,
  );
  const pos = [...canto(-1, -1), ...canto(1, -1), ...canto(1, 1), ...canto(-1, 1)];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([...a.normal, ...a.normal, ...a.normal, ...a.normal], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  // direita × cima = normal (a direita saiu de cima × normal), então 0-1-2
  // é anti-horário visto de fora
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function peliculaRevolucao(a: AdesivoRevolucao): THREE.BufferGeometry {
  const colunas = Math.max(2, Math.ceil((64 * a.abertura) / (2 * Math.PI)));
  const perfil = a.perfil;
  // v da imagem ao longo do comprimento do perfil (não da altura), para a
  // imagem não esticar numa curva do perfil
  const acum = [0];
  for (let k = 1; k < perfil.length; k++) {
    acum.push(acum[k - 1]! + Math.hypot(perfil[k]![0] - perfil[k - 1]![0], perfil[k]![1] - perfil[k - 1]![1]));
  }
  const total = acum[acum.length - 1] || 1;
  const normal2D = (k: number): [number, number] => {
    const a0 = perfil[Math.max(0, k - 1)]!, a1 = perfil[Math.min(perfil.length - 1, k + 1)]!;
    const dr = a1[0] - a0[0], dy = a1[1] - a0[1];
    const l = Math.hypot(dr, dy) || 1;
    let nr = dy / l, ny = -dr / l;
    if (nr < 0) { nr = -nr; ny = -ny; }
    return [nr, ny];
  };
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k < perfil.length; k++) {
    const [r, y] = perfil[k]!;
    const [nr, ny] = normal2D(k);
    for (let j = 0; j <= colunas; j++) {
      const ang = a.anguloInicio + (a.abertura * j) / colunas;
      const s = Math.sin(ang), c = Math.cos(ang);
      pos.push(r * s, y, r * c);
      nor.push(nr * s, ny, nr * c);
      uv.push(j / colunas, acum[k]! / total);
    }
  }
  const linha = colunas + 1;
  for (let k = 0; k < perfil.length - 1; k++) {
    for (let j = 0; j < colunas; j++) {
      const a0 = k * linha + j, b0 = a0 + 1, a1 = a0 + linha, b1 = a1 + 1;
      // ângulo crescente = direita da imagem; perfil subindo = cima: vista de
      // fora, (a0, b0, b1) é anti-horário
      idx.push(a0, b0, b1, a0, b1, a1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
