// Copia los archivos WebAssembly de MediaPipe a public/vendor para servirlos nosotros mismos.
import fs from 'node:fs';

const origen = 'node_modules/@mediapipe/tasks-vision/wasm';
const destino = 'public/vendor/mediapipe-wasm';
fs.mkdirSync(destino, { recursive: true });
for (const archivo of fs.readdirSync(origen)) fs.copyFileSync(`${origen}/${archivo}`, `${destino}/${archivo}`);
console.log('✓ WebAssembly de MediaPipe copiado a', destino);
