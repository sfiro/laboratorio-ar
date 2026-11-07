// Dibuja imágenes de prueba en escala de grises: marcadores con una pose CONOCIDA.
// Así podemos medir exactamente cuánto se equivoca el detector.
import { inversa3, multiplicar3, aplicarH, rodriguesAMatriz } from '../matematica.js';
import { DICCIONARIO } from '../diccionario.js';

const bitDe = (c, f, k) => (c >>> (f * 5 + k)) & 1;

/** Brillo del marcador `id` en el punto (X, Y) de su plano (lado 1, centro 0, Y arriba), o null si es fondo */
export function brilloMarcador(id, X, Y) {
  const papel = 0.5 + 1 / 7; // una celda de margen blanco
  if (Math.abs(X) > papel || Math.abs(Y) > papel) return null;
  if (Math.abs(X) > 0.5 || Math.abs(Y) > 0.5) return 235;
  const k = Math.min(6, Math.floor((X + 0.5) * 7)), f = Math.min(6, Math.floor((0.5 - Y) * 7));
  if (f === 0 || f === 6 || k === 0 || k === 6) return 25;
  return bitDe(DICCIONARIO[id], f - 1, k - 1) ? 25 : 235;
}

/** marcadores: [{ id, R (matriz 3×3) o rot: [rx, ry, rz], t: [x, y, z] }] → Uint8Array w×h */
export function renderizar(w, h, K, marcadores, { ruido = 0, gradiente = 0 } = {}) {
  const KM = [K.fx, 0, K.cx, 0, K.fy, K.cy, 0, 0, 1];
  const inversas = marcadores.map((m) => {
    const R = m.R ?? rodriguesAMatriz(m.rot);
    const H = multiplicar3(KM, [R[0], R[1], m.t[0], R[3], R[4], m.t[1], R[6], R[7], m.t[2]]);
    return { id: m.id, Hi: inversa3(H), R };
  });
  const gris = new Uint8Array(w * h);
  let semilla = 12345;
  const azar = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { // 4 muestras por píxel
      let v = 110 + 30 * Math.sin(x * 0.05) * Math.cos(y * 0.07); // fondo con textura suave
      for (const { id, Hi } of inversas) {
        const [X, Y] = aplicarH(Hi, x + dx - 0.5, y + dy - 0.5);
        const b = brilloMarcador(id, X, Y);
        if (b != null) { v = b; break; }
      }
      s += v;
    }
    const luz = 1 - gradiente * (x / w); // una sombra que oscurece hacia la derecha
    gris[y * w + x] = Math.max(0, Math.min(255, (s / 4) * luz + (azar() - 0.5) * ruido));
  }
  return gris;
}
