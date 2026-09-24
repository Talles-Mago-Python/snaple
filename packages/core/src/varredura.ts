/** `sweep`: uma seção 2D varrendo um caminho 3D — fios, cabos, mangueiras,
 * canos dobrados, metalon, cantoneira, quadros soldados.
 *
 * O core resolve TODA a geometria do caminho: amostra a curva, calcula o
 * referencial de cada anel (sem torção, por transporte paralelo) e os planos
 * de corte das juntas em meia-esquadria. O backend só costura os anéis com
 * `verticeDoAnel` — a MESMA função que a bbox usa aqui. Por isso a bbox do
 * `sweep` é exata: é a caixa dos próprios vértices da malha, não uma
 * estimativa.
 *
 * Três jeitos de ligar os pontos do caminho:
 *  - padrão: segmentos retos com canto vivo, cortados em meia-esquadria na
 *    bissetriz (quadro de metalon soldado, moldura);
 *  - `raioCurva`: segmentos retos com dobras em arco desse raio (cano/tubo
 *    dobrado, eletroduto);
 *  - `suavizar`: curva Catmull-Rom centrípeta passando por todos os pontos
 *    (fio, cabo, mangueira). */
import type { ParamsSweep, SecaoSweep } from "./tipos.ts";
import {
  type Ponto2D, type Vec3, EPS, comprimento, escalar, normalizar, num, produtoEscalar,
  produtoVetorial, somar, subtrair,
} from "./vetor.ts";

/** Um anel da varredura: onde a seção é posicionada ao longo do caminho.
 *
 * O ponto `(s, t)` da seção vai para `ponto + s·u + t·v`. `u` é a direita de
 * quem anda pelo caminho olhando para `cima`, `v` é o `cima` da seção, e
 * `tangente` completa o referencial. Nas juntas de canto vivo, `corte` é a
 * normal do plano de meia-esquadria: o ponto é empurrado ao longo da
 * `tangente` até esse plano. */
export interface AnelVarredura {
  ponto: Vec3;
  tangente: Vec3;
  u: Vec3;
  v: Vec3;
  corte?: Vec3;
}

/** Trecho de referencial contínuo. Um caminho suave (`suavizar`/`raioCurva`)
 * é um trecho só; com canto vivo, cada segmento reto é um trecho de dois
 * anéis, e a aresta viva na junta vem de os trechos não compartilharem
 * normais. `fechado`: o último anel liga de volta ao primeiro. */
export interface TrechoVarredura {
  aneis: AnelVarredura[];
  fechado: boolean;
}

/** Seção já resolvida: contorno anti-horário, furos horários (em `(s, t)`).
 * `suave`: as normais são suavizadas em volta da seção (círculo); senão cada
 * lado do polígono é uma face plana com aresta viva. */
export interface SecaoResolvida {
  contorno: Ponto2D[];
  furos: Ponto2D[][];
  suave: boolean;
}

/** Posição 3D do ponto `p` da seção no anel. Compartilhada entre a bbox do
 * core e a malha do backend — é isso que faz as duas baterem exatamente. */
export function verticeDoAnel(anel: AnelVarredura, p: Ponto2D): Vec3 {
  let q = somar(anel.ponto, somar(escalar(anel.u, p[0]), escalar(anel.v, p[1])));
  if (anel.corte) {
    // desliza ao longo da tangente até o plano de meia-esquadria
    const d = produtoEscalar(subtrair(q, anel.ponto), anel.corte) / produtoEscalar(anel.tangente, anel.corte);
    q = subtrair(q, escalar(anel.tangente, d));
  }
  return q;
}

export interface VarreduraResolvida {
  secao: SecaoResolvida;
  trechos: TrechoVarredura[];
  /** Caminho aberto: fecha as duas pontas com a seção. */
  tampas: boolean;
  /** Caixa local dos vértices, JÁ com a recentragem aplicada. */
  min: Vec3;
  max: Vec3;
}

// Resolver é O(anéis × pontos da seção) e a bbox é consultada a cada
// recálculo do mundo; os params do nó mudam in-place (`definirParams`), então
// a chave é o conteúdo serializado, não a identidade do objeto.
const cache = new Map<string, VarreduraResolvida>();
const LIMITE_CACHE = 256;

/** Resolve os params de um `sweep`. Lança com mensagem explicando o que está
 * errado (caminho curto demais, `raioCurva` que não cabe, seção impossível). */
export function resolverVarredura(p: ParamsSweep): VarreduraResolvida {
  const chave = JSON.stringify(p);
  const pronta = cache.get(chave);
  if (pronta) return pronta;
  const r = resolverSemCache(p);
  if (cache.size >= LIMITE_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(chave, r);
  return r;
}

function resolverSemCache(p: ParamsSweep): VarreduraResolvida {
  const secao = resolverSecao(p.secao);
  const fechado = p.fechado === true;
  const pontos = semRepetidos((p.caminho ?? []).map((q) => [num(q[0]), num(q[1]), num(q[2])] as Vec3), fechado);
  if (pontos.length < 2) throw new Error(`'caminho' do sweep precisa de ao menos 2 pontos distintos`);
  if (fechado && pontos.length < 3) throw new Error(`'caminho' fechado precisa de ao menos 3 pontos distintos`);
  const segmentos = Math.max(1, Math.round(num(p.segmentos, 12)));
  const raioCurva = num(p.raioCurva, 0);
  if (raioCurva < 0) throw new Error(`'raioCurva' não pode ser negativo (recebeu ${raioCurva})`);

  const cima = p.cima ? normalizar([num(p.cima[0]), num(p.cima[1]), num(p.cima[2])]) : [0, 1, 0] as Vec3;
  let trechos: TrechoVarredura[];
  if (p.suavizar) {
    const { pts, tangentes } = catmullRom(pontos, fechado, segmentos);
    trechos = [{ aneis: comReferencial(pts, tangentes, cima, fechado), fechado }];
  } else if (raioCurva > 0) {
    const { pts, tangentes } = dobras(pontos, fechado, raioCurva, segmentos);
    trechos = [{ aneis: comReferencial(pts, tangentes, cima, fechado), fechado }];
  } else {
    trechos = cantosVivos(pontos, fechado, cima);
  }

  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const t of trechos) {
    for (const anel of t.aneis) {
      for (const s of secao.contorno) {
        const q = verticeDoAnel(anel, s);
        for (let i = 0; i < 3; i++) {
          if (q[i]! < min[i]!) min[i] = q[i]!;
          if (q[i]! > max[i]!) max[i] = q[i]!;
        }
      }
    }
  }
  if (p.recentrar !== false) {
    const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    for (const t of trechos) for (const anel of t.aneis) anel.ponto = subtrair(anel.ponto, c);
    min = subtrair(min, c);
    max = subtrair(max, c);
  }
  return { secao, trechos, tampas: !fechado, min, max };
}

/** Caixa local de um `sweep` que ainda não dá para resolver (params
 * inválidos): a dos pontos do caminho. O layout segue funcionando e o erro de
 * verdade aparece ao derivar a geometria. */
export function caixaDoCaminhoCru(p: ParamsSweep): { min: Vec3; max: Vec3 } {
  const pts = (p.caminho ?? []).map((q) => [num(q[0]), num(q[1]), num(q[2])] as Vec3);
  if (pts.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const q of pts) for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i]!, q[i]!);
    max[i] = Math.max(max[i]!, q[i]!);
  }
  if (p.recentrar === false) return { min, max };
  const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return { min: subtrair(min, c), max: subtrair(max, c) };
}

// ── Seção ────────────────────────────────────────────────────────────────

function resolverSecao(s: SecaoSweep | undefined): SecaoResolvida {
  if (!s) throw new Error(`sweep sem 'secao'`);
  switch (s.tipo) {
    case "circulo": {
      const raio = num(s.raio, 0);
      if (raio <= 0) throw new Error(`'secao.raio' precisa ser > 0 (recebeu ${raio})`);
      const n = Math.max(3, Math.round(num(s.segmentos, 16)));
      const e = s.espessura === undefined ? undefined : num(s.espessura);
      if (e !== undefined && (e <= 0 || e >= raio)) {
        throw new Error(`'secao.espessura' precisa ficar entre 0 e o raio (${raio}); recebeu ${e}`);
      }
      return {
        contorno: circuloSecao(raio, n),
        furos: e === undefined ? [] : [circuloSecao(raio - e, n).reverse()],
        suave: true,
      };
    }
    case "retangulo": {
      const l = num(s.largura, 0), a = num(s.altura, 0);
      if (l <= 0 || a <= 0) throw new Error(`'secao' retangular precisa de largura e altura > 0 (recebeu ${l} × ${a})`);
      const e = s.espessura === undefined ? undefined : num(s.espessura);
      if (e !== undefined && (e <= 0 || 2 * e >= Math.min(l, a))) {
        throw new Error(`'secao.espessura' precisa ficar entre 0 e metade do menor lado (${Math.min(l, a) / 2}); recebeu ${e}`);
      }
      return {
        contorno: retanguloSecao(l, a),
        furos: e === undefined ? [] : [retanguloSecao(l - 2 * e, a - 2 * e).reverse()],
        suave: false,
      };
    }
    case "poligono": {
      const pts = (s.pontos ?? []).map((q) => [num(q[0]), num(q[1])] as Ponto2D);
      if (pts.length < 3) throw new Error(`'secao' poligonal precisa de ao menos 3 pontos`);
      const area = areaComSinal(pts);
      if (Math.abs(area) < EPS * EPS) throw new Error(`'secao' poligonal tem área zero`);
      return { contorno: area > 0 ? pts : [...pts].reverse(), furos: [], suave: false };
    }
    default: {
      const _e: never = s;
      throw new Error(`tipo de seção desconhecido: ${JSON.stringify(_e)}`);
    }
  }
}

function circuloSecao(raio: number, n: number): Ponto2D[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [raio * Math.cos(a), raio * Math.sin(a)];
  });
}

function retanguloSecao(l: number, a: number): Ponto2D[] {
  return [[-l / 2, -a / 2], [l / 2, -a / 2], [l / 2, a / 2], [-l / 2, a / 2]];
}

function areaComSinal(pts: readonly Ponto2D[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

// ── Caminho ──────────────────────────────────────────────────────────────

function semRepetidos(pts: Vec3[], fechado: boolean): Vec3[] {
  const r: Vec3[] = [];
  for (const q of pts) if (!r.length || comprimento(subtrair(q, r[r.length - 1]!)) > EPS) r.push(q);
  // num caminho fechado, repetir o primeiro ponto no fim é redundante
  if (fechado && r.length > 1 && comprimento(subtrair(r[0]!, r[r.length - 1]!)) <= EPS) r.pop();
  return r;
}

/** Catmull-Rom centrípeta (α = 0,5): passa por todos os pontos sem laçadas
 * nem bicos em pontos desigualmente espaçados. `segmentos` amostras por vão. */
function catmullRom(pontos: Vec3[], fechado: boolean, segmentos: number): { pts: Vec3[]; tangentes: Vec3[] } {
  const n = pontos.length;
  const P = (i: number): Vec3 => {
    if (fechado) return pontos[((i % n) + n) % n]!;
    if (i < 0) return subtrair(escalar(pontos[0]!, 2), pontos[1]!);
    if (i >= n) return subtrair(escalar(pontos[n - 1]!, 2), pontos[n - 2]!);
    return pontos[i]!;
  };
  const vaos = fechado ? n : n - 1;
  const pts: Vec3[] = [];
  for (let k = 0; k < vaos; k++) {
    const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2);
    const t0 = 0;
    const t1 = t0 + Math.sqrt(Math.max(comprimento(subtrair(p1, p0)), EPS));
    const t2 = t1 + Math.sqrt(Math.max(comprimento(subtrair(p2, p1)), EPS));
    const t3 = t2 + Math.sqrt(Math.max(comprimento(subtrair(p3, p2)), EPS));
    const lerp = (a: Vec3, b: Vec3, ta: number, tb: number, t: number): Vec3 =>
      somar(escalar(a, (tb - t) / (tb - ta)), escalar(b, (t - ta) / (tb - ta)));
    for (let j = 0; j < segmentos; j++) {
      const t = t1 + ((t2 - t1) * j) / segmentos;
      const a1 = lerp(p0, p1, t0, t1, t), a2 = lerp(p1, p2, t1, t2, t), a3 = lerp(p2, p3, t2, t3, t);
      const b1 = lerp(a1, a2, t0, t2, t), b2 = lerp(a2, a3, t1, t3, t);
      pts.push(lerp(b1, b2, t1, t2, t));
    }
  }
  if (!fechado) pts.push(pontos[n - 1]!);
  return { pts, tangentes: tangentesPorDiferenca(pts, fechado) };
}

function tangentesPorDiferenca(pts: Vec3[], fechado: boolean): Vec3[] {
  const n = pts.length;
  return pts.map((_, i) => {
    const a = fechado ? pts[(i - 1 + n) % n]! : pts[Math.max(0, i - 1)]!;
    const b = fechado ? pts[(i + 1) % n]! : pts[Math.min(n - 1, i + 1)]!;
    return normalizar(subtrair(b, a));
  });
}

/** Segmentos retos com cada canto trocado por um arco de raio `raio`,
 * tangente aos dois segmentos — como um cano passado na dobradeira. */
function dobras(pontos: Vec3[], fechado: boolean, raio: number, segmentos: number): { pts: Vec3[]; tangentes: Vec3[] } {
  const n = pontos.length;
  const dir = (i: number): Vec3 => normalizar(subtrair(pontos[(i + 1) % n]!, pontos[i % n]!));
  const cantos = fechado ? Array.from({ length: n }, (_, i) => i) : Array.from({ length: n - 2 }, (_, i) => i + 1);
  // recuo de cada canto: quanto do segmento o arco consome de cada lado
  const recuo = new Array<number>(n).fill(0);
  const arcos = new Map<number, { din: Vec3; w: Vec3; angulo: number }>();
  for (const i of cantos) {
    const din = dir((i - 1 + n) % n), dout = dir(i);
    const c = Math.max(-1, Math.min(1, produtoEscalar(din, dout)));
    const angulo = Math.acos(c);
    if (angulo < 1e-9) continue; // colinear: não há canto
    if (Math.PI - angulo < 1e-6) {
      throw new Error(`o caminho volta sobre si mesmo em caminho[${i}] (curva de 180°): não há dobra possível`);
    }
    recuo[i] = raio * Math.tan(angulo / 2);
    arcos.set(i, { din, w: normalizar(subtrair(dout, escalar(din, c))), angulo });
  }
  const segs = fechado ? n : n - 1;
  for (let k = 0; k < segs; k++) {
    const a = k, b = (k + 1) % n;
    const L = comprimento(subtrair(pontos[b]!, pontos[a]!));
    if (recuo[a]! + recuo[b]! > L + EPS) {
      throw new Error(
        `'raioCurva' ${raio} não cabe no trecho de caminho[${a}] a caminho[${b}] (${L.toFixed(4)} m): ` +
        `as dobras das duas pontas precisam de ${(recuo[a]! + recuo[b]!).toFixed(4)} m. ` +
        `Diminua o raio ou afaste os pontos.`,
      );
    }
  }
  const pts: Vec3[] = [];
  const tangentes: Vec3[] = [];
  const empurrar = (q: Vec3, t: Vec3) => {
    if (pts.length && comprimento(subtrair(q, pts[pts.length - 1]!)) <= EPS) return;
    pts.push(q);
    tangentes.push(t);
  };
  if (!fechado) empurrar(pontos[0]!, dir(0));
  for (const i of cantos) {
    const arco = arcos.get(i);
    if (!arco) {
      empurrar(pontos[i]!, dir(i));
      continue;
    }
    const { din, w, angulo } = arco;
    const inicio = subtrair(pontos[i]!, escalar(din, recuo[i]!));
    const centro = somar(inicio, escalar(w, raio));
    const passos = Math.max(1, Math.ceil((segmentos * angulo) / (Math.PI / 2)));
    for (let j = 0; j <= passos; j++) {
      const phi = (angulo * j) / passos;
      empurrar(
        somar(centro, somar(escalar(w, -raio * Math.cos(phi)), escalar(din, raio * Math.sin(phi)))),
        normalizar(somar(escalar(din, Math.cos(phi)), escalar(w, Math.sin(phi)))),
      );
    }
  }
  if (!fechado) empurrar(pontos[n - 1]!, dir(n - 2));
  else if (pts.length > 1 && comprimento(subtrair(pts[0]!, pts[pts.length - 1]!)) <= EPS) {
    pts.pop();
    tangentes.pop();
  }
  return { pts, tangentes };
}

/** Segmentos retos com canto vivo: um trecho de dois anéis por segmento,
 * cortados na bissetriz de cada junta. O referencial passa de um segmento ao
 * seguinte pela rotação mínima entre as tangentes, e é exatamente essa
 * rotação que faz os anéis dos dois lados da junta coincidirem: o plano de
 * meia-esquadria reflete um segmento no outro. */
function cantosVivos(pontos: Vec3[], fechado: boolean, cima: Vec3): TrechoVarredura[] {
  const n = pontos.length;
  const segs = fechado ? n : n - 1;
  const dirs = Array.from({ length: segs }, (_, k) => normalizar(subtrair(pontos[(k + 1) % n]!, pontos[k]!)));
  const corteEntre = (din: Vec3, dout: Vec3, onde: number): Vec3 => {
    const s = somar(din, dout);
    if (comprimento(s) < 1e-6) {
      throw new Error(`o caminho volta sobre si mesmo em caminho[${onde}] (curva de 180°): não há meia-esquadria possível`);
    }
    return normalizar(s);
  };
  let [u, v] = referencialInicial(dirs[0]!, cima);
  const referenciais: [Vec3, Vec3][] = [[u, v]];
  for (let k = 1; k < segs; k++) {
    [u, v] = transportar(v, dirs[k - 1]!, dirs[k]!);
    referenciais.push([u, v]);
  }
  if (fechado) corrigirTorcaoFechada(referenciais, dirs, transportar(v, dirs[segs - 1]!, dirs[0]!));

  return dirs.map((d, k) => {
    const [uk, vk] = referenciais[k]!;
    const anterior = k > 0 ? dirs[k - 1] : fechado ? dirs[segs - 1] : undefined;
    const seguinte = k < segs - 1 ? dirs[k + 1] : fechado ? dirs[0] : undefined;
    const ini: AnelVarredura = { ponto: pontos[k]!, tangente: d, u: uk, v: vk };
    const fim: AnelVarredura = { ponto: pontos[(k + 1) % n]!, tangente: d, u: uk, v: vk };
    if (anterior) ini.corte = corteEntre(anterior, d, k);
    if (seguinte) fim.corte = corteEntre(d, seguinte, (k + 1) % n);
    return { aneis: [ini, fim], fechado: false };
  });
}

/** Num caminho fechado não plano, o referencial transportado volta girado em
 * torno da tangente (holonomia). Distribui essa volta ao longo dos segmentos
 * para a costura não aparecer toda num ponto só. Em caminho plano o ângulo é
 * zero e nada muda. */
function corrigirTorcaoFechada(referenciais: [Vec3, Vec3][], tangentes: Vec3[], volta: [Vec3, Vec3]): void {
  const v0 = referenciais[0]![1];
  const t0 = tangentes[0]!;
  const angulo = Math.atan2(produtoEscalar(produtoVetorial(v0, volta[1]), t0), produtoEscalar(v0, volta[1]));
  if (Math.abs(angulo) < 1e-12) return;
  const n = referenciais.length;
  // gira o anel k de -angulo·k/n em torno da tangente (u = t × v, então a
  // rotação por `a` leva v → v·cos a + u·sen a e u → u·cos a − v·sen a)
  for (let k = 0; k < n; k++) {
    const a = (-angulo * k) / n;
    const [u, v] = referenciais[k]!;
    const c = Math.cos(a), s = Math.sin(a);
    referenciais[k] = [
      normalizar(subtrair(escalar(u, c), escalar(v, s))),
      normalizar(somar(escalar(v, c), escalar(u, s))),
    ];
  }
}

/** Anéis ao longo de uma curva suave: referencial por transporte paralelo
 * (sem torção), a partir de `cima` no primeiro ponto. */
function comReferencial(pts: Vec3[], tangentes: Vec3[], cima: Vec3, fechado: boolean): AnelVarredura[] {
  let [u, v] = referencialInicial(tangentes[0]!, cima);
  const refs: [Vec3, Vec3][] = [[u, v]];
  for (let i = 1; i < pts.length; i++) {
    [u, v] = transportar(v, tangentes[i - 1]!, tangentes[i]!);
    refs.push([u, v]);
  }
  if (fechado) corrigirTorcaoFechada(refs, tangentes, transportar(v, tangentes[pts.length - 1]!, tangentes[0]!));
  return pts.map((ponto, i) => ({ ponto, tangente: tangentes[i]!, u: refs[i]![0], v: refs[i]![1] }));
}

/** `v` = `cima` sem a componente na tangente; `u` = tangente × `v` (a
 * direita de quem anda pelo caminho). Se `cima` for paralelo à tangente,
 * cai para -z e depois +x, nessa ordem. */
function referencialInicial(t: Vec3, cima: Vec3): [Vec3, Vec3] {
  for (const c of [cima, [0, 0, -1] as Vec3, [1, 0, 0] as Vec3]) {
    const v = subtrair(c, escalar(t, produtoEscalar(c, t)));
    if (comprimento(v) > 1e-6) {
      const vn = normalizar(v);
      return [normalizar(produtoVetorial(t, vn)), vn];
    }
  }
  throw new Error("referencial impossível para o sweep"); // inalcançável: +x e -z não são ambos paralelos a t
}

/** Rotação mínima que leva `de` em `para` (Rodrigues), aplicada a `v`,
 * seguida de reortonormalização contra a nova tangente; `u` sai de `v`. */
function transportar(v: Vec3, de: Vec3, para: Vec3): [Vec3, Vec3] {
  const eixo = produtoVetorial(de, para);
  const s = comprimento(eixo);
  const c = produtoEscalar(de, para);
  let v2 = v;
  if (s > 1e-12) {
    const k = escalar(eixo, 1 / s);
    const angulo = Math.atan2(s, c);
    v2 = girar(v, k, angulo);
  }
  const vn = normalizar(subtrair(v2, escalar(para, produtoEscalar(v2, para))));
  return [normalizar(produtoVetorial(para, vn)), vn];
}

function girar(x: Vec3, k: Vec3, angulo: number): Vec3 {
  const c = Math.cos(angulo), s = Math.sin(angulo);
  return somar(
    somar(escalar(x, c), escalar(produtoVetorial(k, x), s)),
    escalar(k, produtoEscalar(k, x) * (1 - c)),
  );
}
