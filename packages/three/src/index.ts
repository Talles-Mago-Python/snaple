/** @snaple/three — backend Three.js para `@snaple/core`.
 *
 * Consome o JSON da cena e produz um `THREE.Object3D`. Nada mais: não move
 * nós, não faz layout, não valida — isso tudo já aconteceu no core, em Node
 * puro, antes de o Three.js entrar em cena.
 *
 * A dependência é de mão única. O core não importa este pacote e não conhece
 * nenhum nome de campo do Three.js; as conversões de convenção (plano em XY vs
 * XZ, extrusão em +Z, material) moram todas aqui. */
import * as THREE from "three";
import {
  Cena, derivarGeometria,
  type CenaJSON, type Material, type No, type ParamsModel, type Vec3,
} from "@snaple/core";
import { construirGeometrias, caixaProxy } from "./geometria.ts";

export { construirGeometrias, caixaProxy } from "./geometria.ts";

export type MotivoAviso = "modelo-ausente" | "bbox-divergente" | "geometria-falhou";

export interface AvisoBackend {
  motivo: MotivoAviso;
  noId: string;
  texto: string;
}

/** Carregador de `model.src`. Devolve `null` quando o arquivo não existe —
 * nesse caso o backend desenha a caixa proxy com o `tamanho` declarado. */
export type CarregarModelo = (src: string, noId: string) => Promise<THREE.Object3D | null>;

export interface OpcoesConstruir {
  carregarModelo?: CarregarModelo;
  /** Divergência RELATIVA tolerada entre a bbox real do modelo carregado e o
   * `tamanho` declarado, por eixo. Padrão 0.05 (5%). */
  toleranciaModelo?: number;
  aoAvisar?: (aviso: AvisoBackend) => void;
}

export interface ResultadoConstrucao {
  objeto: THREE.Object3D;
  avisos: AvisoBackend[];
}

/** Constrói a cena inteira. Assíncrona porque `model.src` pode precisar de
 * I/O; uma cena sem nós `model` resolve sem tocar em disco nem rede. */
export async function construirCena(
  entrada: CenaJSON | Cena,
  opcoes: OpcoesConstruir = {},
): Promise<ResultadoConstrucao> {
  const json = entrada instanceof Cena ? entrada.toJSON() : entrada;
  if (json.version !== 1) {
    throw new Error(`versão de cena não suportada por @snaple/three: ${String(json.version)}`);
  }
  if (json.eixoCima !== "y") {
    throw new Error(`este backend só entende cenas Y-up (recebeu eixoCima='${json.eixoCima}')`);
  }
  const cena = Cena.deJSON(json);
  const avisos: AvisoBackend[] = [];
  const avisar = (a: AvisoBackend) => {
    avisos.push(a);
    opcoes.aoAvisar?.(a);
  };
  const objeto = await construirNo(cena, cena.raiz, opcoes, avisar);
  return { objeto, avisos };
}

async function construirNo(
  cena: Cena,
  no: No,
  opcoes: OpcoesConstruir,
  avisar: (a: AvisoBackend) => void,
): Promise<THREE.Object3D> {
  const raiz = await corpoDoNo(cena, no, opcoes, avisar);
  raiz.name = no.nome ? `${no.id} (${no.nome})` : no.id;
  raiz.userData.snaple = { id: no.id, tipo: no.tipo, ...(no.nome ? { nome: no.nome } : {}) };
  const t = no.transform;
  raiz.position.set(t.posicao[0], t.posicao[1], t.posicao[2]);
  raiz.rotation.set(t.rotacao[0], t.rotacao[1], t.rotacao[2], "XYZ");
  raiz.scale.set(t.escala[0], t.escala[1], t.escala[2]);
  for (const filho of no.filhos) {
    raiz.add(await construirNo(cena, filho, opcoes, avisar));
  }
  return raiz;
}

async function corpoDoNo(
  cena: Cena,
  no: No,
  opcoes: OpcoesConstruir,
  avisar: (a: AvisoBackend) => void,
): Promise<THREE.Object3D> {
  if (no.tipo === "model") {
    return modeloOuProxy(no, opcoes, avisar);
  }
  let geometrias: THREE.BufferGeometry[];
  try {
    geometrias = construirGeometrias(derivarGeometria(cena, no));
  } catch (e) {
    avisar({
      motivo: "geometria-falhou",
      noId: no.id,
      texto: `não foi possível gerar a geometria de '${no.id}': ${(e as Error).message}`,
    });
    return new THREE.Group();
  }
  if (geometrias.length === 0) return new THREE.Group();
  const material = construirMaterial(no.material);
  if (geometrias.length === 1) return new THREE.Mesh(geometrias[0]!, material);
  // mais de uma parte = furo de profundidade parcial fatiou a peça
  const grupo = new THREE.Group();
  for (const g of geometrias) grupo.add(new THREE.Mesh(g, material));
  return grupo;
}

async function modeloOuProxy(
  no: No,
  opcoes: OpcoesConstruir,
  avisar: (a: AvisoBackend) => void,
): Promise<THREE.Object3D> {
  const p = no.params as ParamsModel;
  const tamanho = (p.tamanho ?? [1, 1, 1]) as Vec3;
  const carregar = opcoes.carregarModelo ?? carregadorGLTFPadrao;
  let carregado: THREE.Object3D | null = null;
  let jaAvisou = false;
  try {
    carregado = await carregar(p.src, no.id);
  } catch (e) {
    jaAvisou = true;
    avisar({
      motivo: "modelo-ausente",
      noId: no.id,
      texto: `falha ao carregar '${p.src}' para '${no.id}' (${(e as Error).message}); ` +
        `desenhando caixa proxy de ${tamanho.join(" × ")} m`,
    });
  }
  if (!carregado) {
    if (!jaAvisou) {
      avisar({
        motivo: "modelo-ausente",
        noId: no.id,
        texto: `'${p.src}' não pôde ser carregado para '${no.id}'; ` +
          `desenhando caixa proxy de ${tamanho.join(" × ")} m`,
      });
    }
    const proxy = new THREE.Mesh(caixaProxy(tamanho), construirMaterial(no.material ?? { aramado: true }));
    proxy.userData.snapleProxy = true;
    return proxy;
  }
  conferirTamanhoDeclarado(no.id, carregado, tamanho, opcoes.toleranciaModelo ?? 0.05, avisar);
  return carregado;
}

/** Compara a bbox REAL do modelo carregado com o `tamanho` declarado.
 *
 * Avisa e NÃO corrige. Previsibilidade de layout vem primeiro: o `tamanho`
 * declarado é o que o core já usou para posicionar tudo, exatamente como
 * `width`/`height` num `<img>`. Reescalar em silêncio faria a cena calculada
 * e a cena desenhada discordarem. */
function conferirTamanhoDeclarado(
  noId: string,
  objeto: THREE.Object3D,
  declarado: Vec3,
  tolerancia: number,
  avisar: (a: AvisoBackend) => void,
): void {
  const caixa = new THREE.Box3().setFromObject(objeto);
  if (caixa.isEmpty()) return;
  const real = new THREE.Vector3();
  caixa.getSize(real);
  const medido: Vec3 = [real.x, real.y, real.z];
  const divergentes = [0, 1, 2].filter((i) => {
    const d = declarado[i] ?? 0;
    const r = medido[i] ?? 0;
    const base = Math.max(Math.abs(d), Math.abs(r), 1e-6);
    return Math.abs(d - r) / base > tolerancia;
  });
  if (divergentes.length === 0) return;
  const f = (v: Vec3) => v.map((x) => Math.round(x * 1000) / 1000).join(" × ");
  avisar({
    motivo: "bbox-divergente",
    noId,
    texto:
      `'${noId}': a bbox real do modelo (${f(medido)} m) diverge do tamanho ` +
      `declarado (${f(declarado)} m) nos eixos ${divergentes.map((i) => "xyz"[i]).join(", ")}. ` +
      `O layout usou o valor DECLARADO; nada foi reescalado. Ajuste o ` +
      `'tamanho' do nó ou o arquivo de origem.`,
  });
}

/** Carregador padrão: GLTF/GLB por `fetch`/`file:`. Importado sob demanda
 * para que uma cena sem nós `model` não puxe os addons do Three.js. */
const carregadorGLTFPadrao: CarregarModelo = async (src) => {
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(src);
  return gltf.scene;
};

export function construirMaterial(m: Material | undefined): THREE.Material {
  const cor = new THREE.Color(m?.cor ?? "#cccccc");
  const opacidade = m?.opacidade ?? 1;
  return new THREE.MeshStandardMaterial({
    color: cor,
    metalness: m?.metalico ?? 0,
    roughness: m?.rugosidade ?? 1,
    opacity: opacidade,
    transparent: opacidade < 1,
    wireframe: m?.aramado ?? false,
    side: THREE.DoubleSide,
  });
}
