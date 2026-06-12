const router = require('express').Router();
const db     = require('../config/db');

// GET /api/consulta?q=3101234567  (teléfono o código de cartón)
router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 4)
      return res.status(400).json({ error: 'Ingresa tu número de teléfono o código de boleta' });

    const termino = q.trim();

    // Buscar por código de cartón
    const { rows: porCodigo } = await db.query(`
      SELECT c.codigo_unico, c.pdf_url, c.numeros,
             s.nombre AS sorteo, s.fecha_sorteo, s.premio_descripcion,
             comp.nombre AS comprador, v.estado_pago
      FROM cartones c
      JOIN sorteos s        ON s.id = c.sorteo_id
      LEFT JOIN venta_cartones vc ON vc.carton_id = c.id
      LEFT JOIN ventas v    ON v.id = vc.venta_id
      LEFT JOIN compradores comp ON comp.id = v.comprador_id
      WHERE UPPER(c.codigo_unico) = UPPER($1)
    `, [termino]);

    if (porCodigo.length) return res.json({ tipo: 'codigo', resultados: porCodigo });

    // Buscar por teléfono
    const { rows: porTelefono } = await db.query(`
      SELECT c.codigo_unico, c.pdf_url,
             s.nombre AS sorteo, s.fecha_sorteo, s.premio_descripcion,
             comp.nombre AS comprador, v.estado_pago, v.creado_en
      FROM compradores comp
      JOIN ventas v         ON v.comprador_id = comp.id
      JOIN sorteos s        ON s.id = v.sorteo_id
      JOIN venta_cartones vc ON vc.venta_id = v.id
      JOIN cartones c       ON c.id = vc.carton_id
      WHERE comp.telefono LIKE $1
      ORDER BY v.creado_en DESC
    `, [`%${termino}%`]);

    if (porTelefono.length) return res.json({ tipo: 'telefono', resultados: porTelefono });

    res.status(404).json({ error: 'No encontramos ninguna boleta con ese dato' });
  } catch (err) { next(err); }
});

module.exports = router;
