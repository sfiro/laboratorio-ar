// Pantalla «Mis objetos 3D»: elegir un marcador, subir tu modelo y ajustarlo viendo cómo quedará.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  AJUSTES_INICIALES, LADOS_ARRIBA, EJES_GIRO, completarAjustes, guardarObjeto, borrarObjeto, leerTodos, registroDesdeArchivos,
  guardarEnProyecto, quitarDelProyecto,
  cargarModelo, montar, ambienteDeHabitacion, pedirGuardadoPermanente,
} from './mis-objetos.js';
import { NOMBRES_DE_FABRICA } from './contenido.js';
import { MOVIMIENTOS, DEFORMACIONES, EJES_DEFORMAR } from './animaciones.js';

const $ = (id) => document.getElementById(id);
const CANTIDAD = 8;
const DESARROLLO = import.meta.env.DEV; // con npm run dev se puede guardar en el proyecto
const ETIQUETA = { proyecto: 'del proyecto', tuyo: 'solo aquí' };
let registros = new Map(); // id de marcador → registro guardado
let vista = null;          // la vista previa 3D (se crea una sola vez)
let actual = null;         // { id, registro, montado }

export async function abrirMisObjetos() {
  $('inicio').hidden = true;
  $('misObjetos').hidden = false;
  window.scrollTo(0, 0);
  await refrescarLista();
}

function cerrar() {
  cerrarEditor();
  $('misObjetos').hidden = true;
  $('inicio').hidden = false;
}

async function refrescarLista() {
  registros = await leerTodos();
  const lista = $('listaObjetos');
  lista.innerHTML = '';
  for (let id = 0; id < CANTIDAD; id++) {
    const r = registros.get(id);
    const b = document.createElement('button');
    b.className = 'tarjeta-objeto' + (r ? ` propia ${r.origen}` : '');
    b.innerHTML = `<img src="./marcadores/marcador-${id}.svg" alt="" /><span class="num">ID ${id}</span>
      <span class="nom">${r ? escapar(r.nombre) : NOMBRES_DE_FABRICA[id]}</span><span class="tipo">${r ? ETIQUETA[r.origen] : 'genérico'}</span>`;
    b.addEventListener('click', () => abrirEditor(id));
    lista.append(b);
  }
}

const escapar = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ───────────────────────── Editor de un marcador ─────────────────────────
async function abrirEditor(id) {
  $('listaObjetos').hidden = true;
  $('editor').hidden = false;
  $('editorTitulo').textContent = `Marcador ${id}`;
  $('editorMarcador').src = `./marcadores/marcador-${id}.svg`;
  aviso('');
  crearVista();
  actual = { id, registro: registros.get(id) ?? null, montado: null };
  await mostrarActual();
}

function cerrarEditor() {
  quitarDeVista();
  actual = null;
  $('editor').hidden = true;
  $('listaObjetos').hidden = false;
  vista?.renderer.setAnimationLoop(null);
}

async function mostrarActual() {
  quitarDeVista();
  elegirZona(false);
  const r = actual.registro;
  $('ajustes').hidden = !r;
  const tuyo = r?.origen === 'tuyo';
  // Quitar: lo de este navegador siempre; lo del proyecto, solo con npm run dev
  $('btnQuitar').hidden = !r || (!tuyo && !DESARROLLO);
  $('btnQuitar').textContent = tuyo ? (r.debajo ? '↩︎ Volver al del proyecto' : '🗑️ Quitar') : '🗑️ Quitar del proyecto';
  $('btnGuardarProyecto').hidden = !(DESARROLLO && tuyo);
  $('editorNombre').textContent = r ? `${r.nombre} (${ETIQUETA[r.origen]})` : `${NOMBRES_DE_FABRICA[actual.id]} (genérico)`;
  vista.marcador.material.map = vista.texturas[actual.id];
  vista.marcador.material.needsUpdate = true;
  vista.renderer.setAnimationLoop(dibujarVista);
  if (!r) return;
  aviso('Cargando el modelo…');
  try {
    const leido = await cargarModelo(r);
    if (actual?.registro !== r) return; // cambiaste de marcador mientras cargaba
    actual.montado = montar(leido, r.ajustes);
    actual.montado.mostrarEje(true);
    vista.soporte.add(actual.montado.objeto);
    llenarAjustes(r.ajustes, leido.clips);
    const avisos = [];
    if (leido.faltan.length) avisos.push(`Faltan archivos: ${leido.faltan.join(', ')}. Elígelos junto con el modelo.`);
    if (leido.triangulos > 300000) avisos.push(`Tiene ${leido.triangulos.toLocaleString('es')} triángulos: en el celular puede ir lento. Mejor menos de 100 000.`);
    aviso(avisos.join(' '), avisos.length > 0);
    $('editorInfo').textContent = `${leido.triangulos.toLocaleString('es')} triángulos · ${leido.clips.length} ${leido.clips.length === 1 ? 'animación' : 'animaciones'} · ${peso(r)}`;
  } catch (err) {
    console.error(err);
    aviso(`No pude leer el modelo: ${err?.message ?? err}`, true);
  }
}

function peso(r) {
  if (!r.archivos.every((a) => a.blob)) return 'en el proyecto'; // los del proyecto están en el servidor
  const bytes = r.archivos.reduce((s, a) => s + a.blob.size, 0);
  return bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

function aviso(texto, problema = false) {
  $('editorAviso').textContent = texto;
  $('editorAviso').hidden = !texto;
  $('editorAviso').classList.toggle('problema', problema);
  if (!texto) $('editorInfo').textContent = '';
}

function quitarDeVista() {
  if (!actual?.montado) return;
  vista.soporte.remove(actual.montado.objeto);
  actual.montado.objeto.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat()) { if (!m) continue; for (const v of Object.values(m)) v?.isTexture && v.dispose(); m.dispose(); }
  });
  actual.montado = null;
}

// Los controles: tamaño, altura, qué lado va arriba, giro, inclinaciones y movimiento
const DESLIZADORES = { ajTamano: 'tamano', ajAltura: 'altura', ajGiro: 'giro', ajInclinarX: 'inclinarX', ajInclinarZ: 'inclinarZ',
  ajVelocidad: 'velocidad', ajRitmo: 'ritmo', ajRadio: 'radio', ajFuerza: 'fuerza', ajRitmoDeformar: 'ritmoDeformar' };
const opcion = (sel, valor, texto) => sel.append(Object.assign(document.createElement('option'), { value: valor, textContent: texto }));

function llenarAjustes(ajustes, clips) {
  const a = completarAjustes(ajustes);
  $('ajTamano').value = a.tamano; $('ajAltura').value = a.altura; $('ajGiro').value = a.giro;
  $('ajInclinarX').value = a.inclinarX; $('ajInclinarZ').value = a.inclinarZ; $('ajVelocidad').value = a.velocidad;
  $('ajArriba').value = a.arriba; $('ajEje').value = a.eje;
  $('ajRitmo').value = a.ritmo; $('ajRadio').value = a.radio; $('ajFuerza').value = a.fuerza; $('ajRitmoDeformar').value = a.ritmoDeformar;
  $('ajDeformar').value = a.deformar; $('ajEjeDeformar').value = a.ejeDeformar;
  const sel = $('ajAnimacion');
  sel.innerHTML = '';
  opcion(sel, 'auto', clips.length ? 'Automática (la del modelo)' : 'Automática (girar)');
  clips.forEach((c, i) => opcion(sel, `clip:${i}`, `Del modelo: ${c.name || `animación ${i + 1}`}`));
  for (const [valor, texto] of Object.entries(MOVIMIENTOS)) opcion(sel, valor, texto);
  sel.value = a.animacion === 'clip' ? `clip:${a.clip}` : a.animacion;
  if (!sel.value) sel.value = 'auto';
  actual.tieneClips = clips.length > 0;
  mostrarValores();
}

function leerAjustes() {
  const anim = $('ajAnimacion').value;
  return {
    tamano: +$('ajTamano').value, altura: +$('ajAltura').value, arriba: $('ajArriba').value,
    giro: +$('ajGiro').value, inclinarX: +$('ajInclinarX').value, inclinarZ: +$('ajInclinarZ').value,
    animacion: anim.startsWith('clip:') ? 'clip' : anim, clip: anim.startsWith('clip:') ? +anim.slice(5) : 0,
    eje: $('ajEje').value, velocidad: +$('ajVelocidad').value, ritmo: +$('ajRitmo').value,
    deformar: $('ajDeformar').value, radio: +$('ajRadio').value, fuerza: +$('ajFuerza').value,
    ejeDeformar: $('ajEjeDeformar').value, ritmoDeformar: +$('ajRitmoDeformar').value,
  };
}

function mostrarValores() {
  $('vTamano').textContent = `${(+$('ajTamano').value).toFixed(2)}×`;
  $('vAltura').textContent = (+$('ajAltura').value).toFixed(2);
  for (const k of ['Giro', 'InclinarX', 'InclinarZ']) $(`v${k}`).textContent = `${$(`aj${k}`).value}°`;
  const v = +$('ajVelocidad').value;
  $('vVelocidad').textContent = v ? `${Math.abs((v * 60) / (2 * Math.PI)).toFixed(1)} vueltas/min ${v > 0 ? '↺' : '↻'}` : 'quieto';
  // El eje y la velocidad solo importan si el objeto gira
  const anim = $('ajAnimacion').value;
  $('cajaGiro').hidden = !(anim === 'girar' || (anim === 'auto' && !actual?.tieneClips));
  $('filaRitmo').hidden = !['flotar', 'respirar', 'saltar', 'balancear'].includes(anim);
  $('vRitmo').textContent = `${(+$('ajRitmo').value).toFixed(1)}×`;
  // Mover una parte
  const def = $('ajDeformar').value, saluda = def === 'saludar';
  $('cajaDeformar').hidden = def === 'ninguna';
  for (const id of ['filaZona', 'filaRadio', 'filaEjeDeformar']) $(id).hidden = !saluda;
  $('vRadio').textContent = (+$('ajRadio').value).toFixed(2);
  $('vFuerza').textContent = saluda ? `${$('ajFuerza').value}°` : `${$('ajFuerza').value}`;
  $('vRitmoDeformar').textContent = `${(+$('ajRitmoDeformar').value).toFixed(1)}×`;
  actual?.montado?.resaltarZona(saluda);
}

let guardando = null;
function alCambiarAjuste() {
  if (!actual?.registro) return;
  mostrarValores();
  // "punto" (la parte que tocaste) no tiene control propio: se conserva
  actual.registro.ajustes = { ...actual.registro.ajustes, ...leerAjustes() };
  actual.montado?.aplicar(actual.registro.ajustes);
  // Guardamos un momento después de que dejes de mover el control
  clearTimeout(guardando);
  const r = actual.registro;
  guardando = setTimeout(() => {
    // Los del proyecto, en desarrollo, se guardan en el proyecto; si no, en este navegador
    const guardar = r.origen === 'proyecto' && DESARROLLO ? guardarEnProyecto(r) : guardarEnNavegador(r);
    guardar.catch((e) => aviso(`No se pudo guardar: ${e.message}`, true));
  }, 300);
}

/** Guarda en este navegador (un objeto del proyecto con tus ajustes también queda «solo aquí») */
async function guardarEnNavegador(r) {
  const { debajo, ...limpio } = r;
  if (limpio.origen === 'proyecto') { r.debajo = { ...limpio }; limpio.origen = 'tuyo'; r.origen = 'tuyo'; }
  await guardarObjeto(limpio);
  if (actual?.registro === r) mostrarBotones(r);
}

function mostrarBotones(r) {
  $('btnQuitar').hidden = false;
  $('btnQuitar').textContent = r.debajo ? '↩︎ Volver al del proyecto' : '🗑️ Quitar';
  $('btnGuardarProyecto').hidden = !DESARROLLO;
  $('editorNombre').textContent = `${r.nombre} (${ETIQUETA[r.origen]})`;
}

async function alElegirArchivos(lista) {
  if (!lista?.length || !actual) return;
  try {
    const nuevo = registroDesdeArchivos(actual.id, lista);
    aviso('Guardando…');
    await guardarObjeto(nuevo);
    pedirGuardadoPermanente();
    nuevo.debajo = registros.get(actual.id)?.origen === 'proyecto' ? registros.get(actual.id) : registros.get(actual.id)?.debajo;
    registros.set(actual.id, nuevo);
    actual.registro = nuevo;
    await mostrarActual();
  } catch (err) {
    aviso(err.message, true);
  }
}

// ───────────────────────── Tocar la parte que se mueve ─────────────────────────
let eligiendo = false;
function elegirZona(v) {
  eligiendo = v;
  $('btnElegirZona').classList.toggle('eligiendo', v);
  $('btnElegirZona').textContent = v ? '✋ Ahora toca el modelo…' : '👆 Tocar la parte que se mueve';
  $('vistaPrevia').classList.toggle('eligiendo', v);
  if (v) $('vistaPrevia').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Un toque (no un arrastre) sobre la vista previa: buscamos qué punto del modelo tocaste */
function alTocarVista(x, y) {
  if (!eligiendo || !actual?.montado) return;
  const caja = vista.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((x - caja.left) / caja.width) * 2 - 1, -((y - caja.top) / caja.height) * 2 + 1);
  const rayo = new THREE.Raycaster();
  rayo.setFromCamera(ndc, vista.camara);
  const golpe = rayo.intersectObject(actual.montado.objeto, true).find((g) => g.object.isMesh);
  if (!golpe) return aviso('No tocaste el modelo. Intenta otra vez.', true);
  aviso('');
  actual.registro.ajustes = { ...actual.registro.ajustes, punto: actual.montado.aCoordenadasModelo(golpe.point) };
  elegirZona(false);
  alCambiarAjuste();
}

// ───────────────────────── Vista previa 3D ─────────────────────────
// Se ve el marcador en el piso y el objeto encima, tal como saldrá en la cámara.
function crearVista() {
  if (vista) { ajustarVista(); return; }
  const lienzo = $('vistaPrevia');
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  camara.position.set(1.4, 1.3, 1.8);
  const controles = new OrbitControls(camara, lienzo);
  controles.target.set(0, 0.3, 0);
  controles.enableDamping = true;
  // Distinguir un toque de un arrastre (el arrastre gira la vista)
  let inicio = null;
  lienzo.addEventListener('pointerdown', (e) => { inicio = [e.clientX, e.clientY]; });
  lienzo.addEventListener('pointerup', (e) => {
    if (inicio && Math.hypot(e.clientX - inicio[0], e.clientY - inicio[1]) < 8) alTocarVista(e.clientX, e.clientY);
    inicio = null;
  });
  ambienteDeHabitacion(renderer).then((t) => { escena.environment = t; escena.environmentIntensity = 0.6; });
  const sol = new THREE.DirectionalLight('#fff', 2.2);
  sol.position.set(0.3, 1, 1);
  escena.add(new THREE.HemisphereLight('#fff', '#556070', 1.8), sol);
  // El marcador: la parte negra mide 1 (el SVG mide 900 y su borde negro 700)
  const texturas = [];
  const cargador = new THREE.TextureLoader();
  for (let id = 0; id < CANTIDAD; id++) {
    const t = cargador.load(`./marcadores/marcador-${id}.svg`);
    t.colorSpace = THREE.SRGBColorSpace;
    texturas.push(t);
  }
  const marcador = new THREE.Mesh(new THREE.PlaneGeometry(900 / 700, 900 / 700), new THREE.MeshBasicMaterial({ map: texturas[0] }));
  marcador.rotation.x = -Math.PI / 2;
  const soporte = new THREE.Group();
  escena.add(marcador, soporte, new THREE.GridHelper(4, 16, '#3a4255', '#252b38').translateY(-0.002));
  const reloj = new THREE.Timer();
  vista = { renderer, escena, camara, controles, marcador, soporte, texturas, reloj };
  ajustarVista();
  window.addEventListener('resize', ajustarVista);
}

function ajustarVista() {
  const lienzo = vista.renderer.domElement;
  const w = lienzo.clientWidth, h = lienzo.clientHeight;
  if (!w || !h) return;
  vista.renderer.setSize(w, h, false);
  vista.camara.aspect = w / h;
  vista.camara.updateProjectionMatrix();
}

function dibujarVista(ahora) {
  vista.reloj.update(ahora);
  const lienzo = vista.renderer.domElement;
  if (lienzo.width !== Math.round(lienzo.clientWidth * vista.renderer.getPixelRatio())) ajustarVista();
  actual?.montado?.animar(vista.reloj.getElapsed(), Math.min(vista.reloj.getDelta(), 0.1));
  vista.controles.update();
  vista.renderer.render(vista.escena, vista.camara);
}

// ───────────────────────── Conectar los botones ─────────────────────────
export function prepararMisObjetos({ alProbar }) {
  $('btnMisObjetos').addEventListener('click', abrirMisObjetos);
  $('btnCerrarObjetos').addEventListener('click', cerrar);
  $('btnVolverLista').addEventListener('click', () => { cerrarEditor(); refrescarLista(); });
  // Sin "accept": los celulares no conocen tipos como .stl o .glb y no dejarían elegirlos.
  // Revisamos el formato después de elegir.
  $('archivoModelo').addEventListener('change', (e) => { alElegirArchivos(e.target.files); e.target.value = ''; });
  for (const [valor, { texto }] of Object.entries(LADOS_ARRIBA)) opcion($('ajArriba'), valor, texto);
  for (const [valor, { texto }] of Object.entries(EJES_GIRO)) opcion($('ajEje'), valor, texto);
  for (const [valor, texto] of Object.entries(DEFORMACIONES)) opcion($('ajDeformar'), valor, texto);
  for (const [valor, { texto }] of Object.entries(EJES_DEFORMAR)) opcion($('ajEjeDeformar'), valor, texto);
  for (const id of [...Object.keys(DESLIZADORES), 'ajArriba', 'ajAnimacion', 'ajEje', 'ajDeformar', 'ajEjeDeformar']) $(id).addEventListener('input', alCambiarAjuste);
  $('btnElegirZona').addEventListener('click', () => elegirZona(!eligiendo));
  // Tocar dos veces un deslizador lo devuelve a su valor inicial
  for (const [id, clave] of Object.entries(DESLIZADORES)) $(id).addEventListener('dblclick', (e) => {
    e.target.value = AJUSTES_INICIALES[clave];
    alCambiarAjuste();
  });
  $('btnReiniciar').addEventListener('click', () => {
    if (!actual?.registro) return;
    llenarAjustes(AJUSTES_INICIALES, []);
    alCambiarAjuste();
    mostrarActual();
  });
  $('btnQuitar').addEventListener('click', async () => {
    const r = actual?.registro;
    if (!r) return;
    const tuyo = r.origen === 'tuyo';
    const pregunta = tuyo
      ? `¿Quitar «${r.nombre}» de este navegador? ${r.debajo ? 'Volverá el del proyecto.' : 'Volverá el genérico.'}`
      : `¿Quitar «${r.nombre}» del proyecto? Se borran sus archivos de public/objetos/${actual.id}/.`;
    if (!confirm(pregunta)) return;
    try {
      if (tuyo) await borrarObjeto(actual.id); else await quitarDelProyecto(actual.id);
    } catch (e) { return aviso(`No se pudo quitar: ${e.message}`, true); }
    registros = await leerTodos();
    actual.registro = registros.get(actual.id) ?? null;
    await mostrarActual();
  });
  $('btnGuardarProyecto').addEventListener('click', async () => {
    const r = actual?.registro;
    if (!r) return;
    aviso('Guardando en el proyecto…');
    try {
      clearTimeout(guardando);
      await guardarEnProyecto(r);
      await borrarObjeto(actual.id); // ya está en el proyecto: la copia de este navegador sobra
      registros = await leerTodos();
      actual.registro = registros.get(actual.id) ?? null;
      await mostrarActual();
      aviso(`Guardado en public/objetos/${actual.id}/. Publícalo para que salga en cualquier celular.`);
    } catch (e) {
      aviso(`No se pudo guardar en el proyecto: ${e.message}`, true);
    }
  });
  $('btnProbar').addEventListener('click', () => { cerrar(); alProbar(); });
}
