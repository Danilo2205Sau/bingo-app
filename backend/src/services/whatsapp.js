const twilio = require('twilio');
const db     = require('../config/db');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

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

  if (!rows.length) throw new Error(`Venta ${ventaId} sin cartones asignados`);

  const { nombre, telefono, sorteo, fecha_sorteo, premio_descripcion } = rows[0];
  const fecha = new Date(fecha_sorteo).toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Mensaje de bienvenida
  const mensajeBienvenida =
    `Hola ${nombre}! Tu compra fue aprobada.\n\n` +
    `*${sorteo}*\n` +
    `Fecha: ${fecha}\n` +
    `Premio: ${premio_descripcion || 'Gran premio'}\n\n` +
    `A continuacion te envio tus ${rows.length} carton(es)`;

  await enviarMensaje(telefono, mensajeBienvenida, ventaId);

  // Enviar cada cartón como PDF
  for (const carton of rows) {
    const msg = `*Carton #${carton.codigo_unico}*\nGuarda este PDF — es tu boleta oficial.`;
    await enviarMensaje(telefono, msg, ventaId, carton.pdf_url);
  }

  // Registrar notificación exitosa
  await db.query(`
    INSERT INTO notificaciones (venta_id, canal, estado, mensaje, enviado_en)
    VALUES ($1, 'whatsapp', 'enviado', $2, NOW())
  `, [ventaId, `${rows.length} cartones enviados`]);
}

async function enviarMensaje(telefono, body, ventaId, mediaUrl = null) {
  const params = {
    from: process.env.TWILIO_WHATSAPP_FROM,
    to:   `whatsapp:+57${telefono.replace(/\D/g, '')}`,
    body,
  };
  if (mediaUrl) params.mediaUrl = [mediaUrl];

  try {
    await client.messages.create(params);
  } catch (err) {
    await db.query(`
      INSERT INTO notificaciones (venta_id, canal, estado, error_msg)
      VALUES ($1, 'whatsapp', 'fallido', $2)
    `, [ventaId, err.message]);
    throw err;
  }
}

module.exports = { enviarCartonesPorWhatsApp };
