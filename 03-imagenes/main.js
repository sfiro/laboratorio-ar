// Nivel 3 · Imágenes que cobran vida
import { Compiler } from 'mind-ar/dist/mindar-image.prod.js';
import { RealidadDeImagenes } from './puente-mindar.js';
import { posterCohete, posterPortal, imagenPropia } from './escenas.js';

const $ = (id) => document.getElementById(id);
let ar = null;

const NOMBRES = ['Cohete', 'Portal'];

async function empezar({ objetivos, propia = false }) {
  $('mensaje').hidden = true;
  ar = new RealidadDeImagenes($('ar'));

  if (propia) {
    imagenPropia(ar, ar.ancla(0));
  } else {
    posterCohete(ar, ar.ancla(0));
    posterPortal(ar, ar.ancla(1));
  }

  // Avisar en pantalla qué imagen se está viendo
  const vistos = new Set();
  const actualizar = () => {
    const chip = $('estado-objetivo');
    chip.textContent = vistos.size ? [...vistos].join(' + ') : 'Buscando…';
    chip.classList.toggle('visto', vistos.size > 0);
  };
  ar.anclas.forEach((ancla) => {
    const nombre = propia ? 'Tu imagen' : NOMBRES[ancla.indice];
    const [enc, per] = [ancla.alEncontrar, ancla.alPerder];
    ancla.alEncontrar = () => { enc(); vistos.add(nombre); actualizar(); };
    ancla.alPerder = () => { per(); vistos.delete(nombre); actualizar(); };
  });

  $('inicio').hidden = true;
  $('controles').hidden = false;
  document.body.classList.add('en-ar');
  $('ayuda').textContent = propia ? 'Apunta a tu imagen' : 'Apunta a un póster';

  try {
    await ar.iniciar({ objetivos, estado: (t) => { $('ayuda').textContent = t || (propia ? 'Apunta a tu imagen' : 'Apunta a un póster'); } });
  } catch (err) {
    salir();
    mostrarError(err);
  }
}

function salir() {
  ar?.detener();
  ar = null;
  $('inicio').hidden = false;
  $('controles').hidden = true;
  document.body.classList.remove('en-ar');
  $('estado-objetivo').textContent = 'Buscando…';
  $('estado-objetivo').classList.remove('visto');
}

function mostrarError(err) {
  const textos = {
    NotAllowedError: 'Diste "No permitir" a la cámara. Actívala en los ajustes del navegador y recarga.',
    NotFoundError: 'No se encontró ninguna cámara.',
  };
  $('mensaje').textContent = textos[err.name] ?? `Algo falló: ${err.message}`;
  $('mensaje').hidden = false;
}

$('btnPosters').addEventListener('click', () => empezar({ objetivos: './objetivos/objetivos.mind' }));
$('btnSalir').addEventListener('click', salir);

// ---------------------------------------------------------------------------
// Tu propia imagen: la compilamos en el navegador con el compilador de MindAR.
// "Compilar" = encontrar cientos de puntos característicos (esquinas, manchas)
// en varias escalas y guardarlos para reconocerlos después en el video.
// ---------------------------------------------------------------------------
$('archivo').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  $('mensaje').hidden = true;

  const img = new Image();
  img.src = URL.createObjectURL(archivo);
  await img.decode();
  $('miniatura').src = img.src;
  $('compilando').hidden = false;
  $('texto-compilando').textContent = 'Compilando tu imagen…';

  try {
    const compilador = new Compiler();
    const datos = await compilador.compileImageTargets([reducir(img)], (p) => {
      $('progreso').style.width = `${p}%`;
    });
    $('texto-compilando').textContent = '¡Lista! Abriendo la cámara…';
    const bytes = compilador.exportData(); // Uint8Array: copiamos solo sus bytes
    await empezar({ objetivos: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), propia: true });
  } catch (err) {
    mostrarError(err);
  } finally {
    $('compilando').hidden = true;
    $('progreso').style.width = '0';
    e.target.value = '';
  }
});

// Las fotos del celular son enormes; con ~1000 px de lado basta y compila mucho más rápido
function reducir(img, maximo = 1000) {
  const k = Math.min(1, maximo / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
