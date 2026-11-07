const { detectarFormato, validarArchivo } = require('../src/services/fileValidation');

test.each([
  [Buffer.from('%PDF-1.7'), 'pdf', 'raw'],
  [Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'jpg', 'image'],
  [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png', 'image'],
  [Buffer.from('RIFF0000WEBP'), 'webp', 'image'],
])('detecta firma de archivo %s', (bytes, format, resourceType) => {
  expect(detectarFormato(bytes)).toEqual({ format, resourceType });
});

test('rechaza un archivo con MIME que no coincide con sus bytes', () => {
  expect(() => validarArchivo({ buffer: Buffer.from('%PDF-1.7'), mimetype: 'image/jpeg' }))
    .toThrow('El contenido del archivo no coincide con el tipo permitido');
});

test('rechaza un archivo vacío o de tipo desconocido', () => {
  expect(() => validarArchivo({ buffer: Buffer.alloc(0), mimetype: 'application/pdf' }))
    .toThrow('El archivo está vacío o no se recibió correctamente');
  expect(() => validarArchivo({ buffer: Buffer.from('not a pdf'), mimetype: 'application/pdf' }))
    .toThrow('El contenido del archivo no coincide con el tipo permitido');
});
