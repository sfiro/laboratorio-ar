// Pruebas del detector con imágenes sintéticas de pose conocida
import { DetectorDeMarcadores } from '../marcadores.js';
import { rodriguesAMatriz, camaraTipica } from '../matematica.js';
import { renderizar } from './renderizar.mjs';

const W = 360, H = 640;
const K = camaraTipica(W, H);
const anguloEntre = (A, B) => {
  let tr = 0; for (let i = 0; i < 9; i++) tr += A[i] * B[i];
  return Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180 / Math.PI;
};
let fallas = 0;
const casos = [
  { nombre: 'de frente', marcadores: [{ id: 0, rot: [Math.PI, 0, 0], t: [0, 0, 3] }] },
  { nombre: 'inclinado 40°', marcadores: [{ id: 3, rot: [Math.PI - 0.7, 0.2, 0.1], t: [0.2, 0.3, 3.2] }] },
  { nombre: 'girado en su plano 90°', marcadores: [{ id: 5, rot: [Math.PI, 0, 0], giroPlano: Math.PI / 2, t: [0, 0, 3] }] },
  { nombre: 'girado en su plano 200° e inclinado', marcadores: [{ id: 2, rot: [Math.PI - 0.6, 0.3, 0], giroPlano: 3.5, t: [0.1, -0.2, 3] }] },
  { nombre: 'dos a la vez, con ruido y sombra', marcadores: [{ id: 1, rot: [Math.PI - 0.4, -0.3, 0], t: [-0.6, -0.8, 4] }, { id: 6, rot: [Math.PI - 0.5, 0.4, 0.3], t: [0.6, 0.9, 4.5] }], ruido: 25, gradiente: 0.45 },
  { nombre: 'pequeño y lejos', tolerancia: 4, marcadores: [{ id: 7, rot: [Math.PI - 0.3, 0, 0], t: [0, 0, 9] }] },
];
const detector = new DetectorDeMarcadores();
for (const caso of casos) {
  // Rotaciones reales. Un giro "en su plano" = girar alrededor del eje Z del marcador
  const reales = caso.marcadores.map((m) => {
    let R = rodriguesAMatriz(m.rot);
    if (m.giroPlano) {
      const c = Math.cos(m.giroPlano), s = Math.sin(m.giroPlano), Z = [c, -s, 0, s, c, 0, 0, 0, 1];
      R = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => R[i * 3] * Z[j] + R[i * 3 + 1] * Z[3 + j] + R[i * 3 + 2] * Z[6 + j]));
    }
    return { ...m, R };
  });
  // renderizar con esas rotaciones: convertimos R a rodrigues para el renderizador
  const gris = renderizar(W, H, K, reales.map((m) => ({ id: m.id, R: m.R, t: m.t })), caso);
  const t0 = performance.now();
  const res = detector.procesar(gris, W, H, K);
  const ms = performance.now() - t0;
  for (const m of reales) {
    const r = res.find((x) => x.id === m.id);
    if (!r) { console.log(`✗ ${caso.nombre}: no encontró el ID ${m.id} (cuadros candidatos: ${detector.cuadros.length})`); fallas++; continue; }
    const eR = anguloEntre(r.R, m.R), eT = Math.hypot(...r.t.map((v, k) => v - m.t[k])) / Math.hypot(...m.t) * 100;
    const ok = eR < 3 && eT < (caso.tolerancia ?? 2); // con solo 4 esquinas, ~2° en marcadores muy inclinados es normal
    if (!ok) fallas++;
    console.log(`${ok ? '✓' : '✗'} ${caso.nombre}: ID ${m.id} · giro ${eR.toFixed(2)}° · posición ${eT.toFixed(2)} % · ${ms.toFixed(1)} ms`);
  }
  const falsos = res.filter((x) => !reales.some((m) => m.id === x.id));
  if (falsos.length) { console.log(`✗ ${caso.nombre}: detectó marcadores que no están: ${falsos.map((f) => f.id)}`); fallas++; }
}
console.log('Tiempos del último cuadro (ms):', Object.fromEntries(Object.entries(detector.tiempos).map(([k, v]) => [k, +v.toFixed(1)])));
process.exit(fallas ? 1 : 0);
