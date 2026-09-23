const router  = require('express').Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const upload  = require('../middleware/upload');
const { v4: uuidv4 } = require('uuid');
const { generarBoleta, generarCodigo } = require('../services/ticketGenerator');

// POST /api/cartones/generar — generar N boletas para una modalidad (bingo o rifa)
router.post('/generar', auth, async (req, res, next) => {
  try {
    const { modalidad_id, cantidad } = req.body;
    if (!modalidad_id || !cantidad)
      return res.status(400).json({ error: 'modalidad_id y cantidad requeridos' });

    const cant = parseInt(cantidad);
    if (!Number.isInteger(cant) || cant < 1)
      return res.status(400).json({ error: 'La cantidad debe ser un número mayor a 0' });

    const { rows: modRows } = await db.query(
      'SELECT * FROM modalidades WHERE id = $1', [modalidad_id]
    );
    if (!modRows.length)
      return res.status(404).json({ error: 'Modalidad no encontrada' });
    const modalidad = modRows[0];

    const { rows: countRows } = await db.query(
      'SELECT COUNT(*)::int AS total FROM cartones WHERE modalidad_id = $1', [modalidad_id]
    );
    const yaGenerados = countRows[0].total;
    const disponiblesParaGenerar = modalidad.total_boletas - yaGenerados;

    // Si se pide más de lo que queda en el tope actual, el tope se amplía
    // automáticamente (en vez de bloquear la generación con un error)
    if (cant > disponiblesParaGenerar) {
      const nuevoTotal = yaGenerados + cant;
      await db.query('UPDATE modalidades SET total_boletas = $1 WHERE id = $2', [nuevoTotal, modalidad_id]);
      modalidad.total_boletas = nuevoTotal;
    }

    const generados = [];

        for (let i = 0; i < cant; i++) {
      let insertado = null;
      let intentos = 0;

      // Reintenta si el código (= número, en rifa) ya existe — evita choques
      while (!insertado && intentos < 20) {
        intentos++;
        const { numeros, codigoSugerido } = generarBoleta(modalidad, yaGenerados + i);
        const codigo = codigoSugerido || generarCodigo();

        const { rows } = await db.query(`
          INSERT INTO cartones (sorteo_id, modalidad_id, tipo_boleta, codigo_unico, numeros, pdf_url, tipo)
          VALUES ($1,$2,$3,$4,$5,NULL,'generado')
          ON CONFLICT (codigo_unico) DO NOTHING
          RETURNING id, codigo_unico
        `, [modalidad.sorteo_id, modalidad_id, modalidad.tipo_boleta, codigo, JSON.stringify(numeros)]);

        if (rows.length) insertado = rows[0];
      }

      if (!insertado) {
        return res.status(500).json({ error: `No se pudo generar un código único para la boleta ${i + 1} tras 20 intentos. Prueba con más dígitos en la configuración de la rifa.` });
      }
      generados.push(insertado);
    }

    res.status(201).json({ message: `${cant} boleta(s) generada(s)`, cartones: generados });
  } catch (err) { next(err); }
});

// POST /api/cartones/subir — subir un PDF ya hecho
router.post('/subir', auth, upload.single('pdf'), async (req, res, next) => {
  try {
    const { sorteo_id, modalidad_id } = req.body;
    if (!sorteo_id || !req.file)
      return res.status(400).json({ error: 'sorteo_id y archivo PDF requeridos' });

    const codigo = generarCodigo();
    const { rows } = await db.query(`
      INSERT INTO cartones (sorteo_id, modalidad_id, codigo_unico, pdf_url, tipo)
      VALUES ($1,$2,$3,$4,'subido')
      RETURNING id, codigo_unico
    `, [sorteo_id, modalidad_id || null, codigo, req.file.path]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/cartones/disponibles/:modalidadId — números disponibles para elegir
// (excluye vendidos y los que están reservados activamente por otra persona)
router.get('/disponibles/:modalidadId', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT id, codigo_unico, numeros
      FROM cartones
      WHERE modalidad_id = $1
        AND vendido = false
        AND (reservado_hasta IS NULL OR reservado_hasta < NOW())
      ORDER BY numeros::text ASC
    `, [req.params.modalidadId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/cartones/reservar — reservar boletas específicas por 20 minutos
// body: { modalidad_id, carton_ids: ["uuid1","uuid2"] }
router.post('/reservar', async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const { modalidad_id, carton_ids } = req.body;
    if (!modalidad_id || !Array.isArray(carton_ids) || !carton_ids.length)
      return res.status(400).json({ error: 'modalidad_id y carton_ids (array) requeridos' });

    await client.query('BEGIN');

    const { rows: disponibles } = await client.query(`
      SELECT id, codigo_unico, numeros FROM cartones
      WHERE id = ANY($1::uuid[]) AND modalidad_id = $2
        AND vendido = false
        AND (reservado_hasta IS NULL OR reservado_hasta < NOW())
      FOR UPDATE SKIP LOCKED
    `, [carton_ids, modalidad_id]);

    if (disponibles.length < carton_ids.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Uno o más números que elegiste ya no están disponibles (alguien más los tomó). Elige otros.',
        disponibles: disponibles.map(d => d.id),
      });
    }

    const expiraEn = new Date(Date.now() + 20 * 60 * 1000); // 20 minutos
    await client.query(`
      UPDATE cartones SET reservado_hasta = $1
      WHERE id = ANY($2::uuid[])
    `, [expiraEn, carton_ids]);

    await client.query('COMMIT');
    res.json({
      message: 'Números reservados por 20 minutos. Completa tu compra antes de que expire.',
      expira_en: expiraEn,
      cartones: disponibles,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/cartones/:codigo — obtener info de un cartón por código
router.get('/:codigo', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT c.id, c.codigo_unico, c.numeros, c.pdf_url, c.vendido, c.tipo_boleta,
             s.nombre AS sorteo_nombre, s.fecha_sorteo, s.premio_descripcion,
             m.nombre AS modalidad_nombre, m.metodo_resultado, m.fuente_resultado,
             comp.nombre AS comprador_nombre
      FROM cartones c
      JOIN sorteos s ON s.id = c.sorteo_id
      LEFT JOIN modalidades m ON m.id = c.modalidad_id
      LEFT JOIN venta_cartones vc ON vc.carton_id = c.id
      LEFT JOIN ventas v ON v.id = vc.venta_id
      LEFT JOIN compradores comp ON comp.id = v.comprador_id
      WHERE c.codigo_unico = $1
    `, [req.params.codigo.toUpperCase()]);

    if (!rows.length) return res.status(404).json({ error: 'Cartón no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;