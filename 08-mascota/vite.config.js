import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import qrcode from 'qrcode-terminal';
import fs from 'node:fs';
import path from 'node:path';

// Muestra un QR en la terminal con la URL de la red local
function qrEnTerminal() {
  return {
    name: 'qr-en-terminal',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        setTimeout(() => {
          const url = server.resolvedUrls?.network?.[0];
          if (!url) return;
          console.log('\n  Escanea con el celular (mismo Wi-Fi):\n');
          qrcode.generate(url, { small: true });
        }, 100);
      });
    },
  };
}

// Solo en desarrollo: deja que herramientas.html guarde archivos en public/objetivos/
// (la compilación de imágenes objetivo corre en el navegador, no en Node).
function guardarObjetivos() {
  const carpeta = path.resolve('public/objetivos');
  return {
    name: 'guardar-objetivos',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__guardar', (req, res) => {
        const nombre = new URL(req.url, 'http://x').searchParams.get('archivo') ?? '';
        if (req.method !== 'POST' || !/^[\w-]+\.(png|mind)$/.test(nombre)) {
          res.statusCode = 400;
          return res.end('Nombre de archivo no válido');
        }
        const trozos = [];
        req.on('data', (t) => trozos.push(t));
        req.on('end', () => {
          fs.writeFileSync(path.join(carpeta, nombre), Buffer.concat(trozos));
          res.end(`Guardado public/objetivos/${nombre}`);
        });
      });
    },
  };
}

// SIN_HTTPS=1 npm run dev → servidor sin HTTPS (solo sirve en la misma computadora)
const conHttps = !process.env.SIN_HTTPS;

export default defineConfig({
  base: './',
  plugins: [...(conHttps ? [basicSsl()] : []), qrEnTerminal(), guardarObjetivos()],
  server: { host: true },
  build: {
    chunkSizeWarningLimit: 4000, // el motor de MindAR incluye TensorFlow.js
    rollupOptions: { // este nivel usa Vite 6 (MindAR lo fija)
      input: { index: 'index.html', tarjeta: 'tarjeta.html' },
    },
  },
});
