// ============================================
// asignacion.js — Asigna cartones específicos a una venta
// en el momento en que se crea (no al aprobar)
// ============================================

// Usa primero los cartones que el comprador ya eligió/reservó (si los hay),
// completa con los disponibles al azar de la modalidad.
// Devuelve null si no se pueden asignar exactamente las boletas solicitadas.
async function asignarCartonesAVenta(client, { modalidadId, ventaId, cantidad }) {
  const yaElegidos = await client.query(`
    SELECT id, codigo_unico, numeros, tipo_boleta FROM cartones
    WHERE reservado_venta_id = $1 AND modalidad_id = $2 AND vendido = false
    FOR UPDATE
  `, [ventaId, modalidadId]);

  if (yaElegidos.rows.length > cantidad) return null;

  const faltan = cantidad - yaElegidos.rows.length;
  let alAzar = { rows: [] };

  if (faltan > 0) {
    alAzar = await client.query(`
      SELECT id, codigo_unico, numeros, tipo_boleta FROM cartones
      WHERE modalidad_id = $1 AND vendido = false
        AND reservado_venta_id IS NULL
        AND (reserva_token_hash IS NULL OR reservado_hasta <= NOW())
        AND id NOT IN (SELECT carton_id FROM venta_cartones)
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    `, [modalidadId, faltan]);
  }

  const cartones = [...yaElegidos.rows, ...alAzar.rows];
  if (cartones.length !== cantidad) return null;

  const cartonIds = cartones.map(carton => carton.id);
  const { rowCount } = await client.query(`
    UPDATE cartones SET reservado_venta_id = $1, reservado_hasta = NULL,
      reserva_token_hash = NULL
    WHERE id = ANY($2::uuid[]) AND vendido = false
  `, [ventaId, cartonIds]);
  if (rowCount !== cantidad) return null;

  await client.query(`
    INSERT INTO venta_cartones (venta_id, carton_id)
    SELECT $1, unnest($2::uuid[])
  `, [ventaId, cartonIds]);

  return cartones;
}

module.exports = { asignarCartonesAVenta };
