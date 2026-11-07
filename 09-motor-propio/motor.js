// El motor: une la cámara, un detector (nuestros marcadores o el seguidor de imágenes) y Three.js.
//
// En cada cuadro nuevo del video:
//   1. Lo dibujamos ACHICADO (lado largo de 480 px) y lo pasamos a grises: procesar menos
//      píxeles es mucho más rápido, y para encontrar un marcador sobra resolución.
//   2. El detector devuelve, para cada cosa que encontró, su pose (R, t) en coordenadas de cámara.
//   3. Convertimos esa pose a Three.js y movemos un "ancla" (un grupo 3D).
// La cámara virtual usa los MISMOS parámetros (K) con los que calculamos la pose: así lo 3D
// cae exactamente sobre lo que ve la cámara.
import * as THREE from 'three';
import { aGrises } from './marcadores.js';
import { camaraTipica } from './matematica.js';

const LADO_PROCESO = 480;

export class MotorPropio {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    this.anclas = new Map();
    this.alCrearAncla = () => {};   // (clave, ancla, resultado) => {} para poner contenido
    this.alCuadro = [];
    this.depurar = false;
    this.estadisticas = { fps: 0, ms: 0 };
  }

  async iniciar({ detector, estado = () => {} }) {
    this.detector = detector;
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

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = 'lienzo-3d';
    this.contenedor.append(this.renderer.domElement);
    // Capa 2D para ver "lo que ve el motor"
    this.capa = Object.assign(document.createElement('canvas'), { className: 'capa-depuracion' });
    this.contenedor.append(this.capa);

    this.lienzoProceso = document.createElement('canvas');
    this.ctxProceso = this.lienzoProceso.getContext('2d', { willReadFrequently: true });
    this.#ajustarTamano();
    this.alRedimensionar = () => this.#ajustarTamano();
    window.addEventListener('resize', this.alRedimensionar);

    let ultimoTiempo = -1, ultimo = performance.now();
    const reloj = new THREE.Timer();
    this.renderer.setAnimationLoop((ahora) => {
      reloj.update(ahora);
      if (this.video.currentTime !== ultimoTiempo && this.video.readyState >= 2) {
        ultimoTiempo = this.video.currentTime;
        this.#procesarCuadro();
        const t = performance.now();
        this.estadisticas.fps = this.estadisticas.fps * 0.9 + (1000 / Math.max(1, t - ultimo)) * 0.1;
        ultimo = t;
      }
      this.alCuadro.forEach((f) => f(reloj.getElapsed(), Math.min(reloj.getDelta(), 0.1)));
      this.renderer.render(this.escena, this.camara);
    });
    estado('');
  }

  #procesarCuadro() {
    const { pw, ph } = this;
    const t0 = performance.now();
    this.ctxProceso.drawImage(this.video, 0, 0, pw, ph);
    const datos = this.ctxProceso.getImageData(0, 0, pw, ph);
    aGrises(datos.data, this.gris);
    const resultados = this.detector.procesar(this.gris, pw, ph, this.K);
    this.estadisticas.ms = this.estadisticas.ms * 0.8 + (performance.now() - t0) * 0.2;
    this.ultimos = resultados;

    const vistos = new Set();
    for (const r of resultados) {
      vistos.add(r.clave);
      let ancla = this.anclas.get(r.clave);
      if (!ancla) {
        const grupo = new THREE.Group();
        grupo.matrixAutoUpdate = false;
        this.escena.add(grupo);
        ancla = { grupo, visible: false, perdido: 0, pos: new THREE.Vector3(), giro: new THREE.Quaternion() };
        this.anclas.set(r.clave, ancla);
        this.alCrearAncla(r.clave, ancla, r);
      }
      // Pose de OpenCV (x der, y abajo, z adelante) → Three.js (x der, y arriba, z atrás):
      // basta invertir el signo de las filas Y y Z.
      const { R, t } = r;
      const m = new THREE.Matrix4().set(
        R[0], R[1], R[2], t[0],
        -R[3], -R[4], -R[5], -t[1],
        -R[6], -R[7], -R[8], -t[2],
        0, 0, 0, 1,
      );
      const pos = new THREE.Vector3(), giro = new THREE.Quaternion(), escala = new THREE.Vector3();
      m.decompose(pos, giro, escala);
      // Suavizado: mezcla con la pose anterior (si estaba visible) para quitar el temblor
      if (ancla.visible) { ancla.pos.lerp(pos, 0.55); ancla.giro.slerp(giro, 0.55); } else { ancla.pos.copy(pos); ancla.giro.copy(giro); }
      ancla.grupo.matrix.compose(ancla.pos, ancla.giro, new THREE.Vector3(1, 1, 1));
      ancla.grupo.matrixWorldNeedsUpdate = true;
      ancla.perdido = 0;
      ancla.ultimo = r;
      ancla.visible = ancla.grupo.visible = true;
    }
    // Lo que no se vio en 4 cuadros seguidos se esconde (aguanta parpadeos)
    for (const [clave, ancla] of this.anclas) {
      if (vistos.has(clave)) continue;
      if (++ancla.perdido > 4) ancla.visible = ancla.grupo.visible = false;
    }
    this.#dibujarDepuracion();
  }

  #dibujarDepuracion() {
    const ctx = this.capa.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.capa.width, this.capa.height);
    if (!this.depurar) return;
    const dpr = this.capa.width / this.contenedor.clientWidth;
    // De píxeles del proceso a píxeles de pantalla
    ctx.setTransform(dpr * this.factor, 0, 0, dpr * this.factor, dpr * this.offX, dpr * this.offY);
    this.detector.dibujar?.(ctx, this.factor, this.ultimos ?? []);
    // Miniatura de la imagen binaria (solo el detector de marcadores la tiene)
    const img = this.detector.imagenDepuracion?.();
    if (img) {
      this.miniatura ??= document.createElement('canvas');
      const m = this.miniatura;
      if (m.width !== this.pw) { m.width = this.pw; m.height = this.ph; this.datosMini = m.getContext('2d').createImageData(this.pw, this.ph); }
      const d = this.datosMini.data;
      for (let i = 0; i < img.valores.length; i++) { const v = img.valores[i] === img.negro ? 0 : 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
      m.getContext('2d').putImageData(this.datosMini, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ancho = this.contenedor.clientWidth * 0.34, alto = ancho * (this.ph / this.pw);
      const x = this.contenedor.clientWidth - ancho - 12, y = 64;
      ctx.drawImage(m, x, y, ancho, alto);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.strokeRect(x, y, ancho, alto);
    }
  }

  #ajustarTamano() {
    const cw = this.contenedor.clientWidth, ch = this.contenedor.clientHeight;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    // Resolución de proceso: lado largo de 480 px, misma proporción que el video
    const s = LADO_PROCESO / Math.max(vw, vh);
    this.pw = Math.round(vw * s); this.ph = Math.round(vh * s);
    this.lienzoProceso.width = this.pw; this.lienzoProceso.height = this.ph;
    this.gris = new Uint8Array(this.pw * this.ph);
    this.K = camaraTipica(this.pw, this.ph);

    // El video llena la pantalla recortando lo que sobra (como object-fit: cover)
    const k = Math.max(cw / vw, ch / vh);
    const anchoMostrado = vw * k, altoMostrado = vh * k;
    this.offX = (cw - anchoMostrado) / 2; this.offY = (ch - altoMostrado) / 2;
    this.factor = anchoMostrado / this.pw; // px de pantalla por px de proceso
    Object.assign(this.video.style, { width: `${anchoMostrado}px`, height: `${altoMostrado}px`, left: `${this.offX}px`, top: `${this.offY}px` });

    // Cámara virtual con la misma K: campo vertical del video completo, recortado a lo visible
    const tanMitad = (this.ph / 2) / this.K.fy;
    this.camara.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanMitad * (ch / altoMostrado)));
    this.camara.aspect = cw / ch;
    this.camara.updateProjectionMatrix();
    this.renderer.setSize(cw, ch);
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.capa.width = cw * dpr; this.capa.height = ch * dpr;
  }

  detener() {
    this.renderer?.setAnimationLoop(null);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video?.remove();
    this.capa?.remove();
    this.renderer?.domElement.remove();
    this.renderer?.dispose();
    this.detector?.liberar?.();
    window.removeEventListener('resize', this.alRedimensionar);
  }
}
