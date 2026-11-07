require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./src/config/db');
const pool = db.pool;
const migrationsDir = path.join(__dirname, 'src', 'migrations');

async function ejecutarMigraciones() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es requerido');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = fs.readdirSync(migrationsDir)
    .filter(file => /^\d+_.+\.sql$/.test(file))
    .sort((a, b) => a.localeCompare(b, 'en'));

  const { rows: state } = await pool.query(`
    SELECT to_regclass('public.admins') IS NOT NULL AS has_schema,
           EXISTS (SELECT 1 FROM schema_migrations) AS has_history
  `);

  if (state[0].has_schema && !state[0].has_history) {
    const baseline = process.env.MIGRATION_BASELINE;
    if (!baseline || !/^\d{3}$/.test(baseline)) {
      throw new Error(
        'La base ya tiene tablas pero no historial de migraciones. Verifica qué migraciones están aplicadas y define MIGRATION_BASELINE (por ejemplo 007) antes de continuar.'
      );
    }
    const { rows: knownVersions } = await pool.query('SELECT version FROM schema_migrations');
    if (knownVersions.length) throw new Error('No se puede establecer una línea base con historial existente');
    for (const file of files) {
      if (file.slice(0, 3) <= baseline) {
        await pool.query('INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      }
    }
    console.log(`Línea base registrada hasta ${baseline}. Confirma que coincide con la base antes de producción.`);
  }

  const { rows: appliedRows } = await pool.query('SELECT version FROM schema_migrations');
  const applied = new Set(appliedRows.map(row => row.version));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Migración aplicada: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Falló ${file}: ${error.message}`, { cause: error });
    } finally {
      client.release();
    }
  }
}

ejecutarMigraciones()
  .catch(error => {
    console.error(`Error de migración: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
