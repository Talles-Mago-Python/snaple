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

// ── Perfis estruturais (seção de `sweep`/`extrude`) ──────────────────────
//
// Todos centrados na própria bbox, anti-horários, com `largura` no eixo `s`
// (u) e `altura` no eixo `t` (v, o `cima` da seção). O caminho de um `sweep`
// passa pelo centro da bbox do perfil; para passar pela quina de uma
// cantoneira, some o deslocamento aos pontos.

function conferirPerfil(nome: string, largura: number, altura: number, espessuras: number[], limite: number): void {
  if (largura <= 0 || altura <= 0) throw new Error(`${nome}: largura e altura precisam ser > 0 (recebeu ${largura} × ${altura})`);
  for (const e of espessuras) {
    if (e <= 0 || e >= limite) throw new Error(`${nome}: espessura ${e} precisa ficar entre 0 e ${limite}`);
  }
}

function centrado(pts: Ponto2D[], largura: number, altura: number): Ponto2D[] {
  return pts.map(([s, t]) => [s - largura / 2, t - altura / 2]);
}

/** Cantoneira (L): aba horizontal embaixo, aba vertical à esquerda. */
export function perfilL(largura: number, altura: number, espessura: number): Ponto2D[] {
  conferirPerfil("perfilL", largura, altura, [espessura], Math.min(largura, altura));
  const e = espessura;
  return centrado([[0, 0], [largura, 0], [largura, e], [e, e], [e, altura], [0, altura]], largura, altura);
}

/** Perfil U (canal): base embaixo, abas subindo nos dois lados — a abertura
 * fica para `cima`. */
export function perfilU(largura: number, altura: number, espessura: number): Ponto2D[] {
  conferirPerfil("perfilU", largura, altura, [espessura], Math.min(largura / 2, altura));
  const e = espessura;
  return centrado([
    [0, 0], [largura, 0], [largura, altura], [largura - e, altura],
    [largura - e, e], [e, e], [e, altura], [0, altura],
  ], largura, altura);
}

/** Perfil I (viga): mesas de `largura` em cima e embaixo, alma vertical no
 * meio. `espessuraMesa` padrão = `espessuraAlma`. */
export function perfilI(largura: number, altura: number, espessuraAlma: number, espessuraMesa = espessuraAlma): Ponto2D[] {
  conferirPerfil("perfilI", largura, altura, [espessuraAlma], largura);
  conferirPerfil("perfilI", largura, altura, [espessuraMesa], altura / 2);
  const a = (largura - espessuraAlma) / 2, m = espessuraMesa;
  return centrado([
    [0, 0], [largura, 0], [largura, m], [largura - a, m], [largura - a, altura - m], [largura, altura - m],
    [largura, altura], [0, altura], [0, altura - m], [a, altura - m], [a, m], [0, m],
  ], largura, altura);
}

/** Perfil T: mesa de `largura` em cima, alma descendo no meio.
 * `espessuraMesa` padrão = `espessuraAlma`. */
export function perfilT(largura: number, altura: number, espessuraAlma: number, espessuraMesa = espessuraAlma): Ponto2D[] {
  conferirPerfil("perfilT", largura, altura, [espessuraAlma], largura);
  conferirPerfil("perfilT", largura, altura, [espessuraMesa], altura);
  const a = (largura - espessuraAlma) / 2, m = espessuraMesa;
  return centrado([
    [a, 0], [largura - a, 0], [largura - a, altura - m], [largura, altura - m],
    [largura, altura], [0, altura], [0, altura - m], [a, altura - m],
  ], largura, altura);
}
