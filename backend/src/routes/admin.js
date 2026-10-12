const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const { asignarCartonesAVenta } = require('../services/asignacion');

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
      WHERE v.estado_pago IN ('pendiente','en_revision') AND v.es_administrador = false
      ORDER BY v.creado_en ASC
    `);
    res.json(rows);
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
        await client.query('COMMIT');
        creadas.push({ venta_id: venta[0].id, carton_id: asignados[0].id, codigo_unico: asignados[0].codigo_unico, numeros: asignados[0].numeros });
      }
    } finally {
      client.release();
    }

    if (!creadas.length)
      return res.status(409).json({ error: 'No se pudo reservar ninguna boleta (sin disponibilidad)' });

    res.status(201).json({
      message: `${creadas.length} boleta(s) reservada(s) — enviando por WhatsApp...`,
      cartones: creadas,
    });

    // Generar el PDF y enviar cada boleta por WhatsApp de forma individual,
    // sin bloquear la respuesta al admin. No marca como pagado — eso pasa
    // aparte cuando el admin apruebe cada venta al recibir el pago.
    (async () => {
      const { rows: sorteoRows } = await db.query(
        'SELECT nombre, fecha_sorteo, imagen_premio_url FROM sorteos WHERE id = $1', [sorteo_id]
      );
      const sorteoInfo = sorteoRows[0] || {};
      const fechaSorteoTexto = sorteoInfo.fecha_sorteo
        ? new Date(sorteoInfo.fecha_sorteo).toLocaleDateString('es-CO', { dateStyle: 'long' })
        : '';
      const whatsappContacto = process.env.WHATSAPP_CONTACTO_PUBLICO || '';
      const { generarHojaCartonesPDF, generarBoletasConImagenPremio } = require('../services/pdfGenerator');
      const { enviarBoletaDirectaPorWhatsApp, nombreArchivoBoleta } = require('../services/whatsapp');

      for (const item of creadas) {
        try {
          let pdfUrl;
          // El PDF se llama Boleta_<número> (ej. Boleta_123456)
          const publicId = `boletas/${sorteo_id}/${nombreArchivoBoleta({ tipo_boleta: modalidad.tipo_boleta, numeros: item.numeros, codigo_unico: item.codigo_unico })}`;
          if (sorteoInfo.imagen_premio_url) {
            ({ pdfUrl } = await generarBoletasConImagenPremio({
              cartones: [{ codigo_unico: item.codigo_unico, numeros: item.numeros }],
              imagenPremioUrl: sorteoInfo.imagen_premio_url,
              sorteoNombre: sorteoInfo.nombre,
              fechaSorteoTexto,
              precioBoleta: modalidad.precio_boleta,
              whatsappContacto,
              fuenteResultado: modalidad.fuente_resultado,
              ventaId: item.venta_id,
              publicId,
            }));
          } else {
            ({ pdfUrl } = await generarHojaCartonesPDF({
              cartones: [{ codigo_unico: item.codigo_unico, numeros: item.numeros }],
              tipoBoleta: modalidad.tipo_boleta || 'bingo',
              fuenteResultado: modalidad.fuente_resultado,
              sorteoNombre: sorteoInfo.nombre,
              fechaSorteoTexto,
              ventaId: item.venta_id,
              whatsappContacto,
              publicId,
            }));
          }
          await db.query('UPDATE cartones SET pdf_url = $1 WHERE id = $2', [pdfUrl, item.carton_id]);
          await enviarBoletaDirectaPorWhatsApp(item.venta_id);
          console.log(`[Extracción] Boleta ${item.codigo_unico} enviada por WhatsApp`);
        } catch (err) {
          console.error(`[Extracción] Error enviando boleta ${item.codigo_unico}:`, err.message);
        }
        // Pausa breve entre boletas para no saturar el envío
        await new Promise(r => setTimeout(r, 1500));
      }
    })();
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
      WHERE id = $2 AND estado_pago != 'aprobado'
      RETURNING *
    `, [req.admin.id, req.params.id]);

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Venta no encontrada o ya aprobada' });
    }

    const venta = rows[0];

    // 2. Los cartones ya quedaron asignados desde que se creó la venta —
    //    aquí solo los marcamos como vendidos (pagados)
    const cartones = await client.query(`
      SELECT c.id, c.codigo_unico, c.numeros, c.tipo_boleta
      FROM cartones c
      JOIN venta_cartones vc ON vc.carton_id = c.id
      WHERE vc.venta_id = $1
      FOR UPDATE OF c
    `, [venta.id]);

    if (cartones.rows.length < venta.cantidad) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Esta venta no tiene boletas asignadas (dato inconsistente)' });
    }

    for (const carton of cartones.rows) {
      await client.query('UPDATE cartones SET vendido = true WHERE id = $1', [carton.id]);
    }

      await client.query('COMMIT');

    // Si es una boleta de venta directa (extraída por el admin), el PDF y el
    // WhatsApp ya se enviaron al momento de extraerla — aquí solo se confirma el pago.
    if (venta.es_administrador) {
      return res.json({ message: 'Pago confirmado', venta_id: venta.id });
    }

    // 4. Generar el PDF de las boletas (con imagen de premiación si el evento tiene una,
    //    o la hoja clásica de respaldo si no) y disparar el envío de WhatsApp
    (async () => {
      try {
        console.log(`[Venta ${venta.id}] Iniciando generación de PDF y envío por WhatsApp...`);
        const { generarHojaCartonesPDF, generarBoletasConImagenPremio } = require('../services/pdfGenerator');
        const { rows: sorteoRows } = await db.query(
          'SELECT nombre, fecha_sorteo, imagen_premio_url FROM sorteos WHERE id = $1', [venta.sorteo_id]
        );
        const { rows: modRows } = await db.query(
          'SELECT nombre, tipo_boleta, precio_boleta, metodo_resultado, fuente_resultado FROM modalidades WHERE id = $1',
          [venta.modalidad_id]
        );
        const sorteoInfo    = sorteoRows[0] || {};
        const modalidadInfo = modRows[0] || {};
        const fechaSorteoTexto = sorteoInfo.fecha_sorteo
          ? new Date(sorteoInfo.fecha_sorteo).toLocaleDateString('es-CO', { dateStyle: 'long' })
          : '';
        const whatsappContacto = process.env.WHATSAPP_CONTACTO_PUBLICO || '';

        let pdfUrl;
        if (sorteoInfo.imagen_premio_url) {
          console.log(`[Venta ${venta.id}] Generando boleta con imagen de premiación...`);
          ({ pdfUrl } = await generarBoletasConImagenPremio({
            cartones: cartones.rows.map(c => c),
            imagenPremioUrl: sorteoInfo.imagen_premio_url,
            sorteoNombre: sorteoInfo.nombre,
            fechaSorteoTexto,
            precioBoleta: modalidadInfo.precio_boleta,
            whatsappContacto,
            fuenteResultado: modalidadInfo.fuente_resultado,
            ventaId: venta.id,
          }));
        } else {
          console.log(`[Venta ${venta.id}] Generando hoja clásica de cartones...`);
          ({ pdfUrl } = await generarHojaCartonesPDF({
            cartones: cartones.rows.map(c => c),
            tipoBoleta: modalidadInfo.tipo_boleta || 'bingo',
            modalidadNombre: modalidadInfo.nombre,
            fuenteResultado: modalidadInfo.fuente_resultado,
            sorteoNombre: sorteoInfo.nombre,
            fechaSorteoTexto,
            ventaId: venta.id,
            whatsappContacto,
          }));
        }
        console.log(`[Venta ${venta.id}] PDF generado: ${pdfUrl}`);

        const idsCartones = cartones.rows.map(c => c.id);
        await db.query(
          'UPDATE cartones SET pdf_url = $1 WHERE id = ANY($2::uuid[])',
          [pdfUrl, idsCartones]
        );

        console.log(`[Venta ${venta.id}] Enviando por WhatsApp...`);
        const { enviarCartonesPorWhatsApp } = require('../services/whatsapp');
        await enviarCartonesPorWhatsApp(venta.id);
        console.log(`[Venta ${venta.id}] ✓ WhatsApp enviado correctamente`);
      } catch (err) {
        console.error(`[Venta ${venta.id}] ✗ ERROR generando/enviando:`, err.message, err.stack);
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

    // Desvincular y liberar las boletas de esta venta (el trigger descuenta el contador solo)
    await db.query('DELETE FROM venta_cartones WHERE venta_id = $1', [req.params.id]);
    await db.query(`
      UPDATE cartones SET reservado_venta_id = NULL, reservado_hasta = NULL, vendido = false
      WHERE reservado_venta_id = $1
    `, [req.params.id]);

    res.json({ message: 'Venta rechazada, boletas liberadas' });
  } catch (err) { next(err); }
});

// GET /api/admin/eventos/:sorteoId/boletas — todas las boletas de un evento,
// con el comprador (si ya fue vendida) y filtros por número o teléfono
// query params opcionales: ?numero=047  ?telefono=3114470472  ?modalidad_id=...
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