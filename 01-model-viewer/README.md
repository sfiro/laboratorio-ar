# Nivel 1 · Un objeto 3D en tu espacio

Un cohete que **construimos con código** y que puedes poner en tu cuarto, en Android y en iPhone.

## Cómo correrlo

```bash
cd 01-model-viewer
npm install
npm run modelo   # (opcional) vuelve a generar public/cohete.glb
npm run dev      # escanea el QR con el celular
```

Publicado en: https://sfiro.github.io/laboratorio-ar/01-model-viewer/

## Qué hace

- **El modelo** (`scripts/crear-cohete.mjs`): arma el cohete con cilindros, conos y cajas de three.js, le pone materiales y una animación, y lo guarda como `.glb` con glTF-Transform. Pasa el validador oficial de Khronos sin errores.
- **La página** usa `<model-viewer>` para:
  - girar y hacer zoom con los dedos,
  - mostrar etiquetas pegadas a partes del modelo (*hotspots*),
  - cambiar el color del material `Pintura` en vivo,
  - el botón **"Ver en tu espacio"**, que abre la AR.
- **Sube tu .glb**: prueba cualquier modelo propio, por ejemplo uno hecho en Blender.

## Qué AR usa cada celular

| Celular | Modo | Qué pasa |
|---|---|---|
| Android con Chrome | **WebXR** | La AR corre dentro de la página. Detecta el piso y colocas el cohete. |
| Android (otra opción) | **Scene Viewer** | Abre el visor de Google. El modelo debe estar en una URL pública, por eso en la red local se usa WebXR. |
| iPhone / iPad | **Quick Look** | model-viewer convierte el `.glb` a `.usdz` al momento y lo abre en el visor AR de Apple. |

Por eso pusimos `ar-modes="webxr scene-viewer quick-look"`: se usa el primero que funcione.

## Lo que aprendimos

- **glTF/GLB** es el formato estándar y abierto para 3D en la web. **USDZ** es el de Apple.
- **La escala es real:** 1 unidad = 1 metro. Nuestro cohete mide unos 60 cm (`ar-scale="fixed"`).
- **Materiales PBR:** color base, metálico y rugosidad. Así el vidrio de la ventana refleja y la pintura no.
- **Emisivo:** la llama brilla con luz propia.
- **Jerarquía de nodos:** la llama es hija del cohete, así que se mueve con él. La plataforma no.
- **Animación por fotogramas clave:** tiempos `[0, 1, 2]` y posiciones; el visor interpola entre ellos.
- Esta AR es **"de mundo"** (6DoF): el teléfono entiende el piso y puedes caminar alrededor del cohete. La hace el sistema (ARCore/ARKit), no nosotros.

## Limitaciones

- En iPhone, la conversión automática a USDZ **no incluye la animación**. Para tenerla habría que exportar un `.usdz` desde Blender y pasarlo en `ios-src`.
- Con "Subir tu .glb", Scene Viewer no funciona porque el archivo no tiene una URL pública. WebXR y Quick Look sí.

## Retos

1. Cambia la forma del cohete en `scripts/crear-cohete.mjs`: más aletas, una segunda ventana. Luego corre `npm run modelo`.
2. Agrega una animación que haga girar el cohete (`rotation` usa cuaterniones: `[x, y, z, w]`).
3. Haz un objeto en **Blender**, expórtalo como `.glb` (Archivo → Exportar → glTF 2.0) y súbelo con el botón.
4. Agrega un selector para cambiar entre varios modelos.
