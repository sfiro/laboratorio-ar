// Diseña NUESTRO diccionario de marcadores y dibuja cada marcador en SVG.
//
// Formato: una cuadrícula de 7×7 celdas. El anillo de afuera es negro (para encontrar el
// cuadrado) y adentro hay 5×5 = 25 celdas de datos (negro = 1, blanco = 0).
//
// Un buen diccionario cumple dos cosas, que buscamos al azar (con semilla):
//   1. Cada código se ve DISTINTO al girarlo 90°, 180° y 270°: así sabemos cómo está girado.
//   2. Dos códigos cualesquiera (en cualquier giro) difieren en muchas celdas: así un par de
//      celdas mal leídas no confunden un marcador con otro (y hasta las podemos corregir).
import fs from 'node:fs';

const CANTIDAD = 8;
const DISTANCIA_MINIMA = 9;

function azar(semilla) {
  return () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296; };
}
const r = azar(909);

// 25 bits en un número; celda (fila, columna) = bit fila*5+columna
const bit = (c, f, k) => (c >>> (f * 5 + k)) & 1;
function girar(c) { // 90° en el sentido del reloj: nueva[f][k] = vieja[4−k][f]
  let g = 0;
  for (let f = 0; f < 5; f++) for (let k = 0; k < 5; k++) if (bit(c, 4 - k, f)) g |= 1 << (f * 5 + k);
  return g >>> 0;
}
const giros = (c) => { const a = [c]; for (let i = 0; i < 3; i++) a.push(girar(a.at(-1))); return a; };
const distancia = (a, b) => { let x = (a ^ b) >>> 0, n = 0; while (x) { n += x & 1; x >>>= 1; } return n; };
const unos = (c) => distancia(c, 0);

const codigos = [];
for (let intento = 0; intento < 2_000_000 && codigos.length < CANTIDAD; intento++) {
  const c = Math.floor(r() * 2 ** 25) >>> 0;
  if (unos(c) < 9 || unos(c) > 16) continue; // ni casi blanco ni casi negro
  const g = giros(c);
  if (Math.min(distancia(c, g[1]), distancia(c, g[2]), distancia(c, g[3])) < DISTANCIA_MINIMA) continue;
  if (codigos.some((o) => giros(o).some((og) => distancia(c, og) < DISTANCIA_MINIMA))) continue;
  codigos.push(c);
}
if (codigos.length < CANTIDAD) throw new Error('No se encontraron suficientes códigos');

fs.writeFileSync('diccionario.js', `// Generado por scripts/crear-marcadores.mjs: ${CANTIDAD} códigos de 25 bits.
// Entre cualquier par (en cualquier giro) hay al menos ${DISTANCIA_MINIMA} celdas distintas.
export const DICCIONARIO = [${codigos.join(', ')}];
export const DISTANCIA_MINIMA = ${DISTANCIA_MINIMA};
`);

// SVG de cada marcador (7×7 celdas de 100) con un margen blanco de 1 celda
for (const [id, c] of codigos.entries()) {
  let celdas = '';
  for (let f = 0; f < 5; f++) for (let k = 0; k < 5; k++) if (bit(c, f, k)) celdas += `<rect x="${(k + 2) * 100}" y="${(f + 2) * 100}" width="100" height="100"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" width="900" height="900">
<rect width="900" height="900" fill="#fff"/>
<path d="M100 100h700v700h-700z M200 200v500h500v-500z" fill-rule="evenodd"/>
${celdas}
<text x="450" y="70" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" fill="#999">ID ${id}</text>
</svg>
`;
  fs.writeFileSync(`public/marcadores/marcador-${id}.svg`, svg);
}
console.log(`✓ ${CANTIDAD} códigos (distancia mínima ${DISTANCIA_MINIMA}): ${codigos.map((c) => c.toString(2).padStart(25, '0')).join(' ')}`);
