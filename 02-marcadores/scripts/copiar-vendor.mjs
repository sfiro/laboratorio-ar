// Copia A-Frame y AR.js desde node_modules a public/vendor para servirlos nosotros mismos
// (sin depender de un CDN externo). Se cargan como <script> clásicos, en orden.
import fs from 'node:fs';

const archivos = {
  'aframe.min.js': 'node_modules/aframe/dist/aframe-v1.8.0.min.js',
  'aframe-ar.js': 'node_modules/@ar-js-org/ar.js/aframe/build/aframe-ar.js',
};

fs.mkdirSync('public/vendor', { recursive: true });
for (const [destino, origen] of Object.entries(archivos)) {
  fs.copyFileSync(origen, `public/vendor/${destino}`);
}
console.log('✓ A-Frame y AR.js copiados a public/vendor');
