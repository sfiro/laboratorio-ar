// Selfie: la mascota se sube a tu cabeza (cámara frontal + MediaPipe, como en el nivel 4)
// y te IMITA: si abres la boca, abre la boca; si sonríes, sonríe; si parpadeas, parpadea;
// si subes las cejas, salta. Jugar así le sube el ánimo.
//
// Coordenadas: las de la cara del nivel 4, en CENTÍMETROS, con origen entre los ojos.
import * as THREE from 'three';
import { Mascota } from './mascota.js';
import { sonar } from './sonidos.js';

export function crearSelfie(ar, cuidado, { avisar }) {
  const cielo = new THREE.HemisphereLight('#ffffff', '#445566', 2.2);
  const sol = new THREE.DirectionalLight('#ffffff', 1.8);
  sol.position.set(0.3, 1, 1);
  ar.escena.add(cielo, sol);

  const mascota = new Mascota(cuidado.color);
  mascota.objeto.scale.setScalar(8);           // 8 cm de alto
  mascota.objeto.position.set(0, 10.5, -3);     // sobre tu cabeza
  ar.cara.grupo.add(mascota.objeto);
  mascota.mirada = new THREE.Vector3(0, 0, 2000); // tú estás "delante" de la pantalla

  // Corazones (en cm, dentro del grupo de la cara)
  const texturaCorazon = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const ctx = c.getContext('2d');
    ctx.font = '72px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('❤️', 48, 54);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const corazones = [];
  function corazon() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaCorazon, transparent: true, depthTest: false }));
    s.position.set((Math.random() - 0.5) * 6, 19, -3);
    s.scale.setScalar(2.2 + Math.random());
    ar.cara.grupo.add(s);
    corazones.push({ s, vida: 1.3 });
  }

  let antes = { boca: false, sonrisa: false, cejas: false };
  let salto = 0;
  let ultimoPremio = 0;
  let imitaciones = 0;

  function premio(t) {
    imitaciones++;
    corazon();
    if (t - ultimoPremio > 2) { cuidado.cambiar({ animo: 3 }); ultimoPremio = t; }
  }

  ar.alCuadro.push((t, dt, cara) => {
    dt = Math.min(dt, 0.05);
    cuidado.tic(dt);
    mascota.dormida = cuidado.durmiendo;

    const g = cara.gestos;
    const boca = g.jawOpen ?? 0;
    const sonrisa = ((g.mouthSmileLeft ?? 0) + (g.mouthSmileRight ?? 0)) / 2;
    const parpadeo = ((g.eyeBlinkLeft ?? 0) + (g.eyeBlinkRight ?? 0)) / 2;
    const cejas = g.browInnerUp ?? 0;

    if (cara.visible && !mascota.dormida) {
      // Imitar
      mascota.metas.boca = THREE.MathUtils.clamp((boca - 0.08) * 1.8, 0, 1);
      mascota.metas.sonrisa = sonrisa > 0.35 ? 1 : cuidado.humor > 0 ? 0.6 : -0.8;
      mascota.metas.entrecerrar = sonrisa > 0.35 ? 0.45 : 0;
      mascota.metas.parpado = parpadeo > 0.45 ? 0.05 : 1;
      // Momentos nuevos (el gesto EMPIEZA): sonido y premio
      const ahora = { boca: boca > 0.35, sonrisa: sonrisa > 0.35, cejas: cejas > 0.5 };
      if (ahora.boca && !antes.boca) { sonar.pop(); premio(t); }
      if (ahora.sonrisa && !antes.sonrisa) { sonar.feliz(); premio(t); }
      if (ahora.cejas && !antes.cejas && salto <= 0) { salto = 0.45; sonar.pateo(); premio(t); }
      antes = ahora;
    }

    // Salto: una parábola de 0.45 s, aplastándose al despegar y al caer
    if (salto > 0) {
      salto -= dt;
      const f = 1 - Math.max(0, salto) / 0.45;
      mascota.rebote = Math.sin(f * Math.PI) * 0.6;
      mascota.aplastar = f < 0.15 || f > 0.85 ? 0.12 : -0.08;
    } else { mascota.rebote = 0; mascota.aplastar = 0; }

    mascota.actualizar(t, dt);

    for (const c of corazones.slice()) {
      c.vida -= dt;
      c.s.position.y += dt * 6;
      c.s.material.opacity = Math.min(1, c.vida / 0.5);
      if (c.vida <= 0) { ar.cara.grupo.remove(c.s); c.s.material.dispose(); corazones.splice(corazones.indexOf(c), 1); }
    }
  });

  if (cuidado.durmiendo) avisar(`${cuidado.nombre} está dormida sobre tu cabeza. Despiértala con 💤.`);
  return { mascota, get imitaciones() { return imitaciones; } };
}
