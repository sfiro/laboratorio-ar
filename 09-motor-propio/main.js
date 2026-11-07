// Nivel 9 · Nuestro propio motor de AR
import * as THREE from 'three';
import { MotorPropio } from './motor.js';
import { DetectorDeMarcadores } from './marcadores.js';
import { contenidoMarcador, contenidoImagen } from './contenido.js';
import { leerObjetos, cargarModelo, montar, ambienteDeHabitacion } from './mis-objetos.js';
import { prepararMisObjetos } from './editor-objetos.js';

const $ = (id) => document.getElementById(id);
let motor = null, modo = null;

// OpenCV.js es grande: solo se descarga si eliges el modo de imagen
async function cargarOpenCV() {
  const modulo = (await import('@techstark/opencv-js')).default;
  if (modulo instanceof Promise || typeof modulo.then === 'function') return await modulo;
  if (modulo.Mat) return modulo;
  await new Promise((ok) => { modulo.onRuntimeInitialized = ok; });
  return modulo;
}

async function empezar(nuevoModo) {
  modo = nuevoModo;
  $('mensaje').hidden = true;
  $('inicio').hidden = true;
  for (const id of ['hudArriba', 'datos', 'controles']) $(id).hidden = false;
  document.body.classList.add('en-ar');
  const estado = (t) => { $('ayuda').textContent = t || (modo === 'marcadores' ? 'Apunta a uno o varios marcadores impresos.' : 'Apunta a la tarjeta del nivel 8.'); };
  try {
    motor = new MotorPropio($('ar'));
    let detector, alto = 1;
    const propios = new Map(), fallos = []; // id de marcador → tu objeto (de «Mis objetos 3D»)
    if (modo === 'marcadores') {
      detector = new DetectorDeMarcadores();
      const registros = await leerObjetos().catch(() => []);
      for (const r of registros) {
        estado(`Cargando tus objetos… (${r.nombre})`);
        try { propios.set(r.id, { ...montar(await cargarModelo(r), r.ajustes), nombre: r.nombre }); } catch (e) { console.error(e); fallos.push(r.nombre); }
      }
    } else {
      estado('Descargando OpenCV.js (≈ 10 MB)…');
      const cv = await cargarOpenCV();
      estado('Analizando la imagen de referencia…');
      const img = new Image();
      img.src = './objetivos/casa.png';
      await img.decode();
      const { SeguidorDeImagen } = await import('./imagenes.js');
      detector = new SeguidorDeImagen(cv, img);
      alto = detector.alto;
    }
    // Luces en la escena (no dentro de las anclas: aprendido en el nivel 8)
    const sol = new THREE.DirectionalLight('#fff', 2.2);
    sol.position.set(0.3, 1, 1);
    motor.escena.add(new THREE.HemisphereLight('#fff', '#556070', 1.8), sol);
    const animaciones = new Map();
    motor.alCrearAncla = (clave, ancla, r) => {
      const c = modo === 'marcadores' ? contenidoMarcador(r.id, propios.get(r.id)) : contenidoImagen(alto);
      ancla.grupo.add(c.objeto);
      animaciones.set(clave, c.animar);
    };
    motor.alCuadro.push((t, dt) => {
      for (const [clave, animar] of animaciones) animar(t, dt);
      const visibles = [...motor.anclas.values()].filter((a) => a.visible).length;
      $('estado').textContent = visibles ? (modo === 'marcadores' ? `${visibles} marcador${visibles > 1 ? 'es' : ''}` : 'Imagen ✓') : 'Buscando…';
      $('estado').classList.toggle('visto', visibles > 0);
      $('datos').innerHTML = datos(detector);
    });
    await motor.iniciar({ detector, estado });
    // Reflejos de una habitación: así los materiales metálicos de tus modelos no se ven negros
    if (propios.size) { motor.escena.environment = await ambienteDeHabitacion(motor.renderer); motor.escena.environmentIntensity = 0.6; }
    if (fallos.length) estado(`No pude cargar: ${fallos.join(', ')}. Se usa el objeto de fábrica.`);
    if (import.meta.env.DEV) { window.__motor = motor; } // solo para probar
  } catch (err) {
    console.error(err);
    salir();
    $('mensaje').textContent = err.name === 'NotAllowedError'
      ? 'Diste "No permitir" a la cámara. Actívala en los ajustes del navegador y recarga.'
      : `Algo falló: ${err?.message ?? err}`;
    $('mensaje').hidden = false;
  }
}

// Panel con los números del motor
function datos(d) {
  const e = motor.estadisticas;
  const fila = (k, v) => `<div class="fila"><span>${k}</span><b>${v}</b></div>`;
  const ms = (v) => `${(v ?? 0).toFixed(1)} ms`;
  const comunes = fila('Cuadros por segundo', e.fps.toFixed(0)) + fila('Proceso por cuadro', ms(e.ms)) + fila('Resolución', `${motor.pw ?? 0}×${motor.ph ?? 0}`);
  if (modo === 'marcadores') {
    const i = d.info ?? {};
    return comunes + fila('Umbral', ms(i.umbral)) + fila('Regiones y contornos', ms(i.contornos)) + fila('Código y pose', ms(i.codigoYPose))
      + fila('Candidatos (cuadros)', i.candidatos ?? 0) + fila('Marcadores', i.marcadores ?? 0);
  }
  const i = d.info ?? {};
  return comunes + fila('Fase', i.fase === 'seguir' ? 'seguir (flujo óptico)' : 'buscar (ORB)') + fila('Puntos de la referencia', i.puntosReferencia ?? 0)
    + fila('Puntos en el cuadro', i.puntosCuadro ?? 0) + fila('Parejas (Lowe)', i.parejas ?? 0) + fila('Buenas (RANSAC)', i.inliers ?? 0)
    + fila('Puntos seguidos', i.fase === 'seguir' ? i.siguiendo ?? 0 : '—');
}

function salir() {
  motor?.detener();
  motor = null;
  document.body.classList.remove('en-ar');
  $('inicio').hidden = false;
  for (const id of ['hudArriba', 'datos', 'controles']) $(id).hidden = true;
}

$('btnMarcadores').addEventListener('click', () => empezar('marcadores'));
prepararMisObjetos({ alProbar: () => empezar('marcadores') });
$('btnImagen').addEventListener('click', () => empezar('imagen'));
$('btnSalir').addEventListener('click', salir);
$('btnDepurar').addEventListener('click', () => {
  if (!motor) return;
  motor.depurar = !motor.depurar;
  $('btnDepurar').classList.toggle('activo', motor.depurar);
  $('datos').classList.toggle('abierto', motor.depurar);
});
