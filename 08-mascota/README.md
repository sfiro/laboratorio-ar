# Nivel 8 · Tu mascota en realidad aumentada

Un proyecto completo que junta lo aprendido. Una criatura hecha con código **vive sobre una tarjeta**: la alimentas, juegas con ella, la acuestas a dormir… y si no la visitas, le da hambre. También **se sube a tu cabeza** para tomarse selfies contigo y te imita.

Funciona en **iPhone y Android** (no necesita WebXR).

## Cómo correrlo

```bash
cd 08-mascota
npm install
npm run dev        # escanea el QR con el celular
```

Publicado en: https://sfiro.github.io/laboratorio-ar/08-mascota/

1. Ponle nombre y color, y toca **«¡Que nazca!»**.
2. Abre la **tarjeta** ([tarjeta.html](tarjeta.html)) para imprimirla o mostrarla en otra pantalla. También puedes usar **cualquier imagen** como casa.
3. **Visitar su casa** (cámara trasera) o **Selfie juntos** (cámara frontal).

## Qué puedes hacer

| En su casa | |
|---|---|
| 🍎 **Comer** | Cae una manzana o una galleta. Camina hasta ella y la come en tres mordidas. |
| 🎾 **Jugar** | Aparece una pelota. La persigue y la patea. Le sube el ánimo, pero la cansa. |
| 💤 **Dormir** | Va al tapete, cierra los ojos y salen 💤. Se apaga la luz y recupera energía. |
| **Tocarla** | Cosquillas: se ríe, se sacude y le salen corazones. Si está dormida, se despierta de malas. |

| En el selfie | |
|---|---|
| Abres la boca | Abre la boca |
| Sonríes | Sonríe y entrecierra los ojos |
| Parpadeas | Parpadea |
| Subes las cejas | Salta |
| 📸 **Foto** | Foto juntos para guardar o compartir |

Imitarte le sube el ánimo.

## Lo que juntamos de cada nivel

| Nivel | Qué usamos aquí |
|---|---|
| 3 · Imágenes | El puente con MindAR y el compilador en el navegador: la tarjeta es una imagen objetivo, y también puedes usar la tuya. |
| 4 · Cara | El puente con MediaPipe: la mascota se pega a tu cabeza (en cm) y lee tus 52 gestos. |
| 5 · Manos | La idea de detectar el **inicio** de un gesto (no cada cuadro) para reaccionar una sola vez. |
| 2, 3 | Diseñar una imagen objetivo con muchos detalles (`npm run tarjeta`). |

## Lo nuevo de este nivel

### 1. Un personaje con "perillas"
La mascota (`mascota.js`) no tiene animaciones grabadas. Tiene **perillas**: párpados, sonrisa, boca, mirada, rebote y aplastar. Cada una se acerca suavemente a un valor meta (`actual += (meta − actual) · (1 − e^(−k·dt))`).

Las expresiones son combinaciones de perillas: *feliz* = sonrisa 1 + ojos entrecerrados. El parpadeo, la respiración y el movimiento de las orejas son automáticos.

Al saltar se **aplasta y se estira conservando su volumen**: si se hace más bajita, se hace más ancha. Es un principio clásico de la animación.

### 2. Comportamiento: una máquina de estados
La mascota siempre está haciendo **una** tarea: `quieto`, `caminar`, `masticar`, `jugar` o `dormir`. Cada tarea decide cuál sigue. Por ejemplo, *comer* es caminar hasta la comida, luego masticar, luego quedarse quieta.

Para caminar, primero **gira** hacia el destino y luego avanza dando saltitos.

### 3. Necesidades con memoria
Hay tres barras de 0 a 100 (`cuidado.js`), guardadas en el celular con `localStorage`:

| Barra | Despierta | Dormida |
|---|---|---|
| Comida | −6 por hora | −6 por hora |
| Energía | −5 por hora | **+30** por hora |
| Ánimo | −5 por hora (más rápido si tiene hambre) | −5 por hora |

Al volver, calculamos cuántas horas pasaron (máximo 3 días). Si se quedó dormida, sigue durmiendo y despierta sola cuando está descansada. Cuando algo baja de 30, aparece una **burbuja de pensamiento** con lo que necesita.

Para probar sin esperar horas: `?rapido=60` hace que el tiempo pase 60 veces más rápido.

### 4. Todo hecho por nosotros
- **La mascota, la comida, la pelota y la tarjeta** están hechas con código. No hay modelos ni imágenes descargadas.
- **Los sonidos** son osciladores y ruido de WebAudio (`sonidos.js`), sin archivos de audio.
- **La casa propia** se compila en el navegador y se guarda en **IndexedDB**, que es mejor que `localStorage` para datos binarios.

### 5. Cargar solo lo necesario
MindAR (con TensorFlow.js) y MediaPipe pesan mucho. Con `import()` dinámico solo se descarga el que vas a usar: la casa o el selfie.

## Lo que aprendimos al probarla

- **Las luces van en la escena, no en la tarjeta.** La dirección de una luz se calcula con su posición en el mundo, y en el mundo de MindAR la tarjeta está a cientos de unidades. Con las luces dentro de la tarjeta, la mascota se veía casi negra.
- **Al saltar, las patitas deben ir con el cuerpo.** Al principio se quedaban en el piso.
- **El ritmo de las necesidades importa.** Con el primero, una noche fuera la dejaba sin comida ni ánimo. Lo bajamos para que al día siguiente te extrañe, pero no quede en cero.

## Cómo lo probamos

Con cámaras simuladas en Chrome sin ventana:
- **La casa**: la tarjeta vista en ángulo. La mascota nace, la encuentra, come (comida de 40 a 70), juega cinco pateos (ánimo a 100, energía −8), duerme y se ríe al tocarla.
- **El selfie**: con la Mona Lisa como cara de prueba y gestos simulados. Imita la boca, sonríe y salta, y la foto sale con todo.
- **El paso del tiempo**: probamos el cálculo de las horas fuera, despierta y dormida.

## Archivos

- `mascota.js`: el personaje y sus perillas.
- `casa.js`: la escena sobre la tarjeta y el comportamiento.
- `selfie.js`: la mascota en tu cabeza.
- `cuidado.js`: las necesidades y la memoria.
- `sonidos.js`: los sonidos sintetizados.
- `puente-mindar.js` (del nivel 3) y `puente-cara.js` (del nivel 4).
- `scripts/crear-tarjeta.mjs` + `herramientas.html`: diseñar la tarjeta y compilarla a `objetivos.mind` (solo en desarrollo).

## Retos

1. Agrega una necesidad nueva: **limpieza** (🛁), que baje al jugar.
2. Haz que **crezca**: más grande cada semana, con un cambio de forma a los 7 días.
3. Que **reconozca la hora**: de noche se duerme sola.
4. Un **juego** en la casa: esconde la comida debajo de una de tres tazas.
