/** O "linter de cena": validação semântica que roda sobre o estado, sem
 * render.
 *
 * São sempre AVISOS, nunca bloqueios — interpenetração pode ser deliberada
 * (um prego cravado numa tábua), e a lib não tem como saber. Saem em duas
 * formas: array estruturado (para código) e texto (para um LLM ler). */
import { sobreposicao, sobrepoeNoPlano } from "./bbox.ts";
import { saoParentes } from "./mundo.ts";
import type { Cena } from "./cena.ts";
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

export type Aviso = AvisoInterpenetracao | AvisoFlutuando | AvisoCentrosCoincidentes;

const NOME_EIXO: readonly Eixo[] = ["x", "y", "z"];

export function avisosDaCena(cena: Cena): Aviso[] {
  const nos = cena.nosGeometricos();
  const mundo = cena.mundo();
  const avisos: Aviso[] = [];

  for (let i = 0; i < nos.length; i++) {
    for (let j = i + 1; j < nos.length; j++) {
      const a = nos[i]!, b = nos[j]!;
      if (saoParentes(mundo, a.no.id, b.no.id)) continue;
      const ca = a.propria!, cb = b.propria!;
      const s = sobreposicao(ca, cb);
      if (s[0]! > TOL_CONTATO && s[1]! > TOL_CONTATO && s[2]! > TOL_CONTATO) {
        // o eixo de MENOR sobreposição é a distância mínima de separação
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

  return avisos;
}

export function avisosEmTexto(avisos: readonly Aviso[]): string {
  if (avisos.length === 0) return "";
  return avisos.map((a) => `AVISO: ${a.texto}`).join("\n");
}

function fmt(v: number): string {
  return arred(v, 4).toFixed(Math.abs(v) < 0.01 ? 4 : 2);
}
