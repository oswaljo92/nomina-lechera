import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, password, role, nombre, telefono } = await request.json()
    
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el archivo .env.local' }, { status: 500 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (error) {
       return NextResponse.json({ error: error.message }, { status: 400 })
    }
    
    // El trigger en la BD crea el perfil automáticamente como analista,
    // actualizamos al rol asignado y los campos adicionales usando service role
    if (data.user) {
        await supabaseAdmin.from('perfiles_usuarios').update({ 
           rol: role,
           nombre: nombre || 'Usuario',
           telefono: telefono || null
        }).eq('id', data.user.id)
    }

    return NextResponse.json({ user: data.user }, { status: 200 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
