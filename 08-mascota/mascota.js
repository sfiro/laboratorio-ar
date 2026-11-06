// La mascota: un personaje hecho con código. Mide 1 unidad de alto, con los pies en y = 0
// y mirando hacia +z. Quien la use la escala: en la tarjeta mide 0.28 (del ancho de la
// tarjeta); en tu cabeza, 8 cm.
//
// No tiene "animaciones grabadas": tiene PERILLAS (párpados, sonrisa, boca, mirada, rebote,
// aplastar) que cambian suavemente hacia un valor objetivo. Las expresiones salen de combinarlas.
import * as THREE from 'three';

export const COLORES = {
  menta: { cuerpo: '#7be0c3', panza: '#d9fff3', oreja: '#4fc7a6' },
  rosa: { cuerpo: '#ff9cc2', panza: '#ffe3ee', oreja: '#f2709f' },
  lila: { cuerpo: '#b9a2ff', panza: '#efe9ff', oreja: '#9277f2' },
  durazno: { cuerpo: '#ffbd88', panza: '#fff0e1', oreja: '#f29a5a' },
};

const suave = (actual, meta, rapidez, dt) => actual + (meta - actual) * (1 - Math.exp(-rapidez * dt));

export class Mascota {
  constructor(color = 'menta') {
    const c = COLORES[color] ?? COLORES.menta;
    const mat = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, ...extra });
    const esfera = (r, material, [x, y, z], [sx, sy, sz] = [1, 1, 1]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), material);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      return m;
    };

    this.objeto = new THREE.Group();   // posición en el piso y hacia dónde mira
    this.cuerpo = new THREE.Group();   // se aplasta y rebota desde los pies
    this.objeto.add(this.cuerpo);

    const piel = mat(c.cuerpo);
    this.piel = piel;
    this.cuerpo.add(esfera(0.42, piel, [0, 0.45, 0], [1, 0.95, 0.9]));
    this.cuerpo.add(esfera(0.3, mat(c.panza), [0, 0.38, 0.22], [1, 1, 0.55]));
    this.cuerpo.add(esfera(0.08, piel, [0, 0.22, -0.38])); // colita

    // Orejas (con pivote abajo, para moverlas)
    this.orejas = [-1, 1].map((lado) => {
      const pivote = new THREE.Group();
      pivote.position.set(lado * 0.2, 0.78, -0.02);
      pivote.rotation.z = -lado * 0.35;
      pivote.add(esfera(0.13, mat(c.oreja), [0, 0.13, 0], [0.6, 1.3, 0.5]));
      this.cuerpo.add(pivote);
      return pivote;
    });

    // Brote en la cabeza
    const tallo = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.12, 8), mat('#3aa856'));
    tallo.position.set(0, 0.91, 0);
    const hoja = esfera(0.06, mat('#4cbb64'), [0.05, 0.98, 0], [1.4, 0.45, 0.8]);
    hoja.rotation.z = 0.5;
    this.brote = new THREE.Group().add(tallo, hoja);
    this.cuerpo.add(this.brote);

    // Ojos: blanco, pupila y brillo. Cada ojo se "cierra" escalándolo en Y (párpado).
    const blanco = mat('#ffffff', { roughness: 0.2 });
    const negro = mat('#1b1f2a', { roughness: 0.15 });
    this.ojos = [-1, 1].map((lado) => {
      const ojo = new THREE.Group();
      ojo.position.set(lado * 0.15, 0.56, 0.33);
      ojo.add(esfera(0.1, blanco, [0, 0, 0], [1, 1.1, 0.6]));
      const pupila = new THREE.Group();
      pupila.add(esfera(0.06, negro, [0, 0, 0.045], [1, 1.1, 0.6]));
      pupila.add(esfera(0.018, blanco, [0.022, 0.03, 0.08]));
      ojo.add(pupila);
      ojo.userData.pupila = pupila;
      this.cuerpo.add(ojo);
      return ojo;
    });

    // Cachetes
    const rubor = mat('#ff6f91', { transparent: true, opacity: 0.55 });
    for (const lado of [-1, 1]) this.cuerpo.add(esfera(0.06, rubor, [lado * 0.28, 0.43, 0.3], [1, 0.6, 0.3]));

    // Boca: una sonrisa (medio toro) o una boca abierta (óvalo oscuro con lengua)
    this.sonrisaMalla = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.014, 8, 20, Math.PI), negro);
    this.bocaAbierta = new THREE.Group().add(
      esfera(0.07, mat('#5a1e2c'), [0, 0, 0], [1, 1, 0.4]),
      esfera(0.04, mat('#ff7a90'), [0, -0.03, 0.012], [1, 0.6, 0.4]),
    );
    this.boca = new THREE.Group().add(this.sonrisaMalla, this.bocaAbierta);
    this.boca.position.set(0, 0.4, 0.4);
    this.cuerpo.add(this.boca);

    // Patitas (fuera del cuerpo: no se deforman cuando el cuerpo se aplasta)
    this.patas = [-1, 1].map((lado) => {
      const p = esfera(0.1, piel, [lado * 0.17, 0.05, 0.1], [1, 0.5, 1.3]);
      this.objeto.add(p);
      return p;
    });

    // Las perillas: valor actual y meta
    this.perillas = { parpado: 1, sonrisa: 0.6, boca: 0, entrecerrar: 0 };
    this.metas = { ...this.perillas };
    this.rebote = 0;       // altura extra (la pone quien la mueve, p. ej. al saltar)
    this.aplastar = 0;     // + = aplastado (al caer), − = estirado (al saltar)
    this.dormida = false;
    this.mirada = null;    // punto (en coordenadas del mundo) al que mira, o null
    this.proximoParpadeo = 2;
    this.risa = 0;         // segundos de cosquillas que quedan
  }

  /** Expresiones: atajos para poner varias metas a la vez */
  expresion(nombre) {
    const e = {
      feliz: { sonrisa: 1, entrecerrar: 0.45, boca: 0 },
      contenta: { sonrisa: 0.6, entrecerrar: 0, boca: 0 },
      triste: { sonrisa: -0.8, entrecerrar: 0.2, boca: 0 },
      sorpresa: { sonrisa: 0, entrecerrar: 0, boca: 0.8 },
    }[nombre];
    Object.assign(this.metas, e);
  }

  actualizar(t, dt) {
    const p = this.perillas, m = this.metas;

    // Parpadeo automático (si no está dormida)
    this.proximoParpadeo -= dt;
    if (this.proximoParpadeo < 0) { this.proximoParpadeo = 2 + Math.random() * 3; this.parpadeando = 0.13; }
    if (this.parpadeando > 0) this.parpadeando -= dt;
    const parpadoMeta = this.dormida ? 0.05 : this.parpadeando > 0 ? 0.08 : m.parpado;

    p.parpado = suave(p.parpado, parpadoMeta, 25, dt);
    p.sonrisa = suave(p.sonrisa, m.sonrisa, 6, dt);
    p.boca = suave(p.boca, m.boca, 14, dt);
    p.entrecerrar = suave(p.entrecerrar, m.entrecerrar, 8, dt);

    // Ojos
    for (const ojo of this.ojos) ojo.scale.y = Math.max(0.05, p.parpado * (1 - p.entrecerrar * 0.6));
    // Pupilas: miran hacia el punto de interés
    if (this.mirada) {
      for (const ojo of this.ojos) {
        const local = ojo.worldToLocal(this.mirada.clone()).normalize();
        ojo.userData.pupila.position.set(THREE.MathUtils.clamp(local.x * 0.05, -0.035, 0.035), THREE.MathUtils.clamp(local.y * 0.05, -0.03, 0.03), 0);
      }
    }

    // Boca: abierta, sonrisa o tristeza (la sonrisa volteada)
    const abierta = p.boca > 0.12;
    this.bocaAbierta.visible = abierta;
    this.sonrisaMalla.visible = !abierta;
    this.bocaAbierta.scale.set(0.7 + p.boca * 0.4, 0.3 + p.boca * 1.1, 1);
    this.sonrisaMalla.rotation.z = p.sonrisa >= 0 ? Math.PI : 0;
    this.sonrisaMalla.scale.set(1, Math.max(0.15, Math.abs(p.sonrisa)), 1);
    this.sonrisaMalla.position.y = p.sonrisa >= 0 ? 0.01 : -0.035;

    // Respirar, rebotar y aplastarse (conservando el volumen: si baja, se ensancha)
    const respira = Math.sin(t * (this.dormida ? 1.4 : 2.6)) * (this.dormida ? 0.035 : 0.02);
    const sy = 1 + respira - this.aplastar - (this.dormida ? 0.1 : 0);
    this.cuerpo.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    this.cuerpo.position.y = this.rebote;
    this.patas.forEach((p) => { p.position.y = 0.05 + this.rebote; }); // las patitas saltan con el cuerpo

    // Cosquillas: se sacude
    if (this.risa > 0) this.risa -= dt;
    this.cuerpo.rotation.z = this.risa > 0 ? Math.sin(t * 40) * 0.12 : suave(this.cuerpo.rotation.z, 0, 10, dt);

    // Orejas y brote: se mueven solos; caídos si está triste o dormida
    const caidas = this.dormida ? 0.5 : Math.max(0, -p.sonrisa) * 0.6;
    this.orejas.forEach((o, i) => { o.rotation.z = (i ? -1 : 1) * (0.35 + caidas) + Math.sin(t * 3 + i) * 0.06; });
    this.brote.rotation.z = Math.sin(t * 2.2) * 0.15;
  }
}
