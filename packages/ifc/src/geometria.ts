/** `GeometriaDerivada` (core) → itens de representação IFC (sólidos
 * paramétricos ou malha tesselada de fallback). Ver `packages/ifc/README.md`
 * para a tabela de mapeamento completa e a justificativa de cada escolha;
 * este arquivo só implementa as decisões já tomadas lá.
 *
 * Recorrente em todo este arquivo: um sólido de extrusão/revolução é
 * definido usando as coordenadas LOCAIS do próprio nó diretamente (a mesma
 * convenção que o `ObjectPlacement` do nó, montado em `mapear.ts`, já sabe
 * orientar no mundo Z-up) — nenhuma conversão de eixo acontece aqui dentro.
 * A ÚNICA exceção é a extrusão (`box`/`cylinder` reto/`plane`/`extrude`,
 * com ou sem furo): o core devolve o contorno no referencial NATIVO de um
 * extrusor (perfil em XY, extrusão em +Z — o mesmo contrato que
 * `@snaple/three` consome, ver `GeometriaExtrusao.rotacao`), então a mesma
 * rotação (`d.rotacao`) que o backend Three.js aplica à malha depois de
 * construí-la é aplicada aqui ao `Position`/`ExtrudedDirection` do sólido —
 * o resultado final ainda está inteiramente em coordenadas locais do nó. */
import {
  baseDeEuler, derivarGeometria, num,
  type Cena, type GeometriaExtrusao, type GeometriaRevolucao, type GeometriaHelice,
  type No, type ParamsBox, type ParamsCone, type ParamsCylinder, type ParamsPlane,
  type ParamsSphere, type ParamsTorus, type Ponto2D, type Vec3,
} from "@snaple/core";
import {
  csgPrimitiveEsfera, csgSolid, eixo1placement, eixo2placement3D,
  extrudedAreaSolid, facetedBrep, perfilCirculo, perfilComBuracos, perfilElipse,
  perfilFechadoArbitrario, perfilRetangulo, polilinhaFechada2D, revolvedAreaSolid,
} from "./entidades.ts";
import type { ArquivoIFC, Ref } from "./spf.ts";
import {
  tesselarEsfera, tesselarHelice, tesselarLathe, tesselarPlano, tesselarSweep, tesselarToro,
  tesselarTroncoCone,
} from "./tessellar.ts";

const TOL = 1e-6;

function proximos(a: number, b: number): boolean {
  return Math.abs(a - b) < TOL * Math.max(1, Math.abs(a), Math.abs(b));
}

function escalarV(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

/** Mesma rotação de `REFERENCIAL.y.rotacao` em `packages/core/src/geometria.ts`
 * (símbolo interno, não exportado): leva o referencial nativo de extrusão
 * (perfil em XY, extrusão em +Z) para o eixo Y local — a convenção de
 * `box`/`cylinder` reto/`plane`/`model` (proxy). Duplicada aqui de
 * propósito: é uma constante do próprio FORMATO de extrusão (documentado em
 * `spec/README.md`), não um detalhe do backend Three.js — replicar 3
 * números evita depender de um símbolo que o core não exporta. */
const ROTACAO_EIXO_Y: Vec3 = [-Math.PI / 2, 0, 0];

/** Projeta a escala do nó (nos eixos locais x/y/z) nos eixos U/V/extrusão
 * de uma forma nativa rotacionada por `rotacaoEuler`. Como todo referencial
 * de extrusão do core é alinhado a eixo (cada `X`/`Y` é ±1 num só
 * componente — ver a tabela `REFERENCIAL`), a projeção nunca introduz
 * cisalhamento: é sempre exatamente um dos três fatores de escala do nó. */
function escalasDoEixo(rotacaoEuler: Vec3, escala: Vec3): { su: number; sv: number; sw: number } {
  const { ex, ey, ez } = baseDeEuler(rotacaoEuler);
  const proj = (e: Vec3) => Math.abs(e[0]) * escala[0] + Math.abs(e[1]) * escala[1] + Math.abs(e[2]) * escala[2];
  return { su: proj(ex), sv: proj(ey), sw: proj(ez) };
}

function escalaUniformeXZ(escala: Vec3): boolean {
  return proximos(escala[0], escala[2]);
}

function escalaUniforme3(escala: Vec3): boolean {
  return proximos(escala[0], escala[1]) && proximos(escala[1], escala[2]);
}

// ── Extrusão genérica (box/cylinder reto/plane com furo, extrude) ────────

/** Uma fatia (`ParteExtrusao`) → um `IfcExtrudedAreaSolid`. Furo de
 * profundidade parcial vira mais de uma fatia (mesmo motivo do backend
 * Three.js: cada trecho do eixo com um conjunto de furos ativos diferente é
 * uma extrusão própria — ver `geometria.ts` do core). */
function criarParteExtrudida(
  arq: ArquivoIFC, contorno: readonly Ponto2D[], furos: readonly (readonly Ponto2D[])[],
  altura: number, deslocamento: number, rotacaoEuler: Vec3, su: number, sv: number, sw: number,
): Ref {
  const { ex, ez } = baseDeEuler(rotacaoEuler);
  // superfície sem espessura (plane furado): extrude uma placa de 0,1 mm em
  // vez de uma face pura — decisão registrada no README (reaproveita este
  // mesmo caminho de extrusão-com-voids em vez de um triangulador de
  // polígono-com-buracos à parte só para este caso raro).
  const ESPESSURA_MINIMA = 1e-4;
  const alturaBruta = altura * sw;
  const alturaEsc = alturaBruta > TOL ? alturaBruta : (furos.length ? ESPESSURA_MINIMA : 0);
  const deslocEsc = deslocamento * sw;
  const location = escalarV(ez, deslocEsc - alturaEsc / 2);
  const position = eixo2placement3D(arq, location, ez, ex);
  const escalarPonto = ([u, v]: Ponto2D): Ponto2D => [u * su, v * sv];
  const outer = polilinhaFechada2D(arq, contorno.map(escalarPonto));
  const perfil = furos.length
    ? perfilComBuracos(arq, outer, furos.map((f) => polilinhaFechada2D(arq, f.map(escalarPonto))))
    : perfilFechadoArbitrario(arq, outer);
  return extrudedAreaSolid(arq, perfil, position, ez, alturaEsc);
}

function representarExtrusao(arq: ArquivoIFC, d: GeometriaExtrusao, escala: Vec3): ResultadoGeometria {
  const { su, sv, sw } = escalasDoEixo(d.rotacao, escala);
  const items = d.partes.map((p) =>
    criarParteExtrudida(arq, p.contorno, p.furos, p.altura, p.deslocamento, d.rotacao, su, sv, sw));
  return { items, tipoRepresentacao: "SweptSolid" };
}

// ── Primitivas exatas ──────────────────────────────────────────────────

function representarBox(arq: ArquivoIFC, p: ParamsBox, escala: Vec3): Ref[] {
  const { su, sv, sw } = escalasDoEixo(ROTACAO_EIXO_Y, escala);
  const { ex, ez } = baseDeEuler(ROTACAO_EIXO_Y);
  const largura = num(p.largura, 1) * su, profundidade = num(p.profundidade, 1) * sv, altura = num(p.altura, 1) * sw;
  const position = eixo2placement3D(arq, escalarV(ez, -altura / 2), ez, ex);
  const perfil = perfilRetangulo(arq, largura, profundidade);
  return [extrudedAreaSolid(arq, perfil, position, ez, altura)];
}

function representarCilindroReto(arq: ArquivoIFC, raio: number, altura: number, escala: Vec3): Ref[] {
  const { su, sv, sw } = escalasDoEixo(ROTACAO_EIXO_Y, escala);
  const { ex, ez } = baseDeEuler(ROTACAO_EIXO_Y);
  const alturaEsc = altura * sw;
  const position = eixo2placement3D(arq, escalarV(ez, -alturaEsc / 2), ez, ex);
  const perfil = proximos(su, sv) ? perfilCirculo(arq, raio * su) : perfilElipse(arq, raio * su, raio * sv);
  return [extrudedAreaSolid(arq, perfil, position, ez, alturaEsc)];
}

function representarCylinder(arq: ArquivoIFC, p: ParamsCylinder, escala: Vec3): ResultadoGeometria {
  const raioTopo = num(p.raioTopo, 1), raioBase = num(p.raioBase, 1), altura = num(p.altura, 1);
  if (proximos(raioTopo, raioBase)) {
    return { items: representarCilindroReto(arq, raioTopo, altura, escala), tipoRepresentacao: "SweptSolid" };
  }
  // tronco de cone: sem entidade IFC direta (nem `IfcRightCircularCone` nem
  // extrusão servem, a seção não é constante) — tesselado sempre, escala
  // qualquer, exatamente como o item 3 do README pede.
  const tris = tesselarTroncoCone(raioTopo, raioBase, altura, num(p.segmentos, 32), escala);
  return { items: [facetedBrep(arq, tris)], tipoRepresentacao: "Brep" };
}

/** `cone` como REVOLUÇÃO de um perfil triangular (ápice + base), não como
 * `IfcCsgSolid(IfcRightCircularCone)`. Os dois são geometricamente
 * equivalentes e ambos válidos no schema — a escolha não é por precisão,
 * é por COMPATIBILIDADE, verificada de verdade (não suposta): o validador
 * de schema (`ifcopenshell.validate`) aceita as duas formas, mas o motor de
 * geometria (`ifcopenshell.geom`, OpenCASCADE) falha ao triangular
 * `IfcRightCircularCone` dentro de `IfcCsgSolid` assim que ele é o
 * `Representation` de um `IfcProduct` — mesmo com placement IDENTIDADE, sem
 * nenhuma rotação envolvida (reproduzido isolado antes desta decisão, ver
 * `packages/ifc/README.md`). `IfcRevolvedAreaSolid` (mesma família de
 * `lathe`, `SweptAreaSolid`) passa no mesmo teste sem problema — é o
 * caminho de sólidos mais maduro em qualquer motor de geometria IFC, então
 * é ele que este exportador usa sempre que a base continua circular. */
function representarCone(arq: ArquivoIFC, p: ParamsCone, escala: Vec3): ResultadoGeometria {
  const raio = num(p.raio, 1), altura = num(p.altura, 1);
  if (escalaUniformeXZ(escala)) {
    const s = escala[0], sy = escala[1];
    const alturaEsc = altura * sy, raioEsc = raio * s;
    const perfil = perfilFechadoArbitrario(arq, polilinhaFechada2D(arq, [
      [0, -alturaEsc / 2], [raioEsc, -alturaEsc / 2], [0, alturaEsc / 2],
    ]));
    const position = eixo2placement3D(arq, [0, 0, 0]);
    const eixoRevolucao = eixo1placement(arq, [0, 0, 0], [0, 1, 0]);
    return { items: [revolvedAreaSolid(arq, perfil, position, eixoRevolucao, Math.PI * 2)], tipoRepresentacao: "SweptSolid" };
  }
  // escala não-uniforme no plano XZ: a base deixa de ser um círculo (vira
  // elipse) e a revolução em torno de um único eixo não representa isso —
  // perda documentada no README, tesselado em vez de aproximado errado.
  const tris = tesselarTroncoCone(0, raio, altura, num(p.segmentos, 32), escala);
  return { items: [facetedBrep(arq, tris)], tipoRepresentacao: "Brep" };
}

function representarEsfera(arq: ArquivoIFC, p: ParamsSphere, escala: Vec3): ResultadoGeometria {
  const raio = num(p.raio, 1);
  if (escalaUniforme3(escala)) {
    const position = eixo2placement3D(arq, [0, 0, 0]);
    return { items: [csgSolid(arq, csgPrimitiveEsfera(arq, position, raio * escala[0]))], tipoRepresentacao: "CSG" };
  }
  const tris = tesselarEsfera(raio, num(p.segmentos, 32), escala);
  return { items: [facetedBrep(arq, tris)], tipoRepresentacao: "Brep" };
}

function representarPlano(arq: ArquivoIFC, p: ParamsPlane, escala: Vec3): Ref[] {
  const tris = tesselarPlano(num(p.largura, 1), num(p.profundidade, 1), escala);
  return [facetedBrep(arq, tris)];
}

function representarToro(arq: ArquivoIFC, p: ParamsTorus, escala: Vec3): Ref[] {
  const tris = tesselarToro(num(p.raio, 1), num(p.raioTubo, 0.25), num(p.segmentos, 32), num(p.segmentosTubo, 16), escala);
  return [facetedBrep(arq, tris)];
}

function representarModelo(arq: ArquivoIFC, tamanho: Vec3, escala: Vec3): Ref[] {
  const { su, sv, sw } = escalasDoEixo(ROTACAO_EIXO_Y, escala);
  const { ex, ez } = baseDeEuler(ROTACAO_EIXO_Y);
  const largura = tamanho[0] * su, profundidade = tamanho[2] * sv, altura = tamanho[1] * sw;
  const position = eixo2placement3D(arq, escalarV(ez, -altura / 2), ez, ex);
  const perfil = perfilRetangulo(arq, largura, profundidade);
  return [extrudedAreaSolid(arq, perfil, position, ez, altura)];
}

// ── Revolução (lathe) ──────────────────────────────────────────────────

function representarLathe(arq: ArquivoIFC, d: GeometriaRevolucao, escala: Vec3): ResultadoGeometria {
  if (escalaUniformeXZ(escala)) {
    const s = escala[0], sy = escala[1];
    const pontos = d.perfil.map(([raio, altura]) => [raio * s, altura * sy] as Ponto2D);
    // o perfil é fechado como ÁREA antes de revolver (decisão registrada no
    // README): `IfcRevolvedAreaSolid` varre um sólido, não uma casca aberta
    // como o `LatheGeometry` do backend Three.js.
    const perfil = perfilFechadoArbitrario(arq, polilinhaFechada2D(arq, pontos));
    const position = eixo2placement3D(arq, [0, 0, 0]);
    const eixoRevolucao = eixo1placement(arq, [0, 0, 0], [0, 1, 0]);
    return { items: [revolvedAreaSolid(arq, perfil, position, eixoRevolucao, Math.PI * 2)], tipoRepresentacao: "SweptSolid" };
  }
  const tris = tesselarLathe(d.perfil, d.segmentos, escala);
  return { items: [facetedBrep(arq, tris)], tipoRepresentacao: "Brep" };
}

function representarHelice(arq: ArquivoIFC, d: GeometriaHelice, escala: Vec3): Ref[] {
  const tris = tesselarHelice(d.raio, d.raioTubo, d.passo, d.voltas, d.segmentosPorVolta, d.segmentosTubo, escala);
  return [facetedBrep(arq, tris)];
}

// ── Dispatch ─────────────────────────────────────────────────────────────

/** `IfcShapeRepresentation.RepresentationType` correto para cada família de
 * item — precisa bater com o que `mapear.ts` declara, senão a
 * representação sai formalmente inválida mesmo com a geometria certa.
 * `Brep` é sempre a malha facetada de fallback (ver README, tabela de
 * mapeamento) — é o que `mapear.ts` usa para decidir se avisa. */
export type TipoRepresentacao = "SweptSolid" | "CSG" | "Brep";

export interface ResultadoGeometria {
  items: Ref[];
  tipoRepresentacao: TipoRepresentacao;
}

export function representarGeometria(arq: ArquivoIFC, cena: Cena, no: No, escala: Vec3): ResultadoGeometria {
  const d = derivarGeometria(cena, no);
  switch (d.tipo) {
    case "vazia":
      return { items: [], tipoRepresentacao: "SweptSolid" };
    case "modelo":
      return { items: representarModelo(arq, d.tamanho, escala), tipoRepresentacao: "SweptSolid" };
    case "extrusao":
      return representarExtrusao(arq, d, escala);
    case "revolucao":
      return representarLathe(arq, d, escala);
    case "helice":
      return { items: representarHelice(arq, d, escala), tipoRepresentacao: "Brep" };
    case "varredura":
      return { items: [facetedBrep(arq, tesselarSweep(d, escala))], tipoRepresentacao: "Brep" };
    case "primitiva":
      switch (d.primitiva) {
        case "box":
          return { items: representarBox(arq, d.params as unknown as ParamsBox, escala), tipoRepresentacao: "SweptSolid" };
        case "cylinder":
          return representarCylinder(arq, d.params as unknown as ParamsCylinder, escala);
        case "cone":
          return representarCone(arq, d.params as unknown as ParamsCone, escala);
        case "sphere":
          return representarEsfera(arq, d.params as unknown as ParamsSphere, escala);
        case "plane":
          return { items: representarPlano(arq, d.params as unknown as ParamsPlane, escala), tipoRepresentacao: "Brep" };
        case "torus":
          return { items: representarToro(arq, d.params as unknown as ParamsTorus, escala), tipoRepresentacao: "Brep" };
        default:
          throw new Error(`primitiva sem tradução IFC: '${d.primitiva}'`);
      }
    default: {
      const _e: never = d;
      throw new Error(`geometria derivada desconhecida: ${JSON.stringify(_e)}`);
    }
  }
}
