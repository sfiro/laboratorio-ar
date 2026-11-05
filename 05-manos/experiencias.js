// Las cuatro experiencias del nivel 5. Todo se mide en PÍXELES de pantalla
// (la cámara es ortográfica: 1 unidad = 1 px, origen al centro, Y hacia arriba).
//
// Cada experiencia devuelve:
//   { nombre, ayuda, objetos: [...], alCuadro(t, dt, manos), activar?(), reiniciar?() }
import * as THREE from 'three';
import { PUNTAS, HUESOS } from './puente-manos.js';

const COLORES = ['#ff5d8f', '#ffd166', '#4fe3c1', '#4f8cff', '#b388ff', '#ff8a3d', '#7bed6f'];

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

/** Esqueleto de una mano: huesos (líneas) y articulaciones (puntos), siempre encima de todo */
function esqueleto(mano, { color = '#ffffff', opacidad = 0.6, grosorPunto = 9, colorPorDedo = false } = {}) {
  const pos = new THREE.BufferAttribute(new Float32Array(21 * 3), 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  const colores = new Float32Array(21 * 3);
  const dedoDe = (i) => (i === 0 ? -1 : Math.floor((i - 1) / 4)); // 0 pulgar … 4 meñique
  for (let i = 0; i < 21; i++) {
    const c = new THREE.Color(colorPorDedo && i > 0 ? COLORES[dedoDe(i)] : color);
    colores.set([c.r, c.g, c.b], i * 3);
  }
  const color3 = new THREE.BufferAttribute(colores, 3);
  // Las dos geometrías comparten los mismos puntos: las líneas usan un índice con los huesos
  const geoLineas = new THREE.BufferGeometry().setAttribute('position', pos).setAttribute('color', color3).setIndex(HUESOS.flat());
  const geoPuntos = new THREE.BufferGeometry().setAttribute('position', pos).setAttribute('color', color3);
  const lineas = new THREE.LineSegments(geoLineas,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: opacidad, depthTest: false }));
  const puntos = new THREE.Points(geoPuntos, new THREE.PointsMaterial({
    size: grosorPunto, vertexColors: true, map: texturaRedonda(), transparent: true, opacity: Math.min(1, opacidad + 0.3), depthTest: false,
  }));
  const grupo = new THREE.Group().add(lineas, puntos);
  grupo.renderOrder = 10;
  lineas.renderOrder = puntos.renderOrder = 10;
  lineas.frustumCulled = puntos.frustumCulled = false;
  grupo.actualizar = () => {
    grupo.visible = mano.visible;
    if (!mano.visible) return;
    mano.puntos.forEach((p, i) => pos.setXYZ(i, p.x, p.y, 0));
    pos.needsUpdate = true;
  };
  return grupo;
}

/** Aro que marca el punto de pellizco: hueco cuando está suelto, relleno al pellizcar */
function cursor(mano) {
  const aro = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.9, depthTest: false }));
  const centro = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.8, depthTest: false }));
  const grupo = new THREE.Group().add(aro, centro);
  grupo.renderOrder = aro.renderOrder = centro.renderOrder = 11;
  grupo.actualizar = (color = '#fff') => {
    grupo.visible = mano.visible;
    if (!mano.visible) return;
    grupo.position.set(mano.puntoPellizco.x, mano.puntoPellizco.y, 0);
    grupo.scale.setScalar(Math.max(10, mano.tamano * 0.16));
    aro.material.color.set(color);
    centro.material.color.set(color);
    centro.visible = mano.pellizco;
  };
  return grupo;
}

class Particulas {
  constructor({ cantidad = 600, tamano = 12 } = {}) {
    this.n = cantidad;
    this.pos = new Float32Array(cantidad * 3).fill(-99999);
    this.col = new Float32Array(cantidad * 3);
    this.vel = new Float32Array(cantidad * 3);
    this.vida = new Float32Array(cantidad);
    this.vidaInicial = new Float32Array(cantidad).fill(1);
    this.siguiente = 0;
    const geo = new THREE.BufferGeometry()
      .setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
      .setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.objeto = new THREE.Points(geo, new THREE.PointsMaterial({
      size: tamano, vertexColors: true, map: texturaRedonda(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.objeto.frustumCulled = false;
    this.objeto.renderOrder = 5;
  }

  /** Una explosión de n partículas en (x, y) */
  explotar(x, y, color, n = 30, rapidez = 400) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.siguiente;
      this.siguiente = (i + 1) % this.n;
      const a = Math.random() * Math.PI * 2, v = rapidez * (0.3 + Math.random() * 0.7);
      this.pos.set([x, y, 50], i * 3);
      this.vel.set([Math.cos(a) * v, Math.sin(a) * v, 0], i * 3);
      this.col.set([c.r, c.g, c.b], i * 3);
      this.vida[i] = this.vidaInicial[i] = 0.4 + Math.random() * 0.5;
    }
  }

  actualizar(dt, gravedad = 900) {
    for (let i = 0; i < this.n; i++) {
      if (this.vida[i] <= 0) { this.pos[i * 3 + 2] = -99999; continue; }
      this.vida[i] -= dt;
      this.vel[i * 3 + 1] -= gravedad * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      const f = Math.max(0, this.vida[i] / this.vidaInicial[i]); // se apaga al envejecer
      for (let k = 0; k < 3; k++) this.col[i * 3 + k] *= 0.97 + 0.03 * f;
    }
    this.objeto.geometry.attributes.position.needsUpdate = true;
    this.objeto.geometry.attributes.color.needsUpdate = true;
  }
}

function texturaRedonda() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function luces() {
  const sol = new THREE.DirectionalLight('#ffffff', 2.2);
  sol.position.set(-0.5, 1, 1.5);
  return [new THREE.HemisphereLight('#ffffff', '#445', 1.4), sol];
}

const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------------------
// 1. Atrapa y lanza: física hecha por nosotros
// ---------------------------------------------------------------------------
export function lanzar(ar) {
  const formas = [
    () => new THREE.SphereGeometry(1, 32, 16),
    () => new THREE.BoxGeometry(1.5, 1.5, 1.5),
    () => new THREE.IcosahedronGeometry(1.1, 0),
    () => new THREE.TorusGeometry(0.75, 0.32, 16, 32),
    () => new THREE.SphereGeometry(1, 32, 16),
    () => new THREE.DodecahedronGeometry(1.05, 0),
    () => new THREE.SphereGeometry(1, 32, 16),
  ];
  const cuerpos = formas.map((forma, i) => {
    const malla = new THREE.Mesh(forma(), new THREE.MeshStandardMaterial({ color: COLORES[i], roughness: 0.35, metalness: 0.1 }));
    return { malla, pos: new THREE.Vector2(), vel: new THREE.Vector2(), r: 1, agarradoPor: null, giro: Math.random() * 6 };
  });

  // Repisa: el "piso" de la física (encima de los botones de abajo)
  const repisa = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18 }));
  const manos = ar.manos;
  const esqueletos = manos.map((m) => esqueleto(m, { opacidad: 0.45 }));
  const cursores = manos.map((m) => cursor(m));
  const chispas = new Particulas({ cantidad: 200, tamano: 10 });
  let piso = 0;

  function medidas() {
    const radio = limitar(Math.min(ar.ancho, ar.alto) * 0.07, 22, 60);
    piso = -ar.alto / 2 + Math.min(190, ar.alto * 0.24);
    repisa.scale.set(ar.ancho, 4, 1);
    repisa.position.set(0, piso - 2, -100);
    for (const c of cuerpos) { c.r = radio * (0.85 + (c.giro % 1) * 0.3); c.malla.scale.setScalar(c.r); }
  }

  function reiniciar() {
    medidas();
    cuerpos.forEach((c, i) => {
      c.pos.set((i - (cuerpos.length - 1) / 2) * c.r * 2.3, ar.alto * 0.2 + Math.random() * ar.alto * 0.2);
      c.vel.set((Math.random() - 0.5) * 200, 0);
      c.agarradoPor = null;
    });
  }

  // Al pellizcar: agarrar el objeto más cercano al punto de pellizco (si está cerca)
  for (const mano of manos) {
    mano.alPellizcar.push(() => {
      if (!activa) return;
      let elegido = null, mejor = Infinity;
      for (const c of cuerpos) {
        const d = c.pos.distanceTo(mano.puntoPellizco);
        if (!c.agarradoPor && d < c.r * 1.7 + mano.tamano * 0.15 && d < mejor) { elegido = c; mejor = d; }
      }
      if (elegido) elegido.agarradoPor = mano;
    });
    // Al soltar: el objeto sale con la velocidad que llevaba la mano → ¡lanzar!
    mano.alSoltar.push(() => {
      for (const c of cuerpos) if (c.agarradoPor === mano) {
        c.agarradoPor = null;
        c.vel.set(mano.velocidad.x, mano.velocidad.y).multiplyScalar(1.25); // un empujoncito extra se siente mejor
        if (c.vel.length() > 4000) c.vel.setLength(4000);
      }
    });
  }

  let activa = false;
  let medidasDe = '';

  function fisica(dt) {
    const g = ar.alto * 2.4; // gravedad en px/s², proporcional a la pantalla
    const izq = -ar.ancho / 2, der = ar.ancho / 2, techo = ar.alto / 2;
    for (const c of cuerpos) {
      if (c.agarradoPor) {
        // Pegado al pellizco (con un poquito de retraso para que se sienta con peso)
        c.pos.lerp(c.agarradoPor.puntoPellizco, 0.6);
        c.vel.set(c.agarradoPor.velocidad.x, c.agarradoPor.velocidad.y);
        continue;
      }
      c.vel.y -= g * dt;
      c.pos.addScaledVector(c.vel, dt);
      // Rebotes con las paredes, el techo y la repisa (perdiendo energía)
      if (c.pos.x < izq + c.r) { c.pos.x = izq + c.r; c.vel.x = Math.abs(c.vel.x) * 0.7; }
      if (c.pos.x > der - c.r) { c.pos.x = der - c.r; c.vel.x = -Math.abs(c.vel.x) * 0.7; }
      if (c.pos.y > techo - c.r) { c.pos.y = techo - c.r; c.vel.y = -Math.abs(c.vel.y) * 0.7; }
      if (c.pos.y < piso + c.r) {
        c.pos.y = piso + c.r;
        if (c.vel.y < -g * 0.08) chispas.explotar(c.pos.x, piso, c.malla.material.color, 6, 150);
        c.vel.y = Math.abs(c.vel.y) * 0.55;
        c.vel.x *= 0.985; // fricción
        if (c.vel.y < 40) c.vel.y = 0;
      }
    }
    // Choques entre objetos (círculos de igual masa)
    for (let i = 0; i < cuerpos.length; i++) for (let j = i + 1; j < cuerpos.length; j++) {
      const a = cuerpos[i], b = cuerpos[j];
      const n = new THREE.Vector2().subVectors(b.pos, a.pos);
      const d = n.length(), minimo = a.r + b.r;
      if (d >= minimo || d === 0) continue;
      n.divideScalar(d);
      const empuje = (minimo - d) / 2;
      // Los agarrados no se mueven: empujan
      if (!a.agarradoPor) a.pos.addScaledVector(n, b.agarradoPor ? -empuje * 2 : -empuje);
      if (!b.agarradoPor) b.pos.addScaledVector(n, a.agarradoPor ? empuje * 2 : empuje);
      const relativa = new THREE.Vector2().subVectors(a.vel, b.vel).dot(n);
      if (relativa > 0) { // se acercan → intercambian impulso
        const impulso = relativa * 0.9;
        if (!a.agarradoPor) a.vel.addScaledVector(n, -impulso);
        if (!b.agarradoPor) b.vel.addScaledVector(n, impulso);
      }
    }
    // Las puntas de los dedos empujan los objetos (aunque no los agarres)
    for (const mano of manos) {
      if (!mano.visible) continue;
      const rDedo = mano.tamano * 0.13;
      for (const k of Object.values(PUNTAS)) {
        const p = mano.puntos[k];
        for (const c of cuerpos) {
          if (c.agarradoPor) continue;
          const n = new THREE.Vector2(c.pos.x - p.x, c.pos.y - p.y);
          const d = n.length();
          if (d >= c.r + rDedo || d === 0) continue;
          n.divideScalar(d);
          c.pos.addScaledVector(n, c.r + rDedo - d);
          const velMano = n.x * mano.velocidad.x + n.y * mano.velocidad.y;
          const velObj = c.vel.dot(n);
          if (velMano > velObj) c.vel.addScaledVector(n, velMano - velObj + 60);
        }
      }
    }
  }

  return {
    nombre: 'Lanzar',
    cuerpos,
    ayuda: 'Pellizca un objeto para agarrarlo, muévelo y suéltalo para lanzarlo. Con los dedos también los empujas.',
    objetos: [...luces(), repisa, ...cuerpos.map((c) => c.malla), chispas.objeto, ...esqueletos, ...cursores],
    activar() { activa = true; },
    desactivar() { activa = false; },
    reiniciar,
    alCuadro(t, dt) {
      const clave = `${ar.ancho}x${ar.alto}`;
      if (clave !== medidasDe) { medidasDe ? medidas() : reiniciar(); medidasDe = clave; }
      // Dos pasos de física por cuadro: los choques rápidos se resuelven mejor
      fisica(dt / 2);
      fisica(dt / 2);
      for (const c of cuerpos) {
        c.malla.position.set(c.pos.x, c.pos.y, 0);
        if (!c.agarradoPor) c.malla.rotation.z -= (c.vel.x / c.r) * dt; // rueda según su velocidad
        c.malla.rotation.x += dt * 0.3;
        const meta = c.agarradoPor ? 1.18 : 1;
        c.malla.scale.setScalar(THREE.MathUtils.lerp(c.malla.scale.x, c.r * meta, 0.3));
        c.malla.material.emissive.set(c.agarradoPor ? c.malla.material.color : '#000').multiplyScalar(0.35);
      }
      chispas.actualizar(dt);
      esqueletos.forEach((e) => e.actualizar());
      cursores.forEach((cu, i) => {
        // El cursor se pinta del color del objeto que podrías agarrar
        const m = manos[i];
        const cerca = cuerpos.find((c) => c.agarradoPor === m) ??
          cuerpos.find((c) => !c.agarradoPor && c.pos.distanceTo(m.puntoPellizco) < c.r * 1.7 + m.tamano * 0.15);
        cu.actualizar(cerca ? '#' + cerca.malla.material.color.getHexString() : '#ffffff');
      });
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Pintar en el aire: trazos de luz hechos con tiras de triángulos
// ---------------------------------------------------------------------------
class Trazo {
  constructor(color, ancho) {
    this.puntos = [];
    this.ancho = ancho;
    const crear = (opacidad, factor) => {
      const malla = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: opacidad, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      malla.factor = factor;
      malla.frustumCulled = false;
      return malla;
    };
    this.brillo = crear(0.25, 3.2); // el halo, ancho y tenue
    this.nucleo = crear(1, 1);      // la línea, delgada y fuerte
    this.nucleo.userData.color = color;
    this.nucleo.material.color.lerp(new THREE.Color('#fff'), 0.45);
    this.grupo = new THREE.Group().add(this.brillo, this.nucleo);
  }

  agregar(p) {
    const ultimo = this.puntos.at(-1);
    if (ultimo && ultimo.distanceTo(p) < 3) return; // no guardar puntos repetidos
    this.puntos.push(new THREE.Vector2(p.x, p.y));
    for (const malla of [this.brillo, this.nucleo]) this.#construir(malla);
  }

  // Una tira: por cada punto, dos vértices separados "a los lados" de la dirección del trazo
  #construir(malla) {
    const n = this.puntos.length;
    if (n < 2) return;
    const v = new Float32Array(n * 2 * 3);
    const medio = (this.ancho * malla.factor) / 2;
    for (let i = 0; i < n; i++) {
      const a = this.puntos[Math.max(0, i - 1)], b = this.puntos[Math.min(n - 1, i + 1)];
      const dir = new THREE.Vector2().subVectors(b, a).normalize();
      const lado = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(medio);
      const p = this.puntos[i];
      v.set([p.x + lado.x, p.y + lado.y, 0, p.x - lado.x, p.y - lado.y, 0], i * 6);
    }
    const indices = [];
    for (let i = 0; i < n - 1; i++) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    malla.geometry.dispose();
    malla.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(v, 3)).setIndex(indices);
  }

  quitar() {
    for (const m of [this.brillo, this.nucleo]) { m.geometry.dispose(); m.material.dispose(); }
    this.grupo.removeFromParent();
  }
}

export function pintar(ar) {
  const manos = ar.manos;
  const lienzo = new THREE.Group();
  const esqueletos = manos.map((m) => esqueleto(m, { opacidad: 0.3 }));
  const cursores = manos.map((m) => cursor(m));
  const colorDe = manos.map((_, i) => i * 2); // cada mano empieza con un color distinto
  const actual = [null, null];
  const ultimoGesto = ['', ''];
  const palma = [0, 0]; // segundos con la mano abierta
  let trazos = [];

  // Aro de progreso para borrar
  const progreso = manos.map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48, 1, 0, 0.01), new THREE.MeshBasicMaterial({ color: '#fff', depthTest: false, transparent: true }));
    m.renderOrder = 12;
    return m;
  });

  for (const [i, mano] of manos.entries()) {
    mano.alPellizcar.push(() => {
      if (!activa) return;
      const t = new Trazo(COLORES[colorDe[i] % COLORES.length], limitar(mano.tamano * 0.07, 4, 14));
      lienzo.add(t.grupo);
      trazos.push(t);
      actual[i] = t;
    });
    mano.alSoltar.push(() => { actual[i] = null; });
  }

  function borrar() {
    trazos.forEach((t) => t.quitar());
    trazos = [];
    actual.fill(null);
  }

  let activa = false;
  return {
    nombre: 'Pintar',
    ayuda: 'Pellizca y mueve la mano para pintar. ✌️ cambia de color. 🖐️ quieta 1 segundo borra todo.',
    objetos: [lienzo, ...esqueletos, ...cursores, ...progreso],
    activar() { activa = true; },
    desactivar() { activa = false; actual.fill(null); },
    reiniciar: borrar,
    alCuadro(t, dt) {
      manos.forEach((mano, i) => {
        if (actual[i] && mano.visible) {
          // Un salto muy grande (la detección se confundió un instante) empieza un trazo nuevo
          const ultimo = actual[i].puntos.at(-1);
          if (ultimo && ultimo.distanceTo(mano.puntoPellizco) > mano.tamano * 1.5) {
            actual[i] = new Trazo(actual[i].nucleo.userData.color, actual[i].ancho);
            lienzo.add(actual[i].grupo);
            trazos.push(actual[i]);
          }
          actual[i].agregar(mano.puntoPellizco);
        }
        // ✌️ cambia de color (solo al aparecer el gesto, no en cada cuadro)
        const g = mano.visible ? mano.gesto?.nombre ?? '' : '';
        if (g === 'paz' && ultimoGesto[i] !== 'paz') colorDe[i]++;
        ultimoGesto[i] = g;
        // 🖐️ quieta → borrar
        const quieta = g === 'mano abierta' && mano.velocidad.length() < mano.tamano * 2.5;
        palma[i] = quieta ? palma[i] + dt : 0;
        const p = progreso[i];
        p.visible = palma[i] > 0.15;
        if (p.visible) {
          p.geometry.dispose();
          p.geometry = new THREE.RingGeometry(0.85, 1, 48, 1, Math.PI / 2, -Math.min(1, palma[i] / 1.2) * Math.PI * 2);
          p.position.set(mano.puntos[9].x, mano.puntos[9].y, 0);
          p.scale.setScalar(mano.tamano * 0.9);
        }
        if (palma[i] > 1.2) { borrar(); palma[i] = -1; }
      });
      esqueletos.forEach((e) => e.actualizar());
      cursores.forEach((c, i) => c.actualizar(COLORES[colorDe[i] % COLORES.length]));
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Burbujas: un juego de 30 segundos
// ---------------------------------------------------------------------------
function materialBurbuja(dorada) {
  // Shader propio: transparente en el centro y brillante en el borde (efecto Fresnel),
  // con colores de arcoíris que cambian según el ángulo, como el jabón.
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { tiempo: { value: 0 }, dorada: { value: dorada ? 1 : 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float tiempo;
      uniform float dorada;
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        float borde = pow(1.0 - abs(vNormal.z), 2.0);
        vec3 arcoiris = 0.5 + 0.5 * cos(6.2831 * (borde * 1.3 + vPos.y * 0.3 + tiempo * 0.15 + vec3(0.0, 0.33, 0.67)));
        vec3 color = mix(arcoiris, vec3(1.0, 0.8, 0.25), dorada * 0.85);
        float reflejo = smoothstep(0.88, 0.97, dot(vNormal, normalize(vec3(-0.5, 0.6, 0.6))));
        float alfa = 0.08 + borde * 0.75 + reflejo * 0.8 + dorada * 0.15;
        gl_FragColor = vec4(color + reflejo, alfa);
      }`,
  });
}

export function burbujas(ar, marcador) {
  const manos = ar.manos;
  const DURACION = 30;
  const geo = new THREE.SphereGeometry(1, 32, 16);
  const esqueletos = manos.map((m) => esqueleto(m, { opacidad: 0.35 }));
  // Las puntas de los dedos, para que se vea con qué revientas
  const puntas = manos.map(() => {
    const p = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3)),
      new THREE.PointsMaterial({ size: 22, map: texturaRedonda(), color: '#9ff', transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    p.renderOrder = 11;
    p.frustumCulled = false;
    return p;
  });
  const chispas = new Particulas({ cantidad: 800, tamano: 14 });
  const grupo = new THREE.Group();
  let lista = [], puntos = 0, tiempoRestante = DURACION, espera = 0, jugando = false;
  let record = 0;
  try { record = +localStorage.getItem('ar-burbujas-record') || 0; } catch { /* sin almacenamiento */ }

  function nueva() {
    const dorada = Math.random() < 0.1;
    const r = limitar(Math.min(ar.ancho, ar.alto) * (0.06 + Math.random() * 0.06), 22, 75) * (dorada ? 0.75 : 1);
    const malla = new THREE.Mesh(geo, materialBurbuja(dorada));
    malla.scale.setScalar(r);
    grupo.add(malla);
    lista.push({
      malla, r, dorada,
      x: (Math.random() - 0.5) * (ar.ancho - r * 2),
      y: -ar.alto / 2 - r,
      sube: ar.alto * (0.12 + Math.random() * 0.12) * (dorada ? 1.6 : 1),
      fase: Math.random() * 6,
    });
  }

  function quitar(b) {
    b.malla.material.dispose();
    grupo.remove(b.malla);
    lista = lista.filter((o) => o !== b);
  }

  function empezar() {
    lista.slice().forEach(quitar);
    puntos = 0;
    tiempoRestante = DURACION;
    jugando = true;
  }

  function pintarMarcador() {
    marcador.innerHTML = jugando
      ? `<div class="grande">⭐ ${puntos}</div><div>⏱ ${Math.ceil(tiempoRestante)} s · Récord ${record}</div>`
      : `<div class="grande">¡Tiempo! ⭐ ${puntos}</div><div>${puntos > 0 && puntos >= record ? '¡Nuevo récord! 🎉' : `Récord ${record}`}</div><div>Pellizca para jugar otra vez</div>`;
  }

  for (const mano of manos) mano.alPellizcar.push(() => { if (activa && !jugando) empezar(); });

  let activa = false;
  return {
    nombre: 'Burbujas',
    ayuda: 'Revienta las burbujas con la punta de los dedos. Las doradas valen 5.',
    panel: marcador,
    objetos: [grupo, chispas.objeto, ...esqueletos, ...puntas],
    activar() { activa = true; empezar(); },
    desactivar() { activa = false; },
    reiniciar: empezar,
    alCuadro(t, dt) {
      if (jugando) {
        tiempoRestante -= dt;
        espera -= dt;
        if (espera <= 0) { nueva(); espera = 0.35 + Math.random() * 0.45; }
        if (tiempoRestante <= 0) {
          jugando = false;
          if (puntos > record) { record = puntos; try { localStorage.setItem('ar-burbujas-record', record); } catch { /* nada */ } }
        }
      }
      // Mover las burbujas: suben y se mecen de lado a lado
      for (const b of lista.slice()) {
        b.y += b.sube * dt;
        b.malla.position.set(b.x + Math.sin(t * 1.5 + b.fase) * b.r * 0.6, b.y, 0);
        b.malla.material.uniforms.tiempo.value = t + b.fase;
        if (b.y > ar.alto / 2 + b.r * 2) quitar(b);
      }
      // ¿Alguna punta de dedo dentro de una burbuja? → ¡pop!
      manos.forEach((mano, i) => {
        puntas[i].visible = mano.visible;
        if (!mano.visible) return;
        const pos = puntas[i].geometry.attributes.position;
        Object.values(PUNTAS).forEach((k, j) => {
          const p = mano.puntos[k];
          pos.setXYZ(j, p.x, p.y, 0);
          for (const b of lista.slice()) {
            if (Math.hypot(b.malla.position.x - p.x, b.malla.position.y - p.y) < b.r * 1.05) {
              chispas.explotar(b.malla.position.x, b.malla.position.y, b.dorada ? '#ffd166' : '#9ef', b.dorada ? 60 : 28, b.r * 7);
              if (jugando) puntos += b.dorada ? 5 : 1;
              quitar(b);
            }
          }
        });
        pos.needsUpdate = true;
      });
      chispas.actualizar(dt, 300);
      esqueletos.forEach((e) => e.actualizar());
      pintarMarcador();
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Gestos: lo que ve la computadora
// ---------------------------------------------------------------------------
function etiquetaEmoji() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const textura = new THREE.CanvasTexture(c);
  textura.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, depthTest: false, transparent: true }));
  sprite.renderOrder = 12;
  let actual = null;
  sprite.poner = (emoji) => {
    if (emoji === actual) return;
    actual = emoji;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji ?? '', 64, 70);
    textura.needsUpdate = true;
  };
  return sprite;
}

export function gestos(ar, panel) {
  const manos = ar.manos;
  const esqueletos = manos.map((m) => esqueleto(m, { opacidad: 0.95, grosorPunto: 14, colorPorDedo: true }));
  const emojis = manos.map(() => etiquetaEmoji());
  const NOMBRES = { pulgar: 'Pulgar', indice: 'Índice', medio: 'Medio', anular: 'Anular', menique: 'Meñique' };

  return {
    nombre: 'Gestos',
    ayuda: 'Prueba ✊ 🖐️ ✌️ ☝️ 🤘 🤙 👍 👎 y pellizca. Los colores son los dedos.',
    panel,
    objetos: [...esqueletos, ...emojis],
    alCuadro() {
      esqueletos.forEach((e) => e.actualizar());
      manos.forEach((m, i) => {
        emojis[i].visible = m.visible && !!m.gesto;
        if (!emojis[i].visible) return;
        emojis[i].poner(m.gesto.emoji);
        // Encima de la mano: el punto más alto, más un poco
        const arriba = Math.max(...m.puntos.map((p) => p.y));
        emojis[i].position.set(m.puntos[9].x, arriba + m.tamano * 0.7, 0);
        emojis[i].scale.setScalar(limitar(m.tamano * 0.9, 50, 160));
      });
      const visibles = manos.filter((m) => m.visible);
      panel.innerHTML = visibles.length === 0
        ? '<div class="sin-mano">Muestra una mano a la cámara</div>'
        : visibles.map((m) => `
          <div class="mano-datos">
            <div class="titulo">Mano ${m.lado} ${m.gesto ? `· ${m.gesto.emoji} ${m.gesto.nombre}` : ''}</div>
            <div class="dedos">${Object.entries(m.dedos).map(([d, on], k) =>
              `<span class="${on ? 'on' : ''}" style="--c:${COLORES[k]}">${NOMBRES[d]}</span>`).join('')}</div>
            <div class="fila"><span>Dedos estirados</span><b>${m.cuantosDedos}</b></div>
            <div class="fila"><span>Pellizco ${m.pellizco ? '🤏' : ''}</span><div class="barra"><div style="width:${limitar(100 - m.aperturaPellizco * 100, 0, 100)}%"></div></div></div>
            <div class="fila"><span>Velocidad</span><b>${Math.round(m.velocidad.length())} px/s</b></div>
          </div>`).join('');
    },
  };
}
