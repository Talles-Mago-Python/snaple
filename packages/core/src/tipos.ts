/** Modelo de dados da cena. Tudo aqui é JSON puro e serializável.
 *
 * Regra inegociável do projeto: **o estado nunca guarda malha**. Só
 * parâmetros. Vértices/índices são SEMPRE derivados (ver `geometria.ts`), o
 * que é o que mantém um furo editável depois de feito e faz a cena sobreviver
 * à troca de backend. */
import type { Ponto2D, Vec3 } from "./vetor.ts";

/** Versão do formato de cena serializado. Incrementada só em mudança
 * incompatível; o JSON Schema normativo vive em `spec/cena.schema.json`. */
export const VERSAO_CENA = 1 as const;

// ── Transform ────────────────────────────────────────────────────────────

/** Rotação em RADIANOS, Euler XYZ intrínseca. Escala é multiplicativa. */
export interface Transform {
  posicao: Vec3;
  rotacao: Vec3;
  escala: Vec3;
}

export type TransformParcial = Partial<Transform>;

// ── Tipos de nó ──────────────────────────────────────────────────────────

/** Geometrias paramétricas. Todas centradas na PRÓPRIA origem local — ver
 * `bbox.ts` para por que essa invariante simplifica todo o resto. */
export type TipoGeometria =
  | "box" | "sphere" | "cylinder" | "cone" | "plane" | "torus"
  | "extrude" | "lathe" | "helix" | "sweep";

/** Nó que referencia um arquivo externo por `src`, com `tamanho` declarado. */
export type TipoModelo = "model";

/** Containers: não têm geometria própria, só organizam filhos. `junta` é um
 * container também nesse sentido (sem geometria) — ver `ParamsJunta`. */
export type TipoContainer = "grupo" | "row" | "column" | "stack" | "junta";

export type TipoNo = TipoGeometria | TipoModelo | TipoContainer;

// ── Params por tipo ──────────────────────────────────────────────────────

export interface ParamsBox { largura: number; altura: number; profundidade: number }
export interface ParamsSphere { raio: number; segmentos?: number }
/** `raioTopo`/`raioBase` diferentes dão um tronco de cone; iguais, um
 * cilindro reto (o único caso em que `furo` é possível sem CSG). */
export interface ParamsCylinder { raioTopo: number; raioBase: number; altura: number; segmentos?: number }
export interface ParamsCone { raio: number; altura: number; segmentos?: number }
/** Superfície plana no plano XZ local (normal = +y), espessura zero. */
export interface ParamsPlane { largura: number; profundidade: number }
/** Anel no plano XZ local, eixo de simetria em +y. */
export interface ParamsTorus { raio: number; raioTubo: number; segmentos?: number; segmentosTubo?: number }
/** Perfil 2D fechado no plano XZ local (u=x, v=z), extrudado ao longo de +y.
 *
 * `recentrar` (padrão `true`) recentra o perfil na própria bounding box antes
 * de extrudar — é o que preserva a invariante geral de geometria centrada na
 * origem local. `recentrar: false` usa as coordenadas do perfil como estão,
 * sem deslocar: o nó nasce com a origem local onde o perfil a colocou, não no
 * centro da peça. Isso é uma EXCEÇÃO deliberada à invariante, para quem
 * projeta o perfil num sistema de coordenadas próprio (por exemplo, várias
 * peças desenhadas para se encaixarem por um ponto de referência comum) e
 * precisa que esse ponto continue sendo a origem do nó. O eixo de extrusão
 * (y) continua sempre centrado, `recentrar` só afeta o plano XZ. */
export interface ParamsExtrude { perfil: Ponto2D[]; altura: number; recentrar?: boolean }
/** Perfil `[raio, altura]` revolucionado em torno do eixo +y local.
 *
 * Por padrão (`recentrar` ausente ou `true`) o core recentra o perfil em Y
 * antes de revolucionar, preservando a invariante de geometria centrada na
 * origem local — mesma ideia de `ParamsExtrude.recentrar`, só que aqui é o
 * eixo Y que se ajusta (o eixo da revolução), não o plano XZ (que já é
 * sempre simétrico em torno do eixo, por ser um sólido de revolução).
 * `recentrar: false` usa as alturas do perfil como estão, sem deslocar — o
 * nó nasce com a origem local onde o perfil a colocou. */
export interface ParamsLathe { perfil: Ponto2D[]; segmentos?: number; recentrar?: boolean }
/** Hélice: um tubo de seção circular varrendo um caminho helicoidal em torno
 * do eixo +y local, centrado na origem — mesmo eixo de `cylinder`/`lathe`.
 * `passo` é a distância percorrida em y por volta completa; `voltas` pode ser
 * fracionário. Caso particular de varredura com forma fechada — para um
 * caminho qualquer, ver `sweep`. */
export interface ParamsHelix {
  raio: number;
  raioTubo: number;
  passo: number;
  voltas: number;
  segmentosPorVolta?: number;
  segmentosTubo?: number;
}
/** Seção de um `sweep`, no plano `(s, t)` do anel: `s` à direita de quem
 * percorre o caminho, `t` para `cima`. `circulo`/`retangulo` são centrados no
 * caminho; `espessura` os deixa ocos (cano, metalon). `poligono` usa os
 * pontos como estão — o caminho passa pela origem `(0, 0)` deles, o que
 * permite posicionar uma cantoneira pela quina, por exemplo (ver
 * `perfilL`/`perfilU`/`perfilI`/`perfilT` em `perfis.ts`). */
export type SecaoSweep =
  | { tipo: "circulo"; raio: number; segmentos?: number; espessura?: number }
  | { tipo: "retangulo"; largura: number; altura: number; espessura?: number }
  | { tipo: "poligono"; pontos: Ponto2D[] };

/** Uma seção 2D varrendo um caminho 3D (fio, cabo, cano dobrado, metalon,
 * cantoneira, quadro soldado). Ver `varredura.ts`.
 *
 * - `caminho`: pontos no espaço local do nó.
 * - Cantos: por padrão, canto vivo em meia-esquadria; `raioCurva` troca cada
 *   canto por uma dobra em arco desse raio; `suavizar: true` passa uma curva
 *   suave (Catmull-Rom) por todos os pontos.
 * - `fechado`: liga o último ponto ao primeiro (anel, moldura), sem tampas.
 * - `cima` (padrão `[0, 1, 0]`): para onde aponta o `t` da seção no primeiro
 *   ponto; dali em diante a seção acompanha o caminho sem torcer.
 * - `segmentos` (padrão 12): subdivisões de cada vão suave ou dobra de 90°.
 * - `recentrar` (padrão `true`): como em `extrude` — a origem local vai para
 *   o centro da peça. `false` mantém o caminho nas coordenadas dadas, o que é
 *   o natural para um fio ligando pontos conhecidos do pai. */
export interface ParamsSweep {
  caminho: Vec3[];
  secao: SecaoSweep;
  suavizar?: boolean;
  raioCurva?: number;
  fechado?: boolean;
  cima?: Vec3;
  segmentos?: number;
  recentrar?: boolean;
}
/** Objeto por referência. `tamanho` é a bounding box DECLARADA e é o que o
 * layout usa — sem carregar o arquivo, exatamente como `width`/`height` num
 * `<img>`. Se `src` não existir, o backend desenha uma caixa proxy. */
export interface ParamsModel { src: string; tamanho: Vec3 }

export type Justify =
  | "start" | "center" | "end"
  | "space-between" | "space-around" | "space-evenly";
export type Align = "start" | "center" | "end";

/** Params comuns a `row`/`column`/`stack`. `extensao` é o tamanho do
 * container no eixo principal, em metros; sem ele os filhos ficam apenas
 * empacotados com `gap` e centrados na origem do container (não há espaço
 * livre a distribuir, então `justify` space-* vira `center`). */
export interface ParamsFlex {
  extensao?: number;
  gap?: number;
  justify?: Justify;
  align?: Align;
}

export type ParamsGrupo = Record<string, never>;

/** Junta articulada: sem geometria própria (como `grupo`), mas a ROTAÇÃO em
 * torno de `eixo` vem de `angulo`, não de `transform.rotacao` (que fica sem
 * efeito num nó `junta` — mudar a pose é `definirParams`, não `transformar`).
 * `limites`, se presente, é `[mínimo, máximo]` em radianos; o linter avisa
 * quando `angulo` sai desse intervalo, mas nunca bloqueia. */
export interface ParamsJunta {
  eixo: "x" | "y" | "z";
  angulo: number;
  limites?: [number, number];
}

/** Mapa tipo → forma dos params. É o que dá autocomplete correto em
 * `cena.criar('box', { ... })` sem `any`. */
export interface ParamsPorTipo {
  box: ParamsBox;
  sphere: ParamsSphere;
  cylinder: ParamsCylinder;
  cone: ParamsCone;
  plane: ParamsPlane;
  torus: ParamsTorus;
  extrude: ParamsExtrude;
  lathe: ParamsLathe;
  helix: ParamsHelix;
  sweep: ParamsSweep;
  model: ParamsModel;
  grupo: ParamsGrupo;
  row: ParamsFlex;
  column: ParamsFlex;
  stack: ParamsFlex;
  junta: ParamsJunta;
}

export type ParamsDe<T extends TipoNo> = ParamsPorTipo[T];
export type ParamsQualquer = ParamsPorTipo[TipoNo];

// ── Faces ────────────────────────────────────────────────────────────────

/** Nomes semânticos das 6 faces. Os aliases de eixo são aceitos em toda a
 * API e normalizados para estes nomes. */
export type NomeFace = "topo" | "base" | "norte" | "sul" | "leste" | "oeste";
export type AliasFace = "+y" | "-y" | "-z" | "+z" | "+x" | "-x";
export type FaceEntrada = NomeFace | AliasFace;

// ── Features ─────────────────────────────────────────────────────────────

export interface FormaCirculo { tipo: "circulo"; raio: number; segmentos?: number }
export interface FormaRetangulo { tipo: "retangulo"; largura: number; altura: number }
/** Polígono fechado no plano da face, coordenadas (u,v) relativas ao centro
 * do furo — não ao centro da face. */
export interface FormaPoligono { tipo: "poligono"; pontos: Ponto2D[] }
export type FormaFuro = FormaCirculo | FormaRetangulo | FormaPoligono;

/** Furo paramétrico. Fica GUARDADO no nó (é estado, não uma operação
 * destrutiva): muda-se o raio e a geometria é regerada.
 * `u`/`v` são coordenadas no plano da face, com origem no centro da face.
 * `profundidade` omitida = furo passante. */
export interface FeatureFuro {
  tipo: "furo";
  face: FaceEntrada;
  forma: FormaFuro;
  u: number;
  v: number;
  profundidade?: number;
}

export type Feature = FeatureFuro;

// ── Material ─────────────────────────────────────────────────────────────

/** Descrição de aparência NEUTRA — deliberadamente sem nenhum nome de campo
 * do Three.js. Cada backend traduz para o seu próprio modelo de material. */
export interface Material {
  cor?: string;
  metalico?: number;
  rugosidade?: number;
  opacidade?: number;
  aramado?: boolean;
  /** Sombreamento chapado: cada face recebe uma cor só, e o polígono
   * aparece mesmo em superfícies curvas (`sphere`, `cone`, `lathe` com
   * poucos segmentos). É o que dá o visual low poly. Padrão `false`. */
  facetado?: boolean;
  /** Cor própria, que não depende de luz — um mostrador de relógio aceso,
   * um LED. `intensidade` (padrão 1) escala a cor antes de somar; backends
   * sem HDR devem tratar valores acima de 1 como recorte no branco. */
  emissivo?: { cor: string; intensidade?: number };
  /** Imagem repetida sobre a superfície inteira do nó (madeira, tecido,
   * chapa). O mapeamento é o UV canônico de cada tipo (ver `spec/README.md`):
   * cada face plana vai de 0 a 1, e superfícies curvas vão de 0 a 1 ao redor
   * e ao longo. Para uma imagem numa REGIÃO da peça, use `adesivos`. */
  textura?: Textura;
}

export interface Textura {
  /** Caminho/URL da imagem, resolvido pelo backend (como `model.src`). */
  src: string;
  /** Quantas vezes a imagem se repete em (u, v). Padrão `[1, 1]`. */
  repetir?: [number, number];
  /** Giro da imagem, em radianos, em torno do centro. */
  rotacao?: number;
}

/** Imagem colada numa região de uma superfície do nó — rótulo de lata, tela
 * de monitor, logo numa caneca. É aparência, não geometria: não entra em
 * bbox, layout nem linter.
 *
 * - Face plana (`topo`, `sul`, ... e aliases): `u`/`v` posicionam o CENTRO
 *   no plano da face, com a mesma convenção de `furar`/`colocar` (origem no
 *   centro da face); `largura`/`altura` em metros. Padrão: a face inteira.
 *   A imagem sai legível vista de fora: o topo dela aponta para +y nas faces
 *   verticais e para o norte (−z) em `topo`/`base`.
 * - `lateral` (`cylinder`, `cone`, `lathe`): `u` é o ÂNGULO do centro, na
 *   convenção de `lateral()` (0 = +z local, crescendo para +x); `v` é a
 *   ALTURA do centro. `largura` é o arco em metros medido na altura `v`;
 *   `altura` em metros. Padrão: a volta inteira e a altura inteira.
 * - `rotacao` (só face plana): giro da imagem em radianos. */
export interface Adesivo {
  src: string;
  face: FaceEntrada | "lateral";
  u?: number;
  v?: number;
  largura?: number;
  altura?: number;
  rotacao?: number;
}

// ── Validação ────────────────────────────────────────────────────────────

/** Exceções declaradas ao linter. Hoje só `contatoIntencional`: ids de
 * outros nós com os quais este nó pode se sobrepor sem gerar aviso de
 * interpenetração — um prego cravado numa tábua, uma rosca encaixada. Vale
 * numa direção só (A lista B OU B lista A já basta), mesmo padrão de
 * `saoParentes` para pai/filho em `mundo.ts`. */
export interface Validacao {
  contatoIntencional?: string[];
}

// ── Nó ───────────────────────────────────────────────────────────────────

export interface No<T extends TipoNo = TipoNo> {
  id: string;
  tipo: T;
  /** Rótulo semântico opcional ("mesa", "xícara"). É o que permite
   * `descrever()` gerar prosa em vez de dizer "uma box". */
  nome?: string;
  params: ParamsPorTipo[T];
  transform: Transform;
  material?: Material;
  filhos: No[];
  features: Feature[];
  /** Imagens coladas em regiões da superfície — ver `Adesivo`. */
  adesivos?: Adesivo[];
  validacao?: Validacao;
}

export type NoQualquer = No<TipoNo>;

// ── Acoplamentos ─────────────────────────────────────────────────────────

/** `contato`: as duas faces ficam no mesmo plano, com as normais opostas —
 * uma peça assentada sobre outra. `pivo`: os CENTROS das faces coincidem
 * (não só o plano) e as normais ficam opostas — o eixo de giro é a normal
 * compartilhada. Nenhum dos dois POSICIONA nada: são verificados, nunca
 * resolvidos — ver `Cena.conferirMontagem`. */
export type TipoAcoplamento = "contato" | "pivo";

/** Uma face de um nó específico, por id — mesma referência por id (não
 * `NoRef`) que o resto do estado serializado usa. */
export interface RefFace {
  no: string;
  face: NomeFace;
}

export interface Acoplamento {
  id: string;
  tipo: TipoAcoplamento;
  /** Rótulo opcional — só para prosa (`descrever()`) e leitura humana, não
   * precisa ser único. */
  nome?: string;
  /** Por convenção (não imposta pelo tipo), `a` é a referência/fixo e `b` é
   * o dependente/móvel — é o que `descrever()` usa para decidir o sujeito
   * da frase ("`b` gira em torno de `a`"). */
  a: RefFace;
  b: RefFace;
}

// ── Cena serializada ─────────────────────────────────────────────────────

export interface CenaJSON {
  version: typeof VERSAO_CENA;
  /** Sempre "m" na v1. Explícito para que nenhum backend precise adivinhar. */
  unidade: "m";
  /** Sempre "y" na v1. Um backend Z-up converte na fronteira dele. */
  eixoCima: "y";
  raiz: No;
  /** Ausente = nenhum acoplamento declarado. Não afeta geometria nem layout
   * — um backend que só desenha a malha pode ignorar este campo inteiro. */
  acoplamentos?: Acoplamento[];
  /** Ausente = nenhuma animação. Ver `Animacao`. */
  animacoes?: Animacao[];
}

// ── Animações ────────────────────────────────────────────────────────────

/** O que uma faixa anima:
 * - `posicao` / `rotacao` / `escala`: o `transform` do nó (espaço do pai;
 *   rotação em Euler XYZ, radianos);
 * - `angulo`: o `params.angulo` de uma `junta` — o jeito certo de abrir uma
 *   porta ou girar um braço;
 * - `opacidade` (0..1) e `cor` (`#rrggbb`): o material do nó. */
export type PropriedadeAnimavel = "posicao" | "rotacao" | "escala" | "angulo" | "opacidade" | "cor";

/** Entre dois quadros: `linear`; `suave` (acelera e desacelera — smoothstep
 * no tempo); `degrau` (segura o valor até o próximo quadro). Rotações sempre
 * interpolam pelo menor arco entre as orientações dos quadros (slerp). */
export type Interpolacao = "linear" | "suave" | "degrau";

export type ValorAnimado = number | Vec3 | string;

export interface Quadro {
  /** Segundos desde o início da animação. */
  t: number;
  valor: ValorAnimado;
}

export interface FaixaAnimacao {
  /** Id do nó animado. */
  no: string;
  propriedade: PropriedadeAnimavel;
  /** Em ordem crescente de `t`. Antes do primeiro vale o primeiro; depois do
   * último, o último. */
  quadros: Quadro[];
  /** Padrão `linear`. */
  interpolacao?: Interpolacao;
  /** `true`: os valores são RELATIVOS à pose do nó na cena — somados em
   * `posicao`/`angulo`, compostos no referencial do nó em `rotacao`,
   * multiplicados em `escala`. Não vale para `opacidade`/`cor`. */
  relativo?: boolean;
}

/** `nao`: toca uma vez e para no último quadro; `sempre`: recomeça;
 * `vaivem`: vai e volta. */
export type RepeticaoAnimacao = "nao" | "sempre" | "vaivem";

export interface Animacao {
  /** Nome único na cena — é por ele que a animação é referida. */
  nome: string;
  /** Segundos. Padrão: o `t` do último quadro de todas as faixas. */
  duracao?: number;
  /** Padrão `nao`. */
  repetir?: RepeticaoAnimacao;
  faixas: FaixaAnimacao[];
}
