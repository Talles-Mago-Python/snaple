/** `Material` (neutro, sem nome de campo de nenhum motor de render — ver
 * `tipos.ts` do core) → `IfcSurfaceStyle`. Mapeamento deliberadamente
 * parcial: IFC4 não tem um equivalente PBR (metálico/rugosidade) nem
 * emissivo/textura por UV em `IfcSurfaceStyleRendering` — só cor difusa e
 * transparência saem representadas; o resto é perda conhecida, documentada
 * no README do pacote em vez de forçada num campo que não bate
 * semanticamente (ex.: usar rugosidade como "shininess" seria impreciso o
 * bastante para enganar mais do que ajudar). */
import type { Material } from "@snaple/core";
import { corRGB, estiloSuperficie, estiloSuperficieRendering, itemEstilizado } from "./entidades.ts";
import type { ArquivoIFC, Ref } from "./spf.ts";

function corHexParaRGB(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [0.8, 0.8, 0.8];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Cache por conteúdo serializado do material — evita um `IfcSurfaceStyle`
 * repetido por peça igual (a cena da câmera tem dezenas de parafusos com o
 * mesmo material; o arquivo IFC não precisa de um estilo por parafuso). */
export class CacheDeEstilos {
  #porChave = new Map<string, Ref>();
  #arq: ArquivoIFC;

  constructor(arq: ArquivoIFC) {
    this.#arq = arq;
  }

  estiloDe(material: Material | undefined): Ref | null {
    if (!material || (material.cor === undefined && material.opacidade === undefined)) return null;
    const chave = JSON.stringify({ cor: material.cor, opacidade: material.opacidade });
    const existente = this.#porChave.get(chave);
    if (existente) return existente;
    const [r, g, b] = corHexParaRGB(material.cor ?? "#cccccc");
    const cor = corRGB(this.#arq, r, g, b);
    const transparencia = 1 - (material.opacidade ?? 1);
    const rendering = estiloSuperficieRendering(this.#arq, cor, transparencia);
    const estilo = estiloSuperficie(this.#arq, material.cor, rendering);
    this.#porChave.set(chave, estilo);
    return estilo;
  }

  /** Aplica o estilo (se houver) a cada item de representação geométrica do
   * nó — um `IfcStyledItem` por item, igual ao padrão usado pelas
   * ferramentas de authoring IFC (o estilo cobre o item, não o produto). */
  aplicar(items: readonly Ref[], material: Material | undefined): void {
    const estilo = this.estiloDe(material);
    if (!estilo) return;
    for (const item of items) itemEstilizado(this.#arq, item, estilo);
  }
}
