const router   = require('express').Router();
const db       = require('../config/db');
const { extraerDatosComprobante } = require('../services/ocrService');
const { asignarCartonesAVenta } = require('../services/asignacion');
const upload   = require('../middleware/upload');

// POST /api/ventas — crear una venta (comprador llena el formulario)
router.post('/', upload.single('comprobante'), async (req, res, next) => {
  try {
    const { nombre, telefono, cantidad, metodo_pago, sorteo_id, modalidad_id,
        referencia_pago, nombre_titular, monto_declarado, carton_ids } = req.body;

    if (!nombre || !telefono || !cantidad || !metodo_pago || !sorteo_id || !modalidad_id)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    // Verificar sorteo activo
    const { rows: sorteos } = await db.query(
      `SELECT id FROM sorteos WHERE id = $1 AND estado = 'activo'`, [sorteo_id]
    );
    if (!sorteos.length)
      return res.status(404).json({ error: 'Sorteo no disponible' });

    // Verificar modalidad y disponibilidad
    const { rows: modalidades } = await db.query(
      `SELECT id, precio_boleta, total_boletas, boletas_vendidas
       FROM modalidades WHERE id = $1 AND sorteo_id = $2 AND activo = true`,
      [modalidad_id, sorteo_id]
    );
    if (!modalidades.length)
      return res.status(404).json({ error: 'Modalidad no disponible' });

    const modalidad = modalidades[0];
    const cant = parseInt(cantidad);
    const disponibles = modalidad.total_boletas - modalidad.boletas_vendidas;

    if (cant > disponibles)
      return res.status(409).json({
        error: `Solo quedan ${disponibles} boleta(s) disponibles en esta modalidad`
      });

    const total = parseFloat(modalidad.precio_boleta) * cant;

    // Upsert comprador (si el teléfono ya existe, reutilizamos)
    const { rows: comp } = await db.query(`
      INSERT INTO compradores (nombre, telefono)
      VALUES ($1, $2)
      ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre
      RETURNING id
    `, [nombre.trim(), telefono.trim()]);

    const comprador_id = comp[0].id;

    // Subir comprobante a Cloudinary si viene archivo
    let comprobante_url = null;
    if (req.file) {
      comprobante_url = req.file.path;
    }

      const client = await db.pool.connect();
    let ventaId;
    try {
      await client.query('BEGIN');

      const { rows: venta } = await client.query(`
        INSERT INTO ventas
          (comprador_id, sorteo_id, modalidad_id, cantidad, total_pagado, metodo_pago, comprobante_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id, estado_pago, creado_en
      `, [comprador_id, sorteo_id, modalidad_id, cant, total, metodo_pago, comprobante_url]);
      ventaId = venta[0].id;

      // Si el comprador eligió números específicos, vincularlos primero
      let idsElegidos = [];
      if (carton_ids) {
        try { idsElegidos = typeof carton_ids === 'string' ? JSON.parse(carton_ids) : carton_ids; }
        catch { idsElegidos = []; }
      }
      if (Array.isArray(idsElegidos) && idsElegidos.length) {
        await client.query(`
          UPDATE cartones SET reservado_venta_id = $1, reservado_hasta = NULL
          WHERE id = ANY($2::uuid[]) AND modalidad_id = $3 AND vendido = false
        `, [ventaId, idsElegidos, modalidad_id]);
      }

      // Asignar (y dejar visibles de inmediato) los cartones de esta venta
      const asignados = await asignarCartonesAVenta(client, { modalidadId: modalidad_id, ventaId, cantidad: cant });
      if (!asignados) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No hay suficientes boletas disponibles en esta modalidad' });
      }

      await client.query('COMMIT');
    } catch (errTx) {
      await client.query('ROLLBACK');
      throw errTx;
    } finally {
      client.release();
    }

    // OCR asíncrono — no bloquea la respuesta al comprador
    if (comprobante_url) {
      extraerDatosComprobante(comprobante_url).then(datos => {
        return db.query(`
          UPDATE ventas SET
            referencia_pago   = $1,
            nombre_titular    = $2,
            monto_declarado   = $3,
            banco_origen      = $4,
            fecha_transaccion = $5
          WHERE id = $6
        `, [
          datos.referencia_pago,
          datos.nombre_titular,
          datos.monto_declarado,
          datos.banco_origen,
          datos.fecha_transaccion,
          ventaId,
        ]);
      }).catch(e => console.error('OCR async error:', e));
    }

    res.status(201).json({
      message: 'Compra registrada. El administrador revisará tu pago pronto.',
      venta_id: venta[0].id,
      total_pagado: total,
      estado: venta[0].estado_pago,
    });
  } catch (err) { next(err); }
});

// GET /api/ventas/:id — estado de una venta
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT v.id, v.cantidad, v.total_pagado, v.estado_pago,
             v.metodo_pago, v.creado_en,
             c.nombre AS comprador_nombre,
             s.nombre AS sorteo_nombre, s.fecha_sorteo,
             m.nombre AS modalidad_nombre, m.tipo_boleta
      FROM ventas v
      JOIN compradores c ON c.id = v.comprador_id
      JOIN sorteos s     ON s.id = v.sorteo_id
      LEFT JOIN modalidades m ON m.id = v.modalidad_id
      WHERE v.id = $1
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;