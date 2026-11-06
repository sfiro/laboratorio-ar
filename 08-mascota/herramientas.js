// Herramienta de desarrollo: SVG → PNG → objetivos.mind (con el compilador de MindAR, en el navegador)
import { Compiler } from 'mind-ar/dist/mindar-image.prod.js';

const POSTERS = ['casa']; // una sola imagen objetivo: la casa de la mascota (índice 0)
const log = (t) => { document.getElementById('log').textContent += `${t}\n`; };

const cargarImagen = (src) => new Promise((ok, mal) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = mal;
  img.src = src;
});

async function guardar(nombre, datos) {
  const r = await fetch(`/__guardar?archivo=${nombre}`, { method: 'POST', body: datos });
  log(await r.text());
}

async function compilar() {
  const imagenes = [];
  for (const nombre of POSTERS) {
    const svg = await cargarImagen(`./objetivos/${nombre}.svg`);
    const c = document.createElement('canvas');
    c.width = svg.naturalWidth; c.height = svg.naturalHeight;
    c.getContext('2d').drawImage(svg, 0, 0);
    const png = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    await guardar(`${nombre}.png`, png);
    imagenes.push(await cargarImagen(URL.createObjectURL(png)));
  }

  log('Compilando (puede tardar un poco)…');
  const compilador = new Compiler();
  const t0 = performance.now();
  await compilador.compileImageTargets(imagenes, (p) => { document.title = `${p.toFixed(0)}%`; });
  const datos = compilador.exportData();
  log(`Compilado en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  await guardar('objetivos.mind', datos);
  log('LISTO');
}

document.getElementById('btn').addEventListener('click', () => compilar().catch((e) => log(`ERROR: ${e.message}`)));
