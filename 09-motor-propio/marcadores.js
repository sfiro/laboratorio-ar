// Detector de marcadores cuadrados, escrito desde cero (sin OpenCV).
// Es la misma tubería que usan AR.js y ArUco por dentro:
//
//   1. GRISES       cada píxel → un número de brillo
//   2. UMBRAL       ¿más oscuro que sus vecinos? → negro / blanco (adaptativo: aguanta sombras)
//   3. REGIONES     juntar los píxeles negros conectados (cada región es un candidato)
//   4. CONTORNO     recorrer el borde de cada región
//   5. POLÍGONO     simplificar el borde (Douglas-Peucker): ¿quedan 4 esquinas? ¿es convexo?
//   6. ESQUINAS     afinarlas ajustando una recta a cada lado (precisión de menos de un píxel)
//   7. CÓDIGO       leer la cuadrícula de 7×7 y buscarla en el diccionario (en sus 4 giros)
//   8. POSE         homografía → posición y giro en 3D (matematica.js)
import { homografia, aplicarH, poseDesdeHomografia, refinarPose } from './matematica.js';
import { DICCIONARIO } from './diccionario.js';

// --- 1. Grises ---------------------------------------------------------------
export function aGrises(rgba, gris) {
  for (let i = 0, j = 0; i < gris.length; i++, j += 4) gris[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return gris;
}

// --- 2. Umbral adaptativo con imagen integral ---------------------------------
// Un píxel es "negro" si es más oscuro que el promedio de su vecindario menos C.
// La imagen integral permite sacar la suma de cualquier rectángulo con 4 lecturas.
export function umbralAdaptativo(gris, w, h, radio, C, bin, integral) {
  const W = w + 1;
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += gris[y * w + x];
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + fila;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radio), y1 = Math.min(h, y + radio + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radio), x1 = Math.min(w, x + radio + 1);
      const suma = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      const area = (x1 - x0) * (y1 - y0);
      bin[y * w + x] = gris[y * w + x] * area < suma - C * area ? 1 : 0;
    }
  }
  return bin;
}

// --- 4. Contorno: recorrer el borde de una región (Moore) ---------------------
// Direcciones en el sentido del reloj (la Y de la imagen crece hacia abajo).
const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
function trazarContorno(etiquetas, etiqueta, w, h, inicio, maximo) {
  const dentro = (x, y) => x >= 0 && y >= 0 && x < w && y < h && etiquetas[y * w + x] === etiqueta;
  const x0 = inicio % w, y0 = (inicio / w) | 0;
  let x = x0, y = y0, dir = 0, primera = -1;
  const puntos = [];
  while (puntos.length < maximo) {
    puntos.push([x, y]);
    // Primero miramos "a la izquierda" y luego giramos en el sentido del reloj:
    // así vamos pegados al borde con la región a la derecha.
    let encontrado = -1;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8;
      if (dentro(x + DX[d], y + DY[d])) { encontrado = d; break; }
    }
    if (encontrado < 0) break; // un píxel suelto
    if (x === x0 && y === y0) {
      if (primera < 0) primera = encontrado;
      else if (encontrado === primera) { puntos.pop(); break; } // dimos la vuelta completa
    }
    dir = encontrado;
    x += DX[dir]; y += DY[dir];
  }
  return puntos;
}

// --- 5. Douglas-Peucker: quedarse solo con los puntos que dan la forma ---------
function distanciaARecta([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / l;
}
function douglasPeucker(puntos, i0, i1, tolerancia, salida) {
  let mayor = 0, indice = -1;
  for (let i = i0 + 1; i < i1; i++) {
    const d = distanciaARecta(puntos[i % puntos.length], puntos[i0 % puntos.length], puntos[i1 % puntos.length]);
    if (d > mayor) { mayor = d; indice = i; }
  }
  if (mayor > tolerancia) {
    douglasPeucker(puntos, i0, indice, tolerancia, salida);
    salida.push(indice);
    douglasPeucker(puntos, indice, i1, tolerancia, salida);
  }
}
function simplificarCerrado(puntos, tolerancia) {
  // En un contorno cerrado: partimos en el punto 0 y el más lejano a él
  let lejano = 0, mayor = 0;
  puntos.forEach(([x, y], i) => { const d = Math.hypot(x - puntos[0][0], y - puntos[0][1]); if (d > mayor) { mayor = d; lejano = i; } });
  const indices = [0];
  douglasPeucker(puntos, 0, lejano, tolerancia, indices);
  indices.push(lejano);
  douglasPeucker(puntos, lejano, puntos.length, tolerancia, indices);
  return indices.map((i) => i % puntos.length);
}

const cruz2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function esConvexo(q) {
  const s = q.map((p, i) => Math.sign(cruz2(p, q[(i + 1) % 4], q[(i + 2) % 4])));
  return s.every((v) => v === s[0] && v !== 0);
}

// --- 6. Esquinas precisas: una recta por cada lado y sus intersecciones -------
function ajustarRecta(puntos) { // recta por mínimos cuadrados "ortogonales" (dirección principal)
  const n = puntos.length;
  const mx = puntos.reduce((s, p) => s + p[0], 0) / n, my = puntos.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of puntos) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { p: [mx, my], d: [Math.cos(ang), Math.sin(ang)] };
}
function cortar(a, b) {
  const det = a.d[0] * b.d[1] - a.d[1] * b.d[0];
  if (Math.abs(det) < 1e-6) return null;
  const s = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / det;
  return [a.p[0] + s * a.d[0], a.p[1] + s * a.d[1]];
}
function afinarEsquinas(contorno, indices) {
  const n = contorno.length;
  const lados = indices.map((ia, k) => {
    const ib = indices[(k + 1) % 4];
    const largo = (ib - ia + n) % n;
    const margen = Math.floor(largo * 0.15);
    const tramo = [];
    for (let i = margen; i <= largo - margen; i++) tramo.push(contorno[(ia + i) % n]);
    return tramo.length >= 3 ? ajustarRecta(tramo) : null;
  });
  // El contorno pasa por el CENTRO de los píxeles negros de la orilla, pero el borde real
  // está medio píxel más afuera: movemos cada recta 0.5 px hacia fuera del cuadro.
  const cx = indices.reduce((s, i) => s + contorno[i][0], 0) / 4, cy = indices.reduce((s, i) => s + contorno[i][1], 0) / 4;
  for (const l of lados) {
    if (!l) continue;
    let nx = -l.d[1], ny = l.d[0];
    if (nx * (l.p[0] - cx) + ny * (l.p[1] - cy) < 0) { nx = -nx; ny = -ny; }
    l.p = [l.p[0] + nx * 0.5, l.p[1] + ny * 0.5];
  }
  return indices.map((ia, k) => {
    const antes = lados[(k + 3) % 4], despues = lados[k];
    const c = antes && despues ? cortar(antes, despues) : null;
    const original = contorno[ia];
    // El píxel del contorno es el centro del primer píxel negro: el borde real está medio píxel afuera
    return c && Math.hypot(c[0] - original[0], c[1] - original[1]) < 4 ? c : [original[0], original[1]];
  });
}

// --- 3 a 6: de la imagen binaria a una lista de cuadriláteros -------------------
export function buscarCuadros(bin, w, h, etiquetas, pila, { areaMinima = 120, ladoMinimo = 10 } = {}) {
  etiquetas.fill(0);
  const cuadros = [];
  let etiqueta = 0;
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || etiquetas[i]) continue;
    // Región nueva: la llenamos (vecinos de 4 lados) midiendo su área y su caja
    etiqueta++;
    let n = 0, area = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    pila[n++] = i;
    etiquetas[i] = etiqueta;
    while (n) {
      const p = pila[--n], x = p % w, y = (p / w) | 0;
      area++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && bin[p - 1] && !etiquetas[p - 1]) { etiquetas[p - 1] = etiqueta; pila[n++] = p - 1; }
      if (x < w - 1 && bin[p + 1] && !etiquetas[p + 1]) { etiquetas[p + 1] = etiqueta; pila[n++] = p + 1; }
      if (y > 0 && bin[p - w] && !etiquetas[p - w]) { etiquetas[p - w] = etiqueta; pila[n++] = p - w; }
      if (y < h - 1 && bin[p + w] && !etiquetas[p + w]) { etiquetas[p + w] = etiqueta; pila[n++] = p + w; }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (area < areaMinima || bw < ladoMinimo || bh < ladoMinimo) continue;
    if (minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1) continue; // cortado por el borde de la imagen
    // "i" es el primer píxel de la región en orden de lectura: arriba a la izquierda, en el borde
    const contorno = trazarContorno(etiquetas, etiqueta, w, h, i, 4 * (bw + bh) * 3);
    if (contorno.length < 4 * ladoMinimo) continue;
    const indices = simplificarCerrado(contorno, Math.max(2, contorno.length * 0.025));
    if (indices.length !== 4) continue;
    const esquinas = indices.map((k) => contorno[k]);
    if (!esConvexo(esquinas)) continue;
    const lados = esquinas.map((p, k) => Math.hypot(p[0] - esquinas[(k + 1) % 4][0], p[1] - esquinas[(k + 1) % 4][1]));
    if (Math.min(...lados) < ladoMinimo || Math.min(...lados) / Math.max(...lados) < 0.25) continue;
    cuadros.push({ esquinas: afinarEsquinas(contorno, indices), contorno });
  }
  return cuadros;
}

// --- 7. Leer el código --------------------------------------------------------
const bitDe = (c, f, k) => (c >>> (f * 5 + k)) & 1;
function girar(c) {
  let g = 0;
  for (let f = 0; f < 5; f++) for (let k = 0; k < 5; k++) if (bitDe(c, 4 - k, f)) g |= 1 << (f * 5 + k);
  return g >>> 0;
}
const distanciaBits = (a, b) => { let x = (a ^ b) >>> 0, n = 0; while (x) { n += x & 1; x >>>= 1; } return n; };

export function leerCodigo(gris, w, h, esquinas, erroresPermitidos = 2) {
  // Homografía de la cuadrícula del marcador (0..7 × 0..7) a la imagen
  const H = homografia([[0, 0], [7, 0], [7, 7], [0, 7]], esquinas);
  if (!H) return null;
  const valores = new Float32Array(49);
  for (let f = 0; f < 7; f++) for (let k = 0; k < 7; k++) {
    let s = 0, n = 0;
    for (const df of [0.3, 0.5, 0.7]) for (const dk of [0.3, 0.5, 0.7]) {
      const [x, y] = aplicarH(H, k + dk, f + df);
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) return null;
      s += gris[yi * w + xi]; n++;
    }
    valores[f * 7 + k] = s / n;
  }
  let min = 255, max = 0;
  for (const v of valores) { if (v < min) min = v; if (v > max) max = v; }
  if (max - min < 30) return null; // sin contraste: no es un marcador
  const umbral = (min + max) / 2;
  // El anillo de afuera debe ser negro (toleramos una celda)
  let claras = 0;
  for (let f = 0; f < 7; f++) for (let k = 0; k < 7; k++) {
    if ((f === 0 || f === 6 || k === 0 || k === 6) && valores[f * 7 + k] > umbral) claras++;
  }
  if (claras > 1) return null;
  let codigo = 0;
  for (let f = 0; f < 5; f++) for (let k = 0; k < 5; k++) if (valores[(f + 1) * 7 + k + 1] < umbral) codigo |= 1 << (f * 5 + k);
  codigo >>>= 0;
  // Buscarlo en el diccionario en sus 4 giros
  let mejor = null;
  let medido = codigo;
  for (let giro = 0; giro < 4; giro++) {
    DICCIONARIO.forEach((c, id) => {
      const d = distanciaBits(medido, c);
      if (d <= erroresPermitidos && (!mejor || d < mejor.errores)) mejor = { id, giro, errores: d };
    });
    medido = girar(medido);
  }
  if (!mejor) return null;
  // Reordenar las esquinas: la primera debe ser la de arriba a la izquierda DEL MARCADOR
  const r = mejor.giro;
  return { id: mejor.id, errores: mejor.errores, esquinas: [0, 1, 2, 3].map((k) => esquinas[(k + 4 - r) % 4]) };
}

// --- 8. Todo junto ----------------------------------------------------------------
// El marcador mide 1 × 1 (con su borde negro), con el origen al centro y Y hacia arriba
const OBJETO = [[-0.5, 0.5, 0], [0.5, 0.5, 0], [0.5, -0.5, 0], [-0.5, -0.5, 0]];

export class DetectorDeMarcadores {
  constructor() { this.tiempos = {}; }

  procesar(gris, w, h, K) {
    const n = w * h;
    if (this.n !== n) {
      this.n = n;
      this.bin = new Uint8Array(n);
      this.integral = new Uint32Array((w + 1) * (h + 1));
      this.etiquetas = new Int32Array(n);
      this.pila = new Int32Array(n);
    }
    const t0 = performance.now();
    umbralAdaptativo(gris, w, h, Math.max(6, Math.round(Math.min(w, h) / 22)), 7, this.bin, this.integral);
    const t1 = performance.now();
    this.cuadros = buscarCuadros(this.bin, w, h, this.etiquetas, this.pila, { areaMinima: Math.round(n * 0.0008), ladoMinimo: 10 });
    const t2 = performance.now();
    const resultados = [];
    for (const c of this.cuadros) {
      const lectura = leerCodigo(gris, w, h, c.esquinas);
      if (!lectura) continue;
      const H = homografia(OBJETO.map((p) => p.slice(0, 2)), lectura.esquinas);
      if (!H) continue;
      const inicial = poseDesdeHomografia(H, K);
      const { R, t } = refinarPose(inicial.R, inicial.t, K, OBJETO, lectura.esquinas, 4);
      c.id = lectura.id;
      resultados.push({ clave: `marcador-${lectura.id}`, id: lectura.id, R, t, esquinas: lectura.esquinas, errores: lectura.errores });
    }
    const t3 = performance.now();
    this.tiempos = { umbral: t1 - t0, contornos: t2 - t1, codigoYPose: t3 - t2 };
    this.info = { candidatos: this.cuadros.length, marcadores: resultados.length, ...this.tiempos };
    return resultados;
  }

  /** "Lo que ve el motor": candidatos en amarillo, marcadores reconocidos en verde */
  dibujar(ctx, escala, resultados = []) {
    for (const c of this.cuadros ?? []) {
      ctx.strokeStyle = c.id == null ? '#ffd166' : '#3ddc84';
      ctx.lineWidth = (c.id == null ? 1.5 : 3) / escala;
      ctx.beginPath();
      c.esquinas.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
    }
    ctx.font = `700 ${14 / escala}px system-ui, sans-serif`;
    for (const r of resultados) {
      const [x, y] = r.esquinas[0]; // la esquina de arriba a la izquierda DEL MARCADOR
      ctx.fillStyle = '#e5484d';
      ctx.beginPath(); ctx.arc(x, y, 4 / escala, 0, Math.PI * 2); ctx.fill();
      const cx = r.esquinas.reduce((s, p) => s + p[0], 0) / 4, cy = r.esquinas.reduce((s, p) => s + p[1], 0) / 4;
      ctx.fillStyle = '#3ddc84';
      ctx.fillText(`ID ${r.id}${r.errores ? ` (${r.errores} corregida${r.errores > 1 ? 's' : ''})` : ''}`, cx - 20 / escala, cy);
    }
  }

  /** La imagen binaria (lo que el umbral considera "negro") para mostrarla en miniatura */
  imagenDepuracion() { return this.bin ? { valores: this.bin, negro: 1 } : null; }
}
