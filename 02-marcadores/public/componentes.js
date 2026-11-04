// Nuestros componentes de A-Frame para el Nivel 2.
// Un componente es una pieza de comportamiento que se "pega" a una entidad con un atributo HTML.

/* global AFRAME, THREE */

// ---------------------------------------------------------------------------
// Modo prueba sin cámara: index.html?imagen=./prueba/escena.svg
// AR.js analiza esa imagen fija en lugar del video. Útil para depurar.
// (A-Frame espera a DOMContentLoaded para iniciar la escena, así que llegamos antes.)
// ---------------------------------------------------------------------------
const imagenDePrueba = new URLSearchParams(location.search).get('imagen');
if (imagenDePrueba) {
  document.addEventListener('DOMContentLoaded', () => {
    const escena = document.querySelector('a-scene');
    const arjs = escena.getAttribute('arjs').replace('sourceType: webcam', `sourceType: image; sourceUrl: ${imagenDePrueba}`);
    escena.setAttribute('arjs', arjs);
  });
}

// ---------------------------------------------------------------------------
// tocar-pantalla: al tocar en cualquier parte, avisa a los marcadores visibles.
// (Más fácil que apuntar a un objeto pequeño que se mueve.)
// ---------------------------------------------------------------------------
AFRAME.registerComponent('tocar-pantalla', {
  init() {
    window.addEventListener('pointerup', (e) => {
      if (e.target.closest('a, button')) return; // no robar los toques a los botones
      this.el.querySelectorAll('a-marker').forEach((marcador) => {
        if (!marcador.object3D.visible) return;
        [marcador, ...marcador.querySelectorAll('*')].forEach((el) => el.emit('tocar', null, false));
      });
    });
  },
});

// ---------------------------------------------------------------------------
// estado-marcadores: enciende el "chip" de cada marcador mientras se ve.
// AR.js emite markerFound / markerLost gracias a emitevents="true".
// ---------------------------------------------------------------------------
AFRAME.registerComponent('estado-marcadores', {
  init() {
    this.el.querySelectorAll('a-marker').forEach((marcador) => {
      const chip = document.querySelector(`.chip[data-marcador="${marcador.id}"]`);
      marcador.addEventListener('markerFound', () => chip?.classList.add('visto'));
      marcador.addEventListener('markerLost', () => chip?.classList.remove('visto'));
    });
  },
});

// ---------------------------------------------------------------------------
// colores: cada toque pasa al siguiente color de la lista.
// ---------------------------------------------------------------------------
AFRAME.registerComponent('colores', {
  schema: { type: 'array' },
  init() {
    this.i = 0;
    this.el.addEventListener('tocar', () => {
      this.i = (this.i + 1) % this.data.length;
      this.el.setAttribute('material', 'color', this.data[this.i]);
    });
  },
});

// ---------------------------------------------------------------------------
// medir: calcula a qué distancia y con qué inclinación está el marcador.
// Esa "pose" (posición + rotación) es justo lo que AR.js calcula en cada cuadro.
// ---------------------------------------------------------------------------
AFRAME.registerComponent('medir', {
  init() {
    this.info = document.getElementById('info');
    this.textoOriginal = this.info.textContent;
    this.arriba = new THREE.Vector3();
    this.haciaCamara = new THREE.Vector3();
    this.ultimo = 0;
    this.el.addEventListener('markerLost', () => { this.info.textContent = this.textoOriginal; });

    const cubo = this.el.querySelector('#cubo-unidad');
    this.el.addEventListener('tocar', () => cubo.setAttribute('visible', !cubo.getAttribute('visible')));
  },
  tick(t) {
    if (!this.el.object3D.visible || t - this.ultimo < 200) return;
    this.ultimo = t;

    // La cámara está en el origen y el marcador se mueve a su alrededor
    const pos = this.el.object3D.position;
    const distancia = pos.length();

    // Inclinación: ángulo entre el eje Y del marcador (perpendicular al papel) y la línea hacia la cámara
    this.arriba.set(0, 1, 0).applyQuaternion(this.el.object3D.quaternion);
    this.haciaCamara.copy(pos).negate().normalize();
    const grados = THREE.MathUtils.radToDeg(this.arriba.angleTo(this.haciaCamara));

    this.info.textContent =
      `Distancia: ${distancia.toFixed(1)} marcadores · Inclinación: ${grados.toFixed(0)}° · ` +
      `x ${pos.x.toFixed(1)}  y ${pos.y.toFixed(1)}  z ${pos.z.toFixed(1)}`;
  },
});
