# Nivel 6 · AR por ubicación

Cosas puestas en **lugares reales del mundo**: el GPS dice dónde estás y la brújula hacia dónde miras. No hay que apuntar a ninguna imagen ni marcador.

En vez de AR.js usamos **un motor propio** (unas 250 líneas) con **Three.js**: así se ve cada paso.

## Cómo correrlo

```bash
cd 06-ubicacion
npm install
npm run dev        # escanea el QR con el celular
```

Publicado en: https://sfiro.github.io/laboratorio-ar/06-ubicacion/

Funciona mejor **al aire libre**. En la computadora, toca **«Probar sin salir (simulación)»**: arrastra para mirar y usa las flechas para caminar. Puedes elegir el lugar con `?simular=lat,lon`.

## Los modos

| Modo | Qué haces |
|---|---|
| **Tesoros** | Escondemos 3 cofres a entre 15 y 40 m de ti. Un rayo de luz marca cada uno. Camina hasta él y es tuyo (suena un *ding* hecho con WebAudio). |
| **Lugares** | Busca en **OpenStreetMap** los lugares con nombre a menos de 400 m y los muestra en la dirección en que están, con su distancia. |
| **Cielo** | Los puntos cardinales sobre el horizonte, el **Sol** y la **Luna** (con su fase), aunque estén bajo el horizonte, y el camino del Sol de hoy. |
| **Marcas** | Deja una marca donde estás (tu carro, un árbol…) y encuéntrala después. Se guardan solo en tu celular. |

El **radar** de arriba a la derecha gira contigo: lo que tienes enfrente queda arriba.

## Archivos

- `puente-ubicacion.js`: **nuestro motor**. Convierte el GPS a metros y la orientación del celular a la cámara 3D. También tiene la simulación.
- `astronomia.js`: dónde están el Sol y la Luna, y la fase de la Luna. Son fórmulas clásicas de baja precisión, con un error de ~1°.
- `modos.js`: los cuatro modos, las etiquetas y el radar.

## Cómo funciona

### 1. Del GPS a metros

La Tierra es casi una esfera de 6,371 km de radio. Para unos pocos kilómetros alrededor de un punto de origen podemos tratarla como plana:

```
metros al norte = Δlatitud  × (π/180) × 6 371 000
metros al este  = Δlongitud × (π/180) × 6 371 000 × cos(latitud)
```

El `cos(latitud)` existe porque los meridianos se juntan hacia los polos. En la escena: `x = este`, `−z = norte`, `y = arriba`. La cámara está a 1.5 m del piso.

### 2. De la orientación del celular a la cámara

El navegador da tres ángulos: **alfa** (giro como brújula), **beta** (inclinación adelante/atrás) y **gama** (inclinación de lado). Con ellos armamos un giro en 3D (un *cuaternión*). Luego le sumamos −90° en X, porque la cámara trasera mira hacia atrás del celular, no hacia arriba.

- **Android** tiene el evento `deviceorientationabsolute`: su alfa ya está medido desde el norte.
- **iPhone** da un alfa **relativo** (su cero es cualquier dirección) y aparte `webkitCompassHeading`. Calculamos la diferencia entre los dos, la suavizamos y la sumamos.

Lo probamos con eventos simulados de los dos tipos: celular parado mirando al norte (0°), girado (90° y 270°), mirando arriba y acostado.

### 3. Suavizar

- **GPS**: salta varios metros entre lecturas. La cámara camina suavemente hacia la última posición en vez de saltar.
- **Brújula**: tiembla. La cámara gira suavemente hacia la última orientación (`slerp`).

### 4. Que todo se vea, cerca o lejos

- Las **etiquetas** usan `sizeAttenuation: false`: miden lo mismo en pantalla a 5 m o a 400 m.
- Los **cofres** y las **marcas** crecen con la distancia, para no volverse un punto.
- Las etiquetas de **Lugares** que quedan en casi la misma dirección (menos de 12°) se acomodan en "pisos" para no encimarse.

### 5. El Sol y la Luna

Con la fecha, la latitud y la longitud se calcula dónde está el Sol en su órbita, cuánto ha girado la Tierra (hora sideral) y, de ahí, su **rumbo** y su **altura** sobre tu horizonte. Lo comprobamos con casos conocidos:
- El Sol a 66.6° al mediodía del solsticio en el ecuador, y casi vertical en el equinoccio.
- Las fechas de una luna llena, una nueva y un cuarto creciente.

El modo Cielo también sirve para **comprobar tu brújula**: si el Sol de la pantalla no coincide con el real, la brújula está descalibrada.

## Límites (y lo que aprendimos)

- **El GPS del celular tiene un error de 3 a 15 m** al aire libre, y de 30 m o más bajo techo o entre edificios altos. Por eso los cofres se recogen con un radio que crece si el GPS está impreciso (entre 6 y 15 m). La precisión actual se ve en el chip de arriba.
- **La brújula** se descalibra cerca de metales, imanes, fundas magnéticas o computadoras. Moverla en forma de 8 ayuda.
- **Norte magnético ≠ norte geográfico**: la diferencia (declinación) va de 0° a más de 10° según el país. No la corregimos.
- **Sin entender la imagen**, las cosas "flotan": no saben dónde está el piso de verdad, ni se esconden detrás de una pared. Eso viene en el nivel 7 con WebXR.
- Los servidores públicos de OpenStreetMap (Overpass) a veces tardan. Probamos varios, uno tras otro.

## Retos

1. Agrega un cuarto tesoro **dorado**, más lejos (60–80 m), que valga triple.
2. En **Marcas**, deja escribir un nombre para cada marca.
3. En **Cielo**, agrega la Estrella Polar (en el hemisferio norte está al norte, a una altura igual a tu latitud).
4. Haz un recorrido: una lista de puntos (lat, lon) con una pregunta en cada uno, como una búsqueda del tesoro para tus amigos.
