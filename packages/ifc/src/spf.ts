/** Escritor mínimo de STEP/SPF (ISO 10303-21) — o formato texto do `.ifc`.
 *
 * Decisão registrada no README do pacote: escrever o SPF diretamente, sem
 * biblioteca IFC de terceiros. O formato é texto estruturado simples (uma
 * entidade por linha, `#N=TIPO(atributos);`) e escrever à mão evita puxar
 * `web-ifc`/bindings wasm só para produzir um arquivo — o mesmo raciocínio
 * que já vale para o resto do projeto (nenhuma dependência pesada por
 * conveniência). */

/** Referência a outra entidade (`#N` no texto). Classe em vez de parameter
 * property (`constructor(readonly n)`) de propósito: o projeto compila com
 * `erasableSyntaxOnly`, que proíbe sintaxe TS que não seja pura remoção de
 * tipos — parameter properties emitem atribuição de verdade, então o campo
 * é declarado e atribuído à mão. */
export class Ref {
  readonly n: number;
  constructor(n: number) {
    this.n = n;
  }
}
export function ref(n: number): Ref {
  return new Ref(n);
}

/** Valor enumerado do EXPRESS (`.ENUM.` no texto). */
export class EnumIfc {
  readonly nome: string;
  constructor(nome: string) {
    this.nome = nome;
  }
}
export function enumIfc(nome: string): EnumIfc {
  return new EnumIfc(nome);
}

/** Valor tipado nomeado (`IFCLENGTHMEASURE(1.5)`), usado onde o schema pede
 * um `SELECT` e o tipo concreto precisa ficar explícito no texto. */
export class Tipado {
  readonly tipo: string;
  readonly valor: StepValor;
  constructor(tipo: string, valor: StepValor) {
    this.tipo = tipo;
    this.valor = valor;
  }
}
export function tipado(tipo: string, valor: StepValor): Tipado {
  return new Tipado(tipo, valor);
}

/** Literal INTEGER do STEP — sem ponto decimal, ao contrário de todo
 * `number` normal (formatado como REAL, ver `formatarReal`). Só um punhado
 * de atributos do schema IFC4 são INTEGER de verdade (ex.:
 * `IfcGeometricRepresentationContext.CoordinateSpaceDimension`); os demais
 * (comprimento, ângulo, razão) são sempre REAL mesmo quando o valor é
 * inteiro. Descoberto rodando o validador oficial do schema via
 * `ifcopenshell` (ver README do pacote) — sem isso, `3` saía como `3.` e o
 * validador recusava o atributo. */
export class Inteiro {
  readonly valor: number;
  constructor(valor: number) {
    if (!Number.isInteger(valor)) throw new Error(`Inteiro() recebeu um não-inteiro: ${valor}`);
    this.valor = valor;
  }
}
export function inteiro(valor: number): Inteiro {
  return new Inteiro(valor);
}

/** `$` — atributo opcional omitido. Diferente de `undefined` (que nesta API
 * nunca deve aparecer numa lista de atributos: cada construtor de entidade é
 * explícito sobre o que é opcional, para não esquecer um atributo de
 * verdade por engano). Classe (não `Symbol`) pelo mesmo motivo do `Ref`
 * acima: comportamento consistente e previsível sob `erasableSyntaxOnly`. */
export class Omitido {}
export const OMITIDO = new Omitido();

/** `*` — atributo DERIVADO (o schema calcula o valor a partir de outros
 * atributos da própria entidade; ex.: `IfcSIUnit.Dimensions`, derivado do
 * `UnitType`). Sintaxe STEP diferente de `$` — confundir os dois é
 * exatamente o tipo de erro que só um validador de schema de verdade pega
 * (ver README do pacote: rodamos o `ifcopenshell.validate` real contra a
 * saída deste exportador, e foi assim que este caso apareceu). */
export class Derivado {}
export const DERIVADO = new Derivado();

export type StepValor =
  | number
  | string
  | boolean
  | Ref
  | EnumIfc
  | Tipado
  | Inteiro
  | Omitido
  | Derivado
  | readonly StepValor[];

function escaparString(s: string): string {
  // STEP exige codificação \X2\.../\X0\ para não-ASCII; como o texto aqui é
  // sempre gerado por nós (nomes de nó, autor), um escape simples de aspas e
  // barra invertida já cobre o caso real sem trazer um encoder completo.
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

/** Formata um número como REAL do STEP: sempre com ponto decimal (STEP
 * distingue INTEGER de REAL pela sintaxe do literal), sem notação científica
 * fora da faixa em que ela é necessária. */
function formatarReal(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`número não finito em atributo IFC: ${n}`);
  if (Object.is(n, -0)) n = 0;
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return `${n}.`;
  let s = n.toPrecision(12);
  if (s.includes("e") || s.includes("E")) return s;
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, ".0");
  return s.includes(".") ? s : `${s}.`;
}

export function formatarValor(v: StepValor): string {
  if (v === OMITIDO) return "$";
  if (v === DERIVADO) return "*";
  if (typeof v === "number") return formatarReal(v);
  if (typeof v === "string") return `'${escaparString(v)}'`;
  if (typeof v === "boolean") return v ? ".T." : ".F.";
  if (v instanceof Ref) return `#${v.n}`;
  if (v instanceof EnumIfc) return `.${v.nome}.`;
  if (v instanceof Inteiro) return `${v.valor}`;
  if (v instanceof Tipado) return `${v.tipo}(${formatarValor(v.valor)})`;
  if (Array.isArray(v)) return `(${v.map(formatarValor).join(",")})`;
  throw new Error(`valor STEP desconhecido: ${JSON.stringify(v)}`);
}

export interface CabecalhoSPF {
  nomeArquivo: string;
  timestamp: string;
  autor: string;
  organizacao: string;
  aplicacao: string;
  schema: string;
}

/** Monta as linhas de `DATA` e numera as entidades. Cada `#N` é atribuído em
 * ordem de criação — determinístico: a mesma sequência de chamadas produz
 * sempre os mesmos números, o que é o que faz exportar a cena duas vezes
 * gerar arquivos idênticos (junto dos GUIDs estáveis, ver `guid.ts`). */
export class ArquivoIFC {
  #proximoId = 1;
  #linhas: string[] = [];

  novaEntidade(tipo: string, atributos: readonly StepValor[]): Ref {
    const id = this.#proximoId++;
    this.#linhas.push(`#${id}=${tipo}(${atributos.map(formatarValor).join(",")});`);
    return ref(id);
  }

  get totalEntidades(): number {
    return this.#proximoId - 1;
  }

  textoSPF(cabecalho: CabecalhoSPF): string {
    const linhas = [
      "ISO-10303-21;",
      "HEADER;",
      `FILE_DESCRIPTION((''),'2;1');`,
      `FILE_NAME(${[
        cabecalho.nomeArquivo, cabecalho.timestamp, [cabecalho.autor], [cabecalho.organizacao],
        cabecalho.aplicacao, "snaple", "",
      ].map(formatarValor).join(",")});`,
      `FILE_SCHEMA((${formatarValor(cabecalho.schema)}));`,
      "ENDSEC;",
      "DATA;",
      ...this.#linhas,
      "ENDSEC;",
      "END-ISO-10303-21;",
      "",
    ];
    return linhas.join("\n");
  }
}
