const db = require('../config/db');

const MAX_ATTEMPTS = 8;
const LEASE_MINUTES = 10;

function envInteger(name, fallback, max) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}

async function reclamarTrabajo() {
  const { rows } = await db.query(`
    WITH siguiente AS (
      SELECT id
      FROM notificaciones
      WHERE canal = 'whatsapp' AND estado = 'pendiente'
        AND proximo_intento <= NOW()
        AND (lease_hasta IS NULL OR lease_hasta < NOW())
      ORDER BY proximo_intento, creado_en, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE notificaciones n
    SET intentos = n.intentos + 1,
        lease_hasta = NOW() + ($1::int * INTERVAL '1 minute')
    FROM siguiente
    WHERE n.id = siguiente.id
    RETURNING n.id, n.venta_id, n.tipo_trabajo, n.intentos
  `, [LEASE_MINUTES]);
  return rows[0] || null;
}

async function enviarVenta(ventaId, tipoTrabajo) {
  const { rows } = await db.query(`
    SELECT v.id, v.es_administrador, v.estado_pago,
           s.id AS sorteo_id, s.nombre AS sorteo_nombre, s.fecha_sorteo,
           s.imagen_premio_url,
           m.nombre AS modalidad_nombre, m.tipo_boleta, m.precio_boleta,
           m.fuente_resultado,
           c.id AS carton_id, c.codigo_unico, c.numeros, c.tipo_boleta AS carton_tipo_boleta,
           c.pdf_url
    FROM ventas v
    JOIN sorteos s ON s.id = v.sorteo_id
    LEFT JOIN modalidades m ON m.id = v.modalidad_id
    JOIN venta_cartones vc ON vc.venta_id = v.id
    JOIN cartones c ON c.id = vc.carton_id
    WHERE v.id = $1
    ORDER BY c.codigo_unico
  `, [ventaId]);

  if (!rows.length) throw new Error(`Venta ${ventaId} no tiene cartones asignados`);
  const venta = rows[0];
  const esVentaDirecta = tipoTrabajo === 'boleta_admin';
  if (esVentaDirecta && !venta.es_administrador) throw new Error('El trabajo no corresponde a una venta directa');
  if (!esVentaDirecta && venta.estado_pago !== 'aprobado') throw new Error('La venta ya no está aprobada');

  const cartones = rows.map(row => ({
    id: row.carton_id,
    codigo_unico: row.codigo_unico,
    numeros: row.numeros,
    tipo_boleta: row.carton_tipo_boleta || row.tipo_boleta,
    pdf_url: row.pdf_url,
  }));
  const existingUrls = new Set(cartones.map(carton => carton.pdf_url).filter(Boolean));
  let pdfUrl = cartones.every(carton => carton.pdf_url) && existingUrls.size === 1
    ? cartones[0].pdf_url
    : null;

  if (!pdfUrl) {
    const { generarHojaCartonesPDF, generarBoletasConImagenPremio } = require('./pdfGenerator');
    const fechaSorteoTexto = venta.fecha_sorteo
      ? new Date(venta.fecha_sorteo).toLocaleDateString('es-CO', { dateStyle: 'long' })
      : '';
    const whatsappContacto = process.env.WHATSAPP_CONTACTO_PUBLICO || '';

    if (venta.imagen_premio_url) {
      const nombreArchivoBoleta = require('./whatsapp').nombreArchivoBoleta;
      const publicId = esVentaDirecta
        ? `boletas/${venta.sorteo_id}/${nombreArchivoBoleta(cartones[0])}`
        : undefined;
      ({ pdfUrl } = await generarBoletasConImagenPremio({
        cartones,
        imagenPremioUrl: venta.imagen_premio_url,
        sorteoNombre: venta.sorteo_nombre,
        fechaSorteoTexto,
        precioBoleta: venta.precio_boleta,
        whatsappContacto,
        fuenteResultado: venta.fuente_resultado,
        ventaId,
        ...(publicId ? { publicId } : {}),
      }));
    } else {
      const config = {
        cartones,
        tipoBoleta: venta.tipo_boleta || 'bingo',
        modalidadNombre: venta.modalidad_nombre,
        fuenteResultado: venta.fuente_resultado,
        sorteoNombre: venta.sorteo_nombre,
        fechaSorteoTexto,
        ventaId,
        whatsappContacto,
      };
      if (esVentaDirecta) {
        const nombreArchivoBoleta = require('./whatsapp').nombreArchivoBoleta;
        config.publicId = `boletas/${venta.sorteo_id}/${nombreArchivoBoleta(cartones[0])}`;
      }
      ({ pdfUrl } = await generarHojaCartonesPDF(config));
    }

    if (!pdfUrl) throw new Error('El servicio de PDF no devolvió un enlace');
    await db.query('UPDATE cartones SET pdf_url = $1 WHERE id = ANY($2::uuid[])', [
      pdfUrl, cartones.map(carton => carton.id),
    ]);
  }

  const whatsapp = require('./whatsapp');
  if (esVentaDirecta) await whatsapp.enviarBoletaDirectaPorWhatsApp(ventaId);
  else await whatsapp.enviarCartonesPorWhatsApp(ventaId);
}

async function procesarTrabajo(job) {
  try {
    await enviarVenta(job.venta_id, job.tipo_trabajo);
    await db.query(`
      UPDATE notificaciones SET estado = 'enviado', enviado_en = NOW(),
        error_msg = NULL, lease_hasta = NULL
      WHERE id = $1
    `, [job.id]);
    console.log(`[Notificaciones] Trabajo ${job.id} enviado`);
  } catch (error) {
    const agotado = job.intentos >= MAX_ATTEMPTS;
    const esperaMinutos = Math.min(60, 2 ** Math.min(job.intentos - 1, 6));
    await db.query(`
      UPDATE notificaciones SET
        estado = $2,
        error_msg = $3,
        lease_hasta = NULL,
        proximo_intento = CASE WHEN $2 = 'pendiente'
          THEN NOW() + ($4::int * INTERVAL '1 minute') ELSE proximo_intento END
      WHERE id = $1
    `, [job.id, agotado ? 'fallido' : 'pendiente', String(error.message || error).slice(0, 2000), esperaMinutos]);
    console.error(`[Notificaciones] Trabajo ${job.id} ${agotado ? 'agotó reintentos' : 'se reintentará'}:`, error.message);
  }
}

function startNotificationWorker() {
  const concurrency = envInteger('NOTIFICATION_WORKERS', 2, 10);
  const batchPerWorker = envInteger('NOTIFICATION_BATCH_PER_WORKER', 3, 20);
  const pollMs = envInteger('NOTIFICATION_POLL_MS', 1000, 60000);
  let stopped = false;
  let activeRun = null;

  const run = () => {
    if (stopped || activeRun) return;
    activeRun = Promise.all(Array.from({ length: concurrency }, async () => {
      for (let count = 0; count < batchPerWorker && !stopped; count++) {
        const job = await reclamarTrabajo();
        if (!job) break;
        await procesarTrabajo(job);
      }
    })).catch(error => {
      console.error('[Notificaciones] Error del worker:', error.message);
    }).finally(() => { activeRun = null; });
  };

  const timer = setInterval(run, pollMs);
  timer.unref();
  run();

  return async function stopNotificationWorker() {
    stopped = true;
    clearInterval(timer);
    if (activeRun) await activeRun;
  };
}

module.exports = { startNotificationWorker };
