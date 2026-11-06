// Dónde están el Sol y la Luna, calculado por nosotros.
//
// Son las fórmulas clásicas de baja precisión (las de los almanaques; error de ~1°),
// más que suficientes porque la brújula del celular tiene un error mayor.
// Ángulos: "rumbo" en grados desde el norte hacia el este (como una brújula),
//          "altura" en grados sobre el horizonte (negativa = bajo el horizonte).

const rad = Math.PI / 180;
const OBLICUIDAD = rad * 23.4397; // inclinación del eje de la Tierra

// Días desde el 1 de enero de 2000 al mediodía (la fecha de referencia de la astronomía)
const diasDesde2000 = (fecha) => fecha.valueOf() / 86400000 - 0.5 + 2440588 - 2451545;

// De coordenadas de la eclíptica (el plano de la órbita de la Tierra) a coordenadas del cielo
const ascensionRecta = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBLICUIDAD) - Math.tan(b) * Math.sin(OBLICUIDAD), Math.cos(l));
const declinacion = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBLICUIDAD) + Math.cos(b) * Math.sin(OBLICUIDAD) * Math.sin(l));

// Hora sideral: cuánto ha girado la Tierra respecto a las estrellas
const tiempoSideral = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

function coordenadasSol(d) {
  const M = rad * (357.5291 + 0.98560028 * d); // anomalía media: dónde va la Tierra en su órbita
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)); // la órbita es una elipse
  const L = M + C + rad * 102.9372 + Math.PI; // longitud del Sol en la eclíptica
  return { dec: declinacion(L, 0), ra: ascensionRecta(L, 0) };
}

function coordenadasLuna(d) {
  const L = rad * (218.316 + 13.176396 * d); // longitud media
  const M = rad * (134.963 + 13.064993 * d); // anomalía media
  const F = rad * (93.272 + 13.22935 * d);   // distancia al nodo
  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  return { ra: ascensionRecta(l, b), dec: declinacion(l, b), distancia: 385001 - 20905 * Math.cos(M) };
}

// De ascensión recta y declinación a rumbo y altura, para un lugar y un momento
function enElHorizonte({ ra, dec }, d, lat, lon) {
  const lw = rad * -lon, phi = rad * lat;
  const H = tiempoSideral(d, lw) - ra; // ángulo horario
  const azimutDesdeElSur = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const altura = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  return { rumbo: (azimutDesdeElSur / rad + 180 + 360) % 360, altura: altura / rad };
}

export function posicionSol(fecha, lat, lon) {
  const d = diasDesde2000(fecha);
  return enElHorizonte(coordenadasSol(d), d, lat, lon);
}

export function posicionLuna(fecha, lat, lon) {
  const d = diasDesde2000(fecha);
  return enElHorizonte(coordenadasLuna(d), d, lat, lon);
}

/** Fase de la Luna: fraccion iluminada (0-1) y fase (0 nueva, 0.25 creciente, 0.5 llena, 0.75 menguante) */
export function faseLuna(fecha) {
  const d = diasDesde2000(fecha);
  const s = coordenadasSol(d), m = coordenadasLuna(d);
  const DISTANCIA_SOL = 149598000; // km
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(DISTANCIA_SOL * Math.sin(phi), m.distancia - DISTANCIA_SOL * Math.cos(phi));
  const angulo = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  const fase = 0.5 + (0.5 * inc * (angulo < 0 ? -1 : 1)) / Math.PI;
  return { fraccion: (1 + Math.cos(inc)) / 2, fase };
}

export function emojiLuna(fase) {
  return ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'][Math.round(fase * 8) % 8];
}
