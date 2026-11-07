const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../src/config/db');
const { createCapability } = require('../src/services/capabilities');

let cachedApp;
function getApp() {
  if (!cachedApp) cachedApp = require('../src/app').app;
  return cachedApp;
}

async function limpiarBD() {
  await db.query(`
    TRUNCATE TABLE notificaciones, venta_cartones, ventas, compradores,
      cartones, modalidades, sorteos, admins RESTART IDENTITY CASCADE
  `);
}

async function crearAdmin(overrides = {}) {
  const password = overrides.password || 'test123';
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(`
    INSERT INTO admins (nombre, email, password_hash)
    VALUES ($1, $2, $3) RETURNING *
  `, [overrides.nombre || 'Admin Test', overrides.email || 'admin@test.com', hash]);
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
    INSERT INTO sorteos (nombre, fecha_sorteo, precio_boleta, total_cartones, estado)
    VALUES ($1, $2, $3, $4, $5) RETURNING *
  `, [
    overrides.nombre || 'Sorteo Test',
    overrides.fecha_sorteo || new Date(Date.now() + 86400000).toISOString(),
    overrides.precio_boleta ?? 5000,
    overrides.total_cartones ?? overrides.total_boletas ?? 50,
    overrides.estado || 'activo',
  ]);
  const sorteo = rows[0];
  const modalidad = await crearModalidad(sorteo.id, {
    precio_boleta: overrides.precio_boleta ?? 5000,
    total_boletas: overrides.total_boletas ?? overrides.total_cartones ?? 50,
    permite_elegir_numero: overrides.permite_elegir_numero ?? false,
    tipo_boleta: overrides.tipo_boleta || 'bingo',
  });
  return { ...sorteo, modalidad_id: modalidad.id, modalidad };
}

async function crearModalidad(sorteoId, overrides = {}) {
  const { rows } = await db.query(`
    INSERT INTO modalidades
      (sorteo_id, tipo_boleta, nombre, precio_boleta, total_boletas,
       permite_elegir_numero, config, metodo_resultado, fuente_resultado)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [
    sorteoId,
    overrides.tipo_boleta || 'bingo',
    overrides.nombre || 'Cartón Bingo',
    overrides.precio_boleta ?? 5000,
    overrides.total_boletas ?? 50,
    overrides.permite_elegir_numero ?? false,
    JSON.stringify(overrides.config || {}),
    overrides.metodo_resultado || null,
    overrides.fuente_resultado || null,
  ]);
  return rows[0];
}

async function buscarModalidad(sorteoId) {
  const { rows } = await db.query(
    'SELECT id, tipo_boleta FROM modalidades WHERE sorteo_id = $1 ORDER BY creado_en LIMIT 1',
    [sorteoId]
  );
  return rows[0] || null;
}

async function crearCarton(sorteoId, overrides = {}) {
  const modalidad = overrides.modalidad_id
    ? { id: overrides.modalidad_id, tipo_boleta: overrides.tipo_boleta || 'bingo' }
    : await buscarModalidad(sorteoId);
  if (!modalidad) throw new Error(`No hay modalidad para el sorteo ${sorteoId}`);
  const codigo = overrides.codigo || `TEST${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const numeros = overrides.numeros || generarMatriz();
  const { rows } = await db.query(`
    INSERT INTO cartones
      (sorteo_id, modalidad_id, tipo_boleta, codigo_unico, numeros, pdf_url, tipo, vendido)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [
    sorteoId,
    modalidad.id,
    overrides.tipo_boleta || modalidad.tipo_boleta,
    codigo,
    JSON.stringify(numeros),
    overrides.pdf_url || 'https://cloudinary.com/test/carton.pdf',
    overrides.tipo || 'generado',
    overrides.vendido ?? false,
  ]);
  return rows[0];
}

async function crearComprador(overrides = {}) {
  const { rows } = await db.query(`
    INSERT INTO compradores (nombre, telefono) VALUES ($1, $2) RETURNING *
  `, [overrides.nombre || 'Comprador de prueba', overrides.telefono || '0000000000']);
  return rows[0];
}

async function crearVenta(compradorId, sorteoId, overrides = {}) {
  const modalidadId = overrides.modalidad_id || (await buscarModalidad(sorteoId))?.id;
  const { rows } = await db.query(`
    INSERT INTO ventas
      (comprador_id, sorteo_id, modalidad_id, cantidad, total_pagado, metodo_pago,
       estado_pago, comprobante_url, es_administrador)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [
    compradorId,
    sorteoId,
    modalidadId,
    overrides.cantidad ?? 1,
    overrides.total_pagado ?? 5000,
    overrides.metodo_pago || 'nequi',
    overrides.estado_pago || 'pendiente',
    overrides.comprobante_url || null,
    overrides.es_administrador ?? false,
  ]);
  return rows[0];
}

function generarMatriz() {
  return Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, col) => (col === 2 && row === 2) ? null : (col * 15 + row + 1))
  );
}

module.exports = {
  getApp, limpiarBD, crearAdmin, tokenAdmin, crearSorteo, crearModalidad,
  crearCarton, crearComprador, crearVenta, createCapability,
};
