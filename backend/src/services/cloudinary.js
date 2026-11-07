const { randomUUID } = require('crypto');
const cloudinary = require('cloudinary').v2;
const { validarArchivo } = require('./fileValidation');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadStream(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      if (!result?.secure_url || !result.public_id) return reject(new Error('Cloudinary no devolvió el archivo cargado'));
      resolve(result);
    });
    stream.end(buffer);
  });
}

// Los PDF generados para el comprador se conservan como archivos raw públicos:
// el código de consulta de la venta controla cuándo se comparte el enlace.
async function subirBuffer(buffer, publicId) {
  const result = await uploadStream(buffer, {
    resource_type: 'raw',
    public_id: publicId,
    format: 'pdf',
    type: 'authenticated',
    overwrite: true,
  });
  return urlPrivada(result.public_id, 'raw', 'pdf');
}

function urlPrivada(publicId, resourceType = 'image', format) {
  if (!publicId) return null;
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: resourceType,
    type: 'authenticated',
    sign_url: true,
    ...(format ? { format } : {}),
  });
}

async function subirArchivo(file, { folder, authenticated = false } = {}) {
  const detected = validarArchivo(file);

  const publicId = `${folder}/${randomUUID()}`;
  const result = await uploadStream(file.buffer, {
    resource_type: detected.resourceType,
    public_id: publicId,
    format: detected.format,
    type: authenticated ? 'authenticated' : 'upload',
    overwrite: false,
    unique_filename: false,
    discard_original_filename: true,
  });

  return {
    secure_url: authenticated
      ? urlPrivada(result.public_id, detected.resourceType, detected.format)
      : result.secure_url,
    public_id: result.public_id,
    resource_type: detected.resourceType,
    format: detected.format,
  };
}

async function eliminarArchivo(publicId, resourceType = 'image', authenticated = false) {
  if (!publicId) return;
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: authenticated ? 'authenticated' : 'upload',
  });
}

module.exports = { subirBuffer, subirArchivo, eliminarArchivo, urlPrivada, cloudinary };
