const multer = require('multer');

const uploadPremio = multer({
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
    const tipos = ['image/jpeg', 'image/png', 'image/webp'];
    if (tipos.includes(file.mimetype)) cb(null, true);
    else {
      const error = new Error('La imagen de premiación debe ser JPG, PNG o WEBP');
      error.status = 400;
      cb(error);
    }
  },
});

module.exports = uploadPremio;
