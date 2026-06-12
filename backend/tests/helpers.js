// tests/helpers.js
// Utilidades compartidas entre todos los test files

const request = require('supertest');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../src/config/db');

// ── App (importar una sola vez) ───────────────────────────────
let _app;
function getApp() {
  if (!_app) _app = require('../src/app');
  return _app;
}

// ── Limpiar tablas entre tests ────────────────────────────────
async function limpiarBD() {
  await db.query(`
    TRUNCATE TABLE notificaciones, venta_cartones, ventas,
                   compradores, cartones, sorteos, admins
    RESTART IDENTITY CASCADE
  `);
}

// ── Factories: crear datos de prueba ──────────────────────────
async function crearAdmin(overrides = {}) {
  const hash = await bcrypt.hash('test123', 10);
  const { rows } = await db.query(`
    INSERT INTO admins (nombre, email, password_hash)
    VALUES ($1, $2, $3) RETURNING *
  `, [
    overrides.nombre || 'Admin Test',
    overrides.email  || 'admin@test.com',
    hash,
  ]);
  return rows[0];
}

function tokenAdmin(admin) {
  return jwt.sign(
    { id: admin.id, nombre: admin.nombre, email: admin.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function crearSorteo(overrides = {}) {
  const { rows } = await db.query(`
    INSERT INTO sorteos
      (nombre, fecha_sorteo, precio_boleta, total_cartones, estado)
    VALUES ($1, $2, $3, $4, $5) RETURNING *
  `, [
    overrides.nombre          || 'Sorteo Test',
    overrides.fecha_sorteo    || new Date(Date.now() + 86400000).toISOString(),
    overrides.precio_boleta   || 5000,
    overrides.total_cartones  || 50,
    overrides.estado          || 'activo',
  ]);
  return rows[0];
}

async function crearCarton(sorteoId, overrides = {}) {
  const codigo  = overrides.codigo  || 'TEST' + Math.random().toString(36).slice(2,6).toUpperCase();
  const numeros = overrides.numeros || generarMatriz();
  const { rows } = await db.query(`
    INSERT INTO cartones (sorteo_id, codigo_unico, numeros, pdf_url, tipo, vendido)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
  `, [
    sorteoId,
    codigo,
    JSON.stringify(numeros),
    overrides.pdf_url || 'https://cloudinary.com/test/carton.pdf',
    overrides.tipo    || 'generado',
    overrides.vendido ?? false,
  ]);
  return rows[0];
}

async function crearComprador(overrides = {}) {
  const { rows } = await db.query(`
    INSERT INTO compradores (nombre, telefono)
    VALUES ($1, $2) RETURNING *
  `, [
    overrides.nombre   || 'María García',
    overrides.telefono || '3101234567',
  ]);
  return rows[0];
}

async function crearVenta(compradorId, sorteoId, overrides = {}) {
  const { rows } = await db.query(`
    INSERT INTO ventas
      (comprador_id, sorteo_id, cantidad, total_pagado, metodo_pago, estado_pago, comprobante_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [
    compradorId,
    sorteoId,
    overrides.cantidad      || 1,
    overrides.total_pagado  || 5000,
    overrides.metodo_pago   || 'nequi',
    overrides.estado_pago   || 'pendiente',
    overrides.comprobante_url || 'https://cloudinary.com/test/comp.jpg',
  ]);
  return rows[0];
}

// Generador de matriz bingo 5x5 para tests
function generarMatriz() {
  return Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, col) =>
      (col === 2 && row === 2) ? null : (col * 15 + row + 1)
    )
  );
}

module.exports = {
  getApp,
  limpiarBD,
  crearAdmin,
  tokenAdmin,
  crearSorteo,
  crearCarton,
  crearComprador,
  crearVenta,
};
