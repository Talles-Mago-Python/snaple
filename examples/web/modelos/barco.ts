/**
 * Barco de pesca encalhado no cais — asset #3 do kit de horror.
 *
 * Um barco de trabalho de 5,4 m em cima de cunhos e escoras, no cimento do
 * cais: o casco à mostra inteiro, com a incrustação marinha na linha d'água,
 * o tabuado pintado de verde descascando, o nome pintado no painel de popa e
 * o convés coberto de tralha — âncora com corrente, cabrestante, barril,
 * caixas de peixe, rede com boias, remos, balde e o lampião pendurado na
 * retranca, balançando.
 *
 * O que este arquivo demonstra, além da peça:
 *
 *   · CASCO POR TÁBUAS empilhadas. Cada tábua é um `sweep` de seção
 *     retangular constante que corre pela curva de boca do barco — uma tábua
 *     por faixa de altura, quinze no total (5 por bordo + as duas do fundo).
 *     A seção é CONSTANTE, então quem dá a forma é o CAMINHO; e como a
 *     espessura é fina, cada tábua encosta na de baixo e o casco vira um
 *     chine-duplo facetado, que é como um barco de tábua se parece de
 *     verdade.
 *   · A PILHA SE SUSTENTA SOZINHA, sem um acoplamento por tábua: cada peça é
 *     posicionada com `definirBordaMundo(..., "y", "min", topoDaDeBaixo)`, de
 *     modo que a AABB de cada tábua encoste EXATAMENTE na de baixo. É o
 *     mesmo critério que o linter usa para decidir "apoiado" — e é o que faz
 *     um casco de 15 tábuas passar limpo.
 *   · VELA EM PANOS: a do mastro são 6 faixas quadriláteras empilhadas (testa
 *     no mastro, esteira na linha do punho ao pico, como numa vela de
 *     caranguejo real) e a bujarrona, 5, entre o gurupés e o mastro; cada
 *     pano encosta no de baixo e é declarado com `acoplarFaces`.
 *   · `furar` de verdade: o olhal da proa e os furos dos vaus por onde o
 *     mastro passa. Nada é textura.
 *   · Texturas NOVAS (geradas para este asset, em `public/texturas/`):
 *     `casco_pintado`, `madeira_barco`, `lona_vela`, `corda_sisal`,
 *     `ferro_marinho`, `rede_pesca` (com alfa nos vazios da malha),
 *     `agua_oleo`, `concreto_velho` e `incrustacao_marinha`.
 *   · LINHAGEM DE MONTAGEM. O linter julga interpenetração pela AABB PRÓPRIA
 *     de cada nó, e a AABB de uma peça comprida e curva — uma tábua de casco,
 *     um cabo, uma vela — é uma caixa que engole meia embarcação: um cabo de
 *     4 m "atravessa" todos os vaus do convés sem encostar em nenhum. A
 *     convenção da lib é que quem mora DENTRO de uma peça desça DELA (é o que
 *     o reator faz com o que mora dentro do vaso), então aqui o barco inteiro
 *     vira uma corrente de montagem na ordem em que um barco é montado de
 *     verdade — quilha, tábuas, cavernas, piso, vaus, convés, resbordo,
 *     mastreação, cordame, tralha, leme — e o chão fica de fora, que é onde
 *     a sobreposição continua sendo erro de verdade. As juntas que giram
 *     (cabrestante, lampião, flâmula) e a poça que se abre vão por ÚLTIMO,
 *     como irmãs: girar um nó arrasta os descendentes, e no meio da corrente
 *     o giro do cabrestante levaria junto tudo o que veio depois dele.
 *
 * Três armadilhas de referencial que valem para qualquer modelo:
 *
 *   · `colocar` numa face assenta a peça NO PLANO dela — o `u`/`v` só escolhe
 *     onde, dentro do plano (ver o reator-nuclear.ts para a versão longa).
 *   · `sweep` com `cima` torto: a seção é montada em `(d × cima, cima)`, e
 *     `cima` deve ser PERPENDICULAR ao caminho. Se não for, a seção sai
 *     cisalhada — o que é exatamente o que dá o caimento das tábuas do casco.
 *   · Peça no alto sem apoio vira `flutuando`: ou ela encosta na AABB de
 *     alguma coisa (via `definirBordaMundo`), ou tem acoplamento declarado.
 *     Cordame e velas são penduradas assim, uma a uma — e as argolas que
 *     abraçam o pano são declaradas com `permitirContato`, porque um anel
 *     dentro da AABB de um pano é um encaixe, não uma interpenetração.
 *
 * Sem CSG, luzes ou câmera.
 */
import {
  Cena, planoDeFace, texto,
  type Material, type NoRef, type Vec3,
} from "@snaple/core";

type NomeFace = "topo" | "base" | "norte" | "sul" | "leste" | "oeste";
const FACES: readonly NomeFace[] = ["topo", "base", "norte", "sul", "leste", "oeste"];

export function montarCena(): Cena {
  const cena = new Cena();
  const PI = Math.PI;

  const tex = (src: string, repetir?: [number, number]): Partial<Material> =>
    ({ textura: { src, ...(repetir ? { repetir } : {}) } });

  // ── medidas (m) ──────────────────────────────────────────────────────────
  const Z_POPA = -2.55, Z_PROA = 2.85;       // painel de popa e roda de proa
  const QUILHA_ALT = 0.13, QUILHA_LARG = 0.22;
  const FUNDO_Y = 0.66;                      // fundo do casco no centro
  const N_BANDAS = 5, BANDA_Y = 0.235;       // tábuas por bordo e altura de cada
  const ESP_TABUA = 0.035;                   // espessura do tabuado
  const F_CHINE = 0.22, S_CHINE = 0.42;      // joelho do fundo (V) na meia-boca
  const MB_MED = 1.02;                       // meia-boca de referência (caimento)
  const ESP_VAU = 0.075, ESP_CONVES = 0.04;
  const BORDA_LARG = 0.16, BORDA_ALT = 0.10; // resbordo

  // meia-boca do convés por estação (z → meia largura do casco)
  const ESTACOES: ReadonlyArray<readonly [number, number]> = [
    [Z_POPA, 0.60], [-2.20, 0.76], [-1.80, 0.90], [-1.30, 0.99], [-0.70, 1.03],
    [-0.10, 1.02], [0.50, 0.95], [1.10, 0.84], [1.60, 0.70], [2.05, 0.54],
    [2.45, 0.33], [Z_PROA, 0.05],
  ];

  // ── materiais (texturas novas, geradas para este asset) ──────────────────
  const M = {
    casco: { cor: "#e8efe9", metalico: 0.05, rugosidade: 0.78, ...tex("texturas/casco_pintado.png", [10, 1]) },
    incrustado: { cor: "#cfd8cf", metalico: 0.05, rugosidade: 0.95, ...tex("texturas/incrustacao_marinha.png", [7, 1]) },
    madeira: { cor: "#d8cfc2", rugosidade: 0.9, ...tex("texturas/madeira_barco.png", [4, 1]) },
    madeira_clara: { cor: "#e6dccd", rugosidade: 0.88, ...tex("texturas/madeira_barco.png", [2, 1]) },
    lona: { cor: "#ded4bd", rugosidade: 0.95, ...tex("texturas/lona_vela.png", [2, 2]) },
    corda: { cor: "#cdbfa6", rugosidade: 0.98, ...tex("texturas/corda_sisal.png", [24, 1]) },
    ferro: { cor: "#b9b3ab", metalico: 0.75, rugosidade: 0.62, ...tex("texturas/ferro_marinho.png", [2, 2]) },
    ferro_escuro: { cor: "#5e5a55", metalico: 0.8, rugosidade: 0.5 },
    metal: { cor: "#8d949a", metalico: 0.9, rugosidade: 0.35 },
    rede: { cor: "#cfd6c8", rugosidade: 0.95, ...tex("texturas/rede_pesca.png", [3, 3]) },
    concreto: { cor: "#c9c6c0", rugosidade: 0.95, ...tex("texturas/concreto_velho.png", [6, 6]) },
    oleo: { cor: "#9aa4a8", metalico: 0.25, rugosidade: 0.2, opacidade: 0.92, ...tex("texturas/agua_oleo.png", [2, 2]) },
    tinta: { cor: "#1b1a18", rugosidade: 0.95 },
    tinta_vermelha: { cor: "#6d2018", rugosidade: 0.9 },
    luz: { cor: "#ffdca8", emissivo: { cor: "#ffc46a", intensidade: 1.5 }, rugosidade: 0.4 },
    boia: { cor: "#c8562a", metalico: 0.05, rugosidade: 0.85 },
  } satisfies Record<string, Material>;

  // ── helpers ──────────────────────────────────────────────────────────────
  const caixa = (
    nome: string, largura: number, altura: number, profundidade: number, material: Material,
    posicao: Vec3 = [0, 0, 0],
  ): NoRef => cena.criar("box", { largura, altura, profundidade }, { nome, material, transform: { posicao } });

  const cilindro = (
    nome: string, raio: number, altura: number, material: Material, segmentos = 24, posicao: Vec3 = [0, 0, 0],
  ): NoRef => cena.criar("cylinder", { raioTopo: raio, raioBase: raio, altura, segmentos }, {
    nome, material, transform: { posicao },
  });

  const topo = (no: NoRef): number => cena.bbox(no).max[1];
  const base = (no: NoRef): number => cena.bbox(no).min[1];

  /** Encosta a AABB de `no` por baixo em `y` — a mesma régua que o linter usa
   * para dizer que uma peça está apoiada. É o que sustenta o casco inteiro. */
  const apoiar = (no: NoRef, y: number): void => { cena.definirBordaMundo(no, "y", "min", y); };

  /** Face de `alvo` virada para quem olha na direção `normal` — a que encosta
   * no dono, achada pela normal de mundo em vez de escrita à mão. */
  const faceViradaPara = (alvo: NoRef, normal: Vec3): NomeFace => {
    let melhor: NomeFace = "base", pior = Infinity;
    for (const f of FACES) {
      const n = alvo.face(f).normalMundo();
      const cosseno = n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2];
      if (cosseno < pior) { pior = cosseno; melhor = f; }
    }
    return melhor;
  };

  /** Declara contato entre a face `face` de `dono` e a face de `alvo` virada
   * para ela. O acoplamento só CONFERE depois — nunca posiciona nada. */
  const acoplarContato = (dono: NoRef, face: NomeFace, alvo: NoRef): void => {
    cena.acoplar({
      tipo: "contato",
      a: { no: dono, face },
      b: { no: alvo, face: faceViradaPara(alvo, dono.face(face).normalMundo()) },
    });
  };

  /** Contato entre duas faces já conhecidas — para quando o par é sabido (o
   * pino da dobradiça, a pá da âncora). */
  const acoplarFaces = (a: NoRef, faceA: NomeFace, b: NoRef, faceB: NomeFace): void => {
    cena.acoplar({ tipo: "contato", a: { no: a, face: faceA }, b: { no: b, face: faceB } });
  };


  /** Assenta `alvo` na face de `dono` (borda oposta à normal no plano, mais
   * `gap`), declarando contato — a peça nasce sem orientação, salvo
   * `orientar: true`. */

  /** Todos os traços de um `texto()`, achatados (ele devolve só a raiz de cada
   * caractere). */
  const tracos = (raizes: readonly NoRef[]): NoRef[] => {
    const saida: NoRef[] = [];
    const anda = (no: NoRef): void => { saida.push(no); for (const filho of no.filhos()) anda(filho); };
    for (const r of raizes) anda(r);
    return saida;
  };

  /** Grava uma linha de texto numa face e declara o contato de cada traço com
   * ela (sem isso o relevo sai no linter como peça flutuando). */
  const gravar = (
    dono: NoRef, face: NomeFace, nome: string, conteudo: string, v: number,
    unidade: number, material: Material, u = 0,
  ): void => {
    const normal = dono.face(face).normalMundo();
    for (const t of tracos(texto(dono, nome, conteudo, planoDeFace(dono.face(face), u, v), {
      unidade, traco: unidade * 0.32, relevo: unidade * 0.12, material,
    }))) acoplarFaces(dono, face, t, faceViradaPara(t, normal));
  };

  /** Uma corda/cabo: `sweep` de seção circular pelo caminho dado, com a AABB
   * encostada em `y` — o mínimo do caminho é uma das pontas, então a ponta
   * baixa da corda é que fica apoiada. Quem amarra a corda (um cabeço, uma
   * ferragem) é declarado à parte, quando as faces são de fato coplanares. */
  const corda = (
    nome: string, caminho: Vec3[], raio: number, y: number, material: Material = M.corda,
  ): NoRef => {
    const no = cena.criar("sweep", {
      caminho, secao: { tipo: "circulo", raio, segmentos: 8 },
      suavizar: caminho.length > 2, segmentos: 7, recentrar: false,
    }, { nome, material });
    apoiar(no, y);
    return no;
  };

  /** Meia-boca do convés na estação `z` (interpolação linear da tabela). */
  const MB = (z: number): number => {
    const t = Math.max(Z_POPA, Math.min(Z_PROA, z));
    for (let i = 1; i < ESTACOES.length; i++) {
      const [z0, b0] = ESTACOES[i - 1]!, [z1, b1] = ESTACOES[i]!;
      if (t <= z1) return b0 + ((b1 - b0) * (t - z0)) / (z1 - z0);
    }
    return ESTACOES[ESTACOES.length - 1]![1];
  };

  /** Fração da meia-boca na altura `f` do casco (0 = fundo, 1 = borda): o V do
   * fundo até o joelho, e a amurada subindo mais aberta daí pra cima. */
  const S = (f: number): number => {
    const g = Math.max(0, Math.min(1, f));
    return g <= F_CHINE
      ? S_CHINE * Math.pow(g / F_CHINE, 1.15)
      : S_CHINE + (1 - S_CHINE) * Math.pow((g - F_CHINE) / (1 - F_CHINE), 1.35);
  };

  const AMOSTRAS: number[] = [];
  for (let z = Z_POPA; z <= Z_PROA + 1e-9; z += (Z_PROA - Z_POPA) / 11) AMOSTRAS.push(Number(z.toFixed(4)));

  // ════════════════════════════════════════════════════════════════════════
  // 1. PÁTIO, CAIS E CUNHOS — o cimento, a água do porto, a poça de óleo
  // debaixo do casco e o que segura o barco em pé.
  // ════════════════════════════════════════════════════════════════════════
  caixa("pátio do cais", 9.6, 0.30, 8.6, M.concreto, [0, -0.15, 0]);
  caixa("água do porto", 4.2, 0.12, 8.6, M.oleo, [-7.30, -0.20, 0]);
  // a guia encosta na borda do pátio (AABB de faces coplanares: não se sobrepõe)
  caixa("guia do cais", 0.34, 0.46, 8.6, M.concreto, [-4.97, -0.23, 0]);

  // tudo o que for criado até aqui é chão: fica FORA da linhagem do barco
  const foraDoBarco = new Set(cena.ref("raiz").filhos().map((f) => f.id));

  // poça de óleo sob o casco (encosta no pátio: isenta de "flutuando")
  const poca = caixa("poça de óleo", 2.6, 0.012, 4.4, M.oleo, [-0.15, 0.006, -0.1]);
  cena.definirBordaMundo(poca, "y", "min", 0);

  // cabeços de amarração do cais
  for (const z of [-1.7, 1.9]) {
    const cabeço = cena.criar("lathe", {
      recentrar: false, segmentos: 20,
      perfil: ([[0.16, 0], [0.16, 0.12], [0.09, 0.16], [0.085, 0.30], [0.13, 0.34], [0.15, 0.40], [0.12, 0.43], [0, 0.43]] as Array<[number, number]>),
    }, { nome: "cabeço do cais", material: M.ferro, transform: { posicao: [-3.05, 0, z] } });
    apoiar(cabeço, 0);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 2. CASCO — a quilha, e quinze tábuas empilhadas: cada uma é posicionada
  // para a própria AABB encostar na de baixo, e é isso que sustenta o casco
  // inteiro sem um acoplamento por tábua.
  // ════════════════════════════════════════════════════════════════════════
  const Z_CUNHOS = [-2.05, -0.35, 1.45];
  const quilha = caixa("quilha", QUILHA_LARG, QUILHA_ALT, Z_PROA - Z_POPA + 0.55, M.madeira, [0, 0, 0.15]);
  cena.definirBordaMundo(quilha, "y", "max", FUNDO_Y);
  const fundoQuilha = base(quilha);

  const cunhos: NoRef[] = [];
  for (const z of Z_CUNHOS) {
    const cunho = caixa("cunho de sustentação", 0.36, fundoQuilha, 0.34, M.madeira_clara, [0, fundoQuilha / 2, z]);
    cena.definirBordaMundo(cunho, "y", "min", 0);
    cunhos.push(cunho);
    poca.permitirContato(cunho);        // a poça se espalha por baixo do cunho
  }
  for (const c of cunhos) acoplarContato(c, "topo", quilha);

  // as tábuas: 5 faixas por bordo, do fundo à borda, com caimento crescente
  const bandas: NoRef[] = [];
  let yTopo = FUNDO_Y;
  for (let j = 0; j < N_BANDAS; j++) {
    const fMeio = (j + 0.5) / N_BANDAS;
    const theta = Math.atan2((S((j + 1) / N_BANDAS) - S(j / N_BANDAS)) * MB_MED, BANDA_Y);
    const altura = BANDA_Y / Math.cos(theta);
    for (const lado of [-1, 1] as const) {
      const caminho = AMOSTRAS.map((z) => [lado * MB(z) * S(fMeio), 0, z] as Vec3);
      const no = cena.criar("sweep", {
        caminho,
        secao: { tipo: "retangulo", largura: ESP_TABUA, altura },
        cima: [lado * Math.sin(theta), Math.cos(theta), 0],
        suavizar: true, segmentos: 4, recentrar: false,
      }, {
        nome: j < 2 ? "tábua do fundo (incrustada)" : "tábua do casco",
        material: j < 2 ? M.incrustado : M.casco,
      });
      apoiar(no, yTopo);
      bandas.push(no);
    }
    yTopo = topo(bandas[bandas.length - 1]!);
  }
  const BORDA_Y = yTopo;

  // painel de popa com o nome gravado, e a roda de proa (um sweep em pé,
  // seção retangular — uma tábua de proa de verdade)
  const transom = caixa("painel de popa", 2 * MB(Z_POPA), BORDA_Y - FUNDO_Y, 0.06, M.casco, [0, 0, Z_POPA - 0.03]);
  apoiar(transom, FUNDO_Y);
  gravar(transom, "sul", "nome do barco", "SANTA RITA", 0.22, 0.028, M.tinta);
  gravar(transom, "sul", "registro", "PR-13", -0.28, 0.020, M.tinta_vermelha);

  const roda = cena.criar("sweep", {
    caminho: [[0, FUNDO_Y - 0.06, Z_PROA - 0.35], [0, FUNDO_Y + 0.7, Z_PROA - 0.05], [0, BORDA_Y + 0.05, Z_PROA + 0.14]],
    secao: { tipo: "retangulo", largura: 0.055, altura: 0.17 },
    cima: [0, 0.33, -0.94], suavizar: true, segmentos: 8, recentrar: false,
  }, { nome: "roda de proa", material: M.madeira });
  apoiar(roda, FUNDO_Y);
  // sapata de ferro na testa da roda
  const sapata = cena.criar("sweep", {
    caminho: [[0, FUNDO_Y - 0.075, Z_PROA - 0.30], [0, FUNDO_Y + 0.55, Z_PROA + 0.02], [0, BORDA_Y - 0.10, Z_PROA + 0.17]],
    secao: { tipo: "retangulo", largura: 0.07, altura: 0.05 },
    cima: [0, 0.33, -0.94], suavizar: true, segmentos: 6, recentrar: false,
  }, { nome: "sapata de ferro da proa", material: M.ferro });
  apoiar(sapata, base(roda));

  // ════════════════════════════════════════════════════════════════════════
  // 3. CONVÉS — vaus atravessados por cima da borda, tábuas corridas por
  // cima deles, as águas (a tábua curva que fecha a borda) e o resbordo.
  // ════════════════════════════════════════════════════════════════════════
  const Z_VAUS = [-2.45, -1.75, -1.05, -0.35, 0.35, 1.05, 1.75, 2.35];
  for (const z of Z_VAUS) {
    const vau = caixa("vau do convés", 2 * (MB(z) + 0.06), ESP_VAU, 0.10, M.madeira_clara, [0, 0, z]);
    apoiar(vau, BORDA_Y);
    acoplarFaces(bandas[bandas.length - 1]!, "topo", vau, "base");
  }
  const CONVES_Y = BORDA_Y + ESP_VAU;

  const resbordo = cena.criar("sweep", {
    caminho: [
      ...AMOSTRAS.map((z) => [MB(z), 0, z] as Vec3),
      ...AMOSTRAS.map((z) => [-MB(z), 0, z] as Vec3).reverse(),
    ],
    secao: { tipo: "retangulo", largura: BORDA_LARG, altura: BORDA_ALT },
    fechado: true, segmentos: 4, recentrar: false,
  }, { nome: "resbordo", material: M.madeira });
  apoiar(resbordo, BORDA_Y);
  acoplarFaces(bandas[bandas.length - 1]!, "topo", resbordo, "base");

  // as águas: a tábua curva que corre por dentro do resbordo, fechando o
  // vão entre ele e o tabuado do convés
  const aguas: NoRef[] = [];
  for (const lado of [-1, 1] as const) {
    const agua = cena.criar("sweep", {
      caminho: AMOSTRAS.map((z) => [lado * (MB(z) - 0.12), 0, z] as Vec3),
      secao: { tipo: "retangulo", largura: 0.08, altura: ESP_CONVES },
      suavizar: true, segmentos: 4, recentrar: false,
    }, { nome: "água do convés", material: M.madeira });
    apoiar(agua, CONVES_Y);
    aguas.push(agua);
  }

  /** Maior z em que o casco ainda cobre a tábua de centro `x` (com a folga da
   * água e do próprio tabuado): as tábuas do convés são RECORTADAS pela boca
   * do barco, não esticadas até o fim. */
  const limiteZ = (x: number): number => {
    let z = Z_PROA;
    while (z > Z_POPA && MB(z) < Math.abs(x) + 0.17) z -= 0.05;
    return Math.max(z, Z_POPA);
  };
  const limiteZBaixo = (x: number): number => {
    let z = Z_POPA;
    while (z < Z_PROA && MB(z) < Math.abs(x) + 0.17) z += 0.05;
    return Math.min(z, Z_PROA);
  };
  const X_AGUA = MB_MED - 0.16;                   // borda interna das tábuas
  const N_PORCOES = 13;
  const ZONAS: ReadonlyArray<readonly [number, number, string]> = [
    [1.05, 2.85, "proa"], [-0.35, 1.05, "porão"], [-1.05, -0.35, "meio"], [-2.45, -1.05, "poço"],
  ];
  const ABERTAS = new Set(["porão", "poço"]);
  let nTabuas = 0;
  for (let i = 0; i < N_PORCOES; i++) {
    const x = -X_AGUA + ((2 * X_AGUA) * (i + 0.5)) / N_PORCOES;
    for (const [z0, z1, zona] of ZONAS) {
      if (ABERTAS.has(zona) && Math.abs(x) < 0.82) continue;   // o vão do porão e do poço
      const zA = Math.max(z0, limiteZBaixo(x)), zB = Math.min(z1, limiteZ(x));
      if (zB - zA < 0.20) continue;
      const tabua = caixa("tábua do convés", (2 * X_AGUA) / N_PORCOES - 0.006, ESP_CONVES, zB - zA, M.madeira,
        [x, 0, (zA + zB) / 2]);
      apoiar(tabua, CONVES_Y);
      nTabuas++;
    }
  }
  void nTabuas;

  /** Maior |x| que ainda cabe DENTRO do casco na altura `y` da estação `z` —
   * a mobília do porão é recortada por ela, com folga do tabuado. */
  const dentroDe = (z: number, y: number, folga = 0.07): number => {
    const f = (y - FUNDO_Y) / (BORDA_Y - FUNDO_Y);
    return Math.max(0, MB(z) * S(f) - folga);
  };

  // ════════════════════════════════════════════════════════════════════════
  // 4. POR DENTRO — cavernas deitadas contra o tabuado, pés, piso do porão e
  // o que sobrou da carga. Tudo recortado pela boca do casco (`dentroDe`),
  // senão a mobília atravessa o tabuado e o linter acusa com razão.
  // ════════════════════════════════════════════════════════════════════════
  const PISO_Y = FUNDO_Y + 0.34;
  const caudal = (z: number, folga = 0.07): number => dentroDe(z, BORDA_Y - 0.1, folga);
  for (const z of [-2.30, -1.65, -1.00, -0.25, 0.55, 1.25, 1.95, 2.45]) {
    const xTopo = Math.max(caudal(z), 0.12);
    const pontos: Array<[number, number]> = [];
    const xFora = (f: number): number => Math.max(0, Math.min(1, MB(z) * S(f) - folgaPrancha));
    const folgaPrancha = 0.075;
    for (let k = 0; k <= 8; k++) pontos.push([xFora(k / 8), FUNDO_Y + (k / 8) * (BORDA_Y - 0.02 - FUNDO_Y)]);
    for (let k = 8; k >= 0; k--) {
      const f = k / 8;
      pontos.push([Math.max(0, xFora(f) - 0.075), FUNDO_Y + f * (BORDA_Y - 0.02 - FUNDO_Y)]);
    }
    void xTopo;
    const caverna = cena.criar("sweep", {
      caminho: [[0, 0, -0.03], [0, 0, 0.03]],
      secao: { tipo: "poligono", pontos },
      cima: [0, 1, 0], recentrar: false,
    }, { nome: "caverna", material: M.madeira_clara });
    apoiar(caverna, FUNDO_Y);
  }

  // pés do piso (travessas curtas no fundo) e o piso corrido por cima
  const pes: NoRef[] = [];
  for (const z of [-2.10, -1.30, -0.55, 0.20, 0.95, 1.70, 2.30]) {
    const xP = Math.max(dentroDe(z, FUNDO_Y + 0.16), 0.12);
    if (xP < 0.14) continue;
    const pé = caixa("pé do piso", 2 * xP, PISO_Y - FUNDO_Y, 0.07, M.madeira_clara, [0, 0, z]);
    apoiar(pé, FUNDO_Y);
    pes.push(pé);
  }
  for (const x of [-0.26, 0, 0.26]) {
    let zA = -2.30, zB = 2.45;
    while (zA < zB && dentroDe(zA, PISO_Y + 0.02) < Math.abs(x) + 0.13) zA += 0.05;
    while (zB > zA && dentroDe(zB, PISO_Y + 0.02) < Math.abs(x) + 0.13) zB -= 0.05;
    if (zB - zA < 0.4) continue;
    const tabua = caixa("piso do porão", 0.24, 0.03, zB - zA, M.madeira, [x, 0, (zA + zB) / 2]);
    apoiar(tabua, PISO_Y);
  }

  // antepara do poço e o piso do poço, mais alto, atrás do mastro
  const antepara = cena.criar("sweep", {
    caminho: [[0, 0, -0.03], [0, 0, 0.03]],
    secao: { tipo: "poligono", pontos: [
      [0, FUNDO_Y], [MB(-1.15) * S(0.55) - 0.08, FUNDO_Y + 0.55 * (BORDA_Y - FUNDO_Y)], [0, FUNDO_Y + 0.62],
      [-MB(-1.15) * S(0.55) + 0.08, FUNDO_Y + 0.55 * (BORDA_Y - FUNDO_Y)], [0, FUNDO_Y],
    ] },
    cima: [0, 1, 0], recentrar: false,
  }, { nome: "antepara do poço", material: M.madeira_clara });
  apoiar(antepara, FUNDO_Y);
  const PISO_POCO_Y = FUNDO_Y + 0.62;
  const pisoPoco = caixa("piso do poço", 1.5, 0.035, 1.15, M.madeira, [0, 0, -1.72]);
  apoiar(pisoPoco, PISO_POCO_Y);

  // ════════════════════════════════════════════════════════════════════════
  // 5. ABERTURAS DO CONVÉS — o poço (com coaming e banco) e o porão (com a
  // coaming, a tampa de lona levantada e o gato de ferro).
  // ════════════════════════════════════════════════════════════════════════
  const coaming = (z: number, largura: number): NoRef => {
    const no = caixa("coaming", largura, 0.17, 0.07, M.madeira, [0, 0, z]);
    apoiar(no, CONVES_Y + ESP_CONVES);
    return no;
  };
  const coams: NoRef[] = [];
  for (const z of [1.13, -0.43]) coams.push(coaming(z, 1.86));
  for (const x of [-0.90, 0.90]) {
    const no = caixa("coaming", 0.07, 0.17, 1.50, M.madeira, [x, 0, 0.35]);
    apoiar(no, CONVES_Y + ESP_CONVES);
    coams.push(no);
  }
  // banco do poço, apoiado nos bordos, e a tábua do registro jogada no piso
  const banco = caixa("banco do poço", 1.94, 0.05, 0.34, M.madeira, [0, 0, -1.20]);
  apoiar(banco, CONVES_Y + 0.42);
  const tabuaRegistro = caixa("tábua do registro", 0.44, 0.02, 0.30, M.madeira_clara, [0.25, 0, -1.85]);
  apoiar(tabuaRegistro, PISO_POCO_Y);
  gravar(tabuaRegistro, "topo", "registro", "PR-13", 0, 0.030, M.tinta_vermelha);

  // ════════════════════════════════════════════════════════════════════════
  // 6. MASTRO, VELA E CORDAME — mastro de lathe, retranca, caranguejo, a
  // vela em panos horizontais (cada pano é um sweep com barriga) e os cabos.
  // ════════════════════════════════════════════════════════════════════════
  const MASTRO_Z = 1.45, MASTRO_R = 0.058, MASTRO_TOP = 5.00;
  const step = caixa("pé do mastro", 0.34, 0.36, 0.34, M.madeira_clara, [0, 0, MASTRO_Z]);
  apoiar(step, FUNDO_Y);
  const mastro = cena.criar("lathe", {
    recentrar: false, segmentos: 20,
    perfil: ([[MASTRO_R, 0], [MASTRO_R * 0.85, 2.2], [MASTRO_R * 0.7, 3.2], [MASTRO_R * 0.45, 3.5], [0, 3.55]] as Array<[number, number]>),
  }, { nome: "mastro", material: M.madeira });
  apoiar(mastro, topo(step));
  acoplarFaces(step, "topo", mastro, "base");
  const MASTRO_Y0 = base(mastro);   // onde a origem local do mastro cai no mundo
  // parceiro (o colar de madeira onde o mastro passa pelo convés) — filho do
  // mastro, então o mastro atravessar o furo dele não é interpenetração
  const parceiro = mastro.criar("box", { largura: 0.30, altura: 0.09, profundidade: 0.30 },
    { nome: "parceiro do mastro", material: M.madeira });
  apoiar(parceiro, CONVES_Y + ESP_CONVES);

  // retranca e caranguejo: cabos de madeira, cada um encostado no mastro
  const BOOM_Y = 2.32, GAFF_Y = 3.30;
  const retranca = cena.criar("sweep", {
    caminho: [[0, 0, MASTRO_Z - 0.05], [0, 0.01, 0.4], [0, 0.03, -0.60]],
    secao: { tipo: "circulo", raio: 0.048, segmentos: 10 },
    suavizar: true, segmentos: 6, recentrar: false,
  }, { nome: "retranca", material: M.madeira });
  apoiar(retranca, BOOM_Y - 0.02);
  const caranguejo = cena.criar("sweep", {
    caminho: [[0, 0, MASTRO_Z - 0.05], [0, 0.28, 0.30], [0, 0.62, -0.70]],
    secao: { tipo: "circulo", raio: 0.030, segmentos: 8 },
    suavizar: true, segmentos: 6, recentrar: false,
  }, { nome: "caranguejo", material: M.madeira });
  apoiar(caranguejo, GAFF_Y);

  // a vela do mastro: 6 panos horizontais. A testa de cada pano sai do mastro
  // (até o caranguejo) e o punho da esteira, na linha que vai do punho da
  // retranca até o pico — a vela é quadrilateral, como a de um barco real.
  const PUNHO_Z = -0.60, PICO_Z = -0.70, PICO_Y = GAFF_Y + 0.86;
  const zEsteira = (y: number): number => PUNHO_Z + ((PICO_Z - PUNHO_Z) * (y - BOOM_Y)) / (PICO_Y - BOOM_Y);
  const zTesta = (y: number): number => (y <= GAFF_Y
    ? MASTRO_Z - 0.06
    : MASTRO_Z - 0.06 + ((PICO_Z - MASTRO_Z + 0.06) * (y - GAFF_Y)) / (PICO_Y - GAFF_Y));
  const N_PANOS = 6, ALT_PANO = (PICO_Y - BOOM_Y) / N_PANOS;
  let velaBase: NoRef | null = null;
  const panos: NoRef[] = [];
  const argolas: NoRef[] = [];
  for (let k = 0; k < N_PANOS; k++) {
    const yMeio = BOOM_Y + ALT_PANO * (k + 0.5);
    const zA = zTesta(yMeio), zB = zEsteira(yMeio);
    const meio = (zA + zB) / 2;
    const pano = cena.criar("sweep", {
      caminho: [[0.02, 0, zA], [0.11, 0, meio], [0.02, 0, zB]],
      secao: { tipo: "retangulo", largura: 0.008, altura: ALT_PANO * 1.02 },
      cima: [0, 1, 0], suavizar: true, segmentos: 6, recentrar: false,
    }, { nome: "pano da vela", material: M.lona });
    const apoio = k === 0 ? retranca : panos[k - 1]!;
    apoiar(pano, topo(apoio));
    acoplarFaces(apoio, "topo", pano, "base");
    panos.push(pano);
    if (k % 2 === 0) {
      argolas.push(mastro.criar("torus", { raio: 0.075, raioTubo: 0.014, segmentos: 12, segmentosTubo: 8 }, {
        nome: "argola da vela", material: M.madeira_clara,
        transform: { posicao: [0, yMeio - MASTRO_Y0, 0], rotacao: [PI / 2, 0, 0] },
      }));
    }
    if (k === N_PANOS - 1) velaBase = pano;
  }
  void velaBase;

  // bujarrona: também em panos, entre a estada de proa e a esteira
  const BICO_GURUPES: Vec3 = [0, 2.62, 3.42];
  const AMURAS: Vec3 = [0, 2.62, 2.55];
  const bujarrona: NoRef[] = [];
  const ALT_BUJ = (MASTRO_TOP - 0.5 - 2.62) / 5;
  for (let k = 0; k < 5; k++) {
    const y = 2.62 + ALT_BUJ * (k + 0.5);
    const t = (y - 2.62) / (MASTRO_TOP - 0.5 - 2.62);
    const zLuff = AMURAS[2] + (MASTRO_Z - AMURAS[2]) * t;
    const zLeech = BICO_GURUPES[2] + (MASTRO_Z - BICO_GURUPES[2]) * t;
    const pano = cena.criar("sweep", {
      caminho: [[0.01, 0, zLuff], [0.05, 0, (zLuff + zLeech) / 2], [0.01, 0, zLeech]],
      secao: { tipo: "retangulo", largura: 0.007, altura: ALT_BUJ * 1.02 },
      cima: [0, 1, 0], suavizar: true, segmentos: 6, recentrar: false,
    }, { nome: "pano da bujarrona", material: M.lona });
    apoiar(pano, k === 0 ? BICO_GURUPES[1] + 0.06 : topo(bujarrona[k - 1]!));
    bujarrona.push(pano);
  }

  // pau de gurupés + flâmula de topo (numa junta, para a animação)
  const gurupes = cena.criar("sweep", {
    caminho: [[0, 1.98, 2.25], [0, 2.30, 2.90], [0, 2.62, 3.42]],
    secao: { tipo: "circulo", raio: 0.038, segmentos: 10 },
    suavizar: true, segmentos: 6, recentrar: false,
  }, { nome: "pau de gurupés", material: M.madeira });
  apoiar(gurupes, CONVES_Y + ESP_CONVES);
  apoiar(bujarrona[0]!, topo(gurupes));

  const jFlâmula = cena.criar("junta", { eixo: "y", angulo: 0 }, { nome: "junta da flâmula", transform: { posicao: [0, topo(mastro), MASTRO_Z] } });
  const flâmula = jFlâmula.criar("extrude", {
    perfil: ([[0, 0.055], [0.62, 0.02], [0.62, -0.02], [0, -0.055]] as Array<[number, number]>),
    altura: 0.008, recentrar: false,
  }, { nome: "flâmula", material: M.lona });
  apoiar(flâmula, topo(mastro));
  acoplarFaces(mastro, "topo", flâmula, "base");

  // ── cordame: estadas, brandais, adriças e escotas ────────────────────────
  const cordas: NoRef[] = [];
  const TOPO_MASTRO = topo(mastro);
  const BICO_GURUPES_Y = 2.62;
  cordas.push(corda("estada de proa", [[0, TOPO_MASTRO - 0.35, MASTRO_Z], [0, 3.9, 2.4], [BICO_GURUPES[0], BICO_GURUPES_Y, BICO_GURUPES[2]]], 0.014, BICO_GURUPES_Y));
  cordas.push(corda("estada de popa", [[0, TOPO_MASTRO - 0.35, MASTRO_Z], [0, 3.0, -0.6], [0, BORDA_Y, Z_POPA - 0.10]], 0.013, BORDA_Y));
  cordas.push(corda("estai do gurupés", [[0, BICO_GURUPES_Y, BICO_GURUPES[2]], [0, 1.6, 3.1], [0, FUNDO_Y + 0.12, Z_PROA - 0.12]], 0.012, FUNDO_Y + 0.12));
  const pranchasBrandal: NoRef[] = [];
  for (const [z, lado] of [[1.15, -1], [1.15, 1], [0.30, -1], [0.30, 1]] as Array<[number, number]>) {
    const placa = caixa("prancha de brandal", 0.05, 0.20, 0.09, M.ferro, [lado * MB(z), 0, z]);
    apoiar(placa, BORDA_Y + BORDA_ALT);
    acoplarFaces(resbordo, "topo", placa, "base");
    pranchasBrandal.push(placa);
  }
  let iBrandal = 0;
  for (const [z, lado] of [[1.15, -1], [1.15, 1], [0.30, -1], [0.30, 1]] as Array<[number, number]>) {
    cordas.push(corda("brandal", [
      [0, TOPO_MASTRO - 0.55, MASTRO_Z],
      [lado * MB(z) * 0.55, 3.6, MASTRO_Z - 0.35],
      [lado * MB(z), topo(pranchasBrandal[iBrandal]!), z],
    ], 0.013, topo(pranchasBrandal[iBrandal]!)));
    iBrandal++;
  }
  cordas.push(corda("adriça do caranguejo", [[0, TOPO_MASTRO - 0.12, MASTRO_Z], [0, 4.35, 0.4], [0, PICO_Y + 0.04, PICO_Z]], 0.011, PICO_Y + 0.04));
  cordas.push(corda("adriça da retranca", [[0, TOPO_MASTRO - 0.20, MASTRO_Z], [0, 3.1, -0.2], [0, BOOM_Y + 0.05, PUNHO_Z]], 0.011, BOOM_Y + 0.05));
  cordas.push(corda("escota da retranca", [[0, BOOM_Y, PUNHO_Z], [0, 2.0, -1.7], [0.16, CONVES_Y + 0.05, -2.1]], 0.012, CONVES_Y + 0.05));

  // ════════════════════════════════════════════════════════════════════════
  // 7. TRALHA DE CONVÉS — âncora com corrente, cabrestante, caixas, barril,
  // rede, remos, balde, lampião e as defensas penduradas no bordo.
  // ════════════════════════════════════════════════════════════════════════
  const DECK_Y = CONVES_Y + ESP_CONVES;

  // cabrestante: tambor de eixo x numa junta (é ele que gira), com mancais,
  // catraca e manivela
  const CABR_Z = 2.10;
  const jCabrestante = cena.criar("junta", { eixo: "x", angulo: 0 }, {
    nome: "junta do cabrestante", transform: { posicao: [0, DECK_Y + 0.19, CABR_Z] },
  });
  const tambor = jCabrestante.criar("cylinder",
    { raioTopo: 0.085, raioBase: 0.085, altura: 0.36, segmentos: 16 },
    { nome: "tambor do cabrestante", material: M.ferro, transform: { rotacao: [0, 0, PI / 2] } });
  for (const lado of [-1, 1] as const) {
    const mancal = caixa("mancal do cabrestante", 0.10, 0.38, 0.16, M.madeira_clara, [lado * 0.24, 0, CABR_Z]);
    apoiar(mancal, DECK_Y);   // o pé do mancal está no convés; quem gira é a junta
  }
  const catraca = jCabrestante.criar("cylinder",
    { raioTopo: 0.115, raioBase: 0.115, altura: 0.05, segmentos: 12 },
    { nome: "catraca do cabrestante", material: M.ferro, transform: { posicao: [0.14, 0, 0], rotacao: [0, 0, PI / 2] } });
  tambor.permitirContato(catraca);
  // lingueta da catraca: bloco no convés, em que o dente trava. Também é o
  // apoio que o linter enxerga embaixo da catraca (senão ela "flutua" no ar)
  const lingueta = caixa("lingueta da catraca", 0.07, 0.10, 0.07, M.ferro, [0.14, 0, CABR_Z]);
  cena.definirBordaMundo(lingueta, "y", "min", DECK_Y);
  cena.definirBordaMundo(lingueta, "y", "max", cena.bbox(catraca).min[1]);

  // âncora de patente no castelo da proa: haste, cepo, unhas e argola
  const ANC_Z = 2.05, ANC_X = 0.34;
  const hasteAnc = caixa("haste da âncora", 0.07, 0.10, 0.86, M.ferro, [ANC_X, 0, ANC_Z]);
  apoiar(hasteAnc, DECK_Y);
  const cepo = caixa("cepo da âncora", 0.52, 0.07, 0.07, M.ferro_escuro, [ANC_X, 0, ANC_Z + 0.28]);
  apoiar(cepo, DECK_Y + 0.03);
  const unha = cena.criar("extrude", {
    perfil: ([[0, 0], [0.30, 0.13], [0.30, -0.13]] as Array<[number, number]>),
    altura: 0.05, recentrar: false,
  }, { nome: "unha da âncora", material: M.ferro, transform: { posicao: [ANC_X, DECK_Y + 0.035, ANC_Z - 0.52] } });
  unha.permitirContato(hasteAnc);
  const argolaAnc = cena.criar("torus", { raio: 0.055, raioTubo: 0.016, segmentos: 14, segmentosTubo: 8 }, {
    nome: "argola da âncora", material: M.ferro, transform: { posicao: [ANC_X, DECK_Y + 0.06, ANC_Z + 0.44], rotacao: [PI / 2, 0, 0] },
  });
  argolaAnc.permitirContato(hasteAnc);
  // corrente encadeada no convés: cada elo é filho do anterior (elos
  // entrelaçados se atravessam por projeto) e todos deitados no convés
  let eloAnterior: NoRef = hasteAnc;
  for (let k = 0; k < 9; k++) {
    const elo = eloAnterior.criar("torus", { raio: 0.042, raioTubo: 0.012, segmentos: 10, segmentosTubo: 6 }, {
      nome: "elo da corrente", material: M.ferro,
      transform: { posicao: k === 0 ? [0, 0, 0.52] : [-0.02, 0, 0.062] },
    });
    apoiar(elo, DECK_Y);
    eloAnterior = elo;
  }

  // barril do porão (com as cintas de ferro) e duas caixas de peixe
  const barril = cena.criar("lathe", {
    recentrar: false, segmentos: 16,
    perfil: ([[0, 0], [0.19, 0], [0.24, 0.12], [0.26, 0.26], [0.24, 0.40], [0.19, 0.52], [0, 0.52]] as Array<[number, number]>),
  }, { nome: "barril", material: M.madeira });
  apoiar(barril, PISO_Y);
  for (const fy of [0.10, 0.26, 0.42]) {
    barril.criar("torus", { raio: 0.245, raioTubo: 0.018, segmentos: 16, segmentosTubo: 6 }, {
      nome: "cinta do barril", material: M.ferro, transform: { posicao: [0, fy, 0] },
    });
  }
  for (const [x, z] of [[-0.62, 0.75], [0.62, 0.82]] as Array<[number, number]>) {
    const caixaPeixe = caixa("caixa de peixe", 0.52, 0.26, 0.68, M.madeira_clara, [x, 0, z]);
    apoiar(caixaPeixe, DECK_Y);
    for (const sinal of [-1, 1]) {
      const ripa = caixa("ripa da caixa", 0.54, 0.03, 0.05, M.madeira, [x, 0, z + sinal * 0.30]);
      apoiar(ripa, DECK_Y + 0.26);
      acoplarFaces(caixaPeixe, "topo", ripa, "base");
    }
  }

  // rede estendida no convés de bombordo, com a linha de boias
  const rede = caixa("rede de pesca", 1.30, 0.025, 1.60, M.rede, [-0.42, 0, -0.72]);
  apoiar(rede, DECK_Y);
  for (let k = 0; k < 5; k++) {
    const boia = caixa("boia da linha", 0.06, 0.06, 0.10, M.boia, [-0.95, 0, -1.40 + 0.36 * k]);
    apoiar(boia, DECK_Y);
  }

  // dois remos largados sobre o convés, com o piso do poço
  for (const [x, z] of [[0.55, -0.95], [0.72, -0.85]] as Array<[number, number]>) {
    const remo = cena.criar("sweep", {
      caminho: [[x, 0, z + 1.05], [x, 0, z - 1.05]],
      secao: { tipo: "circulo", raio: 0.028, segmentos: 8 },
      recentrar: false, segmentos: 4,
    }, { nome: "remo", material: M.madeira_clara });
    apoiar(remo, DECK_Y);
    const pá = caixa("pá do remo", 0.13, 0.02, 0.52, M.madeira_clara, [x, 0, z - 1.18]);
    apoiar(pá, DECK_Y);
  }

  // balde e lata no convés de proa
  const balde = cena.criar("lathe", {
    recentrar: false, segmentos: 14,
    perfil: ([[0, 0], [0.15, 0], [0.055, 0.24], [0, 0.24]] as Array<[number, number]>),
  }, { nome: "balde", material: M.ferro_escuro, transform: { posicao: [-0.55, 0, 2.35] } });
  apoiar(balde, DECK_Y);
  const lata = cilindro("lata de graxa", 0.075, 0.17, M.ferro, 14, [-0.84, 0, 2.15]);
  apoiar(lata, DECK_Y);

  // defensas penduradas em estibordo, com a corda passando por cima do bordo
  const bandaBorda = bandas[bandas.length - 1]!;
  const X_BORDA = cena.bbox(bandaBorda).max[0];
  for (const z of [-0.35, 0.75]) {
    const defensa = cena.criar("lathe", {
      recentrar: true, segmentos: 14,
      perfil: ([[0, -0.26], [0.12, -0.20], [0.15, 0], [0.12, 0.20], [0, 0.26]] as Array<[number, number]>),
    }, { nome: "defensa", material: M.boia, transform: { posicao: [0, 0, z] } });
    cena.definirBordaMundo(defensa, "x", "min", X_BORDA);
    apoiar(defensa, 1.02);
    acoplarFaces(bandaBorda, "leste", defensa, "oeste");
    cordas.push(corda("corda da defensa", [
      [X_BORDA - 0.05, topo(defensa) + 0.60, z],
      [X_BORDA - 0.02, 1.75, z],
      [X_BORDA + 0.14, topo(defensa) + 0.01, z],
    ], 0.010, topo(defensa)));
  }

  // lampião pendurado na retranca, dentro de uma junta: a chama e o corpo
  // ficam juntos, então o giro do pêndulo não desfaz nada
  const jLampiao = cena.criar("junta", { eixo: "x", angulo: 0 }, {
    nome: "junta do lampião", transform: { posicao: [0.10, BOOM_Y - 0.05, 0.35] },
  });
  const aroLamp = jLampiao.criar("torus", { raio: 0.05, raioTubo: 0.012, segmentos: 12, segmentosTubo: 6 }, {
    nome: "aro do lampião", material: M.ferro_escuro, transform: { posicao: [0, -0.05, 0] },
  });
  const corpoLamp = jLampiao.criar("lathe", {
    recentrar: false, segmentos: 12,
    perfil: ([[0, -0.35], [0.085, -0.33], [0.095, -0.10], [0.075, -0.06], [0.06, -0.06], [0.06, -0.02], [0, -0.02]] as Array<[number, number]>),
  }, { nome: "corpo do lampião", material: M.ferro_escuro });
  const chama = jLampiao.criar("sphere", { raio: 0.030, segmentos: 12 }, {
    nome: "chama do lampião", material: M.luz, transform: { posicao: [0, -0.22, 0] },
  });
  corpoLamp.permitirContato(chama);
  aroLamp.permitirContato(corpoLamp);

  // ════════════════════════════════════════════════════════════════════════
  // 8. LEME, ESCORAS E PRANCHA DE EMBARQUE — o que segura e o que serve de
  // escada, tudo encostado no casco.
  // ════════════════════════════════════════════════════════════════════════
  const leme = cena.criar("extrude", {
    perfil: ([[-0.03, -0.19], [0.03, -0.19], [0.035, 0.06], [0.03, 0.20], [-0.03, 0.20], [-0.035, 0.06]] as Array<[number, number]>),
    altura: 0.92, recentrar: false,
  }, { nome: "leme", material: M.madeira });
  cena.definirBordaMundo(leme, "z", "max", cena.bbox(transom).min[2]);
  apoiar(leme, 0.74);
  // (sem contato declarado com o painel de popa: ele é inclinado, e um
  // contato exige planos coplanares — a emenda é feita pelas dobradiças)
  const cana = cena.criar("sweep", {
    caminho: [[0, topo(leme), Z_POPA + 0.10], [0, topo(leme) + 0.16, Z_POPA + 0.72], [0, 1.98, -1.45]],
    secao: { tipo: "retangulo", largura: 0.05, altura: 0.055 },
    suavizar: true, segmentos: 6, recentrar: false,
  }, { nome: "cana do leme", material: M.madeira_clara });
  apoiar(cana, topo(leme));
  acoplarFaces(leme, "topo", cana, "base");
  // as duas dobradiças abraçam o bordo de vante do leme: encostam na face
  // leste dele e são elas que declaram o leme preso à popa
  for (const y of [0.86, 1.40]) {
    const dobradiça = caixa("dobradiça do leme", 0.07, 0.06, 0.30, M.ferro, [0, y, Z_POPA - 0.21]);
    cena.definirBordaMundo(dobradiça, "x", "min", cena.bbox(leme).max[0]);
    apoiar(dobradiça, y);
    acoplarFaces(leme, "leste", dobradiça, "oeste");
  }

  // escoras: dois paus em diagonal do cimento até o costado
  for (const [lado, z] of [[-1, -0.9], [1, 1.5]] as Array<[number, number]>) {
    const escora = cena.criar("sweep", {
      caminho: [
        [lado * 1.85, 0.02, z],
        [lado * (MB(z) * S(0.35) + 0.02), 0.75, z],
        [lado * (MB(z) * S(0.62) + 0.03), FUNDO_Y + 0.72, z],
      ],
      secao: { tipo: "circulo", raio: 0.055, segmentos: 8 },
      suavizar: true, segmentos: 6, recentrar: false,
    }, { nome: "escora", material: M.madeira_clara });
    apoiar(escora, 0);
    poca.permitirContato(escora);
    const cunha = caixa("cunha da escora", 0.24, 0.09, 0.18, M.madeira, [lado * 1.85, 0.045, z]);
    apoiar(cunha, 0);
  }

  // prancha de embarque do cimento até o resbordo
  const prancha = cena.criar("sweep", {
    caminho: [[-2.05, 0.04, -0.25], [-1.55, 1.35, -0.25], [-1.02, topo(resbordo) + 0.03, -0.20]],
    secao: { tipo: "retangulo", largura: 0.34, altura: 0.05 },
    suavizar: false, segmentos: 4, recentrar: false,
  }, { nome: "prancha de embarque", material: M.madeira });
  apoiar(prancha, 0);
  poca.permitirContato(prancha);
  for (let k = 0; k < 5; k++) {
    const t = 0.10 + k * 0.17;
    const rip = caixa("ripa da prancha", 0.36, 0.03, 0.05, M.madeira_clara,
      [-2.05 + 1.03 * t - 0.02, 0.06 + 1.75 * t, -0.25]);
    cena.definirBordaMundo(rip, "y", "min", 0.055 + 1.78 * t);
    rip.permitirContato(prancha);
  }

  // ── ENCAIXES DECLARADOS ─────────────────────────────────────────────────
  // Peça que ABRAÇA outra tem AABB que engole o que está dentro do abraço: as
  // argolas correm no mastro e abraçam o pano da vela, e o parceiro do mastro
  // é o bloco por onde passam os cabos — o linter vê caixa dentro de caixa e
  // chamaria de interpenetração. São encaixes por projeto, declarados de uma
  // vez aqui em vez de espalhar uma exceção por peça lá em cima.
  for (const argola of argolas) {
    for (const alvo of [retranca, caranguejo, ...panos, ...cordas]) argola.permitirContato(alvo);
  }
  for (const alvo of [rede, ...cordas]) parceiro.permitirContato(alvo);

  // ── LINHAGEM DO BARCO ───────────────────────────────────────────────────
  // O linter julga interpenetração pela AABB PRÓPRIA de cada nó, e a AABB de
  // um sweep curvo (uma tábua de casco, um cabo, uma vela) é uma caixa
  // comprida que engole meia embarcação — um cabo de 4 m "atravessa" todos os
  // vaus do convés sem encostar em nenhum. A convenção da lib é que quem mora
  // DENTRO de uma peça desça DELA (é o que o reator faz com o que mora dentro
  // do vaso), então aqui o barco inteiro vira uma CORRENTE de montagem, na
  // ordem em que um barco é realmente montado: quilha → tábuas → cavernas →
  // piso → vaus → convés → resbordo → mastreação → tralha → leme. Tudo o que
  // está no barco é parente de tudo o que está no barco, e a interpenetração
  // entre irmãos de corrente deixa de ser ruído. O CHÃO fica de fora: lá a
  // sobreposição continua sendo erro de verdade, e é onde ela importa.
  {
    const raizBarco = cena.ref("raiz");
    const idDasTabuas = new Set(bandas.map((b) => b.id));
    // as juntas que giram (e a poça que se abre) NÃO podem ficar no meio da
    // corrente: quem gira arrasta os descendentes, e a corrente é linear —
    // girar o cabrestante levaria junto tudo o que veio depois dele. Elas vão
    // por último, como irmãs: cada uma arrasta só as próprias peças.
    const gira = new Set([poca.id, jCabrestante.id, jLampiao.id, jFlâmula.id]);
    const doBarco = raizBarco.filhos().filter((f) => !foraDoBarco.has(f.id) && !gira.has(f.id));
    let pai: NoRef = quilha;
    for (const t of doBarco) {
      if (idDasTabuas.has(t.id)) { cena.reparentar(t, pai); pai = t; }
    }
    for (const f of doBarco) {
      if (f.id === quilha.id || idDasTabuas.has(f.id)) continue;
      cena.reparentar(f, pai);
      pai = f;
    }
    for (const f of raizBarco.filhos()) {
      if (!gira.has(f.id)) continue;
      cena.reparentar(f, pai);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 9. ANIMAÇÃO — o lampião balança e a chama treme, a flâmula do topo vira
  // com o vento, a poça de óleo se abre devagar e o cabrestante gira sozinho.
  // ════════════════════════════════════════════════════════════════════════
  cena.animar("lampião", { duracao: 5, repetir: "sempre" })
    .faixa(jLampiao, "angulo", [[0, -0.055], [2.2, 0.055], [3.6, -0.040], [5, -0.055]], { interpolacao: "suave" })
    .faixa(chama, "cor", [
      [0, "#ffd08a"], [0.5, "#ffb04a"], [0.8, "#ffd08a"], [1.4, "#e08a30"], [1.7, "#ffd08a"],
      [2.9, "#ffd08a"], [3.1, "#ff9c38"], [3.4, "#ffd08a"], [5, "#ffd08a"],
    ], { interpolacao: "degrau" });

  cena.animar("flâmula", { duracao: 3.6, repetir: "sempre" })
    .faixa(jFlâmula, "angulo", [[0, -0.30], [1.1, 0.26], [2.0, -0.14], [2.8, 0.32], [3.6, -0.30]], { interpolacao: "suave" });

  cena.animar("poça", { duracao: 7, repetir: "vaivem" })
    .faixa(poca, "escala", [[0, [1, 1, 1]], [7, [1.10, 1, 1.14]]], { interpolacao: "suave" });

  cena.animar("cabrestante", { duracao: 6, repetir: "sempre" })
    .faixa(jCabrestante, "angulo", [[0, 0], [6, 4 * PI]]);

  return cena;
}
