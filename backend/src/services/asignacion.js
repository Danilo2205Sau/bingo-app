// ============================================
// asignacion.js — Asigna cartones específicos a una venta
// en el momento en que se crea (no al aprobar)
// ============================================

// Usa primero los cartones que el comprador ya eligió/reservó (si los hay),
// completa con los disponibles al azar de la modalidad.
// Devuelve null si no hay suficientes disponibles (el caller debe hacer ROLLBACK).
async function asignarCartonesAVenta(client, { modalidadId, ventaId, cantidad }) {
  const yaElegidos = await client.query(`
    SELECT id, codigo_unico, numeros, tipo_boleta FROM cartones
    WHERE reservado_venta_id = $1 AND vendido = false
    FOR UPDATE
  `, [ventaId]);

  const faltan = cantidad - yaElegidos.rows.length;
  let alAzar = { rows: [] };

  if (faltan > 0) {
    alAzar = await client.query(`
      SELECT id, codigo_unico, numeros, tipo_boleta FROM cartones
      WHERE modalidad_id = $1 AND vendido = false
        AND (reservado_hasta IS NULL OR reservado_hasta < NOW())
        AND id NOT IN (SELECT carton_id FROM venta_cartones)
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    `, [modalidadId, faltan]);
  }

  const cartones = [...yaElegidos.rows, ...alAzar.rows];
  if (cartones.length < cantidad) return null;

  for (const carton of cartones) {
    await client.query(
      'UPDATE cartones SET reservado_venta_id = $1, reservado_hasta = NULL WHERE id = $2',
      [ventaId, carton.id]
    );
    await client.query(
      'INSERT INTO venta_cartones (venta_id, carton_id) VALUES ($1, $2)',
      [ventaId, carton.id]
    );
  }

  return cartones;
}

module.exports = { asignarCartonesAVenta };