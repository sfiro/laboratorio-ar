# Nivel 5 · Tus manos

Tus manos controlan lo que pasa en la pantalla, sin tocarla. Usa **MediaPipe Hand Landmarker** (Apache 2.0) y **Three.js**.

## Cómo correrlo

```bash
cd 05-manos
npm install
npm run dev        # escanea el QR con el celular
```

Publicado en: https://sfiro.github.io/laboratorio-ar/05-manos/

Al empezar eliges la cámara:
- **Trasera**: sostienes el celular con una mano y usas la otra frente a la cámara.
- **Frontal**: apoyas el celular y usas las dos manos, como en un espejo.

## Las experiencias

| Experiencia | Qué haces |
|---|---|
| **Lanzar** | Pellizca un objeto para agarrarlo, muévelo y suéltalo en movimiento para lanzarlo. Con las puntas de los dedos también los empujas. |
| **Pintar** | Pellizca y mueve la mano para dibujar con luz. ✌️ cambia de color. 🖐️ quieta 1 segundo borra todo. |
| **Burbujas** | Un juego de 30 segundos: revienta las burbujas con la punta de los dedos. Las doradas valen 5. Pellizca para jugar otra vez. |
| **Gestos** | Lo que ve la computadora: el esqueleto de la mano, qué dedos están estirados, el gesto, el pellizco y la velocidad. |

## Archivos

- `puente-manos.js`: **nuestro puente**. Corre MediaPipe, sigue a cada mano entre cuadros y calcula el pellizco, los dedos, los gestos y la velocidad.
- `experiencias.js`: las cuatro experiencias, la física, los trazos de luz y el shader de las burbujas.
- `public/modelos/hand_landmarker.task`: el modelo de IA (7.8 MB, de Google, Apache 2.0).
- `scripts/copiar-vendor.mjs`: copia el WebAssembly de MediaPipe a `public/vendor` para no depender de un CDN.

## Cómo funciona

### 1. MediaPipe: 21 puntos por mano

```
          8   12  16  20      ← puntas
          7   11  15  19
      4   6   10  14  18
      3   5   9   13  17      ← bases de los dedos
       2
        1
           0                  ← muñeca
```

MediaPipe solo da los puntos (y si cree que es la mano izquierda o la derecha). **Todo lo demás lo calculamos nosotros**:

| Qué | Cómo |
|---|---|
| **Tamaño de la mano** | Distancia muñeca (0) → base del dedo medio (9). Todo se mide en "tamaños de mano", así funciona cerca o lejos de la cámara. |
| **Dedo estirado** | La punta está más lejos de la muñeca que la articulación del medio (×1.12). El pulgar: su punta se aleja de la base del meñique. |
| **Gesto** | Un patrón de 5 dedos: ✌️ = índice y medio arriba, anular y meñique abajo. 👍 / 👎 = solo el pulgar, y miramos si apunta arriba o abajo. |
| **Pellizco** | Distancia pulgar (4) ↔ índice (8) menor que 0.32 tamaños de mano. Se suelta hasta que pasa de 0.5 (**histéresis**: así no parpadea en el límite). En un puño el pulgar también toca el índice, así que además pedimos que el índice no esté doblado contra la palma. |
| **Velocidad** | Cuánto se movió el punto de pellizco desde el cuadro anterior, entre el tiempo que pasó (px/s), suavizado. |

### 2. Seguir a cada mano

MediaPipe no promete devolver las manos en el mismo orden en cada cuadro. Si no lo corregimos, un objeto agarrado podría saltar a la otra mano. Comparamos las dos formas posibles de emparejarlas con las de antes y nos quedamos con la de menor distancia.

### 3. Física hecha por nosotros

Sin librerías de física: gravedad, rebotes contra las paredes con pérdida de energía, fricción, choques entre objetos (círculos de igual masa que intercambian impulso) y las puntas de los dedos como pequeños círculos que empujan. **Lanzar** es solo esto: al soltar, el objeto toma la velocidad que llevaba tu mano.

### 4. Trazos de luz

Una línea gruesa es una **tira de triángulos**: por cada punto del trazo ponemos dos vértices, uno a cada lado de la dirección del movimiento. Dibujamos dos tiras con mezcla aditiva: una delgada y brillante, y otra ancha y tenue (el halo).

### 5. Burbujas con un shader propio

Las burbujas son esferas con un *fragment shader* escrito por nosotros: casi transparentes en el centro y brillantes en el borde (efecto **Fresnel**), con colores de arcoíris que cambian según el ángulo, como el jabón.

## Lo que aprendimos

- Con la cámara **frontal** la imagen se muestra en espejo; con la **trasera**, no. La X de los puntos se invierte solo en el primer caso.
- MediaPipe supone que la imagen viene en espejo para decir "izquierda" o "derecha". La nuestra no lo está, así que invertimos la etiqueta.
- Lo que pintas se queda **pegado a la pantalla**, no al mundo: si mueves el celular, el dibujo se mueve con él. Para anclarlo al cuarto hace falta entender el espacio (eso viene en el nivel 7, con WebXR).
- Usamos MediaPipe **1.1.1**, igual que en el nivel 4.

## Cómo lo probamos sin cámara

En desarrollo (`npm run dev`) hay dos ganchos para probar desde la consola:
- `window.__ar`: la realidad de manos (por ejemplo, `__ar.manos[0].gesto`).
- `window.__manosDePrueba = (t) => ({ landmarks: [[...21 puntos {x, y, z}...]], handedness: [[{ categoryName: 'Left' }]] })`: reemplaza la detección por manos sintéticas. Con eso probamos agarrar, lanzar, pintar y reventar burbujas con guiones de movimiento.

## Limitaciones

- Con poca luz, con fondos del color de la piel o con la mano de lado, la detección falla más.
- Cuando las dos manos se cruzan o se tapan, se pueden perder un momento.
- No sabemos la profundidad real: la z de MediaPipe es relativa a la muñeca. Por eso todo pasa en el plano de la pantalla.

## Retos

1. Agrega un gesto nuevo a la lista `GESTOS` de `puente-manos.js` (por ejemplo 🤞 o 👌).
2. En **Pintar**, haz que el grosor dependa de qué tan cerca está la mano (usa `mano.tamano`).
3. En **Lanzar**, agrega una canasta: suma un punto cuando un objeto entra.
4. Usa las dos manos: aleja o acerca los pellizcos de ambas para agrandar o achicar un objeto.
