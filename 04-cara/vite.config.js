import { defineConfig } from 'vite';
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

// SIN_HTTPS=1 npm run dev → servidor sin HTTPS (solo sirve en la misma computadora)
const conHttps = !process.env.SIN_HTTPS;

export default defineConfig({
  base: './',
  plugins: [...(conHttps ? [basicSsl()] : []), qrEnTerminal()],
  server: { host: true },
});
