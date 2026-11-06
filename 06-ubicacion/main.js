// Nivel 6 · AR por ubicación
import { RealidadPorUbicacion, cardinal } from './puente-ubicacion.js';
import { tesoros, lugares, cielo, marcas, dibujarRadar, prepararSonido } from './modos.js';

const $ = (id) => document.getElementById(id);
let ar = null, modos = [], activo = null;

// Lugar de la simulación: ?simular=lat,lon (por defecto, el Zócalo de la Ciudad de México)
function lugarSimulado() {
  const [lat, lon] = (new URLSearchParams(location.search).get('simular') ?? '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : { lat: 19.4326, lon: -99.1332 };
}

async function iniciar(simular) {
  prepararSonido(); // el audio también necesita un toque para arrancar
  $('mensaje').hidden = true;
  ar = new RealidadPorUbicacion($('ar'));

  modos = [tesoros(ar), lugares(ar), cielo(ar), marcas(ar)];
  for (const m of modos) m.objetos.forEach((o) => ar.escena.add(o));
  $('modos').innerHTML = modos.map((m, i) => `<button class="filtro" data-i="${i}">${m.nombre}</button>`).join('');
  $('modos').querySelectorAll('.filtro').forEach((b) => b.addEventListener('click', () => elegir(+b.dataset.i)));
  if (import.meta.env.DEV) { window.__ar = ar; window.__modos = modos; } // solo en desarrollo, para probar

  let panelAntes = '';
  ar.alCuadro.push((t, dt) => {
    if (!activo) return;
    activo.alCuadro(t, dt);
    const g = ar.gps;
    $('chipGps').textContent = `GPS ±${Math.round(g.precision)} m`;
    $('chipGps').className = 'chip ' + (g.precision <= 15 ? 'bien' : g.precision <= 40 ? 'regular' : 'mal');
    $('chipRumbo').textContent = `🧭 ${Math.round(ar.rumbo)}° ${cardinal(ar.rumbo)}`;
    const html = activo.panel();
    if (html !== panelAntes) { $('panel').innerHTML = html; panelAntes = html; } // solo si cambió
    dibujarRadar($('radar'), ar, activo);
  });

  $('inicio').hidden = true;
  $('controles').hidden = false;
  $('controlesSim').hidden = !simular;
  document.body.classList.add('en-ar');
  try {
    await ar.iniciar({ simular: simular ? lugarSimulado() : null, estado: (t) => { $('ayuda').textContent = t || activo?.ayuda || ''; } });
    elegir(0);
    $('panel').hidden = false;
    $('radar').hidden = false;
  } catch (err) {
    console.error(err);
    salir();
    const textos = {
      NotAllowedError: 'Diste "No permitir" a la cámara. Actívala en los ajustes del navegador y recarga.',
      NotFoundError: 'No se encontró una cámara trasera. Prueba la simulación.',
      SinGps: 'Sin permiso para la ubicación. Actívala en los ajustes del navegador y recarga.',
      GpsFalla: 'No se pudo obtener la ubicación. Revisa que el GPS esté encendido y vuelve a intentar.',
      SinBrujula: 'Sin permiso para el movimiento del celular (la brújula). Recarga y toca «Permitir».',
    };
    $('mensaje').textContent = textos[err.name] ?? `Algo falló: ${err?.message ?? err}`;
    $('mensaje').hidden = false;
  }
}

function elegir(i) {
  activo = modos[i];
  modos.forEach((m) => m.objetos.forEach((o) => { o.visible = m === activo; }));
  activo.activar?.();
  $('modos').querySelectorAll('.filtro').forEach((b, k) => b.classList.toggle('activo', k === i));
  $('ayuda').textContent = activo.ayuda;
  $('botonesModo').innerHTML = '';
  for (const { texto, accion } of activo.botones) {
    const b = Object.assign(document.createElement('button'), { className: 'btn btn-sec', textContent: texto });
    b.addEventListener('click', accion);
    $('botonesModo').append(b);
  }
  $('radar').hidden = !activo.radar;
}

function salir() {
  ar?.detener();
  ar = null;
  activo = null;
  $('inicio').hidden = false;
  $('controles').hidden = true;
  $('controlesSim').hidden = true;
  $('panel').hidden = true;
  $('radar').hidden = true;
  document.body.classList.remove('en-ar');
}

$('btnIniciar').addEventListener('click', () => iniciar(false));
$('btnSimular').addEventListener('click', () => iniciar(true));
$('btnSalir').addEventListener('click', salir);

// Botones de la simulación: se mantienen apretados para caminar o girar
const accionesSim = { adelante: { adelante: 1 }, atras: { adelante: -1 }, izq: { giro: -1 }, der: { giro: 1 } };
document.querySelectorAll('[data-sim]').forEach((b) => {
  const quieto = { adelante: 0, giro: 0 };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); ar?.simular(accionesSim[b.dataset.sim]); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => ar?.simular(quieto));
});
