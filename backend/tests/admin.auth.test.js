// tests/admin.auth.test.js
// ─────────────────────────────────────────────────────────────
// Prueba el login del administrador y protección de rutas JWT
// ─────────────────────────────────────────────────────────────

const request = require('supertest');
const { getApp, limpiarBD, crearAdmin, tokenAdmin } = require('./helpers');

let app;

beforeAll(async () => { app = getApp(); });
beforeEach(async () => { await limpiarBD(); });
// ── Grupo: POST /api/admin/login ──────────────────────────────
describe('POST /api/admin/login', () => {

  test('✅ login exitoso con credenciales correctas', async () => {
    await crearAdmin({ email: 'admin@test.com' });

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.com', password: 'test123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.admin.email).toBe('admin@test.com');
  });

  test('❌ falla con contraseña incorrecta', async () => {
    await crearAdmin({ email: 'admin@test.com' });

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.com', password: 'incorrecta' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('❌ falla si el email no existe', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'noexiste@test.com', password: 'test123' });

    expect(res.status).toBe(401);
  });

  test('🔒 bloquea el correo de administrador predeterminado heredado', async () => {
    await crearAdmin({ email: 'admin@bingo.com', password: 'not-a-real-password' });

    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@bingo.com', password: 'not-a-real-password' });

    expect(res.status).toBe(401);
  });

  test('❌ falla si faltan campos', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ email: 'admin@test.com' }); // sin password

    expect(res.status).toBe(400);
  });
});

// ── Grupo: Rutas protegidas con JWT ──────────────────────────
describe('Rutas protegidas — JWT', () => {

  test('❌ GET /api/admin/dashboard sin token devuelve 401', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });

  test('❌ token inválido devuelve 403', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', 'Bearer token_falso_abc123');
    expect(res.status).toBe(403);
  });

  test('✅ token válido permite acceder al dashboard', async () => {
    const admin = await crearAdmin();
    const token = tokenAdmin(admin);

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('boletas_vendidas');
    expect(res.body).toHaveProperty('dinero_recaudado');
  });
});
