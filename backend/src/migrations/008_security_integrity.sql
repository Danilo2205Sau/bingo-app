-- Reconcile columns used by the current API and harden reservations.
-- Safe to re-run when an environment was previously migrated manually.

ALTER TYPE estado_sorteo ADD VALUE IF NOT EXISTS 'cancelado';

ALTER TABLE sorteos
  ADD COLUMN IF NOT EXISTS imagen_premio_url TEXT,
  ADD COLUMN IF NOT EXISTS descripcion_premio TEXT,
  ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMP;

UPDATE sorteos
SET imagen_premio_url = imagen_url
WHERE imagen_premio_url IS NULL AND imagen_url IS NOT NULL;

ALTER TABLE modalidades
  ADD COLUMN IF NOT EXISTS permite_elegir_numero BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE cartones
  ADD COLUMN IF NOT EXISTS reservado_venta_id UUID REFERENCES ventas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservado_hasta TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reserva_token_hash CHAR(64);

ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS referencia_pago TEXT,
  ADD COLUMN IF NOT EXISTS nombre_titular TEXT,
  ADD COLUMN IF NOT EXISTS monto_declarado NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS banco_origen TEXT,
  ADD COLUMN IF NOT EXISTS fecha_transaccion TEXT,
  ADD COLUMN IF NOT EXISTS consulta_token_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS comprobante_public_id TEXT,
  ADD COLUMN IF NOT EXISTS comprobante_resource_type TEXT,
  ADD COLUMN IF NOT EXISTS comprobante_format TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS idempotency_request_hash CHAR(64);

CREATE INDEX IF NOT EXISTS idx_cartones_venta_reserva
  ON cartones (reservado_venta_id) WHERE reservado_venta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cartones_reserva_disponible
  ON cartones (modalidad_id, reservado_hasta)
  WHERE vendido = false AND reservado_venta_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_venta_cartones_venta
  ON venta_cartones (venta_id);
CREATE INDEX IF NOT EXISTS idx_ventas_pendientes_paginado
  ON ventas (creado_en, id)
  WHERE estado_pago IN ('pendiente', 'en_revision') AND es_administrador = false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_consulta_token
  ON ventas (consulta_token_hash) WHERE consulta_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_idempotency_key
  ON ventas (idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL;

ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS tipo_trabajo TEXT NOT NULL DEFAULT 'venta_aprobada',
  ADD COLUMN IF NOT EXISTS intentos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_hasta TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proximo_intento TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_notificaciones_pendientes
  ON notificaciones (canal, proximo_intento, creado_en, id)
  WHERE estado = 'pendiente';

-- Update sold counters once per batch insert/delete instead of locking the same
-- event and modality rows once for every ticket in a multi-ticket purchase.
CREATE OR REPLACE FUNCTION actualizar_contadores_ventas_lote()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sorteos s
  SET cartones_vendidos = s.cartones_vendidos + conteo.total
  FROM (
    SELECT c.sorteo_id, COUNT(*)::int AS total
    FROM inserted_links vc
    JOIN cartones c ON c.id = vc.carton_id
    GROUP BY c.sorteo_id
  ) conteo
  WHERE s.id = conteo.sorteo_id;

  UPDATE modalidades m
  SET boletas_vendidas = m.boletas_vendidas + conteo.total
  FROM (
    SELECT c.modalidad_id, COUNT(*)::int AS total
    FROM inserted_links vc
    JOIN cartones c ON c.id = vc.carton_id
    WHERE c.modalidad_id IS NOT NULL
    GROUP BY c.modalidad_id
  ) conteo
  WHERE m.id = conteo.modalidad_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contar_ventas ON venta_cartones;
DROP TRIGGER IF EXISTS trigger_contar_ventas_modalidad ON venta_cartones;
CREATE TRIGGER trigger_contar_ventas_lote
AFTER INSERT ON venta_cartones
REFERENCING NEW TABLE AS inserted_links
FOR EACH STATEMENT EXECUTE FUNCTION actualizar_contadores_ventas_lote();

CREATE OR REPLACE FUNCTION actualizar_contador_modalidad_borrado_lote()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sorteos s
  SET cartones_vendidos = GREATEST(s.cartones_vendidos - conteo.total, 0)
  FROM (
    SELECT c.sorteo_id, COUNT(*)::int AS total
    FROM deleted_links vc
    JOIN cartones c ON c.id = vc.carton_id
    GROUP BY c.sorteo_id
  ) conteo
  WHERE s.id = conteo.sorteo_id;

  UPDATE modalidades m
  SET boletas_vendidas = GREATEST(m.boletas_vendidas - conteo.total, 0)
  FROM (
    SELECT c.modalidad_id, COUNT(*)::int AS total
    FROM deleted_links vc
    JOIN cartones c ON c.id = vc.carton_id
    WHERE c.modalidad_id IS NOT NULL
    GROUP BY c.modalidad_id
  ) conteo
  WHERE m.id = conteo.modalidad_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_descontar_ventas_modalidad ON venta_cartones;
CREATE TRIGGER trigger_descontar_ventas_modalidad_lote
AFTER DELETE ON venta_cartones
REFERENCING OLD TABLE AS deleted_links
FOR EACH STATEMENT EXECUTE FUNCTION actualizar_contador_modalidad_borrado_lote();

-- Reconcile legacy counters once before the API starts using them again.
UPDATE sorteos s
SET cartones_vendidos = conteo.total
FROM (
  SELECT s.id, COUNT(vc.carton_id)::int AS total
  FROM sorteos s
  LEFT JOIN cartones c ON c.sorteo_id = s.id
  LEFT JOIN venta_cartones vc ON vc.carton_id = c.id
  GROUP BY s.id
) conteo
WHERE s.id = conteo.id;

UPDATE modalidades m
SET boletas_vendidas = conteo.total
FROM (
  SELECT m.id, COUNT(vc.carton_id)::int AS total
  FROM modalidades m
  LEFT JOIN cartones c ON c.modalidad_id = m.id
  LEFT JOIN venta_cartones vc ON vc.carton_id = c.id
  GROUP BY m.id
) conteo
WHERE m.id = conteo.id;

-- Legacy default admin login is blocked by the application. Create a new
-- administrator with a private address before removing the legacy row manually.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM admins WHERE lower(email) = 'admin@bingo.com') THEN
    RAISE WARNING 'Legacy admin@bingo.com exists; login is disabled. Create a new admin with npm run admin:create.';
  END IF;
END $$;
