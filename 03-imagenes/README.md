# Nivel 3 · Imágenes que cobran vida

Apuntas el celular a una imagen y de ella sale contenido 3D. Usamos el **motor de seguimiento de MindAR** y escribimos **nuestro propio puente a Three.js**.

## Cómo correrlo

```bash
cd 03-imagenes
npm install
npm run dev        # escanea el QR con el celular
```

- Publicado en: https://sfiro.github.io/laboratorio-ar/03-imagenes/
- Pósters: [`posters.html`](posters.html). Muéstralos en la computadora o imprímelos.

## Qué hay

| Imagen | Qué pasa |
|---|---|
| **Póster Cohete** | El planeta, la luna y las estrellas *brotan* del papel. Un cohete 3D orbita el planeta. |
| **Póster Portal** | A través de la ventana se ve un **cuarto dentro del papel**, con objetos flotando. Una esfera sale del portal hacia tu cuarto y regresa. |
| **Tu propia imagen** | Elige una foto. Se compila **en tu celular** y le aparece un marco 3D con el cohete dando vueltas. |

## Archivos

- `puente-mindar.js`: **nuestro puente** entre el `Controller` de MindAR y Three.js. Enciende la cámara, ajusta la cámara virtual a la real y mueve las "anclas".
- `escenas.js`: el contenido 3D de cada imagen.
- `scripts/crear-posters.mjs`: diseña los dos pósters como SVG, con código.
- `herramientas.html`: herramienta de desarrollo que convierte los SVG a PNG y los compila a `objetivos.mind`. Solo funciona con `npm run dev`.

### Para cambiar los pósters

1. Edita `scripts/crear-posters.mjs` y corre `npm run posters`.
2. Corre `npm run dev` y abre `/herramientas.html`. Presiona **Compilar**.
3. Se guardan `cohete.png`, `portal.png` y `objetivos.mind` en `public/objetivos/`.

## Cómo funciona

**Marcadores (nivel 2):** buscan un cuadrado negro y comparan 16×16 píxeles.

**Imágenes naturales (este nivel):**
1. **Compilar:** se buscan cientos de **puntos característicos** en la imagen, en varias escalas. Son esquinas y manchas con contraste, cada uno con una "huella" que lo describe.
2. **Detectar:** en el video se buscan puntos parecidos y se emparejan con los de la imagen.
3. Con 4 o más parejas buenas se calcula la **homografía**: cómo está girada e inclinada la imagen. De ahí sale la pose 3D.
4. **Seguir:** una vez encontrada, es más barato seguirla cuadro a cuadro que volver a buscarla. Un **filtro** suaviza el temblor.

### Nuestro puente: la cámara virtual

El video llena la pantalla recortando lo que sobra. La cámara de Three.js debe tener **el mismo campo de visión** que la parte visible del video, o los objetos no caerían sobre la imagen:

```
fov = 2 · atan( tan(45°/2) · altoPantalla / altoVideoMostrado )
```

MindAR supone una cámara con 45° de campo vertical.

### El truco del portal: oclusión

Alrededor de la ventana hay paneles **invisibles** (`colorWrite: false`) que sí escriben **profundidad** y se dibujan primero (`renderOrder = -1`). Todo lo que está detrás de ellos no se pinta, así que el cuarto interior solo se ve por el hueco. Así funcionan los portales de AR y los objetos que se esconden detrás de cosas reales.

## Lo que aprendimos

- Una buena imagen objetivo tiene **muchos detalles con esquinas** y no tiene zonas lisas ni patrones que se repitan. Por eso los pósters tienen cientos de estrellas y ladrillos con figuras distintas.
- **Unidades:** 1 = el ancho de la imagen. El origen está en el centro y Z sale del papel.
- **Dos bugs que encontramos:**
  - MindAR lee el video usando sus *atributos* `width`/`height`. Si no se ponen, analiza cuadros vacíos y nunca detecta nada.
  - La integración oficial de MindAR con Three.js usa `sRGBEncoding`, que Three.js ya eliminó. Por eso escribimos el puente.
- Este nivel usa **Vite 6**, porque MindAR declara una dependencia que lo exige. También lleva un `.npmrc` con `ignore-scripts`, para que npm no intente compilar `canvas`, que el navegador no usa.

## Limitaciones

- Con ángulos muy inclinados (más de unos 50°) o con reflejos, la detección falla.
- La primera detección tarda 1 o 2 segundos, mientras se preparan los cálculos en la GPU.
- El motor (TensorFlow.js) pesa unos 460 KB comprimido.

## Retos

1. Cambia el cuarto del portal: otra textura en las paredes, más objetos o un pez que nade.
2. Haz que tocar la pantalla lance el cohete fuera del póster.
3. Diseña tu propio póster en `crear-posters.mjs`, como un tercer objetivo, y dale su propia escena.
