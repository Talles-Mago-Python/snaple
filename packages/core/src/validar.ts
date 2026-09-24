/** O "linter de cena": validação semântica que roda sobre o estado, sem
 * render.
 *
 * São sempre AVISOS, nunca bloqueios — interpenetração pode ser deliberada
 * (um prego cravado numa tábua), e a lib não tem como saber. Saem em duas
 * formas: array estruturado (para código) e texto (para um LLM ler). */
import { type AABB, sobreposicao, sobrepoeNoPlano } from "./bbox.ts";
import { type OBB, obbDoNo, obbsSeSobrepoem } from "./obb.ts";
import { erroDoAcoplamento } from "./acoplamento.ts";
import { type NoMundo, saoParentes } from "./mundo.ts";
import { percorrer } from "./no.ts";
import type { Cena } from "./cena.ts";
import type { ParamsJunta } from "./tipos.ts";
import { type Eixo, type IndiceEixo, arred } from "./vetor.ts";

/** Folga abaixo da qual duas bboxes "só se tocam" em vez de penetrar. */
export const TOL_CONTATO = 1e-6;
/** Tolerância de `centros-coincidentes`, RELATIVA ao tamanho das peças: a
 * fração da diagonal da AABB própria da MENOR das duas que conta como "o
 * mesmo centro". Uma tolerância absoluta (antes 3 cm) não serve para as duas
 * escalas ao mesmo tempo — numa câmera de 13 cm quase todo par de peças
 * milimétricas vizinhas ficava a menos de 3 cm e virava aviso (dezenas de
 * milhares deles). Medir contra a menor peça responde à pergunta certa: "a
 * distância entre os centros é desprezível para o tamanho desta peça?". 2%
 * é pouco para ser um encaixe normal entre vizinhos e ainda pega um
 * posicionamento esquecido (duas esferas de 20 cm a 5 mm de distância). */
export const TOL_CENTROS_FRACAO = 0.02;
/** Piso da tolerância de centros, em metros: mantém "exatamente o mesmo
 * centro" como aviso mesmo para peças degeneradas (diagonal ~0). */
export const TOL_CENTROS_MIN = 1e-5;
/** Teto da tolerância de centros, em metros (o antigo valor absoluto): peças
 * grandes nunca ficam mais sensíveis do que eram antes. */
export const TOL_CENTROS_MAX = 0.03;
/** Altura acima da qual a base de um nó sem apoio conta como flutuando. */
export const TOL_CHAO = 1e-6;

export interface AvisoBase {
  tipo: string;
  texto: string;
}

export interface AvisoInterpenetracao extends AvisoBase {
  tipo: "interpenetracao";
  nos: [string, string];
  eixo: Eixo;
  /** Sobreposição mínima entre as duas caixas, em metros: o quanto seria
   * preciso afastar para separá-las. */
  valor: number;
}

export interface AvisoFlutuando extends AvisoBase {
  tipo: "flutuando";
  no: string;
  /** Altura da base acima de y=0, em metros. */
  altura: number;
}

export interface AvisoCentrosCoincidentes extends AvisoBase {
  tipo: "centros-coincidentes";
  nos: [string, string];
  distancia: number;
}

/** Não é um problema: um par que se sobrepõe geometricamente, mas foi
 * declarado como contato intencional (`no.permitirContato(outro)`) — por
 * isso fica de fora de `avisosEmTexto()` (que só lista problemas) e existe
 * para `descrever()` poder resumir quantos contatos assim foram ignorados. */
export interface AvisoContatoIntencional extends AvisoBase {
  tipo: "contato-intencional";
  nos: [string, string];
}

export interface AvisoJuntaForaDoLimite extends AvisoBase {
  tipo: "junta-fora-do-limite";
  no: string;
  angulo: number;
  limites: [number, number];
}

export interface AvisoAcoplamentoViolado extends AvisoBase {
  tipo: "acoplamento-violado";
  acoplamento: string;
  nos: [string, string];
  erroPosicao: number;
  erroAngulo: number;
}

export type Aviso =
  | AvisoInterpenetracao | AvisoFlutuando | AvisoCentrosCoincidentes
  | AvisoContatoIntencional | AvisoJuntaForaDoLimite | AvisoAcoplamentoViolado;

function emGraus(rad: number): string {
  return `${arred((rad * 180) / Math.PI, 1)}°`;
}

const NOME_EIXO: readonly Eixo[] = ["x", "y", "z"];

/** `a` permitiu contato com `b`, ou vice-versa — uma direção já basta (mesmo
 * padrão de `saoParentes` para pai/filho). */
function contatoPermitido(a: { no: { id: string; validacao?: { contatoIntencional?: string[] } } }, b: typeof a): boolean {
  return !!a.no.validacao?.contatoIntencional?.includes(b.no.id)
    || !!b.no.validacao?.contatoIntencional?.includes(a.no.id);
}

/** Como um nó aparece no TEXTO de um aviso: o `nome` quando existe, o id
 * senão. Os campos estruturados (`nos`, `no`) continuam sempre com ids. */
function rotulo(no: { id: string; nome?: string }): string {
  return no.nome || no.id;
}

/** Chave estável de um par de ids, independente da ordem. */
function chaveDoPar(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

export function avisosDaCena(cena: Cena): Aviso[] {
  const nos = cena.nosGeometricos();
  const mundo = cena.mundo();
  const avisos: Aviso[] = [];
  // OBB de cada nó, calculada uma vez (não por par) a partir da matriz de
  // mundo já resolvida — é só um refinamento de precisão sobre a mesma AABB
  // `propria` usada abaixo, não substitui a fase ampla.
  const obbs = new Map<string, OBB>();
  for (const m of nos) {
    const obb = obbDoNo(m.no, m.matriz);
    if (obb) obbs.set(m.no.id, obb);
  }
  const diagonais = new Map<string, number>();
  for (const m of nos) diagonais.set(m.no.id, Math.hypot(...m.propria!.tamanho));

  // Pares (e nós) com um acoplamento contato/pivo entre si: mesma ideia de
  // `saoParentes` para pai/filho — a relação já é a declaração explícita de
  // que o contato/a articulação é intencional, então interpenetração e
  // flutuação entre eles não são erro de modelagem.
  const paresAcoplados = new Set<string>();
  const nosComAcoplamento = new Set<string>();
  for (const ac of cena.acoplamentos()) {
    if (ac.tipo !== "contato" && ac.tipo !== "pivo") continue;
    paresAcoplados.add(chaveDoPar(ac.a.no, ac.b.no));
    nosComAcoplamento.add(ac.a.no);
    nosComAcoplamento.add(ac.b.no);
  }

  // Só pares que PODEM gerar algo (ver `paresCandidatos`), na mesma ordem
  // (i, j) do laço de todos-contra-todos — a saída não muda, só o custo.
  const apoiado = new Array<boolean>(nos.length).fill(false);
  for (const [i, j] of paresCandidatos(nos, diagonais)) {
    const a = nos[i]!, b = nos[j]!;
    // apoio vale também entre parentes/acoplados — é decidido antes do filtro
    if (apoia(b.propria!, a.propria!)) apoiado[i] = true;
    if (apoia(a.propria!, b.propria!)) apoiado[j] = true;
    if (saoParentes(mundo, a.no.id, b.no.id)) continue;
    if (paresAcoplados.has(chaveDoPar(a.no.id, b.no.id))) continue;
    const ca = a.propria!, cb = b.propria!;
    const s = sobreposicao(ca, cb);
    const sobrepoeAABB = s[0]! > TOL_CONTATO && s[1]! > TOL_CONTATO && s[2]! > TOL_CONTATO;
    // AABB é a fase AMPLA (barata, mas infla peças giradas); só quando ela
    // já indica sobreposição é que vale a pena rodar o SAT orientado, que
    // é o que decide de verdade — elimina o falso positivo clássico de
    // duas peças giradas cujas AABBs se cruzam sem as caixas reais se
    // tocarem.
    if (sobrepoeAABB) {
      const obbA = obbs.get(a.no.id), obbB = obbs.get(b.no.id);
      // mesma régua da fase ampla acima: sobreposição de até `TOL_CONTATO` nas
      // 15 direções é contato, não penetração (duas peças encostadas e
      // giradas ficam com separação de ±ε em cada eixo, e o SAT, sem a folga,
      // acusa a metade dos ângulos por arredondamento)
      const sobrepoeDeVerdade = obbA && obbB ? obbsSeSobrepoem(obbA, obbB, TOL_CONTATO) : true;
      if (sobrepoeDeVerdade) {
        if (contatoPermitido(a, b)) {
          avisos.push({
            tipo: "contato-intencional",
            nos: [a.no.id, b.no.id],
            texto: `${rotulo(a.no)} e ${rotulo(b.no)} se sobrepõem, mas o contato foi declarado intencional`,
          });
        } else {
          // o eixo de MENOR sobreposição (na AABB) é a distância mínima de
          // separação — mantido como antes, o SAT só decide SE reportar.
          let menor: IndiceEixo = 0;
          for (const k of [1, 2] as IndiceEixo[]) if (s[k]! < s[menor]!) menor = k;
          avisos.push({
            tipo: "interpenetracao",
            nos: [a.no.id, b.no.id],
            eixo: NOME_EIXO[menor]!,
            valor: s[menor]!,
            texto: `${rotulo(a.no)} penetra ${rotulo(b.no)} em ${fmt(s[menor]!)} no eixo ${NOME_EIXO[menor]}`,
          });
        }
      }
    }
    const d = Math.hypot(
      ca.centro[0] - cb.centro[0], ca.centro[1] - cb.centro[1], ca.centro[2] - cb.centro[2],
    );
    const menorDiagonal = Math.min(diagonais.get(a.no.id)!, diagonais.get(b.no.id)!);
    if (d < tolCentros(menorDiagonal)) {
      avisos.push({
        tipo: "centros-coincidentes",
        nos: [a.no.id, b.no.id],
        distancia: d,
        texto: `${rotulo(a.no)} e ${rotulo(b.no)} têm praticamente o mesmo centro (${fmt(d)} de distância) — provável erro de posicionamento`,
      });
    }
  }

  nos.forEach((m, i) => {
    const caixa = m.propria!;
    if (caixa.min[1]! <= TOL_CHAO) return;
    if (nosComAcoplamento.has(m.no.id)) return; // apoio/articulação já declarados
    if (!apoiado[i]) {
      avisos.push({
        tipo: "flutuando",
        no: m.no.id,
        altura: caixa.min[1]!,
        texto: `${rotulo(m.no)} flutua ${fmt(caixa.min[1]!)} acima do chão, sem nada embaixo`,
      });
    }
  });

  for (const { no } of percorrer(cena.raiz)) {
    if (no.tipo !== "junta") continue;
    const p = no.params as ParamsJunta;
    if (!p.limites) continue;
    const [min, max] = p.limites;
    if (p.angulo < min || p.angulo > max) {
      avisos.push({
        tipo: "junta-fora-do-limite",
        no: no.id,
        angulo: p.angulo,
        limites: p.limites,
        texto: `${rotulo(no)}: ângulo ${emGraus(p.angulo)} fora do limite [${emGraus(min)}, ${emGraus(max)}]`,
      });
    }
  }

  for (const ac of cena.acoplamentos()) {
    const { erroPosicao, erroAngulo } = erroDoAcoplamento(cena, ac);
    if (erroPosicao > TOL_CONTATO || erroAngulo > TOL_CONTATO) {
      avisos.push({
        tipo: "acoplamento-violado",
        acoplamento: ac.id,
        nos: [ac.a.no, ac.b.no],
        erroPosicao, erroAngulo,
        texto: `${ac.tipo} '${ac.id}'${ac.nome ? ` (${ac.nome})` : ""} entre ${rotulo(cena.no(ac.a.no))} e ${rotulo(cena.no(ac.b.no))}: ` +
          `${fmt(erroPosicao)} de posição, ${emGraus(erroAngulo)} de ângulo`,
      });
    }
  }

  return avisos;
}

/** `c` apoia `caixa`: encosta por baixo (ou já sobrepõe) e cobre em XZ. */
function apoia(c: AABB, caixa: AABB): boolean {
  if (c.max[1]! < caixa.min[1]! - TOL_CONTATO) return false;
  if (c.min[1]! > caixa.min[1]! + TOL_CONTATO) return false;
  return sobrepoeNoPlano(caixa, c, 1, TOL_CONTATO);
}

/** Tolerância de `centros-coincidentes` de uma peça sozinha, pela diagonal
 * dela. A de um par usa a MENOR diagonal, então nunca passa da de nenhuma
 * das duas peças. */
function tolCentros(diagonal: number): number {
  return Math.min(TOL_CENTROS_MAX, Math.max(TOL_CENTROS_MIN, TOL_CENTROS_FRACAO * diagonal));
}

/** Pares `[i, j]` (i < j, em ordem) cujas caixas próprias podem gerar
 * interpenetração, centros coincidentes ou apoio — sweep-and-prune em vez de
 * todos-contra-todos, que numa cena de 5 mil peças eram 15 milhões de pares.
 *
 * As três relações exigem que, em CADA eixo, os intervalos das duas caixas se
 * cruzem ou fiquem a menos da tolerância de centros da peça (os centros estão
 * dentro das caixas; o apoio só precisa de `TOL_CONTATO`). Então, com as
 * caixas ordenadas pelo `min` no eixo varrido, cada uma só é comparada com as
 * seguintes até a primeira cujo `min` passa do seu `max` + essa margem, e o
 * par só entra se também passar a mesma folga nos outros dois eixos. */
function paresCandidatos(nos: readonly NoMundo[], diagonais: ReadonlyMap<string, number>): [number, number][] {
  const n = nos.length;
  const caixas = nos.map((m) => m.propria!);
  const margens = nos.map((m) => Math.max(tolCentros(diagonais.get(m.no.id)!), TOL_CONTATO));
  const finitas = caixas.every((c) => [...c.min, ...c.max].every(Number.isFinite));
  if (!finitas) {
    // NaN/Infinity quebram a ordenação — volta ao exaustivo
    const todos: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) todos.push([i, j]);
    return todos;
  }
  // eixo onde as caixas (com margem) são mais finas em relação à extensão
  // da cena: é onde a varredura corta mais cedo
  let eixo: IndiceEixo = 0;
  let melhor = Infinity;
  for (const e of [0, 1, 2] as IndiceEixo[]) {
    let lo = Infinity, hi = -Infinity, soma = 0;
    caixas.forEach((c, i) => {
      lo = Math.min(lo, c.min[e]!);
      hi = Math.max(hi, c.max[e]!);
      soma += c.tamanho[e]! + margens[i]!;
    });
    const densidade = soma / Math.max(hi - lo, Number.MIN_VALUE);
    if (densidade < melhor) { melhor = densidade; eixo = e; }
  }
  const ordem = caixas.map((_, i) => i).sort((p, q) => caixas[p]!.min[eixo]! - caixas[q]!.min[eixo]!);
  const codigos: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = ordem[k]!;
    const a = caixas[i]!;
    const margem = margens[i]!;
    const limite = a.max[eixo]! + margem;
    for (let l = k + 1; l < n; l++) {
      const j = ordem[l]!;
      const b = caixas[j]!;
      if (b.min[eixo]! > limite) break;
      if (b.min[0]! > a.max[0]! + margem || a.min[0]! > b.max[0]! + margem) continue;
      if (b.min[1]! > a.max[1]! + margem || a.min[1]! > b.max[1]! + margem) continue;
      if (b.min[2]! > a.max[2]! + margem || a.min[2]! > b.max[2]! + margem) continue;
      codigos.push(i < j ? i * n + j : j * n + i);
    }
  }
  // `i·n + j` ordena exatamente como (i, j) e é exato em double para qualquer
  // cena que caiba na memória
  return Array.from(new Float64Array(codigos).sort(), (c) => [Math.floor(c / n), c % n]);
}

/** Só os avisos que são PROBLEMAS — `contato-intencional` fica de fora (não
 * é algo a corrigir, é `descrever()` que resume quantos foram ignorados). */
export function avisosEmTexto(avisos: readonly Aviso[]): string {
  const problemas = avisos.filter((a) => a.tipo !== "contato-intencional");
  if (problemas.length === 0) return "";
  return problemas.map((a) => `AVISO: ${a.texto}`).join("\n");
}

/** Uma distância em metros, COM a unidade. Abaixo de 1 cm vira milímetros
 * ("0.35 mm"), e um valor diferente de zero nunca sai como zero: se nem 2
 * casas em mm bastam, cai para 2 algarismos significativos. */
function fmt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 0.01) return `${arred(v, 2).toFixed(2)} m`;
  if (v === 0) return "0 mm";
  const mm = v * 1000;
  return Math.abs(mm) >= 0.005 ? `${mm.toFixed(2)} mm` : `${mm.toPrecision(2)} mm`;
}
