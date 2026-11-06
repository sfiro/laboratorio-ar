// Sonidos sintetizados con WebAudio: ningún archivo de audio, todo son osciladores y ruido.
let ctx = null;

/** Hay que llamarla dentro de un toque (los navegadores no dejan sonar sin interacción) */
export function prepararSonido() {
  try { ctx ??= new AudioContext(); ctx.resume(); } catch { /* sin audio */ }
}

// Una nota que sube o baja de frecuencia, con volumen que aparece y se apaga
function nota({ desde, hasta = desde, inicio = 0, dura = 0.15, tipo = 'sine', volumen = 0.2 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + inicio;
  const osc = ctx.createOscillator(), vol = ctx.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(desde, t0);
  osc.frequency.exponentialRampToValueAtTime(hasta, t0 + dura);
  vol.gain.setValueAtTime(0.0001, t0);
  vol.gain.exponentialRampToValueAtTime(volumen, t0 + 0.015);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + dura);
  osc.connect(vol).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dura + 0.02);
}

// Un golpecito de ruido filtrado (para masticar)
function ruido(inicio, dura = 0.07, frecuencia = 1800) {
  if (!ctx) return;
  const t0 = ctx.currentTime + inicio;
  const datos = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dura), ctx.sampleRate);
  const canal = datos.getChannelData(0);
  for (let i = 0; i < canal.length; i++) canal[i] = (Math.random() * 2 - 1) * (1 - i / canal.length);
  const fuente = ctx.createBufferSource();
  fuente.buffer = datos;
  const filtro = Object.assign(ctx.createBiquadFilter(), { type: 'bandpass' });
  filtro.frequency.value = frecuencia;
  const vol = ctx.createGain();
  vol.gain.value = 0.5;
  fuente.connect(filtro).connect(vol).connect(ctx.destination);
  fuente.start(t0);
}

export const sonar = {
  feliz: () => { nota({ desde: 700, hasta: 1100, dura: 0.1 }); nota({ desde: 900, hasta: 1500, inicio: 0.11, dura: 0.12 }); },
  risa: () => { for (let i = 0; i < 5; i++) nota({ desde: 900 + (i % 2) * 250, hasta: 800, inicio: i * 0.07, dura: 0.06, tipo: 'triangle', volumen: 0.15 }); },
  nam: () => { for (let i = 0; i < 3; i++) ruido(i * 0.12, 0.06, 1500 + Math.random() * 900); },
  triste: () => nota({ desde: 600, hasta: 300, dura: 0.45, tipo: 'triangle', volumen: 0.15 }),
  pop: () => nota({ desde: 300, hasta: 900, dura: 0.08, volumen: 0.15 }),
  pateo: () => nota({ desde: 220, hasta: 120, dura: 0.08, tipo: 'square', volumen: 0.08 }),
  bostezo: () => nota({ desde: 500, hasta: 220, dura: 0.7, volumen: 0.12 }),
};
