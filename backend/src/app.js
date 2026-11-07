require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./config/db');

const app = express();
const proxyHops = process.env.TRUST_PROXY_HOPS;
app.set('trust proxy', proxyHops ? Number(proxyHops) : process.env.NODE_ENV === 'production' ? 1 : false);

app.use(helmet());
const frontendOrigins = (process.env.FRONTEND_URL || '')
  .split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (origin, callback) => callback(null, !origin || frontendOrigins.includes(origin))
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Consulta-Token'],
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta en 15 minutos.' },
}));

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

app.use('/api/sorteos', require('./routes/sorteos'));
app.use('/api/modalidades', require('./routes/modalidades'));
app.use('/api/ventas', require('./routes/ventas'));
app.use('/api/cartones', require('./routes/cartones'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/consulta', require('./routes/consulta'));

app.get('/api/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/health/ready', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (_err) {
    res.status(503).json({ status: 'unavailable' });
  }
});
// Backward-compatible readiness endpoint for existing uptime monitors.
app.get('/api/health', (_req, res) => res.redirect(307, '/api/health/ready'));

app.use((err, _req, res, _next) => {
  console.error(err.stack || err);
  const uploadStatus = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.code?.startsWith('LIMIT_') ? 400 : null;
  const status = uploadStatus || (Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500);
  const safeMessage = status === 500 ? 'Error interno del servidor' : (err.message || 'Solicitud inválida');
  res.status(status).json({ error: safeMessage });
});

function validateProductionConfig() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /cambia_esto|change.?me|secret/i.test(process.env.JWT_SECRET)) {
    throw new Error('Configura JWT_SECRET con al menos 32 caracteres aleatorios antes de iniciar');
  }
  if (!process.env.FRONTEND_URL) throw new Error('FRONTEND_URL es requerido en producción');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es requerido en producción');
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Configura CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET antes de iniciar');
  }
  if (process.env.TRUST_PROXY_HOPS && (!/^\d+$/.test(process.env.TRUST_PROXY_HOPS) || Number(process.env.TRUST_PROXY_HOPS) < 1)) {
    throw new Error('TRUST_PROXY_HOPS debe ser un entero positivo');
  }
}

function startServer() {
  if (process.env.NODE_ENV === 'production') validateProductionConfig();
  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => console.log(`Servidor listo en puerto ${port}`));
  const stopNotificationWorker = require('./services/notificationWorker').startNotificationWorker();
  let closing = false;
  const shutdown = signal => {
    if (closing) return;
    closing = true;
    console.log(`Cerrando servidor (${signal})`);
    server.close(() => stopNotificationWorker()
      .then(() => db.pool.end())
      .finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return server;
}

if (require.main === module) startServer();

module.exports = { app, startServer, validateProductionConfig };
