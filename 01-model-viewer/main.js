// Nivel 1 · Un objeto 3D en tu espacio
// model-viewer (de Google, libre) carga el .glb y decide solo qué tipo de AR usar en cada celular.
import '@google/model-viewer';

const $ = (id) => document.getElementById(id);
const visor = $('visor');

// Barra de carga del modelo
visor.addEventListener('progress', (e) => {
  const p = e.detail.totalProgress;
  $('barra-progreso').style.width = `${p * 100}%`;
  $('barra-progreso').parentElement.hidden = p >= 1;
});

visor.addEventListener('load', () => {
  // ¿Puede este dispositivo mostrar AR? (en una computadora, no)
  $('aviso-ar').hidden = visor.canActivateAR;

  // Los colores solo aplican a nuestro cohete (tiene un material llamado "Pintura")
  $('grupo-colores').hidden = !buscarMaterial('Pintura');

  // Las animaciones que trae el modelo
  const hay = visor.availableAnimations.length > 0;
  $('btnAnimacion').hidden = !hay;
  if (hay && !visor.availableAnimations.includes(visor.animationName)) {
    visor.animationName = visor.availableAnimations[0];
  }
  if (hay) visor.play();
});

// Eventos de AR: útil para saber qué pasó en el celular
visor.addEventListener('ar-status', (e) => {
  if (e.detail.status === 'failed') alert('No se pudo iniciar la AR en este dispositivo.');
});

// ---------------------------------------------------------------------------
// Cambiar el color del material "Pintura"
// ---------------------------------------------------------------------------
const buscarMaterial = (nombre) => visor.model?.materials.find((m) => m.name === nombre);

document.querySelectorAll('.color').forEach((boton) => {
  boton.addEventListener('click', () => {
    buscarMaterial('Pintura')?.pbrMetallicRoughness.setBaseColorFactor(boton.dataset.color);
    document.querySelectorAll('.color').forEach((b) => b.classList.toggle('activo', b === boton));
  });
});

// ---------------------------------------------------------------------------
// Animación y etiquetas
// ---------------------------------------------------------------------------
$('btnAnimacion').addEventListener('click', () => {
  if (visor.paused) visor.play(); else visor.pause();
  $('btnAnimacion').textContent = visor.paused ? 'Reanudar animación' : 'Pausar animación';
});

$('btnEtiquetas').addEventListener('click', () => {
  const ocultas = document.body.classList.toggle('sin-etiquetas');
  $('btnEtiquetas').textContent = ocultas ? 'Mostrar etiquetas' : 'Ocultar etiquetas';
});

// ---------------------------------------------------------------------------
// Ver tu propio modelo (por ejemplo, uno hecho en Blender)
// ---------------------------------------------------------------------------
$('archivo').addEventListener('change', (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  visor.src = URL.createObjectURL(archivo);
  visor.alt = archivo.name;
  document.body.classList.add('sin-etiquetas'); // las etiquetas son del cohete
  $('btnEtiquetas').hidden = true;
});
