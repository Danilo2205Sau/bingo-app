const multer = require('multer');
const { storagePremios } = require('../services/cloudinary');

const uploadPremio = multer({
  storage: storagePremios,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const tipos = ['image/jpeg', 'image/png', 'image/webp'];
    if (tipos.includes(file.mimetype)) cb(null, true);
    else cb(new Error('La imagen de premiación debe ser JPG, PNG o WEBP'));
  },
});

module.exports = uploadPremio;