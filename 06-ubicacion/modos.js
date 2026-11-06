// Los cuatro modos del nivel 6. Todo se mide en METROS:
//   x = este, −z = norte, y = arriba (y = 0 a la altura de los ojos; el piso es y = −1.5).
//
// Cada modo devuelve:
//   { nombre, ayuda, objetos, botones: [{ texto, accion }], panel(), radar(), alcance, alCuadro(t, dt) }
import * as THREE from 'three';
import { ALTURA_OJOS, desplazar, cardinal, PUNTOS_CARDINALES } from './puente-ubicacion.js';
import { posicionSol, posicionLuna, faseLuna, emojiLuna } from './astronomia.js';

const rad = THREE.MathUtils.DEG2RAD;
const distanciaTexto = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

/** Dirección (vector unitario) a partir de rumbo y altura en grados */
export function direccion(rumbo, altura) {
  return new THREE.Vector3(
    Math.cos(altura * rad) * Math.sin(rumbo * rad),
    Math.sin(altura * rad),
    -Math.cos(altura * rad) * Math.cos(rumbo * rad),
  );
}

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

/** Etiqueta de texto que siempre mide lo mismo en pantalla, sin importar la distancia */
function etiqueta({ alto = 0.075, fondo = '#0b0d12cc', color = '#fff' } = {}) {
  const c = document.createElement('canvas');
  const textura = new THREE.CanvasTexture(c);
  textura.colorSpace = THREE.SRGBColorSpace;
  // sizeAttenuation: false → el tamaño no depende de la distancia
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, sizeAttenuation: false, depthTest: false, transparent: true, fog: false }));
  sprite.renderOrder = 20;
  sprite.center.set(0.5, 0);
  let anterior = '';
  sprite.poner = (lineas) => {
    const texto = lineas.join('\n');
    if (texto === anterior) return;
    anterior = texto;
    const ctx = c.getContext('2d');
    const f = 2; // resolución
    ctx.font = `700 ${30 * f}px system-ui, sans-serif`;
    const ancho = Math.max(...lineas.map((l, i) => { ctx.font = `${i ? 500 : 700} ${(i ? 24 : 30) * f}px system-ui, sans-serif`; return ctx.measureText(l).width; }));
    c.width = ancho + 36 * f;
    c.height = (16 + 38 + (lineas.length - 1) * 30) * f;
    ctx.fillStyle = fondo;
    ctx.beginPath();
    ctx.roundRect(0, 0, c.width, c.height, 18 * f);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lineas.forEach((l, i) => {
      ctx.font = `${i ? 500 : 700} ${(i ? 24 : 30) * f}px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillStyle = i ? '#ffffffbb' : color;
      ctx.fillText(l, c.width / 2, (10 + (i ? 38 + (i - 1) * 30 : 0)) * f);
    });
    textura.dispose();
    sprite.material.map = new THREE.CanvasTexture(c);
    sprite.material.map.colorSpace = THREE.SRGBColorSpace;
    sprite.scale.set((alto * c.width) / c.height, alto, 1);
  };
  return sprite;
}

function texturaBrillo(color = '#fff') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(0.25, color);
  g.addColorStop(0.3, color + 'aa');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function luces() {
  const sol = new THREE.DirectionalLight('#fff', 2);
  sol.position.set(1, 2, 1);
  return [new THREE.HemisphereLight('#ffffff', '#556', 1.5), sol];
}

/** Un "ding" sintetizado (sin archivos de audio) */
let audio = null;
export function prepararSonido() {
  try { audio ??= new AudioContext(); audio.resume(); } catch { /* sin audio */ }
}
function ding() {
  if (!audio) return;
  [880, 1175, 1568].forEach((f, i) => {
    const osc = audio.createOscillator(), vol = audio.createGain();
    const t0 = audio.currentTime + i * 0.09;
    osc.frequency.value = f;
    osc.type = 'triangle';
    vol.gain.setValueAtTime(0.0001, t0);
    vol.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    osc.connect(vol).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + 0.55);
  });
}

// ---------------------------------------------------------------------------
// 1. Tesoros: búscalos caminando
// ---------------------------------------------------------------------------
function cofre() {
  const madera = new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.8 });
  const oro = new THREE.MeshStandardMaterial({ color: '#ffcf4a', metalness: 0.6, roughness: 0.3, emissive: '#5a3a00' });
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.5), madera);
  base.position.y = 0.225;
  const tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 24, 1, false, 0, Math.PI), madera);
  tapa.rotation.z = Math.PI / 2;
  tapa.position.y = 0.45;
  g.add(base, tapa);
  for (const x of [-0.3, 0.3]) {
    const banda = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.47, 0.52), oro);
    banda.position.set(x, 0.225, 0);
    const arco = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.07, 24, 1, false, 0, Math.PI), oro);
    arco.rotation.z = Math.PI / 2;
    arco.position.set(x, 0.45, 0);
    g.add(banda, arco);
  }
  const gema = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshStandardMaterial({ color: '#4fe3ff', emissive: '#1a8fb0', roughness: 0.1 }));
  gema.position.y = 1.0;
  gema.name = 'gema';
  g.add(gema);
  return g;
}

export function tesoros(ar) {
  const CANTIDAD = 3;
  const grupo = new THREE.Group();
  let lista = [];
  let encontrados = 0;
  let mensaje = '';

  function esconder() {
    lista.forEach((t) => grupo.remove(t.objeto, t.haz, t.etiqueta));
    lista = [];
    encontrados = 0;
    mensaje = '';
    const inicio = Math.random() * 360;
    for (let i = 0; i < CANTIDAD; i++) {
      // Repartidos alrededor tuyo, a entre 15 y 40 m
      const rumbo = inicio + (360 / CANTIDAD) * i + (Math.random() - 0.5) * 60;
      const lugar = desplazar(ar.gps, rumbo, 15 + Math.random() * 25);
      const objeto = cofre();
      const haz = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 16, 1, true), new THREE.MeshBasicMaterial({
        color: '#ffc233', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }));
      const et = etiqueta({ color: '#ffd166' });
      grupo.add(objeto, haz, et);
      lista.push({ lugar, objeto, haz, etiqueta: et, encontrado: false });
    }
  }

  function recoger(t) {
    t.encontrado = true;
    encontrados++;
    t.animacion = 0;
    ding();
    navigator.vibrate?.(200);
    mensaje = encontrados === CANTIDAD ? '🎉 ¡Encontraste todos! Toca «Esconder otros».' : `💎 ¡Encontraste uno! Quedan ${CANTIDAD - encontrados}.`;
  }

  return {
    nombre: 'Tesoros',
    ayuda: 'Camina hacia los rayos de luz. Al llegar cerca, el tesoro es tuyo.',
    objetos: [...luces(), grupo],
    alcance: 60,
    botones: [{ texto: '🔀 Esconder otros', accion: esconder }],
    activar() { if (!lista.length && ar.gps) esconder(); },
    radar: () => lista.filter((t) => !t.encontrado).map((t) => ({ p: t.objeto.position, color: '#ffd166' })),
    panel() {
      const radio = this.radioRecoger();
      const cercano = lista.filter((t) => !t.encontrado).map((t) => ar.haciaPosicion(t.objeto.position)).sort((a, b) => a.distancia - b.distancia)[0];
      return `<div class="grande">💎 ${encontrados} / ${CANTIDAD}</div>
        ${cercano ? `<div>El más cercano: <b>${distanciaTexto(cercano.distancia)}</b> al ${cardinal(cercano.rumbo)}</div>` : ''}
        <div class="tenue">Se recoge a menos de ${Math.round(radio)} m</div>
        ${mensaje ? `<div class="aviso">${mensaje}</div>` : ''}
        ${ar.gps.precision > 25 ? '<div class="aviso">El GPS está impreciso: sal a un lugar abierto.</div>' : ''}`;
    },
    // Con un GPS impreciso, pedir que llegues a 3 m sería imposible
    radioRecoger: () => limitar(ar.gps.precision * 0.8, 6, 15),
    alCuadro(t, dt) {
      if (!lista.length && ar.gps) esconder();
      const radio = this.radioRecoger();
      for (const tes of lista) {
        tes.objeto.position.copy(ar.local(tes.lugar.lat, tes.lugar.lon, -ALTURA_OJOS));
        const { distancia } = ar.haciaPosicion(tes.objeto.position);
        // De lejos se ve más grande, para que no desaparezca
        const escala = Math.max(1, distancia / 12);
        if (tes.encontrado) {
          tes.animacion += dt;
          const s = escala * Math.max(0, 1 - tes.animacion);
          tes.objeto.scale.setScalar(s);
          tes.objeto.visible = tes.haz.visible = tes.etiqueta.visible = s > 0;
          tes.objeto.position.y += tes.animacion * 3;
          continue;
        }
        tes.objeto.scale.setScalar(escala);
        tes.objeto.rotation.y = t * 0.6;
        tes.objeto.getObjectByName('gema').position.y = 1 + Math.sin(t * 3) * 0.1;
        tes.haz.position.set(tes.objeto.position.x, -ALTURA_OJOS + 20, tes.objeto.position.z);
        tes.haz.scale.set(Math.max(0.25, distancia * 0.012), 1, Math.max(0.25, distancia * 0.012));
        tes.haz.material.opacity = 0.35 + 0.12 * Math.sin(t * 2);
        tes.etiqueta.position.set(tes.objeto.position.x, -ALTURA_OJOS + 1.4 * escala, tes.objeto.position.z);
        tes.etiqueta.poner(['💎 Tesoro', distanciaTexto(distancia)]);
        if (distancia < radio) recoger(tes);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Lugares cercanos: datos abiertos de OpenStreetMap
// ---------------------------------------------------------------------------
const EMOJIS = {
  restaurant: '🍽️', cafe: '☕', fast_food: '🍔', bar: '🍺', pub: '🍺', ice_cream: '🍦', pharmacy: '💊', hospital: '🏥',
  clinic: '🩺', dentist: '🦷', school: '🏫', university: '🎓', kindergarten: '🧸', bank: '🏦', atm: '🏧', fuel: '⛽',
  park: '🌳', playground: '🛝', supermarket: '🛒', bakery: '🥖', convenience: '🏪', clothes: '👕', museum: '🏛️',
  place_of_worship: '⛪', bus_station: '🚌', library: '📚', cinema: '🎬', theatre: '🎭', hotel: '🏨', post_office: '📮',
  police: '👮', fire_station: '🚒', marketplace: '🧺', viewpoint: '🔭', attraction: '⭐', sports_centre: '🏟️', stadium: '🏟️',
};

// Servidores públicos de Overpass (la API para consultar OpenStreetMap). Si uno falla o tarda, probamos el siguiente.
const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

async function consultarOverpass(consulta, avisar) {
  let ultimoError;
  for (const [i, url] of SERVIDORES.entries()) {
    avisar(i === 0 ? 'Buscando en OpenStreetMap… (puede tardar hasta un minuto)' : `El servidor ${i} no respondió; probando otro…`);
    const cancelar = new AbortController();
    const reloj = setTimeout(() => cancelar.abort(), 45000);
    try {
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: consulta }), signal: cancelar.signal });
      if (!r.ok) throw new Error(`el servidor respondió ${r.status}`);
      return (await r.json()).elements;
    } catch (err) {
      ultimoError = err.name === 'AbortError' ? new Error('tardó demasiado') : err;
    } finally {
      clearTimeout(reloj);
    }
  }
  throw ultimoError;
}

export function lugares(ar) {
  const grupo = new THREE.Group();
  let lista = [];
  let estado = 'Toca «Buscar lugares» para ver qué hay a tu alrededor.';

  let buscando = false;
  let ultimoReparto = -10;
  async function buscar() {
    if (!ar.gps || buscando) return;
    buscando = true;
    // Redondeamos la ubicación (~100 m) antes de enviarla: suficiente para buscar alrededor
    const lat = ar.gps.lat.toFixed(3), lon = ar.gps.lon.toFixed(3);
    // Una sola consulta: elementos con nombre y con alguna de estas etiquetas, a menos de 400 m
    const consulta = `[out:json][timeout:25];nwr(around:400,${lat},${lon})[name][~"^(amenity|shop|tourism|leisure)$"~"."];out center 80;`;
    try {
      const elements = await consultarOverpass(consulta, (t) => { estado = t; });
      lista.forEach((l) => grupo.remove(l.etiqueta));
      lista = elements
        .map((e) => ({ nombre: e.tags.name, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, tipo: e.tags.amenity ?? e.tags.shop ?? e.tags.tourism ?? e.tags.leisure }))
        .filter((l) => l.lat != null)
        .map((l) => ({ ...l, distancia: ar.haciaPosicion(ar.local(l.lat, l.lon)).distancia }))
        .sort((a, b) => a.distancia - b.distancia)
        .slice(0, 30)
        .map((l) => {
          const et = etiqueta({ alto: 0.065 });
          et.escalon = 0;
          grupo.add(et);
          return { ...l, emoji: EMOJIS[l.tipo] ?? (l.tipo in { yes: 1 } ? '🛍️' : '📍'), etiqueta: et };
        });
      estado = lista.length ? `${lista.length} lugares a menos de 400 m.` : 'No encontramos lugares con nombre cerca.';
    } catch (err) {
      estado = `No se pudo buscar: ${err.message}. ¿Hay internet?`;
    } finally {
      buscando = false;
    }
  }

  return {
    nombre: 'Lugares',
    ayuda: 'Gira con el celular: verás los lugares que hay en esa dirección y a qué distancia.',
    objetos: [grupo],
    alcance: 400,
    botones: [{ texto: '🔎 Buscar lugares', accion: buscar }],
    radar: () => lista.map((l) => ({ p: ar.local(l.lat, l.lon), color: '#8fb3ff' })),
    panel: () => `<div>${estado}</div>
      <div class="tenue">Datos de © OpenStreetMap. Al buscar se envía tu ubicación aproximada (±100 m) a un servidor público de OpenStreetMap.</div>`,
    alCuadro(t) {
      // Cada 2 s repartimos las etiquetas en "pisos": si dos quedan en casi la misma dirección
      // (menos de 12°), la más lejana sube un piso. Las cercanas quedan abajo.
      if (t - ultimoReparto > 2) {
        ultimoReparto = t;
        const ocupados = [];
        for (const l of lista) {
          const { rumbo } = ar.haciaPosicion(ar.local(l.lat, l.lon));
          let piso = 0;
          while (ocupados.some((o) => o.piso === piso && Math.abs(((rumbo - o.rumbo + 540) % 360) - 180) < 12) && piso < 7) piso++;
          ocupados.push({ rumbo, piso });
          l.etiqueta.escalon = piso;
        }
      }
      for (const l of lista) {
        const p = ar.local(l.lat, l.lon);
        const { distancia, rumbo } = ar.haciaPosicion(p);
        // Altura: un poquito arriba del horizonte, escalonada (en ángulo, para que se vean igual de lejos)
        const angulo = (1 + l.etiqueta.escalon * 4.2) * rad;
        l.etiqueta.position.set(p.x, Math.tan(angulo) * distancia, p.z);
        l.etiqueta.poner([`${l.emoji} ${l.nombre}`, `${distanciaTexto(distancia)} · ${cardinal(rumbo)}`]);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Cielo: puntos cardinales, el Sol y la Luna
// ---------------------------------------------------------------------------
export function cielo(ar) {
  const grupo = new THREE.Group();
  const DIST = 800; // el "domo" del cielo, en metros (solo importa la dirección)

  // Horizonte con marcas cada 15° y letras cada 45°
  const puntos = [];
  for (let r = 0; r <= 360; r += 2) puntos.push(direccion(r, 0).multiplyScalar(DIST));
  const horizonte = new THREE.Line(new THREE.BufferGeometry().setFromPoints(puntos), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthTest: false, fog: false }));
  const marcas = [];
  for (let r = 0; r < 360; r += 15) marcas.push(direccion(r, 0).multiplyScalar(DIST), direccion(r, r % 45 ? 1 : 2.5).multiplyScalar(DIST));
  const rayitas = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(marcas), horizonte.material);
  grupo.add(horizonte, rayitas);
  PUNTOS_CARDINALES.forEach((nombre, i) => {
    const et = etiqueta({ alto: nombre.length === 1 ? 0.09 : 0.06, fondo: nombre === 'N' ? '#e5484dcc' : '#0b0d12aa' });
    et.poner([nombre]);
    et.position.copy(direccion(i * 45, 3).multiplyScalar(DIST));
    grupo.add(et);
  });

  // El Sol: un disco brillante. Su recorrido de hoy: puntos cada hora.
  const sol = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaBrillo('#ffd75a'), depthTest: false, transparent: true, blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false }));
  sol.scale.setScalar(0.22);
  const etSol = etiqueta({ alto: 0.06, color: '#ffd166' });
  const luna = etiqueta({ alto: 0.09, fondo: '#00000000' });
  const etLuna = etiqueta({ alto: 0.055 });
  const recorrido = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: '#ffd166', size: 7, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0.8, fog: false }));
  const horas = [];
  grupo.add(sol, etSol, luna, etLuna, recorrido);
  [sol, etSol, luna, etLuna, recorrido].forEach((o) => { o.renderOrder = 21; });

  let datos = null, ultimoCalculo = -1;
  function calcular() {
    const ahora = new Date();
    const { lat, lon } = ar.gps;
    const s = posicionSol(ahora, lat, lon), m = posicionLuna(ahora, lat, lon), f = faseLuna(ahora);
    datos = { s, m, f };
    sol.position.copy(direccion(s.rumbo, s.altura).multiplyScalar(DIST));
    etSol.position.copy(direccion(s.rumbo, s.altura - 4).multiplyScalar(DIST));
    etSol.center.set(0.5, 1);
    etSol.poner([`☀️ Sol ${Math.round(s.altura)}°`, s.altura < 0 ? 'bajo el horizonte' : `al ${cardinal(s.rumbo)}`]);
    luna.poner([emojiLuna(f.fase)]);
    luna.center.set(0.5, 0.5);
    luna.position.copy(direccion(m.rumbo, m.altura).multiplyScalar(DIST));
    etLuna.center.set(0.5, 1);
    etLuna.position.copy(direccion(m.rumbo, m.altura - 4).multiplyScalar(DIST));
    etLuna.poner([`Luna ${Math.round(m.altura)}°`, `${Math.round(f.fraccion * 100)} % iluminada`]);
    // Recorrido del Sol hoy, de hora en hora (solo las horas en que está sobre el horizonte)
    const medianoche = new Date(ahora); medianoche.setHours(0, 0, 0, 0);
    horas.length = 0;
    const pts = [];
    for (let h = 0; h < 24; h += 0.25) {
      const p = posicionSol(new Date(medianoche.valueOf() + h * 3600000), lat, lon);
      if (p.altura > -2) pts.push(direccion(p.rumbo, p.altura).multiplyScalar(DIST));
      if (p.altura > 0 && h % 1 === 0) horas.push({ h, p });
    }
    recorrido.geometry.dispose();
    recorrido.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }

  return {
    nombre: 'Cielo',
    ayuda: 'Mira al horizonte y al cielo. Si el Sol de la pantalla no coincide con el real, mueve el celular en forma de 8 para calibrar la brújula.',
    objetos: [grupo],
    alcance: 0,
    botones: [],
    radar: () => (datos ? [
      { p: direccion(datos.s.rumbo, 0).multiplyScalar(1).add(ar.camara.position), color: datos.s.altura > 0 ? '#ffd166' : '#ffd16655', borde: true },
      { p: direccion(datos.m.rumbo, 0).multiplyScalar(1).add(ar.camara.position), color: datos.m.altura > 0 ? '#ffffff' : '#ffffff55', borde: true },
    ] : []),
    panel() {
      if (!datos) return '';
      const { s, m, f } = datos;
      const salidaPuesta = horas.length ? `Hoy el Sol está arriba de ~${horas[0].h - 1}:00 a ~${horas.at(-1).h + 1}:00` : 'Hoy el Sol no sale aquí';
      return `<div><b>☀️ Sol</b>: ${s.altura >= 0 ? `${Math.round(s.altura)}° de altura` : `${Math.round(-s.altura)}° bajo el horizonte`}, rumbo ${Math.round(s.rumbo)}° (${cardinal(s.rumbo)})</div>
        <div><b>${emojiLuna(f.fase)} Luna</b>: ${Math.round(m.altura)}°, rumbo ${Math.round(m.rumbo)}° (${cardinal(m.rumbo)})</div>
        <div class="tenue">${salidaPuesta}. Los puntos amarillos son su camino de hoy.</div>`;
    },
    alCuadro(t) {
      if (t - ultimoCalculo > 10 || ultimoCalculo < 0) { calcular(); ultimoCalculo = t; } // el cielo se mueve despacio
      grupo.position.copy(ar.camara.position); // el cielo viaja contigo
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Mis marcas: deja una marca aquí y encuéntrala después
// ---------------------------------------------------------------------------
const CLAVE = 'ar-marcas';
const ICONOS = ['📍', '⭐', '❤️', '🏠', '🌳', '🚲'];
const COLORES = ['#ff5d8f', '#ffd166', '#ff4d6d', '#4fe3c1', '#7bed6f', '#4f8cff'];

function leerMarcas() { try { return JSON.parse(localStorage.getItem(CLAVE)) ?? []; } catch { return []; } }
function guardarMarcas(m) { try { localStorage.setItem(CLAVE, JSON.stringify(m)); return true; } catch { return false; } }

function alfiler(color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 });
  const g = new THREE.Group();
  const punta = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 24), mat);
  punta.rotation.x = Math.PI;
  punta.position.y = 0.8;
  const bola = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), mat);
  bola.position.y = 1.75;
  g.add(punta, bola);
  return g;
}

const hace = (ms) => {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
};

export function marcas(ar) {
  const grupo = new THREE.Group();
  let lista = [];
  let aviso = '';

  function construir() {
    grupo.clear();
    lista = leerMarcas().map((m) => {
      const objeto = alfiler(COLORES[m.icono]);
      const et = etiqueta({ alto: 0.065 });
      grupo.add(objeto, et);
      return { ...m, objeto, etiqueta: et };
    });
  }

  function dejar() {
    if (!ar.gps) return;
    const actuales = leerMarcas();
    const icono = actuales.length % ICONOS.length;
    actuales.push({ lat: ar.gps.lat, lon: ar.gps.lon, icono, fecha: Date.now(), numero: (actuales.at(-1)?.numero ?? 0) + 1 });
    aviso = guardarMarcas(actuales)
      ? `${ICONOS[icono]} Marca guardada. Aléjate unos pasos y date la vuelta.`
      : 'Este navegador no deja guardar datos (¿modo privado?).';
    construir();
  }

  function borrar() {
    guardarMarcas([]);
    aviso = 'Marcas borradas.';
    construir();
  }

  return {
    nombre: 'Marcas',
    ayuda: 'Deja una marca donde estás (tu carro, tu casa, un árbol…) y encuéntrala después. Se guardan solo en este celular.',
    objetos: [...luces(), grupo],
    alcance: 100,
    botones: [{ texto: '📍 Dejar marca aquí', accion: dejar }, { texto: '🗑️ Borrar', accion: borrar }],
    activar: construir,
    radar: () => lista.map((m) => ({ p: m.objeto.position, color: COLORES[m.icono] })),
    panel: () => `<div class="grande">${lista.length} ${lista.length === 1 ? 'marca' : 'marcas'}</div>
      ${aviso ? `<div class="aviso">${aviso}</div>` : ''}
      <div class="tenue">Precisión del GPS ahora: ±${Math.round(ar.gps?.precision ?? 0)} m. Tu marca puede aparecer corrida así.</div>`,
    alCuadro() {
      for (const m of lista) {
        m.objeto.position.copy(ar.local(m.lat, m.lon, -ALTURA_OJOS));
        const { distancia } = ar.haciaPosicion(m.objeto.position);
        const escala = Math.max(1, distancia / 15);
        m.objeto.scale.setScalar(escala);
        m.etiqueta.position.set(m.objeto.position.x, -ALTURA_OJOS + 2.4 * escala, m.objeto.position.z);
        m.etiqueta.poner([`${ICONOS[m.icono]} Marca ${m.numero}`, `${distanciaTexto(distancia)} · ${hace(m.fecha)}`]);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Radar: un mapa pequeño que gira contigo (arriba = hacia donde miras)
// ---------------------------------------------------------------------------
export function dibujarRadar(lienzo, ar, modo) {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const tam = lienzo.clientWidth;
  if (lienzo.width !== tam * dpr) { lienzo.width = lienzo.height = tam * dpr; }
  const ctx = lienzo.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = tam / 2;
  ctx.clearRect(0, 0, tam, tam);
  ctx.fillStyle = '#0b0d12b0';
  ctx.beginPath(); ctx.arc(r, r, r - 1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff33';
  ctx.beginPath(); ctx.arc(r, r, r * 0.5, 0, Math.PI * 2); ctx.stroke();
  // El cono de lo que ve la cámara
  const medio = (ar.camara.fov * ar.camara.aspect) / 2 * rad;
  ctx.fillStyle = '#ffffff1a';
  ctx.beginPath(); ctx.moveTo(r, r); ctx.arc(r, r, r - 2, -Math.PI / 2 - medio, -Math.PI / 2 + medio); ctx.fill();

  ctx.save();
  ctx.translate(r, r);
  ctx.rotate(-ar.rumbo * rad); // gira el mapa: lo que tienes enfrente queda arriba
  ctx.fillStyle = '#e5484d';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', 0, -r + 9);
  const alcance = modo.alcance || 1;
  for (const { p, color, borde } of modo.radar?.() ?? []) {
    const dx = p.x - ar.camara.position.x, dz = p.z - ar.camara.position.z;
    let d = Math.hypot(dx, dz);
    let k = borde ? (r - 16) / (d || 1) : (r - 6) / alcance;
    if (!borde && d > alcance) k = (r - 6) / d; // fuera de alcance: en el borde
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(dx * k, dz * k, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Tú, en el centro
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(r, r - 7); ctx.lineTo(r + 5, r + 5); ctx.lineTo(r - 5, r + 5); ctx.closePath(); ctx.fill();
}
