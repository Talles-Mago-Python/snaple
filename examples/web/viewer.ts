/** Setup do viewer: renderer, luz, grid, eixos, controles e enquadramento.
 * Nada daqui é específico da cena — mexa nos modelos em `modelos/`, não aqui. */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { ID_RAIZ, type Cena } from "@snaple/core";
import { construirCena, configurarAcao, type AnimacaoConstruida, type AvisoBackend } from "@snaple/three";
import { exportarIFC } from "@snaple/ifc";

export type FormatoExportacao = "glb" | "obj" | "stl" | "ifc";

export interface Viewer {
  /** Troca a cena exibida e reenquadra a câmera. */
  mostrar(cena: Cena): Promise<AvisoBackend[]>;
  /** Exporta a cena atualmente exibida e dispara o download no navegador.
   * Lança se nenhuma cena foi montada ainda. */
  exportar(formato: FormatoExportacao): Promise<void>;
  /** Nomes das animações da cena exibida. */
  animacoes(): string[];
  /** Toca a animação `nome` do começo (`null` para e volta à pose parada). */
  tocar(nome: string | null): void;
  /** Pausa/retoma a animação atual; devolve se ficou tocando. */
  alternarPausa(): boolean;
}

export function criarViewer(canvas: HTMLCanvasElement): Viewer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // cena e luzes ficam paradas enquanto a câmera orbita: o shadow map só é
  // refeito quando `mostrar`/`enquadrar` mudam algo, não a cada frame (o que
  // desenhava todas as malhas duas vezes por frame)
  renderer.shadowMap.autoUpdate = false;

  const palco = new THREE.Scene();
  palco.background = new THREE.Color("#1b1d21");

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
  const controles = new OrbitControls(camera, canvas);
  controles.enableDamping = true;

  // render sob demanda: parado, o viewer não gasta GPU nenhuma
  let sujo = true;
  const pedirRender = () => { sujo = true; };
  controles.addEventListener("change", pedirRender);

  // ── referência espacial ────────────────────────────────────────────────
  // grid no plano y=0 e eixos na origem: +x vermelho, +y verde, +z azul,
  // que é a convenção leste / cima / sul do snaple
  const grid = new THREE.GridHelper(10, 10, "#5a6472", "#33383f");
  palco.add(grid);
  const eixos = new THREE.AxesHelper(1);
  eixos.position.y = 0.001; // evita z-fighting com o grid
  palco.add(eixos);

  // ── luz ────────────────────────────────────────────────────────────────
  palco.add(new THREE.AmbientLight("#ffffff", 1.4));
  const sol = new THREE.DirectionalLight("#fff6e8", 2.4);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  palco.add(sol);
  palco.add(sol.target);
  // uma segunda luz fraca do lado oposto, só para as faces em sombra não
  // virarem silhueta preta
  const preenchimento = new THREE.DirectionalLight("#cfe0ff", 0.6);
  palco.add(preenchimento);

  const chaoSombra = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShadowMaterial({ opacity: 0.35 }),
  );
  chaoSombra.rotation.x = -Math.PI / 2;
  chaoSombra.receiveShadow = true;
  palco.add(chaoSombra);

  let atual: THREE.Object3D | null = null;
  let cenaAtual: Cena | null = null;
  let clipes: AnimacaoConstruida[] = [];
  let mixer: THREE.AnimationMixer | null = null;
  let acao: THREE.AnimationAction | null = null;
  const relogio = new THREE.Clock();

  async function mostrar(cena: Cena): Promise<AvisoBackend[]> {
    tocar(null);
    if (atual) {
      palco.remove(atual);
      descartar(atual);
    }
    cenaAtual = cena;
    const { objeto, avisos, animacoes } = await construirCena(cena);
    objeto.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        // a película de um adesivo fica a 0,1 mm da peça: se projetasse
        // sombra, sombrearia a própria superfície embaixo dela
        o.castShadow = !o.userData.snapleAdesivo;
        o.receiveShadow = true;
      }
    });
    palco.add(objeto);
    atual = objeto;
    clipes = animacoes;
    mixer = new THREE.AnimationMixer(objeto);
    enquadrar(cena);
    renderer.shadowMap.needsUpdate = true;
    pedirRender();
    return avisos;
  }

  /** Enquadra a partir da bounding box TOTAL que o core calculou — não de
   * uma posição fixa. Serve para qualquer cena que entre depois.
   *
   * Ajusta a distância pelos 8 cantos da caixa contra os dois campos de
   * visão (vertical e horizontal), em vez de usar a esfera envolvente: a
   * esfera de uma caixa é o raio até o CANTO, o que deixa a cena pequena no
   * meio de um frame vazio. */
  function enquadrar(cena: Cena): void {
    redimensionar();
    const caixa = cena.bbox(ID_RAIZ);
    const centro = new THREE.Vector3(...caixa.centro);
    const meio = new THREE.Vector3(...caixa.tamanho).multiplyScalar(0.5);
    const raio = Math.max(meio.length(), 0.25);

    // olhando do sudeste e de cima, para as três dimensões ficarem legíveis
    const direcao = new THREE.Vector3(1, 0.75, 1).normalize();
    const frente = direcao.clone().negate();
    const direita = new THREE.Vector3().crossVectors(frente, new THREE.Vector3(0, 1, 0)).normalize();
    const cima = new THREE.Vector3().crossVectors(direita, frente).normalize();

    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * camera.aspect;

    // a câmera fica em `centro + direcao * d`; para um canto `p` (relativo ao
    // centro), a profundidade dele é `d - p·direcao`, e ele cabe no frame se
    // |p·direita| ≤ tanH · profundidade (idem na vertical)
    let distancia = 0;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const p = new THREE.Vector3(meio.x * sx, meio.y * sy, meio.z * sz);
          const ao = p.dot(direcao);
          distancia = Math.max(
            distancia,
            Math.abs(p.dot(direita)) / tanH + ao,
            Math.abs(p.dot(cima)) / tanV + ao,
          );
        }
      }
    }
    distancia = Math.max(distancia * 1.08, 0.5);

    camera.position.copy(centro).addScaledVector(direcao, distancia);
    camera.near = Math.max(distancia / 2000, 0.001);
    camera.far = (distancia + raio) * 4;
    camera.updateProjectionMatrix();

    controles.target.copy(centro);
    controles.update();

    // grid, eixos e chão de sombra acompanham a escala da cena
    const lado = Math.max(4, Math.ceil(Math.max(caixa.tamanho[0], caixa.tamanho[2]) * 2));
    grid.scale.setScalar(lado / 10);
    eixos.scale.setScalar(Math.max(0.3, raio * 0.35));
    chaoSombra.scale.setScalar(lado * 2);

    sol.position.copy(centro).add(new THREE.Vector3(raio * 2, raio * 3, raio * 1.5));
    sol.target.position.copy(centro);
    const extensao = raio * 2.5;
    sol.shadow.camera.left = -extensao;
    sol.shadow.camera.right = extensao;
    sol.shadow.camera.top = extensao;
    sol.shadow.camera.bottom = -extensao;
    sol.shadow.camera.far = raio * 12;
    sol.shadow.camera.updateProjectionMatrix();
    preenchimento.position.copy(centro).add(new THREE.Vector3(-raio * 2, raio, -raio * 2));
  }

  function redimensionar(): void {
    const { clientWidth: l, clientHeight: a } = canvas;
    if (l === 0 || a === 0) return;
    renderer.setSize(l, a, false);
    camera.aspect = l / a;
    camera.updateProjectionMatrix();
    pedirRender();
  }
  new ResizeObserver(redimensionar).observe(canvas);
  redimensionar();

  function tocar(nome: string | null): void {
    acao?.stop();
    acao = null;
    const c = nome === null ? undefined : clipes.find((x) => x.nome === nome);
    if (c && mixer) {
      acao = configurarAcao(mixer.clipAction(c.clip), c.repetir).play();
      relogio.getDelta(); // zera o delta acumulado enquanto estava parado
    }
    renderer.shadowMap.needsUpdate = true;
    pedirRender();
  }

  function alternarPausa(): boolean {
    if (!acao) return false;
    acao.paused = !acao.paused;
    relogio.getDelta();
    return !acao.paused;
  }

  renderer.setAnimationLoop(() => {
    controles.update(); // com damping, dispara "change" enquanto a inércia dura
    const delta = relogio.getDelta();
    if (mixer && acao && !acao.paused && acao.isRunning()) {
      mixer.update(delta);
      // as peças se movem: sombra e quadro precisam ser refeitos
      renderer.shadowMap.needsUpdate = true;
      sujo = true;
    }
    if (!sujo) return;
    sujo = false;
    renderer.render(palco, camera);
  });

  /** Exporta a cena no formato pedido e baixa o arquivo. `glb`/`obj`/`stl`
   * usam o exportador oficial do Three.js sobre `atual` (o `THREE.Object3D`
   * que `construirCena` já produziu, com luz/grid/chão de fora); `ifc` é
   * diferente — não conhece Three.js, exporta a partir da `Cena` do snaple
   * original (`cenaAtual`), via `@snaple/ifc`. */
  async function exportar(formato: FormatoExportacao): Promise<void> {
    if (formato === "ifc") {
      if (!cenaAtual) throw new Error("nenhuma cena montada ainda — não há o que exportar");
      baixar(exportarIFC(cenaAtual), "cena.ifc", "application/x-step");
      return;
    }
    if (!atual) throw new Error("nenhuma cena montada ainda — não há o que exportar");
    switch (formato) {
      case "glb": {
        const dados = await new Promise<ArrayBuffer>((resolve, reject) => {
          new GLTFExporter().parse(
            atual!,
            (resultado) => resolve(resultado as ArrayBuffer),
            (erro) => reject(erro instanceof Error ? erro : new Error(String(erro))),
            { binary: true, animations: clipes.map((c) => c.clip) },
          );
        });
        baixar(dados, "cena.glb", "model/gltf-binary");
        break;
      }
      case "obj": {
        const texto = new OBJExporter().parse(atual);
        baixar(texto, "cena.obj", "text/plain");
        break;
      }
      case "stl": {
        // ASCII, não binário: mais fácil de conferir num editor de texto,
        // e o ganho de tamanho do binário não importa para uma cena de
        // demonstração como esta.
        const texto = new STLExporter().parse(atual);
        baixar(texto, "cena.stl", "model/stl");
        break;
      }
      default: {
        const _exaustivo: never = formato;
        throw new Error(`formato de exportação desconhecido: '${String(_exaustivo)}'`);
      }
    }
  }

  return { mostrar, exportar, animacoes: () => clipes.map((c) => c.nome), tocar, alternarPausa };
}

/** Dispara o download de `conteudo` no navegador via um link `<a>` efêmero —
 * não há endpoint de servidor aqui, é tudo estático no cliente. */
function baixar(conteudo: BlobPart, nomeArquivo: string, tipoMime: string): void {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

/** Libera geometrias e materiais da cena anterior — sem isto, cada
 * hot-reload vazaria buffers na GPU. */
function descartar(raiz: THREE.Object3D): void {
  raiz.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      (m as THREE.MeshStandardMaterial).map?.dispose();
      m.dispose();
    }
  });
}
