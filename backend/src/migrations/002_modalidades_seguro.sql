-- ============================================
-- 002 — Modalidades: soporte para Bingo + Rifas/Sorteos
-- VERSIÓN SEGURA: se puede correr aunque ya se haya corrido antes
-- (se salta lo que ya existe, no falla ni duplica nada)
-- ============================================

-- Tipos ENUM (solo si no existen)
DO $$ BEGIN
  CREATE TYPE tipo_boleta AS ENUM ('bingo', 'rifa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE metodo_resultado AS ENUM ('externo', 'propio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabla MODALIDADES
CREATE TABLE IF NOT EXISTS modalidades (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sorteo_id         UUID NOT NULL REFERENCES sorteos(id) ON DELETE CASCADE,
  tipo_boleta       tipo_boleta NOT NULL DEFAULT 'bingo',
  nombre            VARCHAR(100) NOT NULL,
  precio_boleta     DECIMAL(12,2) NOT NULL,
  total_boletas     INT NOT NULL,
  boletas_vendidas  INT NOT NULL DEFAULT 0,
  config            JSONB NOT NULL DEFAULT '{}',
  metodo_resultado  metodo_resultado,
  fuente_resultado  TEXT,
  activo            BOOLEAN NOT NULL DEFAULT true,
  creado_en         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modalidades_sorteo ON modalidades(sorteo_id);

-- CARTONES: columnas nuevas
ALTER TABLE cartones ADD COLUMN IF NOT EXISTS modalidad_id UUID REFERENCES modalidades(id);
ALTER TABLE cartones ADD COLUMN IF NOT EXISTS tipo_boleta  tipo_boleta NOT NULL DEFAULT 'bingo';

CREATE INDEX IF NOT EXISTS idx_cartones_modalidad ON cartones(modalidad_id);

-- VENTAS: columna nueva
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS modalidad_id UUID REFERENCES modalidades(id);

-- Migrar datos existentes (solo afecta sorteos que aún no tengan modalidad)
INSERT INTO modalidades (sorteo_id, tipo_boleta, nombre, precio_boleta, total_boletas, boletas_vendidas)
SELECT s.id, 'bingo', 'Cartón Bingo', s.precio_boleta, s.total_cartones, s.cartones_vendidos
FROM sorteos s
WHERE (EXISTS (SELECT 1 FROM cartones c WHERE c.sorteo_id = s.id) OR s.estado <> 'borrador')
  AND NOT EXISTS (SELECT 1 FROM modalidades m WHERE m.sorteo_id = s.id);

UPDATE cartones c SET modalidad_id = m.id
FROM modalidades m WHERE m.sorteo_id = c.sorteo_id AND c.modalidad_id IS NULL;

UPDATE ventas v SET modalidad_id = m.id
FROM modalidades m WHERE m.sorteo_id = v.sorteo_id AND v.modalidad_id IS NULL;

-- Trigger: mantener modalidades.boletas_vendidas al día
CREATE OR REPLACE FUNCTION actualizar_contador_modalidad()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE modalidades
    SET boletas_vendidas = boletas_vendidas + 1
    WHERE id = (SELECT modalidad_id FROM cartones WHERE id = NEW.carton_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contar_ventas_modalidad ON venta_cartones;
CREATE TRIGGER trigger_contar_ventas_modalidad
AFTER INSERT ON venta_cartones
FOR EACH ROW EXECUTE FUNCTION actualizar_contador_modalidad();

-- Verificación final
SELECT 'modalidades' AS tabla, COUNT(*) FROM modalidades
UNION ALL
SELECT 'cartones con modalidad_id', COUNT(*) FROM cartones WHERE modalidad_id IS NOT NULL;