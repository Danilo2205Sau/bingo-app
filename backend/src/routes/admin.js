const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');
const auth    = require('../middleware/auth');

// POST /api/admin/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const { rows } = await db.query(
      'SELECT * FROM admins WHERE email = $1', [email]
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
      db.query(`SELECT COUNT(*) AS pendientes FROM ventas WHERE estado_pago = 'pendiente'`),
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
    const { rows } = await db.query(`
     SELECT v.id, v.cantidad, v.total_pagado, v.metodo_pago,
             v.comprobante_url, v.creado_en, v.estado_pago,
             v.referencia_pago, v.nombre_titular, v.monto_declarado,
             v.banco_origen, v.fecha_transaccion,
             c.nombre AS comprador_nombre, c.telefono AS comprador_telefono,
             s.nombre AS sorteo_nombre
      FROM ventas v
      JOIN compradores c ON c.id = v.comprador_id
      JOIN sorteos s     ON s.id = v.sorteo_id
      WHERE v.estado_pago IN ('pendiente','en_revision')
      ORDER BY v.creado_en ASC
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
      WHERE id = $2 AND estado_pago != 'aprobado'
      RETURNING *
    `, [req.admin.id, req.params.id]);

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Venta no encontrada o ya aprobada' });
    }

    const venta = rows[0];

    // 2. Asignar cartones disponibles del sorteo
    const cartones = await client.query(`
      SELECT id, codigo_unico, numeros FROM cartones
      WHERE sorteo_id = $1 AND vendido = false
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    `, [venta.sorteo_id, venta.cantidad]);

    if (cartones.rows.length < venta.cantidad) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No hay suficientes cartones disponibles' });
    }

    // 3. Marcar cartones como vendidos e insertar en venta_cartones
    for (const carton of cartones.rows) {
      await client.query(
        'UPDATE cartones SET vendido = true WHERE id = $1', [carton.id]
      );
      await client.query(
        'INSERT INTO venta_cartones (venta_id, carton_id) VALUES ($1, $2)',
        [venta.id, carton.id]
      );
    }

        await client.query('COMMIT');

    // 4. Generar la hoja de cartones (PDF único con todos los cartones de esta venta)
    //    y disparar el envío de WhatsApp — todo async, no bloquea la respuesta al admin
    (async () => {
      try {
        const { generarHojaCartonesPDF } = require('../services/pdfGenerator');
        const { rows: sorteoRows } = await db.query(
          'SELECT nombre, fecha_sorteo FROM sorteos WHERE id = $1', [venta.sorteo_id]
        );
        const sorteoInfo = sorteoRows[0] || {};

        const { pdfUrl } = await generarHojaCartonesPDF({
          cartones: cartones.rows.map(c => c),
          sorteoNombre: sorteoInfo.nombre,
          fechaSorteoTexto: sorteoInfo.fecha_sorteo
            ? new Date(sorteoInfo.fecha_sorteo).toLocaleDateString('es-CO', { dateStyle: 'long' })
            : '',
          ventaId: venta.id,
          whatsappContacto: process.env.WHATSAPP_CONTACTO_PUBLICO || '',
        });

        const idsCartones = cartones.rows.map(c => c.id);
        await db.query(
          'UPDATE cartones SET pdf_url = $1 WHERE id = ANY($2::uuid[])',
          [pdfUrl, idsCartones]
        );

        const { enviarCartonesPorWhatsApp } = require('../services/whatsapp');
        await enviarCartonesPorWhatsApp(venta.id);
      } catch (err) {
        console.error('Error generando/enviando hoja de cartones:', err);
      }
    })();

    res.json({ message: 'Venta aprobada y cartones asignados', venta_id: venta.id });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/admin/ventas/:id/rechazar
router.patch('/ventas/:id/rechazar', auth, async (req, res, next) => {
  try {
    const { notas } = req.body;
    await db.query(`
      UPDATE ventas SET estado_pago = 'rechazado', notas_admin = $1
      WHERE id = $2
    `, [notas || '', req.params.id]);
    res.json({ message: 'Venta rechazada' });
  } catch (err) { next(err); }
});

module.exports = router;
