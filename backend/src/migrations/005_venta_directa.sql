ALTER TABLE ventas ADD COLUMN IF NOT EXISTS es_administrador BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_ventas_es_admin ON ventas(es_administrador);

DO $$ BEGIN
  ALTER TABLE cartones ADD CONSTRAINT cartones_codigo_unico_key UNIQUE (codigo_unico);
EXCEPTION WHEN duplicate_table THEN NULL;
WHEN duplicate_object THEN NULL; END $$;