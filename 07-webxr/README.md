# Nivel 7 · Objetos en tu espacio (WebXR)

Aquí el celular **entiende tu cuarto**: sabe dónde está el piso y las mesas, y cómo te mueves en 3D. Los objetos se quedan en su lugar aunque camines alrededor de ellos.

## Cómo correrlo

```bash
cd 07-webxr
npm install
npm run dev        # escanea el QR con el celular (necesita https: el servidor ya lo tiene)
```

Publicado en: https://sfiro.github.io/laboratorio-ar/07-webxr/

| Dónde lo abres | Qué pasa |
|---|---|
| **Chrome en Android** con ARCore | AR completa con WebXR: los tres modos. |
| **Safari en iPhone/iPad** | Sin WebXR. Cada objeto se convierte a **USDZ** en el momento y se abre en **AR Quick Look**, el visor de Apple. |
| **Computadora** | **Vista previa** en un cuarto simulado: el mismo código, con el cursor como mira. |

## Los modos

| Modo | Qué haces |
|---|---|
| **Colocar** | Apunta a una superficie y toca para poner una **planta**, una **lámpara**, una **silla**, un **robot** que gira la cabeza para mirarte o un **cohete**, todo a tamaño real. Arrastra un objeto para moverlo; **Girar** y **Quitar** actúan sobre el seleccionado. |
| **Medir** | Una cinta métrica: toca el inicio y el final. Mientras apuntas ves la medida en vivo. |
| **Pelotas** | Toca para lanzar una pelota hacia ese punto. Rebota en tu **piso**, en las **mesas** y **paredes** que el celular ya vio, y en los objetos que pusiste. **Poner canasta** pone un aro para encestar. **Superficies** muestra los puntos que el celular conoce. |

## Archivos

- `puente-xr.js`: **nuestro puente con WebXR**. Maneja la sesión, el hit-test, los toques, el arrastre, las anclas y la luz estimada. También tiene el cuarto simulado.
- `objetos.js`: los 5 objetos hechos con código, en metros, y la sombra suave.
- `modos.js`: Colocar, Medir y Pelotas, con su física.
- `quicklook.js`: la conversión a USDZ para el iPhone.

## Cómo funciona

### 1. La sesión de WebXR

```js
navigator.xr.requestSession('immersive-ar', {
  requiredFeatures: ['hit-test'],
  optionalFeatures: ['dom-overlay', 'anchors', 'light-estimation', 'local-floor'],
});
```

Al entrar, Chrome usa **ARCore**, que hace **SLAM**: mientras mueves el celular, reconoce puntos de la imagen, calcula cómo te moviste y arma un mapa del cuarto. Por eso al principio hay que mover el celular un poco.

- **`local-floor`**: el origen queda en el piso (y = 0).
- **`dom-overlay`**: deja mostrar nuestros botones HTML encima de la cámara. Para que tocar un botón no cuente como tocar el mundo, usamos el evento `beforexrselect`.

### 2. Hit-test: "¿qué hay en esa dirección?"

- **Fuente del centro** (`viewer`): en cada cuadro devuelve la superficie que está al centro de la pantalla. Ahí va la retícula: el aro se acuesta sobre la superficie porque el eje Y de la pose es su **normal**. Si la normal apunta hacia arriba es piso o mesa (aro blanco); si es horizontal, es una pared (aro azul).
- **Fuente de los dedos** (`requestHitTestSourceForTransientInput`): devuelve la superficie bajo el dedo. Así arrastramos objetos.

### 3. Anclas

El mapa de ARCore se corrige a medida que ve más del cuarto. Sin ancla, un objeto podría quedar "flotando" después de una corrección. Con `hitResult.createAnchor()`, el celular mantiene el objeto pegado a ese punto real. En cada cuadro leemos la pose del ancla y movemos el objeto.

### 4. Luz estimada

Con `XREstimatedLight`, el celular calcula de dónde viene la luz real y de qué color. Con eso reemplazamos nuestras luces fijas y el entorno de reflejos. Un objeto en un cuarto con luz cálida se ve cálido.

### 5. Física que conoce tu cuarto

No tenemos la malla del cuarto, pero sí los hit-tests. Cada punto que ve la retícula se guarda:

- **Horizontal** → un "parche" de piso o mesa (un disco de 20 cm). Las pelotas rebotan en el parche más alto que tengan debajo.
- **Vertical** → un pedacito de pared (con su normal). Las pelotas rebotan contra él.

Las pelotas además chocan entre sí, con los objetos (como cilindros) y con el tablero y el aro de la canasta. Una canasta cuenta cuando la pelota cruza el plano del aro **de arriba hacia abajo** y por dentro. Con **Superficies** ves esos puntos: es literalmente lo que el celular sabe de tu cuarto.

### 6. iPhone: de Three.js a USDZ

Safari no tiene WebXR para AR, pero sí abre archivos **USDZ** en AR Quick Look con un enlace `<a rel="ar">`. No guardamos archivos hechos a mano: `USDZExporter` de Three.js **convierte el objeto creado con código** en un USDZ (en metros, anclado a superficies horizontales) en el momento en que lo tocas. Quick Look hace el resto: encuentra el piso, pone sombra y deja mover, girar y escalar.

## Cómo lo probamos

Sin un Android con ARCore a mano, probamos en la **vista previa**: el mismo código de los modos, con un cuarto simulado (piso, tapete, mesa y paredes) y un raycast en lugar del hit-test.

- **Colocar**: 5 objetos en el piso y sobre la mesa (a 0.76 m), y uno arrastrado a otro lugar. Todos quedaron en la posición exacta.
- **Medir**: el borde de la mesa midió **1.20 m**, lo que mide en el modelo.
- **Pelotas**: 3 de 3 canastas con un tiro calculado. Las pelotas rebotan en una pared que el celular ya conocía.
- **USDZ**: los 5 objetos se exportan y pasan el validador oficial de Apple con las reglas de ARKit (`usdchecker --arkit`).

La sesión real de WebXR (anclas, luz, toques) sigue el estándar, pero **hay que probarla en un celular Android**.

## Límites

- El hit-test necesita **textura**: una mesa blanca lisa o un piso brillante cuestan más. Con buena luz funciona mejor.
- No hay **oclusión**: un objeto virtual detrás de un sillón real se sigue viendo. Algunos Android tienen `depth-sensing` para eso (un reto).
- Las pelotas solo conocen las superficies que pasaron por la retícula.
- iPhone: Quick Look muestra un objeto a la vez y no ejecuta nuestro código (el robot no te mira).

## Retos

1. Agrega un objeto nuevo al `CATALOGO` (una mesa, una pecera, un gato).
2. En **Medir**, muestra también el **área** cuando marques tres puntos.
3. Guarda las posiciones de los objetos para la próxima vez (pista: las anclas persistentes, `persistentAnchors`).
4. Usa `depth-sensing` para que las pelotas se escondan detrás de los muebles reales.
