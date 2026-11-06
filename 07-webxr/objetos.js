// Objetos hechos con código, a TAMAÑO REAL (1 unidad = 1 metro).
// Cada uno tiene su origen en la base (lo que toca el piso), al centro.
// Solo usan MeshStandardMaterial para poder exportarlos a USDZ (AR Quick Look del iPhone).
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const malla = (geo, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
};

function planta() {
  const g = new THREE.Group();
  const barro = mat('#c4683f', { roughness: 0.9 });
  g.add(malla(new THREE.CylinderGeometry(0.13, 0.095, 0.22, 32), barro, 0, 0.11));
  g.add(malla(new THREE.TorusGeometry(0.13, 0.015, 8, 32), barro, 0, 0.22).rotateX(Math.PI / 2));
  g.add(malla(new THREE.CylinderGeometry(0.12, 0.12, 0.01, 32), mat('#4a3121', { roughness: 1 }), 0, 0.21));
  const hojas = new THREE.Group();
  hojas.name = 'hojas';
  const verdes = ['#2f8f46', '#3aa856', '#268040', '#4cbb64'];
  for (let i = 0; i < 11; i++) {
    const hoja = malla(new THREE.SphereGeometry(0.06, 16, 8), mat(verdes[i % 4], { roughness: 0.5, side: THREE.DoubleSide }));
    hoja.scale.set(0.45, 2.4, 0.12);
    const a = (i / 11) * Math.PI * 2, inclinar = 0.25 + (i % 3) * 0.18;
    hoja.position.set(Math.cos(a) * 0.05, 0.36 + (i % 3) * 0.04, Math.sin(a) * 0.05);
    hoja.rotation.set(Math.sin(a) * inclinar, 0, -Math.cos(a) * inclinar, 'YXZ');
    hoja.rotation.y = -a;
    hojas.add(hoja);
  }
  g.add(hojas);
  return { objeto: g, radio: 0.16, alto: 0.6, animar: (t) => { hojas.rotation.z = Math.sin(t * 1.3) * 0.03; } };
}

function lampara() {
  const g = new THREE.Group();
  const metal = mat('#2b2f36', { metalness: 0.7, roughness: 0.3 });
  g.add(malla(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 32), metal, 0, 0.015));
  g.add(malla(new THREE.CylinderGeometry(0.012, 0.012, 1.35, 12), metal, 0, 0.7));
  const pantalla = malla(new THREE.CylinderGeometry(0.12, 0.22, 0.26, 32, 1, true), mat('#f3e3c3', { side: THREE.DoubleSide, emissive: '#ffcf87', emissiveIntensity: 0.35 }), 0, 1.38);
  const foco = malla(new THREE.SphereGeometry(0.05, 16, 8), mat('#fff6dd', { emissive: '#ffe2a8', emissiveIntensity: 2 }), 0, 1.33);
  const luz = new THREE.PointLight('#ffd9a0', 1.2, 2.5, 2);
  luz.position.set(0, 1.3, 0);
  g.add(pantalla, foco, luz);
  return { objeto: g, radio: 0.2, alto: 1.52 };
}

function silla() {
  const g = new THREE.Group();
  const madera = mat('#b07a45', { roughness: 0.7 });
  g.add(malla(new THREE.BoxGeometry(0.44, 0.04, 0.42), madera, 0, 0.45));
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    g.add(malla(new THREE.BoxGeometry(0.035, 0.45, 0.035), madera, x, 0.225, z));
  }
  for (const x of [-0.19, 0.19]) g.add(malla(new THREE.BoxGeometry(0.035, 0.45, 0.035), madera, x, 0.69, -0.185));
  for (const y of [0.62, 0.78, 0.9]) g.add(malla(new THREE.BoxGeometry(0.42, 0.06, 0.02), madera, 0, y, -0.185));
  g.add(malla(new THREE.BoxGeometry(0.4, 0.03, 0.38), mat('#d9534f', { roughness: 0.95 }), 0, 0.485));
  return { objeto: g, radio: 0.3, alto: 0.93 };
}

function robot() {
  const g = new THREE.Group();
  const blanco = mat('#e8edf3', { roughness: 0.35 });
  const gris = mat('#5a6270', { metalness: 0.5, roughness: 0.4 });
  const ojos = mat('#57e3ff', { emissive: '#2ec7ff', emissiveIntensity: 1.6 });
  for (const x of [-0.08, 0.08]) g.add(malla(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 20), gris, x, 0.045, 0).rotateZ(Math.PI / 2));
  g.add(malla(new THREE.BoxGeometry(0.2, 0.18, 0.13), blanco, 0, 0.17));
  g.add(malla(new THREE.CircleGeometry(0.035, 20), mat('#ff5d8f', { emissive: '#ff2d6f', emissiveIntensity: 0.8 }), 0, 0.18, 0.066));
  const cabeza = new THREE.Group();
  cabeza.name = 'cabeza';
  cabeza.position.y = 0.27;
  cabeza.add(malla(new THREE.BoxGeometry(0.17, 0.12, 0.13), blanco, 0, 0.06));
  cabeza.add(malla(new THREE.BoxGeometry(0.14, 0.07, 0.01), mat('#1b2029', { roughness: 0.2 }), 0, 0.06, 0.066));
  for (const x of [-0.035, 0.035]) {
    const ojo = malla(new THREE.SphereGeometry(0.014, 12, 8), ojos, x, 0.065, 0.072);
    ojo.name = 'ojo';
    cabeza.add(ojo);
  }
  cabeza.add(malla(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), gris, 0, 0.15));
  cabeza.add(malla(new THREE.SphereGeometry(0.016, 12, 8), mat('#ffd166', { emissive: '#ffb700', emissiveIntensity: 1 }), 0, 0.185));
  g.add(cabeza);
  const brazos = [-1, 1].map((lado) => {
    const brazo = new THREE.Group();
    brazo.position.set(lado * 0.115, 0.24, 0);
    brazo.add(malla(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 10), gris, 0, -0.06));
    brazo.add(malla(new THREE.SphereGeometry(0.026, 12, 8), blanco, 0, -0.125));
    g.add(brazo);
    return brazo;
  });
  return {
    objeto: g, radio: 0.13, alto: 0.47,
    // El robot te mira (gira la cabeza hacia la cámara) y saluda de vez en cuando
    animar: (t, camara) => {
      const local = g.worldToLocal(camara.getWorldPosition(new THREE.Vector3()));
      const meta = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.2, 1.2);
      cabeza.rotation.y += (meta - cabeza.rotation.y) * 0.1;
      const saludo = Math.sin(t * 0.7) > 0.6;
      brazos[1].rotation.z = saludo ? 2.4 + Math.sin(t * 10) * 0.35 : 0.1;
      brazos[0].rotation.z = -0.1;
      const parpadeo = t % 3.5 < 0.12 ? 0.15 : 1;
      cabeza.children.filter((c) => c.name === 'ojo').forEach((o) => { o.scale.y = parpadeo; });
    },
  };
}

function cohete() {
  const g = new THREE.Group();
  const rojo = mat('#e5484d', { roughness: 0.35 });
  const blanco = mat('#f1f3f7', { roughness: 0.35 });
  g.add(malla(new THREE.CylinderGeometry(0.09, 0.1, 0.42, 32), blanco, 0, 0.32));
  g.add(malla(new THREE.ConeGeometry(0.09, 0.2, 32), rojo, 0, 0.63));
  g.add(malla(new THREE.CylinderGeometry(0.07, 0.05, 0.08, 24), mat('#5a6270', { metalness: 0.7, roughness: 0.3 }), 0, 0.07));
  g.add(malla(new THREE.CircleGeometry(0.04, 24), mat('#7fd3ff', { emissive: '#2a8fc4', emissiveIntensity: 0.6, roughness: 0.1 }), 0, 0.4, 0.097));
  for (let i = 0; i < 3; i++) {
    const aleta = malla(new THREE.BoxGeometry(0.012, 0.16, 0.09), rojo);
    const a = (i / 3) * Math.PI * 2;
    aleta.position.set(Math.sin(a) * 0.12, 0.17, Math.cos(a) * 0.12);
    aleta.rotation.y = a;
    g.add(aleta);
  }
  const llama = malla(new THREE.ConeGeometry(0.045, 0.12, 16), mat('#ffb12e', { emissive: '#ff7a00', emissiveIntensity: 2, transparent: true, opacity: 0.9 }), 0, -0.01);
  llama.rotation.x = Math.PI;
  llama.name = 'llama';
  // El cohete "flota" un poco: lo subimos para que la llama no atraviese el piso
  const cuerpo = new THREE.Group().add(...[...g.children], llama); // add() los saca de "g"
  cuerpo.position.y = 0.08;
  g.add(cuerpo);
  return {
    objeto: g, radio: 0.13, alto: 0.81,
    animar: (t) => { cuerpo.position.y = 0.08 + Math.sin(t * 2) * 0.015; llama.scale.y = 0.8 + Math.random() * 0.5; },
  };
}

export const CATALOGO = [
  { id: 'planta', nombre: 'Planta', emoji: '🪴', crear: planta },
  { id: 'lampara', nombre: 'Lámpara', emoji: '💡', crear: lampara },
  { id: 'silla', nombre: 'Silla', emoji: '🪑', crear: silla },
  { id: 'robot', nombre: 'Robot', emoji: '🤖', crear: robot },
  { id: 'cohete', nombre: 'Cohete', emoji: '🚀', crear: cohete },
];

/** Sombra suave en el piso: un círculo con degradado (mucho más barato que sombras reales) */
let texturaSombra = null;
export function sombra(radio, opacidad = 0.45) {
  if (!texturaSombra) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    texturaSombra = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radio * 2.6, radio * 2.6), new THREE.MeshBasicMaterial({
    map: texturaSombra, transparent: true, opacity: opacidad, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  m.name = 'sombra';
  m.renderOrder = -1;
  return m;
}
