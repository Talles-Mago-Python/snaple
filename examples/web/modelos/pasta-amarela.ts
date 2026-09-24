import { Cena, type NoRef } from "@snaple/core";

// Pasta de arquivos amarela, fechada, deitada no chão.
// Dobra = +z (sul); aba com etiqueta = -z (norte), no terço da direita (+x).

type V3 = [number, number, number];
type XZ = [number, number];
type Material = { cor: string; metalico?: number; rugosidade?: number; opacidade?: number };
type NomeFace = "topo" | "base" | "norte" | "sul" | "leste" | "oeste";

const TAU = 2 * Math.PI;

// ---- medidas (m) ----
const ESP = 0.0004;           // espessura do cartão
const LARGURA = 0.305;        // x
const PROF_FUNDO = 0.235;     // z: painel de trás
const PROF_FRENTE = 0.225;    // z: painel da frente, 1 cm mais baixo (deixa a borda de trás à mostra)
const LARG_ABA = 0.1;
const SAIDA_ABA = 0.014;      // quanto a aba passa da borda
const EMBUTE_ABA = 0.003;     // quanto a aba entra no painel (esconde a emenda)
const X_ABA = 0.07;
const R_ABA = 0.003;
const VINCOS = [0.006, 0.012]; // vincos da dobra, medidos a partir da borda +z

const arco = (r: number, a0: number, a1: number, n: number, cx: number, cz: number): XZ[] =>
  Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
  });
const retArredondado = (w: number, d: number, r: number, seg = 6): XZ[] => {
  const x = w / 2 - r, z = d / 2 - r;
  return [
    ...arco(r, 0, TAU / 4, seg, x, z),
    ...arco(r, TAU / 4, TAU / 2, seg, -x, z),
    ...arco(r, TAU / 2, (3 * TAU) / 4, seg, -x, -z),
    ...arco(r, (3 * TAU) / 4, TAU, seg, x, -z),
  ];
};

export function montarCena(): Cena {
  const cena = new Cena();

  const M = {
    cartao: { cor: "#f0c63c", rugosidade: 0.85 },
    vinco: { cor: "#d3a82a", rugosidade: 0.9 },
    etiqueta: { cor: "#fbf8ef", rugosidade: 0.7 },
    escrita: { cor: "#5a5a5a", rugosidade: 0.9 },
  } satisfies Record<string, Material>;

  const fixar = (dono: NoRef, face: NomeFace, alvo: NoRef, u = 0, v = 0): NoRef => {
    dono.face(face).colocar(alvo, { u, v });
    cena.acoplar({ tipo: "contato", a: { no: dono, face }, b: { no: alvo, face: "base" } });
    return alvo;
  };
  const caixa = (nome: string, [l, a, p]: V3, m: Material): NoRef =>
    cena.criar("box", { largura: l, altura: a, profundidade: p }, { nome, material: m });

  // painel de trás: raiz, apoiado no chão
  const pasta = cena.criar(
    "box",
    { largura: LARGURA, altura: ESP, profundidade: PROF_FUNDO },
    { nome: "pasta", material: M.cartao, transform: { posicao: [0, ESP / 2, 0] } },
  );

  // painel da frente, alinhado na dobra (+z)
  const frente = fixar(pasta, "topo", caixa("painel da frente", [LARGURA, ESP, PROF_FRENTE], M.cartao), 0, (PROF_FUNDO - PROF_FRENTE) / 2);

  // dobra: cilindro deitado em x cobrindo as duas espessuras
  cena.criar(
    "cylinder",
    { raioTopo: ESP, raioBase: ESP, altura: LARGURA, segmentos: 16 },
    { pai: pasta, nome: "dobra", material: M.cartao, transform: { posicao: [0, ESP / 2, PROF_FUNDO / 2 + ESP], rotacao: [0, 0, Math.PI / 2] } },
  );
  for (const d of VINCOS)
    fixar(frente, "topo", caixa("vinco", [LARGURA, 0.00005, 0.0006], M.vinco), 0, PROF_FRENTE / 2 - d);

  // aba: mesma espessura e plano do painel de trás, entrando 3 mm nele
  const profAba = SAIDA_ABA + EMBUTE_ABA;
  const aba = cena.criar(
    "extrude",
    { perfil: retArredondado(LARG_ABA, profAba, R_ABA), altura: ESP },
    { pai: pasta, nome: "aba", material: M.cartao, transform: { posicao: [X_ABA, 0, -PROF_FUNDO / 2 - profAba / 2 + EMBUTE_ABA], rotacao: [0, 0, 0] } },
  );

  // etiqueta na parte da aba que fica para fora, com duas linhas escritas
  const etiqueta = fixar(aba, "topo", caixa("etiqueta", [LARG_ABA - 0.014, 0.0001, SAIDA_ABA - 0.005], M.etiqueta), 0, -EMBUTE_ABA / 2);
  fixar(etiqueta, "topo", caixa("escrita da etiqueta", [0.05, 0.00003, 0.0012], M.escrita), -0.012, -0.0015);
  fixar(etiqueta, "topo", caixa("escrita da etiqueta", [0.03, 0.00003, 0.0012], M.escrita), -0.022, 0.0015);

  return cena;
}
