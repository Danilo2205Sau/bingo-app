const request = require('supertest');
const { getApp, limpiarBD, crearAdmin, tokenAdmin, crearSorteo } = require('./helpers');
const db = require('../src/config/db');

const VENTAS = 5105;
let app;
let adminToken;
let sorteo;

beforeAll(() => { app = getApp(); });

beforeEach(async () => {
  await limpiarBD();
  const admin = await crearAdmin();
  adminToken = tokenAdmin(admin);
  sorteo = await crearSorteo({ total_boletas: VENTAS, total_cartones: VENTAS });

  // Simula más de cinco mil compras históricas sin ejecutar cinco mil llamadas
  // HTTP. Así se comprueba el contador agregado, los índices y la paginación.
  await db.query(`
    WITH seq AS (
      SELECT generate_series(1, $3::int) AS n
    ), buyers AS (
      INSERT INTO compradores (nombre, telefono)
      SELECT 'Cliente prueba ' || n, 'TEST' || lpad(n::text, 9, '0') FROM seq
      RETURNING id
    ), ranked_buyers AS (
      SELECT id, row_number() OVER (ORDER BY id) AS n FROM buyers
    ), cards AS (
      INSERT INTO cartones (sorteo_id, modalidad_id, tipo_boleta, codigo_unico, tipo)
      SELECT $1, $2, 'bingo', 'LOAD' || lpad(n::text, 6, '0'), 'generado' FROM seq
      RETURNING id
    ), ranked_cards AS (
      SELECT id, row_number() OVER (ORDER BY id) AS n FROM cards
    ), sales AS (
      INSERT INTO ventas (comprador_id, sorteo_id, modalidad_id, cantidad, total_pagado, metodo_pago)
      SELECT id, $1, $2, 1, 5000, 'nequi' FROM ranked_buyers
      RETURNING id, comprador_id
    ), ranked_sales AS (
      SELECT id, row_number() OVER (ORDER BY comprador_id) AS n FROM sales
    )
    INSERT INTO venta_cartones (venta_id, carton_id)
    SELECT ranked_sales.id, ranked_cards.id
    FROM ranked_sales
    JOIN ranked_cards USING (n)
  `, [sorteo.id, sorteo.modalidad.id, VENTAS]);
});

test('mantiene consultas administrativas paginadas con más de 5.000 ventas', async () => {
  const firstPage = await request(app)
    .get('/api/admin/ventas-pendientes?limit=50&offset=0')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(firstPage.status).toBe(200);
  expect(firstPage.body.total).toBe(VENTAS);
  expect(firstPage.body.ventas).toHaveLength(50);

  const lastPage = await request(app)
    .get(`/api/admin/ventas-pendientes?limit=50&offset=5100`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(lastPage.status).toBe(200);
  expect(lastPage.body.ventas).toHaveLength(VENTAS - 5100);

  const dashboard = await request(app)
    .get('/api/admin/dashboard')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(dashboard.status).toBe(200);
  expect(dashboard.body.boletas_vendidas).toBe(VENTAS);
  expect(dashboard.body.pagos_pendientes).toBe(VENTAS);

  const { rows: sorteoCounters } = await db.query(
    'SELECT cartones_vendidos FROM sorteos WHERE id = $1', [sorteo.id]
  );
  expect(sorteoCounters[0].cartones_vendidos).toBe(VENTAS);

  const { rows } = await db.query(
    'SELECT boletas_vendidas FROM modalidades WHERE id = $1', [sorteo.modalidad.id]
  );
  expect(rows[0].boletas_vendidas).toBe(VENTAS);
});
