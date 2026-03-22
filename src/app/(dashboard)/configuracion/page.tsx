import React from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ConfiguracionTabs from "./ConfiguracionTabs"

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('perfiles_usuarios').select('rol').eq('id', user?.id).single()
  
  if (profile?.rol !== 'admin') {
    redirect('/')
  }

  return <ConfiguracionTabs initialRol={profile?.rol} />
}
