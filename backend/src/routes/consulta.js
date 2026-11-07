const router = require('express').Router();
const db = require('../config/db');
const { hashCapability, isCapability } = require('../services/capabilities');

// GET /api/consulta?q=<código privado de compra o código de boleta>
router.get('/', async (req, res, next) => {
  try {
    const termino = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (termino.length < 3 || termino.length > 64) {
      return res.status(400).json({ error: 'Ingresa el código privado de consulta o el código exacto de una boleta' });
    }

    if (/^\+?[\d\s().-]{10,}$/.test(termino)) {
      return res.status(400).json({ error: 'Por privacidad, consulta con el código privado que aparece al registrar tu compra' });
    }

    if (isCapability(termino)) {
      const { rows } = await db.query(`
        SELECT c.codigo_unico, c.pdf_url, c.numeros,
               s.nombre AS sorteo, s.fecha_sorteo, s.premio_descripcion,
               v.estado_pago
        FROM ventas v
        JOIN sorteos s ON s.id = v.sorteo_id
        LEFT JOIN venta_cartones vc ON vc.venta_id = v.id
        LEFT JOIN cartones c ON c.id = vc.carton_id
        WHERE v.consulta_token_hash = $1
        ORDER BY c.codigo_unico
      `, [hashCapability(termino)]);

      if (!rows.length) return res.status(404).json({ error: 'Código de consulta incorrecto' });
      const resultados = rows.filter(row => row.codigo_unico);
      return res.json({ tipo: 'compra', estado_pago: rows[0].estado_pago, resultados });
    }

    // El código exacto permite consultar el estado y los números, sin revelar
    // datos del comprador ni el enlace privado del PDF.
    const { rows } = await db.query(`
      SELECT c.codigo_unico, c.numeros,
             s.nombre AS sorteo, s.fecha_sorteo, s.premio_descripcion,
             v.estado_pago
      FROM cartones c
      JOIN sorteos s ON s.id = c.sorteo_id
      LEFT JOIN venta_cartones vc ON vc.carton_id = c.id
      LEFT JOIN ventas v ON v.id = vc.venta_id
      WHERE UPPER(c.codigo_unico) = UPPER($1)
    `, [termino]);

    if (rows.length) return res.json({ tipo: 'codigo', resultados: rows });
    return res.status(404).json({ error: 'No encontramos ninguna boleta con ese código' });
  } catch (err) { next(err); }
});

module.exports = router;
