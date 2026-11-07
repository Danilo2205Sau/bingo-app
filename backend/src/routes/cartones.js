const router  = require('express').Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const upload  = require('../middleware/upload');
const { generarBoleta, generarCodigo } = require('../services/ticketGenerator');
const { createCapability, hashCapability } = require('../services/capabilities');
const { subirArchivo } = require('../services/cloudinary');

// POST /api/cartones/generar — generar N boletas para una modalidad (bingo o rifa)
router.post('/generar', auth, async (req, res, next) => {
  let client;
  let transaccionIniciada = false;
  try {
    const { modalidad_id, cantidad } = req.body;
    if (!modalidad_id || !cantidad)
      return res.status(400).json({ error: 'modalidad_id y cantidad requeridos' });

    const cantidadTexto = String(cantidad).trim();
    if (!/^\d+$/.test(cantidadTexto))
      return res.status(400).json({ error: 'La cantidad debe ser un entero válido' });
    const cant = Number(cantidadTexto);
    if (!Number.isSafeInteger(cant) || cant < 1 || cant > 5000)
      return res.status(400).json({ error: 'La cantidad debe estar entre 1 y 5.000 boletas por solicitud' });

    client = await db.pool.connect();
    await client.query('BEGIN');
    transaccionIniciada = true;

    const { rows: modRows } = await client.query(
      'SELECT * FROM modalidades WHERE id = $1 FOR UPDATE', [modalidad_id]
    );
    if (!modRows.length)
    {
      await client.query('ROLLBACK');
      transaccionIniciada = false;
      return res.status(404).json({ error: 'Modalidad no encontrada' });
    }
    const modalidad = modRows[0];

    const { rows: countRows } = await client.query(
      'SELECT COUNT(*)::int AS total FROM cartones WHERE modalidad_id = $1', [modalidad_id]
    );
    const yaGenerados = countRows[0].total;
    const disponiblesParaGenerar = modalidad.total_boletas - yaGenerados;

    if (yaGenerados + cant > 2147483647) {
      await client.query('ROLLBACK');
      transaccionIniciada = false;
      return res.status(409).json({ error: 'La modalidad alcanzó el límite de boletas permitido' });
    }

    // Si se pide más de lo que queda en el tope actual, el tope se amplía
    // automáticamente dentro de la misma transacción que genera los cartones.
    if (cant > disponiblesParaGenerar) {
      const nuevoTotal = yaGenerados + cant;
      await client.query('UPDATE modalidades SET total_boletas = $1 WHERE id = $2', [nuevoTotal, modalidad_id]);
      modalidad.total_boletas = nuevoTotal;
    }

    const generados = [];
    let indiceSecuencial = yaGenerados;
    const maxRondas = Math.ceil(cant / 250) + 20;

    for (let ronda = 0; generados.length < cant && ronda < maxRondas; ronda++) {
      const faltan = Math.min(250, cant - generados.length);
      const candidatos = new Map();
      let intentos = 0;
      while (candidatos.size < faltan && intentos < faltan * 20) {
        intentos++;
        const { numeros, codigoSugerido } = generarBoleta(modalidad, indiceSecuencial++);
        const codigo = String(codigoSugerido || generarCodigo());
        if (!candidatos.has(codigo)) candidatos.set(codigo, JSON.stringify(numeros));
      }
      if (!candidatos.size) break;

      const { rows } = await client.query(`
        INSERT INTO cartones (sorteo_id, modalidad_id, tipo_boleta, codigo_unico, numeros, pdf_url, tipo)
        SELECT $1, $2, $3, lote.codigo, lote.numeros::jsonb, NULL, 'generado'
        FROM unnest($4::text[], $5::text[]) AS lote(codigo, numeros)
        ON CONFLICT (codigo_unico) DO NOTHING
        RETURNING id, codigo_unico
      `, [
        modalidad.sorteo_id,
        modalidad_id,
        modalidad.tipo_boleta,
        [...candidatos.keys()],
        [...candidatos.values()],
      ]);
      generados.push(...rows);
    }

    if (generados.length !== cant) {
      await client.query('ROLLBACK');
      transaccionIniciada = false;
      return res.status(409).json({
        error: `Solo se pudieron generar ${generados.length} de ${cant} boletas. Revisa la configuración de números de la rifa.`,
      });
    }

    await client.query('COMMIT');
    transaccionIniciada = false;
    res.status(201).json({ message: `${cant} boleta(s) generada(s)`, cartones: generados });
  } catch (err) {
    if (transaccionIniciada) await client.query('ROLLBACK').catch(() => {});
    if (err.code === 'INVALID_RAFFLE_CONFIG') return res.status(400).json({ error: err.message });
    if (err.code === 'RAFFLE_NUMBERS_EXHAUSTED') return res.status(409).json({ error: err.message });
    next(err);
  } finally {
    client?.release();
  }
});

// POST /api/cartones/subir — subir un PDF ya hecho
router.post('/subir', auth, upload.single('pdf'), async (req, res, next) => {
  try {
    const { sorteo_id, modalidad_id } = req.body;
    if (!sorteo_id || !req.file)
      return res.status(400).json({ error: 'sorteo_id y archivo PDF requeridos' });

    const archivo = await subirArchivo(req.file, { folder: 'bingo/cartones', authenticated: true });
    const codigo = generarCodigo();
    const { rows } = await db.query(`
      INSERT INTO cartones (sorteo_id, modalidad_id, codigo_unico, pdf_url, tipo)
      VALUES ($1,$2,$3,$4,'subido')
      RETURNING id, codigo_unico
    `, [sorteo_id, modalidad_id || null, codigo, archivo.secure_url]);

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
        AND reservado_venta_id IS NULL
        AND (reserva_token_hash IS NULL OR reservado_hasta <= NOW())
        AND id NOT IN (SELECT carton_id FROM venta_cartones)
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
    if (carton_ids.length > 10 || new Set(carton_ids).size !== carton_ids.length ||
        carton_ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
      return res.status(400).json({ error: 'Selecciona hasta 10 boletas distintas y válidas' });
    }

    const { rows: modalidad } = await db.query(
      'SELECT id FROM modalidades WHERE id = $1 AND activo = true AND permite_elegir_numero = true',
      [modalidad_id]
    );
    if (!modalidad.length) return res.status(404).json({ error: 'Modalidad no disponible para elegir boletas' });

    const token = createCapability();
    const tokenHash = hashCapability(token);

    await client.query('BEGIN');

    const { rows: disponibles } = await client.query(`
      SELECT id, codigo_unico, numeros FROM cartones
      WHERE id = ANY($1::uuid[]) AND modalidad_id = $2
        AND vendido = false
        AND reservado_venta_id IS NULL
        AND (reserva_token_hash IS NULL OR reservado_hasta <= NOW())
        AND id NOT IN (SELECT carton_id FROM venta_cartones)
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
    const { rowCount } = await client.query(`
      UPDATE cartones SET reservado_hasta = $1, reserva_token_hash = $2
      WHERE id = ANY($3::uuid[]) AND vendido = false AND reservado_venta_id IS NULL
    `, [expiraEn, tokenHash, carton_ids]);
    if (rowCount !== carton_ids.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No se pudo reservar la selección. Elige las boletas de nuevo.' });
    }

    await client.query('COMMIT');
    res.json({
      message: 'Números reservados por 20 minutos. Completa tu compra antes de que expire.',
      expira_en: expiraEn,
      reservation_token: token,
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
      SELECT c.id, c.codigo_unico, c.numeros, c.vendido, c.tipo_boleta,
             s.nombre AS sorteo_nombre, s.fecha_sorteo, s.premio_descripcion,
             m.nombre AS modalidad_nombre, m.metodo_resultado, m.fuente_resultado
      FROM cartones c
      JOIN sorteos s ON s.id = c.sorteo_id
      LEFT JOIN modalidades m ON m.id = c.modalidad_id
      WHERE c.codigo_unico = $1
    `, [req.params.codigo.toUpperCase()]);

    if (!rows.length) return res.status(404).json({ error: 'Cartón no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
