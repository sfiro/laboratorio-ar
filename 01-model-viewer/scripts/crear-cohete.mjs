// Construye nuestro propio modelo 3D (un cohete) con código y lo guarda como public/cohete.glb
//
// - three.js nos da las formas básicas (cilindros, conos, esferas, cajas).
// - glTF-Transform escribe el archivo .glb, el "JPG de los modelos 3D".
//
// Unidades: METROS. En AR la escala es real: este cohete mide unos 60 cm.

import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import { fileURLToPath } from 'node:url';

const doc = new Document();
const buffer = doc.createBuffer();
const escena = doc.createScene('Escena');

// ---------------------------------------------------------------------------
// Materiales (PBR: color, metálico, rugosidad)
// ---------------------------------------------------------------------------
const material = (nombre, [r, g, b], { metal = 0, rugosidad = 0.5, emisivo } = {}) => {
  const m = doc.createMaterial(nombre)
    .setBaseColorFactor([r, g, b, 1])
    .setMetallicFactor(metal)
    .setRoughnessFactor(rugosidad);
  if (emisivo) m.setEmissiveFactor(emisivo); // brilla con luz propia
  return m;
};

const pintura  = material('Pintura',  [0.92, 0.93, 0.95], { rugosidad: 0.35 });
const detalles = material('Detalles', [0.90, 0.20, 0.22], { rugosidad: 0.4 });
const vidrio   = material('Ventana',  [0.20, 0.55, 0.95], { metal: 0.6, rugosidad: 0.1 });
const metal    = material('Metal',    [0.55, 0.57, 0.60], { metal: 1, rugosidad: 0.3 });
const fuego    = material('Fuego',    [1.00, 0.55, 0.10], { emisivo: [1, 0.45, 0.05] });
const base     = material('Base',     [0.18, 0.19, 0.22], { rugosidad: 0.8 });

// ---------------------------------------------------------------------------
// Convertir una geometría de three.js en una malla glTF
// ---------------------------------------------------------------------------
const accesor = (tipo, array) => doc.createAccessor().setType(tipo).setArray(array).setBuffer(buffer);

function malla(nombre, geometria, mat) {
  const indices = geometria.index.array;
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', accesor('VEC3', new Float32Array(geometria.attributes.position.array)))
    .setAttribute('NORMAL', accesor('VEC3', new Float32Array(geometria.attributes.normal.array)))
    .setIndices(accesor('SCALAR', indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)))
    .setMaterial(mat);
  return doc.createNode(nombre).setMesh(doc.createMesh(nombre).addPrimitive(prim));
}

// ---------------------------------------------------------------------------
// Las piezas del cohete (todas en coordenadas del "cuerpo", Y hacia arriba)
// ---------------------------------------------------------------------------
const R = 0.08; // radio del fuselaje

const fuselaje = malla('Fuselaje', new CylinderGeometry(R, R, 0.35, 32).translate(0, 0.275, 0), pintura);
const punta    = malla('Punta', new ConeGeometry(R, 0.15, 32).translate(0, 0.525, 0), detalles);
const tobera   = malla('Tobera', new CylinderGeometry(R * 0.55, R * 0.7, 0.04, 24).translate(0, 0.08, 0), metal);
const ventana  = malla('Ventana', new SphereGeometry(0.035, 24, 16).scale(1, 1, 0.4).translate(0, 0.36, R), vidrio);
const marco    = malla('Marco', new CylinderGeometry(0.04, 0.04, 0.01, 24).rotateX(Math.PI / 2).translate(0, 0.36, R - 0.002), metal);

// Tres aletas repartidas cada 120°
const aletas = [0, 1, 2].map((i) =>
  malla(`Aleta ${i + 1}`,
    new BoxGeometry(0.008, 0.13, 0.07).translate(0, 0.165, R + 0.035).rotateY((i * 2 * Math.PI) / 3),
    detalles));

// La llama: su parte ancha queda en y=0 para que al estirarla crezca hacia abajo
const llama = malla('Llama', new ConeGeometry(0.045, 0.06, 24).rotateX(Math.PI).translate(0, -0.03, 0), fuego)
  .setTranslation([0, 0.06, 0]);

const cuerpo = doc.createNode('Cohete');
[fuselaje, punta, tobera, ventana, marco, ...aletas, llama].forEach((n) => cuerpo.addChild(n));

// Plataforma de lanzamiento (no se mueve)
const plataforma = malla('Plataforma', new CylinderGeometry(0.16, 0.18, 0.02, 40).translate(0, 0.01, 0), base);

escena.addChild(plataforma).addChild(cuerpo);

// ---------------------------------------------------------------------------
// Animación "Flotar": el cohete sube y baja, la llama parpadea
// ---------------------------------------------------------------------------
const tiempos = accesor('SCALAR', new Float32Array([0, 1, 2]));
const animacion = doc.createAnimation('Flotar');

const canal = (nodo, propiedad, valores) => {
  const sampler = doc.createAnimationSampler()
    .setInput(tiempos)
    .setOutput(accesor('VEC3', new Float32Array(valores)))
    .setInterpolation('LINEAR');
  animacion.addSampler(sampler).addChannel(
    doc.createAnimationChannel().setTargetNode(nodo).setTargetPath(propiedad).setSampler(sampler));
};

canal(cuerpo, 'translation', [0, 0.0, 0,   0, 0.05, 0,   0, 0.0, 0]);
canal(llama, 'scale',        [1, 1.0, 1,   1, 1.8, 1,    1, 1.0, 1]);

// ---------------------------------------------------------------------------
const destino = fileURLToPath(new URL('../public/cohete.glb', import.meta.url));
await new NodeIO().write(destino, doc);
console.log(`Modelo guardado en ${destino}`);
