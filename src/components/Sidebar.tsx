'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Milk, Users, Map, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface SidebarProps {
  userRole: 'admin' | 'analista'
  userEmail: string
  userName?: string
}

export default function Sidebar({ userRole, userEmail, userName = 'Usuario' }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const menuItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Recepción Litros', href: '/recepcion', icon: Milk },
    { name: 'Ganaderos', href: '/ganaderos', icon: Users },
    { name: 'Rutas', href: '/rutas', icon: Map },
  ]

  // Add configuration only for admin
  if (userRole === 'admin') {
    menuItems.push({ name: 'Configuración', href: '/configuracion', icon: Settings })
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-slate-900 text-white flex flex-col transition-all duration-300 shadow-2xl z-50">
      {/* Header Sidebar */}
      <div className="flex h-20 items-center justify-center border-b border-slate-800 px-6">
        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
          Nómina Lechera
        </h1>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-2 px-4 py-6 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 group ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 font-medium border border-blue-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-50'
              }`}
            >
              <Icon
                className={`h-5 w-5 transition-transform duration-300 ${
                  isActive ? 'scale-110 text-blue-400' : 'group-hover:scale-110'
                }`}
              />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Footer Sidebar / Perfil */}
      <div className="border-t border-slate-800 p-4 bg-slate-900/50">
        <div className="flex items-center gap-3 px-2 mb-4">
          <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold uppercase shadow-lg">
            {userName.charAt(0)}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-bold text-white">{userName}</span>
            <span className="truncate text-[10px] text-slate-400">{userEmail}</span>
            <span className="text-[10px] text-blue-400 capitalize mt-0.5">{userRole}</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors border border-transparent hover:border-red-500/20"
        >
          <LogOut className="h-4 w-4" />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  )
}
