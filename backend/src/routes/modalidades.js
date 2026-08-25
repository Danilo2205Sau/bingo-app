const router = require('express').Router();
const db     = require('../config/db');
const auth   = require('../middleware/auth');

// GET /api/modalidades/sorteo/:sorteoId — modalidades activas de un sorteo (público)
router.get('/sorteo/:sorteoId', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT id, tipo_boleta, nombre, precio_boleta, total_boletas, boletas_vendidas,
             config, metodo_resultado, fuente_resultado
      FROM modalidades
      WHERE sorteo_id = $1 AND activo = true
      ORDER BY creado_en ASC
    `, [req.params.sorteoId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/modalidades — crear modalidad para un sorteo (solo admin)
router.post('/', auth, async (req, res, next) => {
  try {
    const {
      sorteo_id, tipo_boleta, nombre, precio_boleta, total_boletas,
      config, metodo_resultado, fuente_resultado,
    } = req.body;

    if (!sorteo_id || !tipo_boleta || !nombre || !precio_boleta || !total_boletas)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    if (!['bingo', 'rifa'].includes(tipo_boleta))
      return res.status(400).json({ error: 'tipo_boleta debe ser "bingo" o "rifa"' });

    if (tipo_boleta === 'rifa') {
      const c = config || {};
      if (!c.digitos || !c.cantidad_numeros) {
        return res.status(400).json({
          error: 'Para rifa, config debe incluir digitos y cantidad_numeros, ej: {"digitos":3,"cantidad_numeros":1,"modo":"aleatorio"}'
        });
      }
    }

    const { rows } = await db.query(`
      INSERT INTO modalidades
        (sorteo_id, tipo_boleta, nombre, precio_boleta, total_boletas, config, metodo_resultado, fuente_resultado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [
      sorteo_id, tipo_boleta, nombre, precio_boleta, total_boletas,
      JSON.stringify(config || {}), metodo_resultado || null, fuente_resultado || null,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/modalidades/:sorteoId/todas — todas (incluye inactivas, solo admin)
router.get('/:sorteoId/todas', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT * FROM modalidades WHERE sorteo_id = $1 ORDER BY creado_en ASC
    `, [req.params.sorteoId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// PATCH /api/modalidades/:id — editar (solo admin)
router.patch('/:id', auth, async (req, res, next) => {
  try {
    const { nombre, precio_boleta, total_boletas, activo, fuente_resultado, permite_elegir_numero } = req.body;
    const { rows } = await db.query(`
      UPDATE modalidades SET
        nombre                 = COALESCE($1, nombre),
        precio_boleta          = COALESCE($2, precio_boleta),
        total_boletas          = COALESCE($3, total_boletas),
        activo                 = COALESCE($4, activo),
        fuente_resultado       = COALESCE($5, fuente_resultado),
        permite_elegir_numero  = COALESCE($6, permite_elegir_numero)
      WHERE id = $7
      RETURNING *
    `, [nombre, precio_boleta, total_boletas, activo, fuente_resultado, permite_elegir_numero, req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Modalidad no encontrada' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;