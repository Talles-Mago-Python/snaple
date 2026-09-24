/** `descrever()`: a cena em PROSA, não em JSON.
 *
 * Serve para um agente raciocinar sobre a cena sem screenshot — e para um
 * humano conferir uma montagem sem abrir viewer. Descreve RELAÇÕES ("sobre",
 * "ao redor de", "à esquerda de"), agrupa repetições, e termina com os avisos
 * ativos. Roda inteiramente no core, sem nenhuma dependência de render. */
import { type AABB, unirAABB } from "./bbox.ts";
import { type NoMundo } from "./mundo.ts";
import { percorrer } from "./no.ts";
import { TOL_CONTATO } from "./validar.ts";
import { duracaoDe } from "./animacao.ts";
import type { Cena } from "./cena.ts";
import type { No, ParamsJunta, TipoNo } from "./tipos.ts";
import { type Vec3, arred } from "./vetor.ts";

const SUBSTANTIVO: Partial<Record<TipoNo, string>> = {
  box: "caixa", sphere: "esfera", cylinder: "cilindro", cone: "cone",
  plane: "plano", torus: "torus", extrude: "peça", lathe: "peça torneada",
  helix: "hélice", sweep: "tubo", model: "modelo", junta: "junta",
};

function emGraus(rad: number): string {
  return `${arred((rad * 180) / Math.PI, 1)}°`;
}

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

const PREPOSICOES = new Set(["de", "da", "do", "das", "dos", "em", "com", "para", "a", "ao"]);

function pluralSimples(palavra: string): string {
  if (/[aeiou]$/i.test(palavra)) return `${palavra}s`;
  if (/[rz]$/i.test(palavra)) return `${palavra}es`;
  if (/l$/i.test(palavra)) return `${palavra.slice(0, -1)}is`;
  if (/m$/i.test(palavra)) return `${palavra.slice(0, -1)}ns`;
  if (/s$/i.test(palavra)) return palavra;
  return `${palavra}s`;
}

/** Pluraliza um rótulo que pode ser um sintagma. Em português, o plural vai
 * no núcleo e nos modificadores ANTES da preposição: "lata de tinta" vira
 * "latas de tinta", não "lata de tintas"; "mesa redonda" vira "mesas
 * redondas". Depois da preposição nada muda. */
function plural(rotulo: string): string {
  const palavras = rotulo.split(/\s+/);
  const corte = palavras.findIndex((p) => PREPOSICOES.has(p.toLowerCase()));
  const ate = corte === -1 ? palavras.length : corte;
  return palavras.map((p, i) => (i < ate ? pluralSimples(p) : p)).join(" ");
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
/** Os compostos têm forma própria em português — "sudoeste", não
 * "suloeste". */
const COMPOSTO: Record<string, string> = {
  n: "norte", s: "sul", l: "leste", o: "oeste",
  nl: "nordeste", no: "noroeste", sl: "sudeste", so: "sudoeste",
};

function cardeal(de: Vec3, para: Vec3, raioCena: number): string {
  const dx = para[0] - de[0];
  const dz = para[2] - de[2];
  const limiar = Math.max(raioCena * 0.18, 0.02);
  if (Math.hypot(dx, dz) < limiar) return "no centro";
  const ns = Math.abs(dz) > limiar ? (dz < 0 ? "n" : "s") : "";
  const lo = Math.abs(dx) > limiar ? (dx > 0 ? "l" : "o") : "";
  return `a ${COMPOSTO[ns + lo] ?? "nordeste"}`;
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

/** Base de `caixa` encostando no topo da geometria própria de `b`, com
 * sobreposição em XZ. */
function encosta(caixa: AABB, b: NoMundo, mesmoNo: boolean): boolean {
  if (mesmoNo || !b.propria) return false;
  if (Math.abs(caixa.min[1]! - b.propria.max[1]!) > TOL_CONTATO) return false;
  return (
    Math.min(caixa.max[0]!, b.propria.max[0]!) > Math.max(caixa.min[0]!, b.propria.min[0]!) &&
    Math.min(caixa.max[2]!, b.propria.max[2]!) > Math.max(caixa.min[2]!, b.propria.min[2]!)
  );
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
  const apoiadoEm = (a: NoMundo, b: NoMundo): boolean =>
    encosta(a.total, b, a.no.id === b.no.id);

  /** Igual, mas olhando só a geometria própria de `a` — a bbox da subárvore
   * do tampo de uma mesa já desce até o chão por causa das pernas, e aí ele
   * nunca "se apoiaria" nelas. */
  const apoiaEm = (a: NoMundo, b: NoMundo): boolean =>
    a.propria ? encosta(a.propria, b, a.no.id === b.no.id) : false;

  // Uma peça é SUBPARTE de um ancestral geométrico quando o ancestral SE
  // APOIA nela: a perna de uma mesa, o pedestal de um tombo. Tudo mais ganha
  // frase própria, mesmo sendo filho na árvore — uma xícara posta no tampo, e
  // também uma prateleira ou um armário presos numa parede, que viram filhos
  // dela só porque `face().colocar()` adota o nó.
  const subparteDe = new Map<string, string>();
  for (const m of geometricos) {
    const a = ancestralGeometrico(m);
    if (a && apoiaEm(a, m)) subparteDe.set(m.no.id, a.no.id);
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

  // o apoio é procurado entre TODOS os nós geométricos: uma prateleira presa
  // na parede não ganha frase própria como subparte, mas continua sendo o
  // apoio dos livros que estão sobre ela
  const rotuloPorId = new Map(geometricos.map((m) => [m.no.id, rotuloDe(m.no)]));
  const caixaPorId = new Map(geometricos.map((m) => [m.no.id, m.propria ?? m.total]));
  for (const it of itens) {
    for (const outro of geometricos) {
      if (outro.no.id !== it.m.no.id && apoiadoEm(it.m, outro)) {
        it.apoioEm = outro.no.id;
        break;
      }
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

  const apoios: Apoios = { rotulo: rotuloPorId, caixa: caixaPorId };
  const frases: string[] = [frase(ancora, centroide, raioCena, apoios, true)];
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
    if (!espalhadoEmAngulo(grupo, ancora)) continue;
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
    const apoio = rotuloPorId.get(primeiro.apoioEm!)!;
    frases.push(
      `${numeral(grupo.length, primeiro.rotulo)} ${plural(primeiro.rotulo)} ` +
      `${concordar(primeiro.rotulo, "apoiad")}s sobre ` +
      `${artigoDefinido(apoio)} ${apoio}.`,
    );
    for (const it of grupo) feitos.add(it.m.no.id);
  }

  for (const it of restantes) {
    if (feitos.has(it.m.no.id)) continue;
    frases.push(frase(it, centroide, raioCena, apoios, false));
    feitos.add(it.m.no.id);
  }

  // Juntas não têm geometria própria (ficam fora de nosGeometricos()), mas a
  // pose delas é exatamente o que descreve a articulação de um objeto — vale
  // uma frase própria, em graus (mais lido que radianos).
  for (const { no } of percorrer(cena.raiz)) {
    if (no.tipo !== "junta") continue;
    const p = no.params as ParamsJunta;
    const rotulo = rotuloDe(no);
    const maiuscula = rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
    frases.push(`${maiuscula} ${concordar(rotulo, "dobrad")} a ${emGraus(p.angulo)}.`);
  }

  // Acoplamentos: `a` é a referência (fixo/suporte), `b` o dependente
  // (móvel/peça) — convenção de quem chamou `acoplar`, não algo imposto
  // pelo tipo. Frase própria por tipo, reusando o mesmo vocabulário
  // ("apoiada sobre") já usado acima para apoio geométrico comum.
  for (const ac of cena.acoplamentos()) {
    const rotuloA = rotuloDe(cena.no(ac.a.no));
    const rotuloB = rotuloDe(cena.no(ac.b.no));
    const artigoB = artigoDefinido(rotuloB);
    const ArtigoB = artigoB.charAt(0).toUpperCase() + artigoB.slice(1);
    if (ac.tipo === "pivo") {
      const nomeTexto = ac.nome ? ` "${ac.nome}"` : "";
      frases.push(
        `${ArtigoB} ${rotuloB} gira em torno do pivô${nomeTexto} d${artigoDefinido(rotuloA)} ${rotuloA}.`,
      );
    } else {
      frases.push(
        `${ArtigoB} ${rotuloB} está ${concordar(rotuloB, "assentad")} sobre ` +
        `${artigoDefinido(rotuloA)} ${rotuloA}.`,
      );
    }
  }

  // Animações: uma frase por animação, dizendo o que se move — o detalhe
  // dos quadros está no JSON; aqui é o resumo para conferir a intenção.
  const NOME_PROPRIEDADE: Record<string, string> = {
    posicao: "posição", rotacao: "rotação", escala: "escala", angulo: "ângulo", opacidade: "opacidade", cor: "cor",
  };
  const REPETICAO: Record<string, string> = { nao: "uma vez", sempre: "em loop", vaivem: "vai e volta" };
  for (const a of cena.animacoes()) {
    const porNo = new Map<string, string[]>();
    for (const f of a.faixas) porNo.set(f.no, [...(porNo.get(f.no) ?? []), NOME_PROPRIEDADE[f.propriedade]!]);
    const partes = [...porNo].map(([id, props]) => `${rotuloDe(cena.no(id))} (${props.join(", ")})`);
    frases.push(
      `Animação "${a.nome}" (${arred(duracaoDe(a), 2)} s, ${REPETICAO[a.repetir ?? "nao"]}): ` +
      `${partes.length ? `anima ${partes.join("; ")}` : "sem faixas"}.`,
    );
  }

  const avisos = cena.avisos();
  const problemas = avisos.filter((a) => a.tipo !== "contato-intencional");
  if (problemas.length > 0) {
    frases.push(
      problemas.length === 1
        ? `Aviso: ${problemas[0]!.texto}.`
        : `Avisos: ${problemas.map((a) => a.texto).join("; ")}.`,
    );
  }
  const intencionais = avisos.length - problemas.length;
  if (intencionais > 0) {
    frases.push(
      intencionais === 1
        ? "1 contato intencional ignorado."
        : `${intencionais} contatos intencionais ignorados.`,
    );
  }

  return frases.join(" ");
}

/** Distâncias parecidas não bastam para chamar um grupo de círculo: cinco
 * livros lado a lado numa prateleira ficam todos a ~2 m do centro da cena e
 * passariam no teste de raio, embora ocupem alguns graus de arco. Exige
 * também que nenhum vão angular entre vizinhos passe do dobro do vão ideal
 * (2π/n) — o que reprova qualquer grupo concentrado num setor. */
function espalhadoEmAngulo(grupo: readonly Item[], ancora: Item): boolean {
  const n = grupo.length;
  const angulos = grupo
    .map((it) => Math.atan2(
      it.caixa.centro[2]! - ancora.caixa.centro[2]!,
      it.caixa.centro[0]! - ancora.caixa.centro[0]!,
    ))
    .sort((a, b) => a - b);
  const ideal = (Math.PI * 2) / n;
  let maior = angulos[0]! + Math.PI * 2 - angulos[n - 1]!; // vão que fecha a volta
  for (let i = 1; i < n; i++) maior = Math.max(maior, angulos[i]! - angulos[i - 1]!);
  return maior <= ideal * 2;
}

interface Apoios {
  rotulo: Map<string, string>;
  caixa: Map<string, AABB>;
}

function frase(
  it: Item, centroide: Vec3, raioCena: number, apoios: Apoios, comDimensoes: boolean,
): string {
  const r = it.rotulo;
  let texto = `${numeral(1, r)} ${r}`;
  if (comDimensoes) {
    const t = it.caixa.tamanho;
    texto += ` (${arred(t[0]!, 2)} × ${arred(t[1]!, 2)} × ${arred(t[2]!, 2)} m)`;
  }
  const rotuloApoio = it.apoioEm ? apoios.rotulo.get(it.apoioEm) : undefined;
  if (rotuloApoio) {
    texto += ` ${concordar(r, "apoiad")} sobre ${artigoDefinido(rotuloApoio)} ${rotuloApoio}`;
    const onde = ondeSobre(it.caixa, apoios.caixa.get(it.apoioEm!)!);
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
