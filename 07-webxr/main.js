// Nivel 7 · Objetos en tu espacio (WebXR)
import { RealidadXR, soportaAR } from './puente-xr.js';
import { colocar, medir, pelotas } from './modos.js';
import { CATALOGO } from './objetos.js';
import { soportaQuickLook, abrirEnQuickLook } from './quicklook.js';

const $ = (id) => document.getElementById(id);
let ar = null, modos = [], activo = null;

// ¿Qué puede hacer este navegador?
soportaAR().then((si) => {
  if (si) { $('conAR').hidden = false; return; }
  if (soportaQuickLook()) {
    $('conQuickLook').hidden = false;
    $('galeria').innerHTML = CATALOGO.map((c) => `<button class="btn btn-sec" data-id="${c.id}">${c.emoji} ${c.nombre}</button>`).join('');
    $('galeria').querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
      const item = CATALOGO.find((c) => c.id === b.dataset.id);
      b.disabled = true;
      try { await abrirEnQuickLook(item); } catch (err) { mostrarError(err); } finally { b.disabled = false; }
    }));
    return;
  }
  $('sinAR').hidden = false;
  $('sinARtexto').innerHTML = navigator.xr
    ? 'Este navegador tiene WebXR pero no para realidad aumentada. En Android, usa Chrome y revisa que tengas <strong>Servicios de Google Play para AR</strong>.'
    : 'Este navegador no tiene WebXR. Ábrelo en <strong>Chrome para Android</strong> o en un <strong>iPhone</strong> (con AR Quick Look).';
});

async function iniciar(enAR) {
  $('mensaje').hidden = true;
  ar = new RealidadXR($('ar'));
  const mundo = { colocados: [] };
  modos = [colocar(ar, mundo), medir(ar), pelotas(ar, mundo)];
  $('modos').innerHTML = modos.map((m, i) => `<button class="filtro" data-i="${i}">${m.nombre}</button>`).join('');
  $('modos').querySelectorAll('.filtro').forEach((b) => b.addEventListener('click', () => elegir(+b.dataset.i)));
  if (import.meta.env.DEV) { window.__ar = ar; window.__modos = modos; window.__mundo = mundo; } // solo para probar

  let panelAntes = '';
  ar.alCuadro.push((t, dt) => {
    modos.forEach((m) => m.alCuadro(t, dt)); // todos: los objetos y las pelotas siguen vivos
    const html = activo.panel();
    if (html !== panelAntes) { $('panel').innerHTML = html; panelAntes = html; }
    $('botones').querySelectorAll('[data-k]').forEach((b) => { b.disabled = !!activo.botones[+b.dataset.k].apagado?.(); });
    $('estado').textContent = ar.modo === 'simulado' ? 'Vista previa' : ar.mira.visible ? (ar.mira.horizontal ? 'Superficie ✓' : 'Pared') : 'Buscando superficies…';
    $('estado').classList.toggle('visto', ar.mira.visible);
  });

  $('inicio').hidden = true;
  $('overlay').hidden = false;
  document.body.classList.add('en-ar');
  elegir(0);
  try {
    if (enAR) await ar.iniciarAR($('overlay'), { alTerminar: salir });
    else ar.iniciarSimulado();
  } catch (err) {
    salir();
    mostrarError(err);
  }
}

function mostrarError(err) {
  console.error(err);
  const textos = {
    NotSupportedError: 'Este celular no pudo iniciar la realidad aumentada (WebXR). Prueba la vista previa.',
    SecurityError: 'La realidad aumentada necesita una página segura (https).',
    NotAllowedError: 'No se dio permiso para la cámara o la realidad aumentada.',
  };
  $('mensaje').textContent = textos[err?.name] ?? `Algo falló: ${err?.message ?? err}`;
  $('mensaje').hidden = false;
}

function elegir(i) {
  activo = modos[i];
  modos.forEach((m) => { m.activo = m === activo; });
  ar.manejador = activo;
  $('modos').querySelectorAll('.filtro').forEach((b, k) => b.classList.toggle('activo', k === i));
  $('ayuda').textContent = activo.ayuda;
  const p = activo.paleta;
  $('paleta').hidden = !p;
  $('paleta').innerHTML = p ? p.opciones.map((o) => `<button class="filtro ${o.id === p.elegido() ? 'activo' : ''}" data-id="${o.id}">${o.texto}</button>`).join('') : '';
  $('paleta').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    p.elegir(b.dataset.id);
    $('paleta').querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
  }));
  $('botones').innerHTML = activo.botones.map((b, k) => `<button class="btn btn-sec" data-k="${k}">${b.texto}</button>`).join('');
  $('botones').querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => activo.botones[+b.dataset.k].accion()));
}

function salir() {
  if (!ar) return;
  const viejo = ar;
  ar = null;
  viejo.terminar();
  $('inicio').hidden = false;
  $('overlay').hidden = true;
  document.body.classList.remove('en-ar');
}

$('btnAR').addEventListener('click', () => iniciar(true));
$('btnSimular').addEventListener('click', () => iniciar(false));
$('btnSalir').addEventListener('click', salir);
