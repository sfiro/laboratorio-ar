// Mis objetos 3D: tus propios modelos sobre los marcadores.
//
//  · Formatos: .glb y .gltf (también comprimidos con Draco o Meshopt), .obj (+ .mtl y texturas),
//    .stl, .ply y .fbx. Si el modelo trae archivos aparte (texturas, .bin, .mtl), se eligen todos juntos.
//  · Se guardan en el navegador (IndexedDB), uno por marcador: no se suben a ningún servidor.
//  · Cada modelo se "normaliza": se centra sobre el marcador, se apoya en el papel y se escala para
//    que su lado más grande mida 0.8 del marcador. Encima van tus ajustes (tamaño, giro, altura).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import dracoWrapper from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import dracoWasm from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';

export const FORMATOS = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx'];
export const ACEPTAR = '.glb,.gltf,.obj,.mtl,.stl,.ply,.fbx,.bin,.png,.jpg,.jpeg,.webp,.ktx2,.tga';
export const AJUSTES_INICIALES = {
  tamano: 1, altura: 0,
  arriba: '+Y',                       // qué eje del modelo apunta hacia arriba
  giro: 0, inclinarX: 0, inclinarZ: 0, // orientación fija, en grados
  animacion: 'auto', clip: 0,
  eje: 'vertical', velocidad: 0.6,    // giro animado: sobre qué eje y cuántos radianes por segundo
};

/** Cómo girar el modelo para que ese eje suyo quede hacia arriba */
export const LADOS_ARRIBA = {
  '+Y': { texto: 'Y (lo normal en .glb)', giro: [0, 0, 0] },
  '+Z': { texto: 'Z (típico de .stl)', giro: [-Math.PI / 2, 0, 0] },
  '-Z': { texto: '−Z', giro: [Math.PI / 2, 0, 0] },
  '+X': { texto: 'X', giro: [0, 0, Math.PI / 2] },
  '-X': { texto: '−X', giro: [0, 0, -Math.PI / 2] },
  '-Y': { texto: '−Y (está de cabeza)', giro: [Math.PI, 0, 0] },
};
/** Ejes del giro animado, vistos sobre el marcador */
export const EJES_GIRO = {
  vertical: { texto: 'Vertical (como un trompo)', eje: new THREE.Vector3(0, 1, 0) },
  lado: { texto: 'Horizontal, de lado a lado', eje: new THREE.Vector3(1, 0, 0) },
  frente: { texto: 'Horizontal, de adelante a atrás', eje: new THREE.Vector3(0, 0, 1) },
  propio: { texto: 'Su propio eje (sigue la inclinación)', eje: null },
};

/** Los ajustes guardados con versiones anteriores ("acostado") se pasan al formato nuevo */
export function completarAjustes(a = {}) {
  const r = { ...AJUSTES_INICIALES, ...a };
  if (!a.arriba && a.acostado) r.arriba = '+Z';
  delete r.acostado;
  return r;
}

const extension = (nombre) => nombre.split('.').pop().toLowerCase();
const nombreBase = (ruta) => decodeURIComponent(ruta.split(/[\\/]/).pop().split('?')[0]).toLowerCase();

// ───────────────────────── Guardar en el navegador (IndexedDB) ─────────────────────────
let db = null;
function abrir() {
  db ??= new Promise((ok, mal) => {
    const pedido = indexedDB.open('nivel9-mis-objetos', 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore('objetos', { keyPath: 'id' });
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => mal(pedido.error);
  });
  return db;
}
async function operar(modo, fn) {
  const base = await abrir();
  return new Promise((ok, mal) => {
    const tx = base.transaction('objetos', modo);
    const pedido = fn(tx.objectStore('objetos'));
    tx.oncomplete = () => ok(pedido?.result);
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error ?? new Error('No se pudo guardar (¿falta espacio?)'));
  });
}
/** registro = { id (número de marcador), nombre, archivos: [{nombre, blob}], ajustes } */
export const guardarObjeto = (registro) => operar('readwrite', (s) => s.put(registro));
export const borrarObjeto = (id) => operar('readwrite', (s) => s.delete(id));
export const leerObjetos = async () => (await operar('readonly', (s) => s.getAll())) ?? [];

/** Pide al navegador que no borre lo guardado cuando le falte espacio */
export const pedirGuardadoPermanente = () => navigator.storage?.persist?.().catch(() => false);

/** De los archivos elegidos, arma un registro nuevo (o explica qué falta) */
export function registroDesdeArchivos(id, lista) {
  const archivos = [...lista].map((f) => ({ nombre: f.name, blob: f }));
  const principal = archivos.find((a) => FORMATOS.includes(extension(a.nombre)));
  if (!principal) throw new Error(`No encontré un modelo. Elige un archivo ${FORMATOS.map((f) => '.' + f).join(', ')}.`);
  // El modelo principal va primero
  archivos.sort((a, b) => (a === principal ? -1 : b === principal ? 1 : 0));
  return { id, nombre: principal.nombre.replace(/\.[^.]+$/, ''), archivos, ajustes: completarAjustes() };
}

// ───────────────────────── Leer el modelo ─────────────────────────
/** Lee el archivo principal del registro. Devuelve { modelo, clips, triangulos, faltan } */
export async function cargarModelo(registro) {
  const [principal, ...resto] = registro.archivos;
  const urls = new Map(); // nombre de archivo → URL temporal (blob:)
  for (const a of registro.archivos) urls.set(a.nombre.toLowerCase(), URL.createObjectURL(a.blob));
  urls.set('draco_wasm_wrapper.js', dracoWrapper);
  urls.set('draco_decoder.wasm', dracoWasm);
  const faltan = new Set();
  // Cuando el modelo pide "texturas/madera.png", le damos el archivo que elegiste con ese nombre
  const gestor = new THREE.LoadingManager();
  gestor.setURLModifier((url) => {
    if (/^(blob:|data:)/.test(url)) return url;
    const encontrada = urls.get(nombreBase(url));
    if (!encontrada) faltan.add(nombreBase(url));
    return encontrada ?? url;
  });
  const url = urls.get(principal.nombre.toLowerCase());
  const tipo = extension(principal.nombre);
  try {
    let modelo, clips = [];
    if (tipo === 'glb' || tipo === 'gltf') {
      const draco = new DRACOLoader(gestor).setDecoderPath('');
      const gltf = await new GLTFLoader(gestor).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
      draco.dispose();
      modelo = gltf.scene; clips = gltf.animations;
    } else if (tipo === 'obj') {
      const obj = new OBJLoader(gestor);
      const mtl = resto.find((a) => extension(a.nombre) === 'mtl');
      // El .obj dice qué archivo de materiales usa ("mtllib"): si no lo elegiste, te avisamos
      const pedido = (await principal.blob.text()).match(/^mtllib\s+(.+)$/m)?.[1]?.trim();
      if (pedido && !mtl) faltan.add(nombreBase(pedido));
      if (mtl) {
        const materiales = await new MTLLoader(gestor).loadAsync(urls.get(mtl.nombre.toLowerCase()));
        materiales.preload();
        obj.setMaterials(materiales);
      }
      modelo = await obj.loadAsync(url);
      if (!mtl) modelo.traverse((o) => { if (o.isMesh) o.material = materialSimple(); });
    } else if (tipo === 'stl' || tipo === 'ply') {
      const geometria = await (tipo === 'stl' ? new STLLoader(gestor) : new PLYLoader(gestor)).loadAsync(url);
      // Muchos .stl traen las normales en cero (y el modelo se ve negro): las calculamos nosotros
      if (tipo === 'stl' || !geometria.attributes.normal) geometria.computeVertexNormals();
      modelo = new THREE.Group().add(new THREE.Mesh(geometria, materialSimple(!!geometria.attributes.color)));
    } else if (tipo === 'fbx') {
      modelo = await new FBXLoader(gestor).loadAsync(url);
      clips = modelo.animations ?? [];
    }
    let triangulos = 0;
    modelo.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      triangulos += (g.index ? g.index.count : g.attributes.position.count) / 3;
      o.frustumCulled = false; // los modelos animados a veces "desaparecen" al moverse fuera de su caja
    });
    return { modelo, clips, triangulos: Math.round(triangulos), faltan: [...faltan] };
  } finally {
    // Las texturas ya se leyeron: liberamos las URL temporales un poco después
    setTimeout(() => { for (const [k, u] of urls) if (u.startsWith('blob:')) URL.revokeObjectURL(u); }, 5000);
  }
}

const materialSimple = (conColores = false) => new THREE.MeshStandardMaterial({
  color: conColores ? '#ffffff' : '#8f9bb0', vertexColors: conColores, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide,
});

// ───────────────────────── Ponerlo sobre el marcador ─────────────────────────
/**
 * Arma el objeto listo para ir sobre el marcador (Y = fuera del papel, el marcador mide 1 × 1).
 * Devuelve { objeto, aplicar(ajustes), animar(t, dt) }: aplicar() cambia los ajustes al instante.
 */
export function montar({ modelo, clips }, ajustesIniciales) {
  // Cadena de grupos (de afuera hacia adentro):
  //   raiz      → tamaño y altura sobre el papel
  //   pivote    → el giro animado; está a media altura del modelo, para que gire sobre su centro
  //   orientar  → giro e inclinaciones fijas que elegiste
  //   bajar     → deshace la media altura del pivote (el modelo vuelve a apoyarse en el papel)
  //   arriba    → pone hacia arriba el eje del modelo que elegiste
  //   centrar   → centra el modelo y lo escala a 0.8 del marcador
  const raiz = new THREE.Group(), pivote = new THREE.Group(), orientar = new THREE.Group();
  const bajar = new THREE.Group(), arriba = new THREE.Group(), centrar = new THREE.Group();
  raiz.add(pivote); pivote.add(orientar); orientar.add(bajar); bajar.add(arriba); arriba.add(centrar); centrar.add(modelo);
  // Flecha amarilla con el eje del giro (solo en la vista previa). Va en el pivote: al girar
  // sobre su propio eje, la flecha no se mueve.
  const flecha = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, '#ffd166', 0.1, 0.06);
  flecha.visible = false;
  flecha.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 20; } });
  pivote.add(flecha);
  let verEje = false;

  const caja = new THREE.Box3(), tam = new THREE.Vector3(), centro = new THREE.Vector3();
  let mezclador = null, accion = null, ajustes = null, arribaAntes = null, mitad = 0.4;
  if (clips.length) mezclador = new THREE.AnimationMixer(modelo);

  function normalizar() {
    centrar.position.set(0, 0, 0); centrar.scale.setScalar(1);
    bajar.updateWorldMatrix(true, true);
    // La caja, medida en las coordenadas de "bajar" (sin importar dónde esté puesto)
    caja.setFromObject(arriba, true).applyMatrix4(new THREE.Matrix4().copy(bajar.matrixWorld).invert());
    if (caja.isEmpty()) return;
    caja.getSize(tam);
    const base = 0.8 / Math.max(tam.x, tam.y, tam.z, 1e-6);
    caja.getCenter(centro);
    centrar.scale.setScalar(base);
    // Llevar el centro a X = Z = 0 y la base a Y = 0 (en coordenadas de "bajar"),
    // y pasarlo a las coordenadas de "arriba", que está girado
    const desplazamiento = new THREE.Vector3(-centro.x, -caja.min.y, -centro.z);
    desplazamiento.applyMatrix4(new THREE.Matrix4().extractRotation(arriba.matrix).invert());
    centrar.position.copy(desplazamiento.multiplyScalar(base));
    mitad = (tam.y * base) / 2;
    pivote.position.y = mitad;
    bajar.position.y = -mitad;
  }

  const rad = THREE.MathUtils.degToRad;
  function aplicar(nuevos) {
    ajustes = completarAjustes(nuevos);
    arriba.rotation.set(...(LADOS_ARRIBA[ajustes.arriba] ?? LADOS_ARRIBA['+Y']).giro);
    if (arribaAntes !== ajustes.arriba) { normalizar(); arribaAntes = ajustes.arriba; }
    raiz.scale.setScalar(ajustes.tamano);
    // Primero el giro (alrededor de la vertical), luego las inclinaciones
    orientar.rotation.set(rad(ajustes.inclinarX), rad(ajustes.giro), rad(ajustes.inclinarZ), 'YXZ');
    pivote.quaternion.identity();
    raiz.position.y = ajustes.altura;
    // Animación del propio modelo
    const quiereClip = mezclador && (ajustes.animacion === 'auto' || ajustes.animacion === 'clip');
    const clip = quiereClip ? clips[Math.min(ajustes.clip, clips.length - 1)] : null;
    if (accion?.getClip() !== clip) {
      accion?.stop();
      accion = clip ? mezclador.clipAction(clip).play() : null;
    }
  }
  aplicar(ajustesIniciales);

  const ejePropio = new THREE.Vector3();
  function animar(t, dt = 1 / 60) {
    mezclador?.update(dt);
    const gira = ajustes.animacion === 'girar' || (ajustes.animacion === 'auto' && !clips.length);
    if (gira) {
      // El eje "propio" es la vertical del modelo ya inclinado
      const eje = EJES_GIRO[ajustes.eje]?.eje ?? ejePropio.set(0, 1, 0).applyQuaternion(orientar.quaternion);
      pivote.quaternion.setFromAxisAngle(eje, t * ajustes.velocidad);
      // La flecha atraviesa el modelo por el centro, a lo largo del eje
      const largo = mitad * 2 + 0.3;
      flecha.setDirection(eje);
      flecha.setLength(largo, 0.1, 0.06);
      flecha.position.copy(eje).multiplyScalar(-largo / 2);
    } else {
      pivote.quaternion.identity();
    }
    flecha.visible = verEje && gira;
    raiz.position.y = ajustes.altura + (ajustes.animacion === 'flotar' ? 0.05 + Math.sin(t * 2) * 0.05 : 0);
  }
  /** Qué tan alto queda (en unidades del marcador), para poner la etiqueta encima */
  function alto() {
    raiz.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(raiz, true);
    if (raiz.parent) b.applyMatrix4(new THREE.Matrix4().copy(raiz.parent.matrixWorld).invert());
    // Si gira sobre un eje horizontal, puede subir hasta su diagonal
    const giraAcostado = ajustes.eje !== 'vertical' && ajustes.animacion !== 'ninguna';
    return b.isEmpty() ? 0.5 : Math.max(b.max.y, giraAcostado ? ajustes.altura + mitad * 2.2 * ajustes.tamano : 0);
  }
  return { objeto: raiz, aplicar, animar, alto, mostrarEje: (v) => { verEje = v; } };
}

/** Luz de ambiente "de habitación" para que los materiales metálicos (PBR) no se vean negros */
export async function ambienteDeHabitacion(renderer) {
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const textura = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return textura;
}
