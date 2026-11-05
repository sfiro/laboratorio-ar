// Nivel 5 · Manos
import { RealidadDeManos } from './puente-manos.js';
import { lanzar, pintar, burbujas, gestos } from './experiencias.js';

const $ = (id) => document.getElementById(id);
let ar = null, experiencias = [], activa = null, frontal = false;

async function iniciar(usarFrontal) {
  frontal = usarFrontal;
  $('mensaje').hidden = true;
  ar = new RealidadDeManos($('ar'));

  experiencias = [lanzar(ar), pintar(ar), burbujas(ar, $('panel')), gestos(ar, $('panel'))];
  for (const e of experiencias) e.objetos.forEach((o) => ar.escena.add(o));
  $('experiencias').innerHTML = experiencias.map((e, i) => `<button class="filtro" data-i="${i}">${e.nombre}</button>`).join('');
  $('experiencias').querySelectorAll('.filtro').forEach((b) => b.addEventListener('click', () => elegir(+b.dataset.i)));
  elegir(0);
  if (import.meta.env.DEV) { window.__ar = ar; window.__experiencias = experiencias; } // solo en desarrollo, para probar desde la consola

  // En cada cuadro solo corre la experiencia activa
  ar.alCuadro.push((t, dt, manos) => {
    activa.alCuadro(t, dt, manos);
    const n = manos.filter((m) => m.visible).length;
    $('estado').textContent = n === 0 ? 'Sin manos' : n === 1 ? '1 mano' : '2 manos';
    $('estado').classList.toggle('visto', n > 0);
  });

  $('inicio').hidden = true;
  $('controles').hidden = false;
  document.body.classList.add('en-ar');
  try {
    await ar.iniciar({ frontal, estado: (t) => { $('ayuda').textContent = t || activa.ayuda; } });
  } catch (err) {
    console.error(err);
    salir();
    const textos = {
      NotAllowedError: 'Diste "No permitir" a la cámara. Actívala en los ajustes del navegador y recarga.',
      NotFoundError: 'No se encontró esa cámara. Prueba con la otra.',
      OverconstrainedError: 'No se encontró esa cámara. Prueba con la otra.',
    };
    $('mensaje').textContent = textos[err.name] ?? `Algo falló: ${err?.message ?? err}`;
    $('mensaje').hidden = false;
  }
}

function elegir(i) {
  activa?.desactivar?.();
  activa = experiencias[i];
  experiencias.forEach((e) => e.objetos.forEach((o) => { o.visible = e === activa; }));
  activa.activar?.();
  $('experiencias').querySelectorAll('.filtro').forEach((b, k) => b.classList.toggle('activo', k === i));
  $('ayuda').textContent = activa.ayuda;
  $('panel').hidden = !activa.panel;
  $('panel').className = 'panel-datos panel-' + activa.nombre.toLowerCase();
  $('btnReiniciar').hidden = !activa.reiniciar;
}

function salir() {
  ar?.detener();
  ar = null;
  activa = null;
  $('inicio').hidden = false;
  $('controles').hidden = true;
  $('panel').hidden = true;
  document.body.classList.remove('en-ar');
}

$('btnTrasera').addEventListener('click', () => iniciar(false));
$('btnFrontal').addEventListener('click', () => iniciar(true));
$('btnSalir').addEventListener('click', salir);
$('btnReiniciar').addEventListener('click', () => activa?.reiniciar?.());
$('btnCamara').addEventListener('click', () => {
  const i = experiencias.indexOf(activa);
  salir();
  iniciar(!frontal).then(() => i > 0 && elegir(i));
});
