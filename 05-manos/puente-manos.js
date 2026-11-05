// Nuestro puente entre MediaPipe Hand Landmarker y Three.js.
//
// MediaPipe nos da, en cada cuadro de video, 21 puntos por mano (hasta 2 manos).
// Todo lo demás lo hacemos nosotros:
//   - Llevamos los puntos a la pantalla (en espejo solo con la cámara frontal).
//   - Seguimos a cada mano entre cuadros (MediaPipe no garantiza el orden).
//   - Suavizamos el temblor de los puntos.
//   - Detectamos el PELLIZCO (pulgar + índice) y qué DEDOS están estirados.
//   - Reconocemos GESTOS con geometría: puño, paz, pulgar arriba, mano abierta...
//   - Medimos la VELOCIDAD del pellizco, para poder lanzar cosas.
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// Los 21 puntos de la mano:
//   0 muñeca · pulgar 1-4 · índice 5-8 · medio 9-12 · anular 13-16 · meñique 17-20
//   (en cada dedo: base, dos articulaciones y la PUNTA)
export const PUNTAS = { pulgar: 4, indice: 8, medio: 12, anular: 16, menique: 20 };
const ARTICULACION = { indice: 6, medio: 10, anular: 14, menique: 18 }; // la del medio de cada dedo
export const HUESOS = HandLandmarker.HAND_CONNECTIONS.map(({ start, end }) => [start, end]);

// Umbrales del pellizco, en "tamaños de mano". Dos umbrales distintos (histéresis)
// para que no parpadee entre pellizcado / suelto cuando estás justo en el límite.
const PELLIZCO_CIERRA = 0.32;
const PELLIZCO_ABRE = 0.5;

// Gestos que reconocemos a partir de qué dedos están estirados
const GESTOS = [
  { nombre: 'puño', emoji: '✊', dedos: [0, 0, 0, 0, 0] },
  { nombre: 'mano abierta', emoji: '🖐️', dedos: [1, 1, 1, 1, 1] },
  { nombre: 'paz', emoji: '✌️', dedos: [null, 1, 1, 0, 0] },
  { nombre: 'señalar', emoji: '☝️', dedos: [null, 1, 0, 0, 0] },
  { nombre: 'rock', emoji: '🤘', dedos: [null, 1, 0, 0, 1] },
  { nombre: 'llámame', emoji: '🤙', dedos: [1, 0, 0, 0, 1] },
  { nombre: 'tres', emoji: '🤟', dedos: [1, 1, 0, 0, 1] },
];

function nuevaMano(id) {
  const puntos = [];
  for (let i = 0; i < 21; i++) puntos.push(new THREE.Vector3());
  return {
    id,
    visible: false,
    puntos,                         // 21 puntos en píxeles de pantalla (origen al centro, Y hacia arriba)
    lado: '',                       // 'derecha' o 'izquierda'
    tamano: 1,                      // muñeca → base del dedo medio, en píxeles
    pellizco: false,                // ¿pulgar e índice juntos?
    aperturaPellizco: 1,            // distancia pulgar-índice en "tamaños de mano"
    puntoPellizco: new THREE.Vector3(), // punto medio entre pulgar e índice
    velocidad: new THREE.Vector3(), // del punto de pellizco, en px/s
    dedos: { pulgar: false, indice: false, medio: false, anular: false, menique: false },
    cuantosDedos: 0,
    gesto: null,                    // { nombre, emoji } o null
    alPellizcar: [],                // funciones(mano) — se llaman una vez al cerrar el pellizco
    alSoltar: [],                   // funciones(mano) — una vez al abrir
    _anterior: null,                // para medir la velocidad
  };
}

export class RealidadDeManos {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.escena = new THREE.Scene();
    // Cámara ORTOGRÁFICA del tamaño de la pantalla: 1 unidad = 1 píxel CSS (como en el nivel 4)
    this.camara = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
    this.alCuadro = [];
    this.manos = [nuevaMano(0), nuevaMano(1)];
    this.ancho = 1;
    this.alto = 1;
  }

  /** frontal = true usa la cámara de selfie (y la muestra en espejo) */
  async iniciar({ frontal = false, estado = () => {} } = {}) {
    this.frontal = frontal;

    // 1) Cámara ---------------------------------------------------------------
    estado('Encendiendo la cámara…');
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, autoplay: true });
    this.video.setAttribute('playsinline', '');
    this.video.className = 'video-camara' + (frontal ? ' espejo' : '');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: frontal ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = this.stream;
    this.contenedor.prepend(this.video);
    await this.video.play();
    if (!this.video.videoWidth) await new Promise((ok) => this.video.addEventListener('loadedmetadata', ok, { once: true }));

    // 2) Lienzo 3D --------------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = 'lienzo-3d';
    this.contenedor.append(this.renderer.domElement);
    this.#ajustarTamano();
    this.alRedimensionar = () => this.#ajustarTamano();
    window.addEventListener('resize', this.alRedimensionar);

    // 3) MediaPipe --------------------------------------------------------------
    estado('Cargando el modelo de las manos (7.8 MB)…');
    const archivos = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe-wasm', location.href).href);
    const opciones = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('./modelos/hand_landmarker.task', location.href).href, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
    });
    try {
      this.detector = await HandLandmarker.createFromOptions(archivos, opciones('GPU'));
    } catch {
      this.detector = await HandLandmarker.createFromOptions(archivos, opciones('CPU')); // plan B
    }

    // 4) Bucle: detectar → actualizar → dibujar ----------------------------------
    let ultimoTiempoVideo = -1;
    const reloj = new THREE.Timer();
    this.renderer.setAnimationLoop((ahora) => {
      reloj.update(ahora);
      if (this.video.currentTime !== ultimoTiempoVideo) { // solo si hay un cuadro nuevo
        ultimoTiempoVideo = this.video.currentTime;
        const ms = performance.now();
        // Solo en desarrollo: manos sintéticas para probar sin cámara (ver README)
        // (ojo: con `DEV && …` en producción quedaría `false`, y `false ?? detectar` NO detecta)
        const falsas = import.meta.env.DEV ? window.__manosDePrueba?.(ms / 1000) : null;
        this.#actualizarManos(falsas ?? this.detector.detectForVideo(this.video, ms), ms / 1000);
      }
      const t = reloj.getElapsed(), dt = Math.min(reloj.getDelta(), 0.1);
      this.alCuadro.forEach((f) => f(t, dt, this.manos));
      this.renderer.render(this.escena, this.camara);
    });
    estado('');
  }

  #actualizarManos(resultado, t) {
    const { anchoMostrado: W, altoMostrado: H } = this;
    // a) Puntos → pantalla. Origen en el centro, Y hacia arriba. X en espejo solo con la frontal.
    const espejo = this.frontal ? -1 : 1;
    const detectadas = (resultado.landmarks ?? []).map((puntos, k) => ({
      puntos: puntos.map(({ x, y, z }) => new THREE.Vector3(espejo * (x - 0.5) * W, (0.5 - y) * H, -z * W)),
      // MediaPipe supone una imagen en espejo; la nuestra no lo es, así que invertimos la etiqueta
      lado: resultado.handedness?.[k]?.[0]?.categoryName === 'Left' ? 'derecha' : 'izquierda',
    }));

    // b) Seguimiento: emparejamos cada mano detectada con la mano de antes más cercana.
    //    Con 2 manos probamos las dos combinaciones y nos quedamos con la de menor distancia total
    //    (así no se intercambian cuando se cruzan).
    const costo = (m, d) => (m.visible ? m.puntos[0].distanceTo(d.puntos[0]) : 1e6 + m.id);
    let orden = [this.manos[0], this.manos[1]];
    if (detectadas.length === 1 && costo(this.manos[1], detectadas[0]) < costo(this.manos[0], detectadas[0])) orden = [this.manos[1], this.manos[0]];
    if (detectadas.length === 2) {
      const directo = costo(this.manos[0], detectadas[0]) + costo(this.manos[1], detectadas[1]);
      const cruzado = costo(this.manos[1], detectadas[0]) + costo(this.manos[0], detectadas[1]);
      if (cruzado < directo) orden = [this.manos[1], this.manos[0]];
    }
    detectadas.forEach((d, k) => this.#actualizarMano(orden[k], d, t));
    for (const m of orden.slice(detectadas.length)) if (m.visible) this.#perderMano(m);
  }

  #actualizarMano(mano, { puntos, lado }, t) {
    // Suavizado: mezclamos con la posición anterior para quitar el temblor.
    // Si la mano recién aparece, no hay nada que mezclar.
    const suave = mano.visible ? 0.55 : 1;
    puntos.forEach((p, i) => mano.puntos[i].lerp(p, suave));
    mano.visible = true;
    mano.lado = lado;
    const P = mano.puntos;

    // Tamaño de la mano: muñeca → base del dedo medio (en 2D, para que no dependa de la profundidad)
    mano.tamano = Math.max(1, Math.hypot(P[9].x - P[0].x, P[9].y - P[0].y));

    // Dedos estirados: la punta está más lejos de la muñeca que la articulación del medio
    for (const [dedo, art] of Object.entries(ARTICULACION)) {
      mano.dedos[dedo] = P[PUNTAS[dedo]].distanceTo(P[0]) > P[art].distanceTo(P[0]) * 1.12;
    }
    // El pulgar es distinto: está estirado si su punta se aleja de la base del meñique
    mano.dedos.pulgar = P[4].distanceTo(P[17]) > P[2].distanceTo(P[17]) * 1.25;
    const v = Object.values(mano.dedos).map(Number);
    mano.cuantosDedos = v.reduce((a, b) => a + b, 0);

    // Gesto: el primero cuyo patrón de dedos coincide (null = "no importa")
    if (v.join('') === '10000') {
      // Solo el pulgar: ¿apunta hacia arriba o hacia abajo?
      mano.gesto = P[4].y > P[5].y ? { nombre: 'pulgar arriba', emoji: '👍' } : { nombre: 'pulgar abajo', emoji: '👎' };
    } else {
      mano.gesto = GESTOS.find((g) => g.dedos.every((d, i) => d === null || d === v[i])) ?? null;
    }

    // Pellizco con histéresis
    mano.aperturaPellizco = P[4].distanceTo(P[8]) / mano.tamano;
    const antes = mano.pellizco;
    // En un puño el pulgar también toca el índice; para que no cuente, la punta del índice
    // debe estar más lejos de la muñeca que su base (el índice no está doblado contra la palma)
    const indiceAdelante = P[8].distanceTo(P[0]) > P[5].distanceTo(P[0]) * 1.15;
    mano.pellizco = antes ? mano.aperturaPellizco < PELLIZCO_ABRE : mano.aperturaPellizco < PELLIZCO_CIERRA && indiceAdelante;
    mano.puntoPellizco.addVectors(P[4], P[8]).multiplyScalar(0.5);
    if (mano.pellizco && !antes) mano.alPellizcar.forEach((f) => f(mano));
    if (!mano.pellizco && antes) mano.alSoltar.forEach((f) => f(mano));

    // Velocidad del punto de pellizco (px/s), suavizada
    if (mano._anterior && t > mano._anterior.t) {
      const dt = t - mano._anterior.t;
      const vel = new THREE.Vector3().subVectors(mano.puntoPellizco, mano._anterior.p).divideScalar(dt);
      mano.velocidad.lerp(vel, 0.5);
    }
    mano._anterior = { p: mano.puntoPellizco.clone(), t };
  }

  #perderMano(mano) {
    if (mano.pellizco) { mano.pellizco = false; mano.alSoltar.forEach((f) => f(mano)); }
    mano.visible = false;
    mano.gesto = null;
    mano._anterior = null;
    mano.velocidad.set(0, 0, 0);
  }

  // El video llena la pantalla recortando lo que sobra (como object-fit: cover)
  #ajustarTamano() {
    const cw = this.contenedor.clientWidth, ch = this.contenedor.clientHeight;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const k = Math.max(cw / vw, ch / vh);
    this.anchoMostrado = vw * k;
    this.altoMostrado = vh * k;
    this.ancho = cw;
    this.alto = ch;
    Object.assign(this.video.style, {
      width: `${this.anchoMostrado}px`, height: `${this.altoMostrado}px`,
      left: `${(cw - this.anchoMostrado) / 2}px`, top: `${(ch - this.altoMostrado) / 2}px`,
    });
    Object.assign(this.camara, { left: -cw / 2, right: cw / 2, top: ch / 2, bottom: -ch / 2 });
    this.camara.updateProjectionMatrix();
    this.renderer.setSize(cw, ch);
  }

  detener() {
    this.renderer?.setAnimationLoop(null);
    this.detector?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video?.remove();
    this.renderer?.domElement.remove();
    this.renderer?.dispose();
    window.removeEventListener('resize', this.alRedimensionar);
  }
}
