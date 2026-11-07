require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function crearAdministrador() {
  const nombre = (process.env.ADMIN_NAME || 'Administrador').trim();
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Define ADMIN_EMAIL con un correo válido');
  }
  if (email === 'admin@bingo.com') {
    throw new Error('El correo predeterminado está bloqueado; define un correo privado distinto');
  }
  if (password.length < 14) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 14 caracteres');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(`
    INSERT INTO admins (nombre, email, password_hash)
    VALUES ($1, $2, $3)
    ON CONFLICT (email) DO NOTHING
    RETURNING id
  `, [nombre, email, passwordHash]);

  if (!rows.length) throw new Error('Ese correo ya tiene una cuenta de administrador; no se modificó');
  console.log(`Administrador creado: ${email}`);
}

crearAdministrador()
  .catch(error => {
    console.error(`No se creó el administrador: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.pool.end());
