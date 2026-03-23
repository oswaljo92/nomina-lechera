'use client'

import React, { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import { Menu, X, Settings2, Loader2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface DashboardShellProps {
  children: React.ReactNode
  userRole: 'admin' | 'analista'
  userEmail: string
  userName: string
}

export default function DashboardShell({ children, userRole, userEmail, userName }: DashboardShellProps) {
  const supabase = createClient()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [profileNombre, setProfileNombre] = useState(userName)
  const [profileTelefono, setProfileTelefono] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState(false)

  useEffect(() => {
    if (!isProfileOpen) return
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const { data } = await supabase.from('perfiles_usuarios').select('nombre, telefono').eq('id', user.id).single()
        if (data) {
          setProfileNombre(data.nombre || userName)
          setProfileTelefono(data.telefono || '')
        }
      }
    }
    loadProfile()
  }, [isProfileOpen])

  const handleSaveProfile = async () => {
    setIsSaving(true)
    setProfileError('')

    if (userId) {
      await supabase.from('perfiles_usuarios').update({ nombre: profileNombre, telefono: profileTelefono }).eq('id', userId)
    }

    if (newPassword) {
      if (newPassword !== confirmPassword) {
        setProfileError('Las contraseñas no coinciden.')
        setIsSaving(false)
        return
      }
      if (newPassword.length < 6) {
        setProfileError('La contraseña debe tener al menos 6 caracteres.')
        setIsSaving(false)
        return
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setProfileError('Error al cambiar contraseña: ' + error.message)
        setIsSaving(false)
        return
      }
    }

    setNewPassword('')
    setConfirmPassword('')
    setIsSaving(false)
    setProfileSuccess(true)
    setTimeout(() => { setProfileSuccess(false); setIsProfileOpen(false) }, 1800)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 relative">
      {/* Overlay sidebar en móvil */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          userRole={userRole}
          userEmail={userEmail}
          userName={userName}
          onClose={() => setIsSidebarOpen(false)}
          onProfileOpen={() => setIsProfileOpen(true)}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header móvil */}
        <header className="lg:hidden flex items-center justify-between px-4 h-16 bg-white border-b border-slate-200 shrink-0">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Menú">
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">Nómina Lechera</h1>
          <button onClick={() => setIsProfileOpen(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Mi perfil">
            <Settings2 className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-8 fade-in">{children}</div>
        </div>
      </main>

      {/* Modal de Perfil */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-slate-200 bg-slate-50">
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <Settings2 size={18} className="text-blue-500" /> Mi Perfil
              </h3>
              <button onClick={() => setIsProfileOpen(false)} className="text-slate-400 hover:text-red-500 p-1 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Nombre Completo</label>
                <input type="text" value={profileNombre} onChange={e => setProfileNombre(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold bg-white text-black" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Teléfono</label>
                <input type="text" value={profileTelefono} onChange={e => setProfileTelefono(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold bg-white text-black" placeholder="0414-0000000" />
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Cambiar Contraseña (opcional)</p>
                <div className="space-y-3">
                  <input type="password" placeholder="Nueva contraseña (mín. 6 caracteres)" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold bg-white text-black" />
                  <input type="password" placeholder="Confirmar nueva contraseña" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold bg-white text-black" />
                </div>
              </div>

              {profileError && (
                <p className="text-red-500 text-xs font-semibold bg-red-50 p-3 rounded-lg border border-red-100">{profileError}</p>
              )}
              {profileSuccess && (
                <div className="flex items-center gap-2 text-emerald-700 text-sm font-bold bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                  <CheckCircle2 size={16} /> ¡Perfil actualizado correctamente!
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setIsProfileOpen(false)} className="flex-1 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl text-sm">
                  Cancelar
                </button>
                <button onClick={handleSaveProfile} disabled={isSaving} className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl text-sm shadow-lg shadow-blue-500/20 disabled:opacity-60 flex items-center justify-center gap-2">
                  {isSaving && <Loader2 size={16} className="animate-spin" />}
                  {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
