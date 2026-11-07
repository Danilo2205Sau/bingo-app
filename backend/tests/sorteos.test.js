// tests/sorteos.test.js
// ─────────────────────────────────────────────────────────────
// Prueba el CRUD de sorteos y el endpoint público
// ─────────────────────────────────────────────────────────────

const request = require('supertest');
const { getApp, limpiarBD, crearAdmin, tokenAdmin, crearSorteo } = require('./helpers');

let app, admin, token;

beforeAll(async () => {
  app   = getApp();
  admin = await crearAdmin();
  token = tokenAdmin(admin);
});

beforeEach(async () => {
  await limpiarBD();
  // Recrear admin (se borró en limpiarBD)
  admin = await crearAdmin();
  token = tokenAdmin(admin);
});

// ── Endpoint público ──────────────────────────────────────────
describe('GET /api/sorteos/activo', () => {

  test('✅ devuelve el sorteo activo cuando existe', async () => {
    await crearSorteo({ nombre: 'Gran Bingo', estado: 'activo' });

    const res = await request(app).get('/api/sorteos/activo');

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Gran Bingo');
    expect(res.body.estado).toBeUndefined(); // no exponer estado en público
  });

  test('❌ devuelve 404 si no hay sorteo activo', async () => {
    await crearSorteo({ estado: 'borrador' });

    const res = await request(app).get('/api/sorteos/activo');
    expect(res.status).toBe(404);
  });
});

// ── Crear sorteo (admin) ──────────────────────────────────────
describe('POST /api/sorteos', () => {

  const payload = {
    nombre:           'Bingo Navidad',
    fecha_sorteo:     new Date(Date.now() + 86400000).toISOString(),
    precio_boleta:    5000,
    total_boletas:    100,
    tipo_boleta:      'bingo',
    premio_descripcion: '$10.000.000',
  };

  test('✅ admin puede crear un sorteo', async () => {
    const res = await request(app)
      .post('/api/sorteos')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe('Bingo Navidad');
    expect(res.body.estado).toBe('activo');
    expect(res.body.modalidades).toHaveLength(1);
  });

  test('❌ falla sin token', async () => {
    const res = await request(app).post('/api/sorteos').send(payload);
    expect(res.status).toBe(401);
  });

  test('❌ falla si faltan campos requeridos', async () => {
    const res = await request(app)
      .post('/api/sorteos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Solo nombre' }); // faltan fecha, precio, total

    expect(res.status).toBe(400);
  });
});

// ── Cambiar estado ────────────────────────────────────────────
describe('PATCH /api/sorteos/:id', () => {

  test('✅ admin puede activar un sorteo', async () => {
    const sorteo = await crearSorteo({ estado: 'borrador' });

    const res = await request(app)
      .patch(`/api/sorteos/${sorteo.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'activo' });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('activo');
  });

  test('❌ estado inválido devuelve 400', async () => {
    const sorteo = await crearSorteo();

    const res = await request(app)
      .patch(`/api/sorteos/${sorteo.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'inexistente' });

    expect(res.status).toBe(400);
  });
});
