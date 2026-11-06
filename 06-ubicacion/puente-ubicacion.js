// Nuestro motor de AR por ubicación: GPS + brújula + giroscopio + Three.js.
//
// La idea:
//   1. El GPS dice DÓNDE estás (latitud, longitud). La convertimos a metros:
//      x = metros al ESTE, z = metros al SUR (−z = norte), y = arriba.
//   2. La brújula y el giroscopio dicen HACIA DÓNDE miras. Con eso giramos la cámara 3D.
//   3. Cualquier cosa con latitud y longitud se puede poner en la escena, en metros.
// No hay que "reconocer" nada en la imagen: el video de la cámara es solo el fondo.
import * as THREE from 'three';

export const RADIO_TIERRA = 6371000; // metros
export const ALTURA_OJOS = 1.5;      // el celular está ~1.5 m sobre el piso: el piso es y = −1.5

const rad = THREE.MathUtils.DEG2RAD;

/** Metros al este y al norte de "punto" respecto a "origen" (aproximación plana: perfecta para unos km) */
export function aMetros(origen, punto) {
  return {
    este: (punto.lon - origen.lon) * rad * RADIO_TIERRA * Math.cos(origen.lat * rad),
    norte: (punto.lat - origen.lat) * rad * RADIO_TIERRA,
  };
}

/** El punto que está a "metros" en dirección "rumbo" (grados desde el norte) */
export function desplazar({ lat, lon }, rumbo, metros) {
  const norte = metros * Math.cos(rumbo * rad), este = metros * Math.sin(rumbo * rad);
  return {
    lat: lat + norte / RADIO_TIERRA / rad,
    lon: lon + este / (RADIO_TIERRA * Math.cos(lat * rad)) / rad,
  };
}

export const PUNTOS_CARDINALES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export const cardinal = (rumbo) => PUNTOS_CARDINALES[Math.round(((rumbo % 360) + 360) % 360 / 45) % 8];

// Orientación del celular → giro de la cámara (la misma conversión que usaba Three.js en
// DeviceOrientationControls): ángulos de Euler en orden Z-X'-Y'' del estándar del W3C,
// más un giro de −90° en X porque la cámara trasera mira "hacia atrás" del celular.
const EJE_Z = new THREE.Vector3(0, 0, 1);
const MIRAR_ATRAS = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
function orientacionACuaternion(q, alfa, beta, gama, pantalla) {
  q.setFromEuler(new THREE.Euler(beta * rad, alfa * rad, -gama * rad, 'YXZ'));
  q.multiply(MIRAR_ATRAS);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(EJE_Z, -pantalla * rad));
  return q;
}

const diferenciaAngulo = (a, b) => ((a - b + 540) % 360) - 180; // de −180 a 180

export class RealidadPorUbicacion {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(60, 1, 0.1, 20000);
    this.camara.rotation.order = 'YXZ';
    this.alCuadro = [];
    this.gps = null;          // { lat, lon, precision } — la última lectura
    this.origen = null;       // el primer punto: el (0, 0) de nuestro mundo en metros
    this.objetivo = new THREE.Vector3(); // dónde dice el GPS que estás (la cámara se acerca suave)
    this.rumbo = 0;           // hacia dónde mira la cámara (grados desde el norte)
    this.inclinacion = 0;     // grados: + mirando arriba, − mirando abajo
    this.brujula = 'sin datos';
    this.orientacionObjetivo = new THREE.Quaternion();
    this.tieneOrientacion = false;
    this.desfaseIOS = null;   // en iPhone: diferencia entre el giroscopio (relativo) y la brújula
  }

  /** Coordenadas (lat, lon) → posición en la escena (metros). y = 0 a la altura de los ojos */
  local(lat, lon, y = 0) {
    const { este, norte } = aMetros(this.origen, { lat, lon });
    return new THREE.Vector3(este, y, -norte);
  }

  /** Distancia horizontal (m) y rumbo (grados) desde donde estás hasta una posición de la escena */
  haciaPosicion(p) {
    const dx = p.x - this.camara.position.x, dz = p.z - this.camara.position.z;
    return { distancia: Math.hypot(dx, dz), rumbo: ((Math.atan2(dx, -dz) / rad) + 360) % 360 };
  }

  /** simular = { lat, lon }: sin GPS ni brújula, para probar en la computadora */
  async iniciar({ simular = null, estado = () => {} } = {}) {
    this.simulando = !!simular;

    // 1) Permiso de orientación (iPhone): debe pedirse ANTES de cualquier await, dentro del toque
    const permisoOrientacion = !simular && typeof DeviceOrientationEvent?.requestPermission === 'function'
      ? DeviceOrientationEvent.requestPermission().catch(() => 'denied')
      : Promise.resolve('granted');

    // 2) Lienzo 3D -------------------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = 'lienzo-3d';
    this.contenedor.append(this.renderer.domElement);

    // 3) Cámara trasera (en simulación, un cielo y un piso de mentiras) -------------------
    if (simular) {
      this.#mundoSimulado();
    } else {
      estado('Encendiendo la cámara…');
      this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, autoplay: true });
      this.video.setAttribute('playsinline', '');
      this.video.className = 'video-camara';
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      this.video.srcObject = this.stream;
      this.contenedor.prepend(this.video);
      await this.video.play();
      if (!this.video.videoWidth) await new Promise((ok) => this.video.addEventListener('loadedmetadata', ok, { once: true }));
    }
    this.#ajustarTamano();
    this.alRedimensionar = () => this.#ajustarTamano();
    window.addEventListener('resize', this.alRedimensionar);

    // 4) Brújula y giroscopio ---------------------------------------------------------------
    if (!simular) {
      if ((await permisoOrientacion) !== 'granted') throw Object.assign(new Error('Sin permiso para la brújula'), { name: 'SinBrujula' });
      this.alOrientar = (e) => this.#alOrientar(e);
      // Android/Chrome tiene un evento con la orientación ABSOLUTA (respecto al norte).
      // iPhone da la orientación relativa más "webkitCompassHeading".
      this.eventoOrientacion = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
      window.addEventListener(this.eventoOrientacion, this.alOrientar);
    }

    // 5) GPS -----------------------------------------------------------------------------------
    estado('Buscando tu ubicación (GPS)…');
    if (simular) {
      this.#alGps({ coords: { latitude: simular.lat, longitude: simular.lon, accuracy: 5 } });
    } else {
      await new Promise((ok, falla) => {
        this.vigilante = navigator.geolocation.watchPosition(
          (pos) => { this.#alGps(pos); ok(); },
          (err) => falla(Object.assign(new Error(err.message), { name: err.code === 1 ? 'SinGps' : 'GpsFalla' })),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
        );
      });
    }
    this.camara.position.copy(this.objetivo);

    // 6) Bucle ---------------------------------------------------------------------------------
    const reloj = new THREE.Timer();
    this.renderer.setAnimationLoop((ahora) => {
      reloj.update(ahora);
      const t = reloj.getElapsed(), dt = Math.min(reloj.getDelta(), 0.1);
      // Suavizado: el GPS salta varios metros; la cámara camina hacia el punto nuevo.
      this.camara.position.lerp(this.objetivo, 1 - Math.exp(-dt * 1.5));
      if (this.simulando) this.#moverSimulado(dt);
      else if (this.tieneOrientacion) this.camara.quaternion.slerp(this.orientacionObjetivo, 1 - Math.exp(-dt * 12));
      // Hacia dónde miras: el eje −Z de la cámara
      const adelante = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camara.quaternion);
      this.rumbo = ((Math.atan2(adelante.x, -adelante.z) / rad) + 360) % 360;
      this.inclinacion = Math.asin(THREE.MathUtils.clamp(adelante.y, -1, 1)) / rad;
      this.alCuadro.forEach((f) => f(t, dt));
      this.renderer.render(this.escena, this.camara);
    });
    estado('');
  }

  #alGps(pos) {
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    this.gps = { lat, lon, precision: accuracy };
    if (!this.origen) this.origen = { lat, lon };
    this.objetivo.copy(this.local(lat, lon));
  }

  #alOrientar(e) {
    if (e.alpha == null) return;
    let alfa = e.alpha;
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
      // iPhone: alfa es relativo (su cero es arbitrario). La brújula dice el rumbo real.
      // Guardamos la diferencia entre los dos, suavizada, y la sumamos a alfa.
      const desfase = diferenciaAngulo(360 - e.webkitCompassHeading, e.alpha);
      this.desfaseIOS = this.desfaseIOS == null ? desfase : this.desfaseIOS + diferenciaAngulo(desfase, this.desfaseIOS) * 0.05;
      alfa = e.alpha + this.desfaseIOS;
      this.brujula = `iPhone (±${Math.round(e.webkitCompassAccuracy ?? 0)}°)`;
    } else {
      this.brujula = e.absolute || this.eventoOrientacion === 'deviceorientationabsolute' ? 'absoluta' : 'relativa (sin norte)';
    }
    const pantalla = screen.orientation?.angle ?? window.orientation ?? 0;
    orientacionACuaternion(this.orientacionObjetivo, alfa, e.beta, e.gamma, pantalla);
    if (!this.tieneOrientacion) this.camara.quaternion.copy(this.orientacionObjetivo);
    this.tieneOrientacion = true;
  }

  // --- Simulación: arrastrar para mirar, botones o flechas para caminar -------------------------
  #mundoSimulado() {
    this.escena.background = new THREE.Color('#9cc7ef');
    this.escena.fog = new THREE.Fog('#9cc7ef', 60, 600);
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: '#7fa86a' }));
    piso.rotation.x = -Math.PI / 2;
    piso.position.y = -ALTURA_OJOS - 0.01;
    const rejilla = new THREE.GridHelper(4000, 400, '#5d8250', '#6e9660');
    rejilla.position.y = -ALTURA_OJOS;
    this.escena.add(piso, rejilla);
    this.simulacion = { guinada: 0, cabeceo: 5, adelante: 0, giro: 0 };
    this.brujula = 'simulada';
    this.tieneOrientacion = true;
    let arrastre = null;
    const lienzo = this.renderer.domElement;
    lienzo.style.touchAction = 'none';
    lienzo.addEventListener('pointerdown', (e) => { arrastre = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointerup', () => { arrastre = null; });
    lienzo.addEventListener('pointermove', (e) => {
      if (!arrastre) return;
      this.simulacion.guinada += (e.clientX - arrastre.x) * 0.25;
      this.simulacion.cabeceo = THREE.MathUtils.clamp(this.simulacion.cabeceo + (e.clientY - arrastre.y) * 0.25, -80, 80);
      arrastre = { x: e.clientX, y: e.clientY };
    });
    this.alTeclado = (e) => {
      const valor = e.type === 'keydown' ? 1 : 0;
      if (e.key === 'ArrowUp') this.simulacion.adelante = valor;
      if (e.key === 'ArrowDown') this.simulacion.adelante = -valor;
      if (e.key === 'ArrowLeft') this.simulacion.giro = -valor;
      if (e.key === 'ArrowRight') this.simulacion.giro = valor;
    };
    window.addEventListener('keydown', this.alTeclado);
    window.addEventListener('keyup', this.alTeclado);
  }

  /** En simulación: rumbo (grados), cabeceo (grados), adelante (−1, 0, 1), giro (−1, 0, 1) */
  simular(cambios) { Object.assign(this.simulacion, cambios); }

  #moverSimulado(dt) {
    const s = this.simulacion;
    s.guinada += s.giro * 60 * dt;
    this.camara.rotation.set(s.cabeceo * rad, -s.guinada * rad, 0, 'YXZ');
    if (s.adelante) {
      // Caminamos a 1.4 m/s "con GPS": movemos la lectura y dejamos que el suavizado haga lo demás
      const nuevo = desplazar(this.gps, s.guinada, s.adelante * 1.4 * dt);
      this.#alGps({ coords: { latitude: nuevo.lat, longitude: nuevo.lon, accuracy: 5 } });
    }
  }

  // Campo de visión: la cámara trasera típica ve ~63° en su lado largo. El video llena la
  // pantalla recortando lo que sobra, así que el campo de visión de lo que se VE es menor.
  #ajustarTamano() {
    const cw = this.contenedor.clientWidth, ch = this.contenedor.clientHeight;
    if (this.video) {
      const vw = this.video.videoWidth, vh = this.video.videoHeight;
      const k = Math.max(cw / vw, ch / vh);
      const anchoMostrado = vw * k, altoMostrado = vh * k;
      Object.assign(this.video.style, {
        width: `${anchoMostrado}px`, height: `${altoMostrado}px`,
        left: `${(cw - anchoMostrado) / 2}px`, top: `${(ch - altoMostrado) / 2}px`,
      });
      const ladoLargo = Math.max(anchoMostrado, altoMostrado);
      const tanMedio = Math.tan((63 / 2) * rad) * (altoMostrado / ladoLargo); // vertical del video
      this.camara.fov = (2 * Math.atan(tanMedio * (ch / altoMostrado))) / rad;
    } else {
      this.camara.fov = 65;
    }
    this.camara.aspect = cw / ch;
    this.camara.updateProjectionMatrix();
    this.renderer.setSize(cw, ch);
  }

  detener() {
    this.renderer?.setAnimationLoop(null);
    if (this.vigilante != null) navigator.geolocation.clearWatch(this.vigilante);
    if (this.alOrientar) window.removeEventListener(this.eventoOrientacion, this.alOrientar);
    if (this.alTeclado) { window.removeEventListener('keydown', this.alTeclado); window.removeEventListener('keyup', this.alTeclado); }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video?.remove();
    this.renderer?.domElement.remove();
    this.renderer?.dispose();
    window.removeEventListener('resize', this.alRedimensionar);
  }
}
