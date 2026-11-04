# Nivel 0 · Taller

Preparar todo para probar AR en el celular: servidor con HTTPS, cámara, una capa virtual y sensores.

## Cómo correrlo

```bash
cd 00-taller
npm install
npm run dev
```

La terminal muestra un **código QR**. Escanéalo con el celular, que debe estar en el **mismo Wi-Fi** que la computadora.

El certificado HTTPS es autofirmado, así que el celular mostrará una advertencia:
- **Android/Chrome:** "Configuración avanzada" → "Continuar a 192.168.x.x".
- **iPhone/Safari:** "Mostrar detalles" → "visitar este sitio web".

## Qué hace

1. **Diagnóstico:** revisa si el celular tiene HTTPS, cámara, WebGL 2, giroscopio, WebXR AR y Quick Look.
2. **Cámara:** `getUserMedia` a pantalla completa (la trasera por defecto).
3. **Capa virtual:** un `<canvas>` encima del video con un cubo 3D que **proyectamos nosotros**, sin librerías.
4. **Giroscopio:** al activarlo, el cubo se queda "quieto en el mundo" mientras giras el celular.

## Lo que aprendimos

- **La cámara exige HTTPS.** La única excepción es `localhost`, por eso en el celular usamos un certificado autofirmado.
- **AR = mundo real + capa virtual alineada.** Aquí la capa es un canvas encima del video.
- **Proyección en perspectiva:** un punto 3D `(x, y, z)` se ve en la pantalla en `(f·x/−z, f·y/−z)`. Lo lejano se ve pequeño.
- **Seguimiento de 3 grados de libertad (3DoF):** el giroscopio sabe hacia dónde *apuntas*, pero no si te *mueves*. Por eso el cubo no se acerca al caminar. Para eso necesitamos 6DoF: marcadores, imágenes o SLAM, que veremos en los siguientes niveles.
- **iPhone pide permiso** para el giroscopio, y solo desde un toque del usuario.

## Retos

- Cambia el color o el tamaño del cubo en `main.js`.
- Dibuja una pirámide en vez de un cubo (vértices + aristas).
- Pon tres cubos en distintas direcciones: uno al frente, otro a la izquierda y otro atrás.
