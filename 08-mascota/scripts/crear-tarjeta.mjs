// Diseña la tarjeta donde vive la mascota (SVG, 1200×900): un jardín visto desde arriba.
//
// Para que MindAR la siga bien necesita MUCHOS detalles con esquinas y contraste, repartidos
// por toda la tarjeta, y nada de zonas grandes lisas ni patrones repetidos. Por eso: flores,
// piedras, matas de pasto, hongos, un estanque y letras, todo con números "aleatorios" con
// semilla (así la tarjeta siempre sale igual y el archivo .mind sigue sirviendo).
import fs from 'node:fs';

const W = 1200, H = 900;

function azar(semilla) {
  return () => {
    semilla = (semilla * 1664525 + 1013904223) % 4294967296;
    return semilla / 4294967296;
  };
}
const r = azar(2026);
const entre = (a, b) => a + r() * (b - a);
const elegir = (lista) => lista[Math.floor(r() * lista.length)];

const partes = [];
partes.push(`<defs>
  <radialGradient id="pasto" cx="0.5" cy="0.5" r="0.75"><stop offset="0" stop-color="#8fd16a"/><stop offset="1" stop-color="#3f8f3a"/></radialGradient>
  <radialGradient id="agua" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#9be3ff"/><stop offset="1" stop-color="#2a7fc4"/></radialGradient>
</defs>`);
partes.push(`<rect width="${W}" height="${H}" fill="url(#pasto)"/>`);

// Lugares ocupados (para que las cosas no se encimen demasiado)
const ocupado = [];
const libre = (x, y, rad) => ocupado.every(([ox, oy, or]) => Math.hypot(ox - x, oy - y) > or + rad);
const reservar = (x, y, rad) => ocupado.push([x, y, rad]);

// El tapete del centro: donde vive la mascota (con dibujo propio, también da detalles)
const CX = 600, CY = 470;
reservar(CX, CY, 175);
partes.push(`<ellipse cx="${CX}" cy="${CY}" rx="190" ry="150" fill="#f6d28b" stroke="#a0522d" stroke-width="12"/>`);
partes.push(`<ellipse cx="${CX}" cy="${CY}" rx="150" ry="112" fill="none" stroke="#e5484d" stroke-width="8" stroke-dasharray="26 14"/>`);
for (let i = 0; i < 14; i++) {
  const a = (i / 14) * Math.PI * 2;
  const x = CX + Math.cos(a) * 172, y = CY + Math.sin(a) * 134;
  partes.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${i % 2 ? '#4f8cff' : '#7a2e8e'}"/>`);
}
// Huellitas en el tapete (todas distintas de tamaño y giro)
for (let i = 0; i < 9; i++) {
  const a = entre(0, Math.PI * 2), d = entre(20, 95);
  const x = CX + Math.cos(a) * d * 1.25, y = CY + Math.sin(a) * d * 0.9, giro = entre(0, 360), s = entre(0.7, 1.2);
  partes.push(`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${giro.toFixed(0)}) scale(${s.toFixed(2)})" fill="#c1803a">
    <ellipse cx="0" cy="6" rx="11" ry="9"/><circle cx="-11" cy="-8" r="4.5"/><circle cx="-3" cy="-13" r="4.5"/><circle cx="6" cy="-12" r="4.5"/><circle cx="13" cy="-5" r="4.5"/></g>`);
}

// Estanque
reservar(1010, 720, 130);
partes.push(`<ellipse cx="1010" cy="720" rx="140" ry="95" fill="url(#agua)" stroke="#1b5e8f" stroke-width="8"/>`);
for (let i = 0; i < 5; i++) {
  partes.push(`<ellipse cx="${entre(940, 1070).toFixed(0)}" cy="${entre(680, 760).toFixed(0)}" rx="${entre(14, 34).toFixed(0)}" ry="${entre(6, 12).toFixed(0)}" fill="none" stroke="#e6f7ff" stroke-width="3"/>`);
}
partes.push(`<g transform="translate(1060 690) rotate(-20)"><ellipse rx="30" ry="22" fill="#2f8f46"/><path d="M0 0 L30 -6 L30 6 Z" fill="url(#agua)"/></g>`);

// Casita (arriba a la izquierda)
reservar(150, 180, 120);
partes.push(`<g transform="translate(150 190)">
  <rect x="-80" y="-30" width="160" height="110" fill="#ffd166" stroke="#7a4b1f" stroke-width="8"/>
  <path d="M-100 -25 L0 -110 L100 -25 Z" fill="#e5484d" stroke="#7a2020" stroke-width="8"/>
  <rect x="-22" y="20" width="44" height="60" rx="20" fill="#7a4b1f"/>
  <rect x="-66" y="-10" width="34" height="30" fill="#9ad7ff" stroke="#7a4b1f" stroke-width="5"/>
  <rect x="32" y="-10" width="34" height="30" fill="#9ad7ff" stroke="#7a4b1f" stroke-width="5"/>
  <circle cx="12" cy="52" r="5" fill="#ffd166"/></g>`);

// Camino de piedras de la casita al tapete
for (let i = 0; i < 6; i++) {
  const t = (i + 1) / 7;
  const x = 150 + (CX - 190 - 150) * t + entre(-12, 12), y = 290 + (CY - 290) * t + entre(-12, 12);
  reservar(x, y, 32);
  partes.push(`<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${entre(26, 36).toFixed(0)}" ry="${entre(18, 26).toFixed(0)}" transform="rotate(${entre(-40, 40).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="#c9c3b8" stroke="#6e675c" stroke-width="5"/>`);
}

// Letras: el nombre del lugar y el del proyecto
partes.push(`<text x="1170" y="78" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="62" fill="#fff" stroke="#1d4d1a" stroke-width="10" paint-order="stroke">CASA DE MASCOTA</text>`);
partes.push(`<text x="40" y="870" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="30" fill="#14361a">Laboratorio AR · Nivel 8</text>`);
for (let x = 580; x <= 1180; x += 40) reservar(x, 52, 42); // el título
for (let x = 40; x <= 400; x += 40) reservar(x, 858, 28); // el pie

// Flores, hongos, piedras y matas de pasto por todos lados
const colores = ['#ff5d8f', '#ffd166', '#ffffff', '#b388ff', '#ff8a3d', '#4f8cff', '#e5484d'];
function flor(x, y, rad) {
  const n = Math.floor(entre(5, 8)), color = elegir(colores), giro = entre(0, 90);
  let s = `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${giro.toFixed(0)})">`;
  for (let i = 0; i < n; i++) s += `<ellipse cx="0" cy="${(-rad * 0.6).toFixed(1)}" rx="${(rad * 0.32).toFixed(1)}" ry="${(rad * 0.55).toFixed(1)}" fill="${color}" stroke="#00000040" stroke-width="2" transform="rotate(${(i * 360 / n).toFixed(0)})"/>`;
  return s + `<circle r="${(rad * 0.3).toFixed(1)}" fill="${color === '#ffd166' ? '#e5484d' : '#ffd166'}"/></g>`;
}
function hongo(x, y, rad) {
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><rect x="${(-rad * 0.25).toFixed(1)}" y="0" width="${(rad * 0.5).toFixed(1)}" height="${(rad * 0.8).toFixed(1)}" fill="#fff4e0" stroke="#7a4b1f" stroke-width="2"/>
    <path d="M${-rad} 2 A${rad} ${rad * 0.8} 0 0 1 ${rad} 2 Z" fill="#e5484d" stroke="#7a2020" stroke-width="3"/>
    <circle cx="${(-rad * 0.4).toFixed(1)}" cy="${(-rad * 0.35).toFixed(1)}" r="${(rad * 0.16).toFixed(1)}" fill="#fff"/><circle cx="${(rad * 0.3).toFixed(1)}" cy="${(-rad * 0.5).toFixed(1)}" r="${(rad * 0.12).toFixed(1)}" fill="#fff"/></g>`;
}
function piedra(x, y, rad) {
  return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rad.toFixed(1)}" ry="${(rad * entre(0.55, 0.85)).toFixed(1)}" transform="rotate(${entre(0, 180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${elegir(['#a8a29e', '#8b857d', '#c9c3b8'])}" stroke="#4a453f" stroke-width="3"/>`;
}
function mata(x, y, rad) {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + entre(-0.9, 0.9), l = rad * entre(0.7, 1.3);
    s += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} q ${(Math.cos(a) * l * 0.3).toFixed(1)} ${(-l * 0.5).toFixed(1)} ${(Math.cos(a) * l).toFixed(1)} ${(Math.sin(a) * l).toFixed(1)}" stroke="${elegir(['#1d5e22', '#2b7a2f', '#c8f08f'])}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  }
  return s;
}

let puestas = 0;
for (let intento = 0; intento < 6000 && puestas < 230; intento++) {
  const x = entre(25, W - 25), y = entre(25, H - 25);
  const tipo = r();
  const rad = tipo < 0.42 ? entre(14, 30) : tipo < 0.55 ? entre(12, 22) : tipo < 0.75 ? entre(9, 22) : entre(12, 20);
  if (!libre(x, y, rad)) continue;
  reservar(x, y, rad * 0.9);
  partes.push(tipo < 0.42 ? flor(x, y, rad) : tipo < 0.55 ? hongo(x, y, rad) : tipo < 0.75 ? piedra(x, y, rad) : mata(x, y, rad));
  puestas++;
}

// Marco
partes.push(`<rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="#14361a" stroke-width="12"/>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${partes.join('\n')}\n</svg>\n`;
fs.writeFileSync('public/objetivos/casa.svg', svg);
console.log(`✓ public/objetivos/casa.svg (${puestas} detalles)`);
