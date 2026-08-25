// ============================================
// whatsapp.js — Envío via Meta WhatsApp API
// ============================================

const db = require('../config/db');

const META_API_URL = `https://graph.facebook.com/${process.env.META_API_VERSION || 'v25.0'}`;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.META_ACCESS_TOKEN;

async function enviarCartonesPorWhatsApp(ventaId) {
  const { rows } = await db.query(`
    SELECT c.codigo_unico, c.pdf_url,
           comp.nombre, comp.telefono,
           s.nombre AS sorteo, s.fecha_sorteo, s.premio_descripcion,
           v.id AS venta_id
    FROM ventas v
    JOIN compradores comp ON comp.id = v.comprador_id
    JOIN sorteos s        ON s.id = v.sorteo_id
    JOIN venta_cartones vc ON vc.venta_id = v.id
    JOIN cartones c       ON c.id = vc.carton_id
    WHERE v.id = $1
  `, [ventaId]);
  

  if (!rows.length) throw new Error(`Venta ${ventaId} sin cartones`);

  const { nombre, telefono, sorteo, fecha_sorteo, premio_descripcion } = rows[0];

  // Formatear número colombiano: 3101234567 → 573101234567
  const numeroFormateado = formatearNumero(telefono);
  console.log(`[Venta ${ventaId}] Teléfono original: "${telefono}" → formateado: "${numeroFormateado}"`);

  const fecha = new Date(fecha_sorteo).toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // 1. Mensaje de bienvenida con texto
  await enviarMensajeTexto(
    numeroFormateado,
    `Hola ${nombre}! ✅ Tu pago fue aprobado.\n\n` +
    `🎱 *${sorteo}*\n` +
    `📅 Fecha: ${fecha}\n` +
    `🏆 Premio: ${premio_descripcion || 'Gran Premio'}\n\n` +
    `A continuación te enviamos tus ${rows.length} cartón(es). ¡Mucha suerte!`,
    ventaId
  );

   // 2. Enviar la hoja de cartones (un solo PDF con todos los cartones de esta venta)
  const pdfUrl = rows[0].pdf_url;
  if (!pdfUrl) throw new Error(`Venta ${ventaId} sin pdf_url asignado aún`);

  const codigosTexto = rows.map(r => r.codigo_unico).join(', ');
  await enviarDocumento(
    numeroFormateado,
    pdfUrl,
    `Cartones-Venta-${ventaId.slice(0, 8)}.pdf`,
    `🎴 Tus ${rows.length} cartón(es): ${codigosTexto} — Guárdalos, son tu boleta oficial.`,
    ventaId
  );

  // Registrar notificación exitosa
  await db.query(`
    INSERT INTO notificaciones (venta_id, canal, estado, mensaje, enviado_en)
    VALUES ($1, 'whatsapp', 'enviado', $2, NOW())
  `, [ventaId, `${rows.length} cartones enviados via Meta API`]);
}

async function enviarMensajeTexto(telefono, texto, ventaId) {
  const body = {
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'text',
    text: { body: texto },
  };

  const res = await fetch(`${META_API_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

   if (!res.ok) {
    const err = await res.json();
    await registrarError(ventaId, JSON.stringify(err));
    throw new Error(`Meta API error: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  console.log(`[Venta ${ventaId}] Respuesta Meta (texto):`, JSON.stringify(data));
  return data;
}

async function enviarDocumento(telefono, urlDoc, nombreArchivo, caption, ventaId) {
  // Paso 1: Subir el PDF a WhatsApp Media API
  const mediaId = await subirMediaWhatsApp(urlDoc, ventaId);

  const body = {
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'document',
    document: {
      id:       mediaId,
      filename: nombreArchivo,
      caption:  caption,
    },
  };

  const res = await fetch(`${META_API_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

   if (!res.ok) {
    const err = await res.json();
    await registrarError(ventaId, JSON.stringify(err));
    throw new Error(`Meta API doc error: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  console.log(`[Venta ${ventaId}] Respuesta Meta (documento):`, JSON.stringify(data));
  return data;
}

async function subirMediaWhatsApp(urlPdf, ventaId) {
  // Descargar el PDF desde Cloudinary
  const pdfRes = await fetch(urlPdf);
  if (!pdfRes.ok) throw new Error(`No se pudo descargar PDF: ${urlPdf}`);
  
  const pdfBuffer = await pdfRes.arrayBuffer();
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });

  // Subir a WhatsApp Media API
  const formData = new FormData();
  formData.append('messaging_product', 'whatsapp');
  formData.append('type', 'application/pdf');
  formData.append('file', blob, 'carton.pdf');

  const res = await fetch(`${META_API_URL}/${PHONE_NUMBER_ID}/media`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    await registrarError(ventaId, JSON.stringify(err));
    throw new Error(`Error subiendo media: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.id;
}

async function registrarError(ventaId, errorMsg) {
  try {
    await db.query(`
      INSERT INTO notificaciones (venta_id, canal, estado, error_msg)
      VALUES ($1, 'whatsapp', 'fallido', $2)
    `, [ventaId, errorMsg]);
  } catch(e) {
    console.error('Error registrando notificacion:', e);
  }
}

function formatearNumero(telefono) {
  // Eliminar todo excepto dígitos
  const digits = telefono.replace(/\D/g, '');
  // Si ya empieza con 57, dejarlo así
  if (digits.startsWith('57')) return digits;
  // Si empieza con +57, quitar el +
  if (digits.startsWith('57') && digits.length === 12) return digits;
  // Número colombiano de 10 dígitos: agregar 57
  return `57${digits}`;
}

module.exports = { enviarCartonesPorWhatsApp };