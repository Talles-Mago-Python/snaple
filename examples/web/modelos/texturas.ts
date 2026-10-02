/** Vitrine de texturas: uma mesa de amostras com uma peça por textura do
 * catálogo local (`examples/web/texturas/catalogo.ts`).
 *
 * É o modelo para "passear" pela biblioteca: cada amostra usa
 * `material.textura` com `repetir: [1, 1]`, mostrando um tile inteiro por
 * peça — dá para julgar padrão, escala e emenda. Troque o `src` de qualquer
 * amostra por uma `TEXTURAS_PRONTAS[i].url` do catálogo para ver as prontas.
 *
 * Apenas grupo, box e faces (`face().colocar`). Sem CSG, sem animação:
 * o interesse aqui é o material, não o movimento. */
import { Cena } from "@snaple/core";
import type { Material } from "@snaple/core";
import { TEXTURAS_LOCAIS } from "../texturas/catalogo.ts";

export function montarCena(): Cena {
  const cena = new Cena();

  // Mesa de amostras: tampo de madeira assentado em quatro pernas (y = 0 é
  // o chão, como em examples/mesa.ts). Nenhuma coordenada além das alturas.
  const pernas: [number, number][] = [
    [-1.05, -0.9],
    [1.05, -0.9],
    [-1.05, 0.9],
    [1.05, 0.9],
  ];
  for (let i = 0; i < pernas.length; i++) {
    const [x, z] = pernas[i]!;
    cena.criar(
      "box",
      { largura: 0.07, altura: 0.72, profundidade: 0.07 },
      { nome: `mesa_perna_${i + 1}`, transform: { posicao: [x, 0.36, z] }, material: { cor: "#5d3f24", rugosidade: 0.8 } },
    );
  }

  const tampo = cena.criar(
    "box",
    { largura: 2.3, altura: 0.05, profundidade: 2.0 },
    {
      nome: "mesa_tampo",
      transform: { posicao: [0, 0.745, 0] },
      material: { cor: "#ffffff", rugosidade: 0.7, textura: { src: "texturas/madeira.png", repetir: [2, 2] } },
    },
  );

  // Uma amostra por textura, em grade 6×5 no tampo. Cada peça é um tile
  // inteiro (repetir [1,1]) para julgar o padrão de uma vez.
  const colunas = [-0.9, -0.54, -0.18, 0.18, 0.54, 0.9];
  const linhas = [0.72, 0.36, 0, -0.36, -0.72];
  TEXTURAS_LOCAIS.forEach((t, i) => {
    const u = colunas[i % colunas.length]!;
    const v = linhas[Math.floor(i / colunas.length) % linhas.length]!;
    const material: Material = {
      cor: "#ffffff",
      rugosidade: 0.9,
      textura: { src: t.src, repetir: [1, 1] },
    };
    const amostra = cena.criar(
      "box",
      { largura: 0.26, altura: 0.006, profundidade: 0.26 },
      { nome: `amostra_${t.id}`, material },
    );
    tampo.face("topo").colocar(amostra, { u, v });
  });

  return cena;
}

export default montarCena;
