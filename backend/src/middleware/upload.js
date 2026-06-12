const multer = require('multer');
const { storageComprobantes } = require('../services/cloudinary');

const upload = multer({
  storage: storageComprobantes,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB máximo
  fileFilter: (_req, file, cb) => {
    const tipos = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (tipos.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPG, PNG, WEBP) o PDF'));
    }
  },
});

module.exports = upload;
