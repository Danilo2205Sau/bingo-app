const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Subir buffer directo (para PDFs generados)
async function subirBuffer(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        public_id: publicId,
        format: 'pdf',
        type: 'upload',
        access_mode: 'public',
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// Storage para multer (comprobantes de pago e imágenes)
const storageComprobantes = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'bingo/comprobantes',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
  },
});

const storagePDFs = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'bingo/cartones',
    resource_type: 'raw',
    allowed_formats: ['pdf'],
  },
});

const storagePremios = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'bingo/premios',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

module.exports = { subirBuffer, storageComprobantes, storagePDFs, storagePremios, cloudinary };
