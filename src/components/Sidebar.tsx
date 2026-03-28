'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Milk, Users, Map, Settings, LogOut, X, Settings2, ChevronDown, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useFabrica } from '@/contexts/FabricaContext'

interface SidebarProps {
  userRole: 'admin' | 'analista'
  userEmail: string
  userName?: string
  onClose?: () => void
  onProfileOpen?: () => void
}

export default function Sidebar({
  userRole,
  userEmail,
  userName = 'Usuario',
  onClose,
  onProfileOpen
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { fabricas, selectedFabrica, selectedFabricaId, setSelectedFabricaId } = useFabrica()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.updateUser({ data: { session_token: null } })
    if (typeof window !== 'undefined') {
      localStorage.removeItem('_nl_session')
    }
    await supabase.auth.signOut()
    router.push('/login')
  }

  const menuItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Recepción Litros', href: '/recepcion', icon: Milk },
    { name: 'Ganaderos', href: '/ganaderos', icon: Users },
    { name: 'Rutas', href: '/rutas', icon: Map },
  ]

  if (userRole === 'admin') {
    menuItems.push({ name: 'Configuración', href: '/configuracion', icon: Settings })
  }

  return (
    <aside className="h-full w-full bg-slate-900 text-white flex flex-col shadow-2xl relative">
      {/* Botón cerrar en Mobile */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white lg:hidden z-10"
        >
          <X className="h-6 w-6" />
        </button>
      )}

      {/* Header Sidebar */}
      <div className="flex flex-col items-center justify-center border-b border-slate-800 px-6 pt-5 pb-4 shrink-0 gap-3">
        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
          Nómina Lechera
        </h1>

        {/* Selector de Fábrica — dropdown personalizado */}
        {fabricas.length > 0 && (
          <div className="w-full relative z-50" ref={dropdownRef}>
            {/* Botón trigger */}
            <button
              type="button"
              onClick={() => setDropdownOpen(prev => !prev)}
              className="w-full flex items-center justify-between gap-2 bg-white border border-slate-300 hover:border-blue-400 text-gray-900 rounded-lg px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Check className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="text-xs font-bold truncate text-gray-900">
                  {selectedFabricaId === 'all' ? 'Todas las fábricas' : (selectedFabrica ? selectedFabrica.nombre : 'Seleccionar...')}
                </span>
              </div>
              <ChevronDown
                className={`text-gray-500 shrink-0 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
                size={14}
              />
            </button>

            {/* Panel desplegable */}
            {dropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden" style={{ zIndex: 9999 }}>
                {/* Opción: Todas las fábricas */}
                <button
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault()
                    setSelectedFabricaId('all')
                    setDropdownOpen(false)
                  }}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors border-b border-gray-100 ${
                    selectedFabricaId === 'all'
                      ? 'bg-blue-50 hover:bg-blue-100'
                      : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className={`text-xs font-bold leading-tight ${selectedFabricaId === 'all' ? 'text-blue-700' : 'text-gray-900'}`}>
                      Todas las fábricas
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Sumatoria total
                    </div>
                  </div>
                  {selectedFabricaId === 'all' && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                </button>

                {fabricas.map(f => {
                  const isSelected = f.id === selectedFabricaId
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault()
                        setSelectedFabricaId(f.id)
                        setDropdownOpen(false)
                      }}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors border-b border-gray-100 last:border-0 ${
                        isSelected
                          ? 'bg-blue-50 hover:bg-blue-100'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`text-xs font-bold leading-tight ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                          {f.nombre}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Cód. {f.codigo}
                        </div>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1.5 px-4 py-8 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-4 py-3.5 transition-all duration-200 group ${
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
              <span className="text-sm">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer Sidebar / Perfil */}
      <div className="border-t border-slate-800 p-4 bg-slate-950/40">
        <div className="flex items-center gap-3 px-2 mb-4">
          <div className="h-10 w-10 min-w-[40px] rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold uppercase shadow-lg border border-white/10">
            {userName.charAt(0)}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-bold text-slate-50 leading-tight break-words">{userName}</span>
            <span className="truncate text-[10px] text-slate-400 leading-tight mt-0.5">{userEmail}</span>
            <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wider mt-0.5">{userRole}</span>
          </div>
          {onProfileOpen && (
            <button
              onClick={onProfileOpen}
              className="shrink-0 p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              title="Editar mi perfil"
            >
              <Settings2 size={20} />
            </button>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all border border-transparent hover:border-red-500/20"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  )
}
