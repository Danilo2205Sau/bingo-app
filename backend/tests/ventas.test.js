// tests/ventas.test.js
// ─────────────────────────────────────────────────────────────
// Prueba el flujo completo de compra:
//   comprador → crea venta → admin aprueba → cartón asignado
// ─────────────────────────────────────────────────────────────

const request = require('supertest');
const {
  getApp, limpiarBD,
  crearAdmin, tokenAdmin,
  crearSorteo, crearCarton,
  crearComprador, crearVenta,
} = require('./helpers');
const db = require('../src/config/db');

let app, admin, token, sorteo;

beforeAll(async () => { app = getApp(); });

beforeEach(async () => {
  await limpiarBD();
  admin  = await crearAdmin();
  token  = tokenAdmin(admin);
  sorteo = await crearSorteo({ precio_boleta: 5000, total_cartones: 10 });
  // Crear cartones disponibles para el sorteo
  for (let i = 0; i < 5; i++) await crearCarton(sorteo.id);
});

afterAll(async () => { await db.pool.end(); });

// ── Crear venta ───────────────────────────────────────────────
describe('POST /api/ventas', () => {

  test('✅ comprador puede crear una venta con datos válidos', async () => {
    // Simulamos multipart/form-data (sin archivo real en tests)
    const res = await request(app)
      .post('/api/ventas')
      .field('nombre',      'Juan Pérez')
      .field('telefono',    '3109876543')
      .field('cantidad',    '1')
      .field('metodo_pago', 'nequi')
      .field('sorteo_id',   sorteo.id);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('venta_id');
    expect(res.body.estado).toBe('pendiente');
    expect(res.body.total_pagado).toBe(5000);
  });

  test('✅ compra de múltiples boletas calcula total correcto', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .field('nombre',      'Laura Gómez')
      .field('telefono',    '3201234567')
      .field('cantidad',    '3')
      .field('metodo_pago', 'bancolombia')
      .field('sorteo_id',   sorteo.id);

    expect(res.status).toBe(201);
    expect(res.body.total_pagado).toBe(15000); // 3 × $5.000
  });

  test('❌ falla si el sorteo no existe', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .field('nombre',      'Pedro Ruiz')
      .field('telefono',    '3109999999')
      .field('cantidad',    '1')
      .field('metodo_pago', 'nequi')
      .field('sorteo_id',   '00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
  });

  test('❌ falla si se piden más boletas de las disponibles', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .field('nombre',      'Ana Torres')
      .field('telefono',    '3108888888')
      .field('cantidad',    '999') // Solo hay 5 cartones
      .field('metodo_pago', 'nequi')
      .field('sorteo_id',   sorteo.id);

    expect(res.status).toBe(409); // Conflict
  });

  test('❌ falla si faltan campos requeridos', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .field('nombre', 'Solo nombre');

    expect(res.status).toBe(400);
  });
});

// ── Aprobar venta ─────────────────────────────────────────────
describe('PATCH /api/admin/ventas/:id/aprobar', () => {

  test('✅ admin aprueba venta y se asignan cartones', async () => {
    const comprador = await crearComprador();
    const venta     = await crearVenta(comprador.id, sorteo.id, { cantidad: 2 });

    const res = await request(app)
      .patch(`/api/admin/ventas/${venta.id}/aprobar`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('venta_id');

    // Verificar que se asignaron 2 cartones en la BD
    const { rows } = await db.query(
      'SELECT COUNT(*) FROM venta_cartones WHERE venta_id = $1',
      [venta.id]
    );
    expect(parseInt(rows[0].count)).toBe(2);
  });

  test('✅ los cartones asignados quedan marcados como vendidos', async () => {
    const comprador = await crearComprador();
    const venta     = await crearVenta(comprador.id, sorteo.id, { cantidad: 1 });

    await request(app)
      .patch(`/api/admin/ventas/${venta.id}/aprobar`)
      .set('Authorization', `Bearer ${token}`);

    const { rows } = await db.query(`
      SELECT c.vendido FROM cartones c
      JOIN venta_cartones vc ON vc.carton_id = c.id
      WHERE vc.venta_id = $1
    `, [venta.id]);

    expect(rows.every(r => r.vendido)).toBe(true);
  });

  test('❌ no se puede aprobar la misma venta dos veces', async () => {
    const comprador = await crearComprador();
    const venta     = await crearVenta(comprador.id, sorteo.id);

    // Primera aprobación
    await request(app)
      .patch(`/api/admin/ventas/${venta.id}/aprobar`)
      .set('Authorization', `Bearer ${token}`);

    // Segunda aprobación debe fallar
    const res = await request(app)
      .patch(`/api/admin/ventas/${venta.id}/aprobar`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404); // "ya aprobada"
  });

  test('❌ no se puede aprobar sin token', async () => {
    const comprador = await crearComprador();
    const venta     = await crearVenta(comprador.id, sorteo.id);

    const res = await request(app)
      .patch(`/api/admin/ventas/${venta.id}/aprobar`);

    expect(res.status).toBe(401);
  });
});

// ── Rechazar venta ────────────────────────────────────────────
describe('PATCH /api/admin/ventas/:id/rechazar', () => {

  test('✅ admin puede rechazar una venta', async () => {
    const comprador = await crearComprador();
    const venta     = await crearVenta(comprador.id, sorteo.id);

    const res = await request(app)
      .patch(`/api/admin/ventas/${venta.id}/rechazar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notas: 'Comprobante ilegible' });

    expect(res.status).toBe(200);

    // Verificar en BD que el estado cambió
    const { rows } = await db.query(
      'SELECT estado_pago FROM ventas WHERE id = $1', [venta.id]
    );
    expect(rows[0].estado_pago).toBe('rechazado');
  });
});
