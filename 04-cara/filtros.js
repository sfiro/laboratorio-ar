// Los filtros. Cada uno se diseña en CENTÍMETROS dentro de cara.grupo:
// origen en el entrecejo, X hacia tu derecha, Y hacia arriba, Z saliendo de tu cara.
import * as THREE from 'three';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { P } from './puente-cara.js';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const luces = () => {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.4));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(0.3, 1, 1);
  g.add(sol);
  return g;
};

/**
 * Oclusor: tu cara y tu cabeza como objetos INVISIBLES que sí ocupan profundidad.
 * Así las patas de las gafas o la parte de atrás del gorro se esconden detrás de ti.
 */
function oclusor(cara) {
  const invisible = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  const mascara = new THREE.Mesh(cara.malla, invisible);
  mascara.renderOrder = -1;
  mascara.frustumCulled = false;
  mascara.userData.sigueCara = true; // se oculta si no hay cara
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), invisible);
  cabeza.scale.set(7.6, 11, 10); // una cabeza aproximada, en cm
  cabeza.position.set(0, 1.5, -9.5);
  cabeza.renderOrder = -1;
  return { mascara, cabeza };
}

/** Un sistema de partículas sencillo, en coordenadas de pantalla */
class Particulas {
  constructor({ cantidad = 400, tamano = 10, textura = null, aditivo = false }) {
    this.n = cantidad;
    this.pos = new Float32Array(cantidad * 3);
    this.col = new Float32Array(cantidad * 3);
    this.vel = new Float32Array(cantidad * 3);
    this.vida = new Float32Array(cantidad); // segundos que le quedan (0 = apagada)
    this.vidaInicial = new Float32Array(cantidad);
    this.colorInicial = [];
    this.siguiente = 0;
    const geo = new THREE.BufferGeometry()
      .setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
      .setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.objeto = new THREE.Points(geo, new THREE.PointsMaterial({
      size: tamano, vertexColors: true, map: textura, transparent: true, depthWrite: false,
      blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.objeto.frustumCulled = false;
  }

  emitir(origen, velocidad, color, vida) {
    const i = this.siguiente;
    this.siguiente = (i + 1) % this.n;
    this.pos.set([origen.x, origen.y, origen.z], i * 3);
    this.vel.set([velocidad.x, velocidad.y, velocidad.z], i * 3);
    this.colorInicial[i] = color.clone();
    this.vida[i] = this.vidaInicial[i] = vida;
  }

  actualizar(dt, { gravedad = 0, alEnvejecer } = {}) {
    for (let i = 0; i < this.n; i++) {
      if (this.vida[i] <= 0) { this.pos[i * 3 + 2] = -99999; continue; } // escondida
      this.vida[i] -= dt;
      this.vel[i * 3 + 1] -= gravedad * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      const c = alEnvejecer ? alEnvejecer(this.colorInicial[i], 1 - this.vida[i] / this.vidaInicial[i]) : this.colorInicial[i];
      this.col.set([c.r, c.g, c.b], i * 3);
    }
    this.objeto.geometry.attributes.position.needsUpdate = true;
    this.objeto.geometry.attributes.color.needsUpdate = true;
  }
}

function texturaRedonda() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function texturaRayas(colores) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = colores[0];
  ctx.fillRect(0, 0, 256, 256);
  for (let i = -8; i < 16; i++) {
    ctx.fillStyle = colores[1 + (((i % (colores.length - 1)) + colores.length - 1) % (colores.length - 1))];
    ctx.beginPath();
    ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32 + 14, 0); ctx.lineTo(i * 32 + 14 + 256, 256); ctx.lineTo(i * 32 + 256, 256);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// La boca, en coordenadas de pantalla
const boca = (cara) => new THREE.Vector3().addVectors(cara.puntos[P.labioArriba], cara.puntos[P.labioAbajo]).multiplyScalar(0.5);

// ---------------------------------------------------------------------------
// Filtro 1 · Fiesta: gafas + gorro. Abre la boca: confeti. Sube las cejas: el gorro salta.
// ---------------------------------------------------------------------------
export function fiesta(ar) {
  const { cara } = ar;
  const contenido = new THREE.Group();

  // Gafas, hechas con piezas simples
  const marco = new THREE.MeshStandardMaterial({ color: 0xff4d8d, roughness: 0.35 });
  const cristal = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.75 });
  const gafas = new THREE.Group();
  for (const lado of [-1, 1]) {
    const aro = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.32, 12, 48), marco);
    aro.scale.set(1.15, 1, 1);
    aro.position.set(lado * 3.3, -0.4, 0);
    const lente = new THREE.Mesh(new THREE.CircleGeometry(2.3, 48), cristal);
    lente.scale.set(1.15, 1, 1);
    lente.position.set(lado * 3.3, -0.4, -0.05);
    const pata = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 10), marco);
    pata.position.set(lado * 6.0, 0.1, -5);
    gafas.add(aro, lente, pata);
  }
  const puente = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.25, 8, 24, Math.PI), marco);
  puente.position.set(0, 0.3, 0);
  gafas.add(puente);
  gafas.position.z = 0.8;

  // Gorro de fiesta
  const gorro = new THREE.Group();
  const cono = new THREE.Mesh(new THREE.ConeGeometry(4.2, 12, 48, 1, true),
    new THREE.MeshStandardMaterial({ map: texturaRayas(['#4fe3c1', '#ffd166', '#ff4d8d', '#8fb3ff']), side: THREE.DoubleSide }));
  cono.position.y = 6;
  const pompon = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
  pompon.position.y = 12.3;
  gorro.add(cono, pompon);
  gorro.position.set(1, 7.6, -3.5);
  gorro.rotation.set(-0.25, 0, -0.25);

  const { mascara, cabeza } = oclusor(cara);
  contenido.add(gafas, gorro, cabeza, luces());

  const confeti = new Particulas({ cantidad: 500, tamano: 9 });
  const colores = ['#ff4d8d', '#ffd166', '#4fe3c1', '#8fb3ff', '#b48cff'].map((c) => new THREE.Color(c));

  return {
    nombre: 'Fiesta',
    ayuda: 'Abre la boca 🎉 · Sube las cejas 🎩',
    enCara: [contenido],
    enPantalla: [mascara, confeti.objeto],
    alCuadro(t, dt) {
      const g = cara.gestos;
      // Cejas arriba → el gorro brinca
      gorro.position.y = 7.6 + (g.browInnerUp ?? 0) * 3 * Math.abs(Math.sin(t * 12));
      // Boca abierta → confeti
      if (cara.visible && (g.jawOpen ?? 0) > 0.35) {
        const o = boca(cara), e = cara.escala;
        for (let k = 0; k < 4; k++) {
          const v = new THREE.Vector3((Math.random() - 0.5) * 60 * e, (10 + Math.random() * 25) * e, 0).addScaledVector(cara.adelante, 20 * e);
          confeti.emitir(o, v, colores[Math.floor(Math.random() * colores.length)], 1.6);
        }
      }
      confeti.actualizar(dt, { gravedad: 40 * cara.escala });
    },
  };
}

// ---------------------------------------------------------------------------
// Filtro 2 · Neón: tu cara como una malla de luz. Parpadea para cambiar de color.
// ---------------------------------------------------------------------------
export function neon(ar) {
  const { cara } = ar;
  const material = new THREE.LineBasicMaterial({ color: 0x4fe3c1, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const red = new THREE.LineSegments(cara.aristas, material);
  red.frustumCulled = false;
  red.userData.sigueCara = true;

  // Iris y contorno de ojos y labios, más brillantes
  const contornos = [...FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, ...FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
    ...FaceLandmarker.FACE_LANDMARKS_LIPS, ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE];
  const geoContornos = new THREE.BufferGeometry().setAttribute('position', cara.malla.attributes.position)
    .setIndex(contornos.flatMap((c) => [c.start, c.end]));
  const brillo = new THREE.LineSegments(geoContornos, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending }));
  brillo.frustumCulled = false;
  brillo.userData.sigueCara = true;

  const paleta = [0x4fe3c1, 0xff4d8d, 0xffd166, 0x8fb3ff, 0xb48cff].map((c) => new THREE.Color(c));
  let indice = 0, ojosCerrados = false;

  return {
    nombre: 'Neón',
    ayuda: 'Parpadea para cambiar de color 😉 · Sonríe para brillar',
    enPantalla: [red, brillo],
    alCuadro(t) {
      const g = cara.gestos;
      const parpadeo = ((g.eyeBlinkLeft ?? 0) + (g.eyeBlinkRight ?? 0)) / 2 > 0.5;
      if (parpadeo && !ojosCerrados) indice = (indice + 1) % paleta.length; // cambia al cerrar, no mientras sigan cerrados
      ojosCerrados = parpadeo;
      material.color.lerp(paleta[indice], 0.2);
      brillo.material.color.copy(material.color).lerp(new THREE.Color(1, 1, 1), 0.6);
      const sonrisa = ((g.mouthSmileLeft ?? 0) + (g.mouthSmileRight ?? 0)) / 2;
      material.opacity = 0.35 + 0.5 * sonrisa + 0.08 * Math.sin(t * 6);
    },
  };
}

// ---------------------------------------------------------------------------
// Filtro 3 · Dragón: cuernos y fuego al abrir la boca
// ---------------------------------------------------------------------------
export function dragon(ar) {
  const { cara } = ar;
  const contenido = new THREE.Group();
  const cuerno = new THREE.MeshStandardMaterial({ color: 0xf2e6c9, roughness: 0.6 });
  for (const lado of [-1, 1]) {
    // Un cuerno curvo: un cono doblado con varias secciones
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 24, 8), cuerno);
    const pos = c.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 3; // 0 en la base, 6 en la punta
      pos.setZ(i, pos.getZ(i) - 0.12 * y * y);
    }
    c.geometry.computeVertexNormals();
    c.position.set(lado * 3.8, 8.5, -2.5);
    c.rotation.z = -lado * 0.35;
    contenido.add(c);
  }
  const escamas = new THREE.MeshStandardMaterial({ color: 0x2bb673, roughness: 0.5, flatShading: true });
  for (let i = 0; i < 5; i++) {
    const e = new THREE.Mesh(new THREE.TetrahedronGeometry(0.9 - i * 0.08), escamas);
    e.position.set(0, 9.5 + i * 0.4, -3 - i * 2.2);
    e.rotation.set(0.6, 0.8, 0);
    contenido.add(e);
  }
  const { mascara, cabeza } = oclusor(cara);
  contenido.add(cabeza, luces());

  const fuego = new Particulas({ cantidad: 700, tamano: 28, textura: texturaRedonda(), aditivo: true });
  const amarillo = new THREE.Color(1, 0.9, 0.3), rojo = new THREE.Color(1, 0.15, 0), humo = new THREE.Color(0.15, 0.1, 0.1);
  const tmp = new THREE.Color();

  return {
    nombre: 'Dragón',
    ayuda: 'Abre la boca para echar fuego 🔥',
    enCara: [contenido],
    enPantalla: [mascara, fuego.objeto],
    alCuadro(t, dt) {
      const abierta = cara.gestos.jawOpen ?? 0;
      if (cara.visible && abierta > 0.3) {
        const o = boca(cara), e = cara.escala;
        for (let k = 0; k < 6; k++) {
          const v = cara.adelante.clone().multiplyScalar((30 + Math.random() * 20) * e)
            .add(new THREE.Vector3((Math.random() - 0.5) * 12 * e, (Math.random() - 0.3) * 12 * e, 0));
          fuego.emitir(o, v.multiplyScalar(0.6 + abierta), amarillo, 0.6 + Math.random() * 0.4);
        }
      }
      // Amarillo → rojo → humo, mientras envejece
      fuego.actualizar(dt, {
        gravedad: -25 * cara.escala, // el fuego sube
        alEnvejecer: (_, edad) => (edad < 0.5 ? tmp.lerpColors(amarillo, rojo, edad * 2) : tmp.lerpColors(rojo, humo, (edad - 0.5) * 2)),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Filtro 4 · Datos: lo que "ve" MediaPipe. Los 478 puntos, los ejes de la pose y los gestos.
// ---------------------------------------------------------------------------
export function datos(ar, panel) {
  const { cara } = ar;
  const puntos = new THREE.Points(cara.malla, new THREE.PointsMaterial({ color: 0xffffff, size: 2.5 }));
  puntos.frustumCulled = false;
  puntos.userData.sigueCara = true;

  // Ejes de la cabeza: rojo = derecha, verde = arriba, azul = adelante (5 cm cada uno)
  const ejes = new THREE.Group();
  [[0xff4d5a, [1, 0, 0]], [0x3ddc84, [0, 1, 0]], [0x4f8cff, [0, 0, 1]]].forEach(([color, dir]) => {
    ejes.add(new THREE.ArrowHelper(new THREE.Vector3(...dir), new THREE.Vector3(), 5, color, 1.2, 0.8));
  });

  const MOSTRAR = ['jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'eyeBlinkLeft', 'eyeBlinkRight', 'browInnerUp', 'mouthPucker', 'cheekPuff'];
  const NOMBRES = {
    jawOpen: 'Boca abierta', mouthSmileLeft: 'Sonrisa izq.', mouthSmileRight: 'Sonrisa der.', eyeBlinkLeft: 'Parpadeo izq.',
    eyeBlinkRight: 'Parpadeo der.', browInnerUp: 'Cejas arriba', mouthPucker: 'Beso', cheekPuff: 'Cachetes inflados',
  };
  panel.innerHTML = MOSTRAR.map((k) => `<div class="gesto"><span>${NOMBRES[k]}</span><div class="barra"><div data-gesto="${k}"></div></div></div>`).join('')
    + '<div id="pose" class="pose"></div>';
  const barras = Object.fromEntries([...panel.querySelectorAll('[data-gesto]')].map((el) => [el.dataset.gesto, el]));
  const pose = panel.querySelector('#pose');
  const angulos = new THREE.Euler();
  const [posicion, giro, escala] = [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
  let ultimo = 0;

  return {
    nombre: 'Datos',
    ayuda: '478 puntos y 52 gestos, en cada cuadro',
    panel: true,
    enPantalla: [puntos],
    enCara: [ejes],
    alCuadro(t) {
      if (!cara.visible || t - ultimo < 0.1) return;
      ultimo = t;
      for (const k of MOSTRAR) barras[k].style.width = `${Math.round((cara.gestos[k] ?? 0) * 100)}%`;
      cara.grupo.matrix.decompose(posicion, giro, escala); // separa posición, giro y tamaño
      angulos.setFromQuaternion(giro, 'YXZ');
      const g = (r) => Math.round(THREE.MathUtils.radToDeg(r));
      pose.textContent = `Giro: ${g(angulos.y)}° · Inclinación: ${g(angulos.x)}° · Ladeo: ${g(angulos.z)}° · Escala: ${cara.escala.toFixed(1)} px/cm`;
    },
  };
}
