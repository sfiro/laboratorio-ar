// Generador de marcadores: todo ocurre en el navegador, con nuestro codificador (patt.js)
import { codificarPatt, cuadriculaDesdeImagen, marcadorCompleto, LADO } from './patt.js';

const $ = (id) => document.getElementById(id);

$('entrada').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const imagen = await createImageBitmap(archivo);
  const nombre = archivo.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').toLowerCase() || 'marcador';

  // 1) El marcador completo para imprimir
  const completo = marcadorCompleto(imagen);
  $('vista-marcador').getContext('2d').drawImage(completo, 0, 0);
  $('bajar-png').href = completo.toDataURL('image/png');
  $('bajar-png').download = `${nombre}.png`;

  // 2) El patrón 16×16 que compara AR.js
  const cuadricula = cuadriculaDesdeImagen(imagen);
  const ctx = $('vista-16').getContext('2d');
  const datos = ctx.createImageData(LADO, LADO);
  cuadricula.flat().forEach(([r, g, b], i) => datos.data.set([r, g, b, 255], i * 4));
  ctx.putImageData(datos, 0, 0);

  const patt = codificarPatt(cuadricula);
  $('bajar-patt').href = URL.createObjectURL(new Blob([patt], { type: 'text/plain' }));
  $('bajar-patt').download = `patt.${nombre}`;

  // 3) ¿Se parece demasiado a sí misma al girarla? Entonces la orientación es ambigua.
  $('aviso-simetria').hidden = diferenciaAlGirar(cuadricula) > 25;

  $('resultado').hidden = false;
});

// Diferencia promedio (0–255) entre la imagen y la misma imagen girada 90°
function diferenciaAlGirar(g) {
  let suma = 0;
  for (let y = 0; y < LADO; y++) for (let x = 0; x < LADO; x++) {
    const a = g[y][x], b = g[x][LADO - 1 - y];
    suma += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
  }
  return suma / (LADO * LADO);
}
