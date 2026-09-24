/**
 * Reator nuclear — asset #2 do kit de horror.
 *
 * Um vaso de pesquisa aberto para recarga, no pátio: o CABEÇOTE foi levantado
 * e está no chão, sobre o berço, com os furos dos prisioneiros VAZIOS (os
 * prisioneiros continuam no flange do vaso, com as porcas em cima). Com a boca
 * livre, o núcleo aparece pendurado: a placa-tampão apoia no flange do vaso e
 * os elementos combustíveis descem dela, com os canais quadrados FUROS de
 * verdade — olhando por cima, vê-se o feixe de quatro varetas dentro de cada
 * colmeia. Os tubos-guia das barras de controle estão vazios: as barras estão
 * no rack de armazenagem. No fundo do vaso, o dreno com registro de gaveta —
 * e é dele que cai o pingo, sobre a mancha molhada no pátio. Por cima de tudo,
 * a luminária do pórtico balança devagar.
 *
 * O que este arquivo demonstra, além da peça:
 *
 *   · FURO como geometria, não desenho: canal de combustível, janelas da placa
 *     do núcleo, furos dos prisioneiros (no flange do vaso E no do cabeçote),
 *     tampas e alças furadas, tampo do rack. Nada disso é textura — é `furar`,
 *     e o vão atravessa a peça.
 *   · `lateral()` para o que nasce numa superfície de revolução: os bocais, o
 *     dreno e o manômetro saem do casco na altura e no ângulo pedidos,
 *     orientados pela normal REAL da parede. De brinde, a peça sai girada — e
 *     aí vale a armadilha nº 2 abaixo.
 *   · `circular()` para os 16 prisioneiros e as 16 porcas: os dois anéis saem
 *     da mesma chamada, então não há como um ficar fora do outro.
 *   · O trefoil radioativo é GEOMETRIA: um `extrude` com um perfil de três pás
 *     em volta do disco central. O contorno é ESTRELADO em relação ao centro
 *     (cada raio o corta uma vez só), então um polígono único dá conta dele.
 *
 * Três armadilhas de referencial que valem para qualquer modelo:
 *
 *   · `colocar` numa face assenta a peça NO PLANO dela — o `u`/`v` só escolhe
 *     onde, dentro do plano. Altura acima do plano é `gap` (deslocamento
 *     assinado ao longo da normal), nunca um `y` no meio de um ponto de mundo
 *     que a projeção vai descartar.
 *   · `u`/`v` são medidos nos eixos DA FACE, com origem no centro — e esses
 *     eixos giram junto com a peça. Por isso os parafusos de um flange de
 *     bocal usam as MESMAS coordenadas `(u, v)` que os furos (`anel`), em vez
 *     de um deslocamento em x/z do mundo, que ficaria no lugar errado assim
 *     que o bocal saísse torto.
 *   · Quem passa POR DENTRO de uma peça precisa estar na linhagem dela. O
 *     linter ignora interpenetração entre parentes — e como o OBB de um vaso
 *     oco é a caixa cheia, tudo que mora dentro dele (placa, elementos,
 *     tubos-guia) desce do próprio casco. Nada de `reparentar: false` ali.
 *
 * O que atravessa de propósito e não é parentesco (prisioneiro passando pelo
 * furo da placa, parafuso pelo furo da tampa, barra pelo tampo do rack) vai
 * declarado com `permitirContato` — o linter segue pegando o que NÃO foi
 * declarado.
 *
 * Sem CSG, luzes ou câmera. Texturas são os PNGs de
 * `examples/web/public/texturas/` (o Vite serve essa pasta na raiz); o rótulo
 * do casco é um adesivo em parede curva (`colarAdesivo`).
 */
import {
  Cena, circular, planoDeFace, texto,
  type Material, type NoRef, type Vec3,
} from "@snaple/core";

type NomeFace = "topo" | "base" | "norte" | "sul" | "leste" | "oeste";
const FACES: readonly NomeFace[] = ["topo", "base", "norte", "sul", "leste", "oeste"];

export function montarCena(): Cena {
  const cena = new Cena();
  const PI = Math.PI;

  const COM_TEXTURAS = true;
  const tex = (src: string, repetir?: [number, number]): Partial<Material> =>
    COM_TEXTURAS ? { textura: { src, ...(repetir ? { repetir } : {}) } } : {};

  // ── medidas (m) ─────────────────────────────────────────────────────────
  const DECK_LARG = 5.2, DECK_PROF = 4.8, DECK_ESP = 0.16;

  const R_CASCO = 0.70;                  // raio externo do vaso
  const ESP_PAREDE = 0.06;               // espessura da parede
  const R_BOCA = R_CASCO - ESP_PAREDE;   // 0,64 — o furo do vaso
  const H_CASCO = 2.30;                  // altura do perfil do casco
  const ANEL_ALT = 0.12, ANEL_R = 0.78;  // anel de sustentação sob o vaso
  const CASCO_Y = ANEL_ALT;

  const FLANGE_R = 0.84, FLANGE_ALT = 0.14;
  const FLANGE_Y = CASCO_Y + H_CASCO;    // 2,42 — topo do casco
  const PRISION_RAIO = 0.77;             // anel dos prisioneiros
  const N_PRISION = 16;
  const FURO_PRISION = 0.016, PRISION_HASTE = 0.014;

  const PLACA_R = 0.80, PLACA_ALT = 0.06;
  const PASSO_GRELHA = 0.24;             // malha 3×3 das janelas
  const MEIA_JANELA = 0.065;
  const TUBO_R = 0.042, FURO_GUIA = 0.045, DESLOC_GUIA = 0.12;

  const ELEM_LADO = 0.12, ELEM_CANAL = 0.044;   // canal interno de 88 mm
  const ELEM_ALT = 1.14;
  const VARETA_R = 0.016, BICO_ALT = 0.05;

  const BOCAL_ALT = 0.26, FLANGE_BOCAL_R = 0.16, FLANGE_BOCAL_ALT = 0.03;
  const DRENO_R = 0.05, DRENO_ALT = 0.20, GOTA_R = 0.013, MANCHA_ALT = 0.004;

  const CABO_R = 0.84, DOMO_ALT = 0.34, DOMO_ESP = 0.03;
  const BERCO_LARG = 1.6, BERCO_ALT = 0.12, BERCO_PROF = 0.16, BERCO_Z = 0.45;
  const CAB_X = 1.60, CAB_Z = 1.25;

  const RACK_LARG = 0.90, RACK_PROF = 0.50, RACK_X = -1.45, RACK_Z = 1.30;
  const POSTE_LADO = 0.05, POSTE_ALT = 1.26, TAMPO_ALT = 0.05, BASE_RACK_ALT = 0.04;
  const BARRA_R = 0.045, BARRA_ALT = 1.42, CABECA_R = 0.06, CABECA_ALT = 0.05;

  const SIG_LARG = 0.62, SIG_ALT = 0.62, SIG_ESP = 0.02, SIG_H = 1.36;
  const SIG_X = 0.20, SIG_Z = 1.80;

  const TRV_ALT = 1.60, TRV_Z0 = -1.90, TRV_Z1 = -1.35, TRV_X = 1.6;
  const TRV_ZC = (TRV_Z0 + TRV_Z1) / 2;
  const TRV_ESP = 0.08;                  // longarina
  const CHAPA_ALT = 0.03, CHAPA_LARG = 0.62;
  const GUARDA_ALT = 1.05;

  const POR_X = 1.6, POR_Z = -0.40, POR_COLUNA_H = 3.30, POR_VIGA_ALT = 0.10;
  const LAMP_CABO = 0.25, LAMP_CABO_R = 0.008;
  const LAMP_ALT = 0.16, LAMP_R = 0.16;                 // cúpula
  const DOBR_ESP = 0.06, DOBR_ALT = 0.025;      // chapa FIXA (pendurada na viga)
  const DOBR_MOVEL = 0.02;                       // chapa MÓVEL: mais baixa que a fixa,
                                                 // senão a quina dela sobe na viga ao girar
  const DOBR_Y = POR_COLUNA_H - DOBR_ALT / 2;           // eixo da dobradiça

  // ── materiais ───────────────────────────────────────────────────────────
  const M = {
    aço: { cor: "#7c848a", metalico: 0.85, rugosidade: 0.35, ...tex("texturas/metal_galvanizado.png", [2, 2]) },
    aço_escuro: { cor: "#3d4348", metalico: 0.7, rugosidade: 0.6, ...tex("texturas/metal_galvanizado.png", [1, 2]) },
    ferro_velho: { cor: "#6b4a30", metalico: 0.4, rugosidade: 0.95, ...tex("texturas/ferro_ferrugem.png", [3, 2]) },
    concreto: { cor: "#6c6a66", rugosidade: 0.95, ...tex("texturas/tijolo_cru.png", [8, 8]) },
    vareta: { cor: "#c8c5bc", metalico: 0.9, rugosidade: 0.22 },
    absorvedor: { cor: "#2a2f34", metalico: 0.5, rugosidade: 0.55 },
    amarelo: { cor: "#e8b21c", metalico: 0.1, rugosidade: 0.75 },
    magenta: { cor: "#a4177e", metalico: 0.1, rugosidade: 0.8 },
    tinta: { cor: "#191512", rugosidade: 0.95 },
    agua: { cor: "#4e6a70", metalico: 0.1, rugosidade: 0.25, opacidade: 0.85 },
    gota: { cor: "#9fb6bd", metalico: 0.2, rugosidade: 0.15, opacidade: 0.75 },
    lampada: { cor: "#7a1208", emissivo: { cor: "#ff2a12", intensidade: 1.8 }, rugosidade: 0.4 },
    luz: { cor: "#ffe6b0", emissivo: { cor: "#ffd98a", intensidade: 1.4 }, rugosidade: 0.3 },
  } satisfies Record<string, Material>;

  // ── helpers ─────────────────────────────────────────────────────────────
  const caixa = (nome: string, largura: number, altura: number, profundidade: number, material: Material): NoRef =>
    cena.criar("box", { largura, altura, profundidade }, { nome, material });

  const cilindro = (nome: string, raio: number, altura: number, material: Material, segmentos = 24): NoRef =>
    cena.criar("cylinder", { raioTopo: raio, raioBase: raio, altura, segmentos }, { nome, material });

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

  /** Contato entre duas faces já conhecidas — para quando o par é sabido (um
   * prisioneiro passando pelo furo de uma placa). */
  const acoplarFaces = (a: NoRef, faceA: NomeFace, b: NoRef, faceB: NomeFace): void => {
    cena.acoplar({ tipo: "contato", a: { no: a, face: faceA }, b: { no: b, face: faceB } });
  };

  /** Ponto de mundo do par `(u, v)` NO PLANO da face — para quando o que
   * importa são as coordenadas da própria face (um anel de furos, por
   * exemplo), e não um ponto de mundo que a projeção vai reinterpretar. */
  const pontoDaFace = (dono: NoRef, face: NomeFace, u: number, v: number): Vec3 => {
    const f = dono.face(face);
    const o = f.origemMundo();
    const e = f.eixosMundo();
    return [
      o[0] + e.u[0] * u + e.v[0] * v,
      o[1] + e.u[1] * u + e.v[1] * v,
      o[2] + e.u[2] * u + e.v[2] * v,
    ];
  };

  /** Assenta `alvo` na face `face` de `dono`: a borda oposta à normal encosta
   * no plano, e o centro do alvo cai no ponto de MUNDO `ponto` projetado nos
   * eixos da face. `gap` levanta a peça ao longo da normal — a altura acima do
   * plano NÃO vem do `y` do ponto, porque `colocar` só usa o plano. A peça
   * nasce SEM orientação, salvo `orientar: true` — para uma revolução cujo
   * eixo deva sair da superfície, ou uma extrusão que deva deitar na face. Por
   * padrão também declara o contato: peça apoiada sem acoplamento sai no
   * linter como "flutuando". */
  const naFace = (
    dono: NoRef, face: NomeFace, alvo: NoRef, ponto: Vec3,
    opcoes: { orientar?: boolean; acoplar?: boolean; gap?: number } = {},
  ): NoRef => {
    const f = dono.face(face);
    const o = f.origemMundo();
    const e = f.eixosMundo();
    const d: Vec3 = [ponto[0] - o[0], ponto[1] - o[1], ponto[2] - o[2]];
    f.colocar(alvo, {
      u: d[0] * e.u[0] + d[1] * e.u[1] + d[2] * e.u[2],
      v: d[0] * e.v[0] + d[1] * e.v[1] + d[2] * e.v[2],
      ...(opcoes.orientar ? {} : { orientar: false }),
      ...(opcoes.gap !== undefined ? { gap: opcoes.gap } : {}),
    });
    if (opcoes.acoplar !== false) acoplarContato(dono, face, alvo);
    return alvo;
  };

  /** O mesmo, mas com o alvo numa coordenada `(u, v)` explícita da face —
   * para um anel de peças que precisam casar exatamente com os furos. */
  const naFaceUV = (
    dono: NoRef, face: NomeFace, alvo: NoRef, u: number, v: number,
    opcoes: { orientar?: boolean; acoplar?: boolean; gap?: number } = {},
  ): NoRef => naFace(dono, face, alvo, pontoDaFace(dono, face, u, v), opcoes);

  /** Posição no anel de `n` furos, em coordenadas DA FACE: mesma convenção de
   * `circular()` (`x = cos`, `z = sin`), que também é a dos eixos u/v de uma
   * face horizontal. Usada tanto pelos `furar` quanto pelas peças que entram
   * nesses furos — uma conta só para os dois. */
  const anel = (raio: number, k: number, n: number, fase = PI / 2): [number, number] => {
    const a = fase + (2 * PI * k) / n;
    return [raio * Math.cos(a), raio * Math.sin(a)];
  };

  /** Todos os traços de um `texto()`, achatados (ele devolve só a raiz de cada
   * caractere; o resto vira corrente de filhos). */
  const tracos = (raizes: readonly NoRef[]): NoRef[] => {
    const saida: NoRef[] = [];
    const anda = (no: NoRef): void => {
      saida.push(no);
      for (const filho of no.filhos()) anda(filho);
    };
    for (const r of raizes) anda(r);
    return saida;
  };

  /** Grava uma linha de texto numa face e declara o contato de cada traço com
   * ela (sem isso, o texto em relevo sai no linter como peça flutuando). */
  const gravar = (
    dono: NoRef, face: NomeFace, nome: string, conteudo: string, v: number,
    unidade: number, material: Material,
  ): void => {
    const normal = dono.face(face).normalMundo();
    for (const t of tracos(texto(dono, nome, conteudo, planoDeFace(dono.face(face), 0, v), {
      unidade, traco: unidade * 0.32, relevo: unidade * 0.12, material,
    }))) acoplarFaces(dono, face, t, faceViradaPara(t, normal));
  };

  /** Perfil do trefoil radioativo: três pás de `meiaAbertura` em volta de um
   * disco de raio `r0`. O contorno é ESTRELADO em relação ao centro (cada raio
   * o corta uma vez só), então um polígono único fecha sem auto-interseção — e
   * `extrude` dá conta dele. Na face "sul" da placa, o eixo +V (para onde
   * aponta a pá de `-π/2`) é o "para cima" do observador. */
  const perfilTrefoil = (r0: number, r1: number, meiaAbertura = PI / 6, n = 14): Array<[number, number]> => {
    const pontos: Array<[number, number]> = [];
    for (let k = 0; k < 3; k++) {
      const centro = -PI / 2 + (k * 2 * PI) / 3;
      const a0 = centro - meiaAbertura, a1 = centro + meiaAbertura;
      for (let i = 0; i <= n; i++) {                    // arco externo da pá
        const a = a0 + ((a1 - a0) * i) / n;
        pontos.push([r1 * Math.cos(a), r1 * Math.sin(a)]);
      }
      const proximo = centro + (2 * PI) / 3 - meiaAbertura;
      for (let i = 0; i <= n; i++) {                    // volta pelo disco central
        const a = a1 + ((proximo - a1) * i) / n;
        pontos.push([r0 * Math.cos(a), r0 * Math.sin(a)]);
      }
    }
    return pontos;
  };

  // ════════════════════════════════════════════════════════════════════════
  // 1. PÁTIO — a laje. Tudo o que está aqui em cima encosta nela.
  // ════════════════════════════════════════════════════════════════════════
  const patio = cena.criar("box", { largura: DECK_LARG, altura: DECK_ESP, profundidade: DECK_PROF }, {
    nome: "pátio", material: M.concreto, transform: { posicao: [0, -DECK_ESP / 2, 0] },
  });

  // ════════════════════════════════════════════════════════════════════════
  // 2. VASO — anel de sustentação, casco (revolução oca de fundo chato) e
  // flange com 16 prisioneiros.
  // ════════════════════════════════════════════════════════════════════════
  const anelBase = cilindro("anel de sustentação", ANEL_R, ANEL_ALT, M.ferro_velho, 48);
  naFace(patio, "topo", anelBase, [0, 0, 0]);

  // O casco é UMA revolução: parede externa até o topo, borda, parede interna
  // e fundo — o perfil fecha no eixo nos dois extremos (chato embaixo).
  const casco = cena.criar("lathe", {
    recentrar: false,
    segmentos: 64,
    perfil: ([
      [0, 0], [R_CASCO, 0], [R_CASCO, H_CASCO], [R_BOCA, H_CASCO], [R_BOCA, ESP_PAREDE], [0, ESP_PAREDE],
    ] as Array<[number, number]>),
  }, { nome: "casco do vaso", material: M.aço });
  naFace(anelBase, "topo", casco, [0, 0, 0]);

  const flange = cilindro("flange do vaso", FLANGE_R, FLANGE_ALT, M.aço, 64);
  naFace(casco, "topo", flange, [0, 0, 0]);
  // furo da boca + 16 furos de prisioneiro, passantes: é o que faz do flange um
  // ANEL, e é por eles que o cabeçote se aparafusa
  flange.furar({ face: "topo", forma: { tipo: "circulo", raio: R_CASCO, segmentos: 64 }, u: 0, v: 0 });
  for (let k = 0; k < N_PRISION; k++) {
    const [u, v] = anel(PRISION_RAIO, k, N_PRISION);
    flange.furar({ face: "topo", forma: { tipo: "circulo", raio: FURO_PRISION, segmentos: 12 }, u, v });
  }

  // 16 prisioneiros, cada um com a porca sobre o próprio topo: a porca é filha
  // do prisioneiro (o `colocar` adota), então ela atravessar o furo do flange
  // nunca vira aviso — e um anel só (`circular`) posiciona os dois.
  const prisioneiros: NoRef[] = [];
  const porcas: NoRef[] = [];
  for (let k = 0; k < N_PRISION; k++) {
    const haste = cilindro("prisioneiro", PRISION_HASTE, 0.11, M.aço_escuro, 16);
    naFace(flange, "topo", haste, [0, 0, 0]);
    const porca = cena.criar("cylinder", { raioTopo: 0.026, raioBase: 0.026, altura: 0.028, segmentos: 6 }, {
      nome: "porca", material: M.aço_escuro,
    });
    naFace(haste, "topo", porca, [0, 0, 0]);
    prisioneiros.push(haste);
    porcas.push(porca);
  }
  circular(prisioneiros, PRISION_RAIO, { centro: [0, FLANGE_Y + FLANGE_ALT, 0] });
  circular(porcas, PRISION_RAIO, { centro: [0, FLANGE_Y + FLANGE_ALT, 0] });

  // ── bocais: nascem na parede CURVA, por `lateral()` ──────────────────────
  for (const [nome, angulo, altura, raio, face] of [
    ["entrada", 0, 1.50, 0.09, "sul"],
    ["saída", PI, 1.90, 0.075, "norte"],
  ] as Array<[string, number, number, number, NomeFace]>) {
    const tubo = cilindro(`bocal de ${nome}`, raio, BOCAL_ALT, M.aço, 32);
    casco.lateral().colocar(tubo, { angulo, altura });
    acoplarContato(casco, face, tubo);

    const fl = cilindro(`flange do bocal de ${nome}`, FLANGE_BOCAL_R, FLANGE_BOCAL_ALT, M.aço, 32);
    naFace(tubo, "topo", fl, pontoDaFace(tubo, "topo", 0, 0), { orientar: true });
    const tampa = cilindro(`tampa cega do bocal de ${nome}`, FLANGE_BOCAL_R, 0.025, M.ferro_velho, 32);
    naFace(fl, "topo", tampa, pontoDaFace(fl, "topo", 0, 0), { orientar: true });
    for (let k = 0; k < 4; k++) {
      // os parafusos passam pelos furos do flange E pelos da tampa: mesma
      // coordenada de face nos dois, e o contato declarado em cada um
      const [u, v] = anel(0.115, k, 4, PI / 4);
      fl.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.011, segmentos: 10 }, u, v });
      tampa.furar({ face: "topo", forma: { tipo: "circulo", raio: 0.011, segmentos: 10 }, u, v });
      const parafuso = cilindro("parafuso do flange", 0.009, 0.06, M.aço_escuro, 10);
      naFaceUV(fl, "topo", parafuso, u, v, { orientar: true, acoplar: false });
      acoplarFaces(fl, "topo", parafuso, "base");
      parafuso.permitirContato(tampa);
    }
  }

  // ── manômetro na lateral oeste + rótulo na parede curva ──────────────────
  const manometro = cilindro("manômetro", 0.06, 0.07, M.aço_escuro, 24);
  casco.lateral().colocar(manometro, { angulo: -PI / 2, altura: 1.95 });
  acoplarContato(casco, "oeste", manometro);
  manometro.colarAdesivo({ src: "texturas/painel_relogio.png", face: "topo", largura: 0.10, altura: 0.10 });
  casco.colarAdesivo({ src: "texturas/rotulo.png", face: "lateral", u: -PI / 2, v: 1.30, largura: 0.30, altura: 0.20 });

  // ── dreno com registro de gaveta: bocal, corpo, veio e volante ───────────
  const drenoTubo = cilindro("dreno", DRENO_R, DRENO_ALT, M.ferro_velho, 24);
  casco.lateral().colocar(drenoTubo, { angulo: 0, altura: 0.42 });
  acoplarContato(casco, "sul", drenoTubo);
  const corpoRegistro = caixa("corpo do registro", 0.11, 0.11, 0.08, M.ferro_velho);
  naFace(drenoTubo, "topo", corpoRegistro, pontoDaFace(drenoTubo, "topo", 0, 0));

  // o volante gira numa JUNTA de eixo y: é `angulo` que interpola uma volta
  // inteira (uma `rotacao` de 0 a 2π sairia e voltaria ao mesmo lugar)
  const veio = cena.criar("junta", { eixo: "y", angulo: 0 }, { nome: "veio do registro" });
  const aroVolante = veio.criar("torus", { raio: 0.065, raioTubo: 0.012, segmentos: 24, segmentosTubo: 10 }, {
    nome: "volante do registro", material: M.ferro_velho,
  });
  // O cubo e os raios são FILHOS do aro, e os raios são filhos DO CUBO: tudo
  // que está dentro do aro é parentesco (o aro é avô dos raios), então nenhum
  // par desses é checado. E cada raio vai do cubo à face de dentro do aro —
  // quatro peças radiais, sem nenhuma cruzando o centro (dois eixos cruzados
  // na mesma origem seriam, para o linter, dois centros coincidentes).
  const raioCubo = 0.022, raioInternoAro = 0.065 - 0.012;
  const cubo = aroVolante.criar("cylinder", { raioTopo: raioCubo, raioBase: raioCubo, altura: 0.024, segmentos: 16 }, {
    nome: "cubo do volante", material: M.aço_escuro,
  });
  const meioRaio = (raioCubo + raioInternoAro) / 2;
  for (let k = 0; k < 4; k++) {
    const t = (k * PI) / 2;
    // girar em y leva o +x local para (cos, 0, -sin): a posição vai girada
    cubo.criar("box", { largura: raioInternoAro - raioCubo, altura: 0.012, profundidade: 0.02 }, {
      nome: "raio do volante", material: M.ferro_velho,
      transform: { posicao: [meioRaio * Math.cos(t), 0, -meioRaio * Math.sin(t)], rotacao: [0, t, 0] },
    });
  }
  naFace(corpoRegistro, "topo", veio, pontoDaFace(corpoRegistro, "topo", 0, 0));

  // A saída para baixo, o pingo pendurado no bico e a mancha molhada no pátio.
  //
  // PENDURADO, e não caindo — e isso é uma escolha, medida: uma gota em queda
  // dá `flutuando` em TODO instante do trajeto (foram 30 avisos, um por
  // amostra, com ela no ar), e presa por acoplamento dá `acoplamento-violado`
  // assim que sai da face. O linter trata "peça no ar" como erro de montagem,
  // e não há como animar uma queda sem cair nisso. O pingo então PENDE do bico
  // — que é como uma gota se forma — e o que anima nele é a opacidade, que não
  // move face nenhuma; quem corre é a mancha, que se espalha no pátio. O resto
  // da história fica nos respingos já pousados na poça: são as gotas que
  // caíram antes.
  const saida = cilindro("saída do registro", 0.035, 0.16, M.ferro_velho, 20);
  naFace(corpoRegistro, "base", saida, pontoDaFace(corpoRegistro, "base", 0, 0));
  const pingo = cena.criar("sphere", { raio: GOTA_R, segmentos: 16 }, { nome: "pingo", material: M.gota });
  naFace(saida, "base", pingo, pontoDaFace(saida, "base", 0, 0));

  const mancha = caixa("mancha molhada", 0.44, MANCHA_ALT, 0.20, M.agua);
  naFace(patio, "topo", mancha, [0, 0, 0.98]);
  for (const [u, v, raio] of [[-0.10, -0.03, 0.011], [0.06, 0.02, 0.008], [0.13, -0.04, 0.006]] as Array<[number, number, number]>) {
    // gotas pousadas NA mancha: quem sustenta é ela (apoio, não acoplamento),
    // e ficam na pátina certa via `gap`
    naFace(patio, "topo", cena.criar("sphere", { raio, segmentos: 14 }, { nome: "respingo", material: M.gota }),
      pontoDaFace(mancha, "topo", u, v), { gap: MANCHA_ALT, acoplar: false });
  }

  // ════════════════════════════════════════════════════════════════════════
  // 3. NÚCLEO — a placa-tampão apoia no flange do vaso; o resto pende dela.
  // ════════════════════════════════════════════════════════════════════════
  const placa = cilindro("placa do núcleo", PLACA_R, PLACA_ALT, M.aço, 64);
  naFace(flange, "topo", placa, [0, 0, 0]);
  // a placa é a MESMA malha que posiciona o que pende dela: 9 janelas
  // quadradas (posições dos elementos) e 4 furos dos tubos-guia
  const posicoes: Array<[number, number]> = [];
  for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) posicoes.push([i * PASSO_GRELHA, j * PASSO_GRELHA]);
  const ocupadas = new Set(["0,0", "-1,0", "1,0", "0,-1", "0,1"]);   // centro + 4 meios; os cantos vazios
  for (const [x, z] of posicoes) {
    placa.furar({
      face: "topo", forma: { tipo: "retangulo", largura: 2 * MEIA_JANELA, altura: 2 * MEIA_JANELA }, u: x, v: z,
    });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    placa.furar({ face: "topo", forma: { tipo: "circulo", raio: FURO_GUIA, segmentos: 20 }, u: sx * DESLOC_GUIA, v: sz * DESLOC_GUIA });
  }
  // os prisioneiros do flange atravessam os furos da placa (e as porcas ficam
  // por cima dela): contato declarado, um a um
  for (const haste of prisioneiros) haste.permitirContato(placa);

  /** Um elemento combustível pendurado na janela `(x, z)`: colmeia com canal
   * quadrado vazado, bico inferior e o feixe de quatro varetas dentro. */
  const elemento = (rotulo: string, x: number, z: number): NoRef => {
    const colmeia = caixa(`elemento combustível ${rotulo}`, ELEM_LADO, ELEM_ALT, ELEM_LADO, M.aço);
    naFace(placa, "base", colmeia, [x, 0, z]);
    colmeia.furar({
      face: "topo", forma: { tipo: "retangulo", largura: 2 * ELEM_CANAL, altura: 2 * ELEM_CANAL }, u: 0, v: 0,
    });
    const bico = caixa("bico do elemento", ELEM_LADO + 0.02, BICO_ALT, ELEM_LADO + 0.02, M.aço_escuro);
    naFace(colmeia, "base", bico, pontoDaFace(colmeia, "base", 0, 0));
    // etiqueta da posição gravada no bico (que é sólido — na colmeia ela
    // cairia justamente sobre o canal vazado)
    gravar(bico, "sul", "etiqueta", rotulo, 0, 0.005, M.tinta);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const vareta = cilindro("vareta combustível", VARETA_R, ELEM_ALT - BICO_ALT, M.vareta, 14);
      naFaceUV(bico, "topo", vareta, sx * 0.022, sz * 0.022);
    }
    return colmeia;
  };

  let indice = 0;
  for (const [x, z] of posicoes) {
    if (!ocupadas.has(`${x / PASSO_GRELHA},${z / PASSO_GRELHA}`)) continue;
    indice++;
    elemento(`E${indice}`, x, z);
  }

  // tubos-guia das barras: vazios, porque as barras estão no rack
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tubo = cilindro("tubo-guia", TUBO_R, 1.10, M.aço_escuro, 24);
    naFaceUV(placa, "base", tubo, sx * DESLOC_GUIA, sz * DESLOC_GUIA);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 4. CABEÇOTE — no chão, sobre o berço. Os furos dos prisioneiros estão
  // VAZIOS: as porcas ficaram lá em cima, no flange do vaso.
  // ════════════════════════════════════════════════════════════════════════
  const vigas: NoRef[] = [];
  for (const sz of [-1, 1]) {
    const viga = caixa("viga do berço", BERCO_LARG, BERCO_ALT, BERCO_PROF, M.ferro_velho);
    naFace(patio, "topo", viga, [CAB_X, 0, CAB_Z + sz * BERCO_Z]);
    vigas.push(viga);
  }

  const cabFlange = cilindro("flange do cabeçote", CABO_R, FLANGE_ALT, M.aço, 64);
  naFace(vigas[0]!, "topo", cabFlange, [CAB_X, 0, CAB_Z]);
  acoplarContato(vigas[1]!, "topo", cabFlange);
  cabFlange.furar({ face: "topo", forma: { tipo: "circulo", raio: R_CASCO, segmentos: 64 }, u: 0, v: 0 });
  for (let k = 0; k < N_PRISION; k++) {
    const [u, v] = anel(PRISION_RAIO, k, N_PRISION);
    cabFlange.furar({ face: "topo", forma: { tipo: "circulo", raio: FURO_PRISION, segmentos: 12 }, u, v });
  }

  // o domo é uma revolução de perfil FECHADO (parede de 3 cm), do flange ao
  // polo: lá fora em cima, volta por dentro e fecha na borda
  const domoPerfil: Array<[number, number]> = [];
  const nDomo = 24;
  for (let i = 0; i <= nDomo; i++) {
    const t = (i / nDomo) * (PI / 2);
    domoPerfil.push([R_CASCO * Math.cos(t), DOMO_ALT * Math.sin(t)]);
  }
  for (let i = nDomo; i >= 0; i--) {
    const t = (i / nDomo) * (PI / 2);
    domoPerfil.push([(R_CASCO - DOMO_ESP) * Math.cos(t), (DOMO_ALT - DOMO_ESP) * Math.sin(t)]);
  }
  domoPerfil.push([R_CASCO, 0]);
  const domo = cena.criar("lathe", { perfil: domoPerfil, recentrar: false, segmentos: 64 }, {
    nome: "domo do cabeçote", material: M.aço,
  });
  naFace(cabFlange, "topo", domo, pontoDaFace(cabFlange, "topo", 0, 0));

  // caixa do acionamento no topo do domo, com 4 motores em volta — nas quatro
  // direções, e não nas diagonais: assim nenhum invade a tampa do meio
  const caixaAcion = caixa("caixa do acionamento", 0.56, 0.18, 0.56, M.aço_escuro);
  naFace(domo, "topo", caixaAcion, pontoDaFace(domo, "topo", 0, 0));
  const tampaCaixa = caixa("tampa da caixa", 0.30, 0.05, 0.30, M.ferro_velho);
  naFace(caixaAcion, "topo", tampaCaixa, pontoDaFace(caixaAcion, "topo", 0, 0));
  const acionamentos: NoRef[] = [];
  for (let k = 0; k < 4; k++) {
    const [u, v] = anel(0.21, k, 4, 0);
    const motor = cena.criar("cylinder", { raioTopo: 0.045, raioBase: 0.05, altura: 0.10, segmentos: 20 }, {
      nome: "acionamento da barra", material: M.aço_escuro,
    });
    naFaceUV(caixaAcion, "topo", motor, u, v);
    acionamentos.push(motor);
  }

  // duas alças de içamento no flange, encostadas no ombro do domo: o furo é
  // `furar`, e é por ele que passa o cabo na hora de levantar o cabeçote
  for (const sx of [-1, 1]) {
    const alca = caixa("alça de içamento", 0.05, 0.30, 0.24, M.aço_escuro);
    naFaceUV(cabFlange, "topo", alca, sx * 0.76, 0);
    alca.furar({ face: "leste", forma: { tipo: "circulo", raio: 0.042, segmentos: 20 }, u: 0, v: 0.08 });
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5. RACK DAS BARRAS DE CONTROLE — base, 4 postes e o tampo furado que
  // mantém as barras alinhadas fora do núcleo.
  // ════════════════════════════════════════════════════════════════════════
  const baseRack = caixa("base do rack", RACK_LARG, BASE_RACK_ALT, RACK_PROF, M.ferro_velho);
  naFace(patio, "topo", baseRack, [RACK_X, 0, RACK_Z]);
  const postes: NoRef[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const poste = caixa("poste do rack", POSTE_LADO, POSTE_ALT, POSTE_LADO, M.aço_escuro);
    naFace(baseRack, "topo", poste, [RACK_X + sx * 0.40, 0, RACK_Z + sz * 0.20]);
    postes.push(poste);
  }
  const tampo = caixa("tampo do rack", RACK_LARG, TAMPO_ALT, RACK_PROF, M.aço);
  naFace(postes[0]!, "topo", tampo, [RACK_X, 0, RACK_Z]);
  for (const p of postes.slice(1)) acoplarContato(p, "topo", tampo);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    tampo.furar({ face: "topo", forma: { tipo: "circulo", raio: BARRA_R + 0.003, segmentos: 20 }, u: sx * 0.15, v: sz * 0.15 });
  }
  const barras: NoRef[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const barra = cilindro("barra de controle", BARRA_R, BARRA_ALT, M.absorvedor, 20);
    naFaceUV(baseRack, "topo", barra, sx * 0.15, sz * 0.15);
    // a barra ATRAVESSA o tampo por um furo de verdade: contato declarado
    barra.permitirContato(tampo);
    const cabeca = cena.criar("cylinder", { raioTopo: CABECA_R, raioBase: CABECA_R, altura: CABECA_ALT, segmentos: 6 }, {
      nome: "cabeça da barra", material: M.aço_escuro,
    });
    naFace(barra, "topo", cabeca, pontoDaFace(barra, "topo", 0, 0));
    barras.push(barra);
  }
  // etiqueta na lateral da base do rack, do tamanho da chapa (para não
  // atravessar o pátio)
  const etiquetaRack = caixa("etiqueta do rack", 0.30, 0.038, 0.004, M.amarelo);
  naFace(baseRack, "sul", etiquetaRack, [RACK_X, BASE_RACK_ALT / 2, RACK_Z + RACK_PROF / 2]);
  gravar(etiquetaRack, "sul", "etq", "CONTROLE", 0, 0.0055, M.tinta);

  // ════════════════════════════════════════════════════════════════════════
  // 6. SINAL DE PERIGO — o trefoil é geometria (extrude de 3 pás), não imagem.
  // ════════════════════════════════════════════════════════════════════════
  const postesSinal: NoRef[] = [];
  for (const sx of [-1, 1]) {
    const poste = cilindro("poste do sinal", 0.03, SIG_H, M.ferro_velho, 20);
    naFace(patio, "topo", poste, [SIG_X + sx * 0.20, 0, SIG_Z]);
    postesSinal.push(poste);
  }
  const placaSinal = caixa("placa de perigo", SIG_LARG, SIG_ALT, SIG_ESP, M.amarelo);
  naFace(postesSinal[0]!, "topo", placaSinal, [SIG_X, 0, SIG_Z]);
  acoplarContato(postesSinal[1]!, "topo", placaSinal);

  const trefoil = cena.criar("extrude", { perfil: perfilTrefoil(0.055, 0.145), altura: 0.004 }, {
    nome: "trefoil", material: M.magenta,
  });
  // `orientar: true`: a extrusão nasce no plano XZ e cresce em +y — na face
  // "sul" o +y dela vira a normal (+z, para fora) e o perfil deita na placa,
  // com o +V do perfil (a pá das 12 h) apontando para cima
  naFaceUV(placaSinal, "sul", trefoil, 0, 0.02, { orientar: true });

  // as duas linhas ficam nas faixas livres acima e abaixo das pás (raio 0,145
  // num painel de ±0,31): é o que evita o texto cair DENTRO do trefoil
  gravar(placaSinal, "sul", "perigo", "PERIGO", 0.235, 0.012, M.tinta);
  gravar(placaSinal, "sul", "radioativo", "RADIOATIVO", -0.235, 0.0068, M.tinta);

  // lamparina de alarme no alto do sinal (o material já nasce aceso; é a cor
  // que a animação derruba e levanta)
  const hasteLamp = cilindro("haste da lamparina", 0.012, 0.07, M.aço_escuro, 12);
  naFaceUV(placaSinal, "topo", hasteLamp, 0, 0);
  const lampada = cena.criar("sphere", { raio: 0.045, segmentos: 20 }, { nome: "lamparina", material: M.lampada });
  naFace(hasteLamp, "topo", lampada, pontoDaFace(hasteLamp, "topo", 0, 0));

  // ════════════════════════════════════════════════════════════════════════
  // 7. PASSARELA — colunas, longarinas, chapa de piso, grade (um `row` de
  // barras) e guarda-corpo. Cada altura sai de um `gap` sobre o pátio ou de um
  // `colocar` sobre a peça de baixo — nenhum y escrito à mão.
  // ════════════════════════════════════════════════════════════════════════
  const ZS_PASSARELA = [TRV_Z0 + 0.04, TRV_Z1 - 0.04];
  const colunas = new Map<number, NoRef[]>();
  for (const z of ZS_PASSARELA) {
    const par: NoRef[] = [];
    for (const sx of [-1, 1]) {
      const coluna = cilindro("coluna da passarela", 0.05, TRV_ALT - TRV_ESP, M.aço_escuro, 20);
      naFace(patio, "topo", coluna, [sx * TRV_X, 0, z]);
      par.push(coluna);
    }
    colunas.set(z, par);
  }
  const longarinas: NoRef[] = [];
  for (const z of ZS_PASSARELA) {
    const longarina = caixa("longarina", 2 * TRV_X + 0.1, TRV_ESP, TRV_ESP, M.ferro_velho);
    naFace(patio, "topo", longarina, [0, 0, z], { gap: TRV_ALT - TRV_ESP, acoplar: false });
    for (const c of colunas.get(z)!) acoplarContato(c, "topo", longarina);
    longarinas.push(longarina);
  }
  // chapa de piso sobre as longarinas: é ela que sustenta as barras da grade,
  // os postes do guarda-corpo e a caminhada toda
  const chapa = caixa("chapa do piso", 2 * TRV_X + 0.1, CHAPA_ALT, CHAPA_LARG, M.aço);
  naFace(patio, "topo", chapa, [0, 0, TRV_ZC], { gap: TRV_ALT, acoplar: false });
  for (const l of longarinas) acoplarContato(l, "topo", chapa);

  // a grade é um `row`: 16 barras distribuídas em 3,2 m — o container resolve
  // o espaçamento, ninguém calcula x de barra à mão
  // a grade começa na face de dentro da longarina (nenhuma barra invade os
  // postes do guarda-corpo, que estão alinhados ao eixo dela)
  const GRADE_Z0 = TRV_Z0 + TRV_ESP, GRADE_Z1 = TRV_Z1 - 0.025, GRADE_ZC = (GRADE_Z0 + GRADE_Z1) / 2;
  const grade = cena.criar("row", { extensao: 2 * TRV_X, gap: 0, justify: "space-between" }, {
    nome: "grade da passarela", transform: { posicao: [0, TRV_ALT + CHAPA_ALT + 0.015, GRADE_ZC] },
  });
  for (let i = 0; i < 16; i++) {
    grade.criar("box", { largura: 0.03, altura: 0.03, profundidade: GRADE_Z1 - GRADE_Z0 }, {
      nome: "barra da grade", material: M.ferro_velho,
    });
  }
  const Z_POSTES = TRV_Z0 + TRV_ESP / 2;         // no eixo da longarina
  const postesGuarda: NoRef[] = [];
  for (const x of [-TRV_X, -TRV_X / 2, 0, TRV_X / 2, TRV_X]) {
    const poste = caixa("poste do guarda-corpo", 0.04, GUARDA_ALT, 0.04, M.aço_escuro);
    naFace(patio, "topo", poste, [x, 0, Z_POSTES], { gap: TRV_ALT + CHAPA_ALT, acoplar: false });
    postesGuarda.push(poste);
  }
  // corrimão assentado NOS topos dos postes; a travessa do meio corre um
  // degrau à frente deles, como numa guarda soldada de verdade
  const corrimao = caixa("corrimão", 2 * TRV_X + 0.12, 0.04, 0.04, M.aço_escuro);
  naFace(patio, "topo", corrimao, [0, 0, Z_POSTES], { gap: TRV_ALT + CHAPA_ALT + GUARDA_ALT, acoplar: false });
  for (const p of postesGuarda) acoplarContato(p, "topo", corrimao);
  const travessaMeio = caixa("travessa do guarda-corpo", 2 * TRV_X + 0.12, 0.04, 0.04, M.aço_escuro);
  naFace(patio, "topo", travessaMeio, [0, 0, TRV_Z0], { gap: TRV_ALT + CHAPA_ALT + 0.52, acoplar: false });
  acoplarFaces(travessaMeio, "sul", postesGuarda[2]!, "norte");

  // escada de marinheiro no fim da passarela, fora da grade: os degraus
  // encostam POR DENTRO dos montantes, sem folga nem sobreposição
  const montantes: NoRef[] = [];
  for (const sz of [-1, 1]) {
    const montante = caixa("montante da escada", 0.05, 1.90, 0.05, M.aço_escuro);
    naFace(patio, "topo", montante, [TRV_X + 0.16, 0, TRV_ZC + sz * 0.26]);
    montantes.push(montante);
  }
  // os degraus encostam POR DENTRO dos montantes: sem folga e sem
  // sobreposição. Quem os sustenta é o montante de leste (acoplado) — o de
  // norte só encosta, e encostar já basta para não haver interpenetração
  const montanteLeste = montantes[1]!;
  const degraus = cena.criar("column", { extensao: 1.50, gap: 0, justify: "space-between" }, {
    nome: "degraus", transform: { posicao: [TRV_X + 0.16, 1.00, TRV_ZC] },
  });
  for (let i = 0; i < 8; i++) {
    const degrau = degraus.criar("box", { largura: 0.05, altura: 0.03, profundidade: 0.47 }, {
      nome: "degrau", material: M.ferro_velho,
    });
    acoplarFaces(degrau, "sul", montanteLeste, "norte");
  }

  // ════════════════════════════════════════════════════════════════════════
  // 8. PÓRTICO E LUMINÁRIA — duas colunas, uma viga sobre o vaso e a luz
  // pendurada, que balança.
  //
  // A luminária NÃO se acopla à viga por contato no topo do cabo: um
  // acoplamento exige as normais opostas, e basta o cabo inclinar para as duas
  // faces deixarem de ser paralelas — o balanço apareceria como acoplamento
  // violado em todo quadro. O que sobrevive ao movimento é uma DOBRADIÇA: com
  // as faces acopladas PERPENDICULARES ao eixo de giro e a origem EM CIMA do
  // eixo, girar não muda nem a direção da normal nem a posição do ponto.
  // Chapa fixa na viga, chapa móvel no cabo, pino no eixo x — e a luz pode
  // balançar à vontade, com o acoplamento valendo em toda pose.
  // ════════════════════════════════════════════════════════════════════════
  const colunasPortico: NoRef[] = [];
  const vigaPortico = caixa("viga do pórtico", 2 * POR_X + 0.3, POR_VIGA_ALT, POR_VIGA_ALT, M.aço_escuro);
  for (const sx of [-1, 1]) {
    const coluna = cilindro("coluna do pórtico", 0.07, POR_COLUNA_H, M.ferro_velho, 24);
    naFace(patio, "topo", coluna, [sx * POR_X, 0, POR_Z]);
    colunasPortico.push(coluna);
  }
  // a viga é assentada na coluna de OESTE levando o próprio CENTRO para x = 0
  // (o `u` da face da coluna anda para leste); a outra coluna só se acopla
  naFaceUV(colunasPortico[0]!, "topo", vigaPortico, POR_X, 0);
  acoplarContato(colunasPortico[1]!, "topo", vigaPortico);

  // chapa FIXA pendurada na viga: a face "leste" dela fica no plano do eixo
  const orelhaFixa = caixa("orelha fixa da luminária", DOBR_ESP, DOBR_ALT, DOBR_ALT, M.aço_escuro);
  naFaceUV(vigaPortico, "base", orelhaFixa, -DOBR_ESP / 2, 0);
  orelhaFixa.furar({ face: "oeste", forma: { tipo: "circulo", raio: 0.0075, segmentos: 16 }, u: 0, v: 0 });

  // o pêndulo é uma JUNTA de eixo x com a origem EM CIMA do pino
  const pendulo = cena.criar("junta", { eixo: "x", angulo: 0 }, {
    nome: "pêndulo da luminária", transform: { posicao: [0, DOBR_Y, POR_Z] },
  });
  // chapa MÓVEL: a face "oeste" dela cai no mesmo ponto que a "leste" da fixa
  // — é esse par (normais opostas, perpendicular ao eixo) que a dobradiça
  // acopla, e é o que o balanço não desfaz
  const orelhaMovel = pendulo.criar("box", { largura: DOBR_ESP, altura: DOBR_MOVEL, profundidade: 0.04 }, {
    nome: "orelha móvel da luminária", material: M.aço_escuro,
    transform: { posicao: [DOBR_ESP / 2, 0, 0] },
  });
  orelhaMovel.furar({ face: "oeste", forma: { tipo: "circulo", raio: 0.0075, segmentos: 16 }, u: 0, v: 0 });
  cena.acoplar({ tipo: "pivo", a: { no: orelhaFixa, face: "leste" }, b: { no: orelhaMovel, face: "oeste" } });
  // o pino atravessa as duas chapas por furos de verdade (declarado, porque o
  // que atravessa é o furo da chapa MÓVEL, que não é parente do pino)
  const pinoDobradica = orelhaFixa.criar("cylinder",
    { raioTopo: 0.0065, raioBase: 0.0065, altura: 0.11, segmentos: 16 },
    { nome: "pino da dobradiça", material: M.aço, transform: { posicao: [DOBR_ESP / 2, 0, 0], rotacao: [0, 0, PI / 2] } });
  pinoDobradica.permitirContato(orelhaMovel);

  const cabo = pendulo.criar("cylinder",
    { raioTopo: LAMP_CABO_R, raioBase: LAMP_CABO_R, altura: LAMP_CABO, segmentos: 12 },
    { nome: "cabo da luminária", material: M.aço_escuro,
      transform: { posicao: [DOBR_ESP / 2, -DOBR_MOVEL / 2 - LAMP_CABO / 2, 0] } });
  acoplarFaces(orelhaMovel, "base", cabo, "topo");

  // cúpula em concha (parede de 5 mm, aberta embaixo): a luz escapa por baixo
  // da aba, e o perfil é uma revolução só
  const yCupula = -DOBR_MOVEL / 2 - LAMP_CABO;
  const cupula = pendulo.criar("lathe", {
    recentrar: false,
    segmentos: 32,
    perfil: ([
      [0.035, yCupula], [0.10, yCupula - 0.03], [LAMP_R, yCupula - LAMP_ALT],
      [LAMP_R - 0.006, yCupula - LAMP_ALT - 0.012], [0.095, yCupula - 0.04], [0.035, yCupula - 0.028],
      [0.035, yCupula],
    ] as Array<[number, number]>),
  }, { nome: "cúpula da luminária", material: M.ferro_velho, transform: { posicao: [DOBR_ESP / 2, 0, 0] } });
  acoplarFaces(cabo, "base", cupula, "topo");

  // a lâmpada fica pendurada DENTRO da cúpula: quem a sustenta é a cúpula
  // (apoio, e o fundo dela está abaixo do fundo da lâmpada), sem acoplamento
  const bulbo = cupula.criar("sphere", { raio: 0.05, segmentos: 24 }, {
    nome: "lâmpada", material: M.luz, transform: { posicao: [0, yCupula - LAMP_ALT / 2 - 0.02, 0] },
  });

  // ════════════════════════════════════════════════════════════════════════
  // 9. ANIMAÇÃO — o vazamento (volante girando + pingo e poça), o balanço da
  // luminária, a luz tremendo e o alarme piscando.
  //
  // O volante gira por `angulo` de junta — uma `rotacao` de 0 a 2π daria a
  // volta e voltaria ao mesmo lugar.
  // ════════════════════════════════════════════════════════════════════════
  // o vazamento vai e VOLTA: a volta do `vaivem` repete o giro do volante ao
  // contrário, a poça recolhe e o ciclo fecha sem o salto que um `sempre`
  // daria (a mancha não teria como voltar ao tamanho de partida)
  cena.animar("vazamento", { duracao: 4, repetir: "vaivem" })
    .faixa(veio, "angulo", [[0, 0], [4, 4 * PI]])
    // o pingo incha e treme na luz, sem sair do lugar: `opacidade` não move
    // face nenhuma, então o contato com o bico continua válido em toda a pose
    .faixa(pingo, "opacidade", [[0, 1], [1.9, 0.55], [2.0, 1], [4, 1]])
    // a mancha se espalha: é FILHA do pátio e cresce em x/z sobre ele — o
    // fundo continua no chão, então não flutua nem atravessa a laje. `vaivem`
    // leva e traz a poça sem o salto que um ciclo reto daria no fim da volta
    .faixa(mancha, "escala", [[0, [1, 1, 1]], [4, [1.16, 1, 1.12]]], { interpolacao: "suave" });

  cena.animar("luz tremendo", { duracao: 5, repetir: "sempre" })
    .faixa(pendulo, "angulo", [[0, -0.05], [2.0, 0.05], [4.0, -0.04], [5, -0.05]])
    .faixa(bulbo, "cor", [
      [0, "#ffe3ae"], [0.4, "#c9a35c"], [0.7, "#ffe3ae"], [1.1, "#8f7440"], [1.3, "#ffe3ae"],
      [2.5, "#ffe3ae"], [2.7, "#b08f4e"], [3.0, "#ffe3ae"], [5, "#ffe3ae"],
    ], { interpolacao: "degrau" });

  cena.animar("alarme", { duracao: 1.6, repetir: "sempre" })
    .faixa(lampada, "cor", [[0, "#ff2a12"], [0.4, "#3d0a05"], [0.8, "#ff2a12"], [1.2, "#3d0a05"], [1.6, "#ff2a12"]], {
      interpolacao: "degrau",
    });

  void barras;
  void acionamentos;
  return cena;
}
