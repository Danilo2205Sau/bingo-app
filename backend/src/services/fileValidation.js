function detectarFormato(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return { format: 'pdf', resourceType: 'raw' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { format: 'jpg', resourceType: 'image' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { format: 'png', resourceType: 'image' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { format: 'webp', resourceType: 'image' };
  }
  return null;
}

function validarArchivo(file) {
  if (!file?.buffer || !file.buffer.length) {
    const error = new Error('El archivo está vacío o no se recibió correctamente');
    error.status = 400;
    throw error;
  }

  const detected = detectarFormato(file.buffer);
  const mimeFormats = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  if (!detected || mimeFormats[file.mimetype] !== detected.format ||
      (file.size !== undefined && file.size !== file.buffer.length)) {
    const error = new Error('El contenido del archivo no coincide con el tipo permitido');
    error.status = 400;
    throw error;
  }
  return detected;
}

module.exports = { detectarFormato, validarArchivo };
