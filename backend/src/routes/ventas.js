const router = require('express').Router();
const db = require('../config/db');
const { extraerDatosComprobante } = require('../services/ocrService');
const { asignarCartonesAVenta } = require('../services/asignacion');
const { hashCapability, hashRequestFingerprint, isCapability } = require('../services/capabilities');
const upload = require('../middleware/upload');
const { subirArchivo, eliminarArchivo } = require('../services/cloudinary');

const MAX_CARTONES_POR_VENTA = 10;
const METODOS_PAGO_PUBLICOS = new Set(['nequi', 'bancolombia', 'transferencia']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseCartonIds(value) {
  if (value === undefined || value === null || value === '') return [];
  let ids = value;
  if (typeof value === 'string') {
    try { ids = JSON.parse(value); }
    catch { return null; }
  }
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !UUID_RE.test(id))) return null;
  return ids;
}

function programarOCR(comprobanteUrl, ventaId) {
  setImmediate(async () => {
    try {
      const datos = await extraerDatosComprobante(comprobanteUrl);
      await db.query(`
        UPDATE ventas SET referencia_pago = $1, nombre_titular = $2,
          monto_declarado = $3, banco_origen = $4, fecha_transaccion = $5
        WHERE id = $6
      `, [
        datos.referencia_pago, datos.nombre_titular, datos.monto_declarado,
        datos.banco_origen, datos.fecha_transaccion, ventaId,
      ]);
    } catch (error) {
      console.error(`[Venta ${ventaId}] No se pudo guardar el resultado OCR:`, error.message);
    }
  });
}

// POST /api/ventas — crea una compra y asigna exactamente las boletas cobradas.
router.post('/', upload.single('comprobante'), async (req, res, next) => {
  let client;
  let idempotencyKey;
  let idempotencyHash;
  let solicitudHash;
  let codigoConsulta;
  let comprobante;
  let comprobanteUrl = null;
  try {
    const {
      nombre, telefono, cantidad, metodo_pago, sorteo_id, modalidad_id,
      carton_ids, reservation_token, idempotency_key,
    } = req.body;
    idempotencyKey = idempotency_key;

    if (!nombre || !telefono || !cantidad || !metodo_pago || !sorteo_id || !modalidad_id) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const cantidadTexto = String(cantidad).trim();
    if (!/^\d+$/.test(cantidadTexto)) {
      return res.status(400).json({ error: 'La cantidad debe ser un número entero' });
    }
    const cant = Number(cantidadTexto);
    if (!Number.isSafeInteger(cant) || cant < 1 || cant > MAX_CARTONES_POR_VENTA) {
      return res.status(400).json({ error: `La cantidad debe estar entre 1 y ${MAX_CARTONES_POR_VENTA}` });
    }

    const nombreLimpio = String(nombre).trim();
    const telefonoLimpio = String(telefono).trim();
    if (!nombreLimpio || nombreLimpio.length > 100) {
      return res.status(400).json({ error: 'El nombre debe tener entre 1 y 100 caracteres' });
    }
    const telefonoDigitos = telefonoLimpio.replace(/\D/g, '');
    if (![10, 12].includes(telefonoDigitos.length) || (telefonoDigitos.length === 12 && !telefonoDigitos.startsWith('57'))) {
      return res.status(400).json({ error: 'Ingresa un número de WhatsApp válido' });
    }
    if (!METODOS_PAGO_PUBLICOS.has(metodo_pago)) {
      return res.status(400).json({ error: 'Método de pago inválido' });
    }

    const idsElegidos = parseCartonIds(carton_ids);
    if (idsElegidos === null) return res.status(400).json({ error: 'La selección de boletas no es válida' });
    if (idsElegidos.length > MAX_CARTONES_POR_VENTA || new Set(idsElegidos).size !== idsElegidos.length) {
      return res.status(400).json({ error: `Selecciona hasta ${MAX_CARTONES_POR_VENTA} boletas distintas` });
    }
    if (idsElegidos.length) {
      if (idsElegidos.length !== cant || !isCapability(reservation_token)) {
        return res.status(400).json({ error: 'La selección debe coincidir con la cantidad y tener una reserva vigente' });
      }
    } else if (reservation_token) {
      return res.status(400).json({ error: 'La reserva no corresponde a una selección de boletas' });
    }

    if (!isCapability(idempotencyKey)) {
      return res.status(400).json({ error: 'La clave privada de compra no es válida. Recarga e intenta de nuevo.' });
    }
    idempotencyHash = hashCapability(idempotencyKey);
    solicitudHash = hashRequestFingerprint(JSON.stringify({
      nombre: nombreLimpio,
      telefono: telefonoLimpio,
      cantidad: cant,
      metodo_pago,
      sorteo_id,
      modalidad_id,
      carton_ids: [...idsElegidos].sort(),
    }));

    const { rows: ventasPrevias } = await db.query(`
      SELECT id, estado_pago, total_pagado, idempotency_request_hash,
             comprobante_url, comprobante_public_id
      FROM ventas WHERE idempotency_key_hash = $1
    `, [idempotencyHash]);
    if (ventasPrevias.length) {
      const ventaPrevia = ventasPrevias[0];
      if (ventaPrevia.idempotency_request_hash !== solicitudHash) {
        return res.status(409).json({ error: 'Esta clave ya se usó con otros datos de compra. Inicia un nuevo intento.' });
      }
      if (req.file && !ventaPrevia.comprobante_url && !ventaPrevia.comprobante_public_id) {
        comprobante = await subirArchivo(req.file, { folder: 'bingo/comprobantes', authenticated: true });
        const { rowCount } = await db.query(`
          UPDATE ventas SET comprobante_public_id = $1, comprobante_resource_type = $2,
            comprobante_format = $3 WHERE id = $4 AND comprobante_public_id IS NULL
        `, [comprobante.public_id, comprobante.resource_type, comprobante.format, ventaPrevia.id]);
        if (rowCount === 1) {
          comprobanteUrl = comprobante.secure_url;
          if (comprobante.resource_type === 'image') programarOCR(comprobanteUrl, ventaPrevia.id);
          comprobante = null;
        } else {
          await eliminarArchivo(comprobante.public_id, comprobante.resource_type, true);
          comprobante = null;
        }
      }
      return res.status(200).json({
        message: 'Compra ya registrada.',
        venta_id: ventaPrevia.id,
        codigo_consulta: idempotencyKey,
        total_pagado: Number(ventaPrevia.total_pagado),
        estado: ventaPrevia.estado_pago,
      });
    }

    const { rows: sorteos } = await db.query(
      `SELECT id FROM sorteos WHERE id = $1 AND estado = 'activo' AND eliminado = false`,
      [sorteo_id]
    );
    if (!sorteos.length) return res.status(404).json({ error: 'Sorteo no disponible' });

    const { rows: modalidades } = await db.query(
      `SELECT id, precio_boleta, total_boletas, boletas_vendidas, permite_elegir_numero
       FROM modalidades WHERE id = $1 AND sorteo_id = $2 AND activo = true`,
      [modalidad_id, sorteo_id]
    );
    if (!modalidades.length) return res.status(404).json({ error: 'Modalidad no disponible' });

    const modalidad = modalidades[0];
    if (Boolean(modalidad.permite_elegir_numero) !== (idsElegidos.length > 0)) {
      return res.status(400).json({
        error: modalidad.permite_elegir_numero
          ? 'Selecciona y reserva las boletas que deseas comprar'
          : 'Esta modalidad asigna las boletas automáticamente',
      });
    }

    const precio = Number(modalidad.precio_boleta);
    const precioCentavos = Math.round(precio * 100);
    if (!Number.isSafeInteger(precioCentavos) || precioCentavos <= 0 || precioCentavos * cant > Number.MAX_SAFE_INTEGER) {
      return res.status(400).json({ error: 'El precio de la modalidad no es válido' });
    }
    const totalCentavos = precioCentavos * cant;
    const total = (totalCentavos / 100).toFixed(2);

    // Reutiliza el comprador sin permitir que una compra anónima cambie su nombre.
    let { rows: compradores } = await db.query(`
      INSERT INTO compradores (nombre, telefono)
      VALUES ($1, $2)
      ON CONFLICT (telefono) DO NOTHING
      RETURNING id
    `, [nombreLimpio, telefonoLimpio]);
    if (!compradores.length) {
      compradores = (await db.query('SELECT id FROM compradores WHERE telefono = $1', [telefonoLimpio])).rows;
    }
    if (!compradores.length) throw new Error('No se pudo registrar el comprador');
    const compradorId = compradores[0].id;

    codigoConsulta = idempotencyKey;
    const hashReserva = idsElegidos.length ? hashCapability(reservation_token) : null;
    client = await db.pool.connect();
    let ventaId;
    let ventaEstado = 'pendiente';

    try {
      await client.query('BEGIN');

      if (idsElegidos.length) {
        const { rows: reservados } = await client.query(`
          SELECT id FROM cartones
          WHERE id = ANY($1::uuid[]) AND modalidad_id = $2 AND vendido = false
            AND reservado_venta_id IS NULL
            AND reserva_token_hash = $3 AND reservado_hasta > NOW()
            AND NOT EXISTS (SELECT 1 FROM venta_cartones vc WHERE vc.carton_id = cartones.id)
          FOR UPDATE SKIP LOCKED
        `, [idsElegidos, modalidad_id, hashReserva]);

        if (reservados.length !== cant) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'La reserva venció o alguna boleta ya no está disponible. Selecciónala de nuevo.' });
        }
      }

      const { rows: ventas } = await client.query(`
        INSERT INTO ventas
          (comprador_id, sorteo_id, modalidad_id, cantidad, total_pagado,
           metodo_pago, comprobante_url, comprobante_public_id, comprobante_resource_type,
           comprobante_format, consulta_token_hash, idempotency_key_hash, idempotency_request_hash)
        VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,NULL,NULL,$7,$7,$8)
        RETURNING id, estado_pago, creado_en
      `, [compradorId, sorteo_id, modalidad_id, cant, total, metodo_pago, idempotencyHash, solicitudHash]);
      ventaId = ventas[0].id;
      ventaEstado = ventas[0].estado_pago;

      if (idsElegidos.length) {
        const { rowCount } = await client.query(`
          UPDATE cartones SET reservado_venta_id = $1, reservado_hasta = NULL,
            reserva_token_hash = NULL
          WHERE id = ANY($2::uuid[]) AND reserva_token_hash = $3
        `, [ventaId, idsElegidos, hashReserva]);
        if (rowCount !== cant) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'No se pudo confirmar la reserva. Selecciona las boletas de nuevo.' });
        }
      }

      const asignados = await asignarCartonesAVenta(client, {
        modalidadId: modalidad_id, ventaId, cantidad: cant,
      });
      if (!asignados || asignados.length !== cant) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No hay suficientes boletas disponibles en esta modalidad' });
      }

      await client.query('COMMIT');
    } catch (errTx) {
      await client.query('ROLLBACK');
      throw errTx;
    } finally {
      client.release();
      client = null;
    }

    if (req.file) {
      comprobante = await subirArchivo(req.file, { folder: 'bingo/comprobantes', authenticated: true });
      const { rowCount } = await db.query(`
        UPDATE ventas SET comprobante_public_id = $1, comprobante_resource_type = $2,
          comprobante_format = $3 WHERE id = $4 AND comprobante_public_id IS NULL
      `, [comprobante.public_id, comprobante.resource_type, comprobante.format, ventaId]);
      if (rowCount !== 1) {
        await eliminarArchivo(comprobante.public_id, comprobante.resource_type, true);
        comprobante = null;
      } else {
        comprobanteUrl = comprobante.secure_url;
      }
    }

    // OCR remains asynchronous; the purchase response does not wait for it.
    if (comprobanteUrl && comprobante?.resource_type === 'image') {
      programarOCR(comprobanteUrl, ventaId);
    }

    res.status(201).json({
      message: 'Compra registrada. El administrador revisará tu pago pronto.',
      venta_id: ventaId,
      codigo_consulta: codigoConsulta,
      total_pagado: Number(total),
      estado: ventaEstado,
    });
  } catch (err) {
    if (client) client.release();
    if (comprobante?.public_id) {
      eliminarArchivo(comprobante.public_id, comprobante.resource_type, true)
        .catch(cleanupError => console.error('Cloudinary upload cleanup error:', cleanupError.message));
    }
    if (err.code === '23505' && idempotencyHash && solicitudHash) {
      try {
        const { rows } = await db.query(`
          SELECT id, estado_pago, total_pagado, idempotency_request_hash
          FROM ventas WHERE idempotency_key_hash = $1
        `, [idempotencyHash]);
        if (rows.length && rows[0].idempotency_request_hash === solicitudHash) {
          if (comprobante?.public_id) {
            eliminarArchivo(comprobante.public_id, comprobante.resource_type, true)
              .catch(cleanupError => console.error('Cloudinary duplicate cleanup error:', cleanupError.message));
          }
          return res.status(200).json({
            message: 'Compra ya registrada.',
            venta_id: rows[0].id,
            codigo_consulta: codigoConsulta,
            total_pagado: Number(rows[0].total_pagado),
            estado: rows[0].estado_pago,
          });
        }
      } catch (recoveryError) {
        return next(recoveryError);
      }
    }
    next(err);
  }
});

// GET /api/ventas/:id — estado de compra protegido por el código privado entregado al comprador.
router.get('/:id', async (req, res, next) => {
  try {
    const codigoConsulta = req.get('x-consulta-token');
    if (!isCapability(codigoConsulta)) return res.status(401).json({ error: 'Código de consulta requerido' });

    const { rows } = await db.query(`
      SELECT v.id, v.cantidad, v.total_pagado, v.estado_pago, v.metodo_pago, v.creado_en,
             s.nombre AS sorteo_nombre, s.fecha_sorteo, m.nombre AS modalidad_nombre,
             m.tipo_boleta
      FROM ventas v
      JOIN sorteos s ON s.id = v.sorteo_id
      LEFT JOIN modalidades m ON m.id = v.modalidad_id
      WHERE v.id = $1 AND v.consulta_token_hash = $2
    `, [req.params.id, hashCapability(codigoConsulta)]);

    if (!rows.length) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
