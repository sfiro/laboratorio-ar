// Crea prueba/escena.svg: los tres marcadores sobre una "mesa", con distintos giros y tamaños.
// Sirve para probar la detección sin cámara: index.html?imagen=./prueba/escena.svg
import fs from 'node:fs';

const leer = (ruta) => fs.readFileSync(new URL(ruta, import.meta.url));
const hiro = `data:image/png;base64,${leer('../public/marcadores/hiro.png').toString('base64')}`;
const interior = (svg) => svg.toString().replace(/^<svg[^>]*>|<\/svg>\s*$/g, '');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1280 960" width="1280" height="960">
  <rect width="1280" height="960" fill="#c9b79c"/>
  <g transform="translate(110 260) rotate(-8 170 170)"><image href="${hiro}" xlink:href="${hiro}" width="340" height="340"/></g>
  <g transform="translate(500 330) rotate(14 160 160) scale(3.2)">${interior(leer('../public/marcadores/estrella.svg'))}</g>
  <g transform="translate(880 280) rotate(-25 150 150) scale(3)">${interior(leer('../public/marcadores/escalera.svg'))}</g>
</svg>
`;
fs.writeFileSync(new URL('../prueba/escena.svg', import.meta.url), svg);
console.log('✓ prueba/escena.svg');
