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
  Cena, derivarAdesivos, derivarGeometria, rotacaoEfetiva,
  type CenaJSON, type Material, type No, type ParamsModel, type Vec3,
} from "@snaple/core";
import { construirGeometrias, caixaProxy } from "./geometria.ts";
import {
  CacheImagens, type CarregarTextura, carregadorTexturaPadrao, configurarTextura, geometriaAdesivo, materialAdesivo,
} from "./aparencia.ts";
import { type AnimacaoConstruida, construirAnimacoes } from "./animacao.ts";

export { construirGeometrias, caixaProxy } from "./geometria.ts";
export { type CarregarTextura, carregadorTexturaPadrao } from "./aparencia.ts";
export { type AnimacaoConstruida, configurarAcao } from "./animacao.ts";

export type MotivoAviso =
  | "modelo-ausente" | "bbox-divergente" | "geometria-falhou" | "textura-ausente" | "adesivo-falhou";

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
  /** Reaproveitar geometria e material entre nós com a MESMA receita
   * (mesmos params/furos, mesmo `material`)? Padrão `true`: uma cena com 500
   * parafusos iguais vira 1 geometria e 1 material na GPU, não 500 de cada.
   * Desligue se o seu código altera `mesh.material`/`mesh.geometry` de um nó
   * esperando não afetar os outros (ex.: realce de seleção mudando a cor) —
   * ou troque o material do nó em vez de mexer nele. */
  compartilhar?: boolean;
  /** Carregador das imagens de `textura`/`adesivos`. Padrão:
   * `THREE.TextureLoader` no navegador; fora dele não há imagem (aviso
   * `textura-ausente`, e a peça sai só com a cor). */
  carregarTextura?: CarregarTextura;
  /** Amostras por segundo das animações. Padrão 30. */
  fpsAnimacao?: number;
}

export interface ResultadoConstrucao {
  objeto: THREE.Object3D;
  avisos: AvisoBackend[];
  /** Um clipe por animação da cena, pronto para um `THREE.AnimationMixer`
   * sobre `objeto` (e para o `GLTFExporter`, opção `animations`). */
  animacoes: AnimacaoConstruida[];
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
  const ctx: Contexto = {
    cena,
    opcoes,
    avisar: (a) => {
      avisos.push(a);
      opcoes.aoAvisar?.(a);
    },
    compartilhar: opcoes.compartilhar !== false,
    geometrias: new Map(),
    materiais: new Map(),
    imagens: new CacheImagens(opcoes.carregarTextura ?? carregadorTexturaPadrao),
    objetos: new Map(),
  };
  const objeto = await construirNo(ctx, cena.raiz);
  const animacoes = construirAnimacoes(cena, ctx.objetos, opcoes.fpsAnimacao ?? 30);
  return { objeto, avisos, animacoes };
}

/** Estado de uma construção: caches por receita serializada (geometria e
 * material só são compartilhados com `compartilhar`; imagem, sempre) e o
 * objeto de cada nó, que as animações usam como alvo. */
interface Contexto {
  cena: Cena;
  opcoes: OpcoesConstruir;
  avisar: (a: AvisoBackend) => void;
  compartilhar: boolean;
  geometrias: Map<string, THREE.BufferGeometry[]>;
  materiais: Map<string, Promise<THREE.Material>>;
  imagens: CacheImagens;
  objetos: Map<string, THREE.Object3D>;
}

async function construirNo(ctx: Contexto, no: No): Promise<THREE.Object3D> {
  const raiz = await corpoDoNo(ctx, no);
  await colarAdesivos(ctx, no, raiz);
  ctx.objetos.set(no.id, raiz);
  raiz.name = no.nome ? `${no.id} (${no.nome})` : no.id;
  raiz.userData.snaple = { id: no.id, tipo: no.tipo, ...(no.nome ? { nome: no.nome } : {}) };
  const t = no.transform;
  raiz.position.set(t.posicao[0], t.posicao[1], t.posicao[2]);
  const rotacao = rotacaoEfetiva(no);
  raiz.rotation.set(rotacao[0], rotacao[1], rotacao[2], "XYZ");
  raiz.scale.set(t.escala[0], t.escala[1], t.escala[2]);
  // em paralelo: só faz diferença com vários `model` carregando por rede,
  // e `Promise.all` preserva a ordem dos filhos
  const filhos = await Promise.all(no.filhos.map((f) => construirNo(ctx, f)));
  if (filhos.length) raiz.add(...filhos);
  return raiz;
}

async function corpoDoNo(ctx: Contexto, no: No): Promise<THREE.Object3D> {
  if (no.tipo === "model") {
    return modeloOuProxy(no, ctx.opcoes, ctx.avisar);
  }
  let geometrias: THREE.BufferGeometry[];
  try {
    const derivada = derivarGeometria(ctx.cena, no);
    const chave = ctx.compartilhar ? JSON.stringify(derivada) : null;
    const pronta = chave !== null ? ctx.geometrias.get(chave) : undefined;
    geometrias = pronta ?? construirGeometrias(derivada);
    if (chave !== null && !pronta) ctx.geometrias.set(chave, geometrias);
  } catch (e) {
    ctx.avisar({
      motivo: "geometria-falhou",
      noId: no.id,
      texto: `não foi possível gerar a geometria de '${no.id}': ${(e as Error).message}`,
    });
    return new THREE.Group();
  }
  if (geometrias.length === 0) return new THREE.Group();
  const material = await materialDoNo(ctx, no);
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

/** Material do nó, com a imagem de `textura` quando houver. Compartilhado
 * entre nós com o mesmo `material` (a promessa é o que fica em cache, para
 * dois nós iguais construídos em paralelo não carregarem duas vezes). */
function materialDoNo(ctx: Contexto, no: No): Promise<THREE.Material> {
  const m = no.material;
  const criar = async () => {
    const material = construirMaterial(m);
    if (m?.textura) {
      const r = await ctx.imagens.obter(m.textura.src);
      if ("erro" in r) {
        ctx.avisar({ motivo: "textura-ausente", noId: no.id, texto: `textura de '${no.id}': ${r.erro}; usando só a cor` });
      } else {
        (material as THREE.MeshStandardMaterial).map = configurarTextura(r.textura, m.textura);
        material.needsUpdate = true;
      }
    }
    return material;
  };
  if (!ctx.compartilhar) return criar();
  const chave = JSON.stringify(m ?? null);
  let p = ctx.materiais.get(chave);
  if (!p) ctx.materiais.set(chave, p = criar());
  return p;
}

/** Monta as películas dos adesivos do nó como filhas do objeto dele. */
async function colarAdesivos(ctx: Contexto, no: No, alvo: THREE.Object3D): Promise<void> {
  if (!no.adesivos?.length) return;
  let receitas;
  try {
    receitas = derivarAdesivos(no);
  } catch (e) {
    ctx.avisar({ motivo: "adesivo-falhou", noId: no.id, texto: `adesivos de '${no.id}': ${(e as Error).message}` });
    return;
  }
  await Promise.all(receitas.map(async (receita, i) => {
    const r = await ctx.imagens.obter(receita.src);
    if ("erro" in r) {
      ctx.avisar({ motivo: "textura-ausente", noId: no.id, texto: `adesivo ${i} de '${no.id}': ${r.erro}` });
      return;
    }
    const pelicula = new THREE.Mesh(geometriaAdesivo(receita), materialAdesivo(r.textura, no.material));
    pelicula.name = `${no.id}:adesivo${i}`;
    pelicula.userData.snapleAdesivo = { no: no.id, indice: i, src: receita.src };
    alvo.add(pelicula);
  }));
}

export function construirMaterial(m: Material | undefined): THREE.Material {
  // com imagem, a cor padrão é branca: a cor multiplica a textura
  const cor = new THREE.Color(m?.cor ?? (m?.textura ? "#ffffff" : "#cccccc"));
  const opacidade = m?.opacidade ?? 1;
  return new THREE.MeshStandardMaterial({
    color: cor,
    metalness: m?.metalico ?? 0,
    roughness: m?.rugosidade ?? 1,
    opacity: opacidade,
    transparent: opacidade < 1,
    wireframe: m?.aramado ?? false,
    flatShading: m?.facetado ?? false,
    side: THREE.DoubleSide,
    ...(m?.emissivo ? {
      emissive: new THREE.Color(m.emissivo.cor),
      emissiveIntensity: m.emissivo.intensidade ?? 1,
    } : {}),
  });
}
