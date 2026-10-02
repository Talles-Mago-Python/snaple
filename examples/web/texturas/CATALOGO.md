# Catálogo de texturas

Duas prateleiras, um só jeito de usar — `material.textura` (ver
`docs/guia-de-modelagem.md`):

```ts
cena.criar("box", { largura: 1, altura: 0.05, profundidade: 1 }, {
  material: { cor: "#ffffff", textura: { src: "texturas/marmore_branco.png", repetir: [2, 2] } },
});
```

(`src` relativo à raiz servida, como nas texturas da taverna; a cor branca
deixa a imagem passar pura.)

## Locais (geradas, sem emenda)

Onze PNGs 512×512 em `public/texturas/`, procedurais e **tileáveis**
(nenhuma emenda em qualquer `repetir`). Recria-se tudo com:

```
node examples/web/texturas/gerar-texturas.ts
```

O script não tem dependências (PNG escrito à mão com o zlib do Node) e é
determinístico — rodar de novo produz arquivos idênticos. Ele só sobrescreve
os nomes que conhece; as imagens desenhadas à mão (taverna, logo, rótulos)
não são tocadas.

| id                 | uso típico                          |
| ------------------ | ----------------------------------- |
| concreto_cru       | pisos, muros, bancadas              |
| marmore_branco     | pias, colunas, tampos               |
| linho              | cortinas, estofados, capas          |
| grama              | jardins, terreno                    |
| granito            | soleiras, balcões                   |
| azulejo_branco     | cozinhas, banheiros                 |
| carpete_cinza      | salas, escritórios                  |
| papel_kraft        | caixas, embalagens, cartazes        |
| fibra_carbono      | drones, volantes, molduras          |
| metal_escovado     | eletrodomésticos, painéis           |
| tecido_jeans       | roupas, bancos, mochilas            |

O catálogo tipado fica em `catalogo.ts` (`TEXTURAS_LOCAIS`, com descrição e
repetição sugerida), e a vitrine no viewer é o modelo `texturas`
(`modelos/texturas.ts`): uma mesa com uma amostra de um tile por textura.

## Prontas (links CC0, direto do Poly Haven)

`catalogo.ts` também exporta `TEXTURAS_PRONTAS`: doze mapas de cor 1K do
[Poly Haven](https://polyhaven.com) (CC0 — sem cadastro, sem atribuição),
com URL direta:

```
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<id>/<id>_diff_1k.jpg
```

Troque `1k` por `2k`/`4k` no caminho para resoluções maiores. O navegador
baixa na hora; se a URL cair ou o CORS negar, o backend avisa
`textura-ausente` e a peça sai só com a cor — a cena nunca quebra. Para uso
offline, baixe o JPG para `public/texturas/` e aponte `src` para o arquivo.

Seleção atual (todas verificadas na API do Poly Haven): `brushed_concrete`,
`asphalt_floor`, `brown_floor_tiles`, `granite_tile_03`, `grey_cartago_01`,
`interior_tiles`, `book_pattern`, `brown_leather`, `cotton_jersey`,
`blue_metal_plate`, `corrugated_iron_02`, `green_metal_rust`.
