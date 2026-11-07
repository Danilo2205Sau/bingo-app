// ============================================
// ticketGenerator.js — Genera una boleta según la modalidad
// (bingo: matriz 5x5 clásica | rifa: números configurables)
// ============================================

const { randomInt } = require('crypto');

function generarBoleta(modalidad, indiceSecuencial = 0) {
  if (modalidad.tipo_boleta === 'rifa') {
    const numeros = generarNumerosRifa(modalidad.config || {}, indiceSecuencial);
    // El código interno = el mismo número de la boleta (búsqueda unificada)
    const codigoSugerido = numeros.length === 1 ? numeros[0] : numeros.join('');
    return { numeros, codigoSugerido };
  }
  return { numeros: generarMatrizBingo(), codigoSugerido: null };
}

// ── Bingo clásico: B(1-15) I(16-30) N(31-45) G(46-60) O(61-75), centro libre ──
function generarMatrizBingo() {
  const rangos = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
  const matriz = [];
  for (let col = 0; col < 5; col++) {
    const [min, max] = rangos[col];
    const nums = shuffle(range(min, max)).slice(0, 5);
    for (let row = 0; row < 5; row++) {
      if (!matriz[row]) matriz[row] = [];
      matriz[row][col] = (col === 2 && row === 2) ? null : nums[row];
    }
  }
  return matriz;
}

// ── Rifa/sorteo: N números de D dígitos, configurable por modalidad ──
// config = { cantidad_numeros: 1, digitos: 3, modo: 'aleatorio' | 'secuencial' }
function generarNumerosRifa(config, indiceSecuencial = 0) {
  const cantidad = Number(config.cantidad_numeros || 1);
  const digitos  = Number(config.digitos || 3);
  const modo     = config.modo || 'aleatorio';
  if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 100 ||
      !Number.isSafeInteger(digitos) || digitos < 1 || digitos > 12) {
    const error = new Error('La configuración de números de la rifa no es válida');
    error.code = 'INVALID_RAFFLE_CONFIG';
    throw error;
  }

  const numeros = [];
  const max = Math.pow(10, digitos);
  if (cantidad > max) {
    const error = new Error('La cantidad de números supera el rango configurado para la rifa');
    error.code = 'INVALID_RAFFLE_CONFIG';
    throw error;
  }
  if (modo === 'secuencial' && (indiceSecuencial + 1) * cantidad > max) {
    const error = new Error('La rifa secuencial agotó el rango de números configurado');
    error.code = 'RAFFLE_NUMBERS_EXHAUSTED';
    throw error;
  }
  for (let i = 0; i < cantidad; i++) {
    if (modo === 'secuencial') {
      numeros.push(String(indiceSecuencial * cantidad + i).padStart(digitos, '0'));
    } else {
      let numero;
      do { numero = randomInt(max); }
      while (numeros.includes(String(numero).padStart(digitos, '0')));
      numeros.push(String(numero).padStart(digitos, '0'));
    }
  }
  return numeros;
}

function range(min, max) {
  const arr = [];
  for (let i = min; i <= max; i++) arr.push(i);
  return arr;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 8; i++) codigo += chars[randomInt(chars.length)];
  return codigo;
}

module.exports = { generarBoleta, generarCodigo, generarMatrizBingo, generarNumerosRifa };
