-- Migración: agregar columnas de ISLR configurable por ganadero
-- Ejecutar en Supabase Dashboard → SQL Editor

-- % ISLR del ganadero (null = usar default según tipo)
ALTER TABLE ganaderos ADD COLUMN IF NOT EXISTS porcentaje_islr NUMERIC(8,5) DEFAULT NULL;

-- % ISLR real aplicado al generar la factura (para reproducibilidad)
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS islr_pct NUMERIC(8,5) DEFAULT NULL;
