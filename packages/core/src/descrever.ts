/** `descrever()`: a cena em PROSA, não em JSON.
 *
 * Serve para um agente raciocinar sobre a cena sem screenshot — e para um
 * humano conferir uma montagem sem abrir viewer. Descreve RELAÇÕES ("sobre",
 * "ao redor de", "à esquerda de"), agrupa repetições, e termina com os avisos
 * ativos. Roda inteiramente no core, sem nenhuma dependência de render. */
import { type AABB, unirAABB } from "./bbox.ts";
import { type NoMundo } from "./mundo.ts";
import { TOL_CONTATO } from "./validar.ts";
import type { Cena } from "./cena.ts";
import type { No, TipoNo } from "./tipos.ts";
import { type Vec3, arred } from "./vetor.ts";

const SUBSTANTIVO: Partial<Record<TipoNo, string>> = {
  box: "caixa", sphere: "esfera", cylinder: "cilindro", cone: "cone",
  plane: "plano", torus: "torus", extrude: "peça", lathe: "peça torneada",
  model: "modelo",
};

const NUMERAL = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis",
  "sete", "oito", "nove", "dez", "onze", "doze",
];

/** Heurística de gênero: substantivo terminado em "a"/"ã" é tratado como
 * feminino. Cobre os rótulos padrão e os nomes comuns (mesa, cadeira, xícara,
 * caixa, esfera); erra em exceções como "mapa". É prosa gerada, não
 * gramática garantida — documentado de propósito. */
function feminino(palavra: string): boolean {
  const p = palavra.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return /[aã]s?$/.test(p);
}

function artigoDefinido(palavra: string): string {
  return feminino(palavra) ? "a" : "o";
}

function numeral(n: number, palavra: string): string {
  if (n === 1) return feminino(palavra) ? "Uma" : "Um";
  if (n === 2) return feminino(palavra) ? "Duas" : "Dois";
  const base = NUMERAL[n];
  return base ? base[0]!.toUpperCase() + base.slice(1) : String(n);
}

function plural(palavra: string): string {
  if (/[aeiou]$/i.test(palavra)) return `${palavra}s`;
  if (/[rz]$/i.test(palavra)) return `${palavra}es`;
  if (/l$/i.test(palavra)) return `${palavra.slice(0, -1)}is`;
  if (/m$/i.test(palavra)) return `${palavra.slice(0, -1)}ns`;
  if (/s$/i.test(palavra)) return palavra;
  return `${palavra}s`;
}

function concordar(palavra: string, base: string): string {
  return feminino(palavra) ? `${base}a` : `${base}o`;
}

export function rotuloDe(no: No): string {
  return no.nome ?? SUBSTANTIVO[no.tipo] ?? "objeto";
}

/** Direção cardeal, com um limiar proporcional ao tamanho da cena abaixo do
 * qual tudo é "no centro". Sem esse limiar, um deslocamento minúsculo cravaria
 * uma direção cardeal, e a descrição de um objeto PARADO mudaria só porque
 * outro objeto se moveu. */
function cardeal(de: Vec3, para: Vec3, raioCena: number): string {
  const dx = para[0] - de[0];
  const dz = para[2] - de[2];
  const limiar = Math.max(raioCena * 0.18, 0.02);
  if (Math.hypot(dx, dz) < limiar) return "no centro";
  const partes: string[] = [];
  if (Math.abs(dz) > limiar) partes.push(dz < 0 ? "norte" : "sul");
  if (Math.abs(dx) > limiar) partes.push(dx > 0 ? "leste" : "oeste");
  return `a ${partes.join("")}`;
}

/** Onde, dentro da superfície de apoio, o objeto está. Só fala quando o
 * deslocamento passa de 15% da extensão do apoio — senão diria "à esquerda"
 * para um milímetro de folga. */
function ondeSobre(item: AABB, apoio: AABB): string {
  const partes: string[] = [];
  const eixos: [number, string, string][] = [[0, "à esquerda", "à direita"], [2, "ao fundo", "à frente"]];
  for (const [i, neg, pos] of eixos) {
    const ext = apoio.tamanho[i]!;
    if (ext < 1e-9) continue;
    const d = (item.centro[i]! - apoio.centro[i]!) / ext;
    if (Math.abs(d) > 0.15) partes.push(d < 0 ? neg : pos);
  }
  return partes.length === 0 ? "" : `levemente ${partes.join(" e ")}`;
}

interface Item {
  m: NoMundo;
  rotulo: string;
  /** Caixa do nó + as subpartes estruturais dele (não o que está apoiado). */
  caixa: AABB;
  apoioEm: string | null;
  subpartes: Map<string, number>;
}

export function descreverCena(cena: Cena): string {
  const geometricos = cena.nosGeometricos();
  if (geometricos.length === 0) return "Cena vazia.";

  const porId = new Map(geometricos.map((m) => [m.no.id, m]));
  const idsGeometricos = new Set(porId.keys());
  const ancestralGeometrico = (m: NoMundo): NoMundo | null => {
    for (let i = m.ancestrais.length - 1; i >= 0; i--) {
      const a = m.ancestrais[i]!;
      if (idsGeometricos.has(a)) return porId.get(a)!;
    }
    return null;
  };

  /** `a` está apoiado em `b`? Base de `a` encostando no topo da geometria
   * PRÓPRIA de `b`, com sobreposição em XZ. */
  const apoiadoEm = (a: NoMundo, b: NoMundo): boolean => {
    if (a.no.id === b.no.id || !b.propria) return false;
    if (Math.abs(a.total.min[1]! - b.propria.max[1]!) > TOL_CONTATO) return false;
    return (
      Math.min(a.total.max[0]!, b.propria.max[0]!) > Math.max(a.total.min[0]!, b.propria.min[0]!) &&
      Math.min(a.total.max[2]!, b.propria.max[2]!) > Math.max(a.total.min[2]!, b.propria.min[2]!)
    );
  };

  // Uma peça é SUBPARTE de um ancestral geométrico (a perna de uma mesa), a
  // menos que esteja apoiada EM CIMA dele — uma xícara colocada no tampo vira
  // filha do tampo na árvore, mas continua sendo um objeto sobre a mesa, não
  // uma parte da mesa.
  const subparteDe = new Map<string, string>();
  for (const m of geometricos) {
    const a = ancestralGeometrico(m);
    if (a && !apoiadoEm(m, a)) subparteDe.set(m.no.id, a.no.id);
  }

  const descritos = geometricos.filter((m) => !subparteDe.has(m.no.id));
  const itens: Item[] = descritos.map((m) => {
    const subpartes = new Map<string, number>();
    let caixa: AABB = m.propria ?? m.total;
    for (const outro of geometricos) {
      let raiz = subparteDe.get(outro.no.id);
      while (raiz && subparteDe.has(raiz)) raiz = subparteDe.get(raiz);
      if (raiz !== m.no.id) continue;
      const r = rotuloDe(outro.no);
      subpartes.set(r, (subpartes.get(r) ?? 0) + 1);
      caixa = unirAABB(caixa, outro.propria)!;
    }
    return { m, rotulo: rotuloDe(m.no), caixa, apoioEm: null, subpartes };
  });

  const itemPorId = new Map(itens.map((i) => [i.m.no.id, i]));
  for (const it of itens) {
    for (const outro of itens) {
      if (outro !== it && apoiadoEm(it.m, outro.m)) { it.apoioEm = outro.m.no.id; break; }
    }
  }

  const centroide: Vec3 = [0, 1, 2].map(
    (i) => itens.reduce((s, it) => s + it.caixa.centro[i]!, 0) / itens.length,
  ) as Vec3;
  const raioCena = Math.max(
    ...itens.map((it) => Math.hypot(it.caixa.centro[0]! - centroide[0], it.caixa.centro[2]! - centroide[2])),
    0.01,
  );

  // âncora: o maior objeto apoiado no chão, por área de base
  const noChao = itens.filter((it) => !it.apoioEm);
  const ancora = (noChao.length > 0 ? noChao : itens).reduce((a, b) =>
    a.caixa.tamanho[0]! * a.caixa.tamanho[2]! >= b.caixa.tamanho[0]! * b.caixa.tamanho[2]! ? a : b,
  );

  const frases: string[] = [frase(ancora, centroide, raioCena, itemPorId, true)];
  const feitos = new Set([ancora.m.no.id]);

  // grupos circulares em torno da âncora, agrupados por rótulo
  const restantes = itens.filter((it) => it !== ancora);
  const porRotulo = new Map<string, Item[]>();
  for (const it of restantes) {
    if (!porRotulo.has(it.rotulo)) porRotulo.set(it.rotulo, []);
    porRotulo.get(it.rotulo)!.push(it);
  }
  for (const [rotulo, grupo] of porRotulo) {
    if (grupo.length < 3) continue;
    const dists = grupo.map((it) =>
      Math.hypot(
        it.caixa.centro[0]! - ancora.caixa.centro[0]!,
        it.caixa.centro[2]! - ancora.caixa.centro[2]!,
      ),
    );
    const media = dists.reduce((a, b) => a + b, 0) / dists.length;
    if (media < 1e-6) continue;
    // 20% de variação: um grupo deliberadamente elíptico cai no caso a caso
    if (Math.max(...dists.map((d) => Math.abs(d - media) / media)) > 0.2) continue;
    frases.push(
      `${numeral(grupo.length, rotulo)} ${plural(rotulo)} ao redor d${artigoDefinido(ancora.rotulo)}` +
      ` ${ancora.rotulo}, ${concordar(rotulo, "distribuíd")}s em círculo de raio ${arred(media, 2).toFixed(2)} m.`,
    );
    for (const it of grupo) feitos.add(it.m.no.id);
  }

  // Vários objetos iguais sobre o mesmo apoio viram uma frase só — cinco
  // frases "Um livro apoiado sobre a prateleira" não informam mais que uma.
  const agrupados = new Map<string, Item[]>();
  for (const it of restantes) {
    if (feitos.has(it.m.no.id) || !it.apoioEm) continue;
    const chave = `${it.rotulo}\u0000${it.apoioEm}`;
    if (!agrupados.has(chave)) agrupados.set(chave, []);
    agrupados.get(chave)!.push(it);
  }
  for (const grupo of agrupados.values()) {
    if (grupo.length < 2) continue;
    const primeiro = grupo[0]!;
    const apoio = itemPorId.get(primeiro.apoioEm!)!;
    frases.push(
      `${numeral(grupo.length, primeiro.rotulo)} ${plural(primeiro.rotulo)} ` +
      `${concordar(primeiro.rotulo, "apoiad")}s sobre ` +
      `${artigoDefinido(apoio.rotulo)} ${apoio.rotulo}.`,
    );
    for (const it of grupo) feitos.add(it.m.no.id);
  }

  for (const it of restantes) {
    if (feitos.has(it.m.no.id)) continue;
    frases.push(frase(it, centroide, raioCena, itemPorId, false));
    feitos.add(it.m.no.id);
  }

  const avisos = cena.avisos();
  if (avisos.length > 0) {
    frases.push(
      avisos.length === 1
        ? `Aviso: ${avisos[0]!.texto}.`
        : `Avisos: ${avisos.map((a) => a.texto).join("; ")}.`,
    );
  }

  return frases.join(" ");
}

function frase(
  it: Item, centroide: Vec3, raioCena: number, porId: Map<string, Item>, comDimensoes: boolean,
): string {
  const r = it.rotulo;
  let texto = `${numeral(1, r)} ${r}`;
  if (comDimensoes) {
    const t = it.caixa.tamanho;
    texto += ` (${arred(t[0]!, 2)} × ${arred(t[1]!, 2)} × ${arred(t[2]!, 2)} m)`;
  }
  const apoio = it.apoioEm ? porId.get(it.apoioEm) : undefined;
  if (apoio) {
    texto += ` ${concordar(r, "apoiad")} sobre ${artigoDefinido(apoio.rotulo)} ${apoio.rotulo}`;
    const onde = ondeSobre(it.caixa, apoio.m.propria ?? apoio.caixa);
    if (onde) texto += `, ${onde}`;
  } else {
    texto += ` ${cardeal(centroide, it.caixa.centro, raioCena)}`;
  }
  if (it.subpartes.size > 0) {
    const desc = [...it.subpartes.entries()].map(([rot, n]) => `${n} ${n > 1 ? plural(rot) : rot}`);
    texto += `, com ${desc.join(" e ")}`;
  }
  return `${texto}.`;
}
