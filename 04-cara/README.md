# Nivel 4 · Filtros de cara

Filtros como los de las redes sociales, hechos por nosotros. Usan **MediaPipe Face Landmarker** (Apache 2.0) y **Three.js**.

## Cómo correrlo

```bash
cd 04-cara
npm install
npm run dev        # escanea el QR con el celular
```

Publicado en: https://sfiro.github.io/laboratorio-ar/04-cara/

## Los filtros

| Filtro | Qué hace | Gesto |
|---|---|---|
| **Fiesta** | Gafas y gorro de fiesta | Boca abierta → confeti · Cejas arriba → el gorro brinca |
| **Neón** | Tu cara como una malla de luz (852 triángulos) | Parpadear → cambia de color · Sonreír → brilla más |
| **Dragón** | Cuernos y escamas | Boca abierta → fuego |
| **Datos** | Los 478 puntos, los ejes de tu cabeza y las barras de gestos | — |

El botón redondo toma una **foto** con el filtro, para guardarla o compartirla.

## Archivos

- `puente-cara.js`: **nuestro puente**. Corre MediaPipe en cada cuadro, lleva los puntos a la pantalla en espejo y **calcula la pose de la cabeza**.
- `filtros.js`: los cuatro filtros, el oclusor y un sistema de partículas sencillo.
- `public/modelos/face_landmarker.task`: el modelo de IA (3.7 MB, de Google, Apache 2.0).
- `scripts/copiar-vendor.mjs`: copia el WebAssembly de MediaPipe a `public/vendor` para no depender de un CDN.

## Cómo funciona

### 1. MediaPipe: 478 puntos y 52 gestos

En cada cuadro, una red neuronal encuentra la cara y devuelve:
- **478 puntos** (`x`, `y` de 0 a 1 en la imagen; `z` = profundidad relativa). Incluyen 10 del iris.
- **52 blendshapes**: números de 0 a 1 para `jawOpen` (boca abierta), `eyeBlinkLeft`, `browInnerUp`, `mouthSmileLeft`… Son los mismos que usa la animación facial en el cine y los videojuegos.

Todo corre **en el celular**: WebAssembly más la GPU. La imagen no sale del dispositivo.

### 2. Calculamos la pose nosotros

MediaPipe también puede dar una matriz de pose, pero preferimos calcularla con 3 puntos para entender cómo funciona:

```
derecha  = ojoDerecho − ojoIzquierdo        (eje X)
arriba   = frente − mentón, sin la parte que va hacia "derecha"   (eje Y)
adelante = derecha × arriba                  (eje Z, sale de la cara)
escala   = distancia entre ojos / 9 cm       (píxeles por centímetro)
origen   = el entrecejo (punto 168)
```

Con eso, los filtros se diseñan **en centímetros**: las gafas miden lo que mediría unas gafas reales.

### 3. Cámara ortográfica

A diferencia de los niveles 2 y 3, aquí la cámara virtual es **ortográfica** y mide igual que la pantalla: 1 unidad = 1 píxel. Así los puntos de MediaPipe caen exactamente sobre el video, sin calcular campos de visión.

### 4. Oclusión con tu propia cara

Las patas de las gafas y la parte de atrás del gorro deben esconderse **detrás de tu cabeza**. Para eso dibujamos primero dos objetos invisibles (`colorWrite: false`) que sí ocupan profundidad:
- la **malla de tu cara** (los 478 puntos, actualizados en cada cuadro),
- una **elipsoide** del tamaño aproximado de una cabeza.

Es el mismo truco del portal del nivel 3, pero con una forma que se mueve.

### 5. Espejo

La cámara frontal se muestra en espejo, porque así nos vemos naturalmente. Por eso la X de los puntos se invierte (`0.5 − x`), y la foto se dibuja también en espejo.

## Lo que aprendimos

- La teselación de MediaPipe viene como 2,556 aristas, y cada 3 aristas seguidas forman uno de los **852 triángulos**.
- Un gesto se detecta con un **umbral** (por ejemplo, `jawOpen > 0.35`). Para que un parpadeo cuente **una vez** y no en cada cuadro, se detecta el *cambio* de abierto a cerrado.
- Usamos MediaPipe **1.1.1** y no la 1.2.2: esa salió el día anterior y preferimos una versión probada.

## Limitaciones

- Con poca luz, la cara de perfil (más de unos 60°) o tapada con la mano, se pierde.
- La elipsoide de la cabeza es aproximada: el pelo voluminoso o los sombreros reales no la siguen.
- Solo una cara a la vez (`numFaces: 1`).

## Retos

1. Cambia el color o la forma de las gafas (están hechas con toros y cajas en `filtros.js`).
2. Haz un filtro nuevo: bigote que se mueve con `mouthSmileLeft`/`Right`, o corazones que salen al hacer `mouthPucker` (beso).
3. Pon `numFaces: 2` y dibuja la malla de dos personas.
