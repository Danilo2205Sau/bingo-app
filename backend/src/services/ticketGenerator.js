// ============================================
// ticketGenerator.js — Genera una boleta según la modalidad
// (bingo: matriz 5x5 clásica | rifa: números configurables)
// ============================================

function generarBoleta(modalidad, indiceSecuencial = 0) {
  if (modalidad.tipo_boleta === 'rifa') {
    return { numeros: generarNumerosRifa(modalidad.config || {}, indiceSecuencial) };
  }
  return { numeros: generarMatrizBingo() };
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
  const cantidad = config.cantidad_numeros || 1;
  const digitos  = config.digitos || 3;
  const modo     = config.modo || 'aleatorio';

  const numeros = [];
  for (let i = 0; i < cantidad; i++) {
    if (modo === 'secuencial') {
      numeros.push(String(indiceSecuencial).padStart(digitos, '0'));
    } else {
      const max = Math.pow(10, digitos);
      numeros.push(String(Math.floor(Math.random() * max)).padStart(digitos, '0'));
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
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 8; i++) codigo += chars[Math.floor(Math.random() * chars.length)];
  return codigo;
}

module.exports = { generarBoleta, generarCodigo, generarMatrizBingo, generarNumerosRifa };