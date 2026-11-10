# Nivel 9 · Nuestro propio motor de AR

El último nivel: **hacemos el motor**. Nada de AR.js ni de MindAR. Encontramos el objeto en la imagen, calculamos dónde está en 3D y le ponemos encima lo virtual. Con **«Ver lo que ve el motor»** se ve cada paso por dentro.

## Cómo correrlo

```bash
cd 09-motor-propio
npm install
npm run dev        # escanea el QR con el celular
```

Publicado en: https://sfiro.github.io/laboratorio-ar/09-motor-propio/

- **Marcadores**: imprime [los nuestros](marcadores.html) (de 5 a 10 cm). Puedes usar varios a la vez.
- **Imagen**: usa la tarjeta del [nivel 8](../08-mascota/tarjeta.html), impresa o en otra pantalla.

## Parte 1 · Marcadores, 100 % nuestro (`marcadores.js`)

Es la misma tubería que usan AR.js y ArUco por dentro, escrita desde cero:

| Paso | Qué hace | Cómo |
|---|---|---|
| 1. Grises | Cada píxel → un brillo | `0.30·R + 0.59·G + 0.11·B` |
| 2. Umbral adaptativo | ¿Más oscuro que su vecindario? → negro | Promedio de la ventana con una **imagen integral** (4 lecturas por píxel, sin importar el tamaño de la ventana). Así aguanta sombras. |
| 3. Regiones | Juntar píxeles negros conectados | Relleno con una pila. Se descartan regiones pequeñas o cortadas por el borde. |
| 4. Contorno | Recorrer el borde de cada región | Seguimiento de Moore: siempre pegados al borde, girando en el sentido del reloj. |
| 5. Polígono | ¿Quedan 4 esquinas? | **Douglas-Peucker**: quedarse solo con los puntos que dan la forma. Además: convexo y con lados parecidos. |
| 6. Esquinas precisas | Precisión de menos de un píxel | Una recta por cada lado (mínimos cuadrados) y su intersección, corregida medio píxel hacia fuera. |
| 7. Código | ¿Qué marcador es y cómo está girado? | Homografía a la cuadrícula de 7×7, leer cada celda, comparar con el diccionario en sus **4 giros**. Se toleran 2 celdas mal leídas. |
| 8. Pose | Dónde está en 3D | Homografía → pose → refinamiento (ver abajo). |

### Nuestro formato de marcador
7×7 celdas: un anillo negro y 5×5 celdas de datos. `scripts/crear-marcadores.mjs` busca al azar (con semilla) **8 códigos** que:
- se ven distintos al girarlos, para saber cómo está girado el marcador;
- difieren en **al menos 9 celdas** de cualquier otro, aunque estén girados.

Con 9 celdas de diferencia, corregir 2 errores nunca confunde un marcador con otro.

## Mis objetos 3D (`mis-objetos.js`, `editor-objetos.js`)

Pon **tus propios modelos** sobre los marcadores, desde el celular y sin tocar código:

1. En la portada del nivel toca **«🧩 Elegir mis objetos»**.
2. Toca un marcador (0 a 7) y luego **«📂 Elegir modelo…»**.
3. Ajusta tamaño, giro, altura y movimiento mirando la vista previa: el marcador en el piso y tu objeto encima, igual que saldrá en la cámara.
4. Toca **«📷 Probar con la cámara»**.

| Formato | Notas |
|---|---|
| `.glb` | El mejor: todo en un archivo, con texturas y animaciones. También comprimido con **Draco** o **Meshopt**. |
| `.gltf` | Si trae `.bin` o texturas aparte, **elígelos todos a la vez**. |
| `.obj` | Elige también su `.mtl` y sus texturas. Si falta el `.mtl`, te avisa y lo pinta gris. |
| `.stl` / `.ply` | Típicos de impresión 3D. Suelen venir con Z hacia arriba: marca **«Sale acostado»**. |
| `.fbx` | Funciona, pero conviene pasarlo a `.glb` con Blender. |

- Cada objeto puede ser:
  - **Solo aquí**: guardado en ese navegador (IndexedDB). No se sube a ningún lado.
  - **Del proyecto**: está en `public/objetos/` y se publica con la página, así que **sale en cualquier celular en lugar del genérico**. Con `npm run dev`, en la computadora, el botón **«💾 Guardar en el proyecto (para todos)»** copia tus archivos y ajustes ahí. Después hay que publicar (commit y push).
  - Si cambias en el celular los ajustes de un objeto del proyecto, ese cambio queda «solo aquí», y **«↩︎ Volver al del proyecto»** lo deshace.
- El selector de archivos no filtra por tipo: los celulares no conocen tipos como `.stl` o `.glb` y no dejarían elegirlos. El formato se revisa después de elegir.
- Cada modelo se **normaliza**: se centra, se apoya en el papel y su lado más grande mide 0.8 del marcador. Así da igual si lo hiciste en milímetros o en metros.
- Si el modelo trae **animaciones**, se elige cuál se reproduce. Si no, puede girar, flotar o quedarse quieto.
- **Orientación**:
  - **«¿Qué eje del modelo va hacia arriba?»** corrige los modelos que salen acostados o de cabeza. Cada programa usa su convención: glTF usa Y arriba; Blender y los `.stl`, Z arriba.
  - **Girar, inclinar adelante e inclinar a los lados** dejan el objeto en la pose fija que quieras.
- **Giro animado**: eliges el **eje** (vertical, horizontal de lado a lado, horizontal de adelante a atrás, o el propio eje del objeto inclinado) y la **velocidad**; los valores negativos giran al revés. El giro es sobre el **centro** del objeto, y en la vista previa una **flecha amarilla** muestra el eje.
- Para que vaya fluido en el celular: menos de **100 000 triángulos** y texturas de 2048 px como máximo. Con más de 300 000 te avisa.
- Modelos de prueba en `pruebas/modelos/`: un `.glb` animado, una torre `.stl` con Z arriba y un dado `.obj` + `.mtl`.

### Animar tus objetos (`animaciones.js`)
Funciona aunque el modelo no traiga animaciones, como un `.stl`:

- **Movimiento** (todo el cuerpo): girar, flotar, **respirar**, **saltar** (se agacha, salta y se aplasta al caer) y **balancearse**. Con **Ritmo** cambias la rapidez.
- **Mover una parte**: cambia la posición de los **vértices** en la tarjeta gráfica (un *shader*), así que una parte se mueve distinto del resto aunque el modelo sea una sola pieza.
  - **Saludar**: toca **«👆 Tocar la parte que se mueve»** y luego la pata en la vista previa. Esa zona se pinta de amarillo (solo en la vista previa) y se dobla alrededor de su "hombro". Ajusta el tamaño de la zona, la dirección, la fuerza y el ritmo.
  - **Gelatina**: el modelo se tambalea más cuanto más arriba, como un flan.
- La deformación se agrega a los **materiales que ya trae el modelo** (`onBeforeCompile`): conserva sus colores, texturas y luces.

Las skills de Three.js (`.claude/skills/`, de [CloudAI-X/threejs-skills](https://github.com/cloudai-x/threejs-skills), licencia MIT) guiaron esta parte: `threejs-animation` (reloj, mezclador de animaciones) y `threejs-shaders` (extender materiales). Para animar con **esqueleto** (pata, cola y cabeza por separado), haz el modelo en **Blender**, expórtalo a `.glb` con sus animaciones y elígelas en «Movimiento».

**¿Dónde consigo modelos?** Hazlos con **Blender** (libre) y exporta a glTF Binary (`.glb`). O descárgalos con licencia libre (CC0 o CC-BY) de Poly Haven, Kenney o Sketchfab (filtro «Downloadable»), dando el crédito que pida la licencia.

## Parte 2 · Imagen: ORB y flujo óptico (`imagenes.js`)

Así funciona MindAR por dentro, en dos fases. De **OpenCV.js** usamos solo ORB, el emparejador, RANSAC y el flujo óptico.

**Buscar** (lento, cuando no sabemos dónde está la imagen):
1. **ORB** encuentra cientos de esquinas en la referencia y en el cuadro, y describe cada una con 256 bits.
2. **Emparejar**: la distancia es cuántos bits cambian (Hamming). Con la **prueba de Lowe** nos quedamos con las parejas claras: la mejor debe ser mucho mejor que la segunda.
3. **RANSAC**: muchas parejas son errores. Se prueban homografías con 4 parejas al azar y gana la que más parejas explica.

**Seguir** (rápido, cuadro a cuadro):
4. **Flujo óptico** (Lucas-Kanade): en vez de buscar otra vez, medimos cuánto se movió cada punto respecto al cuadro anterior. Si se pierden muchos, volvemos a buscar. Cada 45 cuadros buscamos de todos modos, para renovar los puntos.

## La matemática (`matematica.js`, sin librerías)

**Homografía (DLT normalizado)**. Una homografía H lleva un plano a la imagen. Cada pareja de puntos da 2 ecuaciones lineales:
- con 4 parejas se resuelve exacto;
- con más, por mínimos cuadrados.

Antes centramos y escalamos los puntos (**normalización de Hartley**), que mejora mucho la precisión.

**Pose desde la homografía**. Si el plano es Z = 0, entonces `K⁻¹·H = λ·[r1 r2 t]`:
- las dos primeras columnas de la rotación y la traslación salen directo;
- `r3 = r1 × r2`;
- con una iteración polar dejamos la rotación perfectamente ortonormal.

**Refinamiento (Gauss-Newton)**. Ajustamos 6 números (3 de giro y 3 de posición) para que los puntos proyectados caigan lo más cerca posible de los medidos. El giro se optimiza como una **corrección pequeña** sobre la rotación inicial.

**De OpenCV a Three.js**. OpenCV usa y hacia abajo y z hacia adelante; Three.js, y hacia arriba y z hacia atrás. Basta invertir el signo de las filas Y y Z de la pose. La cámara virtual usa la **misma K** con la que calculamos la pose; por eso lo 3D cae exactamente sobre el video.

## Cómo lo probamos

Con datos que conocemos de antemano, para medir el error exacto:
- `node pruebas/matematica.test.mjs`: homografía y pose exactas con datos perfectos (error de 10⁻¹³ px). Con ruido, el refinamiento baja el error de reproyección.
- `node pruebas/marcadores.test.mjs`: imágenes sintéticas dibujadas con una pose conocida (`pruebas/renderizar.mjs`). Casos: de frente, inclinado 40°, girado en su plano 90° y 200°, dos a la vez con ruido y sombra, y pequeño y lejos.

| Caso | Error de giro | Error de posición |
|---|---|---|
| De frente | 0.00° | 0.6 % |
| Inclinado 40° | 0.07° | 0.24 % |
| Girado 90° en su plano | 0.00° | 0.6 % |
| Girado 200° e inclinado | 2.0° | 0.8 % |
| Dos a la vez, con ruido y sombra | 0.2–0.3° | 0.2 % |
| Pequeño y lejos (~30 px) | 1.2° | 1.1 % |

En el navegador, con la cámara simulada, dos marcadores dieron errores de **0.1–0.3°** y **0.1–0.15 %**, con **8 ms** por cuadro en 270×480.

## Lo que aprendimos (los errores que encontraron las pruebas)

- **El punto raro de 180°.** Un marcador visto de frente está girado 180° respecto a la cámara, y ahí la representación de Rodrigues se vuelve singular. Por eso el refinamiento optimiza una corrección pequeña.
- **Medio píxel importa.** El contorno pasa por el centro de los píxeles de la orilla, pero el borde real está medio píxel afuera. Corregirlo bajó el error de distancia de 1.2 % a 0.6 %.
- **Gauss-Newton minimiza el error cuadrático**, no el error medio. Hay que medir con la misma vara (RMS).

## Límites

- **No calibramos la cámara**: suponemos que su lado largo ve unos 63°. Con otra lente, la distancia sale un poco escalada, pero lo 3D sigue cayendo en su lugar porque la cámara virtual usa la misma suposición.
- Un marcador muy pequeño o muy inclinado tiene una **ambigüedad** de pose (puede "voltearse"). Con varios marcadores o con la imagen (muchos puntos) pasa mucho menos.
- ORB en el celular cuesta decenas de milisegundos. Por eso solo se busca cuando hace falta y el resto del tiempo se sigue con flujo óptico.

## Retos

1. **Calibra tu cámara**: mide un marcador de tamaño conocido a una distancia conocida y despeja la distancia focal.
2. Agrega más códigos al diccionario (sube `CANTIDAD`) y mira cómo baja la distancia mínima.
3. Usa **dos marcadores** para medir la distancia entre ellos en centímetros.
4. Cambia ORB por otro detector y compara cuántos puntos sobreviven a RANSAC.
