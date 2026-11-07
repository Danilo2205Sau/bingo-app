const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 20,
    fieldSize: 64 * 1024,
    fieldNameSize: 100,
    fieldArrayIndexLimit: 10,
    parts: 21,
    headerPairs: 100,
  },
  fileFilter: (_req, file, cb) => {
    const tipos = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (tipos.includes(file.mimetype)) cb(null, true);
    else {
      const error = new Error('Solo se permiten imágenes (JPG, PNG, WEBP) o PDF');
      error.status = 400;
      cb(error);
    }
  },
});

module.exports = upload;
