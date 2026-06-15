/*const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Esto lee automáticamente la URL de tu base de datos desde las variables conectadas de Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "TU_DATABASE_URL_PUBLICA_AQUI"
});

async function ejecutarMigracion() {
  try {
    const rutaSql = path.join(__dirname, 'src', 'migrations', '001_init.sql');
    const sql = fs.readFileSync(rutaSql, 'utf8');
    
    console.log('⏳ Conectando e inyectando las tablas del Bingo en Railway...');
    await pool.query(sql);
    
    console.log('🚀 ¡Migración completada con éxito! Todas las tablas fueron creadas.');
  } catch (error) {
    console.error('❌ Error ejecutando la migración:', error);
  } finally {
    await pool.end();
  }
}

ejecutarMigracion();*/