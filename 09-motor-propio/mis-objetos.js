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
export const AJUSTES_INICIALES = { tamano: 1, giro: 0, altura: 0, acostado: false, animacion: 'auto', clip: 0 };

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
  return { id, nombre: principal.nombre.replace(/\.[^.]+$/, ''), archivos, ajustes: { ...AJUSTES_INICIALES } };
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
  const raiz = new THREE.Group();      // tamaño, giro y altura
  const acostar = new THREE.Group();   // muchos .stl y .obj vienen con Z hacia arriba
  const centrar = new THREE.Group();   // centrado y escala base
  centrar.add(modelo);
  acostar.add(centrar);
  raiz.add(acostar);

  const caja = new THREE.Box3(), tam = new THREE.Vector3(), centro = new THREE.Vector3();
  let mezclador = null, accion = null, ajustes = null, acostadoAntes = null;
  if (clips.length) mezclador = new THREE.AnimationMixer(modelo);

  function normalizar() {
    // Medimos el modelo ya acostado (o no) para apoyarlo en el papel
    centrar.position.set(0, 0, 0); centrar.scale.setScalar(1);
    raiz.updateWorldMatrix(true, true);
    // La caja, medida en las coordenadas de "raiz" (sin importar dónde esté puesto)
    caja.setFromObject(acostar, true).applyMatrix4(new THREE.Matrix4().copy(raiz.matrixWorld).invert());
    if (caja.isEmpty()) return;
    caja.getSize(tam);
    const base = 0.8 / Math.max(tam.x, tam.y, tam.z, 1e-6);
    caja.getCenter(centro);
    centrar.scale.setScalar(base);
    // En coordenadas de "acostar": llevar el centro a X=Z=0 y la base a Y=0
    const desplazamiento = new THREE.Vector3(-centro.x, -caja.min.y, -centro.z);
    acostar.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(acostar.matrix).invert();
    desplazamiento.applyMatrix4(new THREE.Matrix4().extractRotation(inv));
    centrar.position.copy(desplazamiento.multiplyScalar(base));
  }

  function aplicar(nuevos) {
    ajustes = { ...AJUSTES_INICIALES, ...nuevos };
    acostar.rotation.x = ajustes.acostado ? -Math.PI / 2 : 0;
    if (acostadoAntes !== ajustes.acostado) { normalizar(); acostadoAntes = ajustes.acostado; }
    raiz.scale.setScalar(ajustes.tamano);
    raiz.rotation.y = THREE.MathUtils.degToRad(ajustes.giro);
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

  function animar(t, dt = 1 / 60) {
    mezclador?.update(dt);
    const extra = ajustes.animacion === 'girar' || (ajustes.animacion === 'auto' && !clips.length) ? t * 0.6 : 0;
    raiz.rotation.y = THREE.MathUtils.degToRad(ajustes.giro) + extra;
    raiz.position.y = ajustes.altura + (ajustes.animacion === 'flotar' ? 0.05 + Math.sin(t * 2) * 0.05 : 0);
  }
  /** Qué tan alto queda (en unidades del marcador), para poner la etiqueta encima */
  function alto() {
    raiz.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(raiz, true);
    if (raiz.parent) b.applyMatrix4(new THREE.Matrix4().copy(raiz.parent.matrixWorld).invert());
    return b.isEmpty() ? 0.5 : b.max.y;
  }
  return { objeto: raiz, aplicar, animar, alto };
}

/** Luz de ambiente "de habitación" para que los materiales metálicos (PBR) no se vean negros */
export async function ambienteDeHabitacion(renderer) {
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const textura = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return textura;
}
