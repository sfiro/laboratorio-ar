// Nivel 4 · Filtros de cara
import { RealidadDeCara } from './puente-cara.js';
import { fiesta, neon, dragon, datos } from './filtros.js';

const $ = (id) => document.getElementById(id);
let ar = null, filtros = [], activo = null;

async function iniciar() {
  $('mensaje').hidden = true;
  ar = new RealidadDeCara($('ar'));

  filtros = [fiesta(ar), neon(ar), dragon(ar), datos(ar, $('panel-datos'))];
  for (const f of filtros) {
    f.enCara?.forEach((o) => ar.cara.grupo.add(o));
    f.enPantalla?.forEach((o) => ar.escena.add(o));
  }
  $('filtros').innerHTML = filtros.map((f, i) => `<button class="filtro" data-i="${i}">${f.nombre}</button>`).join('');
  $('filtros').querySelectorAll('.filtro').forEach((b) => b.addEventListener('click', () => elegir(+b.dataset.i)));
  elegir(0);

  // En cada cuadro: solo corre el filtro activo, y lo que sigue la cara se oculta si no hay cara
  ar.alCuadro.push((t, dt, cara) => {
    activo.alCuadro(t, dt);
    for (const o of activo.enPantalla ?? []) if (o.userData.sigueCara) o.visible = cara.visible;
    $('estado').textContent = cara.visible ? 'Cara detectada' : 'Sin cara';
    $('estado').classList.toggle('visto', cara.visible);
  });

  $('inicio').hidden = true;
  $('controles').hidden = false;
  document.body.classList.add('en-ar');
  try {
    await ar.iniciar({ estado: (t) => { $('ayuda').textContent = t || activo.ayuda; } });
  } catch (err) {
    salir();
    const textos = {
      NotAllowedError: 'Diste "No permitir" a la cámara. Actívala en los ajustes del navegador y recarga.',
      NotFoundError: 'No se encontró una cámara frontal.',
    };
    $('mensaje').textContent = textos[err.name] ?? `Algo falló: ${err.message}`;
    $('mensaje').hidden = false;
  }
}

function elegir(i) {
  activo = filtros[i];
  filtros.forEach((f) => {
    const on = f === activo;
    [...(f.enCara ?? []), ...(f.enPantalla ?? [])].forEach((o) => { o.visible = on; });
  });
  $('filtros').querySelectorAll('.filtro').forEach((b, k) => b.classList.toggle('activo', k === i));
  $('ayuda').textContent = activo.ayuda;
  $('panel-datos').hidden = !activo.panel;
}

function salir() {
  ar?.detener();
  ar = null;
  $('inicio').hidden = false;
  $('controles').hidden = true;
  $('panel-datos').hidden = true;
  document.body.classList.remove('en-ar');
}

// ---------------------------------------------------------------------------
// Foto
// ---------------------------------------------------------------------------
let archivoFoto = null;
$('btnFoto').addEventListener('click', async () => {
  const blob = await ar.foto();
  archivoFoto = new File([blob], 'filtro-ar.png', { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  $('foto').src = url;
  $('btnGuardar').href = url;
  $('btnCompartir').hidden = !navigator.canShare?.({ files: [archivoFoto] });
  $('vista-foto').hidden = false;
});
$('btnCerrarFoto').addEventListener('click', () => { $('vista-foto').hidden = true; });
$('btnCompartir').addEventListener('click', () => navigator.share({ files: [archivoFoto] }).catch(() => {}));

$('btnIniciar').addEventListener('click', iniciar);
$('btnSalir').addEventListener('click', salir);
