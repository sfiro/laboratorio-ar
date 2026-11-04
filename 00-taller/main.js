// Nivel 0 · Taller
// 1) Diagnóstico: ¿qué capacidades de AR tiene este celular?
// 2) Cámara: mostrar el mundo real a pantalla completa.
// 3) Lienzo encima: dibujar algo "virtual" con nuestra propia proyección 3D.
// 4) Giroscopio: hacer que el cubo se quede quieto en el mundo al mover el celular.

const $ = (id) => document.getElementById(id);
const video = $('video');
const lienzo = $('lienzo');
const ctx = lienzo.getContext('2d');

let stream = null;
let modoCamara = 'environment'; // 'environment' = trasera, 'user' = frontal
let orientacion = null;         // última lectura del giroscopio
let orientacionInicial = null;  // matriz de referencia al activar el giroscopio

// ---------------------------------------------------------------------------
// 1) Diagnóstico
// ---------------------------------------------------------------------------

async function diagnosticar() {
  const ua = navigator.userAgent;
  const esIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const esAndroid = /Android/.test(ua);

  let webxrAR = false;
  try { webxrAR = !!(await navigator.xr?.isSessionSupported('immersive-ar')); } catch { /* sin WebXR */ }

  const webgl2 = !!document.createElement('canvas').getContext('webgl2');
  const quickLook = document.createElement('a').relList?.supports?.('ar') ?? false;
  const giroscopio = 'DeviceOrientationEvent' in window;

  const filas = [
    ['Dispositivo', true, esIOS ? 'iPhone / iPad' : esAndroid ? 'Android' : 'Computadora u otro'],
    ['Conexión segura (HTTPS)', window.isSecureContext, 'Obligatoria para usar la cámara'],
    ['Cámara (getUserMedia)', !!navigator.mediaDevices?.getUserMedia, 'Base de toda la AR web'],
    ['Gráficos 3D (WebGL 2)', webgl2, 'Lo usan Three.js y A-Frame'],
    ['Giroscopio', giroscopio, esIOS ? 'iPhone pide permiso al activarlo' : 'Orientación del celular'],
    ['WebXR AR (detectar el piso)', webxrAR, webxrAR ? 'Disponible: nivel 7 completo' : 'No disponible: usaremos alternativas'],
    ['Quick Look (AR de Apple)', quickLook, 'Lo usa model-viewer en iPhone (nivel 1)'],
  ];

  $('diagnostico').innerHTML = filas
    .map(([nombre, ok, nota]) => `
      <li>
        <span class="icono">${ok ? '✅' : '⚪️'}</span>
        <span>${nombre}<small>${nota}</small></span>
      </li>`)
    .join('');
}

// ---------------------------------------------------------------------------
// 2) Cámara
// ---------------------------------------------------------------------------

async function encenderCamara() {
  apagarCamara();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: modoCamara },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  video.srcObject = stream;
  await video.play();
  // La cámara frontal se ve como espejo, que es lo natural para una selfie
  video.classList.toggle('espejo', modoCamara === 'user');
}

function apagarCamara() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

function mostrarError(err) {
  const msj = {
    NotAllowedError: 'Diste "No permitir" a la cámara. Actívala en los ajustes del navegador y recarga.',
    NotFoundError: 'No se encontró ninguna cámara.',
    NotReadableError: 'Otra app está usando la cámara.',
  }[err.name] ?? `No se pudo encender la cámara: ${err.message}`;
  const el = $('error');
  el.textContent = window.isSecureContext ? msj : 'Esta página no está en HTTPS, por eso el navegador bloquea la cámara.';
  el.hidden = false;
}

// ---------------------------------------------------------------------------
// 3) Matemática 3D hecha por nosotros (sin librerías)
// ---------------------------------------------------------------------------

const rad = (g) => (g * Math.PI) / 180;

// Matriz de rotación del celular según el estándar W3C: R = Rz(alfa) · Rx(beta) · Ry(gamma)
function matrizDesdeOrientacion({ alpha, beta, gamma }) {
  const [a, b, g] = [rad(alpha ?? 0), rad(beta ?? 0), rad(gamma ?? 0)];
  const [ca, sa, cb, sb, cg, sg] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(g), Math.sin(g)];
  return [
    [ca * cg - sa * sb * sg, -cb * sa, ca * sg + cg * sa * sb],
    [cg * sa + ca * sb * sg,  ca * cb, sa * sg - ca * cg * sb],
    [-cb * sg,                sb,      cb * cg],
  ];
}

const multiplicar = (M, v) => M.map((fila) => fila[0] * v[0] + fila[1] * v[1] + fila[2] * v[2]);
const transpuesta = (M) => M[0].map((_, i) => M.map((fila) => fila[i]));

// Los 8 vértices y 12 aristas de un cubo de lado 1
const vertices = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x / 2, y / 2, z / 2])));
// Una arista une dos vértices que difieren en exactamente una coordenada
const aristas = [];
vertices.forEach((a, i) => vertices.forEach((b, j) => {
  if (j > i && a.filter((v, k) => v !== b[k]).length === 1) aristas.push([i, j]);
}));

function dibujar(t) {
  const dpr = window.devicePixelRatio || 1;
  const w = lienzo.clientWidth, h = lienzo.clientHeight;
  if (lienzo.width !== w * dpr) { lienzo.width = w * dpr; lienzo.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!stream) return;

  // Rotación propia del cubo (gira despacio sobre sí mismo)
  const giro = t / 2000;
  const rotarCubo = ([x, y, z]) => [x * Math.cos(giro) + z * Math.sin(giro), y, -x * Math.sin(giro) + z * Math.cos(giro)];

  // El cubo vive en el mundo a 4 unidades frente a donde apuntaba el celular al activar el giroscopio.
  // Para verlo desde la orientación actual: p_celular = Rᵀ · R0 · p
  const vista = orientacion && orientacionInicial
    ? (p) => multiplicar(transpuesta(matrizDesdeOrientacion(orientacion)), multiplicar(orientacionInicial, p))
    : (p) => p;

  const focal = Math.min(w, h) * 1.2; // "zoom" de nuestra cámara virtual
  const puntos = vertices.map((v) => {
    const [x, y, z] = vista(rotarCubo(v).map((c, i) => c + [0, 0, -4][i]));
    if (z > -0.1) return null; // detrás de la cámara: no se dibuja
    return [w / 2 + (focal * x) / -z, h / 2 - (focal * y) / -z];
  });

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#4fe3c1';
  ctx.shadowColor = '#4fe3c1';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (const [i, j] of aristas) {
    if (!puntos[i] || !puntos[j]) continue;
    ctx.moveTo(...puntos[i]);
    ctx.lineTo(...puntos[j]);
  }
  ctx.stroke();
}

// Bucle de dibujo + contador de cuadros por segundo
let cuadros = 0, ultimo = performance.now();
function bucle(t) {
  dibujar(t);
  cuadros++;
  if (t - ultimo > 500) {
    $('fps').textContent = `${Math.round((cuadros * 1000) / (t - ultimo))} fps`;
    cuadros = 0; ultimo = t;
  }
  requestAnimationFrame(bucle);
}

// ---------------------------------------------------------------------------
// 4) Giroscopio
// ---------------------------------------------------------------------------

async function activarGiroscopio() {
  // iPhone exige pedir permiso desde un toque del usuario
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    const r = await DeviceOrientationEvent.requestPermission();
    if (r !== 'granted') return alert('Sin permiso, el cubo no puede seguir el movimiento.');
  }
  orientacionInicial = null;
  window.addEventListener('deviceorientation', (e) => {
    if (e.alpha === null) return;
    orientacion = e;
    orientacionInicial ??= matrizDesdeOrientacion(e);
  });
  $('btnSensores').textContent = 'Recentrar cubo';
  $('btnSensores').onclick = () => { orientacionInicial = orientacion && matrizDesdeOrientacion(orientacion); };
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

$('btnIniciar').onclick = async () => {
  $('error').hidden = true;
  try {
    if (!stream) await encenderCamara();
    $('inicio').hidden = true;
    $('controles').hidden = false;
  } catch (err) {
    mostrarError(err);
  }
};

$('btnGirar').onclick = async () => {
  modoCamara = modoCamara === 'environment' ? 'user' : 'environment';
  try { await encenderCamara(); } catch (err) { alert(err.message); }
};

$('btnSensores').onclick = () => activarGiroscopio().catch((err) => alert(err.message));

$('btnInfo').onclick = () => {
  $('inicio').hidden = false;
  $('controles').hidden = true;
  $('btnIniciar').textContent = 'Volver a la cámara';
};

diagnosticar();
requestAnimationFrame(bucle);
