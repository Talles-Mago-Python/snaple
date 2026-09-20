/** A cena: árvore de nós + as operações que a movem.
 *
 * O estado é a fonte da verdade e é JSON puro. Nada aqui carrega arquivo,
 * abre janela ou fala com GPU — por isso a lib inteira é testável em CI. */
import { type AABB, aabbDeCentroTamanho } from "./bbox.ts";
import { type Mundo, type NoMundo, aabbSubarvore, calcularMundo } from "./mundo.ts";
import { type Mat4, aplicarDirecao, aplicarPonto, compor, decompor, inverter, multiplicar } from "./matriz.ts";
import { criarNo, ehContainer, encontrar, percorrer, type OpcoesNo } from "./no.ts";
import { resolverFlex } from "./flex.ts";
import { Face, normalizarFace } from "./face.ts";
import { Lateral } from "./lateral.ts";
import { apontar, type OpcoesApontar } from "./orientacao.ts";
import { conferirMontagem as conferirMontagemImpl, type RelatorioMontagem } from "./acoplamento.ts";
import { type GeometriaDerivada, derivarGeometria } from "./geometria.ts";
import { type Aviso, avisosDaCena, avisosEmTexto } from "./validar.ts";
import { descreverCena } from "./descrever.ts";
import {
  type Acoplamento, type CenaJSON, type FaceEntrada, type Feature, type FeatureFuro, type Material,
  type No, type ParamsDe, type TipoAcoplamento, type TipoNo, type Transform, type TransformParcial,
  VERSAO_CENA,
} from "./tipos.ts";
import { type Eixo, type IndiceEixo, type Vec3, indiceDoEixo } from "./vetor.ts";

/** Qualquer coisa que identifique um nó da cena. */
export type AlvoNo = string | NoRef | No;

export const ID_RAIZ = "raiz";

export interface OpcoesCriar extends Omit<OpcoesNo, "filhos"> {
  pai?: AlvoNo;
}

export class Cena {
  readonly raiz: No;
  #contador = 0;
  #mundo: Mundo | null = null;
  #acoplamentos: Acoplamento[] = [];
  #contadorAcoplamentos = 0;

  constructor(raiz?: No) {
    this.raiz = raiz ?? criarNo("grupo", {}, { id: ID_RAIZ });
    this.invalidar();
  }

  /** Marca o layout como pendente. Toda mutação passa por aqui; a resolução
   * acontece na próxima leitura (`mundo()`), nunca no meio de uma edição. */
  invalidar(): void {
    this.#mundo = null;
  }

  /** Resolve os containers flex (se necessário) e devolve o snapshot mundial. */
  mundo(): Mundo {
    if (!this.#mundo) {
      resolverFlex(this.raiz);
      this.#mundo = calcularMundo(this.raiz);
    }
    return this.#mundo;
  }

  // ── Árvore ─────────────────────────────────────────────────────────────

  novoId(tipo: TipoNo): string {
    let id: string;
    do {
      id = `${tipo}_${++this.#contador}`;
    } while (encontrar(this.raiz, id));
    return id;
  }

  criar<T extends TipoNo>(tipo: T, params: ParamsDe<T>, opcoes: OpcoesCriar = {}): NoRef {
    const { pai, ...resto } = opcoes;
    const no = criarNo(tipo, params, { ...resto, id: resto.id ?? this.novoId(tipo) });
    return this.adicionar(no, pai);
  }

  adicionar(no: No | NoRef, pai?: AlvoNo): NoRef {
    const alvo = no instanceof NoRef ? no.no : no;
    if (!alvo.id) alvo.id = this.novoId(alvo.tipo);
    const destino = pai === undefined ? this.raiz : this.no(pai);
    if (encontrar(this.raiz, alvo.id) && this.paiDe(alvo.id) !== null) {
      throw new Error(`nó '${alvo.id}' já está na cena; use mover/reparentar`);
    }
    if (destino === alvo) throw new Error(`nó '${alvo.id}' não pode ser pai de si mesmo`);
    destino.filhos.push(alvo);
    this.invalidar();
    return new NoRef(this, alvo.id);
  }

  /** Resolve um `AlvoNo` para o objeto `No` que está na árvore. */
  no(alvo: AlvoNo): No {
    const id = typeof alvo === "string" ? alvo : alvo instanceof NoRef ? alvo.id : alvo.id;
    const achado = encontrar(this.raiz, id);
    if (!achado) throw new Error(`nó '${id}' não existe na cena`);
    return achado;
  }

  ref(alvo: AlvoNo): NoRef {
    return new NoRef(this, this.no(alvo).id);
  }

  paiDe(alvo: AlvoNo): No | null {
    const id = this.no(alvo).id;
    for (const { no, pai } of percorrer(this.raiz)) if (no.id === id) return pai;
    return null;
  }

  remover(alvo: AlvoNo): No {
    const no = this.no(alvo);
    const pai = this.paiDe(no.id);
    if (!pai) throw new Error(`a raiz da cena não pode ser removida`);
    pai.filhos.splice(pai.filhos.indexOf(no), 1);
    // Acoplamento referenciando um nó que acabou de sair da árvore (ele ou
    // um descendente dele) fica órfão — sem isso, conferirMontagem()/o
    // linter lançariam ao tentar resolver um id que não existe mais.
    const idsRemovidos = new Set<string>();
    for (const { no: d } of percorrer(no)) idsRemovidos.add(d.id);
    this.#acoplamentos = this.#acoplamentos.filter(
      (ac) => !idsRemovidos.has(ac.a.no) && !idsRemovidos.has(ac.b.no),
    );
    this.invalidar();
    return no;
  }

  /** Move o nó para outro pai preservando a POSIÇÃO MUNDIAL. */
  reparentar(alvo: AlvoNo, novoPai: AlvoNo): NoRef {
    const no = this.no(alvo);
    const destino = this.no(novoPai);
    const mundo = this.mundo();
    const mNo = mundo.get(no.id)!.matriz;
    for (const { no: d } of percorrer(no)) {
      if (d.id === destino.id) throw new Error(`'${destino.id}' é descendente de '${no.id}'`);
    }
    const pai = this.paiDe(no.id);
    if (pai) pai.filhos.splice(pai.filhos.indexOf(no), 1);
    destino.filhos.push(no);
    const local = multiplicar(inverter(mundo.get(destino.id)!.matriz), mNo);
    aplicarMatrizLocal(no, local);
    this.invalidar();
    return new NoRef(this, no.id);
  }

  /** Todos os nós com geometria própria (exclui containers e a raiz). */
  nosGeometricos(): NoMundo[] {
    return [...this.mundo().values()].filter((m) => m.propria !== null);
  }

  // ── Leitura geométrica ────────────────────────────────────────────────

  /** AABB mundial do nó INCLUINDO toda a subárvore. É o que layout usa. */
  bbox(alvo: AlvoNo): AABB {
    return this.mundo().get(this.no(alvo).id)!.total;
  }

  /** AABB mundial só da geometria própria do nó. É o que as faces usam.
   * Em containers, cai para a AABB da subárvore (o container "é" os filhos). */
  bboxPropria(alvo: AlvoNo): AABB {
    const m = this.mundo().get(this.no(alvo).id)!;
    return m.propria ?? m.total;
  }

  /** Geometria derivada — parâmetros prontos para um backend construir malha.
   * Nunca devolve malha: devolve a RECEITA. */
  geometria(alvo: AlvoNo): GeometriaDerivada {
    return derivarGeometria(this, this.no(alvo));
  }

  // ── Movimentação (usada por todo o layout) ────────────────────────────

  /** Desloca o nó por um vetor no espaço do MUNDO, convertendo para o espaço
   * local do pai antes de gravar em `transform.posicao`. */
  deslocarMundo(alvo: AlvoNo, delta: Vec3): void {
    const no = this.no(alvo);
    const mundo = this.mundo();
    const m = mundo.get(no.id)!;
    const mPai: Mat4 = m.pai ? mundo.get(m.pai.id)!.matriz : compor([0, 0, 0], [0, 0, 0], [1, 1, 1]);
    const local = aplicarDirecao(inverter(mPai), delta);
    no.transform.posicao = [
      no.transform.posicao[0] + local[0],
      no.transform.posicao[1] + local[1],
      no.transform.posicao[2] + local[2],
    ];
    this.invalidar();
  }

  /** Move o nó para que o CENTRO da AABB da subárvore fique em `centro`. */
  definirCentroMundo(alvo: AlvoNo, centro: Vec3): void {
    const atual = this.bbox(alvo).centro;
    this.deslocarMundo(alvo, [centro[0] - atual[0], centro[1] - atual[1], centro[2] - atual[2]]);
  }

  /** Leva um ponto do espaço LOCAL de `alvo` para o espaço do MUNDO. */
  paraMundo(alvo: AlvoNo, p: Vec3): Vec3 {
    return aplicarPonto(this.mundo().get(this.no(alvo).id)!.matriz, p);
  }

  /** Leva um ponto do MUNDO para o espaço LOCAL de `alvo` — inversa de
   * `paraMundo`. */
  doMundo(alvo: AlvoNo, p: Vec3): Vec3 {
    return aplicarPonto(inverter(this.mundo().get(this.no(alvo).id)!.matriz), p);
  }

  /** Como `paraMundo`, mas para uma DIREÇÃO (ignora translação) — vetores de
   * eixo, normais. Sob escala não uniforme + rotação num ancestral, herda a
   * mesma limitação de `decompor` (ver comentário lá): o resultado é a
   * aproximação mais próxima, não uma transformação de normal exata. */
  direcaoParaMundo(alvo: AlvoNo, v: Vec3): Vec3 {
    return aplicarDirecao(this.mundo().get(this.no(alvo).id)!.matriz, v);
  }

  /** Inversa de `direcaoParaMundo`. */
  direcaoDoMundo(alvo: AlvoNo, v: Vec3): Vec3 {
    return aplicarDirecao(inverter(this.mundo().get(this.no(alvo).id)!.matriz), v);
  }

  /** Move o nó num único eixo para encostar uma BORDA da sua AABB num valor.
   * `borda`: "min" | "centro" | "max". */
  definirBordaMundo(alvo: AlvoNo, eixo: Eixo | IndiceEixo, borda: "min" | "centro" | "max", valor: number): void {
    const i = typeof eixo === "number" ? eixo : indiceDoEixo(eixo);
    const caixa = this.bbox(alvo);
    const atual = borda === "min" ? caixa.min[i]! : borda === "max" ? caixa.max[i]! : caixa.centro[i]!;
    const d: Vec3 = [0, 0, 0];
    d[i] = valor - atual;
    this.deslocarMundo(alvo, d);
  }

  // ── Edição de nós ─────────────────────────────────────────────────────

  transformar(alvo: AlvoNo, t: TransformParcial): void {
    const no = this.no(alvo);
    if (t.posicao) no.transform.posicao = [...t.posicao];
    if (t.rotacao) no.transform.rotacao = [...t.rotacao];
    if (t.escala) no.transform.escala = [...t.escala];
    this.invalidar();
  }

  definirParams<T extends TipoNo>(alvo: AlvoNo, params: Partial<ParamsDe<T>>): void {
    const no = this.no(alvo);
    Object.assign(no.params as object, params);
    this.invalidar();
  }

  definirMaterial(alvo: AlvoNo, material: Material): void {
    const no = this.no(alvo);
    no.material = { ...no.material, ...material };
    this.invalidar();
  }

  /** Declara que `alvo` pode se sobrepor com `outro` sem virar aviso de
   * interpenetração — um prego cravado numa tábua, uma rosca encaixada. Vale
   * numa direção só; não precisa chamar dos dois lados. */
  permitirContato(alvo: AlvoNo, outro: AlvoNo): void {
    const no = this.no(alvo);
    const idOutro = this.no(outro).id;
    const lista = no.validacao?.contatoIntencional ?? [];
    if (!lista.includes(idOutro)) {
      no.validacao = { ...no.validacao, contatoIntencional: [...lista, idOutro] };
    }
    this.invalidar();
  }

  // ── Acoplamentos ─────────────────────────────────────────────────────

  /** Declara uma relação entre duas faces — verificada sob demanda por
   * `conferirMontagem()`/o linter, nunca resolvida (não move nada). */
  acoplar(o: {
    tipo: TipoAcoplamento;
    nome?: string;
    a: { no: AlvoNo; face: FaceEntrada };
    b: { no: AlvoNo; face: FaceEntrada };
  }): AcoplamentoRef {
    let id: string;
    do {
      id = `acoplamento_${++this.#contadorAcoplamentos}`;
    } while (this.#acoplamentos.some((ac) => ac.id === id));
    const ac: Acoplamento = {
      id, tipo: o.tipo, ...(o.nome !== undefined ? { nome: o.nome } : {}),
      a: { no: this.no(o.a.no).id, face: normalizarFace(o.a.face) },
      b: { no: this.no(o.b.no).id, face: normalizarFace(o.b.face) },
    };
    this.#acoplamentos.push(ac);
    return new AcoplamentoRef(this, id);
  }

  acoplamentos(): readonly Acoplamento[] {
    return this.#acoplamentos;
  }

  /** Resolve um id (ou `AcoplamentoRef`) para o dado guardado na cena. */
  acoplamento(alvo: AcoplamentoRef | string): Acoplamento {
    const id = typeof alvo === "string" ? alvo : alvo.id;
    const achado = this.#acoplamentos.find((ac) => ac.id === id);
    if (!achado) throw new Error(`acoplamento '${id}' não existe na cena`);
    return achado;
  }

  desacoplar(alvo: AcoplamentoRef | string): void {
    const id = typeof alvo === "string" ? alvo : alvo.id;
    const i = this.#acoplamentos.findIndex((ac) => ac.id === id);
    if (i === -1) throw new Error(`acoplamento '${id}' não existe na cena`);
    this.#acoplamentos.splice(i, 1);
  }

  /** Confere todos os acoplamentos nas poses atuais. Nunca move nada — só
   * mede. `tolerancia` (padrão 1e-6) vale tanto para o erro de posição
   * (metros) quanto para o de ângulo (radianos): mesmo número, dois
   * sentidos — é a mesma convenção que o protótipo que motivou este método
   * já usava para os dois. */
  conferirMontagem(opcoes: { tolerancia?: number } = {}): RelatorioMontagem {
    return conferirMontagemImpl(this, this.#acoplamentos, opcoes.tolerancia ?? 1e-6);
  }

  // ── Análise ───────────────────────────────────────────────────────────

  avisos(): Aviso[] {
    return avisosDaCena(this);
  }

  avisosTexto(): string {
    return avisosEmTexto(this.avisos());
  }

  /** A cena em PROSA — relações, agrupamentos e avisos ativos. */
  descrever(): string {
    return descreverCena(this);
  }

  // ── Serialização ──────────────────────────────────────────────────────

  toJSON(): CenaJSON {
    this.mundo(); // garante que o layout já está resolvido no que sai
    return {
      version: VERSAO_CENA,
      unidade: "m",
      eixoCima: "y",
      raiz: canonizar(structuredClone(this.raiz)),
      ...(this.#acoplamentos.length ? { acoplamentos: structuredClone(this.#acoplamentos) } : {}),
    };
  }

  static deJSON(json: CenaJSON): Cena {
    if (json?.version !== VERSAO_CENA) {
      throw new Error(`versão de cena não suportada: ${String(json?.version)} (esperado ${VERSAO_CENA})`);
    }
    const cena = new Cena(structuredClone(json.raiz));
    // Retoma a numeração de ids acima do maior `tipo_N` já usado, para que
    // criar nós depois de desserializar não colida com os existentes.
    let maior = 0;
    for (const { no } of percorrer(cena.raiz)) {
      const m = /_(\d+)$/.exec(no.id);
      if (m) maior = Math.max(maior, Number(m[1]));
    }
    cena.#contador = maior;

    cena.#acoplamentos = structuredClone(json.acoplamentos ?? []);
    let maiorAcoplamento = 0;
    for (const ac of cena.#acoplamentos) {
      const m = /^acoplamento_(\d+)$/.exec(ac.id);
      if (m) maiorAcoplamento = Math.max(maiorAcoplamento, Number(m[1]));
    }
    cena.#contadorAcoplamentos = maiorAcoplamento;
    return cena;
  }
}

/** Handle sobre um acoplamento — mesmo padrão de `NoRef`, só guarda
 * `cena` + `id`; o dado de verdade mora em `Cena.acoplamentos()`. */
export class AcoplamentoRef {
  readonly cena: Cena;
  readonly id: string;

  constructor(cena: Cena, id: string) {
    this.cena = cena;
    this.id = id;
  }

  get dados(): Acoplamento { return this.cena.acoplamento(this.id); }
  get tipo(): TipoAcoplamento { return this.dados.tipo; }
  get nome(): string | undefined { return this.dados.nome; }
}

/** Handle sobre um nó da cena. Só guarda `cena` + `id` — o dado de verdade
 * continua na árvore, então um handle nunca fica dessincronizado. */
export class NoRef {
  readonly cena: Cena;
  readonly id: string;

  constructor(cena: Cena, id: string) {
    this.cena = cena;
    this.id = id;
  }

  get no(): No { return this.cena.no(this.id); }
  get tipo(): TipoNo { return this.no.tipo; }
  get nome(): string | undefined { return this.no.nome; }
  get params(): No["params"] { return this.no.params; }
  get transform(): Transform { return this.no.transform; }
  get features(): Feature[] { return this.no.features; }

  filhos(): NoRef[] {
    return this.no.filhos.map((f) => new NoRef(this.cena, f.id));
  }

  pai(): NoRef | null {
    const p = this.cena.paiDe(this.id);
    return p ? new NoRef(this.cena, p.id) : null;
  }

  /** Face nomeada do nó, como plano de trabalho. Aceita `topo|base|norte|
   * sul|leste|oeste` e os aliases `+y|-y|-z|+z|+x|-x`. */
  face(nome: FaceEntrada): Face {
    return new Face(this.cena, this.id, nome);
  }

  /** Superfície de revolução deste nó (`cylinder`/`lathe`) como plano de
   * trabalho — ver `Lateral`. */
  lateral(): Lateral {
    return new Lateral(this.cena, this.id);
  }

  bbox(): AABB { return this.cena.bbox(this.id); }
  bboxPropria(): AABB { return this.cena.bboxPropria(this.id); }
  geometria(): GeometriaDerivada { return this.cena.geometria(this.id); }

  /** Ponto do espaço local DESTE nó, levado para o mundo. */
  paraMundo(p: Vec3): Vec3 { return this.cena.paraMundo(this.id, p); }
  /** Ponto do mundo, levado para o espaço local DESTE nó. */
  doMundo(p: Vec3): Vec3 { return this.cena.doMundo(this.id, p); }
  /** Como `paraMundo`, para uma direção (ignora translação). */
  direcaoParaMundo(v: Vec3): Vec3 { return this.cena.direcaoParaMundo(this.id, v); }
  /** Como `doMundo`, para uma direção (ignora translação). */
  direcaoDoMundo(v: Vec3): Vec3 { return this.cena.direcaoDoMundo(this.id, v); }

  /** Gira o nó para que o eixo local pedido (padrão `y`) aponte em
   * `direcao`. Ver `apontar` em `orientacao.ts` para a semântica completa. */
  apontar(direcao: Vec3, opcoes?: OpcoesApontar): this {
    apontar(this, direcao, opcoes);
    return this;
  }

  adicionar(no: No | NoRef): NoRef {
    return this.cena.adicionar(no, this.id);
  }

  criar<T extends TipoNo>(tipo: T, params: ParamsDe<T>, opcoes: Omit<OpcoesCriar, "pai"> = {}): NoRef {
    return this.cena.criar(tipo, params, { ...opcoes, pai: this.id });
  }

  mover(posicao: Vec3): this {
    this.cena.transformar(this.id, { posicao });
    return this;
  }

  girar(rotacao: Vec3): this {
    this.cena.transformar(this.id, { rotacao });
    return this;
  }

  escalar(escala: Vec3 | number): this {
    const e: Vec3 = typeof escala === "number" ? [escala, escala, escala] : escala;
    this.cena.transformar(this.id, { escala: e });
    return this;
  }

  material(m: Material): this {
    this.cena.definirMaterial(this.id, m);
    return this;
  }

  nomear(nome: string): this {
    this.no.nome = nome;
    this.cena.invalidar();
    return this;
  }

  /** Declara este contato como intencional — ver `Cena.permitirContato`. */
  permitirContato(outro: AlvoNo): this {
    this.cena.permitirContato(this.id, outro);
    return this;
  }

  definirParams(params: Record<string, unknown>): this {
    this.cena.definirParams(this.id, params as never);
    return this;
  }

  /** Acrescenta um furo paramétrico. Valida ANTES de gravar: um furo
   * impossível vira erro explicando por quê, nunca um nó em estado inválido.
   * O furo fica no estado como parâmetro — mude o raio e chame
   * `geometria()` de novo. */
  furar(furo: Omit<FeatureFuro, "tipo">): this {
    const feature: FeatureFuro = { tipo: "furo", ...furo };
    const candidato = [...this.no.features, feature];
    const anteriores = this.no.features;
    this.no.features = candidato;
    try {
      derivarGeometria(this.cena, this.no);
    } catch (e) {
      this.no.features = anteriores;
      throw e;
    }
    this.cena.invalidar();
    return this;
  }

  /** Edita um furo existente e revalida. É o que torna o furo REALMENTE
   * paramétrico: mudar o raio é uma edição de estado, não um novo corte
   * sobre a malha anterior. Se a mudança tornar o furo impossível, o furo
   * antigo é restaurado e o erro explica por quê. */
  atualizarFuro(indice: number, mudancas: Partial<Omit<FeatureFuro, "tipo">>): this {
    const atual = this.no.features[indice];
    if (!atual) {
      throw new Error(`'${this.id}' não tem furo no índice ${indice} (tem ${this.no.features.length})`);
    }
    const anterior = structuredClone(atual);
    this.no.features[indice] = { ...atual, ...mudancas, tipo: "furo" } as FeatureFuro;
    try {
      derivarGeometria(this.cena, this.no);
    } catch (e) {
      this.no.features[indice] = anterior;
      throw e;
    }
    this.cena.invalidar();
    return this;
  }

  /** Remove todos os furos do nó. */
  limparFuros(): this {
    this.no.features = [];
    this.cena.invalidar();
    return this;
  }

  remover(): No {
    return this.cena.remover(this.id);
  }

  ehContainer(): boolean {
    return ehContainer(this.no);
  }
}

/** Troca `-0` por `0` em toda a árvore. `-0` aparece naturalmente em contas
 * de layout (`0 * -1`), some no `JSON.stringify` e volta como `0` — então sem
 * isto duas cenas idênticas comparariam diferente conforme tenham ou não
 * passado por um roundtrip. A saída de `toJSON()` é canônica. */
function canonizar<T>(valor: T): T {
  if (typeof valor === "number") return (Object.is(valor, -0) ? 0 : valor) as T;
  if (Array.isArray(valor)) return valor.map(canonizar) as T;
  if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) {
      (valor as Record<string, unknown>)[k] = canonizar(v);
    }
  }
  return valor;
}

/** Grava numa transform uma matriz local já pronta (usada por `reparentar`). */
function aplicarMatrizLocal(no: No, m: Mat4): void {
  const d = decompor(m);
  no.transform.posicao = d.posicao;
  no.transform.rotacao = d.rotacao;
  no.transform.escala = d.escala;
}

/** AABB da subárvore de um nó expressa NO ESPAÇO LOCAL de outro nó. É o que
 * permite a `Face` fazer todas as contas num referencial onde a normal da
 * face é um eixo, mesmo com o dono da face rotacionado no mundo. */
export function aabbNoEspacoDe(cena: Cena, alvo: AlvoNo, referencia: AlvoNo): AABB {
  const mundo = cena.mundo();
  const mAlvo = mundo.get(cena.no(alvo).id)!.matriz;
  const mRef = mundo.get(cena.no(referencia).id)!.matriz;
  const rel = multiplicar(inverter(mRef), mAlvo);
  return aabbSubarvore(cena.no(alvo), rel) ?? aabbDeCentroTamanho([rel[12]!, rel[13]!, rel[14]!], [0, 0, 0]);
}
