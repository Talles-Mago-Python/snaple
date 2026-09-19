import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

/** Os pacotes são apontados para o CÓDIGO-FONTE, não para `dist/`: assim o
 * viewer não precisa de `npm run build` a cada edição no core, e mexer em
 * `packages/core/src` recarrega a página na hora. */
const src = (caminho: string) => fileURLToPath(new URL(caminho, import.meta.url));

export default defineConfig({
  // `npm run dev` passa --open; rodar `vite examples/web` cru não abre nada.
  resolve: {
    alias: {
      "@snaple/core": src("../../packages/core/src/index.ts"),
      "@snaple/three": src("../../packages/three/src/index.ts"),
    },
  },
});
