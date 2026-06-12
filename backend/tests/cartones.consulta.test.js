// tests/cartones.consulta.test.js
// ─────────────────────────────────────────────────────────────
// Prueba generación de cartones y consulta pública
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
  sorteo = await crearSorteo();
});

afterAll(async () => { await db.pool.end(); });

// ── Generar cartones ──────────────────────────────────────────
describe('POST /api/cartones/generar', () => {

  test('✅ admin puede generar cartones automáticos', async () => {
    const res = await request(app)
      .post('/api/cartones/generar')
      .set('Authorization', `Bearer ${token}`)
      .send({ sorteo_id: sorteo.id, cantidad: 3 });

    expect(res.status).toBe(201);
    expect(res.body.cartones).toHaveLength(3);
    expect(res.body.cartones[0]).toHaveProperty('codigo_unico');
  });

  test('✅ los códigos generados son únicos', async () => {
    const res = await request(app)
      .post('/api/cartones/generar')
      .set('Authorization', `Bearer ${token}`)
      .send({ sorteo_id: sorteo.id, cantidad: 10 });

    const codigos = res.body.cartones.map(c => c.codigo_unico);
    const unicos  = new Set(codigos);
    expect(unicos.size).toBe(10);
  });

  test('❌ falla sin token de admin', async () => {
    const res = await request(app)
      .post('/api/cartones/generar')
      .send({ sorteo_id: sorteo.id, cantidad: 5 });

    expect(res.status).toBe(401);
  });
});

// ── Obtener cartón por código ─────────────────────────────────
describe('GET /api/cartones/:codigo', () => {

  test('✅ devuelve info del cartón por código', async () => {
    const carton = await crearCarton(sorteo.id, { codigo: 'TESTCOD1' });

    const res = await request(app).get('/api/cartones/TESTCOD1');

    expect(res.status).toBe(200);
    expect(res.body.codigo_unico).toBe('TESTCOD1');
    expect(res.body).toHaveProperty('numeros');
  });

  test('✅ búsqueda es case-insensitive', async () => {
    await crearCarton(sorteo.id, { codigo: 'ABCD1234' });

    const res = await request(app).get('/api/cartones/abcd1234');
    expect(res.status).toBe(200);
  });

  test('❌ código inexistente devuelve 404', async () => {
    const res = await request(app).get('/api/cartones/NOEXISTE');
    expect(res.status).toBe(404);
  });
});

// ── Consulta pública ──────────────────────────────────────────
describe('GET /api/consulta', () => {

  test('✅ comprador puede buscar boleta por código', async () => {
    const comprador = await crearComprador({ telefono: '3109876543' });
    const carton    = await crearCarton(sorteo.id, { codigo: 'MICARTON' });
    const venta     = await crearVenta(comprador.id, sorteo.id);

    // Asignar cartón a la venta
    await db.query(
      'INSERT INTO venta_cartones (venta_id, carton_id) VALUES ($1,$2)',
      [venta.id, carton.id]
    );
    await db.query('UPDATE cartones SET vendido=true WHERE id=$1', [carton.id]);

    const res = await request(app).get('/api/consulta?q=MICARTON');

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.tipo).toBe('codigo');
  });

  test('✅ comprador puede buscar boletas por teléfono', async () => {
    const comprador = await crearComprador({ telefono: '3001112233' });
    const carton1   = await crearCarton(sorteo.id);
    const carton2   = await crearCarton(sorteo.id);
    const venta     = await crearVenta(comprador.id, sorteo.id, { cantidad: 2 });

    await db.query(
      'INSERT INTO venta_cartones (venta_id, carton_id) VALUES ($1,$2),($1,$3)',
      [venta.id, carton1.id, carton2.id]
    );

    const res = await request(app).get('/api/consulta?q=3001112233');

    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('telefono');
    expect(res.body.resultados.length).toBeGreaterThanOrEqual(2);
  });

  test('❌ devuelve 404 si no encuentra nada', async () => {
    const res = await request(app).get('/api/consulta?q=9999999999');
    expect(res.status).toBe(404);
  });

  test('❌ query muy corta devuelve 400', async () => {
    const res = await request(app).get('/api/consulta?q=AB');
    expect(res.status).toBe(400);
  });
});
