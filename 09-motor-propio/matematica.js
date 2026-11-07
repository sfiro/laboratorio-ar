// La matemática del motor, escrita por nosotros (sin librerías).
//
//  - Homografía: la transformación que lleva un plano (el marcador) a la imagen.
//  - Pose: de la homografía y la cámara sacamos DÓNDE está el plano y CÓMO está girado.
//  - Refinamiento: ajustamos la pose para que los puntos proyectados caigan lo más cerca
//    posible de los medidos (mínimos cuadrados con Gauss-Newton).
//
// Convenciones (las de OpenCV): cámara con x → derecha, y → abajo, z → adelante.
// K = { fx, fy, cx, cy } (parámetros de la cámara, en píxeles).

/** Resuelve A·x = b (A cuadrada, como arreglo de filas) con eliminación gaussiana con pivoteo */
export function resolver(A, b) {
  const n = b.length;
  const M = A.map((fila, i) => [...fila, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let f = c + 1; f < n; f++) if (Math.abs(M[f][c]) > Math.abs(M[p][c])) p = f;
    if (Math.abs(M[p][c]) < 1e-12) return null; // sin solución única
    [M[c], M[p]] = [M[p], M[c]];
    for (let f = c + 1; f < n; f++) {
      const k = M[f][c] / M[c][c];
      for (let j = c; j <= n; j++) M[f][j] -= k * M[c][j];
    }
  }
  const x = new Array(n);
  for (let f = n - 1; f >= 0; f--) {
    let s = M[f][n];
    for (let j = f + 1; j < n; j++) s -= M[f][j] * x[j];
    x[f] = s / M[f][f];
  }
  return x;
}

// Normalización de Hartley: centrar los puntos y escalarlos (mejora mucho la precisión numérica)
function normalizacion(puntos) {
  const n = puntos.length;
  const mx = puntos.reduce((s, p) => s + p[0], 0) / n, my = puntos.reduce((s, p) => s + p[1], 0) / n;
  const d = puntos.reduce((s, p) => s + Math.hypot(p[0] - mx, p[1] - my), 0) / n || 1;
  const s = Math.SQRT2 / d;
  return { T: [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1], aplicar: (p) => [s * (p[0] - mx), s * (p[1] - my)] };
}

export const multiplicar3 = (A, B) => {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
};

export function inversa3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/**
 * Homografía H (3×3, por filas) tal que destino ≈ H·origen, con 4 o más pares de puntos.
 * Método DLT con h33 = 1: cada par da 2 ecuaciones lineales; con más de 4 pares
 * resolvemos por mínimos cuadrados (ecuaciones normales).
 */
export function homografia(origen, destino) {
  const no = normalizacion(origen), nd = normalizacion(destino);
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  const sumar = (fila, valor) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += fila[i] * valor;
      for (let j = 0; j < 8; j++) AtA[i][j] += fila[i] * fila[j];
    }
  };
  for (let k = 0; k < origen.length; k++) {
    const [x, y] = no.aplicar(origen[k]);
    const [u, v] = nd.aplicar(destino[k]);
    sumar([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    sumar([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = resolver(AtA, Atb);
  if (!h) return null;
  // Deshacer la normalización: H = Td⁻¹ · Hn · To
  const H = multiplicar3(multiplicar3(inversa3(nd.T), [...h, 1]), no.T);
  return H.map((v) => v / H[8]);
}

export function aplicarH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norma = (a) => Math.hypot(a[0], a[1], a[2]);

/** La rotación válida (ortonormal) más cercana: iteración de la descomposición polar */
function ortonormalizar(R) {
  let M = [...R];
  for (let k = 0; k < 8; k++) {
    const inv = inversa3(M);
    if (!inv) break;
    // M ← (M + M⁻ᵀ) / 2
    M = M.map((v, i) => (v + inv[(i % 3) * 3 + Math.floor(i / 3)]) / 2);
  }
  return M;
}

/**
 * Pose de un plano a partir de su homografía. Si el plano tiene coordenadas (X, Y, 0):
 *     K⁻¹·H = λ · [r1 r2 t]
 * Las dos primeras columnas de la rotación y la traslación salen directo; r3 = r1 × r2.
 * Devuelve R (3×3, por filas) y t, en coordenadas de la cámara (unidades del plano).
 */
export function poseDesdeHomografia(H, K) {
  const Kinv = [1 / K.fx, 0, -K.cx / K.fx, 0, 1 / K.fy, -K.cy / K.fy, 0, 0, 1];
  const M = multiplicar3(Kinv, H);
  const m1 = [M[0], M[3], M[6]], m2 = [M[1], M[4], M[7]], m3 = [M[2], M[5], M[8]];
  let l = 2 / (norma(m1) + norma(m2));
  if (m3[2] * l < 0) l = -l; // el plano debe quedar DELANTE de la cámara (z > 0)
  const r1 = m1.map((v) => v * l), r2 = m2.map((v) => v * l), t = m3.map((v) => v * l);
  const r3 = cruz(r1, r2);
  const R = ortonormalizar([r1[0], r2[0], r3[0], r1[1], r2[1], r3[1], r1[2], r2[2], r3[2]]);
  return { R, t };
}

// --- Rotaciones como vector (Rodrigues): 3 números en vez de 9 (para optimizar) ---
export function rodriguesAMatriz([a, b, c]) {
  const th = Math.hypot(a, b, c);
  if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const [x, y, z] = [a / th, b / th, c / th], co = Math.cos(th), s = Math.sin(th), C = 1 - co;
  return [co + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, co + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, co + z * z * C];
}

export function matrizARodrigues(R) {
  const th = Math.acos(Math.max(-1, Math.min(1, (R[0] + R[4] + R[8] - 1) / 2)));
  if (th < 1e-9) return [0, 0, 0];
  const k = th / (2 * Math.sin(th));
  return [(R[7] - R[5]) * k, (R[2] - R[6]) * k, (R[3] - R[1]) * k];
}

export function proyectar(R, t, K, [X, Y, Z]) {
  const x = R[0] * X + R[1] * Y + R[2] * Z + t[0];
  const y = R[3] * X + R[4] * Y + R[5] * Z + t[1];
  const z = R[6] * X + R[7] * Y + R[8] * Z + t[2];
  return [K.fx * (x / z) + K.cx, K.fy * (y / z) + K.cy];
}

/** Error de reproyección (RMS, en píxeles): lo que minimiza el refinamiento */
export function errorReproyeccion(R, t, K, objeto, imagen) {
  let s = 0;
  objeto.forEach((P, i) => { const [u, v] = proyectar(R, t, K, P); s += (u - imagen[i][0]) ** 2 + (v - imagen[i][1]) ** 2; });
  return Math.sqrt(s / objeto.length);
}

/**
 * Refina la pose con Gauss-Newton: 6 incógnitas (3 de giro + 3 de posición), derivadas
 * numéricas, y en cada paso resolvemos (JᵀJ)·δ = −Jᵀr. Pocas iteraciones bastan.
 *
 * El giro se optimiza como una CORRECCIÓN pequeña sobre la rotación inicial (R = Δ·R0).
 * Así evitamos el punto raro de Rodrigues en 180°, que es justo el caso más común:
 * un marcador visto de frente está girado 180° respecto a la cámara.
 */
export function refinarPose(R0, t0, K, objeto, imagen, iteraciones = 6) {
  let p = [0, 0, 0, ...t0];
  const rotacion = (q) => multiplicar3(rodriguesAMatriz(q.slice(0, 3)), R0);
  const residuos = (q) => {
    const Rq = rotacion(q), tq = q.slice(3);
    return objeto.flatMap((P, i) => { const [u, v] = proyectar(Rq, tq, K, P); return [u - imagen[i][0], v - imagen[i][1]]; });
  };
  for (let it = 0; it < iteraciones; it++) {
    const r = residuos(p);
    const J = r.map(() => new Array(6));
    for (let k = 0; k < 6; k++) {
      const h = k < 3 ? 1e-6 : 1e-6 * Math.max(1, Math.abs(p[5]));
      const q = [...p]; q[k] += h;
      const rq = residuos(q);
      for (let i = 0; i < r.length; i++) J[i][k] = (rq[i] - r[i]) / h;
    }
    const JtJ = Array.from({ length: 6 }, (_, a) => Array.from({ length: 6 }, (_, b) => J.reduce((s, f) => s + f[a] * f[b], 0) + (a === b ? 1e-9 : 0)));
    const Jtr = Array.from({ length: 6 }, (_, a) => -J.reduce((s, f, i) => s + f[a] * r[i], 0));
    const delta = resolver(JtJ, Jtr);
    if (!delta) break;
    p = p.map((v, k) => v + delta[k]);
    if (Math.hypot(...delta) < 1e-10) break;
  }
  return { R: rotacion(p), t: p.slice(3) };
}

/**
 * Parámetros de la cámara si no la calibramos: suponemos que su lado largo ve ~63°
 * (lo típico en la cámara principal de un celular).
 */
export function camaraTipica(ancho, alto, campoLadoLargo = 63) {
  const f = Math.max(ancho, alto) / 2 / Math.tan((campoLadoLargo / 2) * Math.PI / 180);
  return { fx: f, fy: f, cx: ancho / 2, cy: alto / 2 };
}
