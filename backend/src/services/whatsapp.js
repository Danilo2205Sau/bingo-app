// ============================================
// whatsapp.js — Envío via Meta WhatsApp API
// ============================================

const db = require('../config/db');

const META_API_URL = `https://graph.facebook.com/${process.env.META_API_VERSION || 'v25.0'}`;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.META_ACCESS_TOKEN;

async function enviarCartonesPorWhatsApp(ventaId) {
  const { rows } = await db.query(`
    SELECT c.codigo_unico, c.numeros, c.pdf_url, c.tipo_boleta,
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

  const { nombre, telefono, sorteo, fecha_sorteo, premio_descripcion, tipo_boleta } = rows[0];
  const etiqueta = tipo_boleta === 'rifa' ? 'boleta' : 'cartón';

  // Formatear número colombiano: 3101234567 → 573101234567
  const numeroFormateado = formatearNumero(telefono);
  console.log(`[Venta ${ventaId}] Teléfono original: "${telefono}" → formateado: "${numeroFormateado}"`);

  const fecha = new Date(fecha_sorteo).toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // 1. Mensaje de bienvenida — usa la plantilla aprobada por Meta para poder
  //    iniciar la conversación sin depender de que el cliente escriba primero.
  //    Si la plantilla falla (no configurada/no aprobada aún), cae a texto libre
  //    como respaldo (que solo funcionará si la ventana de 24h ya está abierta).
  const nombrePlantilla = process.env.WHATSAPP_TEMPLATE_NOMBRE || 'confirmacion_pago_boleta';
  const idiomaPlantilla = process.env.WHATSAPP_TEMPLATE_IDIOMA || 'es';

    try {
    await enviarMensajePlantilla(
      numeroFormateado,
      nombrePlantilla,
      idiomaPlantilla,
      [nombre, sorteo, fecha, premio_descripcion || 'Gran Premio'],
      ventaId,
      rows[0].pdf_url,
      `${nombreArchivoBoleta(rows[0])}.pdf`
    );
  } catch (errPlantilla) {
    console.error(`[Venta ${ventaId}] Falló envío por plantilla, intentando texto libre como respaldo:`, errPlantilla.message);
    await enviarMensajeTexto(
      numeroFormateado,
      `Hola ${nombre}! ✅ Tu pago fue aprobado.\n\n` +
      `🎱 *${sorteo}*\n` +
      `📅 Fecha: ${fecha}\n` +
      `🏆 Premio: ${premio_descripcion || 'Gran Premio'}\n\n` +
      `A continuación te enviamos tu(s) ${etiqueta}(es). ¡Mucha suerte!`,
      ventaId
    );
  }

  const pdfUrl = rows[0].pdf_url;
  if (!pdfUrl) throw new Error(`Venta ${ventaId} sin pdf_url asignado aún`);

  // Registrar notificación exitosa
  await db.query(`
    INSERT INTO notificaciones (venta_id, canal, estado, mensaje, enviado_en)
    VALUES ($1, 'whatsapp', 'enviado', $2, NOW())
  `, [ventaId, `${rows.length} ${etiqueta}(es) enviados via Meta API`]);
}


// Nombre del archivo de una boleta: Boleta_<número> (ej. Boleta_123456).
// Para rifa el número es el que eligió/recibió el cliente; para bingo, el código.
function nombreArchivoBoleta(carton) {
  const base = (carton.tipo_boleta === 'rifa' && Array.isArray(carton.numeros) && carton.numeros.length)
    ? carton.numeros.join('')
    : carton.codigo_unico;
  return `Boleta_${String(base).replace(/[^A-Za-z0-9_-]/g, '')}`;
}

// Venta directa (admin): envía SOLO el PDF de la boleta, sin el mensaje de la
// plantilla. Si Meta rechaza el envío libre (p. ej. número sin conversación
// abierta), cae a la plantilla como respaldo para que la boleta igual llegue.
async function enviarBoletaDirectaPorWhatsApp(ventaId) {
  const { rows } = await db.query(`
    SELECT c.codigo_unico, c.numeros, c.pdf_url, c.tipo_boleta,
           comp.nombre, comp.telefono,
           s.nombre AS sorteo, s.fecha_sorteo, s.premio_descripcion
    FROM ventas v
    JOIN compradores comp ON comp.id = v.comprador_id
    JOIN sorteos s        ON s.id = v.sorteo_id
    JOIN venta_cartones vc ON vc.venta_id = v.id
    JOIN cartones c       ON c.id = vc.carton_id
    WHERE v.id = $1
  `, [ventaId]);

  if (!rows.length) throw new Error(`Venta ${ventaId} sin cartones`);
  const carton = rows[0];
  if (!carton.pdf_url) throw new Error(`Venta ${ventaId} sin pdf_url asignado aún`);

  const numeroFormateado = formatearNumero(carton.telefono);
  const nombreArchivo = `${nombreArchivoBoleta(carton)}.pdf`;
  console.log(`[Venta ${ventaId}] Envío directo (sin plantilla) → ${numeroFormateado} como ${nombreArchivo}`);

  const numeroBoleta = nombreArchivoBoleta(carton).replace(/^Boleta_/, '');
  const plantillaDirecta = process.env.WHATSAPP_TEMPLATE_DIRECTA; // plantilla mínima solo para venta directa
  const idioma = process.env.WHATSAPP_TEMPLATE_IDIOMA || 'es';

  if (plantillaDirecta) {
    // Camino confiable: plantilla mínima con el PDF en el encabezado.
    // Llega siempre, incluso a números sin conversación abierta en 24h.
    await enviarMensajePlantilla(
      numeroFormateado, plantillaDirecta, idioma, [numeroBoleta],
      ventaId, carton.pdf_url, nombreArchivo
    );
  } else {
    // Sin plantilla configurada: documento libre (solo llega si el número
    // le escribió al negocio en las últimas 24 h).
    try {
      await enviarDocumento(numeroFormateado, carton.pdf_url, nombreArchivo, null, ventaId);
    } catch (errDoc) {
      console.error(`[Venta ${ventaId}] Falló envío directo, usando plantilla completa como respaldo:`, errDoc.message);
      const fecha = new Date(carton.fecha_sorteo).toLocaleDateString('es-CO', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      await enviarMensajePlantilla(
        numeroFormateado,
        process.env.WHATSAPP_TEMPLATE_NOMBRE || 'confirmacion_pago_boleta',
        idioma,
        [carton.nombre, carton.sorteo, fecha, carton.premio_descripcion || 'Gran Premio'],
        ventaId, carton.pdf_url, nombreArchivo
      );
    }
  }

  await db.query(`
    INSERT INTO notificaciones (venta_id, canal, estado, mensaje, enviado_en)
    VALUES ($1, 'whatsapp', 'enviado', $2, NOW())
  `, [ventaId, `Boleta ${nombreArchivo} enviada (venta directa)`]);
}


async function enviarMensajePlantilla(telefono, nombrePlantilla, idioma, variables, ventaId, documentoUrl = null, nombreArchivo = 'Boleta.pdf') {
  const components = [
    {
      type: 'body',
      parameters: variables.map(v => ({ type: 'text', text: String(v) })),
    },
  ];

  // Si hay un documento (la boleta en PDF), se manda DENTRO de la plantilla
  // como encabezado — así Meta lo entrega junto con el mensaje aprobado,
  // sin depender de una ventana de conversación posterior.
  if (documentoUrl) {
    components.unshift({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: {
            link: documentoUrl,
            filename: nombreArchivo,
          },
        },
      ],
    });
  }

  const body = {
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'template',
    template: {
      name: nombrePlantilla,
      language: { code: idioma },
      components,
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
    throw new Error(`Meta API plantilla error: ${JSON.stringify(err)}`);
  }
  
    const data = await res.json();
  console.log(`[Venta ${ventaId}] Respuesta Meta (plantilla):`, JSON.stringify(data));
  return data;
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
      ...(caption ? { caption } : {}),
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

module.exports = { enviarCartonesPorWhatsApp, enviarBoletaDirectaPorWhatsApp, nombreArchivoBoleta };