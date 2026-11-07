// tests/setup.js
// ─────────────────────────────────────────────────────────────
// Carga variables de entorno de prueba Y mockea servicios externos
// para que los tests corran SIN necesitar Twilio ni Cloudinary reales.
// ─────────────────────────────────────────────────────────────

// Variables de entorno de prueba
process.env.NODE_ENV       = 'test';
process.env.PORT          ||= '3001';
process.env.DATABASE_URL  ||= 'postgresql://localhost:5432/bingo_test';
process.env.JWT_SECRET    ||= require('crypto').randomBytes(32).toString('hex');
process.env.JWT_EXPIRES_IN ||= '1h';

// ── Mock Cloudinary ───────────────────────────────────────────
jest.mock('../src/services/cloudinary', () => ({
  subirBuffer:         jest.fn().mockResolvedValue('https://res.cloudinary.com/test/carton.pdf'),
  subirArchivo:       jest.fn().mockResolvedValue({
    secure_url: 'https://res.cloudinary.com/test/private_comprobante.jpg',
    public_id: 'bingo/comprobantes/test',
    resource_type: 'image',
    format: 'jpg',
  }),
  eliminarArchivo:    jest.fn().mockResolvedValue({ result: 'ok' }),
  urlPrivada:         jest.fn().mockReturnValue('https://res.cloudinary.com/test/private_comprobante.jpg'),
  cloudinary: { config: jest.fn() },
}));

// ── Mock pdfGenerator ─────────────────────────────────────────
jest.mock('../src/services/pdfGenerator', () => ({
  generarCartonPDF: jest.fn().mockResolvedValue({
    pdfUrl: 'https://cloudinary.com/test/carton_generado.pdf',
  }),
}));
