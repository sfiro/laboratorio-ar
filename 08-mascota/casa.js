// La casa: la mascota vive sobre la tarjeta.
//
// Coordenadas del "suelo": la tarjeta es el piso (plano XZ), Y hacia arriba (saliendo del papel).
// 1 unidad = el ancho de la tarjeta. El centro de la tarjeta es (0, 0, 0).
//
// El comportamiento es una MÁQUINA DE ESTADOS: la mascota siempre está haciendo UNA tarea
// (quieta, caminando, masticando, jugando, durmiendo) y cada tarea decide cuál sigue.
import * as THREE from 'three';
import { Mascota } from './mascota.js';
import { sonar } from './sonidos.js';

const ESCALA = 0.28;           // la mascota mide 28 % del ancho de la tarjeta
const CENTRO = new THREE.Vector3(0, 0, 0.017); // el tapete (está un poquito abajo del centro)

const angulo = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // de −π a π

function texturaEmoji(emoji, tam = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  const ctx = c.getContext('2d');
  ctx.font = `${tam * 0.78}px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, tam / 2, tam * 0.55);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function burbujaPensamiento() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(64, 54, 46, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(30, 108, 9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(16, 122, 5, 0, Math.PI * 2); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const fondo = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  const icono = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }));
  icono.scale.setScalar(0.55);
  icono.position.set(0, 0.08, 0.01);
  fondo.renderOrder = 10; icono.renderOrder = 11;
  const g = new THREE.Group().add(fondo, icono);
  let actual = '';
  g.poner = (emoji) => {
    if (emoji === actual) return;
    actual = emoji;
    icono.material.map?.dispose();
    icono.material.map = texturaEmoji(emoji);
    icono.material.needsUpdate = true;
  };
  return g;
}

function sombra() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.position.y = 0.001;
  return m;
}

// Comida hecha con código
function manzana() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 24, 16).scale(1, 0.9, 1), new THREE.MeshStandardMaterial({ color: '#e5484d', roughness: 0.35 })));
  const tallo = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 6), new THREE.MeshStandardMaterial({ color: '#6b3e1f' }));
  tallo.position.y = 0.035;
  const hoja = new THREE.Mesh(new THREE.SphereGeometry(0.01, 12, 8).scale(1.6, 0.4, 0.8), new THREE.MeshStandardMaterial({ color: '#3aa856' }));
  hoja.position.set(0.01, 0.04, 0);
  g.add(tallo, hoja);
  g.userData.alto = 0.032;
  return g;
}
function galleta() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 28), new THREE.MeshStandardMaterial({ color: '#d39a55', roughness: 0.9 })));
  for (let i = 0; i < 6; i++) {
    const chispa = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshStandardMaterial({ color: '#4a2a14' }));
    const a = i * 1.1, d = 0.012 + (i % 3) * 0.008;
    chispa.position.set(Math.cos(a) * d, 0.006, Math.sin(a) * d);
    g.add(chispa);
  }
  g.userData.alto = 0.006;
  return g;
}
function pelota() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  ['#ff5d8f', '#ffd166', '#4f8cff', '#ffffff'].forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(i * 32, 0, 32, 64); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }));
}

export function crearCasa(ar, ancla, cuidado, { avisar }) {
  const suelo = new THREE.Group();
  suelo.rotation.x = Math.PI / 2; // el papel es el piso: Y sale del papel
  ancla.grupo.add(suelo);

  // Luces (de noche, cuando duerme, se apagan un poco). Van en la escena y no en la tarjeta:
  // la dirección de una luz se calcula con su posición en el MUNDO, y en el mundo de MindAR
  // la tarjeta está trasladada cientos de unidades (la luz terminaría apuntando de lado).
  const cielo = new THREE.HemisphereLight('#ffffff', '#556070', 2.2);
  const sol = new THREE.DirectionalLight('#ffffff', 2.2);
  sol.position.set(0.3, 0.8, 1); // desde arriba y desde donde está la cámara
  ar.escena.add(cielo, sol);

  const mascota = new Mascota(cuidado.color);
  mascota.objeto.scale.setScalar(ESCALA);
  mascota.objeto.position.copy(CENTRO);
  const sombraMascota = sombra();
  sombraMascota.scale.setScalar(ESCALA * 0.95);
  const pensamiento = burbujaPensamiento();
  pensamiento.scale.setScalar(0.11);
  suelo.add(mascota.objeto, sombraMascota, pensamiento);

  const limites = () => ({ x: 0.43, z: ancla.alto / 2 - 0.06 });
  const dentro = (p) => { const l = limites(); p.x = THREE.MathUtils.clamp(p.x, -l.x, l.x); p.z = THREE.MathUtils.clamp(p.z, -l.z, l.z); return p; };
  const alAzar = (radio = 1) => { const l = limites(); return new THREE.Vector3((Math.random() * 2 - 1) * l.x * radio, 0, (Math.random() * 2 - 1) * l.z * radio); };

  // Partículas emoji: corazones, migajas, "Z"
  const particulas = [];
  const texturas = {};
  function emitir(emoji, posicion, { velocidad = new THREE.Vector3(0, 0.12, 0), vida = 1.4, tam = 0.05, gravedad = 0 } = {}) {
    texturas[emoji] ??= texturaEmoji(emoji);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturas[emoji], depthTest: false, transparent: true }));
    s.renderOrder = 12;
    s.position.copy(posicion);
    s.scale.setScalar(tam);
    suelo.add(s);
    particulas.push({ s, velocidad, vida, total: vida, tam, gravedad });
  }
  const cabeza = () => mascota.objeto.position.clone().add(new THREE.Vector3(0, ESCALA * 1.05, 0));
  function corazones(n = 4) {
    for (let i = 0; i < n; i++) emitir('❤️', cabeza().add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0, 0)), { velocidad: new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.12 + Math.random() * 0.08, 0), tam: 0.035 + Math.random() * 0.02 });
  }

  // ------------------------------------------------------------------------
  // Tareas
  // ------------------------------------------------------------------------
  let tarea = { tipo: 'quieto', espera: 2 };
  let comida = null, bola = null;
  let fase = 0; // del salto al caminar

  function caminar(destino, alLlegar, rapidez = 0.22) {
    tarea = { tipo: 'caminar', destino: dentro(destino.clone()), alLlegar, rapidez };
  }

  /** Avanza hacia un punto dando saltitos. Devuelve true al llegar. */
  function avanzarHacia(destino, rapidez, dt, distanciaFinal = 0.015) {
    const p = mascota.objeto.position;
    const d = new THREE.Vector3().subVectors(destino, p).setY(0);
    const dist = d.length();
    if (dist < distanciaFinal) { mascota.rebote = 0; return true; }
    // Primero gira hacia el destino; camina cuando ya casi lo tiene enfrente
    const meta = Math.atan2(d.x, d.z);
    const giro = angulo(meta - mascota.objeto.rotation.y);
    mascota.objeto.rotation.y += giro * Math.min(1, dt * 8);
    if (Math.abs(giro) < 0.7) {
      const paso = Math.min(dist, rapidez * dt);
      p.addScaledVector(d.normalize(), paso);
      fase += paso * 45;
      mascota.rebote = Math.abs(Math.sin(fase)) * 0.12;
      mascota.aplastar = Math.abs(Math.sin(fase)) < 0.25 ? 0.08 : -0.04; // se aplasta al caer
    }
    return false;
  }

  function mirarCamara(dt) {
    const camara = suelo.worldToLocal(ar.camara.position.clone());
    const d = camara.sub(mascota.objeto.position);
    mascota.objeto.rotation.y += angulo(Math.atan2(d.x, d.z) - mascota.objeto.rotation.y) * Math.min(1, dt * 3);
  }

  function quieto(espera = 1.5 + Math.random() * 3) { tarea = { tipo: 'quieto', espera }; mascota.rebote = 0; mascota.aplastar = 0; }

  // --- Acciones que pide quien la cuida ---
  function comer() {
    if (cuidado.durmiendo) return avisar(`${cuidado.nombre} está dormida. Despiértala primero.`);
    if (cuidado.comida > 92) { mascota.expresion('triste'); setTimeout(() => mascota.expresion('contenta'), 900); return avisar(`${cuidado.nombre} no tiene hambre.`); }
    if (comida) suelo.remove(comida);
    comida = Math.random() < 0.5 ? manzana() : galleta();
    const lugar = alAzar(0.75);
    comida.position.set(lugar.x, 0.45, lugar.z);
    comida.userData.vel = 0;
    suelo.add(comida);
    sonar.pop();
    // Camina hasta quedar enfrente de la comida, y mastica
    const desde = new THREE.Vector3().subVectors(mascota.objeto.position, lugar).setY(0);
    const destino = lugar.clone().addScaledVector(desde.lengthSq() > 0 ? desde.normalize() : new THREE.Vector3(0, 0, 1), 0.075);
    mascota.expresion('sorpresa');
    caminar(destino, () => { tarea = { tipo: 'masticar', t: 0, mordidas: 0 }; }, 0.3);
  }

  function jugar() {
    if (cuidado.durmiendo) return avisar(`${cuidado.nombre} está dormida. Despiértala primero.`);
    if (cuidado.energia < 12) return avisar(`${cuidado.nombre} está muy cansada para jugar. 💤`);
    if (!bola) { bola = pelota(); suelo.add(bola); }
    bola.position.set(...alAzar(0.6).toArray()).setY(0.03);
    bola.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
    bola.visible = true;
    sonar.feliz();
    mascota.expresion('feliz');
    tarea = { tipo: 'jugar', t: 0, pateos: 0 };
  }

  function dormir() {
    if (cuidado.durmiendo) return despertar();
    if (cuidado.energia > 90) return avisar(`${cuidado.nombre} no tiene sueño.`);
    sonar.bostezo();
    caminar(CENTRO, () => { cuidado.durmiendo = true; cuidado.guardar(); tarea = { tipo: 'dormir' }; }, 0.15);
  }

  function despertar(gruñona = false) {
    cuidado.durmiendo = false;
    cuidado.guardar();
    mascota.dormida = false;
    mascota.expresion(gruñona ? 'triste' : 'contenta');
    if (gruñona) { sonar.triste(); avisar(`${cuidado.nombre} se despertó de malas. 😾`); setTimeout(() => mascota.expresion('contenta'), 1500); }
    quieto(2);
  }

  /** Tocar la mascota en la pantalla: cosquillas (o la despiertas) */
  function tocar(x, y) {
    if (!ancla.visible) return;
    const raycaster = new THREE.Raycaster();
    const r = ar.renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), ar.camara);
    if (!raycaster.intersectObject(mascota.objeto, true).length) return;
    if (cuidado.durmiendo) return despertar(true);
    mascota.risa = 0.8;
    mascota.expresion('feliz');
    sonar.risa();
    corazones(3);
    const ahora = performance.now();
    if (ahora - (tocar.ultima ?? 0) > 1500) { cuidado.cambiar({ animo: 4 }); tocar.ultima = ahora; }
  }

  // ------------------------------------------------------------------------
  // Cada cuadro
  // ------------------------------------------------------------------------
  function alCuadro(t, dt) {
    dt = Math.min(dt, 0.05);
    cuidado.tic(dt);
    ancla.grupo.updateMatrixWorld(true);
    mascota.mirada = ar.camara.position; // los ojos te siguen

    // Si se durmió estando fuera (o al volver sigue dormida), que duerma en su lugar
    if (cuidado.durmiendo && tarea.tipo !== 'dormir' && tarea.tipo !== 'caminar') tarea = { tipo: 'dormir' };

    switch (tarea.tipo) {
      case 'quieto': {
        mirarCamara(dt);
        mascota.expresion(cuidado.humor > 0.5 ? 'contenta' : cuidado.humor > 0 ? 'contenta' : 'triste');
        tarea.espera -= dt;
        if (tarea.espera < 0) {
          // A pasear (más corto y lento si está cansada o triste)
          const animada = cuidado.energia > 30 && cuidado.humor > 0;
          if (animada && Math.random() < 0.75) caminar(alAzar(0.7), () => quieto(), 0.18);
          else quieto();
        }
        break;
      }
      case 'caminar':
        if (avanzarHacia(tarea.destino, tarea.rapidez, dt)) tarea.alLlegar();
        break;
      case 'masticar': {
        tarea.t += dt;
        mascota.metas.boca = Math.abs(Math.sin(tarea.t * 9)) * 0.9;
        mascota.metas.entrecerrar = 0.5;
        const mordidas = Math.floor(tarea.t / 0.8);
        if (mordidas > tarea.mordidas && comida) {
          tarea.mordidas = mordidas;
          sonar.nam();
          comida.scale.setScalar(Math.max(0, 1 - mordidas / 3));
          for (let i = 0; i < 4; i++) emitir('✨', comida.position.clone().setY(0.03), { velocidad: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.15, (Math.random() - 0.5) * 0.2), gravedad: 0.6, vida: 0.6, tam: 0.02 });
        }
        if (tarea.t > 2.5) {
          if (comida) { suelo.remove(comida); comida = null; }
          mascota.metas.boca = 0;
          mascota.expresion('feliz');
          sonar.feliz();
          corazones(5);
          cuidado.cambiar({ comida: 30, animo: 5 });
          quieto(2);
        }
        break;
      }
      case 'jugar': {
        tarea.t += dt;
        // La pelota rueda, se frena y rebota en los bordes de la tarjeta
        const v = bola.userData.vel;
        bola.position.addScaledVector(v, dt);
        v.multiplyScalar(Math.max(0, 1 - 0.8 * dt));
        const l = limites();
        if (Math.abs(bola.position.x) > l.x) { bola.position.x = Math.sign(bola.position.x) * l.x; v.x *= -0.8; }
        if (Math.abs(bola.position.z) > l.z) { bola.position.z = Math.sign(bola.position.z) * l.z; v.z *= -0.8; }
        bola.rotation.z -= (v.x / 0.03) * dt;
        bola.rotation.x += (v.z / 0.03) * dt;
        // La mascota la persigue; al alcanzarla, la patea
        const llego = avanzarHacia(bola.position, 0.32, dt, 0.09);
        if (llego) {
          const dir = new THREE.Vector3().subVectors(bola.position, mascota.objeto.position).setY(0).normalize();
          dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.6);
          v.copy(dir.multiplyScalar(0.55 + Math.random() * 0.35));
          tarea.pateos++;
          sonar.pateo();
          mascota.aplastar = -0.15;
        }
        if (tarea.pateos >= 5 || tarea.t > 14) {
          bola.visible = false;
          cuidado.cambiar({ animo: 25, energia: -8, comida: -4 });
          sonar.feliz();
          corazones(6);
          mascota.expresion('feliz');
          quieto(2);
        }
        break;
      }
      case 'dormir': {
        mascota.dormida = true;
        mascota.rebote = 0;
        mascota.aplastar = 0;
        if (Math.random() < dt * 0.9) emitir('💤', cabeza().add(new THREE.Vector3(0.03, 0, 0)), { velocidad: new THREE.Vector3(0.03, 0.06, 0), vida: 2.2, tam: 0.04 });
        if (!cuidado.durmiendo) { // despertó sola (energía llena)
          mascota.dormida = false;
          sonar.feliz();
          avisar(`${cuidado.nombre} despertó con energía. ☀️`);
          quieto(2);
        }
        break;
      }
    }

    // La comida cae y rebota un poquito
    if (comida && comida.position.y > comida.userData.alto) {
      comida.userData.vel -= 2.5 * dt;
      comida.position.y += comida.userData.vel * dt;
      if (comida.position.y <= comida.userData.alto) {
        comida.position.y = comida.userData.alto;
        if (comida.userData.vel < -0.3) { comida.userData.vel *= -0.35; comida.position.y += 0.001; }
      }
    }

    // De noche las luces bajan
    const meta = mascota.dormida ? 0.35 : 1;
    cielo.intensity += (2.2 * meta - cielo.intensity) * Math.min(1, dt * 2);
    sol.intensity += (2.2 * meta - sol.intensity) * Math.min(1, dt * 2);

    mascota.actualizar(t, dt);
    sombraMascota.position.set(mascota.objeto.position.x, 0.001, mascota.objeto.position.z);
    sombraMascota.scale.setScalar(ESCALA * (0.95 - mascota.rebote * 0.8));

    // Burbuja de pensamiento: lo que más necesita
    const falta = cuidado.urgente;
    pensamiento.visible = !!falta && !mascota.dormida && tarea.tipo === 'quieto';
    if (pensamiento.visible) {
      pensamiento.poner(falta.emoji);
      pensamiento.position.copy(cabeza()).add(new THREE.Vector3(0.07, 0.06 + Math.sin(t * 2) * 0.008, 0));
    }

    // Partículas
    for (const p of particulas.slice()) {
      p.vida -= dt;
      p.velocidad.y -= p.gravedad * dt;
      p.s.position.addScaledVector(p.velocidad, dt);
      p.s.material.opacity = Math.min(1, p.vida / (p.total * 0.4));
      if (p.vida <= 0) { suelo.remove(p.s); p.s.material.dispose(); particulas.splice(particulas.indexOf(p), 1); }
    }
  }

  ar.alCuadro.push(alCuadro);
  return { mascota, comer, jugar, dormir, tocar, get tarea() { return tarea.tipo; } };
}
