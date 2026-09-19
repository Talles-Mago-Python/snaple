/** Setup do viewer: renderer, luz, grid, eixos, controles e enquadramento.
 * Nada daqui é específico da cena — mexa em `cena.ts`, não aqui. */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ID_RAIZ, type Cena } from "@snaple/core";
import { construirCena, type AvisoBackend } from "@snaple/three";

export interface Viewer {
  /** Troca a cena exibida e reenquadra a câmera. */
  mostrar(cena: Cena): Promise<AvisoBackend[]>;
}

export function criarViewer(canvas: HTMLCanvasElement): Viewer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const palco = new THREE.Scene();
  palco.background = new THREE.Color("#1b1d21");

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
  const controles = new OrbitControls(camera, canvas);
  controles.enableDamping = true;

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

  async function mostrar(cena: Cena): Promise<AvisoBackend[]> {
    if (atual) {
      palco.remove(atual);
      descartar(atual);
    }
    const { objeto, avisos } = await construirCena(cena);
    objeto.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    palco.add(objeto);
    atual = objeto;
    enquadrar(cena);
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
  }
  new ResizeObserver(redimensionar).observe(canvas);
  redimensionar();

  renderer.setAnimationLoop(() => {
    controles.update();
    renderer.render(palco, camera);
  });

  return { mostrar };
}

/** Libera geometrias e materiais da cena anterior — sem isto, cada
 * hot-reload vazaria buffers na GPU. */
function descartar(raiz: THREE.Object3D): void {
  raiz.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
}
