# @snaple/three

Backend Three.js para [`@snaple/core`](../core): consome o JSON da cena e
produz um `THREE.Object3D`.

```ts
import { construirCena } from "@snaple/three";
const { objeto, avisos } = await construirCena(cena);
```

Não move nós, não faz layout e não valida — isso tudo já aconteceu no core.
Toda conversão de convenção (plano em XY vs XZ, extrusão em +Z, material) mora
aqui; nenhum conceito do Three.js vaza para o core.

`three` é peer dependency.
