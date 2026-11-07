// Seguidor de imágenes: así funciona MindAR (nivel 3) por dentro, en dos fases.
//
//  BUSCAR (lento, cuando no sabemos dónde está la imagen):
//    1. ORB encuentra cientos de "puntos característicos" (esquinas) en la imagen de referencia
//       y en el cuadro de la cámara, y describe cada uno con 256 bits.
//    2. Emparejamos descripciones (distancia de Hamming = cuántos bits cambian). Nos quedamos con
//       las parejas claras: la mejor debe ser mucho mejor que la segunda (prueba de Lowe).
//    3. RANSAC: muchas parejas son errores. Probamos homografías con 4 parejas al azar y
//       nos quedamos con la que más parejas explica ("inliers").
//  SEGUIR (rápido, cuadro a cuadro):
//    4. Flujo óptico (Lucas-Kanade): en vez de buscar otra vez, vemos cuánto se movió cada
//       punto respecto al cuadro anterior. Si se pierden muchos, volvemos a BUSCAR.
//  Y al final, con nuestra matemática: homografía por mínimos cuadrados → pose → refinamiento.
//
// De OpenCV.js usamos solo ORB, el emparejador, RANSAC y el flujo óptico.
import { homografia, poseDesdeHomografia, refinarPose } from './matematica.js';

export class SeguidorDeImagen {
  /** cv: el módulo de OpenCV.js · referencia: <img> o <canvas> de la imagen a seguir */
  constructor(cv, referencia, { anchoReferencia = 480 } = {}) {
    this.cv = cv;
    const w = anchoReferencia, h = Math.round((referencia.height / referencia.width) * w);
    this.alto = h / w; // en nuestras unidades (ancho = 1)
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    c.getContext('2d').drawImage(referencia, 0, 0, w, h);
    const rgba = cv.matFromImageData(c.getContext('2d').getImageData(0, 0, w, h));
    this.refGris = new cv.Mat();
    cv.cvtColor(rgba, this.refGris, cv.COLOR_RGBA2GRAY);
    rgba.delete();

    this.orbRef = new cv.ORB(1200);
    this.orb = new cv.ORB(700);
    this.refPuntos = new cv.KeyPointVector();
    this.refDescriptores = new cv.Mat();
    const sinMascara = new cv.Mat();
    this.orbRef.detectAndCompute(this.refGris, sinMascara, this.refPuntos, this.refDescriptores);
    sinMascara.delete();
    // Cada punto de la referencia en NUESTRAS unidades: ancho 1, origen al centro, Y hacia arriba
    this.refXY = [];
    for (let i = 0; i < this.refPuntos.size(); i++) {
      const { x, y } = this.refPuntos.get(i).pt;
      this.refXY.push([x / w - 0.5, (h / 2 - y) / w]);
    }
    this.emparejador = new cv.BFMatcher(cv.NORM_HAMMING, false);
    this.fase = 'buscar';
    this.cuadrosSiguiendo = 0;
    this.info = { puntosReferencia: this.refPuntos.size() };
  }

  #matDe(gris, w, h) {
    const m = new this.cv.Mat(h, w, this.cv.CV_8UC1);
    m.data.set(gris);
    return m;
  }

  procesar(gris, w, h, K) {
    const cv = this.cv;
    const t0 = performance.now();
    const cuadro = this.#matDe(gris, w, h);
    let resultado = null;
    if (this.fase === 'seguir') resultado = this.#seguir(cuadro, K);
    if (!resultado) {
      resultado = this.#buscar(cuadro, K); // no la estábamos siguiendo, o se perdió
    } else if (this.cuadrosSiguiendo % 45 === 44) {
      // Cada 45 cuadros buscamos de nuevo para renovar los puntos (algunos se van perdiendo)
      const nuevo = this.#buscar(cuadro, K);
      if (nuevo) resultado = nuevo; else this.fase = 'seguir';
    }
    this.anterior?.delete();
    this.anterior = cuadro; // el flujo óptico necesita el cuadro anterior
    this.info.ms = performance.now() - t0;
    this.info.fase = this.fase;
    return resultado ? [resultado] : [];
  }

  #buscar(cuadro, K) {
    const cv = this.cv;
    const puntos = new cv.KeyPointVector(), descriptores = new cv.Mat(), sinMascara = new cv.Mat();
    this.orb.detectAndCompute(cuadro, sinMascara, puntos, descriptores);
    sinMascara.delete();
    this.info.puntosCuadro = puntos.size();
    this.puntosDibujar = [];
    for (let i = 0; i < puntos.size(); i++) { const { x, y } = puntos.get(i).pt; this.puntosDibujar.push([x, y]); }

    const parejas = [];
    if (descriptores.rows >= 2) {
      const vecinos = new cv.DMatchVectorVector();
      this.emparejador.knnMatch(this.refDescriptores, descriptores, vecinos, 2);
      for (let i = 0; i < vecinos.size(); i++) {
        const v = vecinos.get(i);
        if (v.size() < 2) continue;
        const a = v.get(0), b = v.get(1);
        if (a.distance < 0.75 * b.distance) parejas.push([a.queryIdx, a.trainIdx]); // prueba de Lowe
      }
      vecinos.delete();
    }
    this.info.parejas = parejas.length;

    let resultado = null;
    if (parejas.length >= 12) {
      const origen = parejas.map(([r]) => this.refXY[r]);
      const destino = parejas.map(([, f]) => { const { x, y } = puntos.get(f).pt; return [x, y]; });
      const inliers = this.#ransac(origen, destino);
      this.info.inliers = inliers.length;
      if (inliers.length >= 12) {
        resultado = this.#pose(inliers.map((i) => origen[i]), inliers.map((i) => destino[i]), K);
        if (resultado) {
          this.fase = 'seguir';
          this.cuadrosSiguiendo = 0;
          this.seguidosObj = inliers.map((i) => origen[i]);
          this.seguidosImg = inliers.map((i) => destino[i]);
        }
      }
    }
    if (!resultado) this.fase = 'buscar';
    puntos.delete(); descriptores.delete();
    return resultado;
  }

  #seguir(cuadro, K) {
    const cv = this.cv;
    const n = this.seguidosImg.length;
    const antes = cv.matFromArray(n, 1, cv.CV_32FC2, this.seguidosImg.flat());
    const despues = new cv.Mat(), estado = new cv.Mat(), error = new cv.Mat();
    cv.calcOpticalFlowPyrLK(this.anterior, cuadro, antes, despues, estado, error, new cv.Size(21, 21), 3,
      new cv.TermCriteria(cv.TermCriteria_COUNT + cv.TermCriteria_EPS, 20, 0.03));
    const obj = [], img = [];
    for (let i = 0; i < n; i++) {
      if (!estado.data[i]) continue;
      const x = despues.data32F[i * 2], y = despues.data32F[i * 2 + 1];
      if (x < 0 || y < 0 || x >= cuadro.cols || y >= cuadro.rows) continue;
      obj.push(this.seguidosObj[i]);
      img.push([x, y]);
    }
    antes.delete(); despues.delete(); estado.delete(); error.delete();
    this.info.siguiendo = img.length;
    if (img.length < 10) { this.fase = 'buscar'; return null; }
    const inliers = this.#ransac(obj, img, 3);
    if (inliers.length < 10) { this.fase = 'buscar'; return null; }
    this.seguidosObj = inliers.map((i) => obj[i]);
    this.seguidosImg = inliers.map((i) => img[i]);
    this.cuadrosSiguiendo++;
    const r = this.#pose(this.seguidosObj, this.seguidosImg, K);
    if (!r) this.fase = 'buscar';
    return r;
  }

  /** "Lo que ve el motor": puntos ORB del cuadro (celeste), puntos seguidos (verde) y el contorno */
  dibujar(ctx, escala, resultados = []) {
    ctx.fillStyle = '#7fd3ff';
    for (const [x, y] of this.puntosDibujar ?? []) ctx.fillRect(x - 1 / escala, y - 1 / escala, 2 / escala, 2 / escala);
    const r = resultados[0];
    if (!r) return;
    ctx.fillStyle = '#3ddc84';
    for (const [x, y] of r.puntos) { ctx.beginPath(); ctx.arc(x, y, 2.2 / escala, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#3ddc84';
    ctx.lineWidth = 3 / escala;
    ctx.beginPath();
    r.esquinas.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  }

  liberar() {
    for (const m of [this.refGris, this.refPuntos, this.refDescriptores, this.orb, this.orbRef, this.emparejador, this.anterior]) m?.delete?.();
  }

  /** RANSAC con findHomography de OpenCV: devuelve los índices de las parejas buenas */
  #ransac(origen, destino, umbral = 5) {
    const cv = this.cv;
    const a = cv.matFromArray(origen.length, 1, cv.CV_32FC2, origen.flat().map((v) => v * 1000)); // escala parecida a píxeles
    const b = cv.matFromArray(destino.length, 1, cv.CV_32FC2, destino.flat());
    const mascara = new cv.Mat();
    const H = cv.findHomography(a, b, cv.RANSAC, umbral, mascara);
    const buenos = [];
    if (!H.empty()) for (let i = 0; i < origen.length; i++) if (mascara.data[i]) buenos.push(i);
    a.delete(); b.delete(); mascara.delete(); H.delete();
    return buenos;
  }

  /** Con nuestra matemática: homografía por mínimos cuadrados con todas las parejas buenas → pose */
  #pose(obj, img, K) {
    const H = homografia(obj, img);
    if (!H) return null;
    let { R, t } = poseDesdeHomografia(H, K);
    // Para refinar basta una muestra (el costo crece con el número de puntos)
    const paso = Math.max(1, Math.floor(obj.length / 40));
    const o3 = [], i2 = [];
    for (let i = 0; i < obj.length; i += paso) { o3.push([...obj[i], 0]); i2.push(img[i]); }
    ({ R, t } = refinarPose(R, t, K, o3, i2, 3));
    // Las 4 esquinas de la imagen, para dibujar el contorno y revisar que tenga sentido
    const a = this.alto / 2;
    const esquinas = [[-0.5, a], [0.5, a], [0.5, -a], [-0.5, -a]].map(([x, y]) => {
      const w = H[6] * x + H[7] * y + H[8];
      return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
    });
    if (t[2] <= 0) return null;
    return { clave: 'imagen', R, t, esquinas, puntos: img };
  }
}
