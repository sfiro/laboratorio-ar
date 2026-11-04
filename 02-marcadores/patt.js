// Nuestro propio codificador de marcadores para AR.js (formato .patt de ARToolKit)
//
// Un marcador es: margen blanco + borde negro grueso + dibujo interior.
// AR.js encuentra el borde negro (un cuadrado) y luego compara el dibujo interior,
// reducido a 16×16 píxeles, contra el archivo .patt.
//
// El .patt guarda ese 16×16 en 4 orientaciones (girado 90° cada vez, en sentido antihorario)
// y, para cada una, los canales Azul, Verde y Rojo: 4 × 3 × 256 = 3072 números.
// Así AR.js sabe qué marcador es Y hacia dónde está girado.

export const LADO = 16;

// Proporción del dibujo interior respecto al cuadrado negro completo (AR.js usa 0.5 por defecto)
export const PROPORCION = 0.5;

/** Gira una cuadrícula 90° en sentido antihorario: nuevo[y][x] = viejo[x][15 - y] */
const girar = (g) => g.map((fila, y) => fila.map((_, x) => g[x][LADO - 1 - y]));

/**
 * @param {number[][][]} cuadricula 16×16 de colores [r, g, b] (0–255), fila por fila
 * @returns {string} contenido del archivo .patt
 */
export function codificarPatt(cuadricula) {
  const bloques = [];
  let g = cuadricula;
  for (let orientacion = 0; orientacion < 4; orientacion++) {
    for (const canal of [2, 1, 0]) { // azul, verde, rojo
      bloques.push(g.map((fila) => fila.map((rgb) => String(Math.round(rgb[canal])).padStart(3)).join(' ')).join('\n'));
    }
    g = girar(g);
  }
  // Las orientaciones van separadas por una línea en blanco
  return [0, 1, 2, 3].map((o) => bloques.slice(o * 3, o * 3 + 3).join('\n')).join('\n\n') + '\n';
}

// ---------------------------------------------------------------------------
// Solo en el navegador: a partir de una imagen cualquiera
// ---------------------------------------------------------------------------

/** Reduce una imagen a la cuadrícula 16×16 que entiende AR.js */
export function cuadriculaDesdeImagen(imagen) {
  const c = document.createElement('canvas');
  c.width = c.height = LADO;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, LADO, LADO);
  ctx.drawImage(imagen, 0, 0, LADO, LADO);
  const datos = ctx.getImageData(0, 0, LADO, LADO).data;
  return Array.from({ length: LADO }, (_, y) =>
    Array.from({ length: LADO }, (_, x) => {
      const i = (y * LADO + x) * 4;
      return [datos[i], datos[i + 1], datos[i + 2]];
    }));
}

/** Dibuja el marcador completo, listo para imprimir: margen blanco + borde negro + imagen */
export function marcadorCompleto(imagen, tam = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  const ctx = c.getContext('2d');
  const margenBlanco = 0.1;
  const grosorNegro = (1 - 2 * margenBlanco) * ((1 - PROPORCION) / 2);
  const interior = margenBlanco + grosorNegro;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, tam, tam);
  ctx.fillStyle = '#000';
  ctx.fillRect(margenBlanco * tam, margenBlanco * tam, (1 - 2 * margenBlanco) * tam, (1 - 2 * margenBlanco) * tam);
  ctx.fillStyle = '#fff';
  ctx.fillRect(interior * tam, interior * tam, (1 - 2 * interior) * tam, (1 - 2 * interior) * tam);
  ctx.drawImage(imagen, interior * tam, interior * tam, (1 - 2 * interior) * tam, (1 - 2 * interior) * tam);
  return c;
}
