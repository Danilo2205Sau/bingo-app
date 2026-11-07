// tests/ventas.test.js
// ─────────────────────────────────────────────────────────────
// Prueba el flujo completo de compra:
//   comprador → crea venta → admin aprueba → cartón asignado
// ─────────────────────────────────────────────────────────────

const request = require('supertest');
const {
  getApp, limpiarBD,
  crearAdmin, tokenAdmin,
  crearSorteo, crearCarton, crearModalidad,
  crearComprador, crearVenta, createCapability,
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

// ── Crear venta ───────────────────────────────────────────────
describe('POST /api/ventas', () => {

  test('✅ comprador puede crear una venta con datos válidos', async () => {
    // Simulamos multipart/form-data (sin archivo real en tests)
    const res = await request(app)
      .post('/api/ventas')
      .field('nombre',      'Juan Pérez')
      .field('telefono',    '0000000000')
      .field('cantidad',    '1')
      .field('metodo_pago', 'nequi')
      .field('sorteo_id',   sorteo.id)
      .field('modalidad_id', sorteo.modalidad.id)
      .field('idempotency_key', createCapability());

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('venta_id');
    expect(res.body.estado).toBe('pendiente');
    expect(res.body.total_pagado).toBe(5000);
  });

  test('✅ compra de múltiples boletas calcula total correcto', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .field('nombre',      'Laura Gómez')
      .field('telefono',    '0000000000')
      .field('cantidad',    '3')
      .field('metodo_pago', 'bancolombia')
      .field('sorteo_id',   sorteo.id)
      .field('modalidad_id', sorteo.modalidad.id)
      .field('idempotency_key', createCapability());

    expect(res.status).toBe(201);
    expect(res.body.total_pagado).toBe(15000); // 3 × $5.000
  });

  test('❌ falla si el sorteo no existe', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .field('nombre',      'Pedro Ruiz')
      .field('telefono',    '0000000000')
      .field('cantidad',    '1')
      .field('metodo_pago', 'nequi')
      .field('sorteo_id',   '00000000-0000-0000-0000-000000000000')
      .field('modalidad_id', sorteo.modalidad.id)
      .field('idempotency_key', createCapability());

    expect(res.status).toBe(404);
  });

  test('❌ falla si se piden más boletas de las disponibles', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .field('nombre',      'Ana Torres')
      .field('telefono',    '0000000000')
      .field('cantidad',    '999') // Solo hay 5 cartones
      .field('metodo_pago', 'nequi')
      .field('sorteo_id',   sorteo.id)
      .field('modalidad_id', sorteo.modalidad.id)
      .field('idempotency_key', createCapability());

    expect(res.status).toBe(400); // El límite público por compra es 10
  });

  test('❌ falla si faltan campos requeridos', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .field('nombre', 'Solo nombre');

    expect(res.status).toBe(400);
  });

  test('❌ rechaza si la selección de cartones no coincide con la cantidad', async () => {
    const res = await request(app)
      .post('/api/ventas')
      .field('nombre', 'Juan Pérez')
      .field('telefono', '0000000000')
      .field('cantidad', '1')
      .field('metodo_pago', 'nequi')
      .field('sorteo_id', sorteo.id)
      .field('modalidad_id', sorteo.modalidad.id)
      .field('carton_ids', JSON.stringify(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']))
      .field('reservation_token', 'A'.repeat(43));

    expect(res.status).toBe(400);
  });

  test('✅ reserva y venta asignan exactamente los cartones escogidos', async () => {
    const modalidad = await crearModalidad(sorteo.id, { permite_elegir_numero: true, total_boletas: 2 });
    const carton = await crearCarton(sorteo.id, { modalidad_id: modalidad.id, codigo: 'SEL001' });
    const reserva = await request(app)
      .post('/api/cartones/reservar')
      .send({ modalidad_id: modalidad.id, carton_ids: [carton.id] });
    expect(reserva.status).toBe(200);
    const idempotencyKey = createCapability();

    const venta = await request(app)
      .post('/api/ventas')
      .field('nombre', 'Juan Pérez')
      .field('telefono', '0000000000')
      .field('cantidad', '1')
      .field('metodo_pago', 'nequi')
      .field('sorteo_id', sorteo.id)
      .field('modalidad_id', modalidad.id)
      .field('idempotency_key', idempotencyKey)
      .field('carton_ids', JSON.stringify([carton.id]))
      .field('reservation_token', reserva.body.reservation_token);

    expect(venta.status).toBe(201);
    const { rows } = await db.query('SELECT carton_id FROM venta_cartones WHERE venta_id = $1', [venta.body.venta_id]);
    expect(rows).toEqual([{ carton_id: carton.id }]);
  });

  test('🔁 reintentar el mismo pedido devuelve la venta existente', async () => {
    const key = createCapability();
    const enviar = () => request(app)
      .post('/api/ventas')
      .field('nombre', 'Ana Torres')
      .field('telefono', '0000000000')
      .field('cantidad', '1')
      .field('metodo_pago', 'nequi')
      .field('sorteo_id', sorteo.id)
      .field('modalidad_id', sorteo.modalidad.id)
      .field('idempotency_key', key);

    const primera = await enviar();
    const reintento = await enviar();
    expect(primera.status).toBe(201);
    expect(reintento.status).toBe(200);
    expect(reintento.body.venta_id).toBe(primera.body.venta_id);
    expect(reintento.body.codigo_consulta).toBe(key);
    const { rows } = await db.query('SELECT COUNT(*)::int AS total FROM ventas');
    expect(rows[0].total).toBe(1);
  });

  test('🔒 código de consulta requiere capacidad privada y no devuelve datos personales', async () => {
    const key = createCapability();
    const venta = await request(app)
      .post('/api/ventas')
      .field('nombre', 'Nombre Privado')
      .field('telefono', '0000000000')
      .field('cantidad', '1')
      .field('metodo_pago', 'nequi')
      .field('sorteo_id', sorteo.id)
      .field('modalidad_id', sorteo.modalidad.id)
      .field('idempotency_key', key);
    expect(venta.status).toBe(201);

    const sinCodigo = await request(app).get(`/api/ventas/${venta.body.venta_id}`);
    expect(sinCodigo.status).toBe(401);
    const consulta = await request(app)
      .get(`/api/ventas/${venta.body.venta_id}`)
      .set('X-Consulta-Token', venta.body.codigo_consulta);
    expect(consulta.status).toBe(200);
    expect(venta.body.codigo_consulta).toBe(key);
    expect(consulta.body).not.toHaveProperty('comprador_nombre');
    expect(consulta.body).not.toHaveProperty('telefono');
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
    const { rows: trabajos } = await db.query(
      "SELECT estado, tipo_trabajo FROM notificaciones WHERE venta_id = $1 AND canal = 'whatsapp'",
      [venta.id]
    );
    expect(trabajos).toEqual([{ estado: 'pendiente', tipo_trabajo: 'venta_aprobada' }]);
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

    expect(res.status).toBe(409); // estado no repetible
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

  test('✅ al rechazar una compra se liberan boletas y ambos contadores', async () => {
    const compra = await request(app)
      .post('/api/ventas')
      .field('nombre', 'Ana Torres')
      .field('telefono', '0000000000')
      .field('cantidad', '1')
      .field('metodo_pago', 'nequi')
      .field('sorteo_id', sorteo.id)
      .field('modalidad_id', sorteo.modalidad.id)
      .field('idempotency_key', createCapability());
    expect(compra.status).toBe(201);

    const countersBeforeReject = await db.query(`
      SELECT s.cartones_vendidos, m.boletas_vendidas
      FROM sorteos s JOIN modalidades m ON m.sorteo_id = s.id
      WHERE s.id = $1
    `, [sorteo.id]);
    expect(countersBeforeReject.rows[0]).toEqual({ cartones_vendidos: 1, boletas_vendidas: 1 });

    const rechazo = await request(app)
      .patch(`/api/admin/ventas/${compra.body.venta_id}/rechazar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notas: 'Comprobante inválido' });
    expect(rechazo.status).toBe(200);

    const countersAfterReject = await db.query(`
      SELECT s.cartones_vendidos, m.boletas_vendidas
      FROM sorteos s JOIN modalidades m ON m.sorteo_id = s.id
      WHERE s.id = $1
    `, [sorteo.id]);
    expect(countersAfterReject.rows[0]).toEqual({ cartones_vendidos: 0, boletas_vendidas: 0 });
  });
});
