import { test } from "node:test";
import assert from "node:assert/strict";
import { Cena, encostar, percorrer, type NoRef } from "@snaple/core";

/** O mundo incremental (`invalidar(alvo)`) tem de dar EXATAMENTE o mesmo
 * snapshot que o cálculo completo — mesmos números, mesma ordem de iteração.
 * Sequência aleatória (semente fixa) de todas as edições que mexem nele:
 * criar, criar subárvore pronta, mover, girar, params, reparentar, remover,
 * colocar numa face, encostar, e containers flex no meio. */
function aleatorio(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function conferir(cena: Cena, passo: string): void {
  const incremental = cena.mundo();
  // cena NOVA sobre uma cópia da árvore: resolve o flex e calcula tudo do
  // zero — comparar com `calcularMundo(cena.raiz)` não pegaria um flex que
  // o incremental deixou de resolver
  const completo = new Cena(structuredClone(cena.raiz)).mundo();
  assert.deepEqual([...incremental.keys()], [...completo.keys()], `ordem diverge após ${passo}`);
  for (const [id, m] of completo) {
    const i = incremental.get(id)!;
    assert.deepEqual(i.matriz, m.matriz, `matriz de '${id}' diverge após ${passo}`);
    assert.deepEqual(i.propria, m.propria, `caixa própria de '${id}' diverge após ${passo}`);
    assert.deepEqual(i.total, m.total, `caixa total de '${id}' diverge após ${passo}`);
    assert.deepEqual(i.ancestrais, m.ancestrais, `ancestrais de '${id}' divergem após ${passo}`);
    assert.equal(i.pai?.id, m.pai?.id, `pai de '${id}' diverge após ${passo}`);
  }
}

for (const semente of [1, 2, 3, 4, 5]) {
  test(`mundo incremental idêntico ao completo (semente ${semente})`, () => {
    const r = aleatorio(semente);
    const cena = new Cena();
    const vivos = (): NoRef[] => [...percorrer(cena.raiz)].slice(1).map(({ no }) => cena.ref(no.id));
    const escolher = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
    const v3 = (): [number, number, number] => [r() * 4 - 2, r() * 4 - 2, r() * 4 - 2];
    const containers = () => vivos().filter((n) => n.ehContainer());

    for (let passo = 0; passo < 300; passo++) {
      const nos = vivos();
      const op = nos.length < 4 ? 0 : Math.floor(r() * 9);
      let desc: string;
      switch (op) {
        case 0: {
          const pais = containers();
          const pai = pais.length && r() < 0.7 ? escolher(pais) : undefined;
          const tipo = escolher(["box", "sphere", "grupo", "grupo", "row", "column"] as const);
          const params = tipo === "box" ? { largura: r() + 0.1, altura: r() + 0.1, profundidade: r() + 0.1 }
            : tipo === "sphere" ? { raio: r() + 0.1 }
            : tipo === "grupo" ? {} : { gap: r() * 0.2 };
          cena.criar(tipo as never, params as never, { ...(pai ? { pai } : {}), transform: { posicao: v3() } });
          desc = `criar ${tipo}`;
          break;
        }
        case 1: {
          // subárvore pronta entrando de uma vez (o pai dela também é novo)
          const g = cena.criar("grupo", {}, { transform: { posicao: v3(), rotacao: v3() } });
          g.criar("box", { largura: 0.3, altura: 0.2, profundidade: 0.1 }, { transform: { posicao: v3() } });
          g.criar("grupo", {}).criar("sphere", { raio: 0.2 }, { transform: { posicao: v3() } });
          desc = "criar subárvore";
          break;
        }
        case 2: escolher(nos).mover(v3()); desc = "mover"; break;
        case 3: escolher(nos).girar(v3()); desc = "girar"; break;
        case 4: {
          const caixas = nos.filter((n) => n.tipo === "box");
          if (!caixas.length) { desc = "nada"; break; }
          escolher(caixas).definirParams({ largura: r() + 0.1 });
          desc = "params";
          break;
        }
        case 5: {
          const no = escolher(nos);
          const destinos = containers().filter(
            (c) => c.id !== no.id && ![...percorrer(no.no)].some(({ no: d }) => d.id === c.id),
          );
          if (!destinos.length) { desc = "nada"; break; }
          cena.reparentar(no, escolher(destinos));
          desc = "reparentar";
          break;
        }
        case 6: escolher(nos).remover(); desc = "remover"; break;
        case 7: {
          const caixas = nos.filter((n) => n.tipo === "box");
          const alvo = escolher(nos);
          const dono = caixas.find((c) => c.id !== alvo.id && ![...percorrer(alvo.no)].some(({ no: d }) => d.id === c.id));
          if (!dono) { desc = "nada"; break; }
          dono.face(escolher(["topo", "base", "leste", "norte"] as const)).colocar(alvo, { reparentar: r() < 0.5 });
          desc = "colocar";
          break;
        }
        default: {
          const [a, b] = [escolher(nos), escolher(nos)];
          if (a.id === b.id) { desc = "nada"; break; }
          try { encostar(a, b, escolher(["+x", "-y", "+z"] as const)); } catch { /* relação impossível: ok */ }
          desc = "encostar";
        }
      }
      // lê só às vezes, para acumular várias edições entre dois snapshots
      if (r() < 0.4) conferir(cena, `passo ${passo} (${desc})`);
    }
    conferir(cena, "fim");
  });
}

test("mundo incremental: id duplicado continua sendo erro", () => {
  const cena = new Cena();
  cena.criar("box", { largura: 1, altura: 1, profundidade: 1 }, { id: "a" });
  cena.mundo();
  const g = cena.criar("grupo", {});
  cena.mundo();
  // um nó com id repetido entrando por baixo de outro nó, fora da API
  g.no.filhos.push({ ...structuredClone(cena.no("a")), filhos: [] });
  cena.invalidar(g);
  assert.throws(() => cena.mundo(), /id duplicado/);
});
