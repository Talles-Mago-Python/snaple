/**
 * Clareira low poly — exemplo do guia `docs/guia-low-poly.md`.
 *
 * Uma ilha de grama com uma casinha, três pinheiros e duas pedras. Tudo com
 * poucos segmentos e cor chapada (`facetado`, sem textura): o estilo vem
 * da silhueta, não do detalhe.
 */
import { Cena, type Material, type NoRef, colocarSobre } from "@snaple/core";

type V2 = [number, number];

/** Paleta curta: 2 tons por material (luz/sombra), nada além disso. */
const PALETA = {
  grama: "#7bb661", gramaEscura: "#5c9447",
  terra: "#8a6a4a",
  tronco: "#6b4a32",
  folha: "#2f7d4f", folhaClara: "#3f9a5f",
  pedra: "#9aa0a6",
  parede: "#efe3c8", telhado: "#c4553f", porta: "#5a3b28",
};

const chapado = (cor: string): Material => ({ cor, rugosidade: 1, metalico: 0, facetado: true });

/** Polígono regular de `n` lados — extrudado, vira prisma com faces planas. */
function poligono(raio: number, n: number, fase = 0): V2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = fase + (i / n) * 2 * Math.PI;
    return [raio * Math.cos(a), raio * Math.sin(a)] as V2;
  });
}

/** Contorno irregular determinístico (sem Math.random: o modelo tem que
 * sair igual toda vez). `jitter` é a fração do raio que cada vértice varia. */
function irregular(raio: number, n: number, jitter: number, semente: number): V2[] {
  return poligono(raio, n).map(([x, z], i) => {
    const k = 1 + jitter * Math.sin(semente * 12.9898 + i * 78.233);
    return [x * k, z * k] as V2;
  });
}

/** Pinheiro com a base do tronco no ponto (u, v) do topo de `chao`. */
function pinheiro(cena: Cena, nome: string, altura: number, chao: NoRef, u: number, v: number): NoRef {
  const tronco = cena.criar("cylinder",
    { raioTopo: 0.05 * altura, raioBase: 0.07 * altura, altura: 0.25 * altura, segmentos: 5 },
    { nome: `${nome}_tronco`, material: chapado(PALETA.tronco) });
  chao.face("topo").colocar(tronco, { u, v, orientar: false, reparentar: false });
  // três cones de 6 lados, cada um menor e girado meio lado em relação ao
  // de baixo: as arestas não se alinham e a copa não parece um lápis
  const niveis: Array<[number, number, string]> = [
    [0.38, 0.45, PALETA.folha], [0.3, 0.38, PALETA.folhaClara], [0.2, 0.32, PALETA.folha],
  ];
  let base = tronco;
  niveis.forEach(([r, h, cor], i) => {
    const cone = cena.criar("cone", { raio: r * altura, altura: h * altura, segmentos: 6 }, {
      nome: `${nome}_copa_${i}`, material: chapado(cor),
      transform: { rotacao: [0, (i * Math.PI) / 6, 0] },
    });
    // camadas sobrepostas de propósito: cada uma afunda 40% na de baixo
    const afundar = i === 0 ? 0 : 0.4 * niveis[i - 1]![1] * altura;
    colocarSobre(cone, base, { gap: -afundar });
    if (i > 0) cone.permitirContato(base);
    base = cone;
  });
  return tronco;
}

export function montarCena(): Cena {
  const cena = new Cena();

  // ilha: prisma irregular de 9 lados (grama) sobre outro mais estreito (terra)
  const terra = cena.criar("extrude", { perfil: irregular(2.1, 9, 0.12, 3), altura: 0.4 }, {
    nome: "ilha_terra", material: chapado(PALETA.terra),
  });
  const grama = cena.criar("extrude", { perfil: irregular(2.4, 9, 0.1, 7), altura: 0.12 }, {
    nome: "ilha_grama", material: chapado(PALETA.grama),
  });
  colocarSobre(grama, terra);
  const topo = grama.face("topo");
  const soltar = { orientar: false, reparentar: false };

  // casinha: caixa + telhado em prisma triangular (extrude deitado)
  const casa = cena.criar("box", { largura: 0.8, altura: 0.6, profundidade: 0.7 }, {
    nome: "casa", material: chapado(PALETA.parede),
  });
  topo.colocar(casa, { u: -0.5, v: 0.3, ...soltar });
  const telhado = cena.criar("extrude", {
    perfil: [[-0.5, 0], [0.5, 0], [0, 0.45]], altura: 0.85,
  }, {
    nome: "casa_telhado", material: chapado(PALETA.telhado),
    // o perfil vive no plano XZ e cresce em +y; −90° em x põe a cumeeira
    // para cima e deita o prisma ao longo de z
    transform: { rotacao: [-Math.PI / 2, 0, 0] },
  });
  colocarSobre(telhado, casa);
  const porta = cena.criar("box", { largura: 0.18, altura: 0.32, profundidade: 0.02 }, {
    nome: "casa_porta", material: chapado(PALETA.porta),
  });
  // v = −0,14: centro da porta 0,16 acima do pé da parede (0,6/2 − 0,16)
  casa.face("sul").colocar(porta, { v: -0.14, ...soltar });

  // pinheiros de alturas diferentes: repetição sem cópia exata
  const pinheiros: Array<[number, number, number]> = [[0.9, -0.6, 1.2], [1.4, 0.3, 0.9], [0.1, -1.5, 1.0]];
  pinheiros.forEach(([u, v, h], i) => pinheiro(cena, `pinheiro_${i}`, h, grama, u, v));

  // pedras: esfera de 5 segmentos achatada (escala y) = seixo facetado
  const pedras: Array<[number, number, number]> = [[-1.3, -0.7, 0.22], [-1.0, -1.1, 0.13]];
  pedras.forEach(([u, v, r], i) => {
    const pedra = cena.criar("sphere", { raio: r, segmentos: 5 }, {
      nome: `pedra_${i}`, material: chapado(PALETA.pedra),
      transform: { escala: [1, 0.6, 1], rotacao: [0, i * 0.7, 0] },
    });
    topo.colocar(pedra, { u, v, ...soltar });
  });

  return cena;
}
