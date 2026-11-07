import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import qrcode from 'qrcode-terminal';

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

// «Guardar en el proyecto» (solo con npm run dev): escribe tus objetos en public/objetos/
// para que se publiquen y salgan en cualquier celular, en lugar de los genéricos.
function objetosDelProyecto() {
  const carpeta = path.resolve('public/objetos');
  const lista = path.join(carpeta, 'objetos.json');
  const leer = () => (fs.existsSync(lista) ? JSON.parse(fs.readFileSync(lista, 'utf8')) : []);
  const escribir = (objetos) => {
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(lista, JSON.stringify(objetos.sort((a, b) => a.id - b.id), null, 2) + '\n');
  };
  const nombreSeguro = (n) => path.basename(String(n)).replace(/[^\w.\- ]/g, '_');
  return {
    name: 'objetos-del-proyecto',
    configureServer(server) {
      // Servimos public/objetos directo del disco: Vite no se entera de archivos nuevos en public/
      // porque le pedimos no vigilar esa carpeta (si no, recargaría la página al guardar)
      server.middlewares.use('/objetos', (req, res, siguiente) => {
        const archivo = path.join(carpeta, decodeURIComponent(req.url.split('?')[0]));
        if (!archivo.startsWith(carpeta) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
          if (req.url.startsWith('/objetos.json')) { res.setHeader('Content-Type', 'application/json'); return res.end('[]'); }
          res.statusCode = 404; return res.end();
        }
        res.setHeader('Cache-Control', 'no-store');
        if (archivo.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
        fs.createReadStream(archivo).pipe(res);
      });
      server.middlewares.use('/__objetos', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let cuerpo = '';
        req.on('data', (c) => { cuerpo += c; });
        req.on('end', () => {
          try {
            const datos = JSON.parse(cuerpo);
            const id = Number(datos.id);
            if (!Number.isInteger(id) || id < 0 || id > 7) throw new Error('Marcador inválido');
            const dir = path.join(carpeta, String(id));
            let objetos = leer().filter((o) => o.id !== id);
            if (req.url.startsWith('/quitar')) {
              fs.rmSync(dir, { recursive: true, force: true });
            } else {
              const anterior = leer().find((o) => o.id === id);
              let archivos = anterior?.archivos;
              if (datos.archivos) {
                fs.rmSync(dir, { recursive: true, force: true });
                fs.mkdirSync(dir, { recursive: true });
                archivos = datos.archivos.map((a) => {
                  const nombre = nombreSeguro(a.nombre);
                  fs.writeFileSync(path.join(dir, nombre), Buffer.from(a.base64, 'base64'));
                  return nombre;
                });
              }
              if (!archivos?.length) throw new Error('Faltan los archivos del modelo');
              objetos.push({ id, nombre: String(datos.nombre).slice(0, 60), archivos, ajustes: datos.ajustes });
            }
            escribir(objetos);
            res.end('ok');
          } catch (e) {
            res.statusCode = 400;
            res.end(e.message);
          }
        });
      });
    },
  };
}

// SIN_HTTPS=1 npm run dev → servidor sin HTTPS (solo sirve en la misma computadora)
const conHttps = !process.env.SIN_HTTPS;

export default defineConfig({
  base: './',
  plugins: [...(conHttps ? [basicSsl()] : []), qrEnTerminal(), objetosDelProyecto()],
  server: { host: true, watch: { ignored: ['**/public/objetos/**'] } },
  // OpenCV.js es enorme: que Vite lo prepare al arrancar (si no, recarga la página la primera vez que se usa)
  optimizeDeps: { include: ['@techstark/opencv-js'] },
  build: {
    chunkSizeWarningLimit: 12000, // OpenCV.js mide ~10 MB (se descarga solo en el modo de imagen)
    rolldownOptions: { input: { index: 'index.html', marcadores: 'marcadores.html' } },
  },
});
