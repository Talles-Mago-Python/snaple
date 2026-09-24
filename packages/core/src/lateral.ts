/** Colocação em superfícies de revolução (`cylinder`/`lathe`) — o análogo de
 * `Face` para uma superfície CURVA em vez de um plano. Uma face plana usa
 * `(u, v)`; aqui o plano de trabalho é `(ângulo, altura)` ao redor do eixo
 * `+y` local do dono, e "para fora" significa a normal real da superfície
 * naquele ponto — radial num cilindro reto, inclinada num tronco de cone ou
 * ao longo do perfil de um `lathe`.
 *
 * Convenção de ângulo: a mesma do backend (`THREE.LatheGeometry`/
 * `CylinderGeometry`) — `x = raio·sin(ângulo)`, `z = raio·cos(ângulo)` — para
 * que `ângulo` corresponda de verdade a onde a malha renderizada está, não a
 * uma convenção própria deste módulo. */
import type { AlvoNo, Cena, NoRef } from "./cena.ts";
import { caixaLocalPropria } from "./bbox.ts";
import { apontar } from "./orientacao.ts";
import { baseDeEuler } from "./matriz.ts";
import type { No, ParamsCone, ParamsCylinder, ParamsLathe } from "./tipos.ts";
import { type Ponto2D, type Vec3, EPS, num, produtoEscalar } from "./vetor.ts";

export interface OpcoesLateralColocar {
  /** Radianos ao redor do eixo +y local do dono. 0 = `+z` local (mesma
   * convenção do backend), crescente no sentido de `+z` para `+x`. */
  angulo: number;
  /** Altura no eixo +y local do dono — mesmo referencial dos parâmetros do
   * dono (`cylinder`: `-altura/2..+altura/2`; `lathe`: as alturas do
   * próprio perfil, já ajustadas por `recentrar`). */
  altura: number;
  /** Folga entre a superfície e a base do alvo, ao longo da normal. Padrão
   * 0 (encosta exatamente). */
  afastamento?: number;
  /** `false` mantém a rotação atual do alvo em vez de orientá-lo para fora
   * da superfície. Padrão `true`. */
  orientar?: boolean;
  /** `false` não adota o alvo como filho do dono. Padrão `true`. */
  reparentar?: boolean;
}

/** Perfil `(raio, altura)` equivalente do dono, no MESMO referencial local
 * que `caixaLocalPropria`/a malha real usam (já resolvendo `recentrar` para
 * `lathe`). Um `cylinder` é um `lathe` de 2 pontos (e um `cone`, um de raio
 * zero no topo), por isso os três tipos compartilham toda a geometria de
 * `Lateral` a partir daqui. */
export function perfilEfetivo(no: No): Ponto2D[] {
  if (no.tipo === "cone") {
    const p = no.params as ParamsCone;
    const h = num(p.altura, 1) / 2;
    return [[num(p.raio, 1), -h], [0, h]];
  }
  if (no.tipo === "cylinder") {
    const p = no.params as ParamsCylinder;
    const h = num(p.altura, 1) / 2;
    return [[num(p.raioBase, 1), -h], [num(p.raioTopo, 1), h]];
  }
  if (no.tipo === "lathe") {
    const p = no.params as ParamsLathe;
    const pts = p.perfil ?? [];
    const ys = pts.map((pt) => num(pt[1]));
    const meio = p.recentrar === false || ys.length === 0 ? 0 : (Math.min(...ys) + Math.max(...ys)) / 2;
    return pts.map((pt) => [Math.abs(num(pt[0])), num(pt[1]) - meio]);
  }
  throw new Error(
    `lateral() só existe em 'cylinder', 'cone' e 'lathe' (superfícies de revolução) — '${no.id}' é '${no.tipo}'`,
  );
}

/** Raio e normal 2D (no plano raio×altura) no ponto `altura` do perfil,
 * andando os segmentos NA ORDEM do perfil (que pode não ser monótono em Y —
 * a cúpula de uma luminária sobe e desce). Fica com o PRIMEIRO segmento cujo
 * intervalo de altura contém o ponto pedido. */
function pontoNoPerfil(perfil: Ponto2D[], altura: number): { raio: number; normal2D: Ponto2D } {
  for (let i = 0; i < perfil.length - 1; i++) {
    const [r0, y0] = perfil[i]!;
    const [r1, y1] = perfil[i + 1]!;
    const yMin = Math.min(y0, y1), yMax = Math.max(y0, y1);
    if (altura < yMin - EPS * 1e3 || altura > yMax + EPS * 1e3) continue;
    const dy = y1 - y0;
    const t = Math.abs(dy) < EPS ? 0 : (altura - y0) / dy;
    const raio = r0 + (r1 - r0) * t;
    const dr = r1 - r0;
    const comp = Math.hypot(dr, dy) || 1;
    let nr = dy / comp, ny = -dr / comp; // perpendicular à tangente do segmento
    if (nr < 0) { nr = -nr; ny = -ny; } // convenciona a normal para FORA (raio crescente)
    return { raio, normal2D: [nr, ny] };
  }
  const ys = perfil.map((p) => p[1]);
  throw new Error(
    `altura ${altura} fora do perfil (vai de ${Math.min(...ys)} a ${Math.max(...ys)})`,
  );
}

/** Menor projeção dos 8 cantos da caixa local (girada por `rotacao`, ainda
 * NÃO transladada) sobre `direcao` — quanto a caixa alcança "para trás" do
 * seu próprio centro, na direção oposta a `direcao`. É o que permite
 * encostar a base do alvo exatamente no ponto da superfície, do mesmo jeito
 * que `Face` faz para um plano. */
function menorProjecao(caixa: { min: Vec3; max: Vec3 }, rotacao: Vec3, direcao: Vec3): number {
  const b = baseDeEuler(rotacao);
  let menor = Infinity;
  for (const sx of [caixa.min[0], caixa.max[0]]) {
    for (const sy of [caixa.min[1], caixa.max[1]]) {
      for (const sz of [caixa.min[2], caixa.max[2]]) {
        const mundo: Vec3 = [
          b.ex[0] * sx + b.ey[0] * sy + b.ez[0] * sz,
          b.ex[1] * sx + b.ey[1] * sy + b.ez[1] * sz,
          b.ex[2] * sx + b.ey[2] * sy + b.ez[2] * sz,
        ];
        const proj = produtoEscalar(mundo, direcao);
        if (proj < menor) menor = proj;
      }
    }
  }
  return menor;
}

export class Lateral {
  readonly cena: Cena;
  readonly idDono: string;

  constructor(cena: Cena, idDono: string) {
    this.cena = cena;
    this.idDono = idDono;
  }

  get dono(): No { return this.cena.no(this.idDono); }

  /** Ponto (posição local) e normal (direção local, unitária) da superfície
   * do dono no `(ângulo, altura)` pedidos — para quem só quer a geometria,
   * sem colocar nada lá. */
  ponto(angulo: number, altura: number): { posicao: Vec3; normal: Vec3 } {
    const { raio, normal2D } = pontoNoPerfil(perfilEfetivo(this.dono), altura);
    const sa = Math.sin(angulo), ca = Math.cos(angulo);
    return {
      posicao: [raio * sa, altura, raio * ca],
      normal: [normal2D[0] * sa, normal2D[1], normal2D[0] * ca],
    };
  }

  /** Posiciona `alvo` na superfície: a base dele encosta EXATAMENTE no ponto
   * `(ângulo, altura)` e ele nasce orientado para fora — mesma garantia de
   * `Face.colocar`, sem CSG e sem o chamador calcular a normal à mão. */
  colocar(alvo: AlvoNo | NoRef, opcoes: OpcoesLateralColocar): NoRef {
    const cena = this.cena;
    const no = cena.no(alvo as AlvoNo);
    if (no.id === this.idDono) throw new Error(`'${no.id}' não pode ser colocado na própria superfície`);
    if (opcoes.reparentar !== false && cena.paiDe(no.id)?.id !== this.idDono) {
      cena.reparentar(no.id, this.idDono);
    }
    const { posicao, normal } = this.ponto(opcoes.angulo, opcoes.altura);
    const ref = cena.ref(no.id);
    if (opcoes.orientar !== false) apontar(ref, normal, { eixo: "y" });

    const caixa = caixaLocalPropria(no);
    const gap = num(opcoes.afastamento, 0);
    if (caixa) {
      const menor = menorProjecao(caixa, no.transform.rotacao, normal);
      const k = gap - menor;
      cena.transformar(no.id, { posicao: [posicao[0] + normal[0] * k, posicao[1] + normal[1] * k, posicao[2] + normal[2] * k] });
    } else {
      cena.transformar(no.id, { posicao });
    }
    return ref;
  }
}
