/** O "linter de cena": validação semântica que roda sobre o estado, sem
 * render.
 *
 * São sempre AVISOS, nunca bloqueios — interpenetração pode ser deliberada
 * (um prego cravado numa tábua), e a lib não tem como saber. Saem em duas
 * formas: array estruturado (para código) e texto (para um LLM ler). */
import { sobreposicao, sobrepoeNoPlano } from "./bbox.ts";
import { type OBB, obbDoNo, obbsSeSobrepoem } from "./obb.ts";
import { erroDoAcoplamento } from "./acoplamento.ts";
import { saoParentes } from "./mundo.ts";
import { percorrer } from "./no.ts";
import type { Cena } from "./cena.ts";
import type { ParamsJunta } from "./tipos.ts";
import { type Eixo, type IndiceEixo, arred } from "./vetor.ts";

/** Folga abaixo da qual duas bboxes "só se tocam" em vez de penetrar. */
export const TOL_CONTATO = 1e-6;
/** Distância abaixo da qual dois centros são considerados coincidentes. */
export const TOL_CENTROS = 0.03;
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

  for (let i = 0; i < nos.length; i++) {
    for (let j = i + 1; j < nos.length; j++) {
      const a = nos[i]!, b = nos[j]!;
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
        const sobrepoeDeVerdade = obbA && obbB ? obbsSeSobrepoem(obbA, obbB) : true;
        if (sobrepoeDeVerdade) {
          if (contatoPermitido(a, b)) {
            avisos.push({
              tipo: "contato-intencional",
              nos: [a.no.id, b.no.id],
              texto: `${a.no.id} e ${b.no.id} se sobrepõem, mas o contato foi declarado intencional`,
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
              texto: `${a.no.id} penetra ${b.no.id} em ${fmt(s[menor]!)} m no eixo ${NOME_EIXO[menor]}`,
            });
          }
        }
      }
      const d = Math.hypot(
        ca.centro[0] - cb.centro[0], ca.centro[1] - cb.centro[1], ca.centro[2] - cb.centro[2],
      );
      if (d < TOL_CENTROS) {
        avisos.push({
          tipo: "centros-coincidentes",
          nos: [a.no.id, b.no.id],
          distancia: d,
          texto: `${a.no.id} e ${b.no.id} têm praticamente o mesmo centro (${fmt(d)} m de distância) — provável erro de posicionamento`,
        });
      }
    }
  }

  for (const m of nos) {
    const caixa = m.propria!;
    if (caixa.min[1]! <= TOL_CHAO) continue;
    if (nosComAcoplamento.has(m.no.id)) continue; // apoio/articulação já declarados
    const temApoio = nos.some((outro) => {
      if (outro.no.id === m.no.id) return false;
      const c = outro.propria!;
      // apoia se encosta por baixo (ou já sobrepõe) e cobre em XZ
      if (c.max[1]! < caixa.min[1]! - TOL_CONTATO) return false;
      if (c.min[1]! > caixa.min[1]! + TOL_CONTATO) return false;
      return sobrepoeNoPlano(caixa, c, 1, TOL_CONTATO);
    });
    if (!temApoio) {
      avisos.push({
        tipo: "flutuando",
        no: m.no.id,
        altura: caixa.min[1]!,
        texto: `${m.no.id} flutua ${fmt(caixa.min[1]!)} m acima do chão, sem nada embaixo`,
      });
    }
  }

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
        texto: `${no.id}: ângulo ${emGraus(p.angulo)} fora do limite [${emGraus(min)}, ${emGraus(max)}]`,
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
        texto: `${ac.tipo} '${ac.id}'${ac.nome ? ` (${ac.nome})` : ""} entre ${ac.a.no} e ${ac.b.no}: ` +
          `${fmt(erroPosicao)} m de posição, ${emGraus(erroAngulo)} de ângulo`,
      });
    }
  }

  return avisos;
}

/** Só os avisos que são PROBLEMAS — `contato-intencional` fica de fora (não
 * é algo a corrigir, é `descrever()` que resume quantos foram ignorados). */
export function avisosEmTexto(avisos: readonly Aviso[]): string {
  const problemas = avisos.filter((a) => a.tipo !== "contato-intencional");
  if (problemas.length === 0) return "";
  return problemas.map((a) => `AVISO: ${a.texto}`).join("\n");
}

function fmt(v: number): string {
  return arred(v, 4).toFixed(Math.abs(v) < 0.01 ? 4 : 2);
}
