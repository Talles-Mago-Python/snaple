/** @snaple/ifc — backend IFC (ISO 16739, STEP/SPF) para `@snaple/core`.
 *
 * Consome o JSON da cena e produz texto `.ifc`. Mesma regra de dependência
 * do resto do projeto (ver AGENTS.md): não importa nada de render nem de
 * DOM, roda em Node puro, e a conversão de convenção (eixo Y-up→Z-up,
 * unidades) acontece só na fronteira deste pacote — o core nunca soube que
 * IFC existe. Ver `README.md` deste pacote para a tabela de mapeamento
 * completa, as decisões de design e as perdas conhecidas. */
import type { Cena } from "@snaple/core";
import {
  buildingStorey, building as construirBuilding, projeto as construirProjeto, site as construirSite,
  contextoGeometrico, eixo2placement3D, placementLocal, relAggregates, relContainedInSpatialStructure,
  unidades,
} from "./entidades.ts";
import { guidEstavel } from "./guid.ts";
import { CacheDeEstilos } from "./materiais.ts";
import { construirElemento } from "./mapear.ts";
import { ArquivoIFC, type Ref } from "./spf.ts";

export { exportarIFC as default };

export type MotivoAvisoIFC = "tesselado" | "modelo-proxy" | "falha";

export interface AvisoIFC {
  noId: string;
  motivo: MotivoAvisoIFC;
  texto: string;
}

export interface OpcoesExportarIFC {
  /** Nome do `IfcProject`. Padrão: `"Cena snaple"`. */
  nomeProjeto?: string;
  /** `FILE_NAME` do cabeçalho SPF — só metadado, não afeta a leitura. */
  nomeArquivo?: string;
  autor?: string;
  organizacao?: string;
  /** Tipo IFC semântico por id de nó (ex.: `{ [mesa.id]: "IfcFurniture" }`).
   * Metadado passado por FORA do core de propósito — ver README, item
   * "hierarquia e tipos IFC": o core nunca ganhou um campo `ifcTipo`,
   * porque isso seria vazar um conceito de IFC para dentro dele (proibido
   * pelo AGENTS.md). Nó sem entrada aqui vira `IfcBuildingElementProxy`,
   * o tipo neutro. */
  tipoIfcPorNo?: Readonly<Record<string, string>>;
  aoAvisar?: (aviso: AvisoIFC) => void;
}

/** Exporta a cena como texto STEP/SPF (`.ifc`, schema IFC4 — justificativa
 * no README). Síncrona: ao contrário de `@snaple/three`, nenhum nó desta
 * lib faz I/O (um `model` sem malha embutível vira caixa proxy + aviso, sem
 * tentar carregar o arquivo de origem). */
export function exportarIFC(cena: Cena, opcoes: OpcoesExportarIFC = {}): string {
  const arq = new ArquivoIFC();
  const avisar = (a: AvisoIFC) => opcoes.aoAvisar?.(a);

  const contexto = contextoGeometrico(arq);
  const unid = unidades(arq);
  const placementRaiz = placementLocal(arq, null, eixo2placement3D(arq, [0, 0, 0]));

  const proj = construirProjeto(
    arq, { guid: guidEstavel("snaple:project"), nome: opcoes.nomeProjeto ?? "Cena snaple" }, contexto, unid,
  );
  const st = construirSite(arq, { guid: guidEstavel("snaple:site"), nome: "Terreno" }, placementRaiz);
  const bld = construirBuilding(arq, { guid: guidEstavel("snaple:building"), nome: "Edifício" }, placementRaiz);
  const storey = buildingStorey(arq, { guid: guidEstavel("snaple:storey"), nome: "Térreo" }, placementRaiz, 0);

  relAggregates(arq, guidEstavel("snaple:rel:project-site"), proj, [st]);
  relAggregates(arq, guidEstavel("snaple:rel:site-building"), st, [bld]);
  relAggregates(arq, guidEstavel("snaple:rel:building-storey"), bld, [storey]);

  const estilos = new CacheDeEstilos(arq);
  const elementos: Ref[] = [];
  for (const nm of cena.nosGeometricos()) {
    const noId = nm.no.id;
    let construido;
    try {
      construido = construirElemento(arq, cena, nm, contexto, { tipoIfcPorNo: opcoes.tipoIfcPorNo }, estilos);
    } catch (e) {
      avisar({ noId, motivo: "falha", texto: `nó '${noId}' não pôde ser exportado para IFC: ${(e as Error).message}` });
      continue;
    }
    if (!construido) continue;
    elementos.push(construido.ref);
    if (construido.no.tipo === "model") {
      avisar({
        noId, motivo: "modelo-proxy",
        texto: `'${noId}': nó 'model' (malha importada) não pode ser embutido no IFC; ` +
          `saiu como caixa proxy do 'tamanho' declarado, sem a malha de origem.`,
      });
    } else if (construido.tipoRepresentacao === "Brep") {
      avisar({
        noId, motivo: "tesselado",
        texto: `'${noId}' (tipo '${construido.no.tipo}') saiu como malha facetada (IfcFacetedBrep): ` +
          `sem sólido paramétrico equivalente em IFC4 para este caso (ver README, tabela de mapeamento).`,
      });
    }
  }
  if (elementos.length) {
    relContainedInSpatialStructure(arq, guidEstavel("snaple:rel:storey-elementos"), elementos, storey);
  }

  return arq.textoSPF({
    nomeArquivo: opcoes.nomeArquivo ?? "cena.ifc",
    timestamp: new Date().toISOString().slice(0, 19),
    autor: opcoes.autor ?? "snaple",
    organizacao: opcoes.organizacao ?? "",
    aplicacao: "snaple-ifc 0.1.0",
    schema: "IFC4",
  });
}
