/**
 * Vitrine de textura, adesivo e animação — uma mesa de madeira com um
 * monitor, uma lata girando, uma caneca com alça e uma caixa que abre.
 * Metros, +Y para cima, rotação Euler XYZ em radianos.
 *
 * As imagens ficam em `examples/web/public/texturas/` (o Vite serve essa
 * pasta na raiz do site, por isso o `src` começa em `texturas/`).
 */
import { Cena } from "@snaple/core";

const M = {
  metal: { cor: "#9aa5ab", metalico: 0.7, rugosidade: 0.35 },
  plastico: { cor: "#23262b", metalico: 0.1, rugosidade: 0.6 },
  ceramica: { cor: "#f3efe6", metalico: 0, rugosidade: 0.4 },
  papelao: { cor: "#b88a57", metalico: 0, rugosidade: 0.9 },
};

export function montarCena(): Cena {
  const cena = new Cena();

  // ── mesa: `textura` repete a madeira pelo tampo inteiro ────────────────
  const tampo = cena.criar("box", { largura: 1.2, altura: 0.04, profundidade: 0.6 }, {
    nome: "tampo", transform: { posicao: [0, 0.72, 0] },
    material: { textura: { src: "texturas/madeira.png", repetir: [3, 1.5] }, rugosidade: 0.7 },
  });
  for (const [u, v] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]] as const) {
    const perna = cena.criar("cylinder", { raioTopo: 0.02, raioBase: 0.02, altura: 0.7 }, { nome: "perna", material: M.metal });
    tampo.face("base").colocar(perna, { u, v });
  }

  // ── monitor: adesivo numa face plana (a tela) ──────────────────────────
  const monitor = cena.criar("box", { largura: 0.5, altura: 0.3, profundidade: 0.025 }, { nome: "monitor", material: M.plastico });
  const pe = cena.criar("box", { largura: 0.16, altura: 0.012, profundidade: 0.12 }, { nome: "pé do monitor", material: M.plastico });
  tampo.face("topo").colocar(pe, { u: -0.3, v: -0.15 });
  pe.face("topo").colocar(monitor, { gap: 0.08 });
  const haste = cena.criar("box", { largura: 0.03, altura: 0.08, profundidade: 0.015 }, { nome: "haste", material: M.metal });
  pe.face("topo").colocar(haste);
  monitor.colarAdesivo({ src: "texturas/tela.png", face: "sul", largura: 0.47, altura: 0.27 });
  const led = cena.criar("sphere", { raio: 0.004 }, { nome: "led", material: { cor: "#1c7a2e" } });
  // meio embutido na moldura (gap negativo): é o monitor que o segura
  monitor.face("sul").colocar(led, { u: -0.22, v: -0.14, orientar: false, gap: -0.002 });

  // ── lata: adesivo na lateral curva, girando dentro de uma junta ────────
  const giro = cena.criar("junta", { eixo: "y", angulo: 0 }, { nome: "giro da lata" });
  const lata = giro.criar("cylinder", { raioTopo: 0.033, raioBase: 0.033, altura: 0.12, segmentos: 48 }, { nome: "lata", material: M.metal });
  lata.colarAdesivo({ src: "texturas/rotulo.png", face: "lateral", altura: 0.1 });
  tampo.face("topo").colocar(giro, { u: 0.1, v: 0.1 });

  // ── caneca: adesivo em parte da lateral de um lathe + alça em sweep ────
  const caneca = cena.criar("lathe", {
    perfil: [[0.001, 0], [0.04, 0], [0.042, 0.005], [0.042, 0.1], [0.038, 0.1], [0.038, 0.008], [0.001, 0.008]],
  }, { nome: "caneca", material: M.ceramica });
  tampo.face("topo").colocar(caneca, { u: 0.3, v: 0.15 });
  // logo de 5 cm de arco, virado para +z (u = 0 é a frente)
  caneca.colarAdesivo({ src: "texturas/logo.png", face: "lateral", u: 0, v: 0.005, largura: 0.05, altura: 0.05 });
  const alca = caneca.criar("sweep", {
    caminho: [[0.041, 0.03, 0], [0.07, 0.035, 0], [0.075, 0.065, 0], [0.041, 0.075, 0]],
    suavizar: true, recentrar: false, secao: { tipo: "retangulo", largura: 0.012, altura: 0.006 }, cima: [0, 0, 1],
  }, { nome: "alça", material: M.ceramica });
  alca.girar([0, Math.PI / 2, 0]).permitirContato(caneca);

  // ── caixa com tampa: junta na borda de trás (dobradiça) ────────────────
  const corpo = cena.criar("box", { largura: 0.2, altura: 0.1, profundidade: 0.14 }, { nome: "caixa", material: M.papelao });
  tampo.face("topo").colocar(corpo, { u: 0.4, v: -0.12 });
  const dobradica = corpo.criar("junta", { eixo: "x", angulo: 0, limites: [-1.9, 0] }, {
    nome: "dobradiça", transform: { posicao: [0, 0.05, -0.07] },
  });
  dobradica.criar("box", { largura: 0.2, altura: 0.008, profundidade: 0.14 }, {
    nome: "tampa", material: M.papelao, transform: { posicao: [0, 0.004, 0.07] },
  });

  // ── animações ─────────────────────────────────────────────────────────
  // uma volta inteira na lata: é `angulo` de junta, que interpola o próprio
  // ângulo (uma `rotacao` de 0 a 2π não sairia do lugar — mesma orientação)
  cena.animar("vitrine", { duracao: 4, repetir: "sempre" })
    .faixa(giro, "angulo", [[0, 0], [4, 2 * Math.PI]])
    .faixa(dobradica, "angulo", [[0, 0], [1.2, -1.3], [2.6, -1.3], [4, 0]], { interpolacao: "suave" })
    .faixa(led, "cor", [[0, "#2bff55"], [0.5, "#0c3014"], [1, "#2bff55"], [1.5, "#0c3014"]], { interpolacao: "degrau" });

  cena.animar("só a tampa", { repetir: "vaivem" })
    .faixa(dobradica, "angulo", [[0, 0], [1.5, -1.3]], { interpolacao: "suave" });

  return cena;
}

