import { SupabaseClient } from '@supabase/supabase-js'

export const logAction = async (supabase: SupabaseClient, user: any, modulo: string, accion: string, detalles: string, metadata: any = {}) => {
  if (!user) return
  try {
    await supabase.from('bitacora').insert({
      usuario_id: user.id,
      usuario_email: user.email,
      modulo,
      accion,
      detalles,
      metadata
    })
  } catch (e) {
    console.error("Error logging action:", e)
  }
}
