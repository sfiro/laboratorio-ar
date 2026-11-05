// Nuestro puente entre el motor de seguimiento de MindAR y Three.js.
//
// MindAR trae su propia integración con Three.js, pero usa funciones que Three.js ya eliminó.
// Así que usamos solo su "Controller" (el que reconoce y sigue imágenes) y hacemos el resto:
//   1. Encender la cámara y mostrar el video.
//   2. Crear una cámara virtual de Three.js que "vea" igual que la cámara real.
//   3. Cada vez que MindAR encuentra una imagen, mover un grupo 3D ("ancla") encima de ella.
import * as THREE from 'three';
import { Controller } from 'mind-ar/dist/mindar-image.prod.js';

export class RealidadDeImagenes {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.anclas = [];
    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera();
    this.alCuadro = []; // funciones que se llaman en cada cuadro: (segundos, delta) => {}
  }

  /** Un grupo 3D que se pega a la imagen número `indice`. 1 unidad = el ancho de la imagen. */
  ancla(indice) {
    const grupo = new THREE.Group();
    grupo.visible = false;
    grupo.matrixAutoUpdate = false; // su posición la pone MindAR, no nosotros
    this.escena.add(grupo);
    const ancla = { grupo, indice, visible: false, alEncontrar: () => {}, alPerder: () => {}, alto: 1 };
    this.anclas.push(ancla);
    return ancla;
  }

  /**
   * @param {object} op
   * @param {string|ArrayBuffer} op.objetivos URL o contenido de un archivo .mind
   * @param {(texto: string) => void} [op.estado] para mostrar el progreso
   */
  async iniciar({ objetivos, estado = () => {} }) {
    // 1) Cámara real ----------------------------------------------------------
    estado('Encendiendo la cámara…');
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, autoplay: true });
    this.video.setAttribute('playsinline', '');
    this.video.className = 'video-camara';
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = this.stream;
    this.contenedor.prepend(this.video);
    await this.video.play();
    if (!this.video.videoWidth) await new Promise((ok) => this.video.addEventListener('loadedmetadata', ok, { once: true }));
    const ancho = this.video.videoWidth, alto = this.video.videoHeight;
    // ¡Importante! MindAR lee el video usando sus atributos width/height (no el tamaño real).
    // Sin esto analiza cuadros vacíos y nunca encuentra nada. El tamaño en pantalla lo pone el CSS.
    this.video.width = ancho;
    this.video.height = alto;

    // 2) Lienzo 3D transparente encima del video ---------------------------------
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = 'lienzo-3d';
    this.contenedor.append(this.renderer.domElement);

    // 3) El motor de MindAR ------------------------------------------------------
    this.controller = new Controller({
      inputWidth: ancho,
      inputHeight: alto,
      maxTrack: 2, // hasta dos imágenes a la vez
      onUpdate: (datos) => this.#alActualizar(datos),
    });

    estado('Cargando imágenes objetivo…');
    const { dimensions } = typeof objetivos === 'string'
      ? await this.controller.addImageTargets(objetivos)
      : this.controller.addImageTargetsFromBuffer(objetivos);

    // MindAR mide en píxeles de la imagen, con el origen en una esquina.
    // Esta matriz lo convierte a: origen en el CENTRO de la imagen y 1 unidad = su ancho.
    this.ajustes = dimensions.map(([w, h]) => new THREE.Matrix4().compose(
      new THREE.Vector3(w / 2, h / 2, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(w, w, w),
    ));
    this.anclas.forEach((a) => { if (dimensions[a.indice]) a.alto = dimensions[a.indice][1] / dimensions[a.indice][0]; });

    this.#ajustarTamano();
    this.alRedimensionar = () => this.#ajustarTamano();
    window.addEventListener('resize', this.alRedimensionar);

    estado('Preparando el motor (la primera vez tarda unos segundos)…');
    await new Promise((ok) => setTimeout(ok, 50)); // deja que se pinte el mensaje
    this.controller.dummyRun(this.video);
    this.controller.processVideo(this.video);

    // 4) Dibujar en cada cuadro --------------------------------------------------
    const reloj = new THREE.Timer();
    this.renderer.setAnimationLoop((ahora) => {
      reloj.update(ahora);
      const delta = reloj.getDelta(), t = reloj.getElapsed();
      this.alCuadro.forEach((f) => f(t, delta));
      this.renderer.render(this.escena, this.camara);
    });
    estado('');
  }

  detener() {
    this.renderer?.setAnimationLoop(null);
    this.controller?.dispose();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video?.remove();
    this.renderer?.domElement.remove();
    this.renderer?.dispose();
    window.removeEventListener('resize', this.alRedimensionar);
  }

  // MindAR nos avisa en cada cuadro dónde está cada imagen (o que la perdió)
  #alActualizar({ type, targetIndex, worldMatrix }) {
    if (type !== 'updateMatrix') return;
    for (const ancla of this.anclas) {
      if (ancla.indice !== targetIndex) continue;
      if (worldMatrix) {
        ancla.grupo.matrix.fromArray(worldMatrix).multiply(this.ajustes[targetIndex]);
        if (!ancla.visible) { ancla.visible = ancla.grupo.visible = true; ancla.alEncontrar(); }
      } else if (ancla.visible) {
        ancla.visible = ancla.grupo.visible = false;
        ancla.alPerder();
      }
    }
  }

  // El video llena la pantalla recortando lo que sobra (como object-fit: cover).
  // La cámara virtual debe tener el mismo campo de visión que esa parte visible del video.
  #ajustarTamano() {
    const cw = this.contenedor.clientWidth, ch = this.contenedor.clientHeight;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const escala = Math.max(cw / vw, ch / vh); // píxeles de pantalla por píxel de video
    const altoMostrado = vh * escala;

    Object.assign(this.video.style, {
      width: `${vw * escala}px`,
      height: `${altoMostrado}px`,
      left: `${(cw - vw * escala) / 2}px`,
      top: `${(ch - altoMostrado) / 2}px`,
    });

    // Proyección de MindAR: cámara "estenopeica" con 45° de campo vertical sobre el video completo
    const p = this.controller.getProjectionMatrix();
    const tanMitad = 1 / p[5]; // = tan(45° / 2)
    this.camara.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanMitad * (ch / altoMostrado)));
    this.camara.near = p[14] / (p[10] - 1);
    this.camara.far = p[14] / (p[10] + 1);
    this.camara.aspect = cw / ch;
    this.camara.updateProjectionMatrix();
    this.renderer.setSize(cw, ch);
  }
}
