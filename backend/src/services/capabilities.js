const crypto = require('crypto');

function createCapability() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashCapability(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashRequestFingerprint(value) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET es requerido para calcular la huella privada de compra');
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function isCapability(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

module.exports = { createCapability, hashCapability, hashRequestFingerprint, isCapability };
