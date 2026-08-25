-- ============================================
-- 004 — Corrige columnas heredadas de sorteos que quedaron
-- NOT NULL desde antes de existir "modalidades".
-- Ahora precio/total viven en modalidades; estas columnas
-- de sorteos quedan como legado opcional, no obligatorio.
-- ============================================

ALTER TABLE sorteos ALTER COLUMN precio_boleta DROP NOT NULL;
ALTER TABLE sorteos ALTER COLUMN total_cartones DROP NOT NULL;
ALTER TABLE sorteos ALTER COLUMN total_cartones DROP DEFAULT;

-- Verificación
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'sorteos' AND column_name IN ('precio_boleta','total_cartones');