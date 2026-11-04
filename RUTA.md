# Ruta de aprendizaje: Realidad Aumentada en el celular (100% software libre)

## La idea central: WebAR

Para que **cualquier persona** pruebe nuestros proyectos sin instalar nada, todo será **WebAR**:
una página web que abre la cámara del celular. Se comparte con un link o un código QR.

### Lo que hay que saber del panorama (noviembre 2026)

| Tecnología | Android (Chrome) | iPhone (Safari) | Para qué sirve |
|---|---|---|---|
| **WebXR** (estándar del navegador) | ✅ Sí (ARCore) | ❌ No: Safari en iPhone sigue sin WebXR | Detectar el piso/paredes y anclar objetos en el mundo |
| **model-viewer** (Google, Apache 2.0) | ✅ Scene Viewer | ✅ Quick Look | Ver un modelo 3D en tu cuarto, sin programar casi nada |
| **AR.js** (MIT) | ✅ | ✅ | Marcadores tipo QR y AR por GPS |
| **MindAR** (MIT) | ✅ | ✅ | Seguir imágenes (pósters, portadas) y caras |
| **MediaPipe** (Google, Apache 2.0) | ✅ | ✅ | Detectar manos, cara, cuerpo con IA en el navegador |
| **8th Wall** (ahora MIT) | ✅ | ✅ | Su plataforma comercial cerró en feb. 2026 y liberaron el motor como código abierto, *pero sin SLAM* (el seguimiento del mundo quedó como binario cerrado) |
| **OpenCV.js** (Apache 2.0) | ✅ | ✅ | Visión por computador para construir nuestro propio tracking |

**Conclusión:** lo que funciona en *todos* los celulares es la AR basada en la cámara + visión por
computador (marcadores, imágenes, caras, manos). La AR "de mundo" (poner un sofá en el piso) funciona
con WebXR en Android y con model-viewer/Quick Look en iPhone. Diseñaremos con eso en mente.

### Herramientas (todas gratis y libres)

- **Editor:** VS Code / VSCodium
- **Motor 3D:** [A-Frame](https://aframe.io) para empezar rápido (HTML) → [Three.js](https://threejs.org) para tener control total
- **Modelos 3D:** [Blender](https://blender.org) (exportar en `.glb`), y modelos libres de Poly Haven / Sketchfab (licencia CC)
- **Servidor local:** Vite (`npm create vite`) con HTTPS — **la cámara solo funciona con HTTPS**
- **Publicar gratis:** GitHub Pages (da HTTPS automático) → link + QR
- **Depurar en el celular:** `chrome://inspect` (Android) y Safari → Desarrollo (iPhone, desde el Mac)

---

## Niveles

### Nivel 0 — Preparar el taller (1 sesión)
- Instalar Node.js, crear proyecto con Vite, servir con HTTPS en la red local.
- Abrir la página desde el celular y mostrar la cámara en pantalla (`getUserMedia`).
- Publicar en GitHub Pages y generar un QR.
- **Aprendes:** por qué HTTPS, permisos de cámara, flujo de prueba en el celular.

### Nivel 1 — Un objeto 3D en tu cuarto (model-viewer)
- Una página con un modelo `.glb` y el botón "Ver en tu espacio".
- Funciona en Android **y** iPhone sin código de tracking.
- Extra: hacer tu propio modelo en Blender y animarlo.
- **Aprendes:** formatos 3D (glTF/GLB, USDZ), escala real, iluminación.

### Nivel 2 — Marcadores (AR.js + A-Frame)
- Imprimir un marcador (Hiro o uno propio) y que aparezca un cubo/personaje encima.
- Varios marcadores = varios objetos; tocar el objeto para cambiarlo.
- **Aprendes:** qué es una pose (posición + rotación), sistema de coordenadas, A-Frame.

### Nivel 3 — Imágenes que cobran vida (MindAR)
- Apuntar a una foto, póster o portada y reproducir un video o animación encima.
- Generar nuestros propios "targets" desde cualquier imagen.
- **Aprendes:** puntos característicos (features), por qué unas imágenes se siguen mejor que otras.

### Nivel 4 — Filtros de cara (MindAR Face / MediaPipe)
- Gafas, sombrero o máscara que siguen tu cara (estilo Instagram).
- Detectar gestos: abrir la boca, guiñar → disparar efectos.
- **Aprendes:** mallas faciales (468 puntos), oclusión, blendshapes.

### Nivel 5 — Interactuar con las manos (MediaPipe Hands + Three.js)
- Agarrar, mover y lanzar objetos virtuales con la mano frente a la cámara.
- Pasamos de A-Frame a Three.js puro.
- **Aprendes:** landmarks de la mano, detección de gestos, Three.js a fondo.

### Nivel 6 — AR por ubicación (AR.js location-based)
- Puntos de interés en el mapa de tu barrio que aparecen al mirar con el celular.
- **Aprendes:** GPS, brújula/giroscopio (`DeviceOrientation`), límites de precisión.

### Nivel 7 — AR de mundo real (WebXR hit-test)
- Detectar el piso y colocar muebles/objetos tocando la pantalla (Android).
- **Fallback para iPhone:** detectar el dispositivo y mandarlo a Quick Look (nivel 1).
- **Aprendes:** SLAM, anchors, hit-testing, estimación de luz, diseño multiplataforma.

### Nivel 8 — Un proyecto completo
Combinar lo anterior en algo publicable. Ideas:
- **Juego:** mini-juego de puntería o mascota virtual con física (cannon-es / Rapier).
- **Museo/escuela:** carteles que explican con animaciones 3D.
- **Multijugador:** dos celulares viendo el mismo objeto (WebSockets/WebRTC, servidor propio en Node).

### Nivel 9 — Nuestro propio motor de tracking (OpenCV.js)
La parte de "creado por nosotros mismos":
- Detectar un marcador cuadrado desde cero: umbral → contornos → esquinas → homografía → pose.
- Luego seguimiento de imágenes con ORB + emparejamiento de features.
- Conectar la pose calculada con una cámara de Three.js.
- **Aprendes:** cómo funcionan *por dentro* AR.js y MindAR. Entiendes toda la tubería.

---

## Estructura sugerida de carpetas

```
realidad aumentada proyecto/
├── RUTA.md
├── 00-taller/
├── 01-model-viewer/
├── 02-marcadores/
├── 03-imagenes/
├── 04-cara/
├── 05-manos/
├── 06-ubicacion/
├── 07-webxr/
├── 08-proyecto/
└── 09-motor-propio/
```

Cada nivel: un `index.html` que se pueda abrir en el celular, un README con lo aprendido, y publicado en GitHub Pages.

## Fuentes
- [Estado de WebXR en navegadores 2026 (vr.org)](https://vr.org/articles/webxr-interop-2026-cross-browser-standard)
- [Soporte WebXR por dispositivo](https://abratabia.com/webxr-games/webxr-device-support.php)
- [8th Wall pasa a código abierto (Road to VR)](https://www.roadtovr.com/niantic-webar-platform-8th-wall-open-source/)
- [Anuncio de Niantic Spatial](https://info.nianticspatial.com/blog/next-chapter)
- [AR.js](https://github.com/AR-js-org/AR.js) · [MindAR](https://github.com/hiukim/mind-ar-js)
