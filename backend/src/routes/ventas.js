const router   = require('express').Router();
const db       = require('../config/db');
const { subirArchivo } = require('../services/cloudinary');
const { extraerDatosComprobante } = require('../services/ocrService');
const upload   = require('../middleware/upload');

// POST /api/ventas — crear una venta (comprador llena el formulario)
router.post('/', upload.single('comprobante'), async (req, res, next) => {
  try {
    const { nombre, telefono, cantidad, metodo_pago, sorteo_id,
        referencia_pago, nombre_titular, monto_declarado } = req.body;

    if (!nombre || !telefono || !cantidad || !metodo_pago || !sorteo_id)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    // Verificar sorteo activo y disponibilidad
    const { rows: sorteos } = await db.query(`
      SELECT id, precio_boleta, total_cartones, cartones_vendidos
      FROM sorteos WHERE id = $1 AND estado = 'activo'
    `, [sorteo_id]);

    if (!sorteos.length)
      return res.status(404).json({ error: 'Sorteo no disponible' });

    const sorteo = sorteos[0];
    const cant = parseInt(cantidad);
    const disponibles = sorteo.total_cartones - sorteo.cartones_vendidos;

    if (cant > disponibles)
      return res.status(409).json({
        error: `Solo quedan ${disponibles} boletas disponibles`
      });

    const total = parseFloat(sorteo.precio_boleta) * cant;

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

    const { rows: venta } = await db.query(`
      INSERT INTO ventas
        (comprador_id, sorteo_id, cantidad, total_pagado, metodo_pago, comprobante_url)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id, estado_pago, creado_en
    `, [comprador_id, sorteo_id, cant, total, metodo_pago, comprobante_url]);

    const ventaId = venta[0].id;

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
             s.nombre AS sorteo_nombre, s.fecha_sorteo
      FROM ventas v
      JOIN compradores c ON c.id = v.comprador_id
      JOIN sorteos s     ON s.id = v.sorteo_id
      WHERE v.id = $1
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
