/** Liga a cena de `cena.ts` ao viewer e ao painel de texto. */
import { ID_RAIZ } from "@snaple/core";
import { criarViewer } from "./viewer.ts";
import { montarCena } from "./cena.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#palco")!;
const painel = document.querySelector<HTMLPreElement>("#painel")!;
const viewer = criarViewer(canvas);

// Rebindável para que o hot reload use a versão nova de `cena.ts`.
let montar = montarCena;

async function recarregar(): Promise<void> {
  try {
    const cena = montar();
    const avisosBackend = await viewer.mostrar(cena);

    const blocos = [cena.descrever()];
    blocos.push(cena.avisosTexto() || "AVISOS: nenhum.");
    if (avisosBackend.length > 0) {
      blocos.push(avisosBackend.map((a) => `BACKEND: ${a.texto}`).join("\n"));
    }
    const tamanho = cena.bbox(ID_RAIZ).tamanho.map((v) => v.toFixed(2)).join(" × ");
    blocos.push(`${cena.nosGeometricos().length} nó(s) geométrico(s) · bbox total ${tamanho} m`);

    painel.textContent = blocos.join("\n\n");
    painel.classList.toggle("com-aviso", cena.avisos().length > 0);
  } catch (e) {
    painel.classList.add("com-aviso");
    painel.textContent = `ERRO ao montar a cena:\n${(e as Error).message}`;
    console.error(e);
  }
}

await recarregar();

// salvar `cena.ts` remonta a cena sem recarregar a página
if (import.meta.hot) {
  import.meta.hot.accept("./cena.ts", (novo) => {
    if (!novo) return;
    montar = (novo as unknown as { montarCena: typeof montarCena }).montarCena;
    void recarregar();
  });
}
