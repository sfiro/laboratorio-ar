// Los tres modos del nivel 7. Todo en METROS (y = arriba).
//
// Cada modo devuelve:
//   { nombre, ayuda, paleta?, botones: [{ texto, accion, apagado?() }], panel(),
//     tocar(rayo), presionar?(rayo) → bool, arrastrar?(golpe), soltar?(golpe), alCuadro(t, dt) }
// Comparten un "mundo": los objetos que pusiste también estorban a las pelotas.
import * as THREE from 'three';
import { CATALOGO, sombra } from './objetos.js';

const ARRIBA = new THREE.Vector3(0, 1, 0);

/** Lo que hay en el centro de la pantalla, copiado (para que no cambie después) */
const golpeDeMira = (ar) => ({ posicion: ar.mira.posicion.clone(), normal: ar.mira.normal.clone(), horizontal: ar.mira.horizontal, resultado: ar.mira.resultado });

/** Ángulo (en Y) para que algo en "posicion" mire hacia la cámara */
function haciaLaCamara(ar, posicion) {
  const c = ar.camara.getWorldPosition(new THREE.Vector3());
  return Math.atan2(c.x - posicion.x, c.z - posicion.z);
}

function etiqueta(alto = 0.05) {
  const c = document.createElement('canvas');
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ sizeAttenuation: false, depthTest: false, transparent: true }));
  sprite.renderOrder = 40;
  sprite.center.set(0.5, 0);
  sprite.poner = (texto) => {
    const ctx = c.getContext('2d');
    ctx.font = '700 56px system-ui, sans-serif';
    c.width = ctx.measureText(texto).width + 48;
    c.height = 84;
    ctx.fillStyle = '#0b0d12d9';
    ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, 24); ctx.fill();
    ctx.font = '700 56px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 24, 44);
    sprite.material.map?.dispose();
    sprite.material.map = new THREE.CanvasTexture(c);
    sprite.material.map.colorSpace = THREE.SRGBColorSpace;
    sprite.material.needsUpdate = true;
    sprite.scale.set((alto * c.width) / c.height, alto, 1);
  };
  return sprite;
}

// ---------------------------------------------------------------------------
// 1. Colocar: decora tu espacio
// ---------------------------------------------------------------------------
export function colocar(ar, mundo) {
  let elegido = CATALOGO[0];
  let seleccionado = null, arrastrando = null;
  let aviso = '';
  const anillo = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4fe3c1', transparent: true, opacity: 0.9, depthWrite: false }));
  anillo.renderOrder = 5;
  anillo.visible = false;
  ar.escena.add(anillo);

  function seleccionar(o) { seleccionado = o; }

  function poner(golpe) {
    const def = elegido.crear();
    const base = new THREE.Group();
    base.add(def.objeto, sombra(def.radio));
    base.position.copy(golpe.posicion);
    base.rotation.y = haciaLaCamara(ar, golpe.posicion); // que te dé el frente
    base.userData = { def, tipo: elegido };
    ar.escena.add(base);
    mundo.colocados.push(base);
    ar.anclar(base, golpe);
    seleccionar(base);
    aviso = '';
  }

  /** ¿El rayo del dedo toca algún objeto puesto? Devuelve el objeto completo (su "base") */
  function objetoEn(rayo) {
    if (!rayo || !mundo.colocados.length) return null;
    const raycaster = new THREE.Raycaster(rayo.origin, rayo.direction);
    const golpes = raycaster.intersectObjects(mundo.colocados, true).filter((g) => g.object.name !== 'sombra');
    let o = golpes[0]?.object;
    while (o && !mundo.colocados.includes(o)) o = o.parent;
    return o ?? null;
  }

  function quitar() {
    if (!seleccionado) return;
    ar.desanclar(seleccionado);
    ar.escena.remove(seleccionado);
    mundo.colocados.splice(mundo.colocados.indexOf(seleccionado), 1);
    seleccionado = null;
  }

  return {
    nombre: 'Colocar',
    ayuda: 'Apunta al piso o a una mesa y toca para poner el objeto. Arrastra un objeto para moverlo.',
    paleta: {
      opciones: CATALOGO.map((c) => ({ id: c.id, texto: `${c.emoji} ${c.nombre}` })),
      elegido: () => elegido.id,
      elegir: (id) => { elegido = CATALOGO.find((c) => c.id === id); },
    },
    botones: [
      { texto: '⟳ Girar', accion: () => { if (seleccionado) seleccionado.rotation.y += Math.PI / 4; }, apagado: () => !seleccionado },
      { texto: '🗑️ Quitar', accion: quitar, apagado: () => !seleccionado },
    ],
    panel: () => {
      if (aviso) return `<div class="aviso">${aviso}</div>`;
      if (!ar.mira.visible) return '<div>Mueve el celular despacio, apuntando al piso, para que encuentre superficies.</div>';
      return seleccionado ? `<div>${seleccionado.userData.tipo.emoji} ${seleccionado.userData.tipo.nombre} · ${mundo.colocados.length} en total</div>` : '';
    },
    presionar(rayo) {
      const o = objetoEn(rayo);
      if (!o) return false;
      seleccionar(o);
      arrastrando = o;
      ar.desanclar(o); // mientras lo mueves deja de estar anclado
      return true;
    },
    arrastrar(golpe) { if (arrastrando && golpe.horizontal) arrastrando.position.copy(golpe.posicion); },
    soltar(golpe) {
      if (arrastrando && golpe?.horizontal) ar.anclar(arrastrando, golpe);
      arrastrando = null;
    },
    tocar(rayo) {
      if (objetoEn(rayo)) return; // tocaste un objeto: ya quedó seleccionado
      if (!ar.mira.visible) { aviso = 'Aún no encuentro superficies. Mueve el celular despacio.'; return; }
      if (!ar.mira.horizontal) { aviso = 'Eso parece una pared. Apunta a una superficie horizontal.'; return; }
      poner(golpeDeMira(ar));
    },
    alCuadro(t) {
      for (const o of mundo.colocados) o.userData.def.animar?.(t, ar.camara);
      anillo.visible = !!seleccionado && this.activo;
      if (seleccionado) {
        anillo.position.copy(seleccionado.position).y += 0.004;
        anillo.scale.setScalar(seleccionado.userData.def.radio * 1.35 * (1 + Math.sin(t * 5) * 0.04));
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Medir: una cinta métrica
// ---------------------------------------------------------------------------
export function medir(ar) {
  const grupo = new THREE.Group();
  ar.escena.add(grupo);
  const materialLinea = new THREE.MeshBasicMaterial({ color: '#ffd166', depthTest: false });
  const materialPunto = new THREE.MeshBasicMaterial({ color: '#fff', depthTest: false });
  const medidas = []; // { objetos: [...], metros }
  let inicio = null;   // { punto, bolita }

  const texto = (m) => (m < 0.995 ? `${(m * 100).toFixed(1)} cm` : `${m.toFixed(2)} m`);

  function bolita(p) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 8), materialPunto);
    b.position.copy(p);
    b.renderOrder = 35;
    grupo.add(b);
    return b;
  }

  // Una "línea" gruesa: un cilindro delgado estirado entre a y b
  function linea(material) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 8), material);
    l.renderOrder = 34;
    l.ubicar = (a, b) => {
      const d = new THREE.Vector3().subVectors(b, a);
      l.scale.y = Math.max(d.length(), 0.0001);
      l.position.addVectors(a, b).multiplyScalar(0.5);
      l.quaternion.setFromUnitVectors(ARRIBA, d.normalize());
    };
    grupo.add(l);
    return l;
  }

  // Vista previa: del punto de inicio a la mira
  const previa = linea(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthTest: false }));
  const etPrevia = etiqueta(0.045);
  grupo.add(etPrevia);

  return {
    nombre: 'Medir',
    ayuda: 'Toca en el inicio y luego en el final de lo que quieras medir.',
    botones: [
      { texto: '↶ Deshacer', accion: () => {
        if (inicio) { grupo.remove(inicio.bolita); inicio = null; return; }
        medidas.pop()?.objetos.forEach((o) => grupo.remove(o));
      }, apagado: () => !inicio && !medidas.length },
      { texto: '🗑️ Borrar', accion: () => {
        medidas.splice(0).forEach((m) => m.objetos.forEach((o) => grupo.remove(o)));
        if (inicio) grupo.remove(inicio.bolita);
        inicio = null;
      }, apagado: () => !inicio && !medidas.length },
    ],
    panel: () => {
      const lista = medidas.slice(-4).map((m, i) => `<div>📏 ${medidas.length - Math.min(4, medidas.length) + i + 1}. <b>${texto(m.metros)}</b></div>`).join('');
      const paso = !ar.mira.visible ? 'Mueve el celular despacio para encontrar superficies.' : inicio ? 'Ahora toca en el <b>final</b>.' : 'Toca en el <b>inicio</b>.';
      return `<div>${paso}</div>${lista}`;
    },
    tocar() {
      if (!ar.mira.visible) return;
      const p = ar.mira.posicion.clone();
      if (!inicio) { inicio = { punto: p, bolita: bolita(p) }; return; }
      const fin = bolita(p);
      const l = linea(materialLinea);
      l.ubicar(inicio.punto, p);
      const metros = inicio.punto.distanceTo(p);
      const et = etiqueta();
      et.poner(texto(metros));
      et.position.addVectors(inicio.punto, p).multiplyScalar(0.5).y += 0.015;
      grupo.add(et);
      medidas.push({ objetos: [inicio.bolita, fin, l, et], metros });
      inicio = null;
    },
    alCuadro() {
      grupo.visible = this.activo;
      const ver = !!inicio && ar.mira.visible;
      previa.visible = etPrevia.visible = ver;
      if (ver) {
        previa.ubicar(inicio.punto, ar.mira.posicion);
        etPrevia.poner(texto(inicio.punto.distanceTo(ar.mira.posicion)));
        etPrevia.position.addVectors(inicio.punto, ar.mira.posicion).multiplyScalar(0.5).y += 0.015;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Pelotas: rebotan en TU piso y en tus mesas (física hecha por nosotros)
// ---------------------------------------------------------------------------
const COLORES = ['#ff5d8f', '#ffd166', '#4fe3c1', '#4f8cff', '#b388ff', '#ff8a3d'];
const GRAVEDAD = 9.8;
const RADIO = 0.06;

function canasta() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#3a3f48', metalness: 0.6, roughness: 0.4 });
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.02), new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.4 }));
  tablero.position.set(0, 1.2, -0.02);
  const cuadro = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.005), new THREE.MeshStandardMaterial({ color: '#e5484d' }));
  cuadro.position.set(0, 1.1, -0.007);
  const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 12), metal);
  poste.position.set(0, 0.65, -0.06);
  const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.04, 24), metal);
  pie.position.set(0, 0.02, -0.06);
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 8, 40), new THREE.MeshStandardMaterial({ color: '#ff7a1a', metalness: 0.3, roughness: 0.4 }));
  aro.rotation.x = Math.PI / 2;
  aro.position.set(0, 1.0, 0.14);
  // La red: líneas de un cono truncado
  const red = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.08, 0.22, 16, 3, true), new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.7 }));
  red.position.set(0, 0.89, 0.14);
  const marco = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.46, 0.015), metal);
  marco.position.set(0, 1.2, -0.035);
  g.add(marco, tablero, cuadro, poste, pie, aro, red, sombra(0.25, 0.35));
  // Medidas para la física (en coordenadas de la canasta)
  g.userData = { aro: new THREE.Vector3(0, 1.0, 0.14), radioAro: 0.13, tubo: 0.008, tablero: { x: 0.3, yMin: 0.99, yMax: 1.41, z: -0.01 } };
  return g;
}

export function pelotas(ar, mundo) {
  const bolas = [];
  const geo = new THREE.SphereGeometry(RADIO, 24, 16);
  let canastas = 0, aro = null, aviso = '';
  let verSuperficies = false;
  const puntosSuperficie = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: '#4fe3c1', size: 0.02, transparent: true, opacity: 0.8 }));
  ar.escena.add(puntosSuperficie);

  function lanzar(rayo) {
    // Sale desde la cámara, hacia donde tocaste, con un poquito de arco
    const camara = ar.camara.getWorldPosition(new THREE.Vector3());
    const dir = rayo ? rayo.direction.clone() : ar.camara.getWorldDirection(new THREE.Vector3());
    const malla = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: COLORES[bolas.length % COLORES.length], roughness: 0.35 }));
    const s = sombra(RADIO, 0.5);
    ar.escena.add(malla, s);
    bolas.push({
      malla, sombra: s,
      pos: camara.addScaledVector(dir, 0.2),
      vel: dir.multiplyScalar(4.2).add(new THREE.Vector3(0, 1.3, 0)),
      edad: 0,
    });
    if (bolas.length > 25) quitar(bolas[0]);
  }

  function quitar(b) {
    ar.escena.remove(b.malla, b.sombra);
    b.malla.material.dispose();
    bolas.splice(bolas.indexOf(b), 1);
  }

  /** La superficie conocida más alta que está debajo de (x, z) y por debajo de "y" */
  function superficieBajo(x, y, z) {
    let mejor = ar.alturaPiso();
    for (const p of ar.parches) {
      if (p.y > mejor && p.y <= y + 0.02 && Math.hypot(p.x - x, p.z - z) < 0.2) mejor = p.y;
    }
    return mejor;
  }

  function paso(b, dt) {
    const antes = b.pos.clone();
    b.vel.y -= GRAVEDAD * dt;
    b.pos.addScaledVector(b.vel, dt);

    // Piso y mesas: si atravesó la superficie, rebota (pierde energía)
    const suelo = superficieBajo(b.pos.x, antes.y - RADIO, b.pos.z);
    if (b.pos.y - RADIO < suelo) {
      b.pos.y = suelo + RADIO;
      if (b.vel.y < 0) b.vel.y = Math.abs(b.vel.y) < 0.4 ? 0 : -b.vel.y * 0.62;
      const friccion = Math.max(0, 1 - 2.5 * dt); // al rodar se va frenando
      b.vel.x *= friccion;
      b.vel.z *= friccion;
    }

    // Paredes que el celular ya vio: pedacitos de plano de ~50 cm
    for (const w of ar.paredes) {
      const dist = (b.pos.x - w.x) * w.nx + (b.pos.z - w.z) * w.nz; // distancia al plano
      if (dist > RADIO || dist < -0.15) continue;
      const ladoX = b.pos.x - w.x - dist * w.nx, ladoZ = b.pos.z - w.z - dist * w.nz;
      if (Math.hypot(ladoX, ladoZ) > 0.3 || Math.abs(b.pos.y - w.y) > 0.3) continue;
      b.pos.x += (RADIO - dist) * w.nx;
      b.pos.z += (RADIO - dist) * w.nz;
      const vn = b.vel.x * w.nx + b.vel.z * w.nz;
      if (vn < 0) { b.vel.x -= 1.6 * vn * w.nx; b.vel.z -= 1.6 * vn * w.nz; }
    }

    // Objetos puestos: cilindros (radio y alto de cada objeto)
    for (const o of mundo.colocados) {
      const { radio, alto } = o.userData.def;
      const dx = b.pos.x - o.position.x, dz = b.pos.z - o.position.z;
      const d = Math.hypot(dx, dz);
      const arriba = o.position.y + alto;
      if (d < radio + RADIO && b.pos.y > o.position.y && b.pos.y - RADIO < arriba) {
        if (antes.y - RADIO >= arriba - 0.02) { // cayó encima
          b.pos.y = arriba + RADIO;
          b.vel.y = Math.abs(b.vel.y) * 0.5;
        } else if (d > 0) { // chocó de lado
          const nx = dx / d, nz = dz / d;
          b.pos.x = o.position.x + nx * (radio + RADIO);
          b.pos.z = o.position.z + nz * (radio + RADIO);
          const vn = b.vel.x * nx + b.vel.z * nz;
          if (vn < 0) { b.vel.x -= 1.6 * vn * nx; b.vel.z -= 1.6 * vn * nz; }
        }
      }
    }

    // Canasta: tablero, aro y ¡enceste!
    if (aro) {
      const local = aro.worldToLocal(b.pos.clone());
      const localAntes = aro.worldToLocal(antes.clone());
      const { aro: c, radioAro, tubo, tablero: t } = aro.userData;
      // Tablero: una pared delgada en z = t.z
      if (Math.abs(local.x) < t.x && local.y > t.yMin && local.y < t.yMax && local.z - RADIO < t.z && localAntes.z - RADIO >= t.z - 0.01) {
        local.z = t.z + RADIO;
        b.pos.copy(aro.localToWorld(local));
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(aro.matrixWorld);
        const vn = b.vel.dot(normal);
        if (vn < 0) b.vel.addScaledVector(normal, -1.6 * vn);
      }
      // Aro: el punto más cercano del círculo; si la pelota lo toca, rebota
      const radial = new THREE.Vector2(local.x - c.x, local.z - c.z);
      const cercano = new THREE.Vector3(c.x, c.y, c.z);
      if (radial.length() > 0) { radial.setLength(radioAro); cercano.x += radial.x; cercano.z += radial.y; }
      const empuje = new THREE.Vector3().subVectors(local, cercano);
      if (empuje.length() < RADIO + tubo && empuje.length() > 0) {
        empuje.setLength(RADIO + tubo);
        b.pos.copy(aro.localToWorld(cercano.add(empuje)));
        const normal = empuje.normalize().transformDirection(aro.matrixWorld);
        const vn = b.vel.dot(normal);
        if (vn < 0) b.vel.addScaledVector(normal, -1.5 * vn);
      }
      // ¿Cruzó el plano del aro, de arriba hacia abajo y por dentro?
      if (localAntes.y >= c.y && local.y < c.y && Math.hypot(local.x - c.x, local.z - c.z) < radioAro - RADIO * 0.3) {
        canastas++;
        aviso = '🏀 ¡Canasta!';
        // La red la frena: cae casi derecho
        b.vel.x *= 0.25;
        b.vel.z *= 0.25;
        b.vel.y *= 0.5;
        navigator.vibrate?.(120);
        setTimeout(() => { if (aviso === '🏀 ¡Canasta!') aviso = ''; }, 1500);
      }
    }
  }

  function chocarEntreSi() {
    for (let i = 0; i < bolas.length; i++) for (let j = i + 1; j < bolas.length; j++) {
      const a = bolas[i], b = bolas[j];
      const n = new THREE.Vector3().subVectors(b.pos, a.pos);
      const d = n.length();
      if (d >= RADIO * 2 || d === 0) continue;
      n.divideScalar(d);
      a.pos.addScaledVector(n, -(RADIO * 2 - d) / 2);
      b.pos.addScaledVector(n, (RADIO * 2 - d) / 2);
      const rel = new THREE.Vector3().subVectors(a.vel, b.vel).dot(n);
      if (rel > 0) { a.vel.addScaledVector(n, -rel * 0.9); b.vel.addScaledVector(n, rel * 0.9); }
    }
  }

  return {
    nombre: 'Pelotas',
    bolas,
    ayuda: 'Toca para lanzar una pelota hacia ese punto. Rebotan en el piso y en las mesas que el celular ya vio.',
    botones: [
      { texto: '🏀 Poner canasta', accion: () => {
        if (!ar.mira.visible || !ar.mira.horizontal) { aviso = 'Apunta al piso para poner la canasta.'; return; }
        if (!aro) { aro = canasta(); ar.escena.add(aro); }
        aro.position.copy(ar.mira.posicion);
        aro.rotation.y = haciaLaCamara(ar, ar.mira.posicion);
        aro.updateMatrixWorld();
        ar.anclar(aro, golpeDeMira(ar));
        aviso = '';
      } },
      { texto: '🧹 Recoger', accion: () => { bolas.slice().forEach(quitar); }, apagado: () => !bolas.length },
      { texto: '👁️ Superficies', accion: () => { verSuperficies = !verSuperficies; } },
    ],
    panel: () => `
      ${aro ? `<div class="grande">🏀 ${canastas}</div>` : ''}
      ${aviso ? `<div class="aviso">${aviso}</div>` : ''}
      <div class="tenue">Superficies conocidas: ${ar.parches.length} puntos de piso y mesas, ${ar.paredes.length} de paredes. Mueve el celular por el cuarto para que conozca más.</div>`,
    tocar(rayo) { lanzar(rayo); },
    alCuadro(t, dt) {
      // Cuatro pasos pequeños por cuadro: así las pelotas rápidas no atraviesan nada
      for (let k = 0; k < 4; k++) { bolas.forEach((b) => paso(b, dt / 4)); chocarEntreSi(); }
      for (const b of bolas.slice()) {
        b.edad += dt;
        b.malla.position.copy(b.pos);
        b.malla.rotation.x += b.vel.z * dt / RADIO;
        b.malla.rotation.z -= b.vel.x * dt / RADIO;
        const suelo = superficieBajo(b.pos.x, b.pos.y - RADIO, b.pos.z);
        b.sombra.position.set(b.pos.x, suelo + 0.002, b.pos.z);
        b.sombra.material.opacity = 0.5 * Math.max(0, 1 - (b.pos.y - suelo) / 1.2);
        // Fuera de juego: cayó por un hueco o se alejó demasiado (no conocemos las paredes reales)
        const lejos = Math.hypot(b.pos.x - ar.camara.position.x, b.pos.z - ar.camara.position.z) > 8;
        if (b.pos.y < ar.alturaPiso() - 3 || lejos) quitar(b);
      }
      if (aro) aro.updateMatrixWorld();
      puntosSuperficie.visible = verSuperficies;
      if (verSuperficies) {
        puntosSuperficie.geometry.dispose();
        puntosSuperficie.geometry = new THREE.BufferGeometry().setFromPoints([...ar.parches, ...ar.paredes].map((p) => new THREE.Vector3(p.x + (p.nx ?? 0) * 0.003, p.y + (p.nx == null ? 0.003 : 0), p.z + (p.nz ?? 0) * 0.003)));
      }
    },
  };
}
