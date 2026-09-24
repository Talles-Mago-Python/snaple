/**
 * Cena de teste — acoplamentos (contato/pivo) e Face no espaço do mundo.
 * Metros, +Y para cima, rotação Euler XYZ em radianos.
 *
 * Não é um produto, é um banco de provas: cada peça existe para exercitar
 * uma função específica adicionada ao core. Os comentários dizem o que cada
 * uma está testando, e por quê o resultado esperado é o que é.
 */
import { Cena, type NoRef } from "@snaple/core";

type V3 = [number, number, number];
type Material = { cor: string; metalico?: number; rugosidade?: number };

const PI = Math.PI;
const M = {
  madeira: { cor: "#8a5a34", metalico: 0.05, rugosidade: 0.75 },
  metal: { cor: "#9aa5ab", metalico: 0.75, rugosidade: 0.3 },
  aco: { cor: "#4c5a63", metalico: 0.8, rugosidade: 0.28 },
  azul: { cor: "#1f5fbf", metalico: 0.1, rugosidade: 0.5 },
  amarelo: { cor: "#e2b53c", metalico: 0.05, rugosidade: 0.5 },
  branco: { cor: "#eef0ee", metalico: 0.02, rugosidade: 0.6 },
  vermelho: { cor: "#c23b32", metalico: 0.05, rugosidade: 0.5 },
  roxo: { cor: "#7a4fc2", metalico: 0.15, rugosidade: 0.45 },
} satisfies Record<string, Material>;

function caixa(p: Cena | NoRef, nome: string, d: V3, mat: Material, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): NoRef {
  return p.criar("box", { largura: d[0], altura: d[1], profundidade: d[2] }, { nome, material: mat, transform: { posicao: pos, rotacao: rot } });
}
function cilindro(p: Cena | NoRef, nome: string, r: number, h: number, mat: Material, pos: V3 = [0, 0, 0]): NoRef {
  return p.criar("cylinder", { raioTopo: r, raioBase: r, altura: h, segmentos: 32 }, { nome, material: mat, transform: { posicao: pos } });
}

export function montarCena(): Cena {
  const cena = new Cena();

  // ── 1. MESA: girada só em Y (guinada) — fica horizontal, então tudo que
  // for colocado em cima dela por `Face#colocar` nasce com rotação LOCAL
  // identidade (nada a cancelar). É o que deixa `girar()` (que SETA a
  // rotação local, não soma) seguro de usar depois nos acoplamentos de
  // pivô abaixo, sem precisar decompor matriz nenhuma à mão. ─────────────
  const mesa = caixa(cena, "mesa", [1.0, 0.05, 0.6], M.madeira, [0, 0.025, 0], [0, 25 * PI / 180, 0]);

  // ── 2. ACOPLAMENTO "contato": bandeja assentada sobre a mesa, exatamente
  // encostada (sem gap). Testa `cena.acoplar`, `cena.conferirMontagem` e a
  // frase de `descrever()` ("...está assentada sobre..."). ──────────────
  const bandeja = mesa.face("topo").colocar(caixa(mesa, "bandeja", [0.3, 0.02, 0.2], M.metal), { u: -0.15, v: 0 });
  cena.acoplar({ tipo: "contato", nome: "bandeja-mesa", a: { no: mesa, face: "topo" }, b: { no: bandeja, face: "base" } });

  // ── 3. Base do pivô, também assentada sobre a mesa (segundo `contato`,
  // agora testando concordância de gênero em `descrever()`: "ombro" é
  // masculino, "bandeja" é feminino — "assentado" vs. "assentada"). ─────
  const ombro = mesa.face("topo").colocar(cilindro(mesa, "ombro", 0.05, 0.04, M.aco), { u: 0.28, v: 0 });
  cena.acoplar({ tipo: "contato", nome: "ombro-mesa", a: { no: mesa, face: "topo" }, b: { no: ombro, face: "base" } });

  // ── 4. ACOPLAMENTO "pivo": braço articulado sobre o ombro. `colocar`
  // (orientar padrão) alinha a base do braço à face; o pivô nasce com
  // rotação local identidade nesse referencial, então `girar([0,â,0])`
  // gira exatamente em torno do eixo compartilhado (a normal da face) —
  // mesmo padrão usado em `examples/web/modelos/robo_frc.ts`. Testa que o
  // acoplamento sobrevive à rotação (erroPosicao/erroAngulo continuam ~0
  // depois de girar, porque o eixo de giro É a normal compartilhada). ───
  const braco = ombro.face("topo").colocar(caixa(ombro, "braço", [0.02, 0.26, 0.02], M.azul));
  cena.acoplar({ tipo: "pivo", a: { no: ombro, face: "topo" }, b: { no: braco, face: "base" } });
  braco.girar([0, 50 * PI / 180, 0]);

  // ── 5. `colocar(..., { gap })`: suporte deliberadamente afastado 15 mm
  // da bandeja, e SEM acoplamento — então o linter vai (corretamente)
  // avisar que ele está flutuando. `gap` cria uma folga real, não uma
  // ilusão que o resto da lib finja não ver. ─────────────────────────────
  bandeja.face("topo").colocar(caixa(bandeja, "suporte solto (gap)", [0.05, 0.03, 0.05], M.amarelo), { gap: 0.015 });

  // ── 6. `colocar(..., { orientar: false })`: por padrão, colocar em
  // "topo" herdaria a guinada de 25° da mesa (a peça nasceria "quadrada"
  // com a borda da mesa). Com `orientar: false`, a etiqueta MANTÉM a
  // rotação [0,0,0] que já tinha — fica alinhada aos eixos do MUNDO,
  // visivelmente "torta" em relação à mesa. A base ainda encosta
  // exatamente no plano; só a orientação é preservada. ──────────────────
  const etiqueta = cena.criar("box", { largura: 0.10, altura: 0.006, profundidade: 0.10 }, {
    nome: "etiqueta", material: M.vermelho, transform: { rotacao: [0, 0, 0] },
  });
  mesa.face("topo").colocar(etiqueta, { orientar: false, u: 0.32, v: -0.18 });

  // ── 7. Nó solto de propósito, sem relação com o resto da montagem — só
  // para exercitar `origemMundo`/`normalMundo`/`eixosMundo` num dono
  // GIRADO nos três eixos E com escala NÃO uniforme (mesmo cenário de
  // `tests/face-mundo.test.ts`). Fica flutuando por design: não é parte da
  // montagem, é bancada de teste de leitura. ─────────────────────────────
  const suporteTeste = cena.criar("grupo", {}, {
    nome: "suporte de teste", transform: { posicao: [-0.7, 0.3, 0.35], rotacao: [0.3, -0.6, 0.2] },
  });
  const blocoTeste = suporteTeste.criar("box", { largura: 0.1, altura: 0.06, profundidade: 0.14 }, {
    nome: "bloco de teste", material: M.roxo, transform: { rotacao: [0.5, 0.9, -0.3], escala: [1.8, 0.5, 1.2] },
  });

  // ═══ Leituras de conferência, só no console — não alteram a cena ═════
  console.group("[cena de teste] Face#origemMundo/normalMundo/eixosMundo — dono girado nos 3 eixos + escala não uniforme");
  for (const nome of ["topo", "leste", "norte"] as const) {
    const f = blocoTeste.face(nome);
    const normal = f.normalMundo(), eixos = f.eixosMundo();
    const comprimento = (v: readonly number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);
    console.log(nome, {
      origemMundo: f.origemMundo().map((n) => Number(n.toFixed(5))),
      normalMundo: normal.map((n) => Number(n.toFixed(5))),
      "|normalMundo|": comprimento(normal).toFixed(9), // esperado: 1.000000000 — normal continua unitária apesar da escala não uniforme
      eixosMundoU: eixos.u.map((n) => Number(n.toFixed(5))),
      "|eixosMundo.u|": comprimento(eixos.u).toFixed(9),
    });
  }
  console.groupEnd();

  console.group("[cena de teste] cena.conferirMontagem() — 3 acoplamentos, deve passar");
  console.log(cena.conferirMontagem());
  console.groupEnd();

  console.group("[cena de teste] acoplamento-violado: desloca a bandeja, confere, restaura");
  cena.deslocarMundo(bandeja, [0, 0.02, 0]);
  console.log("após deslocar 20 mm (esperado: passou=false):", cena.conferirMontagem());
  cena.deslocarMundo(bandeja, [0, -0.02, 0]);
  console.log("depois de restaurar (esperado: passou=true):", cena.conferirMontagem());
  console.groupEnd();

  return cena;
}
