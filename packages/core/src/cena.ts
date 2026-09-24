/** A cena: árvore de nós + as operações que a movem.
 *
 * O estado é a fonte da verdade e é JSON puro. Nada aqui carrega arquivo,
 * abre janela ou fala com GPU — por isso a lib inteira é testável em CI. */
import { type AABB, aabbDeCentroTamanho } from "./bbox.ts";
import {
  type Mundo, type MundoIncremental, type NoMundo, aabbSubarvore, atualizarMundo, calcularMundoComTotais,
} from "./mundo.ts";
import { type Mat4, aplicarDirecao, aplicarPonto, compor, decompor, inverter, multiplicar } from "./matriz.ts";
import { criarNo, ehContainer, indexar, percorrer, type OpcoesNo } from "./no.ts";
import { resolverFlex } from "./flex.ts";
import { Face, normalizarFace } from "./face.ts";
import { Lateral } from "./lateral.ts";
import { apontar, type OpcoesApontar } from "./orientacao.ts";
import { conferirMontagem as conferirMontagemImpl, type RelatorioMontagem } from "./acoplamento.ts";
import { type GeometriaDerivada, derivarGeometria } from "./geometria.ts";
import { type Aviso, avisosDaCena, avisosEmTexto } from "./validar.ts";
import { descreverCena } from "./descrever.ts";
import {
  aplicarPose, duracaoDe, tempoNoCiclo, validarAnimacao, validarFaixa,
} from "./animacao.ts";
import { derivarAdesivos } from "./adesivos.ts";
import {
  type Acoplamento, type Adesivo, type Animacao, type CenaJSON, type FaixaAnimacao, type Interpolacao,
  type PropriedadeAnimavel, type Quadro, type RepeticaoAnimacao, type ValorAnimado, type FaceEntrada, type Feature, type FeatureFuro, type Material,
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
  #mundo: MundoIncremental | null = null;
  /** O que mudou desde o último `mundo()` — ver `invalidar(alvo)`. */
  #sujos = new Set<string>();
  #caixasSujas = new Set<string>();
  #removidos = new Set<string>();
  #reordenar = false;
  #acoplamentos: Acoplamento[] = [];
  #animacoes: Animacao[] = [];
  #contadorAcoplamentos = 0;
  /** `id → { nó, pai }`. Mantido incrementalmente por `adicionar`/`remover`/
   * `reparentar` e reconstruído inteiro quando um id não é achado — o que
   * cobre quem mexe em `filhos` por fora da API. Sem ele, todo `no(id)` era
   * uma busca linear na árvore, e montar uma cena de n nós custava O(n²). */
  #indice: Map<string, { no: No; pai: No | null }> | null = null;

  constructor(raiz?: No) {
    this.raiz = raiz ?? criarNo("grupo", {}, { id: ID_RAIZ });
    this.invalidar();
  }

  /** Marca o layout como pendente. Toda mutação passa por aqui; a resolução
   * acontece na próxima leitura (`mundo()`), nunca no meio de uma edição.
   *
   * Com `alvo`, avisa que só aquele nó mudou (transform, params, ou acabou
   * de entrar na árvore com a subárvore dele): a próxima leitura recalcula
   * só essa subárvore e as caixas dos ancestrais, em vez da cena inteira.
   * Sem `alvo` — o caso seguro para qualquer edição feita por fora da API,
   * inclusive mexer em `filhos` à mão —, tudo é recalculado. */
  invalidar(alvo?: AlvoNo): void {
    if (alvo === undefined) {
      this.#mundo = null;
      this.#limparPendencias();
    } else if (this.#mundo) {
      this.#sujos.add(typeof alvo === "string" ? alvo : alvo.id);
    }
  }

  /** Resolve os containers flex (se necessário) e devolve o snapshot mundial. */
  mundo(): Mundo {
    if (this.#mundo && (this.#sujos.size || this.#caixasSujas.size || this.#removidos.size)) {
      const sujos = this.#sujosNoTopo();
      const caixas: No[] = [];
      for (const id of this.#caixasSujas) {
        const e = this.#entrada(id, false);
        if (e) caixas.push(e.no);
      }
      this.#mundo = sujos && atualizarMundo(this.raiz, this.#mundo, {
        sujos, caixas, removidos: this.#removidos, reordenar: this.#reordenar,
      });
    }
    this.#limparPendencias();
    if (!this.#mundo) {
      resolverFlex(this.raiz);
      this.#mundo = calcularMundoComTotais(this.raiz);
    }
    return this.#mundo.mundo;
  }

  #limparPendencias(): void {
    this.#sujos.clear();
    this.#caixasSujas.clear();
    this.#removidos.clear();
    this.#reordenar = false;
  }

  /** Os sujos que não descendem de outro sujo (a subárvore deles já será
   * recalculada pelo ancestral), com o pai de cada um. `null` se algum não
   * estiver mais na árvore — aí o incremental não se aplica. */
  #sujosNoTopo(): { no: No; pai: No | null }[] | null {
    const topo: { no: No; pai: No | null }[] = [];
    for (const id of this.#sujos) {
      const e = this.#entrada(id, false);
      if (!e) return null;
      let coberto = false;
      for (let p = e.pai; p && !coberto; p = this.#entrada(p.id, false)?.pai ?? null) {
        coberto = this.#sujos.has(p.id);
      }
      if (!coberto) topo.push(e);
    }
    return topo;
  }

  // ── Árvore ─────────────────────────────────────────────────────────────

  novoId(tipo: TipoNo): string {
    let id: string;
    do {
      id = `${tipo}_${++this.#contador}`;
    } while (this.#entrada(id, false));
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
    if (this.#entrada(alvo.id, false)?.pai) {
      throw new Error(`nó '${alvo.id}' já está na cena; use mover/reparentar`);
    }
    if (destino === alvo) throw new Error(`nó '${alvo.id}' não pode ser pai de si mesmo`);
    destino.filhos.push(alvo);
    if (this.#indice) indexar(alvo, destino, this.#indice);
    this.invalidar(alvo);
    return new NoRef(this, alvo.id);
  }

  /** `pai` perdeu um filho: a caixa dele muda e a pré-ordem também. */
  #mudouEstrutura(pai: No): void {
    if (!this.#mundo) return;
    this.#caixasSujas.add(pai.id);
    this.#reordenar = true;
  }

  /** Resolve um `AlvoNo` para o objeto `No` que está na árvore. */
  no(alvo: AlvoNo): No {
    const id = typeof alvo === "string" ? alvo : alvo instanceof NoRef ? alvo.id : alvo.id;
    const achado = this.#entrada(id);
    if (!achado) throw new Error(`nó '${id}' não existe na cena`);
    return achado.no;
  }

  /** Busca pelo índice. Com `reconstruir`, um id ausente reconstrói o
   * índice uma vez antes de desistir (a árvore pode ter sido editada por fora
   * da API); sem, a falta é a resposta — é o caso de `novoId`/`adicionar`,
   * que procuram justamente ids que ainda NÃO existem. */
  #entrada(id: string, reconstruir = true): { no: No; pai: No | null } | undefined {
    this.#indice ??= indexar(this.raiz);
    const e = this.#indice.get(id);
    if (e && e.no.id === id) return e;
    if (!reconstruir) return undefined;
    this.#indice = indexar(this.raiz);
    return this.#indice.get(id);
  }

  ref(alvo: AlvoNo): NoRef {
    return new NoRef(this, this.no(alvo).id);
  }

  paiDe(alvo: AlvoNo): No | null {
    const id = this.no(alvo).id;
    return this.#entrada(id)!.pai;
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
    for (const { no: d } of percorrer(no)) {
      idsRemovidos.add(d.id);
      this.#indice?.delete(d.id);
      this.#sujos.delete(d.id);
      if (this.#mundo) this.#removidos.add(d.id);
    }
    this.#acoplamentos = this.#acoplamentos.filter(
      (ac) => !idsRemovidos.has(ac.a.no) && !idsRemovidos.has(ac.b.no),
    );
    // idem para faixas de animação: o nó animado saiu da cena
    for (const a of this.#animacoes) a.faixas = a.faixas.filter((f) => !idsRemovidos.has(f.no));
    this.#mudouEstrutura(pai);
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
    this.#indice?.set(no.id, { no, pai: destino });
    const local = multiplicar(inverter(mundo.get(destino.id)!.matriz), mNo);
    aplicarMatrizLocal(no, local);
    this.invalidar(no);
    if (pai) this.#mudouEstrutura(pai);
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
    this.invalidar(no);
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
    this.invalidar(no);
  }

  definirParams<T extends TipoNo>(alvo: AlvoNo, params: Partial<ParamsDe<T>>): void {
    const no = this.no(alvo);
    Object.assign(no.params as object, params);
    this.invalidar(no);
  }

  definirMaterial(alvo: AlvoNo, material: Material): void {
    const no = this.no(alvo);
    no.material = { ...no.material, ...material };
    this.invalidar(no);
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
    this.invalidar(no);
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

  // ── Animações ────────────────────────────────────────────────────────

  /** Cria uma animação vazia; as faixas entram por `AnimacaoRef.faixa`. */
  animar(nome: string, opcoes: { duracao?: number; repetir?: RepeticaoAnimacao } = {}): AnimacaoRef {
    const a: Animacao = {
      nome,
      ...(opcoes.duracao !== undefined ? { duracao: opcoes.duracao } : {}),
      ...(opcoes.repetir !== undefined ? { repetir: opcoes.repetir } : {}),
      faixas: [],
    };
    validarAnimacao(a);
    if (this.#animacoes.some((x) => x.nome === nome)) throw new Error(`já existe uma animação '${nome}'`);
    this.#animacoes.push(a);
    return new AnimacaoRef(this, nome);
  }

  animacoes(): readonly Animacao[] {
    return this.#animacoes;
  }

  /** O dado guardado da animação `nome`. */
  animacao(nome: string): Animacao {
    const a = this.#animacoes.find((x) => x.nome === nome);
    if (!a) throw new Error(`animação '${nome}' não existe na cena`);
    return a;
  }

  removerAnimacao(nome: string): void {
    this.animacao(nome);
    this.#animacoes = this.#animacoes.filter((x) => x.nome !== nome);
  }

  /** Grava uma faixa na animação, validada contra o nó (substitui a faixa
   * da mesma propriedade no mesmo nó, se houver). */
  definirFaixa(nome: string, faixa: FaixaAnimacao): void {
    const a = this.animacao(nome);
    const no = this.no(faixa.no);
    const f: FaixaAnimacao = { ...structuredClone(faixa), no: no.id };
    validarFaixa(f, no);
    a.faixas = [...a.faixas.filter((x) => !(x.no === f.no && x.propriedade === f.propriedade)), f];
  }

  /** A cena INTEIRA no instante `t` (segundos desde o play, já levando em
   * conta `repetir`) da animação `nome` — uma cópia; esta cena não muda.
   * Tudo funciona nela: bbox, faces, `avisos()`, `descrever()`. */
  poseEm(nome: string, t: number): Cena {
    const a = this.animacao(nome);
    const copia = Cena.deJSON(this.toJSON());
    aplicarPose(a, tempoNoCiclo(a, t), (id) => this.no(id), (id) => copia.no(id));
    copia.invalidar();
    return copia;
  }

  /** Roda o linter ao longo de um ciclo da animação e devolve só os
   * instantes com problemas NOVOS — os que a cena parada não tem (uma porta
   * que atravessa a parede ao abrir, uma junta que passa do limite). */
  conferirAnimacao(nome: string, opcoes: { amostras?: number } = {}): ConferenciaAnimacao[] {
    const a = this.animacao(nome);
    const d = duracaoDe(a);
    const n = Math.max(1, Math.round(opcoes.amostras ?? 30));
    const tempos = [...new Set([
      ...Array.from({ length: n + 1 }, (_, i) => (d * i) / n),
      ...a.faixas.flatMap((f) => f.quadros.map((q) => q.t)).filter((t) => t <= d),
    ])].sort((x, y) => x - y);
    const chave = (x: Aviso) => `${x.tipo} ${"nos" in x ? x.nos.join(" ") : "no" in x ? x.no : ""}`;
    const problema = (x: Aviso) => x.tipo !== "contato-intencional";
    const base = new Set(this.avisos().filter(problema).map(chave));
    // uma cópia só, reposicionada a cada instante: toda faixa grava valor
    // absoluto, então o que não é animado continua em repouso
    const pose = Cena.deJSON(this.toJSON());
    const resultado: ConferenciaAnimacao[] = [];
    for (const t of tempos) {
      aplicarPose(a, t, (id) => this.no(id), (id) => pose.no(id));
      pose.invalidar();
      const novos = pose.avisos().filter((x) => problema(x) && !base.has(chave(x)));
      if (novos.length) resultado.push({ t, avisos: novos });
    }
    return resultado;
  }

  /** `conferirAnimacao` em texto, um instante por linha. Vazio = nada novo. */
  conferirAnimacaoTexto(nome: string, opcoes: { amostras?: number } = {}): string {
    return this.conferirAnimacao(nome, opcoes)
      .map(({ t, avisos }) => `t=${t.toFixed(2)} s: ${avisos.map((x) => x.texto).join("; ")}`)
      .join("\n");
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
      ...(this.#animacoes.length ? { animacoes: canonizar(structuredClone(this.#animacoes)) } : {}),
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
    cena.#animacoes = structuredClone(json.animacoes ?? []);
    return cena;
  }
}

/** Um instante de `conferirAnimacao` com problemas que a cena parada não tem. */
export interface ConferenciaAnimacao {
  t: number;
  avisos: Aviso[];
}

/** Handle sobre uma animação — só guarda `cena` + `nome`. */
export class AnimacaoRef {
  readonly cena: Cena;
  readonly nome: string;

  constructor(cena: Cena, nome: string) {
    this.cena = cena;
    this.nome = nome;
  }

  get dados(): Animacao { return this.cena.animacao(this.nome); }

  /** Anima `propriedade` de `alvo`. `quadros` como pares `[t, valor]` (ou
   * `{ t, valor }`), em segundos, em ordem crescente de `t`:
   *
   * ```ts
   * cena.animar("abrir", { repetir: "vaivem" })
   *   .faixa(dobradica, "angulo", [[0, 0], [1.5, -1.2]], { interpolacao: "suave" })
   *   .faixa(gaveta, "posicao", [[0, [0, 0, 0]], [1, [0, 0, 0.3]]], { relativo: true });
   * ``` */
  faixa(
    alvo: AlvoNo,
    propriedade: PropriedadeAnimavel,
    quadros: readonly (readonly [number, ValorAnimado] | Quadro)[],
    opcoes: { interpolacao?: Interpolacao; relativo?: boolean } = {},
  ): this {
    this.cena.definirFaixa(this.nome, {
      no: this.cena.no(alvo).id,
      propriedade,
      quadros: quadros.map((q) => (Array.isArray(q) ? { t: q[0], valor: q[1] } : q as Quadro)),
      ...(opcoes.interpolacao ? { interpolacao: opcoes.interpolacao } : {}),
      ...(opcoes.relativo ? { relativo: true } : {}),
    });
    return this;
  }

  poseEm(t: number): Cena { return this.cena.poseEm(this.nome, t); }
  conferir(opcoes: { amostras?: number } = {}): ConferenciaAnimacao[] {
    return this.cena.conferirAnimacao(this.nome, opcoes);
  }
  remover(): void { this.cena.removerAnimacao(this.nome); }
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
    this.cena.invalidar(this.id);
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
    this.cena.invalidar(this.id);
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
    this.cena.invalidar(this.id);
    return this;
  }

  /** Cola uma imagem numa região da superfície — ver `Adesivo`. Valida
   * antes de gravar (face que o tipo não tem, tamanho inválido viram erro). */
  colarAdesivo(adesivo: Adesivo): this {
    const anteriores = this.no.adesivos;
    this.no.adesivos = [...(anteriores ?? []), structuredClone(adesivo)];
    try {
      derivarAdesivos(this.no);
    } catch (e) {
      if (anteriores) this.no.adesivos = anteriores;
      else delete this.no.adesivos;
      throw e;
    }
    this.cena.invalidar(this.id);
    return this;
  }

  limparAdesivos(): this {
    delete this.no.adesivos;
    this.cena.invalidar(this.id);
    return this;
  }

  /** Remove todos os furos do nó. */
  limparFuros(): this {
    this.no.features = [];
    this.cena.invalidar(this.id);
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
