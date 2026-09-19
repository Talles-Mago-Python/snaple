/** Tradução da geometria DERIVADA do core para `THREE.BufferGeometry`.
 *
 * Toda conversão de convenção mora aqui. O core não sabe que o Three.js
 * existe: ele diz "extruda este contorno com estes buracos ao longo deste
 * eixo"; quem sabe que `ExtrudeGeometry` nasce no plano XY e cresce em +Z, ou
 * que `PlaneGeometry`/`TorusGeometry` nascem em XY e precisam girar para o
 * Y-up do core, é este arquivo. */
import * as THREE from "three";
import type {
  GeometriaDerivada, GeometriaExtrusao, GeometriaRevolucao, ParteExtrusao,
} from "@snaple/core";
import type { Ponto2D } from "@snaple/core";

function n(v: unknown, padrao: number): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : padrao;
}

/** Uma geometria derivada pode virar MAIS DE UMA BufferGeometry: um furo de
 * profundidade parcial fatia a peça em trechos com conjuntos de furos
 * diferentes, e cada trecho é uma extrusão própria (é assim que o furo
 * parcial sai sem CSG). */
export function construirGeometrias(d: GeometriaDerivada): THREE.BufferGeometry[] {
  switch (d.tipo) {
    case "vazia":
      return [];
    case "modelo":
      return [caixaProxy(d.tamanho)];
    case "revolucao":
      return [revolucao(d)];
    case "extrusao":
      return extrusao(d);
    case "primitiva":
      return [primitiva(d.primitiva, d.params)];
    default: {
      const _e: never = d;
      throw new Error(`geometria derivada desconhecida: ${JSON.stringify(_e)}`);
    }
  }
}

export function caixaProxy(tamanho: readonly number[]): THREE.BoxGeometry {
  return new THREE.BoxGeometry(n(tamanho[0], 1), n(tamanho[1], 1), n(tamanho[2], 1));
}

function primitiva(tipo: string, p: Record<string, unknown>): THREE.BufferGeometry {
  switch (tipo) {
    case "box":
      return new THREE.BoxGeometry(n(p.largura, 1), n(p.altura, 1), n(p.profundidade, 1));
    case "sphere": {
      const seg = n(p.segmentos, 32);
      return new THREE.SphereGeometry(n(p.raio, 1), seg, Math.max(2, Math.round(seg / 2)));
    }
    case "cylinder":
      return new THREE.CylinderGeometry(
        n(p.raioTopo, 1), n(p.raioBase, 1), n(p.altura, 1), n(p.segmentos, 32),
      );
    case "cone":
      return new THREE.ConeGeometry(n(p.raio, 1), n(p.altura, 1), n(p.segmentos, 32));
    case "plane": {
      // core: plano em XZ, normal +y — Three: plano em XY, normal +z
      const g = new THREE.PlaneGeometry(n(p.largura, 1), n(p.profundidade, 1));
      g.rotateX(-Math.PI / 2);
      return g;
    }
    case "torus": {
      // core: anel em XZ, eixo +y — Three: anel em XY, eixo +z
      const g = new THREE.TorusGeometry(
        n(p.raio, 1), n(p.raioTubo, 0.25), n(p.segmentosTubo, 16), n(p.segmentos, 32),
      );
      g.rotateX(-Math.PI / 2);
      return g;
    }
    default:
      throw new Error(`primitiva sem tradução para Three.js: '${tipo}'`);
  }
}

function revolucao(d: GeometriaRevolucao): THREE.BufferGeometry {
  const pontos = d.perfil.map((p) => new THREE.Vector2(p[0], p[1]));
  return new THREE.LatheGeometry(pontos, d.segmentos);
}

function formaDaParte(parte: ParteExtrusao): THREE.Shape {
  const forma = new THREE.Shape(parte.contorno.map(paraVec2));
  for (const furo of parte.furos) forma.holes.push(new THREE.Path(furo.map(paraVec2)));
  return forma;
}

function paraVec2(p: Ponto2D): THREE.Vector2 {
  return new THREE.Vector2(p[0], p[1]);
}

function extrusao(d: GeometriaExtrusao): THREE.BufferGeometry[] {
  const rot = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(d.rotacao[0], d.rotacao[1], d.rotacao[2], "XYZ"),
  );
  return d.partes.map((parte) => {
    const forma = formaDaParte(parte);
    let g: THREE.BufferGeometry;
    if (Math.abs(parte.altura) < 1e-12) {
      // superfície sem espessura (um `plane` furado): não há o que extrudar
      g = new THREE.ShapeGeometry(forma);
    } else {
      g = new THREE.ExtrudeGeometry(forma, {
        depth: parte.altura,
        bevelEnabled: false,
        curveSegments: 1,
      });
      // ExtrudeGeometry cresce de z=0 a z=depth; centra a fatia e a
      // reposiciona no eixo pelo deslocamento que o core calculou
      g.translate(0, 0, parte.deslocamento - parte.altura / 2);
    }
    g.applyMatrix4(rot);
    g.computeVertexNormals();
    return g;
  });
}
