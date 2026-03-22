import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
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
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar userRole={userRole} userEmail={user.email || ''} userName={userName} />
      
      {/* Contenido principal se desliza a la derecha del sidebar */}
      <main className="flex-1 ml-64 flex flex-col overflow-y-auto">
        <div className="flex-1 w-full max-w-7xl mx-auto p-8 fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
