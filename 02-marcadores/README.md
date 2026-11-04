# Nivel 2 · Marcadores

Objetos 3D que aparecen sobre marcadores impresos, con **AR.js + A-Frame**. Dos de los tres marcadores los diseñamos nosotros, y también escribimos el codificador que los convierte al formato de AR.js.

## Cómo correrlo

```bash
cd 02-marcadores
npm install
npm run dev        # escanea el QR con el celular
```

- Publicado en: https://sfiro.github.io/laboratorio-ar/02-marcadores/
- Marcadores para imprimir: [`marcadores.html`](marcadores.html). También puedes mostrarlos en la pantalla de la computadora y apuntar el celular a ella.

### Probar sin cámara

```bash
SIN_HTTPS=1 npm run dev
```

Luego abre `http://localhost:5173/?imagen=./prueba/escena.svg`. AR.js analiza una imagen fija con los tres marcadores en vez del video. La imagen se regenera con `npm run prueba`.

## Los tres marcadores

| Marcador | Qué aparece | Al tocar la pantalla |
|---|---|---|
| **Hiro** (el clásico de AR.js) | El cohete del nivel 1 | Despega y vuelve |
| **Estrella** (nuestro) | Un cubo que gira | Cambia de color y salta |
| **Escalera** (nuestro) | Los ejes X (rojo), Y (verde) y Z (azul) + distancia e inclinación en vivo | Muestra el "cubo unidad" |

## Archivos

- `index.html`: la escena AR. Cada `<a-marker>` es un marcador y lo que contiene aparece encima.
- `public/componentes.js`: nuestros componentes de A-Frame (`tocar-pantalla`, `colores`, `medir`, `estado-marcadores`).
- `patt.js`: **nuestro codificador `.patt`**. Reproduce exactamente el `patt.hiro` oficial a partir de su imagen.
- `scripts/crear-marcadores.mjs`: dibuja la estrella y la escalera como polígonos y genera el SVG para imprimir y su `.patt`.
- `marcadores.html`: marcadores para imprimir y un **generador** con tu propia imagen, que corre 100% en el navegador.

## Cómo funciona un marcador

1. En cada cuadro de video, ARToolKit (dentro de AR.js) busca **cuadrados negros**.
2. Con las 4 esquinas calcula la **homografía**: cómo está girado e inclinado el cuadrado respecto a la cámara.
3. "Endereza" el interior, lo reduce a **16×16 píxeles** y lo compara con cada `.patt`. El archivo trae las 4 orientaciones, así sabe cuál marcador es y hacia dónde apunta.
4. Con el tamaño aparente y los parámetros de la cámara (`camera_para.dat`) obtiene la **pose** completa, es decir, la posición y la rotación en 3D. Eso es seguimiento de **6DoF**, que en el nivel 0 no teníamos.

## Lo que aprendimos

- **Unidades:** 1 = el ancho del marcador. El eje Y sale perpendicular al papel.
- Un buen marcador tiene **mucho contraste**, es **simple** y **no se ve igual al girarlo**. Un círculo no sirve porque no tiene orientación; el generador te avisa.
- El **margen blanco** importa: sin él, el borde negro se mezcla con el fondo.
- **Suavizado** (`smooth="true"`) promedia las últimas poses para que el objeto no tiemble.
- La cámara está fija en el origen y **los marcadores se mueven** a su alrededor (`modelViewMatrix`).
- Un bug que encontramos: AR.js pone el video con `z-index` negativo, así que un fondo en `<body>` lo tapa. El fondo va en `<html>`.

## Limitaciones

- Si tapas una parte del borde negro, el marcador se pierde.
- Con poca luz, reflejos o el marcador muy lejos o inclinado (más de unos 70°), la detección falla.
- Marcadores muy parecidos entre sí se confunden: solo comparan 16×16 píxeles.

## Retos

1. Crea tu propio marcador en `marcadores.html`, copia el `.patt` a `public/data/` y agrega un `<a-marker>` en `index.html`.
2. Haz que el cubo de la estrella cambie de tamaño según la distancia (usa el componente `medir` como guía).
3. Pon dos marcadores juntos y dibuja una línea entre ellos que diga la distancia que los separa.
