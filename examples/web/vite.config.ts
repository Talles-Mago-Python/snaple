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
      "@snaple/ifc": src("../../packages/ifc/src/index.ts"),
    },
  },
  server: {
    // escuta em todas as interfaces, não só localhost — é o que permite
    // acessar pelo IP da rede local (ex.: 192.168.0.11:5173)
    host: true,
    // Vite 5+ recusa qualquer Host header fora da allowlist (proteção
    // contra DNS rebinding); IPs literais passam direto, mas um hostname
    // (como os abaixo, se apontar/for proxeado para esta máquina) precisa
    // estar explicitamente aqui. O curinga `true` aceita qualquer Host —
    // é o que faz o preview funcionar atrás de um proxy que reescreve o
    // Host (ex.: *.e2b.app), sem travar o desenvolvimento local.
    allowedHosts: ["3d-space.devsnap.com.br", ".e2b.app"],
  },
});
