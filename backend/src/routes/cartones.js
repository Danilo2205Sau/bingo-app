const router  = require('express').Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const upload  = require('../middleware/upload');
const { generarCartonPDF } = require('../services/pdfGenerator');
const { v4: uuidv4 } = require('uuid');

// POST /api/cartones/generar — generar N cartones automáticos para un sorteo
router.post('/generar', auth, async (req, res, next) => {
  try {
    const { sorteo_id, cantidad } = req.body;
    if (!sorteo_id || !cantidad)
      return res.status(400).json({ error: 'sorteo_id y cantidad requeridos' });

    const cant = parseInt(cantidad);
    const generados = [];

    for (let i = 0; i < cant; i++) {
      const codigo = generarCodigo();
      const numeros = generarMatrizBingo();
      const { pdfUrl } = await generarCartonPDF({ codigo, numeros, sorteo_id });

      const { rows } = await db.query(`
        INSERT INTO cartones (sorteo_id, codigo_unico, numeros, pdf_url, tipo)
        VALUES ($1,$2,$3,$4,'generado')
        RETURNING id, codigo_unico
      `, [sorteo_id, codigo, JSON.stringify(numeros), pdfUrl]);

      generados.push(rows[0]);
    }

    res.status(201).json({ message: `${cant} cartones generados`, cartones: generados });
  } catch (err) { next(err); }
});

// POST /api/cartones/subir — subir un PDF ya hecho
router.post('/subir', auth, upload.single('pdf'), async (req, res, next) => {
  try {
    const { sorteo_id } = req.body;
    if (!sorteo_id || !req.file)
      return res.status(400).json({ error: 'sorteo_id y archivo PDF requeridos' });

    const codigo = generarCodigo();
    const { rows } = await db.query(`
      INSERT INTO cartones (sorteo_id, codigo_unico, pdf_url, tipo)
      VALUES ($1,$2,$3,'subido')
      RETURNING id, codigo_unico
    `, [sorteo_id, codigo, req.file.path]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/cartones/:codigo — obtener info de un cartón por código
router.get('/:codigo', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT c.id, c.codigo_unico, c.numeros, c.pdf_url, c.vendido,
             s.nombre AS sorteo_nombre, s.fecha_sorteo, s.premio_descripcion,
             comp.nombre AS comprador_nombre
      FROM cartones c
      JOIN sorteos s ON s.id = c.sorteo_id
      LEFT JOIN venta_cartones vc ON vc.carton_id = c.id
      LEFT JOIN ventas v ON v.id = vc.venta_id
      LEFT JOIN compradores comp ON comp.id = v.comprador_id
      WHERE c.codigo_unico = $1
    `, [req.params.codigo.toUpperCase()]);

    if (!rows.length) return res.status(404).json({ error: 'Cartón no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Helpers ────────────────────────────────────────────────────

function generarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 8; i++) {
    codigo += chars[Math.floor(Math.random() * chars.length)];
  }
  return codigo;
}

function generarMatrizBingo() {
  // Bingo clásico 5x5: B(1-15) I(16-30) N(31-45) G(46-60) O(61-75)
  // Centro libre (null)
  const rangos = [
    [1,15], [16,30], [31,45], [46,60], [61,75]
  ];
  const matriz = [];
  for (let col = 0; col < 5; col++) {
    const [min, max] = rangos[col];
    const nums = shuffle(range(min, max)).slice(0, 5);
    for (let row = 0; row < 5; row++) {
      if (!matriz[row]) matriz[row] = [];
      matriz[row][col] = (col === 2 && row === 2) ? null : nums[row];
    }
  }
  return matriz;
}

function range(min, max) {
  const arr = [];
  for (let i = min; i <= max; i++) arr.push(i);
  return arr;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = router;
