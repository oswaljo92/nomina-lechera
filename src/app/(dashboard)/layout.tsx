import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardShell from '@/components/DashboardShell'
import React from 'react'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  // Get user role an profile from our custom table
  const { data: profile } = await supabase
    .from('perfiles_usuarios')
    .select('rol, nombre')
    .eq('id', user.id)
    .single()

  const userRole = profile?.rol || 'analista'
  const userName = profile?.nombre || user.email?.split('@')[0] || 'Usuario'

  return (
    <DashboardShell 
      userRole={userRole as 'admin' | 'analista'} 
      userEmail={user.email || ''} 
      userName={userName}
    >
      {children}
    </DashboardShell>
  )
}
