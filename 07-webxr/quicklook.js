// iPhone y iPad: Safari no tiene WebXR, pero sí AR Quick Look (el visor de AR de Apple).
// Quick Look abre archivos USDZ. En vez de prepararlos a mano, CONVERTIMOS nuestros objetos
// hechos con código a USDZ en el momento, con el exportador de Three.js.
// Quick Look se encarga de encontrar el piso, y de mover, girar y escalar el objeto.
import * as THREE from 'three';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';

/** ¿Este navegador sabe abrir AR Quick Look? (Safari en iOS) */
export function soportaQuickLook() {
  return document.createElement('a').relList.supports?.('ar') ?? false;
}

/** Objeto del catálogo → archivo USDZ (Uint8Array) */
export async function aUSDZ(item) {
  const { objeto } = item.crear();
  objeto.traverse((o) => { if (o.isLight) o.visible = false; }); // las luces no se exportan
  const escena = new THREE.Scene().add(objeto);
  escena.updateMatrixWorld(true);
  return new USDZExporter().parseAsync(escena, {
    quickLookCompatible: true,
    ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
  });
}

/** Abre Quick Look con el objeto. Necesita un enlace rel="ar" que contenga una imagen. */
export async function abrirEnQuickLook(item) {
  const datos = await aUSDZ(item);
  const url = URL.createObjectURL(new Blob([datos], { type: 'model/vnd.usdz+zip' }));
  const enlace = Object.assign(document.createElement('a'), { rel: 'ar', href: url, download: `${item.id}.usdz` });
  enlace.append(document.createElement('img'));
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
