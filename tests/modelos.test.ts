/** Regressão dos modelos de `examples/web/modelos/`: cada um monta sem
 * lançar e o par (nós geométricos, avisos-problema) bate o baseline gravado
 * em `tests/baselines/modelos.json` — a rede de segurança que pega modelo
 * regredindo em silêncio (nó que some, aviso novo de linter).
 *
 * Mudou um modelo DE PROPÓSITO? Regenere o baseline:
 *   BASELINE=1 node --test tests/modelos.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Cena, ehProblema } from "@snaple/core";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_MODELOS = join(AQUI, "..", "examples", "web", "modelos");
const ARQ_BASELINE = join(AQUI, "baselines", "modelos.json");

type Registro = { nos: number; problemas: number };
type ModuloModelo = { montarCena(): Cena };

const nomes = readdirSync(DIR_MODELOS).filter((f) => f.endsWith(".ts")).sort();
const gravar = process.env.BASELINE === "1";
const esperado: Record<string, Registro> = gravar
  ? {}
  : (JSON.parse(readFileSync(ARQ_BASELINE, "utf8")) as Record<string, Registro>);

for (const arquivo of nomes) {
  const id = arquivo.replace(/\.ts$/, "");
  test(`modelo ${id} monta e bate o baseline`, async () => {
    const mod = (await import(`../examples/web/modelos/${arquivo}`)) as ModuloModelo;
    const cena = mod.montarCena();
    const reg: Registro = {
      nos: cena.nosGeometricos().length,
      problemas: cena.avisos().filter(ehProblema).length,
    };
    if (gravar) {
      esperado[id] = reg;
      return;
    }
    const base = esperado[id];
    assert.ok(base, `sem baseline para ${id} — regenere com BASELINE=1`);
    assert.deepEqual(
      reg,
      base,
      `${id}: esperado ${JSON.stringify(base)}, veio ${JSON.stringify(reg)} — ` +
        `se a mudança foi de propósito, regenere com BASELINE=1`,
    );
  });
}

test("baseline cobre exatamente os modelos existentes", () => {
  if (gravar) {
    mkdirSync(dirname(ARQ_BASELINE), { recursive: true });
    writeFileSync(ARQ_BASELINE, `${JSON.stringify(esperado, null, 2)}\n`);
    return;
  }
  assert.deepEqual(Object.keys(esperado).sort(), nomes.map((n) => n.replace(/\.ts$/, "")));
});
