import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// SQL que el usuario debe ejecutar en el SQL Editor de Supabase
const DDL_SQL = `
-- 1. Crear tabla fabricas
CREATE TABLE IF NOT EXISTS fabricas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  codigo VARCHAR(10) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Insertar las 3 fábricas
INSERT INTO fabricas (codigo, nombre) VALUES
  ('04', 'El Vigía'),
  ('08', 'Quenaca'),
  ('26', 'Barinas')
ON CONFLICT (codigo) DO NOTHING;

-- 3. Agregar fabrica_id a ganaderos
ALTER TABLE ganaderos ADD COLUMN IF NOT EXISTS fabrica_id UUID REFERENCES fabricas(id);

-- 4. Agregar fabrica_id a rutas
ALTER TABLE rutas ADD COLUMN IF NOT EXISTS fabrica_id UUID REFERENCES fabricas(id);

-- 5. Agregar fabrica_id a recepciones_camion
ALTER TABLE recepciones_camion ADD COLUMN IF NOT EXISTS fabrica_id UUID REFERENCES fabricas(id);

-- 6. Asignar registros existentes a El Vigía
UPDATE ganaderos SET fabrica_id = (SELECT id FROM fabricas WHERE codigo = '04') WHERE fabrica_id IS NULL;
UPDATE rutas SET fabrica_id = (SELECT id FROM fabricas WHERE codigo = '04') WHERE fabrica_id IS NULL;
UPDATE recepciones_camion SET fabrica_id = (SELECT id FROM fabricas WHERE codigo = '04') WHERE fabrica_id IS NULL;
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

  // Verificar si fabricas ya existe
  const { data: fabricasCheck } = await supabase.from('fabricas').select('id, codigo, nombre').limit(1)

  if (fabricasCheck === null) {
    // La tabla no existe, retornar el SQL para ejecutar manualmente
    return NextResponse.json({
      status: 'PENDING_DDL',
      message: '⚠️ Debes ejecutar el SQL en el Editor SQL de Supabase primero, luego vuelve a llamar este endpoint.',
      sql_to_run: DDL_SQL
    })
  }

  // La tabla ya existe, hacer los inserts/updates que falten
  const { error: e1 } = await supabase.from('fabricas').upsert([
    { codigo: '04', nombre: 'El Vigía' },
    { codigo: '08', nombre: 'Quenaca' },
    { codigo: '26', nombre: 'Barinas' }
  ], { onConflict: 'codigo' })
  steps['fabricas_upsert'] = e1 ? `ERROR: ${e1.message}` : 'OK'

  const { data: vigia } = await supabase.from('fabricas').select('id').eq('codigo', '04').single()
  const vigiaId = vigia?.id
  if (!vigiaId) {
    return NextResponse.json({ steps, error: 'No se encontró El Vigía en fabricas' }, { status: 500 })
  }
  steps['vigia_id'] = vigiaId

  // Actualizar registros existentes sin fabrica_id
  const { error: eg } = await supabase.from('ganaderos').update({ fabrica_id: vigiaId }).is('fabrica_id', null)
  steps['ganaderos_migrados'] = eg ? `ERROR: ${eg.message}` : 'OK'

  const { error: er } = await supabase.from('rutas').update({ fabrica_id: vigiaId }).is('fabrica_id', null)
  steps['rutas_migradas'] = er ? `ERROR: ${er.message}` : 'OK'

  const { error: ec } = await supabase.from('recepciones_camion').update({ fabrica_id: vigiaId }).is('fabrica_id', null)
  steps['recepciones_migradas'] = ec ? `ERROR: ${ec.message}` : 'OK'

  return NextResponse.json({
    status: 'OK',
    message: '✅ Migración completada exitosamente',
    vigiaId,
    steps
  })
}
