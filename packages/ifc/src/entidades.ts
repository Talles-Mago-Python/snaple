/** Construtores tipados das entidades IFC4 usadas pelo exportador — um por
 * entidade, na ordem de atributos exata do schema, para não depender de
 * decorar a posição certa espalhado pelo resto do código. Fino de propósito:
 * cada função só formata; a decisão de QUANDO usar qual entidade mora em
 * `geometria.ts`/`mapear.ts`. */
import type { Ponto2D, Vec3 } from "@snaple/core";
import {
  type ArquivoIFC, DERIVADO, enumIfc, inteiro, OMITIDO, type Omitido, ref, Ref, type StepValor, tipado,
} from "./spf.ts";

const $ = OMITIDO;

// ── Geometria básica ─────────────────────────────────────────────────────

export function ponto3D(arq: ArquivoIFC, p: Vec3): Ref {
  return arq.novaEntidade("IFCCARTESIANPOINT", [[p[0], p[1], p[2]]]);
}

export function ponto2D(arq: ArquivoIFC, p: Ponto2D): Ref {
  return arq.novaEntidade("IFCCARTESIANPOINT", [[p[0], p[1]]]);
}

export function direcao3D(arq: ArquivoIFC, v: Vec3): Ref {
  return arq.novaEntidade("IFCDIRECTION", [[v[0], v[1], v[2]]]);
}

export function eixo2placement3D(
  arq: ArquivoIFC, location: Vec3, axis?: Vec3, refDirection?: Vec3,
): Ref {
  return arq.novaEntidade("IFCAXIS2PLACEMENT3D", [
    ponto3D(arq, location),
    axis ? direcao3D(arq, axis) : $,
    refDirection ? direcao3D(arq, refDirection) : $,
  ]);
}

export function eixo1placement(arq: ArquivoIFC, location: Vec3, axis: Vec3): Ref {
  return arq.novaEntidade("IFCAXIS1PLACEMENT", [ponto3D(arq, location), direcao3D(arq, axis)]);
}

export function polilinha3D(arq: ArquivoIFC, pontos: readonly Vec3[]): Ref {
  return arq.novaEntidade("IFCPOLYLINE", [pontos.map((p) => ponto3D(arq, p))]);
}

/** Polilinha FECHADA no plano de um perfil 2D: repete o primeiro ponto no
 * fim — `IfcPolyline` não tem uma flag "fechado", então fechar de verdade
 * (em vez de confiar no leitor inferir) é o que evita um perfil aberto em
 * ferramentas mais estritas. */
export function polilinhaFechada2D(arq: ArquivoIFC, pontos: readonly Ponto2D[]): Ref {
  const fechado = pontos.length && pontosIguais2D(pontos[0]!, pontos[pontos.length - 1]!)
    ? pontos
    : [...pontos, pontos[0]!];
  return arq.novaEntidade("IFCPOLYLINE", [fechado.map((p) => ponto2D(arq, p))]);
}

function pontosIguais2D(a: Ponto2D, b: Ponto2D): boolean {
  return Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;
}

// ── Placement ────────────────────────────────────────────────────────────

export function placementLocal(arq: ArquivoIFC, relativoA: Ref | null, placement: Ref): Ref {
  return arq.novaEntidade("IFCLOCALPLACEMENT", [relativoA ?? $, placement]);
}

// ── Perfis (SweptArea) ───────────────────────────────────────────────────

const AREA = () => enumIfc("AREA");

export function perfilRetangulo(arq: ArquivoIFC, xDim: number, yDim: number, position?: Ref): Ref {
  return arq.novaEntidade("IFCRECTANGLEPROFILEDEF", [AREA(), $, position ?? $, xDim, yDim]);
}

export function perfilCirculo(arq: ArquivoIFC, raio: number, position?: Ref): Ref {
  return arq.novaEntidade("IFCCIRCLEPROFILEDEF", [AREA(), $, position ?? $, raio]);
}

export function perfilElipse(arq: ArquivoIFC, semiEixo1: number, semiEixo2: number, position?: Ref): Ref {
  return arq.novaEntidade("IFCELLIPSEPROFILEDEF", [AREA(), $, position ?? $, semiEixo1, semiEixo2]);
}

export function perfilFechadoArbitrario(arq: ArquivoIFC, outerCurve: Ref): Ref {
  return arq.novaEntidade("IFCARBITRARYCLOSEDPROFILEDEF", [AREA(), $, outerCurve]);
}

export function perfilComBuracos(arq: ArquivoIFC, outerCurve: Ref, innerCurves: readonly Ref[]): Ref {
  return arq.novaEntidade("IFCARBITRARYPROFILEDEFWITHVOIDS", [AREA(), $, outerCurve, innerCurves]);
}

// ── Sólidos ──────────────────────────────────────────────────────────────

export function extrudedAreaSolid(
  arq: ArquivoIFC, sweptArea: Ref, position: Ref, extrudedDirection: Vec3, depth: number,
): Ref {
  return arq.novaEntidade("IFCEXTRUDEDAREASOLID", [
    sweptArea, position, direcao3D(arq, extrudedDirection), depth,
  ]);
}

/** `angulo` em RADIANOS — `IfcPlaneAngleMeasure` aceita qualquer real; o
 * contexto de unidades do arquivo declara a unidade de ângulo como radiano
 * (`criarUnidades`), então nenhuma conversão para grau acontece aqui. */
export function revolvedAreaSolid(
  arq: ArquivoIFC, sweptArea: Ref, position: Ref, axis: Ref, angulo: number,
): Ref {
  return arq.novaEntidade("IFCREVOLVEDAREASOLID", [sweptArea, position, axis, angulo]);
}

export function csgPrimitiveEsfera(arq: ArquivoIFC, position: Ref, raio: number): Ref {
  return arq.novaEntidade("IFCSPHERE", [position, raio]);
}

export function csgSolid(arq: ArquivoIFC, treeRootExpression: Ref): Ref {
  return arq.novaEntidade("IFCCSGSOLID", [treeRootExpression]);
}

// ── Malha tesselada (fallback) ───────────────────────────────────────────

/** `IfcFacetedBrep` sobre um `IfcClosedShell` — sem compartilhar vértice
 * entre faces (um `IfcPolyLoop` por triângulo, com seus 3 pontos próprios).
 * Gera arquivo maior que `IfcTriangulatedFaceSet`, mas é entendido por
 * QUALQUER leitor IFC desde o IFC2x3 (o outro exige IFC4 Add2); decisão
 * documentada no README do pacote. */
export function facetedBrep(arq: ArquivoIFC, triangulos: readonly (readonly [Vec3, Vec3, Vec3])[]): Ref {
  const faces = triangulos.map(([a, b, c]) => {
    const laco = arq.novaEntidade("IFCPOLYLOOP", [[ponto3D(arq, a), ponto3D(arq, b), ponto3D(arq, c)]]);
    const contorno = arq.novaEntidade("IFCFACEOUTERBOUND", [laco, true]);
    return arq.novaEntidade("IFCFACE", [[contorno]]);
  });
  const casca = arq.novaEntidade("IFCCLOSEDSHELL", [faces]);
  return arq.novaEntidade("IFCFACETEDBREP", [casca]);
}

// ── Representação / produto ──────────────────────────────────────────────

export function shapeRepresentation(
  arq: ArquivoIFC, contexto: Ref, identificador: string, tipo: string, items: readonly Ref[],
): Ref {
  return arq.novaEntidade("IFCSHAPEREPRESENTATION", [contexto, identificador, tipo, items]);
}

export function productDefinitionShape(arq: ArquivoIFC, representations: readonly Ref[]): Ref {
  return arq.novaEntidade("IFCPRODUCTDEFINITIONSHAPE", [$, $, representations]);
}

// ── Estrutura espacial ───────────────────────────────────────────────────

export interface AtributosRaiz {
  guid: string;
  nome?: string;
}

export function projeto(
  arq: ArquivoIFC, a: AtributosRaiz, contexto: Ref, unidades: Ref,
): Ref {
  return arq.novaEntidade("IFCPROJECT", [
    a.guid, $, a.nome ?? $, $, $, $, $, [contexto], unidades,
  ]);
}

export function site(arq: ArquivoIFC, a: AtributosRaiz, placement: Ref): Ref {
  return arq.novaEntidade("IFCSITE", [
    a.guid, $, a.nome ?? $, $, $, placement, $, $, enumIfc("ELEMENT"), $, $, $, $, $,
  ]);
}

export function building(arq: ArquivoIFC, a: AtributosRaiz, placement: Ref): Ref {
  return arq.novaEntidade("IFCBUILDING", [
    a.guid, $, a.nome ?? $, $, $, placement, $, $, enumIfc("ELEMENT"), $, $, $,
  ]);
}

export function buildingStorey(arq: ArquivoIFC, a: AtributosRaiz, placement: Ref, elevacao: number): Ref {
  return arq.novaEntidade("IFCBUILDINGSTOREY", [
    a.guid, $, a.nome ?? $, $, $, placement, $, $, enumIfc("ELEMENT"), elevacao,
  ]);
}

export function relAggregates(
  arq: ArquivoIFC, guid: string, relatingObject: Ref, relatedObjects: readonly Ref[],
): Ref {
  return arq.novaEntidade("IFCRELAGGREGATES", [guid, $, $, $, relatingObject, relatedObjects]);
}

export function relContainedInSpatialStructure(
  arq: ArquivoIFC, guid: string, relatedElements: readonly Ref[], relatingStructure: Ref,
): Ref {
  return arq.novaEntidade("IFCRELCONTAINEDINSPATIALSTRUCTURE", [
    guid, $, $, $, relatedElements, relatingStructure,
  ]);
}

/** Template comum a `IfcBuildingElementProxy`/`IfcFurniture`/`IfcColumn`/
 * `IfcBeam`/`IfcMember`/`IfcPlate`/`IfcRailing`/`IfcWall`/`IfcSlab`/
 * `IfcCovering`/`IfcFooting` no IFC4: todos têm exatamente
 * `(GlobalId,OwnerHistory,Name,Description,ObjectType,ObjectPlacement,
 * Representation,Tag,PredefinedType)`. `tipoIfc` escolhe a entidade; ver
 * `mapear.ts` para a lista curada e por que ela para exatamente aqui (fora
 * dela os atributos deixam de bater com este template). */
export function elementoBIM(
  arq: ArquivoIFC, tipoIfc: string, a: AtributosRaiz, placement: Ref, shape: Ref, tag?: string,
): Ref {
  return arq.novaEntidade(tipoIfc.toUpperCase(), [
    a.guid, $, a.nome ?? $, $, $, placement, shape, tag ?? $, $,
  ]);
}

// ── Unidades e contexto de representação ──────────────────────────────────

function unidadeSI(arq: ArquivoIFC, tipo: string, nome: string): Ref {
  // `Dimensions` é DERIVADO em `IfcSIUnit` (o schema o calcula do
  // `UnitType`) — `*`, não `$` (ver `Derivado` em spf.ts).
  return arq.novaEntidade("IFCSIUNIT", [DERIVADO, enumIfc(tipo), $, enumIfc(nome)]);
}

export function unidades(arq: ArquivoIFC): Ref {
  const comprimento = unidadeSI(arq, "LENGTHUNIT", "METRE");
  const angulo = unidadeSI(arq, "PLANEANGLEUNIT", "RADIAN");
  const area = unidadeSI(arq, "AREAUNIT", "SQUARE_METRE");
  const volume = unidadeSI(arq, "VOLUMEUNIT", "CUBIC_METRE");
  return arq.novaEntidade("IFCUNITASSIGNMENT", [[comprimento, angulo, area, volume]]);
}

export function contextoGeometrico(arq: ArquivoIFC): Ref {
  const origem = eixo2placement3D(arq, [0, 0, 0]);
  return arq.novaEntidade("IFCGEOMETRICREPRESENTATIONCONTEXT", [
    $, "Model", inteiro(3), 1e-5, origem, $,
  ]);
}

// ── Material ─────────────────────────────────────────────────────────────

export function corRGB(arq: ArquivoIFC, r: number, g: number, b: number): Ref {
  return arq.novaEntidade("IFCCOLOURRGB", [$, r, g, b]);
}

export function estiloSuperficieRendering(
  arq: ArquivoIFC, cor: Ref, transparencia: number,
): Ref {
  return arq.novaEntidade("IFCSURFACESTYLERENDERING", [
    cor, transparencia, $, $, $, $, $, $, enumIfc("NOTDEFINED"),
  ]);
}

export function estiloSuperficie(arq: ArquivoIFC, nome: string | undefined, rendering: Ref): Ref {
  return arq.novaEntidade("IFCSURFACESTYLE", [nome ?? $, enumIfc("BOTH"), [rendering]]);
}

export function itemEstilizado(arq: ArquivoIFC, item: Ref, estilo: Ref): Ref {
  return arq.novaEntidade("IFCSTYLEDITEM", [item, [estilo], $]);
}

export { ref, tipado, type Ref, type StepValor, type Omitido };
