// Nuestro puente entre MediaPipe Face Landmarker y Three.js.
//
// MediaPipe nos da, en cada cuadro de video:
//   - 478 puntos de la cara (x, y entre 0 y 1; z = profundidad relativa)
//   - 52 "blendshapes": qué tanto abres la boca, parpadeas, sonríes... (de 0 a 1)
//
// Con eso hacemos todo lo demás nosotros:
//   - Llevamos los puntos a la pantalla (con efecto espejo, como una selfie).
//   - Calculamos la POSE de la cabeza (posición, giro y tamaño) a partir de 3 puntos.
//   - Movemos un grupo 3D ("cara.grupo") para que los objetos sigan tu cabeza.
import * as THREE from 'three';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

// Algunos de los 478 puntos que usamos (el mapa completo está en la documentación de MediaPipe)
export const P = {
  ojoDerecho: 33,    // esquina exterior del ojo derecho (de la persona)
  ojoIzquierdo: 263, // esquina exterior del ojo izquierdo
  entrecejo: 168,    // entre los ojos: será el ORIGEN de nuestros objetos
  frente: 10,
  menton: 152,
  labioArriba: 13,
  labioAbajo: 14,
};

// Distancia típica entre las esquinas exteriores de los ojos, en cm.
// La usamos como "regla": así diseñamos los objetos en centímetros.
const DISTANCIA_OJOS_CM = 9;

export class RealidadDeCara {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.escena = new THREE.Scene();
    // Cámara ORTOGRÁFICA del tamaño de la pantalla: 1 unidad = 1 píxel CSS.
    // Así los puntos de MediaPipe caen exactamente sobre el video.
    this.camara = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
    this.alCuadro = [];

    const grupo = new THREE.Group();
    grupo.matrixAutoUpdate = false; // su posición la calculamos nosotros
    grupo.visible = false;
    this.escena.add(grupo);

    // Malla de la cara: 478 vértices que se actualizan en cada cuadro
    const posiciones = new THREE.BufferAttribute(new Float32Array(478 * 3), 3);
    posiciones.setUsage(THREE.DynamicDrawUsage);
    const conexiones = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
    const triangulos = [];
    // La teselación viene como aristas; cada 3 aristas seguidas forman un triángulo
    for (let k = 0; k < conexiones.length; k += 3) triangulos.push(conexiones[k].start, conexiones[k + 1].start, conexiones[k + 2].start);
    const malla = new THREE.BufferGeometry().setAttribute('position', posiciones).setIndex(triangulos);
    const aristas = new THREE.BufferGeometry().setAttribute('position', posiciones)
      .setIndex(conexiones.flatMap((c) => [c.start, c.end]));

    this.cara = {
      visible: false,
      grupo,              // pega aquí objetos diseñados en cm, con origen en el entrecejo
      escala: 1,          // píxeles por centímetro
      puntos: [],         // 478 THREE.Vector3 en coordenadas de pantalla
      gestos: {},         // nombre del blendshape → valor de 0 a 1
      malla,              // geometría de la cara (triángulos)
      aristas,            // geometría de la cara (líneas)
      adelante: new THREE.Vector3(0, 0, 1),
    };
    for (let i = 0; i < 478; i++) this.cara.puntos.push(new THREE.Vector3());
  }

  async iniciar({ estado = () => {} } = {}) {
    // 1) Cámara frontal --------------------------------------------------------
    estado('Encendiendo la cámara…');
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, autoplay: true });
    this.video.setAttribute('playsinline', '');
    this.video.className = 'video-camara espejo';
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = this.stream;
    this.contenedor.prepend(this.video);
    await this.video.play();
    if (!this.video.videoWidth) await new Promise((ok) => this.video.addEventListener('loadedmetadata', ok, { once: true }));

    // 2) Lienzo 3D -------------------------------------------------------------
    // preserveDrawingBuffer: para poder tomar fotos del lienzo
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = 'lienzo-3d';
    this.contenedor.append(this.renderer.domElement);
    this.#ajustarTamano();
    this.alRedimensionar = () => this.#ajustarTamano();
    window.addEventListener('resize', this.alRedimensionar);

    // 3) MediaPipe -------------------------------------------------------------
    estado('Cargando el modelo de la cara (3.7 MB)…');
    const archivos = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe-wasm', location.href).href);
    const opciones = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('./modelos/face_landmarker.task', location.href).href, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
    try {
      this.detector = await FaceLandmarker.createFromOptions(archivos, opciones('GPU'));
    } catch {
      this.detector = await FaceLandmarker.createFromOptions(archivos, opciones('CPU')); // plan B
    }

    // 4) Bucle: detectar → actualizar → dibujar ---------------------------------
    let ultimoTiempoVideo = -1;
    const reloj = new THREE.Timer();
    this.renderer.setAnimationLoop((ahora) => {
      reloj.update(ahora);
      if (this.video.currentTime !== ultimoTiempoVideo) { // solo si hay un cuadro nuevo
        ultimoTiempoVideo = this.video.currentTime;
        this.#actualizarCara(this.detector.detectForVideo(this.video, performance.now()));
      }
      const t = reloj.getElapsed(), dt = Math.min(reloj.getDelta(), 0.1);
      this.alCuadro.forEach((f) => f(t, dt, this.cara));
      this.renderer.render(this.escena, this.camara);
    });
    estado('');
  }

  #actualizarCara(resultado) {
    const cara = this.cara;
    const puntos = resultado.faceLandmarks?.[0];
    cara.visible = cara.grupo.visible = !!puntos;
    if (!puntos) return;

    // a) Puntos → pantalla. Origen en el centro, Y hacia arriba, X en espejo.
    const { anchoMostrado: W, altoMostrado: H } = this;
    const pos = cara.malla.attributes.position;
    puntos.forEach(({ x, y, z }, i) => {
      cara.puntos[i].set((0.5 - x) * W, (0.5 - y) * H, -z * W);
      pos.setXYZ(i, cara.puntos[i].x, cara.puntos[i].y, cara.puntos[i].z);
    });
    pos.needsUpdate = true;
    cara.malla.computeBoundingSphere();

    // b) Pose de la cabeza a partir de 3 puntos
    const p = (i) => cara.puntos[i];
    const derecha = new THREE.Vector3().subVectors(p(P.ojoDerecho), p(P.ojoIzquierdo));
    const distanciaOjos = derecha.length();
    derecha.normalize();
    const arriba = new THREE.Vector3().subVectors(p(P.frente), p(P.menton));
    arriba.addScaledVector(derecha, -arriba.dot(derecha)).normalize(); // que sea perpendicular a "derecha"
    const adelante = new THREE.Vector3().crossVectors(derecha, arriba); // sale de la cara hacia ti

    cara.escala = distanciaOjos / DISTANCIA_OJOS_CM;
    cara.adelante.copy(adelante);
    const giro = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(derecha, arriba, adelante));
    cara.grupo.matrix.compose(p(P.entrecejo), giro, new THREE.Vector3().setScalar(cara.escala));
    cara.grupo.matrixWorldNeedsUpdate = true;

    // c) Gestos
    for (const { categoryName, score } of resultado.faceBlendshapes?.[0]?.categories ?? []) cara.gestos[categoryName] = score;
    // Solo en desarrollo: simular gestos desde la consola, p. ej. window.__gestosDePrueba = { jawOpen: 1 }
    if (import.meta.env.DEV && window.__gestosDePrueba) Object.assign(cara.gestos, window.__gestosDePrueba);
  }

  // El video llena la pantalla recortando lo que sobra (como object-fit: cover)
  #ajustarTamano() {
    const cw = this.contenedor.clientWidth, ch = this.contenedor.clientHeight;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const k = Math.max(cw / vw, ch / vh);
    this.anchoMostrado = vw * k;
    this.altoMostrado = vh * k;
    Object.assign(this.video.style, {
      width: `${this.anchoMostrado}px`, height: `${this.altoMostrado}px`,
      left: `${(cw - this.anchoMostrado) / 2}px`, top: `${(ch - this.altoMostrado) / 2}px`,
    });
    Object.assign(this.camara, { left: -cw / 2, right: cw / 2, top: ch / 2, bottom: -ch / 2 });
    this.camara.updateProjectionMatrix();
    this.renderer.setSize(cw, ch);
  }

  /** Foto: video (en espejo) + lienzo 3D, en un PNG */
  async foto() {
    const cw = this.contenedor.clientWidth, ch = this.contenedor.clientHeight;
    const escala = Math.min(window.devicePixelRatio, 2);
    const c = document.createElement('canvas');
    c.width = cw * escala; c.height = ch * escala;
    const ctx = c.getContext('2d');
    ctx.scale(escala, escala);
    ctx.save();
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, (cw - this.anchoMostrado) / 2, (ch - this.altoMostrado) / 2, this.anchoMostrado, this.altoMostrado);
    ctx.restore();
    ctx.drawImage(this.renderer.domElement, 0, 0, cw, ch);
    return new Promise((ok) => c.toBlob(ok, 'image/png'));
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
