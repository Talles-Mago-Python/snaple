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

Nós com a mesma receita (mesmos params/furos, mesmo `material`) compartilham
a mesma `BufferGeometry` e o mesmo `Material` — 500 parafusos iguais viram 1
geometria e 1 material na GPU. Se o seu código muda `mesh.material` de um nó
esperando não afetar os outros (ex.: realce de seleção), passe
`{ compartilhar: false }` ou troque o material do nó em vez de editá-lo.

Imagens (`material.textura`, adesivos) são carregadas por `carregarTextura`
(padrão: `THREE.TextureLoader` no navegador). Fora do navegador não há como
decodificar imagem: a peça sai só com a cor e o backend avisa
(`textura-ausente`), a menos que você passe um carregador próprio.

As animações da cena voltam como clipes prontos:

```ts
const { objeto, animacoes } = await construirCena(cena);
const mixer = new THREE.AnimationMixer(objeto);
configurarAcao(mixer.clipAction(animacoes[0].clip), animacoes[0].repetir).play();
// a cada frame: mixer.update(delta)
```

O core amostra o movimento (`amostrarAnimacao`); o backend não reimplementa
interpolação. Um nó com `opacidade`/`cor` animadas ganha material próprio,
para não arrastar os nós que compartilhavam o material.

`three` é peer dependency.
