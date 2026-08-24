const router      = require('express').Router();
const db          = require('../config/db');
const auth        = require('../middleware/auth');
const uploadPremio = require('../middleware/uploadPremio');
const { generarBoleta, generarCodigo } = require('../services/ticketGenerator');

// ── PÚBLICO ──────────────────────────────────────────────────────

// GET /api/sorteos/activos — TODOS los sorteos activos (no solo uno), para la página pública
router.get('/activos', async (req, res, next) => {
  try {
    const { rows: sorteos } = await db.query(`
      SELECT id, nombre, descripcion, fecha_sorteo, premio_descripcion,
             imagen_premio_url, descripcion_premio
      FROM sorteos
      WHERE estado = 'activo' AND eliminado = false
      ORDER BY fecha_sorteo ASC
    `);

    if (!sorteos.length) return res.json([]);

    const { rows: modalidades } = await db.query(`
      SELECT id, sorteo_id, tipo_boleta, nombre, precio_boleta,
             total_boletas, boletas_vendidas, permite_elegir_numero,
             metodo_resultado, fuente_resultado
      FROM modalidades
      WHERE sorteo_id = ANY($1::uuid[]) AND activo = true
      ORDER BY creado_en ASC
    `, [sorteos.map(s => s.id)]);

    const resultado = sorteos.map(s => ({
      ...s,
      modalidades: modalidades.filter(m => m.sorteo_id === s.id),
    }));

    res.json(resultado);
  } catch (err) { next(err); }
});

// Compatibilidad con el frontend anterior (un solo sorteo activo)
router.get('/activo', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT id, nombre, descripcion, fecha_sorteo, premio_descripcion, imagen_premio_url
      FROM sorteos WHERE estado = 'activo' AND eliminado = false
      ORDER BY creado_en DESC LIMIT 1
    `);
    if (!rows.length) return res.status(404).json({ error: 'No hay sorteo activo en este momento' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── ADMIN ────────────────────────────────────────────────────────

// GET /api/sorteos — listar todos los eventos NO eliminados (admin)
router.get('/', auth, async (req, res, next) => {
  try {
    const { rows: sorteos } = await db.query(`
      SELECT * FROM sorteos WHERE eliminado = false ORDER BY creado_en DESC
    `);
    if (!sorteos.length) return res.json([]);

    const { rows: modalidades } = await db.query(`
      SELECT * FROM modalidades WHERE sorteo_id = ANY($1::uuid[]) ORDER BY creado_en ASC
    `, [sorteos.map(s => s.id)]);

    res.json(sorteos.map(s => ({
      ...s,
      modalidades: modalidades.filter(m => m.sorteo_id === s.id),
    })));
  } catch (err) { next(err); }
});

// GET /api/sorteos/:id — detalle de un evento (admin)
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows: sorteoRows } = await db.query(
      'SELECT * FROM sorteos WHERE id = $1 AND eliminado = false', [req.params.id]
    );
    if (!sorteoRows.length) return res.status(404).json({ error: 'Evento no encontrado' });

    const { rows: modalidades } = await db.query(
      'SELECT * FROM modalidades WHERE sorteo_id = $1 ORDER BY creado_en ASC', [req.params.id]
    );
    res.json({ ...sorteoRows[0], modalidades });
  } catch (err) { next(err); }
});

// POST /api/sorteos — CREAR EVENTO (sorteo/rifa/bingo) en un solo paso:
// datos del evento + imagen de premiación + primera modalidad
router.post('/', auth, uploadPremio.single('imagen_premio'), async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const {
      nombre, descripcion, fecha_sorteo, premio_descripcion, descripcion_premio,
      tipo_boleta, modalidad_nombre, precio_boleta, total_boletas,
      permite_elegir_numero, config, metodo_resultado, fuente_resultado,
    } = req.body;

    if (!nombre || !fecha_sorteo || !tipo_boleta || !precio_boleta || !total_boletas)
      return res.status(400).json({
        error: 'Faltan campos requeridos: nombre, fecha_sorteo, tipo_boleta, precio_boleta, total_boletas'
      });

    if (!['bingo', 'rifa'].includes(tipo_boleta))
      return res.status(400).json({ error: 'tipo_boleta debe ser "bingo" o "rifa"' });

    let configObj = {};
    if (config) {
      try { configObj = typeof config === 'string' ? JSON.parse(config) : config; }
      catch { return res.status(400).json({ error: 'config debe ser un JSON válido' }); }
    }
    if (tipo_boleta === 'rifa' && (!configObj.digitos || !configObj.cantidad_numeros)) {
      return res.status(400).json({
        error: 'Para rifa, config debe incluir digitos y cantidad_numeros'
      });
    }

    await client.query('BEGIN');

    const { rows: sorteoRows } = await client.query(`
      INSERT INTO sorteos
        (nombre, descripcion, fecha_sorteo, premio_descripcion,
         imagen_premio_url, descripcion_premio, estado)
      VALUES ($1,$2,$3,$4,$5,$6,'activo')
      RETURNING *
    `, [
      nombre, descripcion || null, fecha_sorteo, premio_descripcion || null,
      req.file ? req.file.path : null, descripcion_premio || null,
    ]);
    const sorteo = sorteoRows[0];

    const { rows: modRows } = await client.query(`
      INSERT INTO modalidades
        (sorteo_id, tipo_boleta, nombre, precio_boleta, total_boletas,
         permite_elegir_numero, config, metodo_resultado, fuente_resultado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      sorteo.id, tipo_boleta, modalidad_nombre || (tipo_boleta === 'bingo' ? 'Cartón Bingo' : 'Boleta Rifa'),
      precio_boleta, total_boletas,
      permite_elegir_numero === 'true' || permite_elegir_numero === true,
      JSON.stringify(configObj), metodo_resultado || null, fuente_resultado || null,
    ]);

    await client.query('COMMIT');
    res.status(201).json({ ...sorteo, modalidades: [modRows[0]] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/sorteos/:id — EDITAR EVENTO (datos generales + imagen opcional)
router.patch('/:id', auth, uploadPremio.single('imagen_premio'), async (req, res, next) => {
  try {
    const { nombre, descripcion, fecha_sorteo, premio_descripcion, descripcion_premio, estado } = req.body;

    const { rows } = await db.query(`
      UPDATE sorteos SET
        nombre              = COALESCE($1, nombre),
        descripcion         = COALESCE($2, descripcion),
        fecha_sorteo        = COALESCE($3, fecha_sorteo),
        premio_descripcion  = COALESCE($4, premio_descripcion),
        descripcion_premio  = COALESCE($5, descripcion_premio),
        estado              = COALESCE($6, estado),
        imagen_premio_url   = COALESCE($7, imagen_premio_url),
        actualizado_en      = NOW()
      WHERE id = $8 AND eliminado = false
      RETURNING *
    `, [
      nombre, descripcion, fecha_sorteo, premio_descripcion, descripcion_premio,
      estado, req.file ? req.file.path : null, req.params.id,
    ]);

    if (!rows.length) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/sorteos/modalidad/:modalidadId/aumentar — AUMENTAR BOLETAS
router.patch('/modalidad/:modalidadId/aumentar', auth, async (req, res, next) => {
  try {
    const nuevoTotal = parseInt(req.body.nuevo_total);
    if (!Number.isInteger(nuevoTotal) || nuevoTotal < 1)
      return res.status(400).json({ error: 'nuevo_total debe ser un número mayor a 0' });

    const { rows: modRows } = await db.query(
      'SELECT * FROM modalidades WHERE id = $1', [req.params.modalidadId]
    );
    if (!modRows.length) return res.status(404).json({ error: 'Modalidad no encontrada' });
    const modalidad = modRows[0];

    const { rows: countRows } = await db.query(
      'SELECT COUNT(*)::int AS total FROM cartones WHERE modalidad_id = $1', [modalidad.id]
    );
    const yaGenerados = countRows[0].total;

    if (nuevoTotal < yaGenerados) {
      return res.status(409).json({
        error: `No puedes bajar el total a ${nuevoTotal}: ya hay ${yaGenerados} boletas generadas. Mínimo posible: ${yaGenerados}.`
      });
    }

    await db.query(
      'UPDATE modalidades SET total_boletas = $1 WHERE id = $2', [nuevoTotal, modalidad.id]
    );

    const faltantes = nuevoTotal - yaGenerados;
    const generadas = [];
    for (let i = 0; i < faltantes; i++) {
      const codigo = generarCodigo();
      const { numeros } = generarBoleta(modalidad, yaGenerados + i);
      const { rows } = await db.query(`
        INSERT INTO cartones (sorteo_id, modalidad_id, tipo_boleta, codigo_unico, numeros, pdf_url, tipo)
        VALUES ($1,$2,$3,$4,$5,NULL,'generado')
        RETURNING id, codigo_unico
      `, [modalidad.sorteo_id, modalidad.id, modalidad.tipo_boleta, codigo, JSON.stringify(numeros)]);
      generadas.push(rows[0]);
    }

    res.json({
      message: `Total actualizado a ${nuevoTotal}. Se generaron ${faltantes} boleta(s) nueva(s).`,
      total_boletas: nuevoTotal,
      generadas,
    });
  } catch (err) { next(err); }
});

// DELETE /api/sorteos/:id — BORRAR EVENTO (soft delete, con doble confirmación si está activo)
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM sorteos WHERE id = $1 AND eliminado = false', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Evento no encontrado' });
    const sorteo = rows[0];

    const { rows: ventasRows } = await db.query(`
      SELECT COUNT(*)::int AS total FROM ventas
      WHERE sorteo_id = $1 AND estado_pago = 'aprobado'
    `, [sorteo.id]);
    const ventasAprobadas = ventasRows[0].total;

    const requiereConfirmacion = sorteo.estado === 'activo' || ventasAprobadas > 0;
    const confirmado = req.query.confirmar === 'true';

    if (requiereConfirmacion && !confirmado) {
      return res.status(409).json({
        requiereConfirmacion: true,
        mensaje: ventasAprobadas > 0
          ? `Este evento tiene ${ventasAprobadas} venta(s) aprobada(s) y ${sorteo.estado === 'activo' ? 'está activo' : 'no está activo'}. Si lo eliminas, esas boletas dejarán de ser consultables y el sorteo no se realizará. Repite la eliminación con confirmación explícita.`
          : 'Este evento está ACTIVO. Si lo eliminas, no se realizará la jugada/sorteo. Repite la eliminación con confirmación explícita.',
      });
    }

    await db.query(
      'UPDATE sorteos SET eliminado = true, eliminado_en = NOW(), estado = $1 WHERE id = $2',
      ['cancelado', sorteo.id]
    );

    res.json({ message: 'Evento eliminado. Ya no aparecerá en el panel ni en la página de ventas.' });
  } catch (err) { next(err); }
});

module.exports = router;