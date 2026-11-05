// El contenido 3D que aparece sobre cada imagen.
// Coordenadas de cada póster: origen en el centro, X a la derecha, Y hacia arriba,
// Z saliendo del papel hacia ti. 1 unidad = ancho del póster (el alto es 0.75).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Convierte píxeles del póster (1200×900) a nuestras coordenadas
const px = (x, y) => [x / 1200 - 0.5, (450 - y) / 1200];

// Curva de animación que se pasa un poquito y regresa (como un resorte)
const salto = (t) => {
  const c = 1.70158 + 1;
  return 1 + c * (t - 1) ** 3 + (c - 1) * (t - 1) ** 2;
};

const luces = (grupo) => {
  grupo.add(new THREE.HemisphereLight(0xffffff, 0x444466, 2.2));
  const sol = new THREE.DirectionalLight(0xffffff, 2);
  sol.position.set(0.5, 1, 1);
  grupo.add(sol);
};

let promesaCohete;
function cargarCohete() {
  promesaCohete ??= new GLTFLoader().loadAsync('./cohete.glb').then((gltf) => {
    gltf.scene.getObjectByName('Plataforma')?.removeFromParent(); // aquí no queremos la base
    return gltf.scene;
  });
  return promesaCohete.then((modelo) => modelo.clone());
}

// Estrellitas que flotan sobre el papel y parpadean
function estrellas(cantidad, ancho, alto) {
  const pos = new Float32Array(cantidad * 3);
  for (let i = 0; i < cantidad; i++) {
    pos.set([(Math.random() - 0.5) * ancho, (Math.random() - 0.5) * alto, 0.02 + Math.random() * 0.35], i * 3);
  }
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff3b0, size: 0.012, transparent: true }));
}

// ---------------------------------------------------------------------------
// Póster 0 · "Cohete": el planeta, la luna y el cohete salen del papel
// ---------------------------------------------------------------------------
export function posterCohete(ar, ancla) {
  const g = ancla.grupo;
  luces(g);

  const planeta = new THREE.Group();
  planeta.position.set(...px(300, 600), 0);
  const esfera = new THREE.Mesh(
    new THREE.SphereGeometry(0.142, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xf08a3c, roughness: 0.8 }));
  // Cráteres: esferitas oscuras hundidas en la superficie
  for (let i = 0; i < 12; i++) {
    const r = 0.012 + Math.random() * 0.02;
    const crater = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 1 }));
    // Casi hundido en el planeta: solo asoma un disco oscuro
    crater.position.randomDirection().multiplyScalar(0.142 - r * 0.85);
    esfera.add(crater);
  }
  const anillo = new THREE.Mesh(
    new THREE.RingGeometry(0.19, 0.235, 96),
    new THREE.MeshStandardMaterial({ color: 0xffe08a, side: THREE.DoubleSide }));
  anillo.rotation.set(1.2, 0.3, 0);
  planeta.add(esfera, anillo);

  const luna = new THREE.Mesh(new THREE.SphereGeometry(0.058, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0xcfd6e4, roughness: 0.9 }));

  const brillos = estrellas(140, 1, 0.75);
  g.add(planeta, luna, brillos);

  const orbita = new THREE.Group(); // el cohete da vueltas alrededor del planeta
  orbita.position.copy(planeta.position);
  g.add(orbita);
  cargarCohete().then((cohete) => {
    cohete.scale.setScalar(0.32);
    cohete.position.set(0.33, 0, 0);
    cohete.rotation.set(0, 0, 0); // el cohete apunta hacia +Y: tangente a la órbita
    orbita.add(cohete);
  });

  // Animación: al encontrar el póster, todo "brota" del papel
  let inicio = null;
  ancla.alEncontrar = () => { inicio = null; };
  ar.alCuadro.push((t) => {
    if (!ancla.visible) return;
    inicio ??= t;
    const p = Math.min((t - inicio) / 0.9, 1), s = salto(p);

    planeta.position.z = 0.16 * s;
    planeta.scale.setScalar(Math.max(s, 0.001));
    esfera.rotation.y = t * 0.4;

    const [lx, ly] = px(960, 230);
    luna.position.set(lx, ly + 0.02 * Math.sin(t * 2), 0.1 * s);
    luna.scale.setScalar(Math.max(s, 0.001));

    orbita.position.z = 0.16 * s;
    orbita.rotation.z = t * 0.8; // gira en el plano del póster
    orbita.scale.setScalar(Math.max(s, 0.001));

    brillos.material.opacity = (0.55 + 0.45 * Math.sin(t * 3)) * p;
  });
}

// ---------------------------------------------------------------------------
// Póster 1 · "Portal": a través de la ventana se ve un mundo DENTRO del papel
//
// El truco es un "oclusor": una pared invisible alrededor de la ventana que no
// pinta color, pero sí ocupa profundidad. Todo lo que está detrás de ella se
// esconde, así que el mundo interior solo se ve a través del hueco.
// ---------------------------------------------------------------------------
export function posterPortal(ar, ancla) {
  const g = ancla.grupo;
  const lado = 400 / 1200; // la ventana mide 400 px
  const fondo = 0.6;       // profundidad del cuarto interior

  // 1) Oclusor: 4 paneles alrededor del hueco, en el plano del póster
  const oclusor = new THREE.MeshBasicMaterial({ colorWrite: false });
  const grande = 3;
  [
    [0, (lado + grande) / 2, grande * 2, grande],  // arriba
    [0, -(lado + grande) / 2, grande * 2, grande], // abajo
    [-(lado + grande) / 2, 0, grande, lado],       // izquierda
    [(lado + grande) / 2, 0, grande, lado],        // derecha
  ].forEach(([x, y, w, h]) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), oclusor);
    panel.position.set(x, y, 0);
    panel.renderOrder = -1; // se dibuja primero, para "reservar" la profundidad
    g.add(panel);
  });

  // 2) El cuarto interior: una caja vista desde adentro, con estrellas en las paredes
  const textura = texturaGalaxia();
  const cuarto = new THREE.Mesh(
    new THREE.BoxGeometry(lado, lado, fondo),
    new THREE.MeshBasicMaterial({ map: textura, side: THREE.BackSide }));
  cuarto.position.z = -fondo / 2;
  g.add(cuarto);

  // 3) Cosas flotando adentro
  const nudo = new THREE.Mesh(new THREE.TorusKnotGeometry(0.06, 0.02, 160, 16), new THREE.MeshNormalMaterial());
  nudo.position.z = -0.35;
  const lunas = [0xef476f, 0xffd166, 0x06d6a0].map((color) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 24, 16), new THREE.MeshBasicMaterial({ color }));
    g.add(m);
    return m;
  });

  // 4) Una esfera que SALE del portal hacia tu cuarto y regresa
  const viajera = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 1),
    new THREE.MeshStandardMaterial({ color: 0x4fe3c1, emissive: 0x135c4c, flatShading: true }));
  const luz = new THREE.PointLight(0x4fe3c1, 0.6, 0.6);
  viajera.add(luz);

  // Marco 3D alrededor de la ventana
  const marco = new THREE.MeshStandardMaterial({ color: 0x1d1e2c, roughness: 0.6 });
  const grosor = 0.02;
  [[0, lado / 2 + grosor / 2, lado + 2 * grosor, grosor], [0, -lado / 2 - grosor / 2, lado + 2 * grosor, grosor],
   [-lado / 2 - grosor / 2, 0, grosor, lado], [lado / 2 + grosor / 2, 0, grosor, lado]].forEach(([x, y, w, h]) => {
    const barra = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), marco);
    barra.position.set(x, y, 0.015);
    g.add(barra);
  });

  g.add(nudo, viajera);
  luces(g);

  ar.alCuadro.push((t) => {
    if (!ancla.visible) return;
    nudo.rotation.set(t * 0.7, t * 0.5, 0);
    lunas.forEach((m, i) => {
      const a = t * (0.8 + i * 0.3) + (i * Math.PI * 2) / 3;
      m.position.set(Math.cos(a) * 0.11, Math.sin(a) * 0.11, -0.35 + Math.sin(a * 2) * 0.08);
    });
    // Va y viene: de z = -0.45 (al fondo del cuarto) a z = +0.3 (fuera del póster)
    const viaje = (Math.sin(t * 0.9) + 1) / 2;
    viajera.position.set(Math.sin(t * 1.7) * 0.05, Math.cos(t * 1.3) * 0.05, -0.45 + viaje * 0.75);
    viajera.rotation.set(t, t * 1.3, 0);
  });
}

function texturaGalaxia() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(256, 256, 20, 256, 256, 360);
  grad.addColorStop(0, '#3a1c71');
  grad.addColorStop(0.5, '#1b1f5e');
  grad.addColorStop(1, '#05060f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `hsla(${200 + Math.random() * 120}, 80%, ${70 + Math.random() * 30}%, ${0.4 + Math.random() * 0.6})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 1.8, 0, 7);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Tu propia imagen: un marco 3D y el cohete dando vueltas a su alrededor
// ---------------------------------------------------------------------------
export function imagenPropia(ar, ancla) {
  const g = ancla.grupo;
  luces(g);
  const alto = () => ancla.alto;

  // Poco metálico: sin un "entorno" que reflejar, el metal se ve oscuro
  const marcoMat = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.1, roughness: 0.4 });
  const barras = [0, 1, 2, 3].map(() => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), marcoMat);
    g.add(b);
    return b;
  });

  const orbita = new THREE.Group();
  g.add(orbita);
  cargarCohete().then((cohete) => {
    cohete.scale.setScalar(0.35);
    orbita.add(cohete);
    orbita.userData.cohete = cohete;
  });

  const brillos = estrellas(120, 1.2, 1);
  g.add(brillos);

  ar.alCuadro.push((t) => {
    if (!ancla.visible) return;
    const h = alto(), b = 0.03;
    // Ajusta el marco a la proporción de la imagen
    [[0, h / 2 + b / 2, 1 + 2 * b, b], [0, -h / 2 - b / 2, 1 + 2 * b, b], [-0.5 - b / 2, 0, b, h], [0.5 + b / 2, 0, b, h]]
      .forEach(([x, y, w, hh], i) => { barras[i].position.set(x, y, b / 2); barras[i].scale.set(w, hh, b); });

    const cohete = orbita.userData.cohete;
    if (cohete) {
      const a = t * 0.9;
      cohete.position.set(Math.cos(a) * 0.65, Math.sin(a) * (h / 2 + 0.15), 0.15);
      cohete.rotation.z = a; // apunta en la dirección del movimiento
    }
    brillos.material.opacity = 0.55 + 0.45 * Math.sin(t * 3);
  });
}
