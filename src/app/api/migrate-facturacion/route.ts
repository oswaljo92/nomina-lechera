import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const DDL_SQL = `
-- 1. Campos fiscales en fabricas
ALTER TABLE fabricas ADD COLUMN IF NOT EXISTS razon_social TEXT;
ALTER TABLE fabricas ADD COLUMN IF NOT EXISTS rif TEXT;
ALTER TABLE fabricas ADD COLUMN IF NOT EXISTS direccion_fiscal TEXT;

-- 2. Catálogo de deducciones
CREATE TABLE IF NOT EXISTS deducciones_catalogo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Facturas
CREATE TABLE IF NOT EXISTS facturas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fabrica_id UUID REFERENCES fabricas(id) NOT NULL,
  semana_fecha DATE NOT NULL,
  semana_nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ganadero', 'transportista', 'ganadero_transportista')),
  ganadero_id UUID REFERENCES ganaderos(id),
  ruta_id UUID REFERENCES rutas(id),
  tercero_codigo TEXT NOT NULL,
  tercero_nombre TEXT NOT NULL,
  tercero_rif TEXT,
  fecha_emision DATE NOT NULL,
  numero_factura TEXT,
  tasa_miercoles NUMERIC NOT NULL DEFAULT 0,
  tasa_factura NUMERIC NOT NULL DEFAULT 0,
  precio_leche_usd NUMERIC NOT NULL DEFAULT 0,
  precio_flete_usd NUMERIC,
  litros_a_pagar NUMERIC NOT NULL DEFAULT 0,
  litros_flete NUMERIC,
  base_bs NUMERIC NOT NULL DEFAULT 0,
  flete_bs NUMERIC DEFAULT 0,
  nota_debito_leche_bs NUMERIC NOT NULL DEFAULT 0,
  nota_debito_flete_bs NUMERIC DEFAULT 0,
  nota_debito_total_bs NUMERIC NOT NULL DEFAULT 0,
  subtotal_bs NUMERIC NOT NULL DEFAULT 0,
  deducciones_total_bs NUMERIC NOT NULL DEFAULT 0,
  base_islr_bs NUMERIC NOT NULL DEFAULT 0,
  islr_bs NUMERIC NOT NULL DEFAULT 0,
  total_bs NUMERIC NOT NULL DEFAULT 0,
  emisor_razon_social TEXT NOT NULL DEFAULT '',
  emisor_rif TEXT NOT NULL DEFAULT '',
  emisor_direccion TEXT NOT NULL DEFAULT '',
  estado TEXT DEFAULT 'emitida' CHECK (estado IN ('borrador', 'emitida', 'anulada')),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Deducciones por factura
CREATE TABLE IF NOT EXISTS facturas_deducciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  factura_id UUID REFERENCES facturas(id) ON DELETE CASCADE NOT NULL,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  monto_bs NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`.trim()

const SEED_SQL = `
INSERT INTO deducciones_catalogo (codigo, nombre)
SELECT t.codigo, t.nombre FROM (VALUES
  ('51', 'Insumos Ganaderos'),
  ('90', 'Deducción por faltante'),
  ('92', 'Deducción por Desviación')
) AS t(codigo, nombre)
WHERE NOT EXISTS (SELECT 1 FROM deducciones_catalogo WHERE codigo = t.codigo);
`.trim()

export async function GET() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const steps: Record<string, string> = {}

  // Verificar si facturas ya existe
  const { data: check } = await supabase.from('facturas').select('id').limit(1)

  if (check === null) {
    return NextResponse.json({
      status: 'PENDING_DDL',
      message: '⚠️ Ejecuta el DDL_SQL en el Editor SQL de Supabase, luego vuelve a llamar este endpoint.',
      ddl_sql: DDL_SQL,
      seed_sql: SEED_SQL,
    })
  }

  steps['facturas_table'] = 'OK (ya existe)'

  // Seed deducciones_catalogo (insert ignore duplicates)
  await supabase.from('deducciones_catalogo' as any).upsert([
    { codigo: '51', nombre: 'Insumos Ganaderos' },
    { codigo: '90', nombre: 'Deducción por faltante' },
    { codigo: '92', nombre: 'Deducción por Desviación' },
  ], { onConflict: 'codigo', ignoreDuplicates: true })
  steps['deducciones_seed'] = 'OK'

  // Verificar deducciones
  const { data: deds } = await supabase.from('deducciones_catalogo' as any).select('codigo, nombre')
  steps['deducciones_count'] = `${(deds as any[])?.length ?? 0} registros`

  return NextResponse.json({
    status: 'OK',
    message: '✅ Migración de facturación verificada',
    ddl_sql: DDL_SQL,
    seed_sql: SEED_SQL,
    steps,
  })
}
