import { Cena } from "@snaple/core";

/**
 * A ÚLTIMA PARADA — a caixa do alarme, INTACTA (Q10 do tablô).
 *
 * Caixa de metal cinza presa na parede atrás do balcão, à altura dos
 * olhos. Cadeado enferrujado; na borda da tampa, o lacre com o desenho
 * ainda reconhecível. A poeira não foi mexida: o lacre está inteiro.
 * Esta é a prova física de que o alarme não foi arrombado — o impossível
 * que alguém pode segurar na mão.
 *
 * Metros; +Y para cima; frente da caixa em +Z; Euler XYZ em radianos.
 * Apenas grupo, extrude e lathe. Sem CSG, texturas, texto nativo, luzes
 * ou câmeras — o viewer fornece a luz.
 *
 * Não executado/verificado: a validação fica com o runtime do projeto.
 * Contatos declarados com planos LOCAIS coincidentes; `registrarAcoplamento`
 * adapta-os a cena.acoplar() da sua versão.
 *
 * Origem da cena: centro da caixa. Herói de parede: flutua sem parede
 * (abas de fixação traseiras inclusas).
 */

type V2 = [number, number];
type V3 = [number, number, number];
type No = ReturnType<Cena["criar"]>;
type Pai = Cena | No;
type Material = { cor: string; metalico?: number; rugosidade?: number; opacidade?: number };
type PlanoLocal = { no: No; ponto: V3; normal: V3 };
export type AcoplamentoDeclarado = { nome: string; tipo: "contato"; a: PlanoLocal; b: PlanoLocal };

export interface CoresAlarme {
  /** Caixa de metal cinza. */
  caixa: string;
  /** Tampa frontal. */
  tampa: string;
  /** Ferro bruto (fecho, dobradiças, parafusos, abas). */
  ferro: string;
  /** Corpo do cadeado (enferrujado). */
  cadeado: string;
  /** Lacre de chumbo na borda da tampa. */
  lacre: string;
  /** Marca gravada no lacre (relevo). */
  lacreMarca: string;
  /** Furo da chave (marcador geométrico). */
  furoChave: string;
}

export const CORES_ALARME: Readonly<CoresAlarme> = Object.freeze({
  caixa: "#787C80",
  tampa: "#686C70",
  ferro: "#53575B",
  cadeado: "#7C4A2E",
  lacre: "#8E9396",
  lacreMarca: "#6E7376",
  furoChave: "#26282A",
});

export interface OpcoesAlarme {
  /** Escala global (1 = caixa de 300 × 240 mm). */
  escala?: number;
  /** Marca gravada no lacre (padrão: liga). */
  comMarcaLacre?: boolean;
  /** Orçamento de detalhe: "leve" simplifica parafusos. */
  detalhe?: "alto" | "leve";
  /** Sobrescreve cores individuais. */
  cores?: Partial<CoresAlarme>;
  registrarAcoplamento?: (cena: Cena, declaracao: AcoplamentoDeclarado) => void;
}

function grupo(pai: Pai, nome: string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): No {
  return pai.criar("grupo", {}, {
    nome, transform: { posicao: [...pos], rotacao: [...rot] },
  });
}

function extrudado(
  pai: Pai, nome: string, perfil: V2[], h: number, pos: V3, mat: Material,
  rot: V3 = [0, 0, 0],
): No {
  return pai.criar("extrude", { perfil, altura: h }, {
    nome, transform: { posicao: [...pos], rotacao: [...rot] }, material: { ...mat },
  });
}

function lathe(
  pai: Pai, nome: string, perfil: V2[], segmentos: number,
  pos: V3, mat: Material, rot: V3 = [0, 0, 0],
): No {
  return pai.criar("lathe", { perfil, segmentos }, {
    nome, transform: { posicao: [...pos], rotacao: [...rot] }, material: { ...mat },
  });
}

function bloco(
  pai: Pai, nome: string, w: number, h: number, d: number,
  pos: V3, mat: Material, raio = 0, rot: V3 = [0, 0, 0],
): No {
  const r = Math.min(raio, Math.min(w, d) / 2);
  const perfil: V2[] =
    r > 0
      ? [
          [-w / 2 + r, -d / 2], [w / 2 - r, -d / 2], [w / 2, -d / 2 + r],
          [w / 2, d / 2 - r], [w / 2 - r, d / 2], [-w / 2 + r, d / 2],
          [-w / 2, d / 2 - r], [-w / 2, -d / 2 + r],
        ]
      : [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  return extrudado(pai, nome, perfil, h, pos, mat, rot);
}

export function montarCena(): Cena {
  return montarCenaComRefs().cena;
}

export function montarCenaComRefs(opcoes: OpcoesAlarme = {}) {
  const cena = new Cena();
  const e = Math.max(0.2, Math.min(opcoes.escala ?? 1, 4));
  const u = 0.001 * e; // 1 mm à escala 1
  const comMarca = opcoes.comMarcaLacre !== false;
  const leve = opcoes.detalhe === "leve";
  const cores: CoresAlarme = { ...CORES_ALARME, ...opcoes.cores };

  const acoplamentos: AcoplamentoDeclarado[] = [];
  const flutuacoesIntencionais: Array<{ no: No; motivo: string }> = [];

  const plano = (no: No, ponto: V3, normal: V3): PlanoLocal => ({ no, ponto, normal });
  function contato(nome: string, a: PlanoLocal, b: PlanoLocal) {
    acoplamentos.push({ nome, tipo: "contato", a, b });
  }

  const mat = (cor: string, metalico = 0.55, rugosidade = 0.5): Material =>
    ({ cor, metalico, rugosidade });

  // -------------------------------------------------------------------------
  // Âncoras em mm·u, frente em +z:
  //   caixa:  z -50..+50
  //   tampa:  z +50..+74  (face frontal em 74)
  //   fecho:  z +74..+86
  //   cadeado: z +86..+108 (argola sobe até y +64)
  // -------------------------------------------------------------------------
  const raiz = grupo(cena, "CAIXA_ALARME");

  const caixa = bloco(raiz, "alarme_caixa", 300 * u, 240 * u, 100 * u,
    [0, 0, 0], mat(cores.caixa), 8 * u);

  // Tampa: embutida 0 mm (assenta na face frontal da caixa).
  const tampa = bloco(raiz, "alarme_tampa", 270 * u, 210 * u, 24 * u,
    [0, 0, 62 * u], mat(cores.tampa), 6 * u);
  contato("alarme_tampa_caixa",
    plano(tampa, [0, 0, -12 * u], [0, 0, -1]),
    plano(caixa, [0, 0, 50 * u], [0, 0, 1]));

  // Fecho: a travessa onde o cadeado pendura.
  const fecho = bloco(raiz, "alarme_fecho", 50 * u, 50 * u, 12 * u,
    [0, 0, 80 * u], mat(cores.ferro, 0.6, 0.45), 3 * u);
  contato("alarme_fecho_tampa",
    plano(fecho, [0, 0, -6 * u], [0, 0, -1]),
    plano(tampa, [0, 0, 12 * u], [0, 0, 1]));

  // Cadeado enferrujado: corpo arredondado + argola (anel torneado).
  // A base da argola embute ~12 mm no corpo — interpenetração intencional
  // (a argola nasce do corpo do cadeado, como no hardware real).
  const cadeado = grupo(raiz, "alarme_cadeado");
  const corpoCadeado = bloco(cadeado, "alarme_cadeado_corpo", 55 * u, 60 * u, 22 * u,
    [0, 0, 97 * u], mat(cores.cadeado, 0.4, 0.75), 12 * u);
  contato("alarme_cadeado_fecho",
    plano(corpoCadeado, [0, 0, -11 * u], [0, 0, -1]),
    plano(fecho, [0, 0, 6 * u], [0, 0, 1]));

  const argola = lathe(cadeado, "alarme_cadeado_argola", [
    [14 * u, -5.5 * u], [23 * u, -5.5 * u], [23 * u, 5.5 * u],
    [14 * u, 5.5 * u], [14 * u, -5.5 * u],
  ], 64, [0, 41 * u, 97 * u], mat(cores.cadeado, 0.4, 0.7), [Math.PI / 2, 0, 0]);
  // (rot [PI/2,0,0]: eixo do anel ao longo de z; o anel fica no plano x-y,
  //  "pendurado" verticalmente)

  // Furo da chave: marcador geométrico (caixinhas escuras, não é corte).
  bloco(cadeado, "alarme_cadeado_furo", 7 * u, 11 * u, 2 * u,
    [0, -4 * u, 109 * u], mat(cores.furoChave, 0.3, 0.6));
  bloco(cadeado, "alarme_cadeado_furo_ponta", 3.5 * u, 5 * u, 2 * u,
    [0, -11 * u, 109 * u], mat(cores.furoChave, 0.3, 0.6));

  // Lacre: disco de chumbo na borda da tampa (à direita), encostado na
  // face frontal da caixa, cruzando a linha da tampa — o lacre está inteiro.
  const lacre = lathe(raiz, "alarme_lacre", [
    [0, -2.5 * u], [18 * u, -2.5 * u], [18 * u, 2.5 * u], [0, 2.5 * u], [0, -2.5 * u],
  ], 64, [75 * u, 115 * u, 52.5 * u], mat(cores.lacre, 0.35, 0.6), [Math.PI / 2, 0, 0]);
  contato("alarme_lacre_caixa",
    plano(lacre, [0, -2.5 * u, 0], [0, -1, 0]),
    plano(caixa, [75 * u, 115 * u, 50 * u], [0, 0, 1]));

  // Marca no lacre: um "V" de chumbo batido — o desenho ainda reconhecível
  // (relevo embutido na face do lacre, interpenetração de 0,35 mm).
  if (comMarca) {
    bloco(lacre, "alarme_lacre_marca_1", 12 * u, 3 * u, 1.5 * u,
      [-3 * u, -3 * u, 2.7 * u], mat(cores.lacreMarca, 0.35, 0.55), 0, [0, 0, 0.6]);
    bloco(lacre, "alarme_lacre_marca_2", 12 * u, 3 * u, 1.5 * u,
      [3 * u, 3 * u, 2.7 * u], mat(cores.lacreMarca, 0.35, 0.55), 0, [0, 0, -0.6]);
  }

  // Parafusos de cantos: assentados a flush na face frontal.
  const parafusos: No[] = [];
  const pontosParafuso: Array<[number, number]> =
    leve ? [[-130, 100], [130, -100]] : [[-130, 100], [130, 100], [130, -100], [-130, -100]];
  for (const [px, py] of pontosParafuso) {
    const p = lathe(raiz, `alarme_parafuso_${px > 0 ? "d" : "e"}_${py > 0 ? "c" : "b"}`, [
      [0, -3 * u], [6 * u, -3 * u], [6 * u, 3 * u], [0, 3 * u], [0, -3 * u],
    ], 32, [px * u, py * u, 53 * u], mat(cores.ferro, 0.6, 0.45));
    parafusos.push(p);
    contato(`alarme_parafuso_${px > 0 ? "d" : "e"}_${py > 0 ? "c" : "b"}`,
      plano(p, [0, -3 * u, 0], [0, -1, 0]),
      plano(caixa, [px * u, py * u, 50 * u], [0, 0, 1]));
  }

  // Dobradiças: dois barris na lateral esquerda, cruzando a linha da tampa
  // (embutimento intencional de ~3 mm na aresta da tampa, documentado).
  for (const s of [-1, 1]) {
    bloco(raiz, `alarme_dobradiça_${s < 0 ? "inf" : "sup"}`, 18 * u, 26 * u, 30 * u,
      [-147 * u, s * 70 * u, 62 * u], mat(cores.ferro, 0.6, 0.5), 4 * u);
  }

  // Abas de fixação na parede (atrás): faces frontais a flush na traseira.
  const abas: No[] = [];
  for (const s of [-1, 1]) {
    const aba = bloco(raiz, `alarme_aba_${s < 0 ? "esq" : "dir"}`, 24 * u, 70 * u, 14 * u,
      [s * 90 * u, 0, -57 * u], mat(cores.ferro, 0.6, 0.5));
    abas.push(aba);
    contato(`alarme_aba_${s < 0 ? "esq" : "dir"}`,
      plano(aba, [0, 0, 7 * u], [0, 0, 1]),
      plano(caixa, [s * 90 * u, 0, -50 * u], [0, 0, -1]));
  }

  flutuacoesIntencionais.push({
    no: raiz,
    motivo: "Caixa presa à parede na história; aqui é herói flutuante (sem parede na cena). As abas traseiras indicam o plano de fixação.",
  });
  flutuacoesIntencionais.push({
    no: argola,
    motivo: "Base da argola embutida ~12 mm no corpo do cadeado (argola nascida do corpo, como hardware real).",
  });

  // -------------------------------------------------------------------------
  // Registro opcional dos acoplamentos.
  // -------------------------------------------------------------------------
  if (opcoes.registrarAcoplamento) {
    for (const d of acoplamentos) opcoes.registrarAcoplamento(cena, d);
  }

  return {
    cena,
    raiz,
    caixa,
    tampa,
    fecho,
    cadeado,
    argola,
    lacre,
    parafusos,
    abas,
    acoplamentos,
    flutuacoesIntencionais,
    ficha: {
      unidade: "m" as const,
      frente: "+z" as const,
      caixa: `${0.3 * e} × ${0.24 * e} × ${0.108 * e}`,
      origem: "centro da caixa; herói de parede (sem parede na cena)",
      lacre: "inteiro — o alarme não foi arrombado",
    },
  };
}

/*
 * FLUTUAÇÕES / INTERPENETRAÇÕES INTENIONAIS (retornadas por referência):
 * - alarme_cadeado_argola: base da argola embutida ~12 mm no corpo
 *   (hardware real: a argola nasce do corpo do cadeado).
 * - alarme_dobradiça_*: barris cruzando a aresta da tampa com ~3 mm de
 *   embutimento (dobradiça dobrada na chapa).
 * - alarme_lacre_marca_*: relevo de 0,35 mm batido na face do lacre.
 * - alarme_cadeado_furo*: marcadores geométricos do furo da chave
 *   (caixas escuras de 2 mm de ressalto — não é corte/CSG).
 * - A cena inteira flutua: a caixa vive presa à parede da taverna; sem
 *   parede na cena, as abas traseiras marcam o plano de fixação.
 *
 * Sem CSG, texturas, texto nativo, luzes ou câmeras. A "poeira igual à de
 * todo o resto" é narrativa — não há camada de sujo (sem texturas).
 */

export default montarCena;
