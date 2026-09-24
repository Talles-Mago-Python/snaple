/** Cena complexa de teste: uma oficina.
 *
 * Existe para ESTRESSAR a lib, não para ser bonita. Exercita, numa cena só:
 * 8 das 9 geometrias paramétricas (todas menos `helix`) + `model`, furos
 * passantes / de profundidade parcial / de polígono, faces de topo, base e
 * laterais (com e sem reorientação), os três containers flex, e as sete
 * funções relacionais.
 *
 *   node examples/oficina.ts              # prosa + conferência no terminal
 *
 * Não aparece no viewer: o viewer só lista `examples/web/modelos/*.ts` que
 * exportam `montarCena()`, e este arquivo exporta `montarOficina()`.
 *
 * Planta (vista de cima, +x leste, +z sul):
 *
 *     ┌──── parede norte ────────────────┐
 *     │ bancada ▓▓▓▓▓▓▓▓     ○ latas     │   painel perfurado na parede,
 *     p                                  │   acima da bancada
 *     a              ● mesa redonda      │
 *     r   ▣ proxy      ● ● banquetas     │
 *     e                                  │
 *     d  ▤ armário            ▤ pilha    │
 *     └──────────────────────────────────┘
 */
import {
  Cena, alinhar, centralizarEm, circular, colocarSobre, distribuir,
  empilhar, encostar, type NoRef,
} from "@snaple/core";

const COR = {
  chao: "#6e6a63", parede: "#8d8578", madeira: "#9c6b45", madeiraEscura: "#7a5233",
  metal: "#9aa3ad", metalEscuro: "#5c6672", tinta: "#4a6b7c", claro: "#e8e2d8",
  destaque: "#c4703a",
} as const;

export function montarOficina(): Cena {
  const cena = new Cena();

  // ── Casca da sala ──────────────────────────────────────────────────────
  // 4 m (x) × 3 m (z), pé-direito 2.6 m. Duas paredes só: norte e oeste.
  const chao = cena.criar("plane", { largura: 4, profundidade: 3 },
    { nome: "chão", material: { cor: COR.chao } });

  const paredeNorte = cena.criar("box", { largura: 4, altura: 2.6, profundidade: 0.1 },
    { nome: "parede norte", transform: { posicao: [0, 1.3, -1.55] }, material: { cor: COR.parede } });

  const paredeOeste = cena.criar("box", { largura: 0.1, altura: 2.6, profundidade: 3 },
    { nome: "parede oeste", transform: { posicao: [-2.05, 1.3, 0] }, material: { cor: COR.parede } });

  // ── Bancada: face.base + grade (o caso que o protótipo Python errava) ──
  const bancada = cena.criar("box", { largura: 2.2, altura: 0.08, profundidade: 0.7 },
    { nome: "bancada", transform: { posicao: [-0.8, 0.87, -1.05] }, material: { cor: COR.madeira } });

  const pernasBancada = [0, 1, 2, 3].map(() =>
    cena.criar("box", { largura: 0.08, altura: 0.83, profundidade: 0.08 },
      { nome: "pé", material: { cor: COR.madeiraEscura } }));
  bancada.face("base").grade(pernasBancada, 2, 2, { gapEntre: 0.12 });

  // ── Painel perfurado na parede norte ───────────────────────────────────
  // O nó é autorado DEITADO: o +y local dele é o que aponta para fora da
  // face, então `altura` é a espessura da chapa.
  const painel = cena.criar("box", { largura: 1.2, altura: 0.012, profundidade: 0.5 },
    { nome: "painel perfurado", material: { cor: COR.metalEscuro } });
  paredeNorte.face("sul").colocar(painel, { u: 0, v: 0.3 });
  centralizarEm(painel, bancada, "x"); // o painel fica centrado sobre a bancada

  // 24 furos passantes numa grade — o furo é feito na face `topo` LOCAL do
  // painel, que depois de montado aponta para dentro da sala. A direção do
  // furo é local; a orientação no mundo não interfere.
  for (let coluna = 0; coluna < 8; coluna++) {
    for (let linha = 0; linha < 3; linha++) {
      painel.furar({
        face: "topo",
        forma: { tipo: "circulo", raio: 0.008, segmentos: 12 },
        u: -0.49 + coluna * 0.14,
        v: -0.16 + linha * 0.16,
      });
    }
  }

  // Três ganchos no painel, depois alinhados na mesma altura do mundo.
  const ganchos = [-0.35, 0, 0.35].map((u, i) =>
    cena.criar("cylinder", { raioTopo: 0.006, raioBase: 0.006, altura: 0.07, segmentos: 12 },
      { nome: "gancho", material: { cor: COR.metal } }));
  ganchos.forEach((gancho, i) => painel.face("topo").colocar(gancho, { u: -0.35 + i * 0.35, v: -0.05 - i * 0.04 }));
  alinhar(ganchos, "y", "center");

  // ── Prateleira na parede oeste ─────────────────────────────────────────
  // `orientar: false`: a prateleira é uma superfície HORIZONTAL presa numa
  // parede vertical. Sem isso ela nasceria girada, com o +y local dela
  // apontando para fora da parede.
  const prateleira = cena.criar("box", { largura: 0.25, altura: 0.03, profundidade: 1.0 },
    { nome: "prateleira", material: { cor: COR.madeira } });
  paredeOeste.face("leste").colocar(prateleira, { u: 0.6, v: 0.2, orientar: false });

  // Livros num `stack` (eixo Z, que é como a prateleira corre na parede),
  // com espessuras diferentes e espaçamento igual entre BORDAS.
  const fileira = cena.criar("stack",
    { extensao: 0.9, gap: 0.004, justify: "space-between", align: "start" },
    { nome: "fileira de livros", pai: prateleira.id });
  [0.035, 0.05, 0.028, 0.042, 0.06].forEach((espessura, i) =>
    fileira.criar("box", { largura: 0.16, altura: 0.2 + i * 0.012, profundidade: espessura },
      { nome: "livro", material: { cor: i % 2 ? COR.tinta : COR.destaque } }));
  prateleira.face("topo").colocar(fileira);

  // ── Coisas sobre a bancada ─────────────────────────────────────────────
  // `distribuir` no plano da face: quatro ferramentas de tamanhos diferentes,
  // espaçadas por igual pelas bordas, encostadas no tampo.
  const ferramentas: NoRef[] = [
    cena.criar("box", { largura: 0.22, altura: 0.05, profundidade: 0.09 },
      { nome: "plaina", material: { cor: COR.metalEscuro } }),
    cena.criar("cylinder", { raioTopo: 0.035, raioBase: 0.045, altura: 0.11, segmentos: 24 },
      { nome: "pote de pregos", material: { cor: COR.metal } }),
    cena.criar("torus", { raio: 0.05, raioTubo: 0.018, segmentos: 24, segmentosTubo: 12 },
      { nome: "rolo de fita", material: { cor: COR.destaque } }),
    cena.criar("cone", { raio: 0.06, altura: 0.13, segmentos: 20 },
      { nome: "funil", material: { cor: COR.claro } }),
  ];
  bancada.face("topo").distribuir(ferramentas, { eixo: "u", justify: "space-evenly", offset: 0.17 });

  // Chapa metálica com um rasgo de meia profundidade e um furo hexagonal
  // passante — a mesma peça exercitando os dois modos de furo.
  const chapa = cena.criar("box", { largura: 0.3, altura: 0.016, profundidade: 0.2 },
    { nome: "chapa", material: { cor: COR.metal, metalico: 0.8, rugosidade: 0.35 } });
  bancada.face("topo").colocar(chapa, { u: -0.75, v: -0.15 });
  chapa.furar({
    face: "topo",
    forma: { tipo: "retangulo", largura: 0.12, altura: 0.035 },
    u: -0.05, v: 0, profundidade: 0.008,
  });
  chapa.furar({
    face: "topo",
    forma: {
      tipo: "poligono",
      pontos: Array.from({ length: 6 }, (_, k) => {
        const a = (k / 6) * Math.PI * 2;
        return [Math.cos(a) * 0.022, Math.sin(a) * 0.022] as [number, number];
      }),
    },
    u: 0.1, v: 0,
  });

  // Suporte em L: perfil 2D no plano XZ local, extrudado em +y.
  const suporte = cena.criar("extrude", {
    perfil: [[0, 0], [0.13, 0], [0.13, 0.03], [0.03, 0.03], [0.03, 0.13], [0, 0.13]],
    altura: 0.1,
  }, { nome: "suporte", material: { cor: COR.metalEscuro } });
  bancada.face("topo").colocar(suporte, { u: 0.1, v: -0.17 });

  // Três latas empilhadas: a de baixo assenta na face do tampo, `empilhar`
  // encadeia as outras duas encostando borda na borda.
  const latas = [0, 1, 2].map((i) =>
    cena.criar("cylinder", { raioTopo: 0.055, raioBase: 0.055, altura: 0.07, segmentos: 20 },
      { nome: "lata", material: { cor: i === 1 ? COR.destaque : COR.claro } }));
  bancada.face("topo").colocar(latas[0]!, { u: 0.85, v: -0.15 });
  empilhar(latas, "topo", 0);

  // ── Área de reunião: mesa redonda + banquetas em círculo ───────────────
  const mesaRedonda = cena.criar("cylinder", { raioTopo: 0.45, raioBase: 0.45, altura: 0.04, segmentos: 32 },
    { nome: "mesa redonda", transform: { posicao: [1.2, 0.72, -0.3] }, material: { cor: COR.madeira } });
  const pedestal = cena.criar("cylinder", { raioTopo: 0.06, raioBase: 0.18, altura: 0.7, segmentos: 24 },
    { nome: "pedestal", material: { cor: COR.metalEscuro } });
  mesaRedonda.face("base").colocar(pedestal);

  const banquetas = [0, 1, 2, 3, 4, 5].map((i) =>
    cena.criar("cylinder", { raioTopo: 0.16, raioBase: 0.14, altura: 0.44, segmentos: 20 },
      { nome: "banqueta", material: { cor: COR.tinta },
        transform: { posicao: [0, 0.22, 0] } }));
  circular(banquetas, 0.8, { centro: [1.2, 0, -0.3] });

  // Vaso torneado sobre a mesa redonda.
  const vaso = cena.criar("lathe", {
    perfil: [[0, 0], [0.06, 0], [0.085, 0.05], [0.09, 0.12], [0.055, 0.2], [0.065, 0.24]],
    segmentos: 28,
  }, { nome: "vaso", material: { cor: COR.claro } });
  mesaRedonda.face("topo").colocar(vaso, { u: 0.15, v: -0.1 });

  // Caixa de ferramentas apoiada na borda da mesa e depois centrada só em z.
  const caixaFerramentas = cena.criar("box", { largura: 0.34, altura: 0.16, profundidade: 0.18 },
    { nome: "caixa de ferramentas", material: { cor: COR.destaque } });
  // `face("topo")` sai da geometria PRÓPRIA da mesa. `colocarSobre` usaria a
  // bbox da subárvore — que já inclui o vaso — e empilharia a caixa em cima
  // dele. Ver a nota sobre isso no fim do arquivo.
  mesaRedonda.face("topo").colocar(caixaFerramentas, { u: -0.22, v: 0.02 });

  const globo = cena.criar("sphere", { raio: 0.07, segmentos: 24 },
    { nome: "globo", material: { cor: COR.tinta, metalico: 0.5, rugosidade: 0.3 } });
  mesaRedonda.face("topo").colocar(globo, { u: -0.18, v: 0.16 });

  // ── Armário encostado na parede oeste ──────────────────────────────────
  // Pela FACE da parede, não por `encostar`: a bbox da parede já inclui a
  // prateleira pendurada nela, e `encostar` usaria essa bbox inchada.
  // `orientar: false` mantém o armário em pé.
  const armario = cena.criar("box", { largura: 0.4, altura: 1.8, profundidade: 0.8 },
    { nome: "armário", material: { cor: COR.madeiraEscura } });
  paredeOeste.face("leste").colocar(armario, { u: 1.0, v: -0.4, orientar: false });

  // ── Pilha de caixas num `column` ───────────────────────────────────────
  const pilha = cena.criar("column", { gap: 0, align: "center" },
    { nome: "pilha", transform: { posicao: [1.5, 0, 1.0] } });
  [[0.5, 0.3, 0.4], [0.44, 0.26, 0.36], [0.36, 0.22, 0.3]].forEach(([l, a, p], i) =>
    pilha.criar("box", { largura: l!, altura: a!, profundidade: p! },
      { nome: "caixa", material: { cor: i === 1 ? COR.madeira : COR.madeiraEscura } }));
  cena.definirBordaMundo(pilha, "y", "min", 0);

  // ── Latas de tinta numa `row` junto à parede norte ─────────────────────
  const fileiraTintas = cena.criar("row",
    { extensao: 1.3, gap: 0.02, justify: "space-between", align: "start" },
    { nome: "tintas", transform: { posicao: [1.2, 0, -1.33] } });
  [0.09, 0.11, 0.08, 0.1].forEach((raio, i) =>
    fileiraTintas.criar("cylinder",
      { raioTopo: raio, raioBase: raio, altura: 0.14 + i * 0.03, segmentos: 20 },
      { nome: "lata de tinta", material: { cor: i % 2 ? COR.tinta : COR.destaque } }));
  cena.definirBordaMundo(fileiraTintas, "y", "min", 0);

  // ── Objeto importado por referência ────────────────────────────────────
  // O arquivo não existe de propósito: o layout usa o `tamanho` DECLARADO
  // (como width/height num <img>) e o backend desenha uma caixa proxy.
  const aspirador = cena.criar("model",
    { src: "assets/aspirador.glb", tamanho: [0.4, 0.9, 0.4] },
    { nome: "aspirador" });
  // `encostar` centraliza nos DOIS outros eixos — o que aqui suspenderia o
  // aspirador na meia-altura do armário. A borda de baixo é fixada depois.
  encostar(aspirador, armario, "norte", 0.25);
  cena.definirBordaMundo(aspirador, "y", "min", 0);

  // `distribuir` no mundo: três potes espalhados pela prateleira do armário.
  const potes = [0.05, 0.07, 0.04].map((raio, i) =>
    cena.criar("cylinder", { raioTopo: raio, raioBase: raio, altura: 0.1 + i * 0.02, segmentos: 16 },
      { nome: "pote", material: { cor: COR.claro },
        transform: { posicao: [-1.8, 0, 0.6 + i * 0.3] } }));
  potes.forEach((pote) => colocarSobre(pote, armario));
  distribuir(potes, { eixo: "z", justify: "space-evenly", dentro: armario });

  return cena;
}

// ── Execução direta ──────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const cena = montarOficina();
  console.log(cena.descrever());
  console.log();
  const caixa = cena.bbox("raiz");
  console.log(`${cena.nosGeometricos().length} nós geométricos · bbox total ${caixa.tamanho.map((v) => v.toFixed(2)).join(" × ")} m`);
  console.log(`JSON: ${JSON.stringify(cena.toJSON()).length} bytes`);
  console.log();
  console.log(cena.avisosTexto() || "AVISOS: nenhum.");
}
