// Crea nuestros propios marcadores: un SVG para imprimir y el .patt que lee AR.js.
// Las figuras son polígonos dentro del cuadro interior, con coordenadas de 0 a 1 (y hacia abajo).
import fs from 'node:fs';
import { codificarPatt, LADO, PROPORCION } from '../patt.js';

const estrella = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 === 0 ? 0.44 : 0.18;
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  return [0.5 + r * Math.cos(a), 0.53 + r * Math.sin(a)];
});

const escalera = [
  [0.08, 0.92], [0.08, 0.64], [0.36, 0.64], [0.36, 0.36],
  [0.64, 0.36], [0.64, 0.08], [0.92, 0.08], [0.92, 0.92],
];

const figuras = { estrella, escalera };

// ¿El punto (x, y) está dentro del polígono? (regla del rayo: contar cruces)
function dentro([x, y], poligono) {
  let adentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i], [xj, yj] = poligono[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) adentro = !adentro;
  }
  return adentro;
}

// Reduce la figura a 16×16: cada celda toma el promedio de 8×8 puntos de muestra
function rasterizar(poligono) {
  const N = 8;
  return Array.from({ length: LADO }, (_, fy) => Array.from({ length: LADO }, (_, fx) => {
    let negros = 0;
    for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
      if (dentro([(fx + (sx + 0.5) / N) / LADO, (fy + (sy + 0.5) / N) / LADO], poligono)) negros++;
    }
    const v = 255 * (1 - negros / (N * N));
    return [v, v, v];
  }));
}

function svg(poligono) {
  const margen = 10, negro = 80;
  const interior = margen + (negro * (1 - PROPORCION)) / 2;
  const lado = negro * PROPORCION;
  const puntos = poligono.map(([x, y]) => `${(interior + x * lado).toFixed(2)},${(interior + y * lado).toFixed(2)}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1000" height="1000">
  <rect width="100" height="100" fill="#fff"/>
  <rect x="${margen}" y="${margen}" width="${negro}" height="${negro}" fill="#000"/>
  <rect x="${interior}" y="${interior}" width="${lado}" height="${lado}" fill="#fff"/>
  <polygon points="${puntos}" fill="#000"/>
</svg>
`;
}

for (const [nombre, poligono] of Object.entries(figuras)) {
  fs.writeFileSync(new URL(`../public/data/patt.${nombre}`, import.meta.url), codificarPatt(rasterizar(poligono)));
  fs.writeFileSync(new URL(`../public/marcadores/${nombre}.svg`, import.meta.url), svg(poligono));
  console.log(`✓ ${nombre}: public/marcadores/${nombre}.svg + public/data/patt.${nombre}`);
}
