import { Cena } from "@snaple/core";

/**
 * A ÚLTIMA PARADA — A CENA: a taverna da estação (diorama).
 *
 * "Vocês entram pela porta da plataforma e o silêncio da casa bate
 * primeiro." Esta é a sala inteira, vista de cima do lado sul (frente
 * aberta, estilo vitrine):
 *
 *   - balcão-trilho sobre dormentes (P7–Q14), com a faixa estreita por
 *     trás onde o atendente se mexe;
 *   - relógio de estação parado às 4h17, no alto da parede norte (F5–G5);
 *   - quadro de horários com todos os destinos riscados — menos a linha
 *     rasgada — na parede oeste (B9–B12);
 *   - a caixa do alarme INTACTA, atrás do balcão, à altura dos olhos (Q10);
 *   - 4 cornetas enferrujadas no teto, boca pra sala, fiação pendurada;
 *   - lampiões de querosene balançando nas vigas;
 *   - cozinha à lenha + traseira atrás da divisória (porta interna R7–R8);
 *   - mesas com os viajantes: o homem contando moedas, a mulher com a
 *     mala; e Seu Anselmo, de casaco pesado, na porta da plataforma;
 *   - a porta de serviço ao sul, ladrilhada com tijolo grosseiro.
 *
 * Metros; +Y para cima; Norte (plataforma) em +Z; Euler XYZ em radianos.
 * Apenas grupo, extrude e lathe. Sem CSG, texturas, texto nativo, luzes
 * ou câmeras — o viewer fornece a luz (a "chama" é geometria colorida,
 * não emissão).
 *
 * Não executado/verificado: a validação fica com o runtime do projeto.
 * Contatos declarados com planos LOCAIS coincidentes; `registrarAcoplamento`
 * adapta-os a cena.acoplar() da sua versão.
 *
 * Origem da cena: centro do piso (y = 0). Sala 11 × 8,5 m, 3,4 m de
 * pé-direito; a face sul fica ABERTA de propósito (diorama de vitrine).
 */

type V2 = [number, number];
type V3 = [number, number, number];
type No = ReturnType<Cena["criar"]>;
type Pai = Cena | No;
type Material = { cor: string; metalico?: number; rugosidade?: number; opacidade?: number };
type PlanoLocal = { no: No; ponto: V3; normal: V3 };
export type AcoplamentoDeclarado = { nome: string; tipo: "contato"; a: PlanoLocal; b: PlanoLocal };

export interface CoresTaverna {
  piso: string; mancha: string; parede: string; viga: string;
  portaPlataforma: string; tijolo: string; divisoria: string;
  lampiaoMetal: string; lampiaoVidro: string; chama: string; chamaInterna: string;
  corneta: string; fio: string; teia: string;
  mesa: string; banco: string; banqueta: string;
  pessoa: string; atendente: string; casaco: string; couro: string;
  fogao: string; lata: string; balde: string; madeirao: string; moeda: string;
  trilho: string; dormente: string; chapa: string; copo: string; garrafa: string;
  caixaAlarme: string; tampaAlarme: string; ferro: string; cadeado: string; lacre: string;
  relogioCaixa: string; relogioDial: string; relogioMarcas: string; relogioPonteiros: string;
  relogioVidro: string; relogioTrinca: string;
  quadroTampa: string; quadroMoldura: string; giz: string;
}

export const CORES_TAVERNA: Readonly<CoresTaverna> = Object.freeze({
  piso: "#453A2D", mancha: "#2A2118", parede: "#3E342A", viga: "#4A3E30",
  portaPlataforma: "#4A3A28", tijolo: "#5A4A3C", divisoria: "#44392C",
  lampiaoMetal: "#4A4238", lampiaoVidro: "#9FB6BA", chama: "#C96A2E", chamaInterna: "#E8B05A",
  corneta: "#5A4638", fio: "#26221E", teia: "#8A8F94",
  mesa: "#4E4133", banco: "#4A3E30", banqueta: "#4A3A28",
  pessoa: "#3A352F", atendente: "#2F3A36", casaco: "#26221E", couro: "#4A3220",
  fogao: "#3A3530", lata: "#6E6A60", balde: "#55504A", madeirao: "#6E5A40", moeda: "#8A6A2E",
  trilho: "#4E4B47", dormente: "#4A3826", chapa: "#3E4142", copo: "#A9C4C6", garrafa: "#3C4A3E",
  caixaAlarme: "#787C80", tampaAlarme: "#686C70", ferro: "#53575B", cadeado: "#7C4A2E", lacre: "#8E9396",
  relogioCaixa: "#2E3A32", relogioDial: "#D6CBAE", relogioMarcas: "#282B24", relogioPonteiros: "#22241E",
  relogioVidro: "#9FB6BA", relogioTrinca: "#54686C",
  quadroTampa: "#5A4530", quadroMoldura: "#443320", giz: "#D8D2C0",
});

export interface OpcoesCena {
  /** Escala global da cena (1 = sala de 11 × 8,5 m). */
  escala?: number;
  /** "leve" corta teias, moedas e latas; reduz segmentos. */
  detalhe?: "alto" | "leve";
  /** Seu Anselmo na porta da plataforma (padrão: liga — a cena já virou). */
  comAnselmo?: boolean;
  /** Os viajantes da noite: o contador de moedas + a mulher de mala. */
  comViajantes?: boolean;
  /** O atendente de dentes ruins, atrás do balcão. */
  comAtendente?: boolean;
  /** Lampiões de querosene nas vigas. */
  comLampioes?: boolean;
  /** Cornetas de alto-falante no teto. */
  comCornetas?: boolean;
  /** Muro baixo sul (frente do diorama) com a porta de serviço ladrilhada. */
  comMuroSul?: boolean;
  cores?: Partial<CoresTaverna>;
  registrarAcoplamento?: (cena: Cena, declaracao: AcoplamentoDeclarado) => void;
}

const PI = Math.PI;

function grupo(pai: Pai, nome: string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): No {
  return pai.criar("grupo", {}, {
    nome, transform: { posicao: [...pos], rotacao: [...rot] },
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

function extrudado(
  pai: Pai, nome: string, perfil: V2[], h: number, pos: V3, mat: Material,
  rot: V3 = [0, 0, 0],
): No {
  return pai.criar("extrude", { perfil, altura: h }, {
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

export function montarCenaComRefs(opcoes: OpcoesCena = {}) {
  const cena = new Cena();
  const e = Math.max(0.2, Math.min(opcoes.escala ?? 1, 4));
  const u = e; // a cena já está em metros; u = fator de escala
  const leve = opcoes.detalhe === "leve";
  const SEG = leve ? 32 : 48;
  const cores: CoresTaverna = { ...CORES_TAVERNA, ...opcoes.cores };

  const acoplamentos: AcoplamentoDeclarado[] = [];
  /** Flutuação declarada direto no linter (`no.permitirFlutuacao`), que vale
   * para a subárvore inteira; o viewer resume como "flutuações intencionais
   * ignoradas". */
  const flutuaIntencional = (no: No, motivo: string): void => {
    no.permitirFlutuacao(motivo);
  };

  const plano = (no: No, ponto: V3, normal: V3): PlanoLocal => ({ no, ponto, normal });
  function contato(nome: string, a: PlanoLocal, b: PlanoLocal) {
    acoplamentos.push({ nome, tipo: "contato", a, b });
  }
  const mat = (cor: string, metalico = 0.05, rugosidade = 0.8): Material =>
    ({ cor, metalico, rugosidade });

  // ========================================================================
  // SALA: piso (topo em y = 0), paredes N/O/L (0,25 m), frente sul aberta.
  // Três vigas correndo no sentido x a 3,16–3,34 m de altura.
  // ========================================================================
  const raiz = grupo(cena, "A_ULTIMA_PARADA");

  const chao = bloco(raiz, "taverna_chao", 11.6 * u, 0.12 * u, 9.0 * u,
    [0, -0.06 * u, 0], mat(cores.piso, 0, 0.92));
  // Manchas de gordura no piso (relevos finos, não texturas).
  bloco(raiz, "taverna_mancha_1", 0.9 * u, 0.004 * u, 0.6 * u,
    [0.7 * u, 0.002 * u, 2.5 * u], mat(cores.mancha, 0, 0.95), 0.1, [0, 0, 0.3]);
  bloco(raiz, "taverna_mancha_2", 0.7 * u, 0.004 * u, 0.8 * u,
    [4.3 * u, 0.002 * u, 2.2 * u], mat(cores.mancha, 0, 0.95), 0.08, [0, 0, -0.4]);
  bloco(raiz, "taverna_mancha_3", 1.2 * u, 0.004 * u, 0.5 * u,
    [-2.0 * u, 0.002 * u, 0.5 * u], mat(cores.mancha, 0, 0.95), 0.12, [0, 0, 0.15]);

  const paredeNorteEsq = bloco(raiz, "taverna_parede_norte_esq", 4.95 * u, 3.4 * u, 0.25 * u,
    [-3.025 * u, 1.7 * u, 4.25 * u], mat(cores.parede, 0, 0.9));
  const paredeNorteDir = bloco(raiz, "taverna_parede_norte_dir", 4.95 * u, 3.4 * u, 0.25 * u,
    [3.025 * u, 1.7 * u, 4.25 * u], mat(cores.parede, 0, 0.9));
  bloco(raiz, "taverna_parede_norte_vedado", 1.1 * u, 1.3 * u, 0.25 * u,
    [0, 2.75 * u, 4.25 * u], mat(cores.parede, 0, 0.9)); // acima da porta
  const paredeOeste = bloco(raiz, "taverna_parede_oeste", 0.25 * u, 3.4 * u, 8.5 * u,
    [-5.5 * u, 1.7 * u, 0], mat(cores.parede, 0, 0.9));
  bloco(raiz, "taverna_parede_leste", 0.25 * u, 3.4 * u, 8.5 * u,
    [5.5 * u, 1.7 * u, 0], mat(cores.parede, 0, 0.9));

  const vigas: No[] = [];
  for (const zv of [-2.8, 0, 2.8]) {
    vigas.push(bloco(raiz, `taverna_viga_${zv < 0 ? "sul" : zv === 0 ? "meio" : "norte"}`,
      11.25 * u, 0.18 * u, 0.14 * u, [0, 3.25 * u, zv * u], mat(cores.viga, 0, 0.88)));
  }

  // Piso: âncora de assentamento (topo em y = 0 → local y = +0,06).
  const topoChao = (x: number, z: number): PlanoLocal =>
    plano(chao, [x * u, 0.06 * u, z * u], [0, 1, 0]);

  // ========================================================================
  // PORTA DA PLATAFORMA (K5–L5, parede norte): batente + porta fechada
  // com vidraça pequena. Atrás dela: trilhos e o escuro dos dois lados.
  // ========================================================================
  bloco(raiz, "taverna_batente_esq", 0.1 * u, 2.1 * u, 0.3 * u,
    [-0.6 * u, 1.05 * u, 4.25 * u], mat(cores.parede, 0, 0.85));
  bloco(raiz, "taverna_batente_dir", 0.1 * u, 2.1 * u, 0.3 * u,
    [0.6 * u, 1.05 * u, 4.25 * u], mat(cores.parede, 0, 0.85));
  bloco(raiz, "taverna_batente_topo", 1.3 * u, 0.1 * u, 0.3 * u,
    [0, 2.15 * u, 4.25 * u], mat(cores.parede, 0, 0.85));
  bloco(raiz, "taverna_porta_plataforma", 1.1 * u, 2.05 * u, 0.06 * u,
    [0, 1.025 * u, 4.25 * u], mat(cores.portaPlataforma, 0, 0.85), 0.01 * u);
  bloco(raiz, "taverna_porta_vidraca", 0.2 * u, 0.28 * u, 0.015 * u,
    [0, 1.55 * u, 4.2875 * u],
    { cor: cores.lampiaoVidro, metalico: 0.05, rugosidade: 0.1, opacidade: 0.35 });
  bloco(raiz, "taverna_porta_puxador", 0.03 * u, 0.03 * u, 0.05 * u,
    [0.4 * u, 1.0 * u, 4.2 * u], mat(cores.ferro, 0.6, 0.45));

  // ========================================================================
  // PORTA DE SERVIÇO AO SUL (G17–H17): "ladrilhada por dentro, arrombada
  // e tampada com tijolo grosseiro. Não é saída." Muro baixo do diorama
  // + empenamento de tijolo no vão.
  // ========================================================================
  if (opcoes.comMuroSul !== false) {
    bloco(raiz, "taverna_muro_sul_esq", 1.95 * u, 0.95 * u, 0.2 * u,
      [-4.525 * u, 0.475 * u, -4.25 * u], mat(cores.parede, 0, 0.9));
    bloco(raiz, "taverna_muro_sul_dir", 7.95 * u, 0.95 * u, 0.2 * u,
      [1.525 * u, 0.475 * u, -4.25 * u], mat(cores.parede, 0, 0.9));
    bloco(raiz, "taverna_servico_batente_esq", 0.09 * u, 2.0 * u, 0.24 * u,
      [-3.54 * u, 1.0 * u, -4.25 * u], mat(cores.madeirao, 0, 0.85));
    bloco(raiz, "taverna_servico_batente_dir", 0.09 * u, 2.0 * u, 0.24 * u,
      [-2.46 * u, 1.0 * u, -4.25 * u], mat(cores.madeirao, 0, 0.85));
    bloco(raiz, "taverna_servico_vedado", 1.17 * u, 0.09 * u, 0.24 * u,
      [-3.0 * u, 2.04 * u, -4.25 * u], mat(cores.madeirao, 0, 0.85));
    // Tijolo grosseiro: 12 blocos tortos, desalinhados de mão.
    const tijolos: Array<[number, number, number]> = [
      [-3.36, 0.24, 0.05], [-3.0, 0.25, -0.04], [-2.64, 0.24, 0.03],
      [-3.35, 0.72, -0.05], [-3.01, 0.73, 0.06], [-2.65, 0.72, -0.03],
      [-3.37, 1.21, 0.04], [-2.99, 1.2, -0.05], [-2.63, 1.22, 0.05],
      [-3.34, 1.7, -0.03], [-3.0, 1.69, 0.04], [-2.66, 1.71, -0.04],
    ];
    tijolos.forEach(([tx, ty, ang], k) => {
      bloco(raiz, `taverna_tijolo_${k}`, 0.32 * u, 0.42 * u, 0.11 * u,
        [tx * u, ty * u, -4.25 * u], mat(cores.tijolo, 0, 0.95), 0.02 * u, [0, 0, ang]);
    });
  }

  // ========================================================================
  // DIVISÓRIA (x = 2,4): separa o salão da traseira (cozinha + depósito).
  // Porta interna (R7–R8) no vão z 2,2–3,1.
  // ========================================================================
  const divisA = bloco(raiz, "taverna_divisoria_a", 0.15 * u, 3.4 * u, 1.025 * u,
    [2.4 * u, 1.7 * u, 3.6125 * u], mat(cores.divisoria, 0, 0.9));
  const divisB = bloco(raiz, "taverna_divisoria_b", 0.15 * u, 3.4 * u, 1.7 * u,
    [2.4 * u, 1.7 * u, 1.35 * u], mat(cores.divisoria, 0, 0.9));
  const divisC = bloco(raiz, "taverna_divisoria_c", 0.15 * u, 3.4 * u, 4.625 * u,
    [2.4 * u, 1.7 * u, -1.8125 * u], mat(cores.divisoria, 0, 0.9));
  bloco(raiz, "taverna_divisoria_vedado", 0.15 * u, 1.4 * u, 0.9 * u,
    [2.4 * u, 2.7 * u, 2.65 * u], mat(cores.divisoria, 0, 0.9));
  // A divisória apoia no piso.
  contato("taverna_divisoria_a_chao", plano(divisA, [0, -1.7 * u, 0], [0, -1, 0]), topoChao(2.4, 3.6));
  contato("taverna_divisoria_b_chao", plano(divisB, [0, -1.7 * u, 0], [0, -1, 0]), topoChao(2.4, 1.35));
  contato("taverna_divisoria_c_chao", plano(divisC, [0, -1.7 * u, 0], [0, -1, 0]), topoChao(2.4, -1.8));

  // ========================================================================
  // BALCÃO-TRILHO (P7–Q14): o trilho corre no sentido x, em (0.7, 0, 2.0).
  // Dormentes em 2 níveis, desalinhados de mão; chapas improvisadas.
  // Âncoras: dormente inf 0–0.30; sup 0.30–0.62; trilho 0.62–0.795.
  // ========================================================================
  const balcao = grupo(raiz, "taverna_balcao", [0.7 * u, 0, 2.0 * u]);

  const XS_DORM = [-0.975, -0.325, 0.325, 0.975];
  const dormInf: No[] = [], dormSup: No[] = [];
  XS_DORM.forEach((xs, i) => {
    const inf = bloco(balcao, `taverna_dormente_${i}_inf`, 0.5 * u, 0.3 * u, 0.34 * u,
      [xs * u, 0.15 * u, 0], mat(cores.dormente, 0, 0.9), 0.01 * u);
    const sup = bloco(balcao, `taverna_dormente_${i}_sup`, 0.5 * u, 0.32 * u, 0.32 * u,
      [xs * u, 0.46 * u, (i % 2 === 0 ? -0.025 : 0.025) * u], mat(cores.dormente, 0, 0.9), 0.01 * u);
    dormInf.push(inf); dormSup.push(sup);
    contato(`taverna_balcao_dormente_${i}_inf_chao`,
      plano(inf, [0, -0.15 * u, 0], [0, -1, 0]), topoChao(0.7 + xs, 2.0));
    contato(`taverna_balcao_dormente_${i}_sup_inf`,
      plano(sup, [0, -0.16 * u, 0], [0, -1, 0]),
      plano(inf, [0, 0.15 * u, 0], [0, 1, 0]));
  });

  // Perfil do trilho N em (h, z), metros; rot [0, PI/2, 0] → eixo em x.
  // L1: perfil h 0–0.175 recentra em 0.0875 → pos y = 0.62 + 0.0875.
  const trilho = extrudado(balcao, "taverna_trilho", [
    [0, -0.078 * u], [0.014 * u, -0.078 * u], [0.014 * u, -0.017 * u],
    [0.135 * u, -0.017 * u], [0.16 * u, -0.045 * u], [0.175 * u, -0.045 * u],
    [0.175 * u, 0.045 * u], [0.16 * u, 0.045 * u], [0.135 * u, 0.017 * u],
    [0.014 * u, 0.017 * u], [0.014 * u, 0.078 * u], [0, 0.078 * u],
  ], 2.6 * u, [0, 0.7075 * u, 0], mat(cores.trilho, 0.7, 0.5), [0, PI / 2, 0]);
  // Sola (h = 0 → x_l = −0.0875; normal mundo +y = local +x) nos 4 apoios.
  XS_DORM.forEach((xs, i) => {
    contato(`taverna_trilho_dormente_${i}`,
      plano(trilho, [-0.0875 * u, -xs * u, 0], [-1, 0, 0]),
      plano(dormSup[i]!, [0, 0.16 * u, 0], [0, 1, 0]));
  });
  const topoTrilho = (x: number, z: number): PlanoLocal =>
    plano(trilho, [0.0875 * u, -x * u, z * u], [1, 0, 0]);

  const chapa1 = bloco(balcao, "taverna_chapa_1", 0.42 * u, 0.002 * u, 0.26 * u,
    [-0.55 * u, 0.796 * u, 0.02 * u], mat(cores.chapa, 0.6, 0.55), 0.001 * u);
  bloco(balcao, "taverna_chapa_2", 0.5 * u, 0.002 * u, 0.28 * u,
    [0.6 * u, 0.796 * u, -0.01 * u], mat(cores.chapa, 0.6, 0.55), 0.001 * u);

  // Copos de vidro grosso (lathe fechado — piso interno visível, sem furo).
  const copoPerfil: V2[] = [
    [0.02 * u, 0], [0.03 * u, 0], [0.031 * u, 0.002 * u], [0.033 * u, 0.07 * u],
    [0.031 * u, 0.072 * u], [0.027 * u, 0.072 * u], [0.025 * u, 0.008 * u],
    [0.02 * u, 0.008 * u], [0.02 * u, 0],
  ];
  const copoMat: Material = { cor: cores.copo, metalico: 0.05, rugosidade: 0.08, opacidade: 0.3 };
  const copo1 = lathe(balcao, "taverna_copo_1", copoPerfil, SEG,
    [0.02 * u, 0.831 * u, 0.075 * u], copoMat);
  const copo2 = lathe(balcao, "taverna_copo_2", copoPerfil, SEG,
    [-0.55 * u, 0.833 * u, 0.02 * u], copoMat);
  contato("taverna_copo_1_trilho", plano(copo1, [0, -0.036 * u, 0], [0, -1, 0]), topoTrilho(0.02, 0.075));
  contato("taverna_copo_2_chapa", plano(copo2, [0, -0.036 * u, 0], [0, -1, 0]),
    plano(chapa1, [0, 0.001 * u, 0], [0, 1, 0])); // (chapa_1 assenta no trilho — ver rodapé)

  // Garrafa com cortiça.
  const garrafa = lathe(balcao, "taverna_garrafa", [
    [0, 0], [0.026 * u, 0], [0.028 * u, 0.004 * u], [0.028 * u, 0.15 * u],
    [0.024 * u, 0.165 * u], [0.01 * u, 0.185 * u], [0.01 * u, 0.235 * u],
    [0.013 * u, 0.238 * u], [0.013 * u, 0.243 * u], [0, 0.243 * u], [0, 0],
  ], SEG, [0.75 * u, 0.9165 * u, -0.06 * u],
    { cor: cores.garrafa, metalico: 0.05, rugosidade: 0.15, opacidade: 0.35 });
  contato("taverna_garrafa_trilho", plano(garrafa, [0, -0.1215 * u, 0], [0, -1, 0]), topoTrilho(0.75, -0.06));
  lathe(balcao, "taverna_garrafa_cortica", [
    [0, 0], [0.009 * u, 0], [0.009 * u, 0.02 * u], [0, 0.02 * u], [0, 0],
  ], 24, [0.75 * u, 1.048 * u, -0.06 * u], mat(cores.couro, 0, 0.9));

  // Caixa de fósforo úmida com rótulo (ressalto de 1 mm, documentado).
  const fosforo = bloco(balcao, "taverna_fosforo", 0.048 * u, 0.026 * u, 0.062 * u,
    [-0.15 * u, 0.808 * u, -0.08 * u], mat(cores.couro, 0, 0.7), 0.002 * u, [0, 0.5, 0]);
  contato("taverna_fosforo_trilho", plano(fosforo, [0, -0.013 * u, 0], [0, -1, 0]), topoTrilho(-0.15, -0.08));
  bloco(balcao, "taverna_fosforo_rotulo", 0.05 * u, 0.012 * u, 0.063 * u,
    [-0.15 * u, 0.808 * u, -0.08 * u], mat(cores.madeirao, 0, 0.8), 0.001 * u, [0, 0.5, 0]);

  // ========================================================================
  // RELÓGIO PARADO ÀS 4H17 (F5–G5), parede norte. Construído com o mostrador
  // voltado para +y local; o wrapper rot [−PI/2, 0, 0] o vira para −z
  // (sala), com as 12h para cima. Placa de montagem colada à parede.
  // ========================================================================
  const relogio = grupo(raiz, "taverna_relogio", [-2.2 * u, 2.5 * u, 4.077 * u], [-PI / 2, 0, 0]);
  const placaRelogio = bloco(relogio, "taverna_relogio_placa", 0.26 * u, 0.008 * u, 0.26 * u,
    [0, -0.044 * u, 0], mat(cores.ferro, 0.6, 0.5));
  lathe(relogio, "taverna_relogio_caixa", [
    [0, -0.04 * u], [0.158 * u, -0.04 * u], [0.162 * u, -0.02 * u],
    [0.162 * u, 0.03 * u], [0.155 * u, 0.0375 * u], [0, 0.0375 * u],
  ], SEG, [0, -0.00125 * u, 0], mat(cores.relogioCaixa, 0.25, 0.55));
  lathe(relogio, "taverna_relogio_dial", [
    [0, 0], [0.145 * u, 0], [0.145 * u, 0.002 * u], [0, 0.002 * u], [0, 0],
  ], SEG, [0, 0.036 * u, 0], mat(cores.relogioDial, 0, 0.7));
  lathe(relogio, "taverna_relogio_aro", [
    [0.145 * u, -0.00675 * u], [0.163 * u, -0.00675 * u],
    [0.163 * u, 0.00675 * u], [0.145 * u, 0.00675 * u], [0.145 * u, -0.00675 * u],
  ], SEG, [0, 0.04075 * u, 0], mat(cores.ferro, 0.4, 0.45));
  for (let i = 0; i < 12; i++) {
    const a = (i * PI) / 6;
    const q = i % 3 === 0;
    const g = grupo(relogio, `taverna_relogio_indice_${i}`, [0, 0, 0], [0, a, 0]);
    bloco(g, `taverna_relogio_indice_${i}_barra`, (q ? 0.016 : 0.011) * u, 0.0004 * u,
      (q ? 0.005 : 0.0028) * u, [0.124 * u, 0.0382 * u, 0], mat(cores.relogioMarcas, 0.3, 0.5));
  }
  // 4h17: hora = (4 + 17/60)/12 · 2π; minuto = 17/60 · 2π.
  const angHora = ((4 + 17 / 60) / 12) * 2 * PI;
  const angMin = (17 / 60) * 2 * PI;
  const gHoraRel = grupo(relogio, "taverna_relogio_hora_g", [0, 0, 0], [0, angHora, 0]);
  extrudado(gHoraRel, "taverna_relogio_hora", [
    [-0.0062 * u, -0.014 * u], [0.0062 * u, -0.014 * u],
    [0.0034 * u, 0.088 * u], [-0.0034 * u, 0.088 * u],
  ], 0.0016 * u, [0, 0.0391 * u, 0.037 * u], mat(cores.relogioPonteiros, 0.5, 0.4));
  const gMinRel = grupo(relogio, "taverna_relogio_minuto_g", [0, 0, 0], [0, angMin, 0]);
  extrudado(gMinRel, "taverna_relogio_minuto", [
    [-0.005 * u, -0.016 * u], [0.005 * u, -0.016 * u],
    [0.0028 * u, 0.118 * u], [-0.0028 * u, 0.118 * u],
  ], 0.0014 * u, [0, 0.0394 * u, 0.051 * u], mat(cores.relogioPonteiros, 0.5, 0.4));
  lathe(relogio, "taverna_relogio_cubo", [
    [0, -0.003 * u], [0.014 * u, -0.003 * u], [0.014 * u, 0.003 * u],
    [0, 0.003 * u], [0, -0.003 * u],
  ], 32, [0, 0.041 * u, 0], mat(cores.ferro, 0.55, 0.4));
  const vidroRel = lathe(relogio, "taverna_relogio_vidro", [
    [0, 0.0016 * u], [0.14 * u, 0.0006 * u], [0.148 * u, 0],
    [0.148 * u, -0.0016 * u], [0, -0.0016 * u], [0, 0.0016 * u],
  ], SEG, [0, 0.0453 * u, 0],
    { cor: cores.relogioVidro, metalico: 0.05, rugosidade: 0.08, opacidade: 0.25 });
  // Trinca no canto (10h): três linhas embutidas na superfície do vidro.
  bloco(vidroRel, "taverna_relogio_trinca_1", 0.055 * u, 0.0003 * u, 0.0009 * u,
    [-0.088 * u, 0.00065 * u, 0.062 * u], mat(cores.relogioTrinca, 0.05, 0.35), 0, [0, 0, 0.7]);
  bloco(vidroRel, "taverna_relogio_trinca_2", 0.032 * u, 0.0003 * u, 0.0008 * u,
    [-0.102 * u, 0.0006 * u, 0.048 * u], mat(cores.relogioTrinca, 0.05, 0.35), 0, [0, 0, 0.25]);
  bloco(vidroRel, "taverna_relogio_trinca_3", 0.026 * u, 0.0003 * u, 0.0007 * u,
    [-0.074 * u, 0.0006 * u, 0.076 * u], mat(cores.relogioTrinca, 0.05, 0.35), 0, [0, 0, -0.45]);
  // Contato: placa traseira (local y −0.048) colada na face interna norte.
  contato("taverna_relogio_parede",
    plano(placaRelogio, [0, -0.004 * u, 0], [0, -1, 0]),
    plano(paredeNorteEsq, [0.825 * u, 0.8 * u, -0.125 * u], [0, 0, -1]));

  // ========================================================================
  // QUADRO DE HORÁRIOS (B9–B12), parede oeste: seis destinos riscados com
  // o mesmo traço (−0.07 rad, uma sentada só) + a linha RASGADA.
  // ========================================================================
  const quadro = grupo(raiz, "taverna_quadro", [-5.36 * u, 1.75 * u, -0.6 * u], [0, PI / 2, 0]);
  const quadroTampa = bloco(quadro, "taverna_quadro_tampa", 0.7 * u, 0.95 * u, 0.03 * u,
    [0, 0, 0], mat(cores.quadroTampa, 0, 0.85), 0.004 * u);
  const molduras: Array<[string, number, number, number, number]> = [
    ["topo", 0.74 * u, 0.045 * u, 0, 0.475], ["base", 0.74 * u, 0.045 * u, 0, -0.475],
    ["esq", 0.045 * u, 0.905 * u, -0.35, 0], ["dir", 0.045 * u, 0.905 * u, 0.35, 0],
  ];
  for (const [nm, w, h, x, y] of molduras) {
    bloco(quadro, `taverna_quadro_moldura_${nm}`, w, h, 0.034 * u,
      [x * u, y * u, 0.032 * u], mat(cores.quadroMoldura, 0, 0.8), 0.002 * u);
  }
  const GIZ = mat(cores.giz, 0, 0.95);
  const NOME: Array<[number, number]> = [
    [-0.17, 0.06], [-0.111, 0.034], [-0.057, 0.05], [-0.005, 0.03], [0.051, 0.058], [0.11, 0.036],
  ];
  function linhaHorario(pai: Pai, pre: string) {
    bloco(pai, `${pre}_hora_a`, 0.02 * u, 0.009 * u, 0.0012 * u, [-0.29 * u, 0, 0.0156 * u], GIZ);
    if (!leve) bloco(pai, `${pre}_colon`, 0.005 * u, 0.005 * u, 0.0012 * u,
      [-0.272 * u, 0, 0.0156 * u], GIZ);
    bloco(pai, `${pre}_hora_b`, 0.02 * u, 0.009 * u, 0.0012 * u, [-0.258 * u, 0, 0.0156 * u], GIZ);
  }
  for (let i = 0; i < 6; i++) {
    const g = grupo(quadro, `taverna_quadro_linha_${i}`, [0, (0.365 - i * 0.115) * u, 0]);
    linhaHorario(g, `taverna_quadro_linha_${i}`);
    for (const [x, w] of NOME) {
      bloco(g, `taverna_quadro_linha_${i}_nome_${x}`, w * u, 0.009 * u, 0.0012 * u,
        [x * u, 0, 0.0156 * u], GIZ);
    }
    bloco(g, `taverna_quadro_linha_${i}_risco`, 0.48 * u, 0.0028 * u, 0.0014 * u,
      [-0.085 * u, 0.003 * u, 0.0157 * u], GIZ, 0, [0, 0, -0.07]);
  }
  // A linha rasgada: nome até o meio, depois o buraco e três cacos.
  const linhaRasgada = grupo(quadro, "taverna_quadro_rasgada", [0, -0.325 * u, 0]);
  linhaHorario(linhaRasgada, "taverna_quadro_rasgada");
  bloco(linhaRasgada, "taverna_quadro_rasgada_nome_1", 0.06 * u, 0.009 * u, 0.0012 * u,
    [-0.17 * u, 0, 0.0156 * u], GIZ);
  bloco(linhaRasgada, "taverna_quadro_rasgada_nome_2", 0.034 * u, 0.009 * u, 0.0012 * u,
    [-0.111 * u, 0, 0.0156 * u], GIZ);
  bloco(linhaRasgada, "taverna_quadro_rasgada_caco_1", 0.018 * u, 0.008 * u, 0.0012 * u,
    [0.045 * u, -0.004 * u, 0.0156 * u], GIZ, 0, [0, 0, 0.5]);
  bloco(linhaRasgada, "taverna_quadro_rasgada_caco_2", 0.01 * u, 0.007 * u, 0.0012 * u,
    [0.085 * u, 0.006 * u, 0.0156 * u], GIZ, 0, [0, 0, -0.9]);
  bloco(linhaRasgada, "taverna_quadro_rasgada_caco_3", 0.006 * u, 0.005 * u, 0.0012 * u,
    [0.108 * u, -0.003 * u, 0.0156 * u], GIZ, 0, [0, 0, 1.2]);
  // Contato: traseira do quadro colada na face interna oeste.
  contato("taverna_quadro_parede",
    plano(quadroTampa, [0, 0, -0.015 * u], [0, 0, -1]),
    plano(paredeOeste, [0.125 * u, 0.05 * u, -0.6 * u], [1, 0, 0]));

  // ========================================================================
  // CAIXA DO ALARME, INTACTA (Q10): atrás do balcão, à altura dos olhos.
  // Frente em +z local; wrapper rot [0, PI, 0] vira para a sala (−z).
  // Abas traseiras coladas na parede; o lacre está inteiro.
  // ========================================================================
  const alarme = grupo(raiz, "taverna_alarme", [1.2 * u, 1.55 * u, 4.061 * u], [0, PI, 0]);
  bloco(alarme, "taverna_alarme_caixa", 0.3 * u, 0.24 * u, 0.1 * u,
    [0, 0, 0], mat(cores.caixaAlarme, 0.55, 0.5), 0.008 * u);
  bloco(alarme, "taverna_alarme_tampa", 0.27 * u, 0.21 * u, 0.024 * u,
    [0, 0, 0.062 * u], mat(cores.tampaAlarme, 0.55, 0.5), 0.006 * u);
  bloco(alarme, "taverna_alarme_fecho", 0.05 * u, 0.05 * u, 0.012 * u,
    [0, 0, 0.08 * u], mat(cores.ferro, 0.6, 0.45), 0.003 * u);
  bloco(alarme, "taverna_alarme_cadeado", 0.055 * u, 0.06 * u, 0.022 * u,
    [0, 0, 0.097 * u], mat(cores.cadeado, 0.4, 0.75), 0.012 * u);
  lathe(alarme, "taverna_alarme_argola", [
    [0.014 * u, -0.0055 * u], [0.023 * u, -0.0055 * u],
    [0.023 * u, 0.0055 * u], [0.014 * u, 0.0055 * u], [0.014 * u, -0.0055 * u],
  ], 48, [0, 0.041 * u, 0.097 * u], mat(cores.cadeado, 0.4, 0.7), [PI / 2, 0, 0]);
  const lacre = lathe(alarme, "taverna_alarme_lacre", [
    [0, -0.0025 * u], [0.018 * u, -0.0025 * u],
    [0.018 * u, 0.0025 * u], [0, 0.0025 * u], [0, -0.0025 * u],
  ], 48, [0.075 * u, 0.115 * u, 0.0525 * u], mat(cores.lacre, 0.35, 0.6), [PI / 2, 0, 0]);
  bloco(lacre, "taverna_alarme_lacre_marca_1", 0.012 * u, 0.0015 * u, 0.003 * u,
    [-0.003 * u, 0.0027 * u, -0.003 * u], mat(cores.ferro, 0.35, 0.55), 0, [0, 0.6, 0]);
  bloco(lacre, "taverna_alarme_lacre_marca_2", 0.012 * u, 0.0015 * u, 0.003 * u,
    [0.003 * u, 0.0027 * u, 0.003 * u], mat(cores.ferro, 0.35, 0.55), 0, [0, -0.6, 0]);
  const abaAlarmeEsq = bloco(alarme, "taverna_alarme_aba_esq", 0.024 * u, 0.07 * u, 0.014 * u,
    [-0.09 * u, 0, -0.057 * u], mat(cores.ferro, 0.6, 0.5));
  const abaAlarmeDir = bloco(alarme, "taverna_alarme_aba_dir", 0.024 * u, 0.07 * u, 0.014 * u,
    [0.09 * u, 0, -0.057 * u], mat(cores.ferro, 0.6, 0.5));
  contato("taverna_alarme_aba_esq_parede",
    plano(abaAlarmeEsq, [0, 0, -0.007 * u], [0, 0, -1]),
    plano(paredeNorteDir, [-1.735 * u, -0.15 * u, -0.125 * u], [0, 0, -1]));
  contato("taverna_alarme_aba_dir_parede",
    plano(abaAlarmeDir, [0, 0, -0.007 * u], [0, 0, -1]),
    plano(paredeNorteDir, [-1.915 * u, -0.15 * u, -0.125 * u], [0, 0, -1]));

  // ========================================================================
  // LAMPIÕES DE QUEROSENE: seis, pendurados nas vigas por correntes.
  // A chama é GEOMETRIA COLORIDA (não emissão/luz): duas lathe laranjas.
  // Âncoras: corrente 2.90–3.16 (toque na viga); tampa 2.87–2.90;
  // vidro 2.62–2.86; base 2.60–2.615; chama ~2.68–2.77.
  // ========================================================================
  const lampioes: No[] = [];
  if (opcoes.comLampioes !== false) {
    const POS_LAMPIAO: Array<[number, number]> = [
      [-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8], [0, 0], [0, 2.8],
    ];
    POS_LAMPIAO.forEach(([lx, lz], i) => {
      const g = grupo(raiz, `taverna_lampiao_${i}`, [lx * u, 0, lz * u]);
      const corrente = lathe(g, `taverna_lampiao_${i}_corrente`, [
        [0, 0], [0.008 * u, 0], [0.008 * u, 0.26 * u], [0, 0.26 * u], [0, 0],
      ], 16, [0, 3.03 * u, 0], mat(cores.ferro, 0.5, 0.5));
      // Contato: topo da corrente (local y +0.13) na face de baixo da viga.
      const vigaZ = lz === 0 ? 0 : (lz > 0 ? 2.8 : -2.8);
      const vigaNo = vigas[vigaZ === -2.8 ? 0 : vigaZ === 0 ? 1 : 2]!;
      contato(`taverna_lampiao_${i}_viga`,
        plano(corrente, [0, 0.13 * u, 0], [0, 1, 0]),
        plano(vigaNo, [lx * u, -0.09 * u, (lz - vigaZ) * u], [0, -1, 0]));
      lathe(g, `taverna_lampiao_${i}_tampa`, [
        [0, 0], [0.055 * u, 0.005 * u], [0.04 * u, 0.03 * u], [0, 0.03 * u], [0, 0],
      ], 24, [0, 2.87 * u, 0], mat(cores.lampiaoMetal, 0.6, 0.45));
      lathe(g, `taverna_lampiao_${i}_vidro`, [
        [0, 0], [0.045 * u, 0], [0.045 * u, 0.24 * u], [0, 0.24 * u], [0, 0],
      ], SEG, [0, 2.74 * u, 0],
        { cor: cores.lampiaoVidro, metalico: 0.05, rugosidade: 0.08, opacidade: 0.3 });
      lathe(g, `taverna_lampiao_${i}_base`, [
        [0, 0], [0.05 * u, 0.005 * u], [0.05 * u, 0.015 * u], [0, 0.015 * u], [0, 0],
      ], 24, [0, 2.6075 * u, 0], mat(cores.lampiaoMetal, 0.6, 0.45));
      lathe(g, `taverna_lampiao_${i}_chama`, [
        [0, 0], [0.02 * u, 0.01 * u], [0.016 * u, 0.06 * u], [0, 0.09 * u], [0, 0],
      ], 16, [0, 2.725 * u, 0],
        { cor: cores.chama, metalico: 0, rugosidade: 0.6, opacidade: 0.85 });
      lathe(g, `taverna_lampiao_${i}_chama_int`, [
        [0, 0], [0.01 * u, 0.008 * u], [0.008 * u, 0.035 * u], [0, 0.05 * u], [0, 0],
      ], 12, [0, 2.715 * u, 0],
        { cor: cores.chamaInterna, metalico: 0, rugosidade: 0.6, opacidade: 0.9 });
      lampioes.push(g);
    });
    flutuaIntencional(
      lampioes[0]!,
      "Chamas: luz de geometria colorida (não é emissão/luz do viewer); flutuam dentro do vidro do lampião de propósito.",
    );
  }

  // ========================================================================
  // CORNETAS DE ALTO-FALANTE (teto): quatro, boca voltada pra sala,
  // fiação pendurada em ganchos, isolamento podre. Teia sob a boca.
  // ========================================================================
  const cornetas: No[] = [];
  if (opcoes.comCornetas !== false) {
    const PERFIL_CORNETA: V2[] = [
      [0, 0], [0.025 * u, 0.005 * u], [0.15 * u, 0.24 * u],
      [0.13 * u, 0.225 * u], [0.02 * u, 0.015 * u], [0, 0],
    ];
    const POS_CORNETA: Array<[number, number]> = [
      [-4.4, -2.8], [4.4, -2.8], [-4.4, 2.8], [4.4, 2.8],
    ];
    POS_CORNETA.forEach(([hx, hz], i) => {
      const g = grupo(raiz, `taverna_corneta_${i}`, [hx * u, 3.1 * u, hz * u]);
      const suporte = bloco(g, `taverna_corneta_${i}_suporte`, 0.1 * u, 0.12 * u, 0.1 * u,
        [0, 0, 0], mat(cores.ferro, 0.5, 0.6));
      // Boca (local +y) para baixo, com inclinação de 0.3 rad em direção
      // ao centro da sala (norte inclina para −z, sul para +z).
      const theta = PI - 0.3 * (hz > 0 ? 1 : -1);
      lathe(g, `taverna_corneta_${i}_casco`, PERFIL_CORNETA, SEG,
        [0, 0, 0], mat(cores.corneta, 0.5, 0.7), [theta, 0, 0]);
      // Fiação podre: dois fios finos pendurados ao lado do suporte.
      bloco(g, `taverna_corneta_${i}_fio_1`, 0.006 * u, 0.5 * u, 0.006 * u,
        [(hx > 0 ? -0.16 : 0.16) * u, -0.18 * u, 0.05 * u], mat(cores.fio, 0, 0.9), 0, [0.4, 0, -0.25]);
      bloco(g, `taverna_corneta_${i}_fio_2`, 0.006 * u, 0.42 * u, 0.006 * u,
        [(hx > 0 ? -0.24 : 0.24) * u, -0.24 * u, -0.05 * u], mat(cores.fio, 0, 0.9), 0, [0.6, 0, 0.3]);
      if (!leve) {
        // Teia: cone translúcido sob a boca (não é furo; é panos de aranha).
        lathe(g, `taverna_corneta_${i}_teia`, [
          [0, 0], [0.13 * u, 0], [0, -0.09 * u],
        ], 24, [0, -0.245 * u, 0],
          { cor: cores.teia, metalico: 0, rugosidade: 0.9, opacidade: 0.12 });
      }
      // Contato: topo do suporte (local y +0.06) na face de baixo da viga.
      const vigaNo = vigas[hz < 0 ? 0 : 2]!;
      contato(`taverna_corneta_${i}_viga`,
        plano(suporte, [0, 0.06 * u, 0], [0, 1, 0]),
        plano(vigaNo, [hx * u, -0.09 * u, (hz - (hz < 0 ? -2.8 : 2.8)) * u], [0, -1, 0]));
      cornetas.push(g);
    });
    flutuaIntencional(
      cornetas[0]!,
      "Fios de fiação: pendurados em ganchos da viga (topos aproximados à viga); são decorativos, sem nó de gancho individual.",
    );
  }

  // ========================================================================
  // TRASEIRA (atrás da divisória, x > 2.4): cozinha à lenha + depósito.
  // ========================================================================
  // Fogão a lenha: "a panela no fogo é do homem da recepção, sempre".
  for (const sx of [-0.22, 0.22]) {
    for (const sz of [-0.18, 0.18]) {
      bloco(raiz, `taverna_fogao_perna_${sx > 0 ? "d" : "e"}${sz > 0 ? "n" : "s"}`,
        0.05 * u, 0.12 * u, 0.05 * u, [(4.5 + sx) * u, 0.06 * u, (2.8 + sz) * u],
        mat(cores.ferro, 0.5, 0.6));
    }
  }
  const fogao = bloco(raiz, "taverna_fogao_corpo", 0.55 * u, 0.5 * u, 0.48 * u,
    [4.5 * u, 0.37 * u, 2.8 * u], mat(cores.fogao, 0.4, 0.6), 0.01 * u);
  bloco(raiz, "taverna_fogao_porta", 0.02 * u, 0.34 * u, 0.3 * u,
    [4.215 * u, 0.36 * u, 2.8 * u], mat(cores.ferro, 0.5, 0.55));
  bloco(raiz, "taverna_fogao_puxador", 0.02 * u, 0.03 * u, 0.08 * u,
    [4.2 * u, 0.4 * u, 2.8 * u], mat(cores.ferro, 0.6, 0.45));
  const panela = lathe(raiz, "taverna_panela", [
    [0, 0], [0.12 * u, 0], [0.13 * u, 0.02 * u], [0.13 * u, 0.1 * u],
    [0.11 * u, 0.12 * u], [0.1 * u, 0.12 * u], [0.1 * u, 0.03 * u],
    [0, 0.03 * u], [0, 0],
  ], SEG, [4.5 * u, 0.68 * u, 2.8 * u], mat(cores.ferro, 0.5, 0.5));
  contato("taverna_panela_fogao",
    plano(panela, [0, -0.06 * u, 0], [0, -1, 0]),
    plano(fogao, [0, 0.25 * u, 0], [0, 1, 0]));
  // Chaminé: sobe até a viga norte (z = 2.8), encostada de leve.
  const chamine = lathe(raiz, "taverna_chamine", [
    [0, 0], [0.045 * u, 0], [0.045 * u, 2.54 * u], [0, 2.54 * u], [0, 0],
  ], 24, [4.5 * u, 1.89 * u, 2.8 * u], mat(cores.ferro, 0.5, 0.6));
  contato("taverna_chamine_viga",
    plano(chamine, [0, 1.27 * u, 0], [0, 1, 0]),
    plano(vigas[2]!, [4.5 * u, -0.09 * u, 0], [0, -1, 0]));
  // Prateleiras com latas sem rótulo + balde.
  bloco(raiz, "taverna_prateleira_1", 0.22 * u, 0.03 * u, 0.9 * u,
    [5.26 * u, 1.2 * u, 1.2 * u], mat(cores.madeirao, 0, 0.85));
  bloco(raiz, "taverna_prateleira_2", 0.22 * u, 0.03 * u, 0.9 * u,
    [5.26 * u, 1.7 * u, 1.2 * u], mat(cores.madeirao, 0, 0.85));
  if (!leve) {
    for (let i = 0; i < 4; i++) {
      lathe(raiz, `taverna_lata_${i}`, [
        [0, 0], [0.04 * u, 0], [0.04 * u, 0.11 * u], [0, 0.11 * u], [0, 0],
      ], 20, [5.26 * u, 1.27 * u, (0.95 + i * 0.15) * u], mat(cores.lata, 0.6, 0.5));
    }
  }
  lathe(raiz, "taverna_balde", [
    [0, 0], [0.115 * u, 0], [0.13 * u, 0.24 * u], [0.11 * u, 0.24 * u],
    [0.1 * u, 0.03 * u], [0, 0.03 * u], [0, 0],
  ], 24, [3.4 * u, 0.12 * u, 3.9 * u], mat(cores.balde, 0.5, 0.6));
  // Catre de caminhante (depósito).
  bloco(raiz, "taverna_catre_arco", 0.6 * u, 0.3 * u, 1.9 * u,
    [3.0 * u, 0.15 * u, -0.6 * u], mat(cores.madeirao, 0, 0.85), 0.02 * u);
  bloco(raiz, "taverna_catre_colchao", 0.56 * u, 0.08 * u, 1.84 * u,
    [3.0 * u, 0.34 * u, -0.6 * u], mat(cores.parede, 0, 0.95), 0.02 * u);
  bloco(raiz, "taverna_catre_travesseiro", 0.2 * u, 0.05 * u, 0.35 * u,
    [3.0 * u, 0.4 * u, -1.3 * u], mat(cores.giz, 0, 0.95), 0.015 * u);
  // Caixotes do depósito.
  bloco(raiz, "taverna_caixote_1", 0.5 * u, 0.5 * u, 0.5 * u,
    [4.6 * u, 0.25 * u, -3.0 * u], mat(cores.madeirao, 0, 0.85), 0.01 * u, [0, 0.1, 0.08]);
  bloco(raiz, "taverna_caixote_2", 0.45 * u, 0.45 * u, 0.45 * u,
    [5.05 * u, 0.225 * u, -2.4 * u], mat(cores.madeirao, 0, 0.85), 0.01 * u, [0, -0.12, -0.15]);

  // ========================================================================
  // SALA: três mesas redondas + bancos; a mala da mulher; as moedas do
  // homem que conta errado de propósito.
  // ========================================================================
  const MESAS: Array<[number, number]> = [[-3.2, -1.6], [-1.2, 0.8], [-4.0, 1.8]];
  MESAS.forEach(([mx, mz], i) => {
    const base = lathe(raiz, `taverna_mesa_${i}_base`, [
      [0, 0], [0.2 * u, 0], [0.2 * u, 0.025 * u], [0, 0.025 * u], [0, 0],
    ], 32, [mx * u, 0.0125 * u, mz * u], mat(cores.mesa, 0.1, 0.7));
    contato(`taverna_mesa_${i}_chao`, plano(base, [0, -0.0125 * u, 0], [0, -1, 0]), topoChao(mx, mz));
    lathe(raiz, `taverna_mesa_${i}_coluna`, [
      [0, 0], [0.035 * u, 0], [0.035 * u, 0.68 * u], [0, 0.68 * u], [0, 0],
    ], 24, [mx * u, 0.365 * u, mz * u], mat(cores.mesa, 0.1, 0.7));
    lathe(raiz, `taverna_mesa_${i}_topo`, [
      [0, 0], [0.35 * u, 0], [0.35 * u, 0.03 * u], [0, 0.03 * u], [0, 0],
    ], 48, [mx * u, 0.715 * u, mz * u], mat(cores.mesa, 0.1, 0.7));
  });
  const BANCOS: Array<[number, number]> = [[-3.2, -2.0], [-1.2, 1.2], [-4.0, 2.2]];
  BANCOS.forEach(([bx, bz], i) => {
    bloco(raiz, `taverna_banco_${i}`, 0.9 * u, 0.04 * u, 0.28 * u,
      [bx * u, 0.45 * u, bz * u], mat(cores.banco, 0, 0.85), 0.01 * u);
    for (const s of [-0.4, 0.4]) {
      bloco(raiz, `taverna_banco_${i}_pe_${s < 0 ? "e" : "d"}`, 0.05 * u, 0.43 * u, 0.26 * u,
        [(bx + s) * u, 0.215 * u, bz * u], mat(cores.banco, 0, 0.85));
    }
  });
  // Banqueta do contador de moedas.
  const banqueta = lathe(raiz, "taverna_banqueta", [
    [0, 0], [0.14 * u, 0], [0.14 * u, 0.45 * u], [0, 0.45 * u], [0, 0],
  ], 24, [-3.45 * u, 0.225 * u, -1.45 * u], mat(cores.banqueta, 0, 0.85));
  contato("taverna_banqueta_chao", plano(banqueta, [0, -0.225 * u, 0], [0, -1, 0]), topoChao(-3.45, -1.45));
  // Moedas (ele conta errado de propósito, recomeça).
  if (!leve) {
    for (let i = 0; i < 3; i++) {
      lathe(raiz, `taverna_moeda_${i}`, [
        [0, 0], [0.016 * u, 0], [0.016 * u, 0.003 * u], [0, 0.003 * u], [0, 0],
      ], 16, [(-3.05 + i * 0.045) * u, 0.733 * u, (-1.5 - i * 0.06) * u],
        mat(cores.moeda, 0.8, 0.35));
    }
  }
  // Copo na mesa 1 (o que ele não para de limpar é outro; este é da mesa).
  lathe(raiz, "taverna_mesa_copo", [
    [0, 0], [0.026 * u, 0], [0.028 * u, 0.002 * u], [0.03 * u, 0.055 * u],
    [0.028 * u, 0.057 * u], [0.024 * u, 0.057 * u], [0.022 * u, 0.006 * u],
    [0.02 * u, 0.006 * u], [0.02 * u, 0], [0, 0],
  ], 24, [-3.35 * u, 0.766 * u, -1.55 * u],
    { cor: cores.copo, metalico: 0.05, rugosidade: 0.08, opacidade: 0.3 });
  // A mala da mulher, no chão ao lado dela.
  const mala = bloco(raiz, "taverna_mala", 0.42 * u, 0.3 * u, 0.14 * u,
    [-0.7 * u, 0.15 * u, 1.05 * u], mat(cores.couro, 0.1, 0.7), 0.02 * u, [0, 0, 0.04]);
  contato("taverna_mala_chao", plano(mala, [0, -0.15 * u, 0], [0, -1, 0]), topoChao(-0.7, 1.05));

  // ========================================================================
  // AS PESSOAS. Bonecos de manequim (sem rosto — "ninguém parece doente;
  // ninguém parece bem"): pernas, torso torneado, pescoço, cabeça.
  // ========================================================================
  function pessoaDePe(pai: Pai, nome: string, x: number, z: number, rotY: number,
    corTorso: string, comCasaco = false): No {
    const g = grupo(pai, nome, [x * u, 0, z * u], [0, rotY, 0]);
    const calca = bloco(g, `${nome}_calca`, 0.3 * u, 0.82 * u, 0.2 * u,
      [0, 0.41 * u, 0], mat(cores.pessoa, 0, 0.9));
    contato(`${nome}_chao`, plano(calca, [0, -0.41 * u, 0], [0, -1, 0]), topoChao(x, z));
    const perfilTorso: V2[] = comCasaco
      ? [[0, 0], [0.17 * u, 0.01 * u], [0.23 * u, 0.15 * u], [0.22 * u, 0.42 * u],
         [0.15 * u, 0.52 * u], [0, 0.55 * u]]
      : [[0, 0], [0.15 * u, 0.01 * u], [0.185 * u, 0.14 * u], [0.17 * u, 0.4 * u],
         [0.12 * u, 0.5 * u], [0.05 * u, 0.55 * u], [0, 0.55 * u]];
    lathe(g, `${nome}_torso`, perfilTorso, 32, [0, 0.8 * u, 0], mat(corTorso, 0, 0.9));
    bloco(g, `${nome}_pescoço`, 0.08 * u, 0.06 * u, 0.08 * u, [0, 1.37 * u, 0],
      mat(cores.pessoa, 0, 0.9));
    lathe(g, `${nome}_cabeça`, [
      [0, 0], [0.06 * u, 0.01 * u], [0.1 * u, 0.07 * u], [0.1 * u, 0.15 * u],
      [0.065 * u, 0.21 * u], [0, 0.23 * u],
    ], 24, [0, 1.4 * u, 0], mat(cores.pessoa, 0, 0.9));
    if (comCasaco) {
      // Colarinho alto + chapéu (de noite, com casaco pesado, mesmo que
      // esteja calor).
      lathe(g, `${nome}_colarinho`, [
        [0.09 * u, -0.04 * u], [0.13 * u, -0.04 * u], [0.13 * u, 0.04 * u],
        [0.09 * u, 0.04 * u], [0.09 * u, -0.04 * u],
      ], 24, [0, 1.38 * u, 0], mat(corTorso, 0, 0.9));
      lathe(g, `${nome}_chapeu_flecha`, [
        [0, 0], [0.13 * u, 0], [0.13 * u, 0.015 * u], [0, 0.015 * u], [0, 0],
      ], 24, [0, 1.595 * u, 0], mat(cores.casaco, 0, 0.85));
      lathe(g, `${nome}_chapeu_corpo`, [
        [0, 0], [0.085 * u, 0], [0.085 * u, 0.07 * u], [0, 0.07 * u], [0, 0],
      ], 24, [0, 1.605 * u, 0], mat(cores.casaco, 0, 0.85));
    } else {
      for (const s of [-1, 1]) {
        bloco(g, `${nome}_braco_${s < 0 ? "e" : "d"}`, 0.06 * u, 0.5 * u, 0.06 * u,
          [s * 0.21 * u, 1.05 * u, 0], mat(corTorso, 0, 0.9), 0, [0, 0, s * -0.12]);
      }
    }
    return g;
  }

  const pessoas = {} as {
    atendente?: No; viajanteSentado?: No; viajanteEmPe?: No; anselmo?: No;
  };

  if (opcoes.comAtendente !== false) {
    // O atendente de dentes ruins: na faixa estreita atrás do balcão, de
    // costas pra parede, limpando um copo que já está limpo.
    const g = grupo(raiz, "taverna_atendente", [0.7 * u, 0, 2.55 * u], [0, PI, 0]);
    const calcaA = bloco(g, "taverna_atendente_calca", 0.3 * u, 0.82 * u, 0.2 * u,
      [0, 0.41 * u, 0], mat(cores.pessoa, 0, 0.9));
    contato("taverna_atendente_chao", plano(calcaA, [0, -0.41 * u, 0], [0, -1, 0]), topoChao(0.7, 2.55));
    lathe(g, "taverna_atendente_torso", [
      [0, 0], [0.15 * u, 0.01 * u], [0.185 * u, 0.14 * u], [0.17 * u, 0.4 * u],
      [0.12 * u, 0.5 * u], [0.05 * u, 0.55 * u], [0, 0.55 * u],
    ], 32, [0, 0.8 * u, 0], mat(cores.atendente, 0, 0.9));
    bloco(g, "taverna_atendente_pescoço", 0.08 * u, 0.06 * u, 0.08 * u,
      [0, 1.37 * u, 0], mat(cores.pessoa, 0, 0.9));
    lathe(g, "taverna_atendente_cabeça", [
      [0, 0], [0.06 * u, 0.01 * u], [0.1 * u, 0.07 * u], [0.1 * u, 0.15 * u],
      [0.065 * u, 0.21 * u], [0, 0.23 * u],
    ], 24, [0, 1.4 * u, 0], mat(cores.pessoa, 0, 0.9));
    // Braços à frente, segurando o copo (local +z = para a sala, pois o
    // grupo está virado com rotY PI).
    for (const s of [-1, 1]) {
      bloco(g, `taverna_atendente_braço_${s < 0 ? "e" : "d"}`, 0.06 * u, 0.46 * u, 0.06 * u,
        [s * 0.16 * u, 1.02 * u, 0.1 * u], mat(cores.atendente, 0, 0.9), 0, [-0.7, 0, s * 0.3]);
    }
    lathe(g, "taverna_atendente_copo", [
      [0, 0], [0.026 * u, 0], [0.028 * u, 0.055 * u], [0.024 * u, 0.057 * u],
      [0.02 * u, 0.057 * u], [0.02 * u, 0.006 * u], [0, 0.006 * u], [0, 0],
    ], 24, [0, 1.06 * u, 0.16 * u],
      { cor: cores.copo, metalico: 0.05, rugosidade: 0.08, opacidade: 0.3 });
    pessoas.atendente = g;
  }

  if (opcoes.comViajantes !== false) {
    // d6 = 1: o homem contando moedas, sentado na banqueta da mesa 1.
    const gs = grupo(raiz, "taverna_viajante_sentado", [-3.45 * u, 0, -1.45 * u], [0, -PI / 2, 0]);
    for (const s of [-1, 1]) {
      bloco(gs, `taverna_viajante_sentado_perna_${s < 0 ? "e" : "d"}`, 0.08 * u, 0.45 * u, 0.09 * u,
        [s * 0.08 * u, 0.225 * u, 0.12 * u], mat(cores.pessoa, 0, 0.9));
    }
    bloco(gs, "taverna_viajante_sentado_coxa", 0.32 * u, 0.11 * u, 0.4 * u,
      [0, 0.455 * u, 0.08 * u], mat(cores.pessoa, 0, 0.9));
    // Contato (perna esquerda) no piso; a direita compartilha o plano.
    // O grupo está rotY −PI/2: local (−0.08, ·, 0.12) → mundo (−3.57, ·, −1.53).
    contato("taverna_viajante_sentado_chao",
      plano(gs, [-0.08 * u, -0.225 * u, 0.12 * u], [0, -1, 0]), topoChao(-3.57, -1.53));
    lathe(gs, "taverna_viajante_sentado_torso", [
      [0, 0], [0.15 * u, 0.01 * u], [0.185 * u, 0.14 * u], [0.17 * u, 0.4 * u],
      [0.12 * u, 0.5 * u], [0.05 * u, 0.55 * u], [0, 0.55 * u],
    ], 32, [0, 0.47 * u, 0], mat(cores.pessoa, 0, 0.9));
    bloco(gs, "taverna_viajante_sentado_pescoço", 0.08 * u, 0.05 * u, 0.08 * u,
      [0, 1.045 * u, 0], mat(cores.pessoa, 0, 0.9));
    lathe(gs, "taverna_viajante_sentado_cabeça", [
      [0, 0], [0.06 * u, 0.01 * u], [0.1 * u, 0.07 * u], [0.1 * u, 0.15 * u],
      [0.065 * u, 0.21 * u], [0, 0.23 * u],
    ], 24, [0, 1.07 * u, 0], mat(cores.pessoa, 0, 0.9));
    for (const s of [-1, 1]) {
      bloco(gs, `taverna_viajante_sentado_braço_${s < 0 ? "e" : "d"}`, 0.06 * u, 0.45 * u, 0.06 * u,
        [s * 0.2 * u, 0.8 * u, 0.05 * u], mat(cores.pessoa, 0, 0.9), 0, [-0.6, 0, s * 0.15]);
    }
    pessoas.viajanteSentado = gs;
    // d6 = 2: a mulher com mala no colo (a mala, na prática, no chão —
    // ela pergunta a que horas vai o próximo).
    pessoas.viajanteEmPe = pessoaDePe(raiz, "taverna_viajante_em_pe", -1.0, 1.0, -2.0, cores.pessoa);
  }

  if (opcoes.comAnselmo !== false) {
    // Seu Anselmo: de noite, com casaco pesado, mesmo que esteja calor.
    // Não se senta. Procura alguém com os olhos antes do balcão.
    pessoas.anselmo = pessoaDePe(raiz, "taverna_anselmo", 0, 3.85, PI + 0.3,
      cores.casaco, true);
  }

  // ========================================================================
  // Registro opcional dos acoplamentos.
  // ========================================================================
  if (opcoes.registrarAcoplamento) {
    for (const d of acoplamentos) opcoes.registrarAcoplamento(cena, d);
  }

  let angHoraAplicado = angHora;
  let angMinAplicado = angMin;
  function ajustarHoraRelogio(hh: number, mm: number) {
    // girar() é incremental — acompanho o ângulo aplicado (sem acúmulo).
    const novoH = ((hh % 12) + mm / 60) / 12 * 2 * PI;
    const novoM = (mm / 60) * 2 * PI;
    gHoraRel.girar([0, novoH - angHoraAplicado, 0]);
    gMinRel.girar([0, novoM - angMinAplicado, 0]);
    angHoraAplicado = novoH;
    angMinAplicado = novoM;
  }
  function voltarQuatroE17() {
    ajustarHoraRelogio(4, 17);
  }

  flutuaIntencional(
    raiz,
    "Diorama de vitrine: a face sul está aberta de propósito (a porta de serviço 'ladrilhada' vive nesse muro baixo; o salão é lido de cima/sul); relógio, quadro, alarme, placas, tijolos do vão e vidraça assentam nas paredes/batentes, não no piso.",
  );

  return {
    cena,
    raiz,
    chao,
    vigas,
    balcao,
    relogio,
    quadro,
    alarme,
    lampioes,
    cornetas,
    pessoas,
    ajustarHoraRelogio,
    voltarQuatroE17,
    acoplamentos,
    ficha: {
      unidade: "m" as const,
      sala: `${11 * e} × ${8.5 * e} × ${3.4 * e} (comprimento × largura × pé-direito)`,
      norte: "+z (plataforma); frente aberta ao sul (diorama)",
      origem: "centro do piso (y = 0)",
      balcao: "(0.7, ·, 2.0) — trilho + 4 dormentes, tampo 0.795 m",
      caixaAlarme: "(1.2, 1.55, 4.06) — INTACTA, lacre inteiro",
      relogio: "(−2.2, 2.5, 4.08) — parado às 4h17 (ajustarHoraRelogio/voltarQuatroE17)",
      quadro: "(−5.36, 1.75, −0.6) — 6 destinos riscados + linha rasgada",
      divisoria: "x = 2.4; porta interna no vão z 2.2–3.1",
      pessoas: "atendente (faixa do balcão), 2 viajantes, Seu Anselmo (opcional, comAnselmo)",
    },
  };
}

/*
 * FLUTUAÇÕES INTENCIONAIS (declaradas com `no.permitirFlutuacao(motivo)`;
 * o linter as lista como "flutuações intencionais ignoradas") e
 * INTERPENETRAÇÕES (contatos declarados, retornados por referência):
 * - Chamas dos lampiões: luz de geometria colorida (duas lathe
 *   translúcidas), não emissão — flutuam dentro do vidro de propósito.
 * - Fios das cornetas: pendurados em ganchos da viga (topos aproximados);
 *   decoração, sem nó de gancho individual.
 * - taverna_fosforo_rotulo: 1 mm de ressalto sobre a caixa (relevo).
 * - Argola do cadeado: embutida ~12 mm no corpo (hardware real).
 * - Marcas de trinca no vidro do relógio: relevo embutido (marcador).
 * - Placa do relógio e abas do alarme: embutidas/coladas nas paredes
 *   (contatos declarados); o corpo do relógio assenta a 0 mm da placa.
 * - Copos/garrafa/fósforo: assentam no tampo (contatos declarados); o
 *   copo_2 assenta na chapa_1 (que assenta no trilho — cadeia declarada).
 * - O banco, os caixotes e o catre assentam no piso pelo mesmo plano
 *   (y = 0) das mesas/banqueta/mala — contato declarado nas peças
 *   principais; o restante compartilha o plano do piso.
 * - A frente sul é ABERTA: diorama de vitrine; a porta de serviço
 *   ladrilhada vive no muro baixo sul (comMuroSul).
 *
 * Contatos declarados: ~30 (piso: balcão 4, divisória 3, mesas 3,
 * banqueta, mala, garrafa, copos, fósforo; vigas: lampiões 6, cornetas 4,
 * chaminé; paredes: relógio, quadro, alarme 2 abas; fogão/panela).
 *
 * Sem CSG, texturas, texto nativo, luzes ou câmeras. As pessoas são
 * manequins sem rosto de propósito: "ninguém parece doente; ninguém
 * parece bem". O nome ilegível do quadro continua abstrato (traços de
 * giz) — cada um lê uma coisa diferente (POÇO 7, CURRAL ALTO, VILA RASA,
 * PONTE VELHA, A FAZENDA…).
 */

export default montarCena;
