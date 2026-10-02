/** Catálogo de texturas do viewer.
 *
 * Duas prateleiras:
 *
 * - `TEXTURAS_LOCAIS` — PNGs procedurais em `examples/web/public/texturas/`,
 *   recriáveis com `node examples/web/texturas/gerar-texturas.ts`. Sem
 *   emenda: qualquer `repetir` funciona. Uso:
 *   `material: { textura: { src: "texturas/marmore_branco.png", repetir: [2, 2] } }`
 *   (caminho relativo à raiz servida, como as texturas da taverna).
 *
 * - `TEXTURAS_PRONTAS` — links diretos para mapas de cor CC0 do Poly Haven
 *   (https://polyhaven.com). O navegador baixa na hora; se a URL morrer ou o
 *   CORS negar, o backend avisa `textura-ausente` e a peça sai só com a cor —
 *   nunca quebra a cena. Para uso offline, baixe o JPG para
 *   `public/texturas/` e aponte `src` para o arquivo local.
 */

export interface TexturaLocal {
  /** Id curto usado na vitrine e como nome de arquivo (sem extensão). */
  id: string;
  /** Caminho relativo à raiz servida, pronto para `material.textura.src`. */
  src: string;
  descricao: string;
  /** Repetição sugerida para uma peça de ~1 m. */
  repetir: [number, number];
}

export interface TexturaPronta {
  /** Id do asset no Poly Haven (parte do caminho da URL). */
  id: string;
  nome: string;
  /** Mapa de cor 1K (JPG), link direto CC0 — sem chave, sem cadastro. */
  url: string;
  descricao: string;
}

const pronta = (id: string, nome: string, descricao: string): TexturaPronta => ({
  id,
  nome,
  descricao,
  url: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}_diff_1k.jpg`,
});

export const TEXTURAS_LOCAIS: readonly TexturaLocal[] = [
  { id: "concreto_cru", src: "texturas/concreto_cru.png", repetir: [2, 2], descricao: "Concreto cinza manchado com poros esparsos — pisos, muros, bancadas." },
  { id: "marmore_branco", src: "texturas/marmore_branco.png", repetir: [1, 1], descricao: "Mármore branco com veios cinza — pias, colunas, tampos." },
  { id: "linho", src: "texturas/linho.png", repetir: [3, 3], descricao: "Linho cru de trama visível — cortinas, estofados, capas." },
  { id: "grama", src: "texturas/grama.png", repetir: [3, 3], descricao: "Grama vista de cima com variação de tom — jardins, terreno." },
  { id: "granito", src: "texturas/granito.png", repetir: [2, 2], descricao: "Granito polido com grãos claros e escuros — soleiras, balcões." },
  { id: "azulejo_branco", src: "texturas/azulejo_branco.png", repetir: [2, 2], descricao: "Azulejo branco 4×4 com rejunte — cozinhas, banheiros." },
  { id: "carpete_cinza", src: "texturas/carpete_cinza.png", repetir: [3, 3], descricao: "Carpete cinza-azulado de pelo curto — salas, escritórios." },
  { id: "papel_kraft", src: "texturas/papel_kraft.png", repetir: [2, 2], descricao: "Papel kraft com fibra horizontal — caixas, embalagens, cartazes." },
  { id: "fibra_carbono", src: "texturas/fibra_carbono.png", repetir: [4, 4], descricao: "Fibra de carbono em sarja 2×2 — drones, volantes, molduras." },
  { id: "metal_escovado", src: "texturas/metal_escovado.png", repetir: [2, 1], descricao: "Aço escovado com riscos horizontais — eletrodomésticos, painéis." },
  { id: "tecido_jeans", src: "texturas/tecido_jeans.png", repetir: [3, 3], descricao: "Jeans índigo em sarja diagonal — roupas, bancos, mochilas." },
];

export const TEXTURAS_PRONTAS: readonly TexturaPronta[] = [
  pronta("brushed_concrete", "Brushed Concrete", "Concreto escovado gasto, com manchas e marcas de desempenadeira."),
  pronta("asphalt_floor", "Asphalt Floor", "Asfalto liso e seco, agregado fino."),
  pronta("brown_floor_tiles", "Brown Floor Tiles", "Lajota cerâmica terracota em grade quadrada."),
  pronta("granite_tile_03", "Granite Tile 03", "Placas de granito salpicado com junta fina."),
  pronta("grey_cartago_01", "Grey Cartago 01", "Ladrilho de mármore cinza polido com veios quentes."),
  pronta("interior_tiles", "Interior Tiles", "Cerâmica bege com rejunte escuro, piso interno."),
  pronta("book_pattern", "Book Pattern", "Tecido de algodão verde-oliva, trama grossa de capa de livro."),
  pronta("brown_leather", "Brown Leather", "Couro marrom vintage com rugas e desgaste."),
  pronta("cotton_jersey", "Cotton Jersey", "Malha de algodão bege canelada, fosca."),
  pronta("blue_metal_plate", "Blue Metal Plate", "Chapa de aço pintada de azul com arranhões e emendas."),
  pronta("corrugated_iron_02", "Corrugated Iron 02", "Telha galvanizada ondulada com rebites."),
  pronta("green_metal_rust", "Green Metal Rust", "Metal pintado de verde com riscos e ferrugem."),
];

/** Textura local pelo id (a vitrine usa para montar as amostras). */
export function texturaLocal(id: string): TexturaLocal | undefined {
  return TEXTURAS_LOCAIS.find((t) => t.id === id);
}
