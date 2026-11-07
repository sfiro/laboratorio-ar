// Lo que aparece sobre cada marcador y sobre la imagen.
// Coordenadas del ancla: X a la derecha, Y hacia "arriba" del marcador (en el papel),
// Z saliendo del papel. El marcador mide 1 × 1. Para que las cosas "se paren" sobre el papel,
// las ponemos en un grupo girado 90° (su Y queda apuntando fuera del papel, como en el nivel 8).
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...extra });

function etiqueta(texto) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = '700 44px system-ui, sans-serif';
  c.width = ctx.measureText(texto).width + 36; c.height = 66;
  ctx.fillStyle = '#0b0d12d0';
  ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, 20); ctx.fill();
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  ctx.fillText(texto, 18, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set((0.18 * c.width) / c.height, 0.18, 1);
  s.renderOrder = 10;
  return s;
}

/** Contorno del área detectada, un poco levantado del papel */
function contorno(ancho, alto, color) {
  const pts = [[-ancho / 2, alto / 2], [ancho / 2, alto / 2], [ancho / 2, -alto / 2], [-ancho / 2, -alto / 2], [-ancho / 2, alto / 2]];
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new THREE.Vector3(x, y, 0.005))), new THREE.LineBasicMaterial({ color }));
  return l;
}

const OBJETOS = [
  { nombre: 'Ejes', crear: () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat('#4f8cff', { transparent: true, opacity: 0.85 })).translateY(0.175));
    // Ejes del marcador: X rojo, Y verde (en el papel), Z azul (sale del papel)
    const flecha = (dir, color) => new THREE.ArrowHelper(dir, new THREE.Vector3(), 0.7, color, 0.12, 0.07);
    g.add(flecha(new THREE.Vector3(1, 0, 0), '#e5484d'), flecha(new THREE.Vector3(0, 0, -1), '#3ddc84'), flecha(new THREE.Vector3(0, 1, 0), '#4f8cff'));
    return g;
  } },
  { nombre: 'Cohete', crear: () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.45, 24), mat('#f1f3f7')).translateY(0.3));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 24), mat('#e5484d')).translateY(0.635));
    for (let i = 0; i < 3; i++) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.16, 0.1), mat('#e5484d'));
      a.position.set(Math.sin(i * 2.09) * 0.12, 0.15, Math.cos(i * 2.09) * 0.12);
      a.rotation.y = i * 2.09;
      g.add(a);
    }
    g.userData.giro = 1.2;
    return g;
  } },
  { nombre: 'Planeta', crear: () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 20), mat('#f08a3c', { roughness: 0.8 })).translateY(0.35));
    const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 8, 48), mat('#ffe08a'));
    anillo.position.y = 0.35; anillo.rotation.x = 1.2;
    g.add(anillo);
    return g;
  } },
  { nombre: 'Árbol', crear: () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.25, 12), mat('#7a4b1f')).translateY(0.125));
    [0.3, 0.45, 0.58].forEach((y, i) => g.add(new THREE.Mesh(new THREE.ConeGeometry(0.25 - i * 0.06, 0.25, 20), mat('#2f8f46')).translateY(y)));
    g.userData.giro = 0.2;
    return g;
  } },
  { nombre: 'Pirámide', crear: () => new THREE.Group().add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.45, 4), mat('#ffd166', { metalness: 0.2 })).translateY(0.225)) },
  { nombre: 'Anillos', crear: () => {
    const g = new THREE.Group();
    ['#ff5d8f', '#ffd166', '#4fe3c1', '#4f8cff'].forEach((c, i) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.22 - i * 0.04, 0.035, 12, 40), mat(c));
      t.rotation.x = Math.PI / 2; t.position.y = 0.04 + i * 0.08;
      g.add(t);
    });
    return g;
  } },
  { nombre: 'Nudo', crear: () => new THREE.Group().add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.16, 0.05, 120, 16), mat('#b388ff', { metalness: 0.3 })).translateY(0.3)) },
  { nombre: 'Diamante', crear: () => new THREE.Group().add(new THREE.Mesh(new THREE.OctahedronGeometry(0.22), mat('#7fd3ff', { metalness: 0.4, roughness: 0.1 })).translateY(0.3)) },
];

export const NOMBRES_DE_FABRICA = OBJETOS.map((o) => o.nombre);

/** propio (opcional): tu objeto de «Mis objetos 3D» = { objeto, animar(t, dt), nombre } */
export function contenidoMarcador(id, propio = null) {
  const def = OBJETOS[id % OBJETOS.length];
  const ancla = new THREE.Group();
  ancla.add(contorno(1, 1, '#3ddc84'));
  const parado = new THREE.Group();
  parado.rotation.x = Math.PI / 2; // su Y apunta fuera del papel
  const objeto = propio ? propio.objeto : def.crear();
  parado.add(objeto);
  const et = etiqueta(`ID ${id} · ${propio ? propio.nombre : def.nombre}`);
  // La etiqueta, justo encima del objeto
  et.position.y = propio ? Math.max(0.5, propio.alto() + 0.25) : 0.95;
  parado.add(et);
  ancla.add(parado);
  const animar = propio ? propio.animar : (t) => { objeto.rotation.y = t * (objeto.userData.giro ?? 0.6); };
  return { objeto: ancla, animar, etiqueta: et };
}

export function contenidoImagen(alto) {
  const ancla = new THREE.Group();
  ancla.add(contorno(1, alto, '#3ddc84'));
  const parado = new THREE.Group();
  parado.rotation.x = Math.PI / 2;
  const cubo = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), mat('#ff5d8f'));
  cubo.position.y = 0.2;
  const ejes = new THREE.AxesHelper(0.3);
  const et = etiqueta('ORB + flujo óptico');
  et.position.y = 0.45;
  parado.add(cubo, ejes, et);
  ancla.add(parado);
  return { objeto: ancla, animar: (t) => { cubo.rotation.set(t * 0.7, t, 0); cubo.position.y = 0.2 + Math.sin(t * 2) * 0.04; } };
}
