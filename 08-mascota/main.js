// Nivel 8 · Tu mascota en realidad aumentada
// Junta lo de niveles anteriores: imágenes (nivel 3) para su casa, la cara (nivel 4) para
// las selfies, y lo nuevo: un personaje con comportamiento, necesidades y memoria.
import { Cuidado } from './cuidado.js';
import { COLORES } from './mascota.js';
import { prepararSonido } from './sonidos.js';

const $ = (id) => document.getElementById(id);
let cuidado = Cuidado.cargar();
let colorElegido = 'menta';
let ar = null, casa = null, modo = null;

// ---------------------------------------------------------------------------
// Pantalla de inicio
// ---------------------------------------------------------------------------
function pintarInicio() {
  $('nacer').hidden = !!cuidado;
  $('visitar').hidden = !cuidado;
  if (!cuidado) return;
  cuidado.ponerseAlDia();
  $('fichaNombre').textContent = cuidado.nombre;
  const d = cuidado.dias;
  $('fichaEdad').textContent = `${d === 0 ? 'Nació hoy' : d === 1 ? 'Tiene 1 día' : `Tiene ${d} días`}${cuidado.durmiendo ? ' · está dormida 💤' : ''}`;
  $('fichaBarras').innerHTML = barras();
}

function barras() {
  const fila = (emoji, nombre, v) => `<div class="fila-barra" title="${nombre}"><span>${emoji}</span><div class="barra ${v < 30 ? 'baja' : ''}"><div style="width:${v.toFixed(0)}%"></div></div></div>`;
  return fila('🍎', 'Comida', cuidado.comida) + fila('⚡', 'Energía', cuidado.energia) + fila('😊', 'Ánimo', cuidado.animo);
}

$('colores').innerHTML = Object.entries(COLORES).map(([id, c]) =>
  `<button class="color ${id === colorElegido ? 'activo' : ''}" data-color="${id}" style="--c:${c.cuerpo}" aria-label="${id}"></button>`).join('');
$('colores').querySelectorAll('.color').forEach((b) => b.addEventListener('click', () => {
  colorElegido = b.dataset.color;
  $('colores').querySelectorAll('.color').forEach((x) => x.classList.toggle('activo', x === b));
}));

$('btnNacer').addEventListener('click', () => {
  const nombre = $('nombre').value.trim() || 'Lumi';
  cuidado = Cuidado.nacer(nombre, colorElegido);
  pintarInicio();
});

$('btnOlvidar').addEventListener('click', (e) => {
  e.preventDefault();
  if (!confirm(`¿Seguro? ${cuidado.nombre} se irá para siempre de este celular.`)) return;
  cuidado.olvidar();
  cuidado = null;
  pintarInicio();
});

// ---------------------------------------------------------------------------
// Casa propia: cualquier imagen, compilada en el navegador y guardada en IndexedDB
// ---------------------------------------------------------------------------
const BD = { nombre: 'ar-mascota', almacen: 'casa' };
function abrirBD() {
  return new Promise((ok, mal) => {
    const pedido = indexedDB.open(BD.nombre, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(BD.almacen);
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => mal(pedido.error);
  });
}
async function bd(accion, valor) {
  try {
    const db = await abrirBD();
    return await new Promise((ok, mal) => {
      const tx = db.transaction(BD.almacen, accion === 'leer' ? 'readonly' : 'readwrite').objectStore(BD.almacen);
      const pedido = accion === 'leer' ? tx.get('mind') : accion === 'borrar' ? tx.delete('mind') : tx.put(valor, 'mind');
      pedido.onsuccess = () => ok(pedido.result);
      pedido.onerror = () => mal(pedido.error);
    });
  } catch { return null; }
}
let casaPropia = null;
bd('leer').then((datos) => { casaPropia = datos ?? null; $('casaPropia').hidden = !casaPropia; });

$('archivo').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  $('mensaje').hidden = true;
  $('compilando').hidden = false;
  try {
    const img = new Image();
    img.src = URL.createObjectURL(archivo);
    await img.decode();
    const { Compiler } = await import('mind-ar/dist/mindar-image.prod.js');
    const compilador = new Compiler();
    await compilador.compileImageTargets([reducir(img)], (p) => { $('progreso').style.width = `${p}%`; });
    const bytes = compilador.exportData();
    casaPropia = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await bd('guardar', casaPropia);
    $('casaPropia').hidden = false;
    $('textoCompilando').textContent = '¡Lista! Ahora tu mascota vive en esa imagen.';
    setTimeout(() => { $('compilando').hidden = true; $('textoCompilando').textContent = 'Preparando tu imagen…'; }, 2500);
  } catch (err) {
    $('compilando').hidden = true;
    mostrarError(err);
  } finally {
    $('progreso').style.width = '0';
    e.target.value = '';
  }
});
$('btnCasaOriginal').addEventListener('click', async (e) => {
  e.preventDefault();
  casaPropia = null;
  await bd('borrar');
  $('casaPropia').hidden = true;
});

function reducir(img, maximo = 1000) {
  const k = Math.min(1, maximo / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// ---------------------------------------------------------------------------
// Entrar en AR: la casa (cámara trasera + MindAR) o el selfie (frontal + MediaPipe)
// Las librerías se cargan solo cuando se necesitan (son pesadas).
// ---------------------------------------------------------------------------
let avisoHasta = 0;
function avisar(texto) {
  $('ayuda').textContent = texto;
  $('ayuda').classList.add('aviso');
  avisoHasta = performance.now() + 3500;
}
const ayudaNormal = () => (modo === 'casa'
  ? `Toca a ${cuidado.nombre} para hacerle cosquillas.`
  : 'Sonríe, abre la boca, parpadea o sube las cejas: te imita.');

async function entrar(nuevoModo) {
  prepararSonido();
  $('mensaje').hidden = true;
  modo = nuevoModo;
  document.body.classList.add('en-ar');
  document.body.dataset.modo = modo;
  $('inicio').hidden = true;
  for (const id of ['hudArriba', 'barras', 'controles']) $(id).hidden = false;
  $('chipNombre').textContent = cuidado.nombre;
  $('btnCambiar').textContent = modo === 'casa' ? '🤳 Selfie' : '🏠 Casa';
  $('estado').textContent = modo === 'casa' ? 'Busca la tarjeta' : 'Busca tu cara';
  $('estado').classList.remove('visto');
  const estado = (t) => { $('ayuda').textContent = t || ayudaNormal(); $('ayuda').classList.remove('aviso'); };

  try {
    if (modo === 'casa') {
      const [{ RealidadDeImagenes }, { crearCasa }] = await Promise.all([import('./puente-mindar.js'), import('./casa.js')]);
      ar = new RealidadDeImagenes($('ar'));
      const ancla = ar.ancla(0);
      ancla.alEncontrar = () => { $('estado').textContent = 'En casa ✓'; $('estado').classList.add('visto'); };
      ancla.alPerder = () => { $('estado').textContent = 'Busca la tarjeta'; $('estado').classList.remove('visto'); };
      casa = crearCasa(ar, ancla, cuidado, { avisar });
      await ar.iniciar({ objetivos: casaPropia ?? './objetivos/objetivos.mind', estado });
    } else {
      const [{ RealidadDeCara }, { crearSelfie }] = await Promise.all([import('./puente-cara.js'), import('./selfie.js')]);
      ar = new RealidadDeCara($('ar'));
      crearSelfie(ar, cuidado, { avisar });
      ar.alCuadro.push((t, dt, cara) => {
        $('estado').textContent = cara.visible ? 'Juntos ✓' : 'Busca tu cara';
        $('estado').classList.toggle('visto', cara.visible);
      });
      await ar.iniciar({ estado });
    }
    if (import.meta.env.DEV) { window.__ar = ar; window.__casa = casa; window.__cuidado = cuidado; } // solo para probar
    ar.alCuadro.push(() => {
      $('barras').innerHTML = barras();
      $('btnDormir').textContent = cuidado.durmiendo ? '☀️ Despertar' : '💤 Dormir';
      if (avisoHasta && performance.now() > avisoHasta) { avisoHasta = 0; $('ayuda').textContent = ayudaNormal(); $('ayuda').classList.remove('aviso'); }
    });
  } catch (err) {
    salir();
    mostrarError(err);
  }
}

function salir() {
  ar?.detener();
  ar = null;
  casa = null;
  modo = null;
  document.body.classList.remove('en-ar');
  $('inicio').hidden = false;
  for (const id of ['hudArriba', 'barras', 'controles']) $(id).hidden = true;
  cuidado?.guardar();
  pintarInicio();
}

function mostrarError(err) {
  console.error(err);
  const textos = {
    NotAllowedError: 'Diste "No permitir" a la cámara. Actívala en los ajustes del navegador y recarga.',
    NotFoundError: 'No se encontró la cámara.',
  };
  $('mensaje').textContent = textos[err?.name] ?? `Algo falló: ${err?.message ?? err}`;
  $('mensaje').hidden = false;
}

$('btnCasa').addEventListener('click', () => entrar('casa'));
$('btnSelfie').addEventListener('click', () => entrar('selfie'));
$('btnSalir').addEventListener('click', salir);
$('btnCambiar').addEventListener('click', () => { const otro = modo === 'casa' ? 'selfie' : 'casa'; salir(); entrar(otro); });
$('btnComer').addEventListener('click', () => casa?.comer());
$('btnJugar').addEventListener('click', () => casa?.jugar());
$('btnDormir').addEventListener('click', () => {
  if (casa) return casa.dormir();
  // En el selfie no hay casa: dormir o despertar directamente
  if (cuidado.durmiendo) cuidado.durmiendo = false;
  else if (cuidado.energia > 90) avisar(`${cuidado.nombre} no tiene sueño.`);
  else cuidado.durmiendo = true;
  cuidado.guardar();
});
// Tocar la pantalla en la casa: ¿tocaste a la mascota?
$('ar').addEventListener('pointerdown', (e) => casa?.tocar(e.clientX, e.clientY));

// Foto (solo en el selfie)
let archivoFoto = null;
$('btnFoto').addEventListener('click', async () => {
  if (!ar?.foto) return;
  const blob = await ar.foto();
  archivoFoto = new File([blob], 'mascota-ar.png', { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  $('foto').src = url;
  $('btnGuardar').href = url;
  $('btnCompartir').hidden = !navigator.canShare?.({ files: [archivoFoto] });
  $('vista-foto').hidden = false;
});
$('btnCerrarFoto').addEventListener('click', () => { $('vista-foto').hidden = true; });
$('btnCompartir').addEventListener('click', () => navigator.share({ files: [archivoFoto] }).catch(() => {}));

pintarInicio();
