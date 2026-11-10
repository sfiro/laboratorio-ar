// Animaciones para CUALQUIER modelo, aunque no traiga ninguna (como un .stl).
//
//  · Movimientos del cuerpo entero: mueven los grupos que envuelven al modelo
//    (girar, flotar, respirar, saltar, balancearse).
//  · Deformaciones: mueven los VÉRTICES del modelo en la tarjeta gráfica (un "shader").
//    Así una parte puede moverse distinto que el resto, aunque el modelo sea una sola pieza:
//      - saludar:  tocas la pata y esa zona se dobla de un lado a otro alrededor de su "hombro".
//      - gelatina: el modelo se tambalea más cuanto más arriba, como un flan.
//
// La deformación se inyecta en los materiales que ya trae el modelo con onBeforeCompile
// (así conserva sus colores, texturas y luces). Ver la skill threejs-shaders.
import * as THREE from 'three';

export const MOVIMIENTOS = {
  girar: 'Girar',
  flotar: 'Flotar',
  respirar: 'Respirar',
  saltar: 'Saltar',
  balancear: 'Balancearse',
  ninguna: 'Quieto',
};
export const DEFORMACIONES = {
  ninguna: 'Ninguna',
  saludar: 'Saludar (mover una parte, como la pata)',
  gelatina: 'Gelatina',
};
export const EJES_DEFORMAR = {
  frente: { texto: 'De lado a lado (como saludar de frente)', eje: [0, 0, 1] },
  lado: { texto: 'Adelante y atrás', eje: [1, 0, 0] },
  vertical: { texto: 'Girando sobre sí misma', eje: [0, 1, 0] },
};

/**
 * Movimiento del cuerpo entero. g = { raiz, bajar }: raiz tiene su origen en la base del
 * modelo (para balancearse y saltar), bajar escala desde la base (para respirar y aplastarse).
 * Devuelve cuánto sube el modelo (para la altura).
 */
export function moverCuerpo(nombre, t, ritmo, g) {
  g.bajar.scale.set(1, 1, 1);
  g.raiz.rotation.set(0, 0, 0);
  const f = t * ritmo;
  switch (nombre) {
    case 'flotar':
      return 0.05 + Math.sin(f * 2) * 0.05;
    case 'respirar': {
      // Se estira hacia arriba y se adelgaza un poco: el volumen casi no cambia
      const s = Math.sin(f * 2.2) * 0.035;
      g.bajar.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
      return 0;
    }
    case 'saltar': {
      // Ciclo de 1.4 s: agacharse, saltar (parábola) y aplastarse al caer
      const fase = (f / 1.4) % 1;
      if (fase < 0.18) { // se agacha
        const k = Math.sin((fase / 0.18) * Math.PI);
        g.bajar.scale.set(1 + k * 0.12, 1 - k * 0.18, 1 + k * 0.12);
        return 0;
      }
      if (fase < 0.78) { // en el aire
        const u = (fase - 0.18) / 0.6;
        const estirar = Math.max(0, 1 - u * 3) * 0.12; // sale estirado
        g.bajar.scale.set(1 - estirar * 0.5, 1 + estirar, 1 - estirar * 0.5);
        return 4 * u * (1 - u) * 0.35;
      }
      const k = Math.sin(((fase - 0.78) / 0.22) * Math.PI) * 0.6; // aterriza
      g.bajar.scale.set(1 + k * 0.12, 1 - k * 0.18, 1 + k * 0.12);
      return 0;
    }
    case 'balancear':
      g.raiz.rotation.z = Math.sin(f * 2) * 0.22;
      g.raiz.rotation.x = Math.sin(f * 1.3) * 0.06;
      return 0;
    default:
      return 0;
  }
}

// ───────────────────────── Deformaciones en la tarjeta gráfica ─────────────────────────
const CODIGO_VERTICES = /* glsl */ `
uniform mat4 uAModelo;     // de las coordenadas de esta pieza → al modelo normalizado
uniform mat4 uDesdeModelo; // y de vuelta
uniform float uTiempo;
uniform int uDeformar;     // 0 nada · 1 saludar · 2 gelatina
uniform vec3 uPunto;       // la zona que se mueve (donde tocaste)
uniform vec3 uPivote;      // el "hombro": el punto alrededor del que gira
uniform vec3 uEje;
uniform float uRadio;
uniform float uFuerza;     // en radianes (saludar) o como fracción (gelatina)
uniform float uRitmo;
uniform float uAlto;
varying float vZona;

// Girar el vector v alrededor del eje k (unitario) un ángulo a (fórmula de Rodrigues)
vec3 rotarEje(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
float pesoZona(vec3 p) {
  return 1.0 - smoothstep(uRadio * 0.55, uRadio * 1.3, distance(p, uPunto));
}
// Deforma un punto del modelo normalizado; "dir" sale con la rotación aplicada (para la normal)
vec3 deformarPunto(vec3 p, inout vec3 n, out float w) {
  w = 0.0;
  if (uDeformar == 1) {
    w = pesoZona(p);
    float a = sin(uTiempo * uRitmo * 6.0) * uFuerza * w;
    p = uPivote + rotarEje(p - uPivote, uEje, a);
    n = rotarEje(n, uEje, a);
  } else if (uDeformar == 2) {
    float h = clamp(p.y / max(uAlto, 1e-4), 0.0, 1.0);
    w = h;
    float onda = uTiempo * uRitmo * 7.0;
    float k = uFuerza * h * h * uAlto;
    p.x += sin(onda) * k;
    p.z += sin(onda * 1.3 + 1.7) * k * 0.6;
    p.y -= abs(sin(onda)) * k * 0.15; // se aplasta un poco al inclinarse
  }
  return p;
}
`;

/**
 * Prepara las piezas del modelo para deformarse. raizNormal es el grupo en cuyas coordenadas
 * el modelo está "normalizado" (de pie, centrado, apoyado en Y = 0).
 * Devuelve { actualizar(ajustes, t), recalcular(alto), resaltar(bool) }.
 */
export function prepararDeformacion(modelo, raizNormal) {
  // Valores compartidos por todas las piezas
  const comunes = {
    uTiempo: { value: 0 }, uDeformar: { value: 0 },
    uPunto: { value: new THREE.Vector3() }, uPivote: { value: new THREE.Vector3() }, uEje: { value: new THREE.Vector3(0, 0, 1) },
    uRadio: { value: 0.15 }, uFuerza: { value: 0 }, uRitmo: { value: 1 }, uAlto: { value: 0.8 }, uResaltar: { value: 0 },
  };
  const piezas = [];
  modelo.traverse((o) => {
    if (!o.isMesh) return;
    const propios = { uAModelo: { value: new THREE.Matrix4() }, uDesdeModelo: { value: new THREE.Matrix4() } };
    // Cada pieza necesita sus propias matrices: clonamos su material
    const conDeformacion = (m) => {
      const c = m.clone();
      c.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, comunes, propios);
        shader.vertexShader = CODIGO_VERTICES + shader.vertexShader
          .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
            {
              float wN;
              vec3 nM = normalize(mat3(uAModelo) * objectNormal);
              deformarPunto((uAModelo * vec4(position, 1.0)).xyz, nM, wN);
              objectNormal = normalize(mat3(uDesdeModelo) * nM);
            }`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            {
              vec3 nV = vec3(0.0, 1.0, 0.0);
              float wV;
              vec3 pM = deformarPunto((uAModelo * vec4(transformed, 1.0)).xyz, nV, wV);
              transformed = (uDesdeModelo * vec4(pM, 1.0)).xyz;
              vZona = wV;
            }`);
        // En la vista previa pintamos de amarillo la zona que se mueve
        shader.fragmentShader = 'uniform float uResaltar;\nvarying float vZona;\n' + shader.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.8, 0.25), clamp(vZona, 0.0, 1.0) * uResaltar * 0.75);`);
      };
      c.customProgramCacheKey = () => 'deformable-1';
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conDeformacion) : conDeformacion(o.material);
    piezas.push({ malla: o, propios });
  });

  const inv = new THREE.Matrix4();
  return {
    /** Cuando cambia la orientación base (qué eje va arriba), se recalculan las matrices */
    recalcular(alto) {
      raizNormal.updateWorldMatrix(true, true);
      inv.copy(raizNormal.matrixWorld).invert();
      for (const { malla, propios } of piezas) {
        propios.uAModelo.value.multiplyMatrices(inv, malla.matrixWorld);
        propios.uDesdeModelo.value.copy(propios.uAModelo.value).invert();
      }
      comunes.uAlto.value = alto;
    },
    actualizar(a, t) {
      const tipo = { ninguna: 0, saludar: 1, gelatina: 2 }[a.deformar] ?? 0;
      comunes.uDeformar.value = tipo;
      comunes.uTiempo.value = t;
      comunes.uRitmo.value = a.ritmoDeformar;
      comunes.uRadio.value = a.radio;
      comunes.uFuerza.value = tipo === 1 ? THREE.MathUtils.degToRad(a.fuerza) : a.fuerza / 90 * 0.35;
      comunes.uEje.value.fromArray(EJES_DEFORMAR[a.ejeDeformar]?.eje ?? [0, 0, 1]);
      if (tipo === 1 && a.punto) {
        const p = comunes.uPunto.value.fromArray(a.punto);
        // El "hombro": desde la zona, un radio hacia el centro del cuerpo (y un poco hacia abajo)
        const hacia = new THREE.Vector3(0, p.y * 0.75, 0).sub(p);
        if (hacia.lengthSq() < 1e-6) hacia.set(0, -1, 0);
        comunes.uPivote.value.copy(p).addScaledVector(hacia.normalize(), a.radio);
      }
    },
    resaltar(v) { comunes.uResaltar.value = v ? 1 : 0; },
  };
}
