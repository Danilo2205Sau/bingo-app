// tests/setup.js
// ─────────────────────────────────────────────────────────────
// Carga variables de entorno de prueba Y mockea servicios externos
// para que los tests corran SIN necesitar Twilio ni Cloudinary reales.
// ─────────────────────────────────────────────────────────────

// Variables de entorno de prueba
process.env.NODE_ENV      = 'test';
process.env.PORT          = '3001';
process.env.DATABASE_URL  = 'postgresql://bingo_user:bingo_pass@localhost:5432/bingo_test';
process.env.JWT_SECRET    = 'secreto_de_prueba_12345678901234567890';
process.env.JWT_EXPIRES_IN = '1h';

// ── Mock Twilio ───────────────────────────────────────────────
jest.mock('twilio', () => {
  return () => ({
    messages: {
      create: jest.fn().mockResolvedValue({ sid: 'SM_test_123' }),
    },
  });
});

// ── Mock Cloudinary ───────────────────────────────────────────
jest.mock('../src/services/cloudinary', () => ({
  subirBuffer:         jest.fn().mockResolvedValue('https://res.cloudinary.com/test/carton.pdf'),
  storageComprobantes: {
    _handleFile:  (_req, file, cb) => cb(null, { path: 'https://cloudinary.com/test/comprobante.jpg' }),
    _removeFile:  (_req, _file, cb) => cb(null),
  },
  storagePDFs: {
    _handleFile:  (_req, file, cb) => cb(null, { path: 'https://cloudinary.com/test/pdf.pdf' }),
    _removeFile:  (_req, _file, cb) => cb(null),
  },
  cloudinary: { config: jest.fn() },
}));

// ── Mock pdfGenerator ─────────────────────────────────────────
jest.mock('../src/services/pdfGenerator', () => ({
  generarCartonPDF: jest.fn().mockResolvedValue({
    pdfUrl: 'https://cloudinary.com/test/carton_generado.pdf',
  }),
}));
