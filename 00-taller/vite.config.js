import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import qrcode from 'qrcode-terminal';

// Muestra un QR en la terminal con la URL de la red local,
// para abrir la página en el celular sin escribir nada.
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

export default defineConfig({
  base: './', // rutas relativas: funciona igual en GitHub Pages
  plugins: [basicSsl(), qrEnTerminal()],
  server: { host: true }, // expone el servidor en la red local
});
