// Pruebas de la matemática con datos que conocemos de antemano
import { homografia, aplicarH, poseDesdeHomografia, refinarPose, rodriguesAMatriz, matrizARodrigues, proyectar, errorReproyeccion, camaraTipica } from '../matematica.js';

const K = camaraTipica(480, 854);
let fallas = 0;
const revisar = (nombre, ok, detalle) => { console.log(`${ok ? '✓' : '✗'} ${nombre} ${detalle}`); if (!ok) fallas++; };
const anguloEntre = (A, B) => { // grados entre dos rotaciones
  const tr = A[0] * B[0] + A[1] * B[1] + A[2] * B[2] + A[3] * B[3] + A[4] * B[4] + A[5] * B[5] + A[6] * B[6] + A[7] * B[7] + A[8] * B[8];
  return Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180 / Math.PI;
};

// Un marcador de 1×1 visto desde varias poses
const esquinas = [[-0.5, 0.5, 0], [0.5, 0.5, 0], [0.5, -0.5, 0], [-0.5, -0.5, 0]];
const casos = [
  { r: [Math.PI, 0, 0], t: [0, 0, 4] },          // de frente (el marcador mira a la cámara)
  { r: [Math.PI + 0.6, 0.3, 0.2], t: [0.4, -0.3, 3] },
  { r: [Math.PI - 0.9, -0.5, 1.2], t: [-0.6, 0.5, 5] },
];
for (const [i, c] of casos.entries()) {
  const R = rodriguesAMatriz(c.r);
  const imagen = esquinas.map((P) => proyectar(R, c.t, K, P));
  const H = homografia(esquinas.map((p) => p.slice(0, 2)), imagen);
  const errH = Math.max(...esquinas.map((P, k) => { const [u, v] = aplicarH(H, P[0], P[1]); return Math.hypot(u - imagen[k][0], v - imagen[k][1]); }));
  const pose = poseDesdeHomografia(H, K);
  const errR = anguloEntre(pose.R, R), errT = Math.hypot(...pose.t.map((v, k) => v - c.t[k]));
  revisar(`caso ${i}: homografía exacta`, errH < 1e-6, `(error ${errH.toExponential(1)} px)`);
  revisar(`caso ${i}: pose exacta`, errR < 1e-4 && errT < 1e-6, `(giro ${errR.toExponential(1)}°, posición ${errT.toExponential(1)})`);

  // Con ruido de medio píxel en las esquinas: la homografía sola vs. refinada con más puntos
  const azar = ((s) => () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5))(i + 7);
  const puntos = [];
  for (let x = -0.5; x <= 0.5; x += 0.25) for (let y = -0.5; y <= 0.5; y += 0.25) puntos.push([x, y, 0]);
  const medidas = puntos.map((P) => proyectar(R, c.t, K, P).map((v) => v + azar()));
  const Hn = homografia(puntos.map((p) => p.slice(0, 2)), medidas);
  const p0 = poseDesdeHomografia(Hn, K);
  const p1 = refinarPose(p0.R, p0.t, K, puntos, medidas);
  const e0 = errorReproyeccion(p0.R, p0.t, K, puntos, medidas), e1 = errorReproyeccion(p1.R, p1.t, K, puntos, medidas);
  revisar(`caso ${i}: con ruido, refinar no empeora`, e1 <= e0 + 1e-9, `(reproyección ${e0.toFixed(3)} → ${e1.toFixed(3)} px; giro real vs. medido ${anguloEntre(p1.R, R).toFixed(2)}°)`);
}
// Ida y vuelta de Rodrigues
const v = [0.3, -1.1, 0.7];
const v2 = matrizARodrigues(rodriguesAMatriz(v));
revisar('Rodrigues ida y vuelta', Math.hypot(...v.map((x, k) => x - v2[k])) < 1e-9, '');
process.exit(fallas ? 1 : 0);
