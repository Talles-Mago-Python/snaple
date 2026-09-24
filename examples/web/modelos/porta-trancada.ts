/**
 * Porta trancada — asset #1 do kit de horror.
 *
 * Porta de tábua maciça (0,80 × 2,08 m) num batente de 16 cm, com ferragem
 * forjada enferrujada: duas dobradiças de espigão (uma língua de ferro que
 * termina num olhal abraçando o pino), uma cinta com cravos, chapa de
 * fechadura com o furo de chave aberto de VERDADE (`furar`, não desenho),
 * aldrava pendurada num pino e um aviso de papel pregado à altura dos olhos.
 * Do lado de dentro: travessas, escora em diagonal, corpo da fechadura e um
 * FERROLHO que corre sobre duas guias até entrar numa fresta aberta na
 * ombreira — a tranca que alguém, de dentro, fechou.
 *
 * Três classes de posicionamento convivem aqui, de propósito:
 *
 *   · O QUE ESTÁ EM CIMA DE ALGUMA COISA é relação: as tábuas são um `row`, a
 *     cabeceira do batente vence o vão entre as ombreiras, a ferragem nasce na
 *     face da tábua com `face().colocar()`. Nada disso é coordenada de mundo.
 *   · O EIXO DA DOBRADIÇA é a única âncora cravada: (x = −0,39; z = 0,055).
 *     A junta de giro nasce nele, a folha entra na junta deslocada dele e o
 *     olhal nasce centrado nele — por isso girar a junta gira a porta inteira
 *     sem que o olhal saia de cima do braço: o anel gira em torno do próprio
 *     eixo, e a face que apoia no braço não se move.
 *   · A ESCORA EM DIAGONAL usa `orientar: false`: `colocar` assenta a peça na
 *     face, mas o ângulo fica por conta do modelo.
 *
 * Duas armadilhas de referencial que este arquivo evita de propósito, e que
 * valem para qualquer modelo:
 *
 *   · `colocar` recebe (u, v) com origem no CENTRO da face, não na borda —
 *     errar isso põe a peça no lugar errado sem avisar nada. Aqui ninguém
 *     calcula u/v à mão: `naFace` projeta um ponto de MUNDO nos eixos U/V da
 *     face (é o que permite dizer "o pino fica no eixo da dobradiça").
 *   · `colocar` ORIENTA por padrão, e uma peça girada passa a ter nomes de
 *     face próprios: depois de orientada, o "topo" dela pode estar virado
 *     para a frente da porta. Por isso toda peça deste arquivo nasce sem
 *     orientação (altura é altura, profundidade é profundidade, "sul" é a
 *     frente) — a exceção são as peças de REVOLUÇÃO cujo eixo precisa apontar
 *     para fora da superfície de apoio (o olhal, a aldrava, o pino dela e a
 *     cabeça do pino), e nesses está dito `orientar: true` na chamada.
 *
 * Ferro atravessando ferro de propósito (o olhal em volta do pino, a língua
 * forjada no olhal, o pino dentro do furo da aldrava, o ferrolho entrando na
 * fresta da ombreira) é declarado com `permitirContato` — o linter segue
 * pegando o que NÃO foi declarado.
 *
 * Sem CSG, luzes ou câmera. Texturas são os PNGs de
 * `examples/web/public/texturas/` (o Vite serve essa pasta na raiz).
 */
import { Cena, planoDeFace, texto, type Material, type NoRef } from "@snaple/core";

type V3 = [number, number, number];
type NomeFace = "topo" | "base" | "norte" | "sul" | "leste" | "oeste";
const FACES: readonly NomeFace[] = ["topo", "base", "norte", "sul", "leste", "oeste"];

export function montarCena(): Cena {
  const cena = new Cena();
  const PI = Math.PI;

  /** Desligar tira as imagens e deixa o modelo chapado (as cores já são de
   * madeira e de ferro escuro) — monta igual, sem I/O nenhum. */
  const COM_TEXTURAS = true;
  const tex = (src: string, repetir?: [number, number]): Partial<Material> =>
    COM_TEXTURAS ? { textura: { src, ...(repetir ? { repetir } : {}) } } : {};

  // ── medidas (m) ─────────────────────────────────────────────────────────
  const VAO_LARG = 0.84;                 // luz do vão, entre as ombreiras
  const MONT_LARG = 0.16;                // largura de cada ombreira
  const MONT_ALT = 2.28;                 // altura das ombreiras, do chão ao topo
  const MONT_PROF = 0.16;                // profundidade do batente
  // A cabeceira vence o vão ENTRE as ombreiras (não fica por cima delas): com o
  // topo dela rente ao topo do batente, o vão livre fica em 2,28 − 0,16 =
  // 2,12 m, e a folha de 2,08 entra com 4 cm de folga.
  const CAB_LARG = VAO_LARG;
  const VAO_ALT = MONT_ALT - MONT_LARG;

  const FOLHA_LARG = 0.80;
  const FOLHA_ALT = 2.08;
  const FOLHA_ESP = 0.06;
  const TABUAS = 4;
  const TABUA_GAP = 0.004;
  const TABUA_LARG = (FOLHA_LARG - (TABUAS - 1) * TABUA_GAP) / TABUAS; // 0,197

  const EIXO_X = -0.39;                  // eixo da dobradiça: 1 cm dentro da borda da folha
  const EIXO_Z = 0.055;                  // …e à frente da face dela, onde o pino vive
  const FOLHA_CY = FOLHA_ALT / 2;

  const LG_DOBRADICA = [0.43, 1.63];     // altura da linha de centro de cada dobradiça
  const OLHAL_RAIO = 0.014;              // anel do olhal
  const OLHAL_TUBO = 0.007;              // furo do olhal = raio − tubo = 7 mm
  const PINO_RAIO = 0.006;               // passa pelo furo, com 1 mm de folga
  const PINO_ALT = 0.06;
  const BRACO_COMP = 0.038;              // quanto o braço forjado entra no vão
  const BRACO_ESP = 0.03;

  const CHAPA_ESP = 0.007;               // espessura de chapa de ferro
  const BANDA_LARG = 0.06;               // largura da língua da dobradiça
  const CRAVO_RAIO = 0.005;              // cabeça de cravo

  const ARO_LARG = 0.10, ARO_ALT = 0.18, ARO_ESP = 0.010;   // chapa da fechadura
  const ALDRAVA_PLACA = 0.075;
  const ARO_RAIO = 0.030, ARO_TUBO = 0.006;                 // aldrava: furo = 24 mm

  const AVISO_LARG = 0.13, AVISO_ALT = 0.16, AVISO_ESP = 0.0016;
  const TRAVESSA_COMP = 0.70, TRAVESSA_ALT = 0.14, TRAVESSA_ESP = 0.03;

  const FERROLHO_Y = 0.98;               // na mesma altura da aldrava, do outro lado
  const FERROLHO_COMP = 0.26, FERROLHO_ALT = 0.022, FERROLHO_ESP = 0.014;
  const FERROLHO_CURSO = 0.055;          // quanto ele corre até entrar na ombreira
  const GUIA_LADO = 0.05, GUIA_ESP = 0.006;

  // ── materiais ───────────────────────────────────────────────────────────
  const M = {
    carvalho: { cor: "#6b5843", rugosidade: 0.88, ...tex("texturas/madeira.png", [2, 6]) },
    tabua: { cor: "#7d6650", rugosidade: 0.85, ...tex("texturas/madeira_crua.png", [1, 4]) },
    tabua_velha: { cor: "#5c4a38", rugosidade: 0.9, ...tex("texturas/madeira_crua.png", [1, 4]) },
    ferro: { cor: "#63676b", metalico: 0.72, rugosidade: 0.66, ...tex("texturas/ferro_ferrugem.png", [4, 1]) },
    ferro_escuro: { cor: "#3b3e42", metalico: 0.68, rugosidade: 0.72, ...tex("texturas/ferro_ferrugem.png", [2, 2]) },
    ferrugem: { cor: "#6a3d22", metalico: 0.3, rugosidade: 0.95 },
    papel_sujo: { cor: "#c8bb95", rugosidade: 1 },
    tinta: { cor: "#2b1a14", rugosidade: 0.95 },
  } satisfies Record<string, Material>;

  // ── helpers ─────────────────────────────────────────────────────────────
  /** Caixa com pai explícito (ou na raiz) e posição/rotação opcionais. */
  const caixa = (
    nome: string, largura: number, altura: number, profundidade: number, material: Material,
    onde: { pai?: NoRef; posicao?: V3; rotacao?: V3 } = {},
  ): NoRef =>
    (onde.pai ?? cena).criar("box", { largura, altura, profundidade }, {
      nome, material,
      ...(onde.posicao || onde.rotacao
        ? { transform: { posicao: onde.posicao ?? [0, 0, 0], rotacao: onde.rotacao ?? [0, 0, 0] } }
        : {}),
    });

  /** Face de `alvo` virada para quem olha na direção `normal` — a que vai
   * encostar no dono, achada pela normal de mundo em vez de escrita à mão (e
   * que continua certa se a peça for girada depois). */
  const faceViradaPara = (alvo: NoRef, normal: V3): NomeFace => {
    let melhor: NomeFace = "base", pior = Infinity;
    for (const f of FACES) {
      const n = alvo.face(f).normalMundo();
      const cosseno = n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2];
      if (cosseno < pior) { pior = cosseno; melhor = f; }
    }
    return melhor;
  };

  /** Declara contato entre a face `face` de `dono` e a face de `alvo` virada
   * para ela. `acoplar` só CONFERE depois — nunca posiciona nada. */
  const acoplarContato = (dono: NoRef, face: NomeFace, alvo: NoRef): void => {
    cena.acoplar({
      tipo: "contato",
      a: { no: dono, face },
      b: { no: alvo, face: faceViradaPara(alvo, dono.face(face).normalMundo()) },
    });
  };

  /** Assenta `alvo` na face `face` de `dono` com o CENTRO no ponto de MUNDO
   * `ponto`: as coordenadas (u, v) saem da projeção nos eixos U/V da face, em
   * vez de calculadas à mão (a origem de u/v é o centro da face). A peça nasce
   * SEM orientação; `orientar: true` fica reservado para peça de revolução
   * cujo eixo tem que apontar para fora da superfície. Por padrão também
   * declara o contato: peça apoiada sem acoplamento sai no linter como
   * "flutuando". */
  const naFace = (
    dono: NoRef, face: NomeFace, alvo: NoRef, ponto: V3,
    opcoes: { solto?: boolean; orientar?: boolean; acoplar?: boolean } = {},
  ): NoRef => {
    const f = dono.face(face);
    const o = f.origemMundo();
    const e = f.eixosMundo();
    const d: V3 = [ponto[0] - o[0], ponto[1] - o[1], ponto[2] - o[2]];
    f.colocar(alvo, {
      u: d[0] * e.u[0] + d[1] * e.u[1] + d[2] * e.u[2],
      v: d[0] * e.v[0] + d[1] * e.v[1] + d[2] * e.v[2],
      ...(opcoes.solto ? { reparentar: false } : {}),
      ...(opcoes.orientar ? {} : { orientar: false }),
    });
    if (opcoes.acoplar !== false) acoplarContato(dono, face, alvo);
    return alvo;
  };

  /** Chapa de ferro deitada na face da FRENTE da folha. Nasce no grupo
   * `ferragens` — e não na tábua — porque as tábuas moram num `row`, e um
   * container flex mede a SUBÁRVORE de cada filho: uma cinta de 64 cm dentro
   * de uma tábua de 19,7 cm faria o `row` espaçar as tábuas como se a tábua
   * tivesse 64 cm. O `colocar` assenta no mundo, seja qual for o pai. */
  const naFrente = (
    nome: string, largura: number, altura: number, espessura: number, material: Material,
    x: number, y: number,
  ): NoRef => {
    const peca = ferragens.criar("box", { largura, altura, profundidade: espessura }, { nome, material });
    return naFace(tabuaRef, "sul", peca, [x, y, 0], { solto: true });
  };

  /** Cravo de cabeça redonda pregado num ponto de MUNDO da face `face`.
   * Nasce orientado (o +y dele vira a normal da face), que é o que faz o
   * contato declarado fechar: a face "base" da meia-esfera fica exatamente no
   * plano da chapa. */
  const cravoEm = (dono: NoRef, face: NomeFace, ponto: V3, raio = CRAVO_RAIO): NoRef =>
    naFace(dono, face, dono.criar("sphere", { raio, segmentos: 12 }, { nome: "cravo", material: M.ferro_escuro }), ponto);

  /** O mesmo, em (u, v) DO PLANO da face — centímetros contados na própria
   * chapa. Como nenhuma peça deste arquivo é orientada, os nomes de face
   * valem no sentido do mundo: "sul" é a frente da porta (+z, com U para −x e
   * V para +y) e "norte" é o lado de dentro (U e V para +x e +y). */
  const cravo = (dono: NoRef, u: number, v = 0, raio = CRAVO_RAIO, face: NomeFace = "sul"): NoRef => {
    const f = dono.face(face);
    const o = f.origemMundo();
    const e = f.eixosMundo();
    return cravoEm(dono, face, [
      o[0] + e.u[0] * u + e.v[0] * v,
      o[1] + e.u[1] * u + e.v[1] * v,
      o[2] + e.u[2] * u + e.v[2] * v,
    ], raio);
  };

  /** Mancha de ferrugem: elipse deformada por três harmônicos de fase
   * sorteada, extrudada finíssima (0,4 mm de relevo) e assentada na face.
   * Pseudoaleatória determinística — o modelo sai igual a cada save. */
  const mancha = (dono: NoRef, face: NomeFace, x: number, y: number, a: number, b: number, semente: number): NoRef => {
    let s = semente;
    const acaso = () => ((s = (s * 16807) % 2147483647), (s - 1) / 2147483646);
    const h1 = 0.14 + acaso() * 0.08, p1 = acaso() * 6.28;
    const h2 = -0.10 + acaso() * 0.14, p2 = acaso() * 6.28;
    const h3 = -0.05 + acaso() * 0.10, p3 = acaso() * 6.28;
    const n = 48;
    const perfil: Array<[number, number]> = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * 2 * PI;
      const r = 1 + h1 * Math.cos(3 * t + p1) + h2 * Math.cos(5 * t + p2) + h3 * Math.cos(7 * t + p3);
      const encolhe = 1 - 0.25 * Math.abs(Math.cos(t)); // um lado mais raso que o outro
      return [a * r * Math.cos(t) * encolhe, b * r * Math.sin(t)];
    });
    const peca = ferragens.criar("extrude", { perfil, altura: 0.0004 }, { nome: "mancha de ferrugem", material: M.ferrugem });
    // orientada: a extrusão nasce no plano XZ e cresce em +y, então o eixo
    // dela precisa ser apontado para fora da face para a mancha deitar nela
    return naFace(dono, face, peca, [x, y, 0], { solto: true, orientar: true });
  };

  /** Todos os traços de um `texto()`, achatados: ele devolve só a RAIZ de cada
   * caractere (o resto vira corrente de filhos, para o linter tratar os traços
   * de uma letra como um conjunto só). Cada traço nasce com a base exatamente
   * no plano da face onde o texto foi escrito, então dá para declarar o
   * contato de todos com essa face — inclusive os que a função não devolve. */
  const tracos = (raizes: readonly NoRef[]): NoRef[] => {
    const saida: NoRef[] = [];
    const anda = (no: NoRef): void => {
      saida.push(no);
      for (const filho of no.filhos()) anda(filho);
    };
    for (const r of raizes) anda(r);
    return saida;
  };

  // ════════════════════════════════════════════════════════════════════════
  // 1. BATENTE — duas ombreiras no chão e a cabeceira vencendo o vão entre
  // elas, com o topo rente ao topo do batente.
  // ════════════════════════════════════════════════════════════════════════
  const batente = cena.criar("grupo", {}, { nome: "batente" });
  const ombreira = (lado: -1 | 1): NoRef =>
    caixa(lado < 0 ? "ombreira oeste" : "ombreira leste", MONT_LARG, MONT_ALT, MONT_PROF, M.carvalho, {
      pai: batente, posicao: [lado * (VAO_LARG / 2 + MONT_LARG / 2), MONT_ALT / 2, 0],
    });
  const ombreiraO = ombreira(-1);
  const ombreiraL = ombreira(1);
  const cabeca = naFace(ombreiraO, "leste", caixa("cabeceira", CAB_LARG, MONT_LARG, MONT_PROF, M.carvalho),
    [0, VAO_ALT + MONT_LARG / 2, 0], { acoplar: false });
  acoplarContato(ombreiraO, "leste", cabeca);   // a ponta oeste vence o vão…
  acoplarContato(ombreiraL, "oeste", cabeca);   // …e encontra a ponta leste

  // ════════════════════════════════════════════════════════════════════════
  // 2. A JUNTA — o eixo da dobradiça, e só ele, é coordenada cravada.
  // ════════════════════════════════════════════════════════════════════════
  const dobradica = cena.criar("junta", { eixo: "y", angulo: 0, limites: [-1.35, 0.05] }, {
    nome: "dobradiça", transform: { posicao: [EIXO_X, 0, EIXO_Z] },
  });

  // ════════════════════════════════════════════════════════════════════════
  // 3. FOLHA — quatro tábuas num `row`; a junta aparente é o vão real entre
  // elas, não textura. O `row` resolve eixo e centro; ninguém calcula o x de
  // uma tábua à mão.
  // ════════════════════════════════════════════════════════════════════════
  const folha = dobradica.criar("row", { gap: TABUA_GAP }, {
    nome: "folha da porta",
    transform: { posicao: [-EIXO_X, FOLHA_CY, -EIXO_Z] }, // centro da folha → mundo (0; 1,04; 0)
  });
  const tabuas: NoRef[] = [];
  for (let i = 0; i < TABUAS; i++) {
    tabuas.push(folha.criar("box", { largura: TABUA_LARG, altura: FOLHA_ALT, profundidade: FOLHA_ESP }, {
      nome: i === 0 || i === TABUAS - 1 ? "tábua da borda" : "tábua",
      material: i % 2 === 0 ? M.tabua : M.tabua_velha,
    }));
  }
  // Face de referência da ferragem: a 2ª tábua. Todas têm a mesma face da
  // frente, então a cinta passa por cima das quatro nascendo de uma só.
  const tabuaRef = tabuas[1]!;
  const ferragens = dobradica.criar("grupo", {}, { nome: "ferragens" });

  // ════════════════════════════════════════════════════════════════════════
  // 4. DOBRADIÇAS DE ESPIGÃO — braço e pino no batente, olhal e língua na
  // folha.
  // ════════════════════════════════════════════════════════════════════════
  for (const altura of LG_DOBRADICA) {
    const topoBraco = altura - OLHAL_TUBO;      // topo do braço = base do pino = base do olhal
    const braco = naFace(ombreiraO, "leste",
      caixa("braço do espigão", BRACO_COMP, BRACO_ESP, BRACO_ESP, M.ferro),
      [-(VAO_LARG / 2 - BRACO_COMP / 2), topoBraco - BRACO_ESP / 2, EIXO_Z]);

    // O pino sobe do braço exatamente no eixo da dobradiça.
    const pino = naFace(braco, "topo", braco.criar("cylinder",
      { raioTopo: PINO_RAIO, raioBase: PINO_RAIO, altura: PINO_ALT, segmentos: 16 },
      { nome: "pino do espigão", material: M.ferro_escuro }), [EIXO_X, 0, EIXO_Z]);
    naFace(pino, "topo", pino.criar("cylinder",
      { raioTopo: 0.010, raioBase: 0.010, altura: 0.005, segmentos: 16 },
      { nome: "cabeça do pino", material: M.ferro }), [EIXO_X, 0, EIXO_Z]);

    // Olhal: anel em torno do pino, com a base apoiada no topo do braço. É uma
    // das peças ORIENTADAS do arquivo: o eixo de revolução do anel tem que
    // apontar para fora da superfície (para o anel ficar de pé, abraçando o
    // pino) — e por isso a face que encosta no braço é a "base" real dele,
    // cujo centro já cai no eixo da dobradiça.
    const olhal = naFace(braco, "topo", ferragens.criar("torus",
      { raio: OLHAL_RAIO, raioTubo: OLHAL_TUBO, segmentos: 20, segmentosTubo: 10 },
      { nome: "olhal da dobradiça", material: M.ferro_escuro }), [EIXO_X, 0, EIXO_Z], { solto: true, orientar: true });
    olhal.permitirContato(pino);

    // Língua: sai do olhal e corre sobre a tábua — forjada no próprio anel.
    const lingua = naFrente("língua da dobradiça", 0.30, BANDA_LARG, CHAPA_ESP, M.ferro,
      EIXO_X + 0.15, altura);
    lingua.permitirContato(olhal);
    for (const u of [-0.12, -0.07, -0.02, 0.03, 0.08]) cravo(lingua, u);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5. A FRENTE — cinta, chapa de fechadura, aldrava, aviso e ferrugem.
  // ════════════════════════════════════════════════════════════════════════
  const cinta = naFrente("cinta", 0.64, 0.09, CHAPA_ESP, M.ferro, 0, 1.35);
  for (const u of [-0.28, -0.21, -0.14, -0.07, 0, 0.07, 0.14, 0.21, 0.28]) cravo(cinta, u);
  // ferrugem onde o ferro é maltratado: nos vãos entre os cravos
  mancha(cinta, "sul", -0.175, 1.35, 0.022, 0.038, 11);
  mancha(cinta, "sul", 0.105, 1.35, 0.022, 0.038, 29);

  // Furo de chave aberto de verdade: um círculo e um rasgo retangular,
  // passantes, em `furar` — a madeira aparece pelo vão. A face furada é a
  // "sul" (a chapa deitada não é girada: a "topo" dela é a ARESTA de 7 mm).
  const aro = naFrente("chapa da fechadura", ARO_LARG, ARO_ALT, ARO_ESP, M.ferro_escuro, 0.30, 1.16);
  aro
    .furar({ face: "sul", forma: { tipo: "circulo", raio: 0.008, segmentos: 16 }, u: 0, v: 0.006 })
    .furar({ face: "sul", forma: { tipo: "retangulo", largura: 0.008, altura: 0.030 }, u: 0, v: -0.019 });
  for (const [u, v] of [[-0.035, 0.075], [0.035, 0.075], [-0.035, -0.075], [0.035, -0.075]] as const)
    cravo(aro, u, v, 0.004);
  mancha(aro, "sul", 0.30, 1.075, 0.026, 0.014, 47);

  // Aldrava: pino curto saindo de uma placa redonda, com o anel pendurado
  // nele. O anel e o pino são peças de revolução com o eixo para fora da
  // placa (`orientar: true`) e o acoplamento é um PIVÔ: os CENTROS coincidem e
  // o eixo de giro é a normal compartilhada — o próprio pino.
  const placaAldrava = naFrente("placa da aldrava", ALDRAVA_PLACA, ALDRAVA_PLACA, 0.006, M.ferro, 0.30, 0.98);
  const pinoAldrava = naFace(placaAldrava, "sul", placaAldrava.criar("cylinder",
    { raioTopo: PINO_RAIO, raioBase: PINO_RAIO, altura: 0.030, segmentos: 16 },
    { nome: "pino da aldrava", material: M.ferro_escuro }), [0.30, 0.98, 0], { orientar: true });
  naFace(pinoAldrava, "topo", pinoAldrava.criar("cylinder",
    { raioTopo: 0.010, raioBase: 0.010, altura: 0.004, segmentos: 16 },
    { nome: "cabeça do pino", material: M.ferro }), [0.30, 0.98, 0], { orientar: true });
  const aldrava = ferragens.criar("torus",
    { raio: ARO_RAIO, raioTubo: ARO_TUBO, segmentos: 24, segmentosTubo: 12 },
    { nome: "aldrava", material: M.ferro_escuro });
  naFace(placaAldrava, "sul", aldrava, [0.30, 0.98, 0], { solto: true, orientar: true, acoplar: false });
  cena.acoplar({ tipo: "pivo", a: { no: placaAldrava, face: "sul" }, b: { no: aldrava, face: "base" } });
  aldrava.permitirContato(pinoAldrava);

  // Aviso pregado, com o texto em relevo da fonte de traços da lib (nada de
  // imagem) e quatro cravos. Cada letra é uma corrente de caixas sobre o
  // papel; o contato é declarado para a corrente INTEIRA, não só para a raiz
  // que `texto()` devolve.
  const aviso = naFrente("aviso pregado", AVISO_LARG, AVISO_ALT, AVISO_ESP, M.papel_sujo, 0.17, 1.60);
  for (const [txt, v] of [["NAO", 0.035], ["ABRA", -0.03]] as const) {
    const letra = texto(aviso, "letra", txt, planoDeFace(aviso.face("sul"), 0, v), {
      unidade: 0.0032, traco: 0.0011, relevo: 0.0004, material: M.tinta,
    });
    for (const t of tracos(letra)) acoplarContato(aviso, "sul", t);
  }
  for (const [u, v] of [[-0.055, 0.068], [0.055, 0.068], [-0.055, -0.068], [0.055, -0.068]] as const)
    cravo(aviso, u, v, 0.0035);

  // ════════════════════════════════════════════════════════════════════════
  // 6. O LADO DE DENTRO — travessas, escora em diagonal, corpo da fechadura
  // (atrás do furo de chave) e o ferrolho com a fresta na ombreira.
  // ════════════════════════════════════════════════════════════════════════
  /** Peça presa na face de trás da folha (+x e +y no plano da face "norte").
   * Com `rotacao`, o assentamento continua sendo `colocar` — a caixa GIRADA é
   * medida e encostada no plano — e o contato é declarado com a face da peça
   * que ficou virada para a tábua, que `faceViradaPara` acha sozinho. */
  const noFundo = (
    nome: string, largura: number, altura: number, espessura: number, material: Material,
    x: number, y: number, rotacao?: V3,
  ): NoRef => {
    const peca = ferragens.criar("box", { largura, altura, profundidade: espessura }, {
      nome, material, ...(rotacao ? { transform: { rotacao } } : {}),
    });
    return naFace(tabuaRef, "norte", peca, [x, y, 0], { solto: true });
  };

  for (const y of [0.14, 1.94]) {
    const travessa = noFundo("travessa", TRAVESSA_COMP, TRAVESSA_ALT, TRAVESSA_ESP, M.carvalho, 0, y);
    for (const u of [-0.30, -0.15, 0, 0.15, 0.30]) cravo(travessa, u, 0, CRAVO_RAIO, "norte");
  }

  // Escora em diagonal: de (−0,30; 0,24) a (0,30; 1,84) — tábua de 12 cm de
  // largura por 3 de espessura, encostada nas travessas sem invadi-las. Como
  // ela está girada, o u/v da face (que vem do AABB, alinhado ao mundo) não
  // acompanha a peça: os cravos são cravados por PONTO, na reta da diagonal.
  const ESCORA_CY = 1.04;
  const DIAG = Math.atan2(1.6, 0.6);
  const escora = noFundo("escora em diagonal", Math.hypot(0.6, 1.6), 0.12, TRAVESSA_ESP, M.carvalho,
    0, ESCORA_CY, [0, 0, DIAG]);
  for (const t of [-0.55, 0, 0.55]) {
    cravoEm(escora, "norte", [t * Math.cos(DIAG), ESCORA_CY + t * Math.sin(DIAG), 0]);
  }

  // Corpo da fechadura: 18 cm no sentido da porta, 9 de altura e 4,5 de
  // espessura — assentado atrás do furo de chave da frente.
  const corpo = noFundo("corpo da fechadura", 0.18, 0.09, 0.045, M.ferro_escuro, 0.30, 1.16);
  for (const [u, v] of [[-0.07, 0.028], [0.07, 0.028], [-0.07, -0.028], [0.07, -0.028]] as const)
    cravo(corpo, u, v, 0.0045, "norte");
  mancha(corpo, "norte", 0.30, 1.16, 0.05, 0.026, 73);

  // ── o ferrolho: barra que corre sobre duas guias até entrar na ombreira ──
  // Primeiro as duas guias pregadas na face de dentro…
  for (const x of [0.22, 0.34]) {
    const guia = noFundo("guia do ferrolho", GUIA_LADO, GUIA_LADO, GUIA_ESP, M.ferro, x, FERROLHO_Y);
    for (const [u, v] of [[-0.015, -0.015], [0.015, -0.015], [-0.015, 0.015], [0.015, 0.015]] as const)
      cravo(guia, u, v, 0.0035, "norte");
  }
  // …depois a fresta na ombreira, um furo de VERDADE (`furar`) feito ANTES de
  // a barra existir: a broca atravessa a espessura do batente e não encontra
  // nada, porque a barra ainda está fora, a 1,5 cm da face.
  ombreiraL.furar({
    face: "oeste",
    forma: { tipo: "retangulo", largura: 0.030, altura: 0.030 },
    // na face "oeste" da ombreira o U corre para −z e o V para +y: a fresta
    // fica na altura do ferrolho e na espessura da barra
    u: 0.043, v: FERROLHO_Y - MONT_ALT / 2,
  });
  // A barra deita SOBRE a guia leste: `colocar` encosta a face de baixo dela
  // no plano da guia e o contato sai declarado; o segundo acoplamento fecha a
  // barra sobre a guia oeste, que fica mais para dentro.
  const guias = ferragens.filhos().filter((f) => f.nome === "guia do ferrolho");
  const ferrolho = naFace(guias[1]!, "norte", ferragens.criar("box",
    { largura: FERROLHO_COMP, altura: FERROLHO_ALT, profundidade: FERROLHO_ESP },
    { nome: "ferrolho", material: M.ferro }), [0.275, FERROLHO_Y, 0], { solto: true });
  acoplarContato(guias[0]!, "norte", ferrolho);
  ferrolho.permitirContato(ombreiraL); // a barra entra na fresta por projeto

  // Maçaneta do ferrolho, no pé da barra: um pino curto para fora da porta,
  // filho da barra (o padrão de `colocar` adota o alvo), então corre junto.
  naFace(ferrolho, "norte", ferrolho.criar("cylinder",
    { raioTopo: 0.009, raioBase: 0.009, altura: 0.018, segmentos: 16 },
    { nome: "maçaneta do ferrolho", material: M.ferro_escuro }), [0.17, FERROLHO_Y, 0], { orientar: true });

  // ════════════════════════════════════════════════════════════════════════
  // 7. ANIMAÇÃO — a porta que abre sozinha, a que leva empurrão e o ferrolho
  // que corre.
  //
  // `angulo` de junta é o que gira de verdade (interpolar `rotacao` de 0 a 2π
  // não sai do lugar — mesma orientação). A abertura é pequena, mas passa por
  // PARADAS curtas: a hesitação é o efeito, uma porta empurrada por algo que
  // para, escuta e empurra de novo.
  //
  // O olhal segue acoplado ao braço durante todo o movimento — o anel gira em
  // torno do próprio eixo, então a face que apoia no braço não sai do lugar.
  // A aldrava NÃO é animada de propósito: o pivô declara que o anel está no
  // lugar, e um balanço visível exigiria soltar essa declaração (ou modelar o
  // pino como junta) — `acoplar` só confere, não resolve.
  // ════════════════════════════════════════════════════════════════════════
  cena.animar("abrir", { duracao: 6 })
    .faixa(dobradica, "angulo", [
      [0, 0], [0.9, -0.06], [1.4, -0.03], [2.4, -0.44], [3.0, -0.40],
      [4.1, -0.66], [4.7, -0.63], [6, -0.85],
    ], { interpolacao: "suave" })
    // …e, do lado de dentro, a barra do ferrolho desliza para dentro da fresta
    .faixa(ferrolho, "posicao", [[0, [0, 0, 0]], [1.6, [0, 0, 0]], [2.2, [FERROLHO_CURSO, 0, 0]]], {
      relativo: true, interpolacao: "suave",
    });

  cena.animar("assombrar", { duracao: 3.2, repetir: "vaivem" })
    .faixa(dobradica, "angulo", [[0, 0], [0.5, -0.045], [1.6, -0.01], [3.2, 0]], { interpolacao: "suave" });

  cena.animar("trancar", { duracao: 1.6 })
    .faixa(ferrolho, "posicao", [[0, [0, 0, 0]], [1.0, [FERROLHO_CURSO, 0, 0]]], {
      relativo: true, interpolacao: "suave",
    });

  return cena;
}
