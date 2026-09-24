/** Hierarquia espacial mínima + placement/elemento por nó.
 *
 * DECISÃO (item 1 do enunciado): a árvore do snaple é achatada. Cada nó
 * geométrico vira um elemento IRMÃO dentro de uma `IfcBuildingStorey` única,
 * com o PRÓPRIO placement absoluto (calculado a partir do `mundo()` já
 * resolvido pelo core) — em vez de tentar espelhar pai/filho como
 * `IfcLocalPlacement`s aninhados. Duas razões:
 *
 *  1. Escala não tem representação em `IfcLocalPlacement` (o placement do
 *     IFC é uma transformação rígida — posição + rotação, sem fator de
 *     escala). Um `row`/`grupo` escalado no snaple escala a subárvore
 *     inteira; reproduzir isso como composição de placements aninhados
 *     exigiria decompor escala em cada nível e reaplicá-la na geometria dos
 *     descendentes, o que é exatamente o que o `mundo()` do core JÁ faz.
 *     Usar o resultado pronto (`NoMundo.matriz`) em vez de recompor a mesma
 *     conta é mais simples E mais correto (mesma fonte de verdade que
 *     `bboxPropria()`, que é o que os testes deste pacote conferem).
 *  2. Containers (`grupo`/`row`/`column`/`stack`/`junta`) não têm geometria
 *     própria — não haveria elemento IFC para eles de qualquer forma
 *     (`nosGeometricos()` já os exclui). Uma hierarquia aninhada de
 *     `IfcLocalPlacement`s só faz sentido para agrupar elementos que TÊM
 *     representação; aqui, achatado é estruturalmente mais simples sem
 *     perder nenhuma posição (o placement absoluto de cada elemento já
 *     reflete toda a cadeia de transforms que ele tinha no snaple).
 *
 * Isso é válido IFC — muitos exportadores de ferramentas paramétricas geram
 * exatamente isto (elementos soltos com placement absoluto sob uma única
 * storey). O que se perde é a semântica de agrupamento ("estas 4 peças eram
 * uma cadeira"): não é usada por nenhuma ferramenta BIM para geometria/
 * posição, só apareceria em software que soubesse ler agrupamento do
 * snaple, que não existe fora deste repositório. */
import {
  baseDeEuler, decompor, type Cena, type Mat4, type No, type NoMundo, type Vec3,
} from "@snaple/core";
import {
  eixo2placement3D, elementoBIM, placementLocal, productDefinitionShape, shapeRepresentation,
} from "./entidades.ts";
import { paraZUp } from "./eixo.ts";
import { representarGeometria, type TipoRepresentacao } from "./geometria.ts";
import { guidEstavel } from "./guid.ts";
import { CacheDeEstilos } from "./materiais.ts";
import type { ArquivoIFC, Ref } from "./spf.ts";

/** Placement ABSOLUTO (sem `PlacementRelTo`) a partir da matriz de mundo já
 * resolvida pelo core — ver a nota de topo do arquivo sobre por que a
 * hierarquia é achatada. A conversão de eixo (`paraZUp`) é a ÚNICA que
 * acontece nesta fronteira: ela entra exatamente aqui, na posição e na base
 * de rotação do nó, e nunca dentro da geometria (`geometria.ts` trabalha só
 * em coordenadas locais). */
function placementMundoDoNo(arq: ArquivoIFC, matrizMundo: Mat4): { placement: Ref; escala: Vec3 } {
  const { posicao, rotacao, escala } = decompor(matrizMundo);
  const { ex, ez } = baseDeEuler(rotacao);
  const eixo = eixo2placement3D(arq, paraZUp(posicao), paraZUp(ez), paraZUp(ex));
  return { placement: placementLocal(arq, null, eixo), escala };
}

const TIPO_REPRESENTACAO_TEXTO: Record<TipoRepresentacao, string> = {
  SweptSolid: "SweptSolid",
  CSG: "CSG",
  Brep: "Brep",
};

export interface OpcoesElemento {
  /** Tipo IFC semântico por id de nó — ver `index.ts`/README: metadado
   * passado por FORA do core, nunca um campo de `No`. */
  tipoIfcPorNo?: Readonly<Record<string, string>>;
}

export interface ElementoConstruido {
  ref: Ref;
  no: No;
  tipoRepresentacao: TipoRepresentacao;
}

/** Constrói o elemento IFC de um nó geométrico. `null` quando a geometria
 * não produz nenhum item de representação (hoje só acontece para `model`
 * sem `tamanho` de fato zero — caso degenerado, não um erro). */
export function construirElemento(
  arq: ArquivoIFC, cena: Cena, nm: NoMundo, contexto: Ref, opcoes: OpcoesElemento, estilos: CacheDeEstilos,
): ElementoConstruido | null {
  const no = nm.no;
  const { placement, escala } = placementMundoDoNo(arq, nm.matriz);
  const resultado = representarGeometria(arq, cena, no, escala);
  if (resultado.items.length === 0) return null;
  estilos.aplicar(resultado.items, no.material);
  const rep = shapeRepresentation(arq, contexto, "Body", TIPO_REPRESENTACAO_TEXTO[resultado.tipoRepresentacao], resultado.items);
  const shape = productDefinitionShape(arq, [rep]);
  const tipoIfc = opcoes.tipoIfcPorNo?.[no.id] ?? "IfcBuildingElementProxy";
  const ref = elementoBIM(arq, tipoIfc, { guid: guidEstavel(`no:${no.id}`), nome: no.nome }, placement, shape, no.id);
  return { ref, no, tipoRepresentacao: resultado.tipoRepresentacao };
}
