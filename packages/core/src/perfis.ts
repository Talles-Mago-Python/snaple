/** Perfis 2D prontos para `extrude`/`lathe`/furo poligonal — formas que
 * apareciam reimplementadas (e cada vez ligeiramente diferentes) em mais de
 * um modelo autorado à mão contra a lib: arco, estádio (barra de pontas
 * redondas), gota (base reta + topo arredondado), retângulo arredondado,
 * polígono regular, elipse.
 *
 * Convenção: `arco` devolve `n+1` pontos, incluindo as DUAS pontas — pensado
 * para ser concatenado com outros arcos/segmentos num contorno composto
 * (como `estadio`/`gota` fazem). As formas FECHADAS por si mesmas
 * (`poligonoRegular`, `elipse`) devolvem só `n` pontos, sem repetir o
 * primeiro no fim — quem consome (`extrude`) fecha o contorno sozinho. */
import type { Ponto2D } from "./vetor.ts";

/** Arco de círculo de `raio`, centrado em `(cx, 0)`, de `de` a `ate`
 * radianos, com `n` segmentos (`n+1` pontos, incluindo as duas pontas). */
export function arco(cx: number, raio: number, de: number, ate: number, n: number): Ponto2D[] {
  if (n < 1) throw new Error(`arco precisa de pelo menos 1 segmento (recebeu ${n})`);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = de + ((ate - de) * i) / n;
    return [cx + raio * Math.cos(a), raio * Math.sin(a)];
  });
}

/** Barra de pontas redondas ("estádio"/"pill"): comprimento `comp` entre os
 * CENTROS das duas pontas semicirculares de `raio`. */
export function estadio(comp: number, raio: number, segmentosPorPonta = 16): Ponto2D[] {
  return [
    ...arco(comp, raio, -Math.PI / 2, Math.PI / 2, segmentosPorPonta),
    ...arco(0, raio, Math.PI / 2, (3 * Math.PI) / 2, segmentosPorPonta),
  ];
}

/** Base reta de largura `larg` e topo arredondado (meio-círculo de raio
 * `larg / 2`), altura total `alt`. Útil para garfos, pás, lâminas. */
export function gota(alt: number, larg: number, segmentos = 16): Ponto2D[] {
  return [
    [0, -larg / 2],
    ...arco(alt - larg / 2, larg / 2, -Math.PI / 2, Math.PI / 2, segmentos),
    [0, larg / 2],
  ];
}

/** Retângulo `largura × profundidade` com cantos arredondados de `raio`
 * (automaticamente limitado a caber nos lados). */
export function retanguloArredondado(
  largura: number, profundidade: number, raio: number, segmentosPorCanto = 6,
): Ponto2D[] {
  const r = Math.min(raio, largura / 2, profundidade / 2);
  const pontos: Ponto2D[] = [];
  const cantos: [number, number, number][] = [
    [largura / 2 - r, profundidade / 2 - r, 0],
    [-largura / 2 + r, profundidade / 2 - r, Math.PI / 2],
    [-largura / 2 + r, -profundidade / 2 + r, Math.PI],
    [largura / 2 - r, -profundidade / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cz, inicio] of cantos) {
    for (let i = 0; i <= segmentosPorCanto; i++) {
      const a = inicio + (i * (Math.PI / 2)) / segmentosPorCanto;
      pontos.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  }
  return pontos;
}

/** Polígono regular de `n` lados, raio `raio` (centro ao vértice), primeiro
 * vértice em `fase` radianos (padrão 0 = sobre o eixo `+u`). */
export function poligonoRegular(n: number, raio: number, fase = 0): Ponto2D[] {
  if (n < 3) throw new Error(`poligonoRegular precisa de pelo menos 3 lados (recebeu ${n})`);
  return Array.from({ length: n }, (_, i) => {
    const a = fase + (i / n) * Math.PI * 2;
    return [raio * Math.cos(a), raio * Math.sin(a)];
  });
}

/** Elipse completa (semieixos `raioU`, `raioV`), `n` pontos. */
export function elipse(raioU: number, raioV: number, n = 48): Ponto2D[] {
  if (n < 3) throw new Error(`elipse precisa de pelo menos 3 segmentos (recebeu ${n})`);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [raioU * Math.cos(a), raioV * Math.sin(a)];
  });
}
