const router = require('express').Router();
const db     = require('../config/db');
const auth   = require('../middleware/auth');

// GET /api/sorteos/activo — sorteo activo para la página pública
router.get('/activo', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT id, nombre, descripcion, fecha_sorteo, precio_boleta,
             total_cartones, cartones_vendidos, premio_descripcion, imagen_url
      FROM sorteos
      WHERE estado = 'activo'
      ORDER BY creado_en DESC
      LIMIT 1
    `);
    if (!rows.length)
      return res.status(404).json({ error: 'No hay sorteo activo en este momento' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/sorteos — todos (solo admin)
router.get('/', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT s.*,
             COALESCE(c.total_generados, 0) AS cartones_generados
      FROM sorteos s
      LEFT JOIN (
        SELECT sorteo_id, COUNT(*) AS total_generados
        FROM cartones
        GROUP BY sorteo_id
      ) c ON c.sorteo_id = s.id
      ORDER BY s.creado_en DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/sorteos — crear sorteo (solo admin)
router.post('/', auth, async (req, res, next) => {
  try {
    const {
      nombre, descripcion, fecha_sorteo, precio_boleta,
      total_cartones, premio_descripcion
    } = req.body;

    if (!nombre || !fecha_sorteo || !precio_boleta || !total_cartones)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    const { rows } = await db.query(`
      INSERT INTO sorteos
        (nombre, descripcion, fecha_sorteo, precio_boleta, total_cartones, premio_descripcion)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [nombre, descripcion, fecha_sorteo, precio_boleta, total_cartones, premio_descripcion]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/sorteos/:id/estado — cambiar estado (solo admin)
router.patch('/:id/estado', auth, async (req, res, next) => {
  try {
    const { estado } = req.body;
    const validos = ['borrador', 'activo', 'cerrado', 'finalizado'];
    if (!validos.includes(estado))
      return res.status(400).json({ error: 'Estado inválido' });

    const { rows } = await db.query(
      'UPDATE sorteos SET estado=$1, actualizado_en=NOW() WHERE id=$2 RETURNING *',
      [estado, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Sorteo no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
