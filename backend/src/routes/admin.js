const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const { asignarCartonesAVenta } = require('../services/asignacion');
const { urlPrivada } = require('../services/cloudinary');
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
});

// POST /api/admin/login
router.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const emailNormalizado = String(email).trim().toLowerCase();
    if (emailNormalizado === 'admin@bingo.com') {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const { rows } = await db.query(
      'SELECT * FROM admins WHERE lower(email) = $1', [emailNormalizado]
    );
    const admin = rows[0];

    if (!admin || !(await bcrypt.compare(password, admin.password_hash)))
      return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = jwt.sign(
      { id: admin.id, nombre: admin.nombre, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ token, admin: { id: admin.id, nombre: admin.nombre, email: admin.email } });
  } catch (err) { next(err); }
});

// GET /api/admin/dashboard — métricas generales
router.get('/dashboard', auth, async (req, res, next) => {
  try {
    const [ventas, boletas, compradores, notifs] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(total_pagado),0) AS total
                FROM ventas WHERE estado_pago = 'aprobado'`),
      db.query(`SELECT COUNT(*) AS vendidas FROM venta_cartones`),
      db.query(`SELECT COUNT(DISTINCT comprador_id) AS total FROM ventas`),
      db.query(`SELECT COUNT(*) AS pendientes FROM ventas WHERE estado_pago IN ('pendiente','en_revision')`),
    ]);

    res.json({
      dinero_recaudado:   Number(ventas.rows[0].total),
      boletas_vendidas:   Number(boletas.rows[0].vendidas),
      compradores_unicos: Number(compradores.rows[0].total),
      pagos_pendientes:   Number(notifs.rows[0].pendientes),
    });
  } catch (err) { next(err); }
});

// GET /api/admin/ventas-pendientes
router.get('/ventas-pendientes', auth, async (req, res, next) => {
  try {
    const limitText = req.query.limit === undefined ? '50' : String(req.query.limit);
    const offsetText = req.query.offset === undefined ? '0' : String(req.query.offset);
    if (!/^\d+$/.test(limitText) || !/^\d+$/.test(offsetText)) {
      return res.status(400).json({ error: 'La página solicitada no es válida' });
    }
    const limit = Number(limitText);
    const offset = Number(offsetText);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isSafeInteger(offset) || offset > 1000000) {
      return res.status(400).json({ error: 'La página solicitada está fuera del rango permitido' });
    }

    const countResult = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM ventas
      WHERE estado_pago IN ('pendiente','en_revision') AND es_administrador = false
    `);
    const { rows } = await db.query(`
     SELECT v.id, v.cantidad, v.total_pagado, v.metodo_pago,
             v.comprobante_url, v.creado_en, v.estado_pago,
             v.comprobante_public_id, v.comprobante_resource_type, v.comprobante_format,
             v.referencia_pago, v.nombre_titular, v.monto_declarado,
             v.banco_origen, v.fecha_transaccion,
             c.nombre AS comprador_nombre, c.telefono AS comprador_telefono,
             s.nombre AS sorteo_nombre
      FROM ventas v
      JOIN compradores c ON c.id = v.comprador_id
      JOIN sorteos s     ON s.id = v.sorteo_id
      WHERE v.estado_pago IN ('pendiente','en_revision') AND v.es_administrador = false
      ORDER BY v.creado_en ASC, v.id ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    const ventas = rows.map(venta => ({
      ...venta,
      comprobante_url: venta.comprobante_public_id
        ? urlPrivada(venta.comprobante_public_id, venta.comprobante_resource_type, venta.comprobante_format)
        : venta.comprobante_url,
    }));
    res.json({ ventas, total: countResult.rows[0].total, limit, offset });
  } catch (err) { next(err); }
});

// POST /api/admin/extraer-boletas
//  — el admin reserva N boletas para vender
// aparte (en persona, etc). Quedan en estado 'pendiente' hasta que las apruebe
// cuando le paguen — reutiliza exactamente el mismo flujo de aprobar/rechazar.
router.post('/extraer-boletas', auth, async (req, res, next) => {
  try {
    const { sorteo_id, modalidad_id, cantidad, telefono, nombre } = req.body;
    if (!sorteo_id || !modalidad_id || !cantidad || !telefono)
      return res.status(400).json({ error: 'sorteo_id, modalidad_id, cantidad y telefono son requeridos' });

    const cant = parseInt(cantidad);
    if (!Number.isInteger(cant) || cant < 1)
      return res.status(400).json({ error: 'Cantidad inválida' });

    const { rows: modRows } = await db.query(
      'SELECT id, precio_boleta, total_boletas, boletas_vendidas, tipo_boleta, fuente_resultado FROM modalidades WHERE id = $1 AND sorteo_id = $2',
      [modalidad_id, sorteo_id]
    );
    if (!modRows.length) return res.status(404).json({ error: 'Modalidad no encontrada' });
    const modalidad = modRows[0];

    const disponibles = modalidad.total_boletas - modalidad.boletas_vendidas;
    if (cant > disponibles)
      return res.status(409).json({ error: `Solo quedan ${disponibles} boleta(s) disponibles en esta modalidad` });

    const { rows: comp } = await db.query(`
      INSERT INTO compradores (nombre, telefono)
      VALUES ($1, $2)
      ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre
      RETURNING id
    `, [(nombre || 'Administrador').trim(), telefono.trim()]);
    const compradorId = comp[0].id;

    // Una venta INDEPENDIENTE por cada boleta, para poder aprobar/rechazar una a una
    const creadas = [];
    const client = await db.pool.connect();
    try {
      for (let i = 0; i < cant; i++) {
        await client.query('BEGIN');
        const { rows: venta } = await client.query(`
          INSERT INTO ventas
            (comprador_id, sorteo_id, modalidad_id, cantidad, total_pagado, metodo_pago, estado_pago, es_administrador)
          VALUES ($1,$2,$3,1,$4,'fisico','pendiente', true)
          RETURNING id
        `, [compradorId, sorteo_id, modalidad_id, modalidad.precio_boleta]);

        const asignados = await asignarCartonesAVenta(client, {
          modalidadId: modalidad_id, ventaId: venta[0].id, cantidad: 1,
        });
        if (!asignados) {
          await client.query('ROLLBACK');
          break;
        }
        await client.query(`
          INSERT INTO notificaciones (venta_id, canal, estado, tipo_trabajo, mensaje)
          VALUES ($1, 'whatsapp', 'pendiente', 'boleta_admin', 'Generar y enviar boleta extraída')
        `, [venta[0].id]);
        await client.query('COMMIT');
        creadas.push({ venta_id: venta[0].id, carton_id: asignados[0].id, codigo_unico: asignados[0].codigo_unico, numeros: asignados[0].numeros });
      }
    } finally {
      client.release();
    }

    if (!creadas.length)
      return res.status(409).json({ error: 'No se pudo reservar ninguna boleta (sin disponibilidad)' });

    res.status(201).json({
      message: `${creadas.length} boleta(s) reservada(s) — envío agregado a la cola de WhatsApp`,
      cartones: creadas,
    });
  } catch (err) { next(err); }
});

// GET /api/admin/boletas-extraidas — las ventas directas del admin, con su estado
router.get('/boletas-extraidas', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT v.id AS venta_id, v.estado_pago, v.total_pagado, v.creado_en,
             c.nombre AS comprador_nombre, c.telefono AS comprador_telefono,
             s.nombre AS sorteo_nombre, m.nombre AS modalidad_nombre,
             cart.codigo_unico, cart.numeros
      FROM ventas v
      JOIN compradores c ON c.id = v.comprador_id
      JOIN sorteos s ON s.id = v.sorteo_id
      LEFT JOIN modalidades m ON m.id = v.modalidad_id
      LEFT JOIN venta_cartones vc ON vc.venta_id = v.id
      LEFT JOIN cartones cart ON cart.id = vc.carton_id
      WHERE v.es_administrador = true
      ORDER BY v.creado_en DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// PATCH /api/admin/ventas/:id/aprobar
router.patch('/ventas/:id/aprobar', auth, async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Marcar venta como aprobada
    const { rows } = await client.query(`
      UPDATE ventas SET estado_pago = 'aprobado',
        aprobado_por = $1, aprobado_en = NOW()
      WHERE id = $2 AND estado_pago IN ('pendiente', 'en_revision')
      RETURNING *
    `, [req.admin.id, req.params.id]);

    if (!rows.length) {
      await client.query('ROLLBACK');
        return res.status(409).json({ error: 'La venta no existe o su estado ya no permite aprobarla' });
    }

    const venta = rows[0];

    // 2. Las ventas nuevas ya tienen cartones asignados al comprarse. Las
    //    ventas antiguas que quedaron pendientes sin asignación se completan
    //    aquí dentro de la misma transacción antes de confirmar el pago.
    let cartones = await client.query(`
      SELECT c.id, c.codigo_unico, c.numeros, c.tipo_boleta
      FROM cartones c
      JOIN venta_cartones vc ON vc.carton_id = c.id
      WHERE vc.venta_id = $1
      FOR UPDATE OF c
    `, [venta.id]);

    if (cartones.rows.length === 0) {
      const asignados = await asignarCartonesAVenta(client, {
        modalidadId: venta.modalidad_id,
        ventaId: venta.id,
        cantidad: venta.cantidad,
      });

      if (!asignados) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No hay suficientes boletas disponibles para completar esta venta' });
      }

      cartones = { rows: asignados };
    }

    if (cartones.rows.length !== venta.cantidad) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La cantidad de boletas asignadas no coincide con la venta (dato inconsistente)' });
    }

    for (const carton of cartones.rows) {
      await client.query('UPDATE cartones SET vendido = true WHERE id = $1', [carton.id]);
    }

    if (!venta.es_administrador) {
      await client.query(`
        INSERT INTO notificaciones (venta_id, canal, estado, tipo_trabajo, mensaje)
        VALUES ($1, 'whatsapp', 'pendiente', 'venta_aprobada', 'Generar y enviar cartones aprobados')
      `, [venta.id]);
    }

      await client.query('COMMIT');

    // Si es una boleta de venta directa (extraída por el admin), el PDF y el
    // WhatsApp ya se enviaron al momento de extraerla — aquí solo se confirma el pago.
    if (venta.es_administrador) {
      return res.json({ message: 'Pago confirmado', venta_id: venta.id });
    }

    res.json({ message: 'Venta aprobada; generación y envío agregados a la cola', venta_id: venta.id });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/admin/ventas/:id/rechazar
router.patch('/ventas/:id/rechazar', auth, async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const { notas } = req.body;
    await client.query('BEGIN');

    const { rows } = await client.query(`
      UPDATE ventas SET estado_pago = 'rechazado', notas_admin = $1
      WHERE id = $2 AND estado_pago IN ('pendiente', 'en_revision')
      RETURNING id
    `, [typeof notas === 'string' ? notas.slice(0, 2000) : '', req.params.id]);

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La venta no existe o su estado ya no permite rechazarla' });
    }

    // Desvincular y liberar las boletas de esta venta (el trigger descuenta el contador solo)
    await client.query('DELETE FROM venta_cartones WHERE venta_id = $1', [req.params.id]);
    await client.query(`
      UPDATE cartones SET reservado_venta_id = NULL, reservado_hasta = NULL,
        reserva_token_hash = NULL, vendido = false
      WHERE reservado_venta_id = $1
    `, [req.params.id]);

    await client.query('COMMIT');
    res.json({ message: 'Venta rechazada, boletas liberadas' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/admin/eventos/:sorteoId/boletas — todas las boletas de un evento,
// con el comprador (si ya fue vendida) y filtros por número o teléfono
// query params opcionales: ?numero=047  ?telefono=<teléfono>  ?modalidad_id=...
router.get('/eventos/:sorteoId/boletas', auth, async (req, res, next) => {
  try {
    const { numero, telefono, modalidad_id } = req.query;
    const condiciones = ['c.sorteo_id = $1'];
    const valores = [req.params.sorteoId];

    if (modalidad_id) {
      valores.push(modalidad_id);
      condiciones.push(`c.modalidad_id = $${valores.length}`);
    }
    if (numero) {
      valores.push(`%${numero}%`);
      condiciones.push(`(c.codigo_unico ILIKE $${valores.length} OR c.numeros::text ILIKE $${valores.length})`);
    }
    if (telefono) {
      valores.push(`%${telefono.replace(/\D/g, '')}%`);
      condiciones.push(`comp.telefono ILIKE $${valores.length}`);
    }

    const { rows } = await db.query(`
      SELECT
        c.id, c.codigo_unico, c.numeros, c.tipo_boleta, c.vendido, c.pdf_url,
        m.nombre AS modalidad_nombre,
        comp.nombre AS comprador_nombre, comp.telefono AS comprador_telefono,
        v.id AS venta_id, v.estado_pago, v.creado_en AS comprado_en
      FROM cartones c
      LEFT JOIN modalidades m ON m.id = c.modalidad_id
      LEFT JOIN venta_cartones vc ON vc.carton_id = c.id
      LEFT JOIN ventas v ON v.id = vc.venta_id
      LEFT JOIN compradores comp ON comp.id = v.comprador_id
      WHERE ${condiciones.join(' AND ')}
      ORDER BY c.codigo_unico ASC
    `, valores);

    res.json({ total: rows.length, boletas: rows });
  } catch (err) { next(err); }
});

module.exports = router;

