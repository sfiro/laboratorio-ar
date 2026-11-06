// Las necesidades de la mascota y su memoria.
//
// Tres barras de 0 a 100: COMIDA, ENERGÍA y ÁNIMO. Bajan con el tiempo REAL, también
// mientras no la visitas: al volver calculamos cuántas horas pasaron. Se guardan en el
// celular (localStorage), así que cada celular tiene su propia mascota.
const CLAVE = 'ar-mascota';

// Cuánto cambia cada barra por hora
const POR_HORA = { comida: -6, energiaDespierta: -5, energiaDormida: 30, animo: -5 };

// Para probar sin esperar horas: ?rapido=60 hace que el tiempo pase 60 veces más rápido
const RAPIDO = Math.max(1, Number(new URLSearchParams(location.search).get('rapido')) || 1);

const limitar = (v) => Math.max(0, Math.min(100, v));

export class Cuidado {
  /** La mascota guardada en este celular, o null si todavía no nace */
  static cargar() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE));
      return datos?.nombre ? new Cuidado(datos) : null;
    } catch { return null; }
  }

  static nacer(nombre, color) {
    const ahora = Date.now();
    const c = new Cuidado({ nombre, color, nacimiento: ahora, ultimaVez: ahora, comida: 70, energia: 80, animo: 75, durmiendo: false });
    c.guardar();
    return c;
  }

  constructor(datos) {
    Object.assign(this, datos);
    this.ponerseAlDia();
  }

  /** Aplica lo que pasó desde la última vez (máximo 3 días: nunca llega a "abandono total") */
  ponerseAlDia() {
    const horas = Math.min(72, ((Date.now() - this.ultimaVez) / 3600000) * RAPIDO);
    this.avanzar(horas);
    this.ultimaVez = Date.now();
  }

  avanzar(horas) {
    this.comida = limitar(this.comida + POR_HORA.comida * horas);
    this.energia = limitar(this.energia + (this.durmiendo ? POR_HORA.energiaDormida : POR_HORA.energiaDespierta) * horas);
    // Con hambre se desanima más rápido
    this.animo = limitar(this.animo + POR_HORA.animo * horas * (this.comida < 20 ? 1.8 : 1));
    if (this.durmiendo && this.energia >= 100) this.durmiendo = false; // despierta sola, descansada
  }

  /** Llamar en cada cuadro: avanza el reloj y guarda de vez en cuando */
  tic(dt) {
    this.avanzar((dt / 3600) * RAPIDO);
    this.ultimaVez = Date.now();
    this._paraGuardar = (this._paraGuardar ?? 0) + dt;
    if (this._paraGuardar > 3) { this._paraGuardar = 0; this.guardar(); }
  }

  cambiar(cambios) {
    for (const [k, v] of Object.entries(cambios)) this[k] = limitar(this[k] + v);
    this.guardar();
  }

  guardar() {
    const { nombre, color, nacimiento, ultimaVez, comida, energia, animo, durmiendo } = this;
    try { localStorage.setItem(CLAVE, JSON.stringify({ nombre, color, nacimiento, ultimaVez, comida, energia, animo, durmiendo })); } catch { /* sin almacenamiento */ }
  }

  olvidar() { try { localStorage.removeItem(CLAVE); } catch { /* nada */ } }

  get dias() { return Math.floor((Date.now() - this.nacimiento) / 86400000); }

  /** Lo que más le falta: { necesidad, emoji } o null si está bien */
  get urgente() {
    const lista = [
      { necesidad: 'comida', valor: this.comida, emoji: '🍎' },
      { necesidad: 'energia', valor: this.energia, emoji: '💤' },
      { necesidad: 'animo', valor: this.animo, emoji: '🎾' },
    ].sort((a, b) => a.valor - b.valor);
    return lista[0].valor < 30 ? lista[0] : null;
  }

  /** De −1 (muy triste) a 1 (muy feliz) */
  get humor() {
    const minimo = Math.min(this.comida, this.energia, this.animo);
    return minimo < 25 ? -0.8 : minimo < 50 ? 0.3 : 1;
  }
}
