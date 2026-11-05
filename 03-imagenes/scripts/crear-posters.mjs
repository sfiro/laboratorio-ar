// Diseña nuestros dos pósters (SVG, 1200×900) para usarlos como imágenes objetivo.
//
// Una buena imagen objetivo para MindAR tiene MUCHOS detalles con esquinas y contraste
// (estrellas, cráteres, ladrillos, letras) y no tiene zonas grandes lisas ni patrones repetidos.
// Usamos números "aleatorios" con semilla para que siempre salga el mismo póster.
import fs from 'node:fs';

const W = 1200, H = 900;

function azar(semilla) {
  return () => {
    semilla = (semilla * 1664525 + 1013904223) % 4294967296;
    return semilla / 4294967296;
  };
}

const estrella = (x, y, r, color) => {
  const p = Array.from({ length: 8 }, (_, i) => {
    const rr = i % 2 === 0 ? r : r * 0.35;
    const a = (i * Math.PI) / 4;
    return `${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`;
  });
  return `<polygon points="${p.join(' ')}" fill="${color}"/>`;
};

const texto = (x, y, tam, contenido, extra = '') =>
  `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${tam}" ${extra}>${contenido}</text>`;

// ---------------------------------------------------------------------------
// Póster 1: "Cohete" — espacio con un planeta, una luna, estrellas y un cohete
// ---------------------------------------------------------------------------
function posterCohete() {
  const r = azar(42);
  const partes = [];
  partes.push(`<defs>
    <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1440"/><stop offset="1" stop-color="#3a1c5c"/></linearGradient>
    <radialGradient id="planeta" cx="0.35" cy="0.35" r="0.8"><stop offset="0" stop-color="#ffb35c"/><stop offset="1" stop-color="#c2410c"/></radialGradient>
  </defs>`);
  partes.push(`<rect width="${W}" height="${H}" fill="url(#cielo)"/>`);

  // Estrellas de muchos tamaños y colores
  for (let i = 0; i < 260; i++) {
    const colores = ['#ffffff', '#fff3b0', '#9ad7ff', '#ffc2e2'];
    partes.push(estrella(r() * W, r() * H, 2 + r() * 9, colores[Math.floor(r() * colores.length)]));
  }

  // Planeta con cráteres y anillo (centro 300,600 radio 170)
  partes.push(`<ellipse cx="300" cy="600" rx="290" ry="60" fill="none" stroke="#ffe08a" stroke-width="14" transform="rotate(-18 300 600)"/>`);
  partes.push(`<circle cx="300" cy="600" r="170" fill="url(#planeta)"/>`);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = r() * 140;
    partes.push(`<circle cx="${300 + d * Math.cos(a)}" cy="${600 + d * Math.sin(a)}" r="${6 + r() * 20}" fill="#9a3412" opacity="0.75"/>`);
  }
  // Mitad delantera del anillo: pasa por encima del planeta
  partes.push(`<path d="M 10 600 A 290 60 0 0 0 590 600" transform="rotate(-18 300 600)" fill="none" stroke="#ffe08a" stroke-width="14"/>`);

  // Luna (centro 960,230 radio 70)
  partes.push(`<circle cx="960" cy="230" r="70" fill="#cfd6e4"/>`);
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2, d = r() * 50;
    partes.push(`<circle cx="${960 + d * Math.cos(a)}" cy="${230 + d * Math.sin(a)}" r="${5 + r() * 11}" fill="#8b93a7"/>`);
  }

  // Cohete dibujado (centro aproximado 860,620)
  partes.push(`<g transform="translate(860 620) rotate(35)">
    <path d="M 0 -150 C 45 -100 50 -20 45 60 L -45 60 C -50 -20 -45 -100 0 -150 Z" fill="#eef1f6"/>
    <path d="M 0 -150 C 25 -125 35 -105 38 -90 L -38 -90 C -35 -105 -25 -125 0 -150 Z" fill="#e5383b"/>
    <circle cx="0" cy="-35" r="22" fill="#4f8cff" stroke="#5c6370" stroke-width="7"/>
    <path d="M -45 10 L -85 80 L -45 60 Z M 45 10 L 85 80 L 45 60 Z" fill="#e5383b"/>
    <path d="M -28 60 L 0 140 L 28 60 Z" fill="#ff9f1c"/>
    <path d="M -14 60 L 0 105 L 14 60 Z" fill="#ffe66d"/>
  </g>`);

  partes.push(texto(60, 120, 84, 'LABORATORIO AR', 'fill="#ffffff" letter-spacing="2"'));
  partes.push(texto(64, 175, 34, 'Nivel 3 · Pósters vivos', 'fill="#ffc2e2"'));
  partes.push(texto(820, 860, 26, 'Apunta tu celular aquí', 'fill="#9ad7ff"'));
  return partes;
}

// ---------------------------------------------------------------------------
// Póster 2: "Portal" — un muro de ladrillos de colores con una ventana en el centro
// La ventana va de (400,250) a (800,650): 400×400 px.
// ---------------------------------------------------------------------------
function posterPortal() {
  const r = azar(7);
  const partes = [`<rect width="${W}" height="${H}" fill="#2b2d42"/>`];
  const colores = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#b388eb', '#e9ecef'];
  const alto = 50;
  for (let fila = 0; fila < H / alto; fila++) {
    let x = fila % 2 === 0 ? 0 : -60;
    while (x < W) {
      const ancho = 80 + Math.floor(r() * 4) * 20;
      const c = colores[Math.floor(r() * colores.length)];
      partes.push(`<rect x="${x + 3}" y="${fila * alto + 3}" width="${ancho - 6}" height="${alto - 6}" rx="4" fill="${c}"/>`);
      // Un detalle distinto en cada ladrillo: punto, raya o triángulo
      const cx = x + ancho / 2, cy = fila * alto + alto / 2, t = r();
      if (t < 0.33) partes.push(`<circle cx="${cx}" cy="${cy}" r="${5 + r() * 7}" fill="#2b2d42"/>`);
      else if (t < 0.66) partes.push(`<rect x="${cx - 18}" y="${cy - 4}" width="36" height="8" fill="#2b2d42" transform="rotate(${Math.floor(r() * 4) * 45} ${cx} ${cy})"/>`);
      else partes.push(`<polygon points="${cx},${cy - 12} ${cx + 12},${cy + 9} ${cx - 12},${cy + 9}" fill="#2b2d42" transform="rotate(${Math.floor(r() * 4) * 90} ${cx} ${cy})"/>`);
      x += ancho;
    }
  }
  // La ventana del portal: marco grueso y fondo oscuro con espirales
  partes.push(`<rect x="380" y="230" width="440" height="440" rx="10" fill="#1d1e2c"/>`);
  partes.push(`<rect x="400" y="250" width="400" height="400" fill="#0b0d12"/>`);
  for (let i = 0; i < 6; i++) {
    partes.push(`<circle cx="600" cy="450" r="${30 + i * 30}" fill="none" stroke="${colores[i]}" stroke-width="6" stroke-dasharray="${20 + i * 6} ${14 + i * 3}"/>`);
  }
  partes.push(`<rect x="380" y="165" width="260" height="62" rx="8" fill="#1d1e2c"/>`);
  partes.push(texto(400, 213, 40, 'PORTAL', 'fill="#ffffff" letter-spacing="10"'));
  partes.push(`<rect x="380" y="680" width="440" height="48" rx="8" fill="#1d1e2c"/>`);
  partes.push(texto(410, 713, 26, 'mira a través de la ventana', 'fill="#ffd166"'));
  return partes;
}

const svg = (partes) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n${partes.join('\n')}\n</svg>\n`;

fs.writeFileSync(new URL('../public/objetivos/cohete.svg', import.meta.url), svg(posterCohete()));
fs.writeFileSync(new URL('../public/objetivos/portal.svg', import.meta.url), svg(posterPortal()));
console.log('✓ public/objetivos/cohete.svg y portal.svg');
