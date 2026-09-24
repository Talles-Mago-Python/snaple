/** Animações da cena como `THREE.AnimationClip`.
 *
 * O core amostra cada faixa (`amostrarAnimacao`) com interpolação, `suave` e
 * `relativo` já resolvidos; aqui cada faixa só vira uma `KeyframeTrack`
 * apontando para o objeto do nó (pelo `uuid`, que não depende de nome):
 * `posicao`/`escala` → `.position`/`.scale`, `rotacao`/`angulo` →
 * `.quaternion`, `opacidade`/`cor` → `.material.opacity`/`.material.color`.
 *
 * No `.glb`, só as faixas de transformação sobrevivem — o glTF não anima
 * material sem extensão. */
import * as THREE from "three";
import {
  type Animacao, type Cena, type No, type ParamsJunta, type RepeticaoAnimacao, type Vec3,
  amostrarAnimacao,
} from "@snaple/core";

export interface AnimacaoConstruida {
  nome: string;
  clip: THREE.AnimationClip;
  /** Como tocar: `LoopOnce` (com `clampWhenFinished`), `LoopRepeat` ou
   * `LoopPingPong` — ver `configurarAcao`. */
  repetir: RepeticaoAnimacao;
}

/** Deixa uma `AnimationAction` tocando do jeito que a animação declarou. */
export function configurarAcao(acao: THREE.AnimationAction, repetir: RepeticaoAnimacao): THREE.AnimationAction {
  if (repetir === "nao") {
    acao.setLoop(THREE.LoopOnce, 1);
    acao.clampWhenFinished = true;
  } else {
    acao.setLoop(repetir === "vaivem" ? THREE.LoopPingPong : THREE.LoopRepeat, Infinity);
  }
  return acao;
}

/** As malhas que desenham a peça do nó (sem películas de adesivo nem nós
 * filhos): o próprio objeto, ou as fatias de um furo parcial. */
function malhasDoNo(obj: THREE.Object3D): THREE.Mesh[] {
  if (obj instanceof THREE.Mesh) return [obj];
  return obj.children.filter(
    (c): c is THREE.Mesh => c instanceof THREE.Mesh && !c.userData.snaple && !c.userData.snapleAdesivo,
  );
}

export function construirAnimacoes(
  cena: Cena,
  objetos: ReadonlyMap<string, THREE.Object3D>,
  fps: number,
): AnimacaoConstruida[] {
  // material animado deixa de ser compartilhado: mudar a opacidade de um nó
  // não pode apagar os outros que usam o mesmo material
  const materialProprio = new Set<string>();
  return cena.animacoes().map((a: Animacao) => {
    const amostrada = amostrarAnimacao(a, (id) => cena.no(id), fps);
    const tracks: THREE.KeyframeTrack[] = [];
    for (const f of amostrada.faixas) {
      const obj = objetos.get(f.no);
      if (!obj) continue;
      const interp = f.discreto ? THREE.InterpolateDiscrete : THREE.InterpolateLinear;
      const nome = (prop: string, alvo: THREE.Object3D = obj) => `${alvo.uuid}.${prop}`;
      switch (f.propriedade) {
        case "posicao":
        case "escala":
          tracks.push(new THREE.VectorKeyframeTrack(
            nome(f.propriedade === "posicao" ? "position" : "scale"), f.tempos, (f.valores as Vec3[]).flat(), interp,
          ));
          break;
        case "rotacao":
        case "angulo": {
          const no = cena.no(f.no);
          const prop = f.propriedade;
          const quats = f.valores.map((v) => quatDoValor(no, prop, v as Vec3 | number));
          // mesmo hemisfério da amostra anterior: senão o slerp entre duas
          // amostras vizinhas daria a volta longa
          for (let i = 1; i < quats.length; i++) if (quats[i]!.dot(quats[i - 1]!) < 0) quats[i]!.set(-quats[i]!.x, -quats[i]!.y, -quats[i]!.z, -quats[i]!.w);
          tracks.push(new THREE.QuaternionKeyframeTrack(
            nome("quaternion"), f.tempos, quats.flatMap((q) => [q.x, q.y, q.z, q.w]), interp,
          ));
          break;
        }
        case "opacidade":
        case "cor":
          for (const m of malhasDoNo(obj)) {
            if (!materialProprio.has(m.uuid)) {
              m.material = (m.material as THREE.Material).clone();
              materialProprio.add(m.uuid);
            }
            if (f.propriedade === "opacidade") {
              (m.material as THREE.Material).transparent = true;
              tracks.push(new THREE.NumberKeyframeTrack(nome("material.opacity", m), f.tempos, f.valores as number[], interp));
            } else {
              const cores = (f.valores as string[]).flatMap((h) => new THREE.Color(h).toArray());
              tracks.push(new THREE.ColorKeyframeTrack(nome("material.color", m), f.tempos, cores, interp));
            }
          }
          break;
      }
    }
    return { nome: a.nome, clip: new THREE.AnimationClip(a.nome, amostrada.duracao, tracks), repetir: amostrada.repetir };
  });
}

function quatDoValor(no: No, propriedade: "rotacao" | "angulo", v: Vec3 | number): THREE.Quaternion {
  if (propriedade === "rotacao") {
    const e = v as Vec3;
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2], "XYZ"));
  }
  const eixo = (no.params as ParamsJunta).eixo;
  const r: Vec3 = [0, 0, 0];
  r["xyz".indexOf(eixo)] = v as number;
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], "XYZ"));
}
