-- ============================================
-- BINGO APP — Migración inicial
-- Motor: PostgreSQL
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tipos enum
CREATE TYPE estado_sorteo AS ENUM ('borrador', 'activo', 'cerrado', 'finalizado');
CREATE TYPE estado_pago   AS ENUM ('pendiente', 'en_revision', 'aprobado', 'rechazado');
CREATE TYPE tipo_carton   AS ENUM ('subido', 'generado');
CREATE TYPE metodo_pago   AS ENUM ('nequi', 'bancolombia', 'transferencia');
CREATE TYPE estado_notif  AS ENUM ('pendiente', 'enviado', 'fallido');
CREATE TYPE canal_notif   AS ENUM ('whatsapp', 'email');

-- -----------------------------------------------
-- ADMINS
-- -----------------------------------------------
CREATE TABLE admins (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  creado_en     TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------
-- SORTEOS
-- -----------------------------------------------
CREATE TABLE sorteos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre            VARCHAR(150) NOT NULL,
  descripcion       TEXT,
  fecha_sorteo      TIMESTAMP NOT NULL,
  precio_boleta     DECIMAL(12,2) NOT NULL,
  total_cartones    INT NOT NULL DEFAULT 100,
  cartones_vendidos INT NOT NULL DEFAULT 0,
  premio_descripcion TEXT,
  imagen_url        TEXT,
  estado            estado_sorteo NOT NULL DEFAULT 'borrador',
  creado_en         TIMESTAMP DEFAULT NOW(),
  actualizado_en    TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------
-- CARTONES
-- -----------------------------------------------
CREATE TABLE cartones (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sorteo_id     UUID NOT NULL REFERENCES sorteos(id) ON DELETE CASCADE,
  codigo_unico  VARCHAR(20) UNIQUE NOT NULL,
  numeros       JSONB,              -- matriz 5x5 para cartones generados
  pdf_url       TEXT,               -- URL en Cloudinary
  tipo          tipo_carton NOT NULL DEFAULT 'generado',
  vendido       BOOLEAN NOT NULL DEFAULT false,
  creado_en     TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------
-- COMPRADORES
-- -----------------------------------------------
CREATE TABLE compradores (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre     VARCHAR(100) NOT NULL,
  telefono   VARCHAR(20) NOT NULL,
  email      VARCHAR(150),
  creado_en  TIMESTAMP DEFAULT NOW(),
  UNIQUE(telefono)
);

-- -----------------------------------------------
-- VENTAS
-- -----------------------------------------------
CREATE TABLE ventas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comprador_id      UUID NOT NULL REFERENCES compradores(id),
  sorteo_id         UUID NOT NULL REFERENCES sorteos(id),
  cantidad          INT NOT NULL DEFAULT 1,
  total_pagado      DECIMAL(12,2) NOT NULL,
  estado_pago       estado_pago NOT NULL DEFAULT 'pendiente',
  metodo_pago       metodo_pago NOT NULL,
  comprobante_url   TEXT,
  notas_admin       TEXT,
  aprobado_por      UUID REFERENCES admins(id),
  aprobado_en       TIMESTAMP,
  creado_en         TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------
-- VENTA_CARTONES (tabla puente)
-- -----------------------------------------------
CREATE TABLE venta_cartones (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id   UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  carton_id  UUID NOT NULL REFERENCES cartones(id),
  UNIQUE(carton_id)   -- un cartón solo puede venderse una vez
);

-- -----------------------------------------------
-- NOTIFICACIONES
-- -----------------------------------------------
CREATE TABLE notificaciones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venta_id    UUID NOT NULL REFERENCES ventas(id),
  canal       canal_notif NOT NULL DEFAULT 'whatsapp',
  estado      estado_notif NOT NULL DEFAULT 'pendiente',
  mensaje     TEXT,
  error_msg   TEXT,
  enviado_en  TIMESTAMP,
  creado_en   TIMESTAMP DEFAULT NOW()
);

-- -----------------------------------------------
-- ÍNDICES para consultas frecuentes
-- -----------------------------------------------
CREATE INDEX idx_cartones_sorteo    ON cartones(sorteo_id);
CREATE INDEX idx_cartones_vendido   ON cartones(vendido);
CREATE INDEX idx_cartones_codigo    ON cartones(codigo_unico);
CREATE INDEX idx_ventas_comprador   ON ventas(comprador_id);
CREATE INDEX idx_ventas_estado      ON ventas(estado_pago);
CREATE INDEX idx_compradores_tel    ON compradores(telefono);

-- -----------------------------------------------
-- FUNCIÓN: actualizar cartones_vendidos automáticamente
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION actualizar_contador_ventas()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sorteos
    SET cartones_vendidos = cartones_vendidos + 1
    WHERE id = (SELECT sorteo_id FROM cartones WHERE id = NEW.carton_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_contar_ventas
AFTER INSERT ON venta_cartones
FOR EACH ROW EXECUTE FUNCTION actualizar_contador_ventas();

-- -----------------------------------------------
-- Admin inicial (contraseña: cambiar en producción)
-- Hash de 'admin123' con bcrypt rounds=12
-- -----------------------------------------------
INSERT INTO admins (nombre, email, password_hash) VALUES (
  'Administrador',
  'admin@bingo.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewDGIL9EjVUXQFVm'
);
