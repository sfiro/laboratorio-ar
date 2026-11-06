// Nuestro puente con WebXR (el estándar de realidad aumentada del navegador).
//
// A diferencia de los niveles anteriores, aquí el CELULAR entiende el espacio:
//   - Sabe dónde está y cómo se mueve en 3D (6 grados de libertad, con ARCore).
//   - "Hit-test": le preguntamos qué superficie real hay en una dirección y responde
//     con un punto y su orientación (piso, mesa, pared).
//   - "Anclas": puntos fijos del mundo que el celular mantiene en su lugar aunque corrija su mapa.
//   - "Luz estimada": de qué color y desde dónde viene la luz real.
//
// Para probar en la computadora hay una VISTA PREVIA con un cuarto simulado que responde
// a las mismas preguntas (con un raycast de Three.js). Los modos no saben cuál de los dos usan.
import * as THREE from 'three';
import { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ARRIBA = new THREE.Vector3(0, 1, 0);

export async function soportaAR() {
  try { return !!(await navigator.xr?.isSessionSupported('immersive-ar')); } catch { return false; }
}

export class RealidadXR {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(60, 1, 0.01, 60);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.xr.enabled = true;
    this.renderer.domElement.className = 'lienzo-3d';
    contenedor.append(this.renderer.domElement);

    // Reflejos suaves para los materiales (un "cuarto" genérico de Three.js)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.entorno = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.escena.environment = this.entorno;
    this.escena.environmentIntensity = 0.6;
    const sol = new THREE.DirectionalLight('#fff', 1.6);
    sol.position.set(0.5, 2, 1);
    this.luces = new THREE.Group().add(new THREE.HemisphereLight('#fff', '#667', 1), sol);
    this.escena.add(this.luces);

    // La retícula: un aro que se acuesta sobre la superficie que miras
    const blanco = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.9, depthTest: false });
    this.reticula = new THREE.Group().add(
      new THREE.Mesh(new THREE.RingGeometry(0.07, 0.085, 40).rotateX(-Math.PI / 2), blanco),
      new THREE.Mesh(new THREE.CircleGeometry(0.012, 16).rotateX(-Math.PI / 2), blanco),
    );
    this.reticula.renderOrder = 30;
    this.reticula.children.forEach((c) => { c.renderOrder = 30; });
    this.reticula.visible = false;
    this.escena.add(this.reticula);

    /** Lo que hay en el centro de la pantalla: { visible, posicion, normal, horizontal, resultado } */
    this.mira = { visible: false, posicion: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), horizontal: true, resultado: null };
    /** Superficies horizontales que ya vimos (para que las pelotas reboten en ellas) */
    this.parches = [];
    this.paredes = []; // { x, y, z, nx, nz }
    this.piso = null;
    this.manejador = null; // el modo activo: { tocar(rayo), presionar(rayo) → bool, arrastrar(golpe), soltar() }
    this.alCuadro = [];
    this.anclas = new Map();
    this.reloj = new THREE.Timer();
  }

  // ---------------------------------------------------------------------------
  // AR de verdad (WebXR)
  // ---------------------------------------------------------------------------
  async iniciarAR(overlay, { alTerminar } = {}) {
    this.modo = 'ar';
    const sesion = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'anchors', 'light-estimation', 'local-floor'],
      domOverlay: { root: overlay },
    });
    this.sesion = sesion;

    // Luz real: si el celular la estima, reemplaza nuestras luces fijas
    this.luzXR = new XREstimatedLight(this.renderer);
    this.luzXR.addEventListener('estimationstart', () => {
      this.escena.add(this.luzXR);
      this.luces.visible = false;
      if (this.luzXR.environment) this.escena.environment = this.luzXR.environment;
      this.luzEstimada = true;
    });
    this.luzXR.addEventListener('estimationend', () => {
      this.escena.remove(this.luzXR);
      this.luces.visible = true;
      this.escena.environment = this.entorno;
      this.luzEstimada = false;
    });

    // "local-floor" pone y = 0 en el piso. Si no existe, "local" (y = 0 donde empezó el celular).
    let tipoEspacio = 'local-floor';
    try { await sesion.requestReferenceSpace('local-floor'); } catch { tipoEspacio = 'local'; }
    this.renderer.xr.setReferenceSpaceType(tipoEspacio);
    await this.renderer.xr.setSession(sesion);
    this.espacio = this.renderer.xr.getReferenceSpace();
    this.pisoInicial = tipoEspacio === 'local-floor' ? 0 : null;

    // Fuente de hit-test desde el centro de la pantalla ("viewer" = la cámara del celular)
    const vista = await sesion.requestReferenceSpace('viewer');
    this.fuenteCentro = await sesion.requestHitTestSource({ space: vista });
    // Y otra para los dedos sobre la pantalla (para arrastrar objetos)
    this.fuenteDedos = await sesion.requestHitTestSourceForTransientInput?.({ profile: 'generic-touchscreen' }).catch(() => null);

    // Toques en la pantalla: selectstart → (select) → selectend
    sesion.addEventListener('selectstart', (e) => this.#presionar(this.#rayoDe(e), e.inputSource));
    sesion.addEventListener('select', (e) => this.#tocar(this.#rayoDe(e)));
    sesion.addEventListener('selectend', () => this.#soltar());
    sesion.addEventListener('end', () => {
      this.renderer.setAnimationLoop(null);
      this.sesion = null;
      alTerminar?.();
    });
    // Los botones del overlay no deben contar como toques en el mundo
    overlay.addEventListener('beforexrselect', (e) => { if (e.target.closest('button, a, .hud')) e.preventDefault(); });

    this.renderer.setAnimationLoop((t, frame) => this.#cuadro(t, frame));
    return { anclas: sesion.enabledFeatures?.includes('anchors') ?? !!XRFrame.prototype.createAnchor };
  }

  #rayoDe(e) {
    const pose = e.frame.getPose(e.inputSource.targetRaySpace, this.espacio);
    if (!pose) return null;
    const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
    return new THREE.Ray(new THREE.Vector3().setFromMatrixPosition(m), new THREE.Vector3(0, 0, -1).transformDirection(m));
  }

  /** Un resultado de hit-test de WebXR → { posicion, normal, horizontal, resultado } */
  #golpeDe(resultado) {
    const pose = resultado.getPose(this.espacio);
    if (!pose) return null;
    const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
    // Por el estándar, el eje Y de la pose es la normal de la superficie
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(m);
    return { posicion: new THREE.Vector3().setFromMatrixPosition(m), normal, horizontal: normal.y > 0.85, resultado };
  }

  // ---------------------------------------------------------------------------
  // Vista previa en la computadora: un cuarto simulado
  // ---------------------------------------------------------------------------
  iniciarSimulado() {
    this.modo = 'simulado';
    this.escena.background = new THREE.Color('#1c2028');
    const cuarto = new THREE.Group();
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#b8956a', roughness: 0.8 }));
    const tapete = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5b7fa8', roughness: 1 }));
    tapete.position.set(0.6, 0.003, -0.6);
    const pared = new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: 0.95 });
    const fondo = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.6), pared);
    fondo.position.set(0, 1.3, -3);
    const lateral = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.6).rotateY(Math.PI / 2), pared);
    lateral.position.set(-3, 1.3, 0);
    const madera = new THREE.MeshStandardMaterial({ color: '#7a5235', roughness: 0.6 });
    const mesa = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.7), madera);
    mesa.position.set(-1.2, 0.74, -1.6);
    cuarto.add(piso, tapete, fondo, lateral, mesa);
    for (const [x, z] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) {
      const pata = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), madera);
      pata.position.set(-1.2 + x, 0.36, -1.6 + z);
      cuarto.add(pata);
    }
    this.escena.add(cuarto);
    this.superficies = [piso, tapete, fondo, lateral, mesa];
    this.pisoInicial = 0;

    // Cámara que orbita: arrastrar en el vacío gira, la rueda acerca
    this.orbita = { centro: new THREE.Vector3(-0.3, 0.5, -1.1), radio: 2.6, giro: 0.35, altura: 0.42 };
    const lienzo = this.renderer.domElement;
    lienzo.style.touchAction = 'none';
    let puntero = null;
    lienzo.addEventListener('pointerdown', (e) => {
      const rayo = this.#rayoPuntero(e);
      puntero = { x: e.clientX, y: e.clientY, ultimo: { x: e.clientX, y: e.clientY }, movio: false, rayo };
      this.#presionar(rayo, 'raton');
      try { lienzo.setPointerCapture(e.pointerId); } catch { /* evento sintético */ }
    });
    lienzo.addEventListener('pointermove', (e) => {
      // En la computadora la "mira" sigue al cursor (en el celular es el centro de la pantalla)
      this.rayoMira = this.#rayoPuntero(e);
      if (!puntero) return;
      const mx = e.clientX - puntero.ultimo.x, my = e.clientY - puntero.ultimo.y;
      puntero.ultimo = { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - puntero.x, e.clientY - puntero.y) > 4) puntero.movio = true;
      if (this.presionando?.capturado) {
        const golpe = this.#golpeSimulado(this.#rayoPuntero(e));
        if (golpe) { this.presionando.movio = true; this.presionando.ultimoGolpe = golpe; this.manejador?.arrastrar?.(golpe); }
      } else if (puntero.movio) {
        this.orbita.giro -= mx * 0.006;
        this.orbita.altura = THREE.MathUtils.clamp(this.orbita.altura + my * 0.004, 0.05, 1.3);
        this.rayoMira = null; // mientras giras, la mira vuelve al centro
      }
    });
    lienzo.addEventListener('pointerup', () => {
      if (!puntero) return;
      if (!puntero.movio) this.#tocar(puntero.rayo);
      this.#soltar();
      puntero = null;
    });
    lienzo.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbita.radio = THREE.MathUtils.clamp(this.orbita.radio * (1 + e.deltaY * 0.001), 0.8, 5);
    }, { passive: false });

    this.#ajustarTamano();
    this.alRedimensionar = () => this.#ajustarTamano();
    window.addEventListener('resize', this.alRedimensionar);
    this.renderer.setAnimationLoop((t) => this.#cuadro(t, null));
  }

  #rayoPuntero(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camara);
    return raycaster.ray.clone();
  }

  #golpeSimulado(rayo) {
    if (!rayo) return null;
    const raycaster = new THREE.Raycaster(rayo.origin, rayo.direction, 0.05, 20);
    const [hit] = raycaster.intersectObjects(this.superficies, false);
    if (!hit) return null;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    return { posicion: hit.point.clone(), normal, horizontal: normal.y > 0.85, resultado: null };
  }

  #ajustarTamano() {
    const w = this.contenedor.clientWidth, h = this.contenedor.clientHeight;
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ---------------------------------------------------------------------------
  // Entrada común (toques y arrastres)
  // ---------------------------------------------------------------------------
  #presionar(rayo, fuente) {
    this.presionando = { fuente, movio: false, capturado: !!(rayo && this.manejador?.presionar?.(rayo)) };
  }

  #tocar(rayo) {
    // Si arrastraste un objeto, no fue un "toque"
    if (this.presionando?.movio) return;
    this.manejador?.tocar?.(rayo);
  }

  #soltar() {
    if (this.presionando?.capturado) this.manejador?.soltar?.(this.presionando.ultimoGolpe);
    this.presionando = null;
  }

  // ---------------------------------------------------------------------------
  // Anclas: el celular mantiene el objeto pegado a ese punto del mundo
  // ---------------------------------------------------------------------------
  anclar(objeto, golpe) {
    this.desanclar(objeto);
    const resultado = golpe?.resultado;
    if (!resultado?.createAnchor) return;
    resultado.createAnchor().then((ancla) => {
      if (objeto.userData.anclaPendiente !== resultado) { ancla.delete(); return; } // ya se movió otra vez
      objeto.userData.ancla = ancla;
      this.anclas.set(ancla, objeto);
    }).catch(() => {});
    objeto.userData.anclaPendiente = resultado;
  }

  desanclar(objeto) {
    const ancla = objeto.userData.ancla;
    if (ancla) { this.anclas.delete(ancla); ancla.delete?.(); }
    objeto.userData.ancla = null;
    objeto.userData.anclaPendiente = null;
  }

  /** Recordamos las superficies horizontales que vemos: las pelotas rebotan en ellas */
  #recordarSuperficie({ posicion: p, horizontal, normal }) {
    if (!horizontal) {
      // Paredes (superficies verticales): también las recordamos, con su normal
      if (Math.abs(normal.y) > 0.3) return;
      const cercana = this.paredes.find((q) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < 0.25);
      if (cercana) return;
      const n = new THREE.Vector3(normal.x, 0, normal.z).normalize();
      this.paredes.push({ x: p.x, y: p.y, z: p.z, nx: n.x, nz: n.z });
      if (this.paredes.length > 400) this.paredes.shift();
      return;
    }
    const cerca = this.parches.find((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.18 && Math.abs(q.y - p.y) < 0.06);
    if (cerca) { cerca.y += (p.y - cerca.y) * 0.2; return; }
    this.parches.push({ x: p.x, y: p.y, z: p.z });
    if (this.parches.length > 600) this.parches.shift();
    this.piso = Math.min(this.piso ?? Infinity, p.y);
  }

  /** Altura del piso: la superficie más baja que hemos visto (o la del espacio "local-floor") */
  alturaPiso() {
    return this.piso ?? this.pisoInicial ?? this.camara.position.y - 1.4;
  }

  // ---------------------------------------------------------------------------
  // Cada cuadro
  // ---------------------------------------------------------------------------
  #cuadro(ms, frame) {
    this.reloj.update(ms);
    const t = this.reloj.getElapsed(), dt = Math.min(this.reloj.getDelta(), 0.05);
    let golpe = null;

    if (frame) {
      // ¿Qué superficie hay en el centro de la pantalla?
      const [resultado] = frame.getHitTestResults(this.fuenteCentro);
      golpe = resultado ? this.#golpeDe(resultado) : null;
      // ¿Y bajo el dedo que está arrastrando?
      if (this.presionando?.capturado && this.fuenteDedos) {
        for (const r of frame.getHitTestResultsForTransientInput(this.fuenteDedos)) {
          if (r.inputSource !== this.presionando.fuente || !r.results.length) continue;
          const g = this.#golpeDe(r.results[0]);
          if (g) { this.presionando.movio = true; this.presionando.ultimoGolpe = g; this.manejador?.arrastrar?.(g); }
        }
      }
      // Las anclas pueden moverse un poco cuando el celular corrige su mapa
      for (const [ancla, objeto] of this.anclas) {
        if (!frame.trackedAnchors?.has(ancla)) continue;
        const pose = frame.getPose(ancla.anchorSpace, this.espacio);
        if (pose) objeto.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
      }
    } else {
      // Vista previa: la cámara orbita y el "hit-test" es un raycast contra el cuarto
      const o = this.orbita;
      const lejos = o.radio / Math.min(1, this.camara.aspect * 1.6); // en pantallas angostas, más lejos
      this.camara.position.set(
        o.centro.x + lejos * Math.cos(o.altura) * Math.sin(o.giro),
        o.centro.y + lejos * Math.sin(o.altura),
        o.centro.z + lejos * Math.cos(o.altura) * Math.cos(o.giro),
      );
      this.camara.lookAt(o.centro);
      this.camara.updateMatrixWorld();
      const adelante = new THREE.Ray(this.camara.position.clone(), this.camara.getWorldDirection(new THREE.Vector3()));
      golpe = this.#golpeSimulado(this.rayoMira ?? adelante);
    }

    // Retícula
    this.mira.visible = !!golpe;
    if (golpe) {
      Object.assign(this.mira, { horizontal: golpe.horizontal, resultado: golpe.resultado });
      this.mira.posicion.copy(golpe.posicion);
      this.mira.normal.copy(golpe.normal);
      this.reticula.position.copy(golpe.posicion);
      this.reticula.quaternion.setFromUnitVectors(ARRIBA, golpe.normal);
      this.reticula.children.forEach((c) => c.material.color.set(golpe.horizontal ? '#ffffff' : '#8fb3ff'));
      this.#recordarSuperficie(golpe);
    }
    this.reticula.visible = this.mira.visible && this.mostrarReticula !== false;

    this.alCuadro.forEach((f) => f(t, dt, frame));
    this.renderer.render(this.escena, this.camara);
  }

  terminar() {
    this.sesion?.end().catch(() => {});
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.alRedimensionar);
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}
