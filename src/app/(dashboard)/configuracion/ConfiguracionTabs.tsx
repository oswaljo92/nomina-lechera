'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Users, FileSpreadsheet, Settings2, RefreshCcw, Loader2, Upload, Download, Trash2, Undo2, Edit2, X, Search, Calculator, Save, History, Image as ImageIcon, CheckCircle2, Building2, Receipt, AlertTriangle, Calendar, Star, ToggleLeft, ToggleRight, Droplets, Truck, Check, ChevronDown } from 'lucide-react'
import { toPng } from 'html-to-image'
import { logAction } from '@/lib/log-utils'
import * as XLSX from 'xlsx'

// CSV Utils
const downloadCSV = (data: any[], filename: string) => {
  if (!data || !data.length) return
  const headers = Object.keys(data[0]).join(',')
  const rows = data.map(obj => Object.values(obj).join(','))
  const csvStr = [headers, ...rows].join('\n')
  const blob = new Blob([csvStr], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const formatDate = (isoStr: string) => {
  if (!isoStr) return ''
  const [y, m, d] = isoStr.split('-')
  return `${d}-${m}-${y}`
}

// ─── Dialog in-app (reemplaza alert/confirm nativos) ─────────────────────────
type DialogCfg = {
  type: 'alert' | 'confirm'
  title: string
  message: string
  confirmLabel: string
  confirmCls: string
  icon: 'info' | 'warn' | 'success' | 'error'
  resolve: (v: boolean) => void
}

function AppDialog({ cfg, onClose }: { cfg: DialogCfg | null; onClose: (v: boolean) => void }) {
  if (!cfg) return null
  const iconMap = {
    info:    <div className="p-2.5 rounded-xl bg-blue-50"><AlertTriangle size={20} className="text-blue-500" /></div>,
    warn:    <div className="p-2.5 rounded-xl bg-amber-50"><AlertTriangle size={20} className="text-amber-500" /></div>,
    success: <div className="p-2.5 rounded-xl bg-emerald-50"><CheckCircle2 size={20} className="text-emerald-500" /></div>,
    error:   <div className="p-2.5 rounded-xl bg-red-50"><X size={20} className="text-red-500" /></div>,
  }
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3">
          {iconMap[cfg.icon]}
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-slate-800 text-base">{cfg.title}</h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{cfg.message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          {cfg.type === 'confirm' && (
            <button onClick={() => onClose(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
          )}
          <button onClick={() => onClose(true)}
            className={`px-4 py-2 rounded-xl text-white font-bold text-sm transition-colors ${cfg.confirmCls}`}>
            {cfg.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function useDialog() {
  const [cfg, setCfg] = useState<DialogCfg | null>(null)

  const showConfirm = useCallback((message: string, opts?: {
    title?: string; confirmLabel?: string; danger?: boolean
  }): Promise<boolean> => {
    return new Promise(resolve => setCfg({
      type: 'confirm',
      title: opts?.title ?? 'Confirmar acción',
      message,
      confirmLabel: opts?.confirmLabel ?? 'Confirmar',
      confirmCls: opts?.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700',
      icon: opts?.danger ? 'warn' : 'info',
      resolve,
    }))
  }, [])

  const showAlert = useCallback((message: string, opts?: {
    title?: string; kind?: 'info' | 'success' | 'error'
  }): Promise<void> => {
    const kind = opts?.kind ?? 'info'
    return new Promise(resolve => setCfg({
      type: 'alert',
      title: opts?.title ?? (kind === 'error' ? 'Error' : kind === 'success' ? '¡Listo!' : 'Aviso'),
      message,
      confirmLabel: 'Aceptar',
      confirmCls: kind === 'error' ? 'bg-red-600 hover:bg-red-700' : kind === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700',
      icon: kind,
      resolve: () => resolve(),
    }))
  }, [])

  const handleClose = useCallback((v: boolean) => {
    cfg?.resolve(v)
    setCfg(null)
  }, [cfg])

  const Dialog = <AppDialog cfg={cfg} onClose={handleClose} />
  return { showConfirm, showAlert, Dialog }
}

function UsuariosTab({ user, onOpenBitacora }: { user: any, onOpenBitacora?: () => void }) {
  const supabase = createClient()
  const [usuariosActivos, setUsuariosActivos] = useState<any[]>([])
  const [usuariosBorrados, setUsuariosBorrados] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMSG, setErrorMSG] = useState('')
  const [verBorrados, setVerBorrados] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [nuevoUser, setNuevoUser] = useState({ email: '', password: '', role: 'analista', nombre: '', telefono: '' })
  const [editUser, setEditUser] = useState<any>(null)
  const [editUserPassword, setEditUserPassword] = useState('')
  const [editUserEmail, setEditUserEmail] = useState('')
  const [importRows, setImportRows] = useState<any[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; errores: string[] } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
         setIsCreateModalOpen(false)
         setIsEditModalOpen(false)
         setIsImportModalOpen(false)
         setEditUserPassword('')
         setEditUserEmail('')
         setErrorMSG('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const load = async () => {
     const { data } = await supabase.from('perfiles_usuarios').select('*').order('created_at', { ascending: false })
     if (data) {
        setUsuariosActivos(data.filter(u => u.activo !== false))
        setUsuariosBorrados(data.filter(u => u.activo === false))
     }
  }

  const toggleStatus = async (id: string, activo: boolean, email: string) => {
     await supabase.from('perfiles_usuarios').update({ activo }).eq('id', id)
     logAction(supabase, user, 'Usuarios', activo ? 'RESTAURAR' : 'DESACTIVAR', `${activo ? 'Restaurado' : 'Desactivado'} acceso para: ${email}`)
     load()
  }

  const handleCrearUsuario = async (e: React.FormEvent) => {
     e.preventDefault()
     setLoading(true)
     setErrorMSG('')
     
     const res = await fetch('/api/users', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(nuevoUser)
     })
     const data = await res.json()
     if (!res.ok) {
         setErrorMSG(data.error)
     } else {
         logAction(supabase, user, 'Usuarios', 'CREAR', `Usuario registrado: ${nuevoUser.email} con rol ${nuevoUser.role}`)
         setNuevoUser({ email: '', password: '', role: 'analista', nombre: '', telefono: '' })
         setIsCreateModalOpen(false)
         load()
     }
     setLoading(false)
  }

  const handleEditUsuario = async (e: React.FormEvent) => {
     e.preventDefault()
     setLoading(true)
     setErrorMSG('')

     await supabase.from('perfiles_usuarios').update({
        rol: editUser.rol,
        nombre: editUser.nombre,
        telefono: editUser.telefono
     }).eq('id', editUser.id)

     const needsAuthUpdate = editUserPassword || (editUserEmail && editUserEmail !== editUser.email)
     if (needsAuthUpdate) {
        if (editUserPassword && editUserPassword.length < 6) {
           setErrorMSG('La contraseña debe tener al menos 6 caracteres.')
           setLoading(false)
           return
        }
        const body: any = { userId: editUser.id }
        if (editUserPassword) body.newPassword = editUserPassword
        if (editUserEmail && editUserEmail !== editUser.email) body.newEmail = editUserEmail

        const res = await fetch('/api/users', {
           method: 'PATCH',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(body)
        })
        const data = await res.json()
        if (!res.ok) {
           setErrorMSG(data.error)
           setLoading(false)
           return
        }
        if (editUserPassword) logAction(supabase, user, 'Usuarios', 'CAMBIAR_CLAVE', `Contraseña cambiada para: ${editUser.email}`)
        if (body.newEmail) logAction(supabase, user, 'Usuarios', 'CAMBIAR_CORREO', `Correo actualizado: ${editUser.email} → ${body.newEmail}`)
     }
     logAction(supabase, user, 'Usuarios', 'EDITAR', `Editado usuario: ${editUser.email}`)
     setEditUserPassword('')
     setEditUserEmail('')
     setIsEditModalOpen(false)
     load()
     setLoading(false)
  }

  const handleExportUsuarios = () => {
     const rows = [...usuariosActivos, ...usuariosBorrados].map(u => ({
        'Nombre': u.nombre || '',
        'Correo': u.email || '',
        'Teléfono': u.telefono || '',
        'Rol': u.rol || '',
        'Activo': u.activo !== false ? 'SI' : 'NO'
     }))
     const ws = XLSX.utils.json_to_sheet(rows)
     const wb = XLSX.utils.book_new()
     XLSX.utils.book_append_sheet(wb, ws, 'Usuarios')
     XLSX.writeFile(wb, 'usuarios.xlsx')
  }

  const handleArchivoImportUsuarios = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0]
     if (!file) return
     const reader = new FileReader()
     reader.onload = (ev) => {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
        setImportRows(rows); setImportResult(null); setIsImportModalOpen(true)
     }
     reader.readAsArrayBuffer(file)
     e.target.value = ''
  }

  const handleConfirmarImportUsuarios = async () => {
     setImportLoading(true)
     const errores: string[] = []
     let ok = 0
     for (let i = 0; i < importRows.length; i++) {
        const row = importRows[i]
        const fila = i + 2
        const email = String(row['Correo*'] || row['Correo'] || '').trim()
        const nombre = String(row['Nombre*'] || row['Nombre'] || '').trim()
        const password = String(row['Contraseña*'] || row['Contraseña'] || '').trim()
        const role = String(row['Rol (admin/analista)*'] || row['Rol'] || 'analista').trim().toLowerCase()

        if (!email) { errores.push(`Fila ${fila}: Falta el correo.`); continue }
        if (!password || password.length < 6) { errores.push(`Fila ${fila}: Contraseña inválida (mín 6 caracteres).`); continue }
        if (!['admin', 'analista'].includes(role)) { errores.push(`Fila ${fila}: Rol debe ser 'admin' o 'analista'.`); continue }

        const res = await fetch('/api/users', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ email, password, role, nombre, telefono: String(row['Teléfono'] || '').trim() })
        })
        if (!res.ok) {
           const d = await res.json()
           errores.push(`Fila ${fila} (${email}): ${d.error}`)
           continue
        }
        ok++
     }
     logAction(supabase, user, 'Usuarios', 'IMPORTAR_MASIVO', `Importados ${ok} usuarios. Errores: ${errores.length}`)
     setImportResult({ ok, errores })
     setImportLoading(false)
     if (ok > 0) load()
  }

  const uList = verBorrados ? usuariosBorrados : usuariosActivos

  return (
     <div className="space-y-6 fade-in">
       {/* Listado */}
       <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 flex flex-col sm:flex-row sm:justify-between sm:items-center p-4 border-b border-slate-200 gap-3">
             <div>
               <h3 className="font-bold text-slate-800 text-lg">{verBorrados ? 'Usuarios Eliminados' : 'Directorio de Usuarios'}</h3>
               <p className="text-xs text-slate-500">{verBorrados ? 'Usuarios que no tienen acceso al sistema.' : 'Personal con acceso al sistema.'}</p>
             </div>
             <div className="flex gap-2 flex-wrap">
                <button onClick={()=>setVerBorrados(!verBorrados)} className="text-sm font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 bg-white px-4 py-2 rounded-lg shadow-sm transition-colors">
                   {verBorrados ? 'Ver Activos' : 'Ver Borrados'}
                </button>
                <button onClick={handleExportUsuarios} className="flex items-center gap-2 text-sm font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-4 py-2 rounded-lg shadow-sm hover:bg-emerald-100 transition-colors">
                   <Download size={15}/> Exportar
                </button>
                <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 text-sm font-bold text-blue-700 border border-blue-200 bg-blue-50 px-4 py-2 rounded-lg shadow-sm hover:bg-blue-100 transition-colors">
                   <Upload size={15}/> Importar Excel
                </button>
                <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleArchivoImportUsuarios} />
                {!verBorrados && (
                  <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg shadow-sm transition-colors">
                     <Plus size={16}/> Nuevo
                  </button>
                )}
             </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
               <thead className="bg-slate-50">
                  <tr>
                     <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Acciones</th>
                     <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Nombre / Teléfono</th>
                     <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Correo</th>
                     <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Rol</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-200 p-4">
                  {uList.map(u => (
                     <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 flex gap-2">
                          {verBorrados ? (
                            <button onClick={()=>toggleStatus(u.id, true, u.email)} className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 bg-emerald-50 p-2 rounded transition-colors tooltip" title="Restaurar Usuario">
                              <Undo2 size={16}/>
                            </button>
                          ) : (
                            <>
                              <button onClick={()=>{setEditUser(u); setEditUserEmail(''); setIsEditModalOpen(true)}} className="text-blue-600 hover:text-white hover:bg-blue-600 bg-blue-50 p-2 rounded transition-colors" title="Editar Rol y Datos">
                                <Edit2 size={16}/>
                              </button>
                              <button onClick={()=>toggleStatus(u.id, false, u.email)} className="text-red-600 hover:text-white hover:bg-red-600 bg-red-50 p-2 rounded transition-colors" title="Desactivar/Borrar Usuario">
                                <Trash2 size={16}/>
                              </button>
                            </>
                          )}
                        </td>
                        <td className="px-6 py-4">
                           <div className="font-extrabold text-slate-800">{u.nombre || '-'}</div>
                           <div className="text-xs font-medium text-slate-500">{u.telefono || '-'}</div>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-700">{u.email}</td>
                        <td className="px-6 py-4 text-sm font-bold capitalize text-slate-600">
                           {u.rol}
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
          </div>
       </div>

       {/* Creación Modal */}
       {isCreateModalOpen && (
          <div onClick={(e) => { if(e.target === e.currentTarget) setIsCreateModalOpen(false) }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in pb-10">
             <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden zoom-in-95 relative">
                {loading && <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-8 h-8"/></div>}
                <div className="flex justify-between items-center bg-slate-100 border-b border-slate-200">
                   <h3 className="font-bold text-slate-800 text-sm px-6">Crear Nuevo Usuario</h3>
                   <button type="button" onClick={() => setIsCreateModalOpen(false)} className="text-slate-500 hover:text-white hover:bg-red-500 px-5 py-4 transition-colors">
                      <X size={18}/>
                   </button>
                </div>
                <form className="p-6 space-y-4" onSubmit={handleCrearUsuario}>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Nombre Completo (Display)</label>
                       <input autoFocus required type="text" value={nuevoUser.nombre} onChange={e=>setNuevoUser({...nuevoUser, nombre: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 placeholder-slate-400" placeholder="Ej: Juan Perez" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Teléfono</label>
                       <input type="text" value={nuevoUser.telefono} onChange={e=>setNuevoUser({...nuevoUser, telefono: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 placeholder-slate-400" placeholder="0414-0000000" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Correo Electrónico (Login)</label>
                       <input required type="email" value={nuevoUser.email} onChange={e=>setNuevoUser({...nuevoUser, email: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 placeholder-slate-400" placeholder="correo@empresa.com" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Contraseña</label>
                          <input required minLength={6} type="password" value={nuevoUser.password} onChange={e=>setNuevoUser({...nuevoUser, password: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 placeholder-slate-400" placeholder="Mínimo 6" />
                       </div>
                       <div>
                          <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Rol de Acceso</label>
                          <select value={nuevoUser.role} onChange={e=>setNuevoUser({...nuevoUser, role: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
                             <option value="analista">Analista (Limitado)</option>
                             <option value="admin">Administrador (Total)</option>
                          </select>
                       </div>
                    </div>
                    {errorMSG && <p className="text-red-500 text-sm font-semibold pt-2">{errorMSG}</p>}
                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-4">
                       <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold w-full py-3.5 rounded-xl shadow-lg shadow-blue-500/30 transition-all">
                          Registrar Usuario en el Sistema
                       </button>
                    </div>
                </form>
             </div>
          </div>
       )}

       {/* Edición Modal */}
       {isEditModalOpen && editUser && (
          <div onClick={(e) => { if(e.target === e.currentTarget) setIsEditModalOpen(false) }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in pb-10">
             <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden zoom-in-95 relative">
                {loading && <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-8 h-8"/></div>}
                <div className="flex justify-between items-center bg-slate-100 border-b border-slate-200">
                   <h3 className="font-bold text-slate-800 text-sm px-6">Editar Usuario: {editUser.nombre || editUser.email}</h3>
                   <button type="button" onClick={() => { setIsEditModalOpen(false); setEditUserPassword(''); setEditUserEmail(''); setErrorMSG('') }} className="text-slate-500 hover:text-white hover:bg-red-500 px-5 py-4 transition-colors">
                      <X size={18}/>
                   </button>
                </div>
                <form className="p-6 space-y-4" onSubmit={handleEditUsuario}>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Nombre Completo</label>
                       <input autoFocus required type="text" value={editUser.nombre || ''} onChange={e=>setEditUser({...editUser, nombre: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 placeholder-slate-400" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Teléfono</label>
                       <input type="text" value={editUser.telefono || ''} onChange={e=>setEditUser({...editUser, telefono: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 placeholder-slate-400" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Rol de Acceso</label>
                       <select value={editUser.rol} onChange={e=>setEditUser({...editUser, rol: e.target.value})} className="w-full bg-white text-black font-bold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
                          <option value="analista">Analista</option>
                          <option value="admin">Administrador</option>
                       </select>
                    </div>
                    <div className="border-t border-slate-100 pt-4">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Credenciales de Acceso (Admin)</p>
                       <div className="space-y-3">
                          <div>
                             <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Nuevo Correo Electrónico <span className="text-slate-400 font-normal normal-case">(dejar vacío para no cambiar)</span></label>
                             <input type="email" value={editUserEmail} onChange={e=>setEditUserEmail(e.target.value)} placeholder={editUser.email} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 placeholder-slate-400" />
                          </div>
                          <div>
                             <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Nueva Contraseña <span className="text-slate-400 font-normal normal-case">(dejar vacío para no cambiar)</span></label>
                             <input type="password" value={editUserPassword} onChange={e=>setEditUserPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 placeholder-slate-400" />
                          </div>
                       </div>
                    </div>
                    {errorMSG && <p className="text-red-500 text-sm font-semibold">{errorMSG}</p>}
                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-4">
                       <button type="button" onClick={()=>{setIsEditModalOpen(false); setEditUserPassword(''); setEditUserEmail(''); setErrorMSG('')}} className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3.5 px-6 rounded-xl transition-all">
                          Cancelar
                       </button>
                       <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold flex-1 rounded-xl shadow-lg shadow-blue-500/30 transition-all">
                          Guardar Cambios
                       </button>
                    </div>
                </form>
             </div>
          </div>
        )}

       {/* Modal Importar Usuarios Excel */}
       {isImportModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
             <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-auto overflow-hidden animate-in zoom-in-95">
                <div className="flex justify-between items-center bg-slate-50 border-b border-slate-200 p-4">
                   <h3 className="font-black text-slate-800 text-sm flex items-center gap-2"><Upload size={16} className="text-blue-600"/> Importar Usuarios desde Excel</h3>
                   <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                </div>
                <div className="p-4 sm:p-6">
                   {importResult ? (
                      <div className="space-y-4">
                         <div className="flex gap-4">
                            <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                               <CheckCircle2 className="text-emerald-500 mx-auto mb-2" size={32}/>
                               <p className="text-2xl font-black text-emerald-700">{importResult.ok}</p>
                               <p className="text-xs font-bold text-emerald-600">Usuarios creados</p>
                            </div>
                            {importResult.errores.length > 0 && (
                               <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                                  <X className="text-red-500 mx-auto mb-2" size={32}/>
                                  <p className="text-2xl font-black text-red-700">{importResult.errores.length}</p>
                                  <p className="text-xs font-bold text-red-600">Filas con error</p>
                               </div>
                            )}
                         </div>
                         {importResult.errores.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-h-48 overflow-y-auto space-y-1">
                               {importResult.errores.map((e, i) => <p key={i} className="text-xs text-red-700 font-semibold">• {e}</p>)}
                            </div>
                         )}
                         <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }} className="w-full bg-blue-600 text-white font-black py-3 rounded-xl">Cerrar</button>
                      </div>
                   ) : (
                      <div className="space-y-4">
                         <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <p className="text-xs font-bold text-amber-800">⚠️ Columnas requeridas: <span className="font-black">Nombre*, Correo*, Contraseña*, Rol (admin/analista)*</span>. Opcional: Teléfono</p>
                         </div>
                         <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                            <p className="text-xs font-bold text-blue-700">Se encontraron <span className="text-blue-900">{importRows.length} filas</span> en el archivo.</p>
                         </div>
                         <div className="overflow-x-auto max-h-64 border border-slate-200 rounded-xl">
                            <table className="min-w-full text-xs">
                               <thead className="bg-slate-50 sticky top-0">
                                  <tr>
                                     <th className="px-3 py-2 text-left font-black text-slate-500">#</th>
                                     {importRows.length > 0 && Object.keys(importRows[0]).map(col => (
                                        <th key={col} className="px-3 py-2 text-left font-black text-slate-500 whitespace-nowrap">{col}</th>
                                     ))}
                                  </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-100">
                                  {importRows.map((row, i) => (
                                     <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 font-bold text-slate-400">{i + 2}</td>
                                        {Object.keys(importRows[0]).map(col => (
                                           <td key={col} className="px-3 py-2 text-slate-700 whitespace-nowrap">{String(row[col] ?? '')}</td>
                                        ))}
                                     </tr>
                                  ))}
                               </tbody>
                            </table>
                         </div>
                         <div className="grid grid-cols-2 gap-3 pt-2">
                            <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }} className="bg-slate-100 text-slate-600 font-bold py-3 rounded-xl">Cancelar</button>
                            <button onClick={handleConfirmarImportUsuarios} disabled={importLoading}
                               className="bg-blue-600 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
                               {importLoading ? <><Loader2 size={16} className="animate-spin"/> Importando...</> : <><Upload size={16}/> Confirmar</>}
                            </button>
                         </div>
                      </div>
                   )}
                </div>
             </div>
          </div>
       )}

     </div>
  )
}

function TasasRow({ t, actualizarTasa, semana }: { t: any, actualizarTasa: any, semana: string }) {
  const [isEditing, setIsEditing] = useState(false)
  const [val, setVal] = useState(t.tasa)
  const [diaVal, setDiaVal] = useState(t.dia || '')

  const handleSave = () => {
    actualizarTasa(t.fecha, Number(val), diaVal)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setVal(t.tasa)
    setDiaVal(t.dia || '')
    setIsEditing(false)
  }

  return (
     <tr className="hover:bg-slate-50">
        <td className="px-4 py-4 text-sm whitespace-nowrap">
           {isEditing ? (
             <div className="flex gap-1">
               <button onClick={handleSave} className="bg-blue-600 text-white p-1.5 rounded font-bold"><Save size={14}/></button>
               <button onClick={handleCancel} className="bg-slate-200 hover:bg-red-100 text-slate-600 hover:text-red-600 p-1.5 rounded font-bold"><X size={14}/></button>
             </div>
           ) : (
             <button onClick={() => setIsEditing(true)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-1.5 rounded font-bold"><Edit2 size={14}/></button>
           )}
        </td>
        <td className="px-6 py-4 text-sm font-extrabold text-slate-800">{formatDate(t.fecha)}</td>
        <td className="px-6 py-4 text-sm font-bold text-blue-700">
           <span className="bg-blue-50 border border-blue-100 px-2 py-1 rounded-md text-[10px] uppercase tracking-wider">{semana}</span>
        </td>
        <td className="px-6 py-4 text-sm font-semibold text-slate-600 capitalize">
           {isEditing ? (
             <input type="text" value={diaVal} onChange={e => setDiaVal(e.target.value)} className="border border-slate-300 bg-white text-black font-semibold rounded p-1.5 w-full focus:ring-2 focus:ring-blue-500" />
           ) : (
             t.dia
           )}
        </td>
        <td className="px-6 py-4 text-sm text-slate-500">
           {isEditing ? (
             <input
               type="number" step="0.0001"
               value={val}
               onChange={(e) => setVal(e.target.value)}
               className="border border-slate-300 bg-white text-black font-extrabold rounded p-1.5 w-32 focus:ring-2 focus:ring-blue-500"
              />
           ) : (
             <span className="font-extrabold">{t.tasa} Bs</span>
           )}
        </td>
     </tr>
  )
}

function TasasTab({ user, onOpenBitacora }: { user: any, onOpenBitacora?: () => void }) {
  const supabase = createClient()
  const { showAlert, Dialog } = useDialog()
  const [tasas, setTasas] = useState<any[]>([])
  const [semanasGanaderas, setSemanasGanaderas] = useState<any[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newRow, setNewRow] = useState({ fecha: '', dia: 'Miércoles', tasa: '' })
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => { load() }, [])
  const load = async () => {
    const { data } = await supabase.from('tasas_bcv').select('*').order('fecha', { ascending: false })
    if (data) setTasas(data)

    // Cargar semanas_ganaderas para vinculación automática
    const { data: sData } = await supabase.from('semanas_ganaderas').select('*')
    if (sData) setSemanasGanaderas(sData)
  }

  const actualizarTasa = async (fecha: string, nuevaTasa: number, nuevoDia: string) => {
    await supabase.from('tasas_bcv').update({ tasa: nuevaTasa, dia: nuevoDia }).eq('fecha', fecha)
    logAction(supabase, user, 'Tasas BCV', 'EDITAR', `Modificada tasa del ${formatDate(fecha)} a ${nuevaTasa} Bs`)
    load()
  }

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('tasas_bcv').insert({ 
       fecha: newRow.fecha, 
       dia: newRow.dia, 
       tasa: parseFloat(newRow.tasa)
    })
    logAction(supabase, user, 'Tasas BCV', 'CREAR', `Nuevo registro: ${formatDate(newRow.fecha)} Tasa: ${newRow.tasa} Bs`)
    setIsModalOpen(false)
    setNewRow({fecha: '', dia: 'Miércoles', tasa: ''})
    load()
  }

  const handleDescargarPlantillaTasas = () => {
    const ws = XLSX.utils.json_to_sheet([{ 'Fecha (YYYY-MM-DD)*': '2025-01-15', 'Día*': 'Miércoles', 'Tasa BCV*': 36.5200 }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, 'plantilla_tasas_bcv.xlsx')
  }

  const handleExportTasas = () => {
    const rows = tasas.map(t => {
      const match = semanasGanaderas.find(s => s.fecha === t.fecha)
      return { 'Fecha': t.fecha, 'Día': t.dia, 'Semana Ganadera': match ? `Semana ${match.semana}` : '', 'Tasa BCV': t.tasa }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tasas BCV')
    XLSX.writeFile(wb, 'tasas_bcv.xlsx')
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
       const data = new Uint8Array(evt.target?.result as ArrayBuffer)
       const wb = XLSX.read(data, { type: 'array' })
       const ws = wb.Sheets[wb.SheetNames[0]]
       const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
       const bulk: any[] = []
       for (const row of rows) {
         const fecha = String(row['Fecha (YYYY-MM-DD)*'] || row['Fecha'] || '').trim()
         const dia = String(row['Día*'] || row['Día'] || '').trim()
         const tasaStr = String(row['Tasa BCV*'] || row['Tasa BCV'] || '')
         if (fecha && !isNaN(parseFloat(tasaStr))) {
           bulk.push({ fecha, dia, tasa: parseFloat(tasaStr) })
         }
       }
       if (bulk.length > 0) {
         await supabase.from('tasas_bcv').upsert(bulk)
         logAction(supabase, user, 'Tasas BCV', 'IMPORTAR', `Importados ${bulk.length} registros de tasas`)
         load()
         showAlert(`${bulk.length} tasas importadas con éxito.`, { kind: 'success' })
       } else {
         showAlert('Archivo vacío o formato incorrecto.', { kind: 'error' })
       }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const tasasFiltradas = tasas.filter(t => {
     const match = semanasGanaderas.find(s => s.fecha === t.fecha)
     const semStr = match ? `semana ${match.semana}` : ''
     const searchLower = busqueda.toLowerCase()
     
     return t.fecha.includes(busqueda) || 
            String(t.tasa).includes(busqueda) ||
            (t.dia && t.dia.toLowerCase().includes(searchLower)) ||
            (semStr && semStr.includes(searchLower))
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col gap-3">
           <div className="flex justify-between items-center">
             <h3 className="font-bold text-slate-800">Tasas Registradas</h3>
           </div>
           <input
             type="text"
             placeholder="Buscar fecha, día o tasa..."
             value={busqueda}
             onChange={e=>setBusqueda(e.target.value)}
             className="border border-slate-300 bg-white text-slate-900 font-medium placeholder-slate-500 rounded-lg p-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 shadow-sm w-full"
           />
           <div className="flex flex-wrap gap-2 items-center">
              {onOpenBitacora && (
                <button onClick={onOpenBitacora} className="flex items-center gap-2 bg-slate-200 text-slate-600 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                  <History size={16}/> Bitácora
                </button>
              )}
              <button onClick={handleDescargarPlantillaTasas} className="flex items-center gap-2 bg-slate-200 text-slate-700 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                <FileSpreadsheet size={16}/> Plantilla
              </button>
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                <Upload size={16}/> Importar Excel
              </button>
              <input type="file" accept=".xlsx,.xls" ref={fileRef} className="hidden" onChange={handleUpload}/>
              <button onClick={handleExportTasas} className="flex items-center gap-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                <Download size={16}/> Exportar Excel
              </button>
              <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm ml-auto">
                <Plus size={16}/> Nuevo
              </button>
           </div>
        </div>
        {/* Vista móvil - Tarjetas */}
        <div className="sm:hidden divide-y divide-slate-100">
          {tasasFiltradas.length === 0 ? (
            <p className="py-8 text-center text-slate-400 font-bold">Sin registros</p>
          ) : tasasFiltradas.map(t => {
            const match = semanasGanaderas.find(s => s.fecha === t.fecha)
            const semName = match ? `Semana ${match.semana}` : '-'
            return (
              <div key={t.fecha} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-extrabold text-slate-800">{formatDate(t.fecha)}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="bg-blue-50 border border-blue-100 px-2 py-0.5 rounded text-[10px] font-bold text-blue-700 uppercase">{semName}</span>
                      <span className="text-xs text-slate-500 capitalize">{t.dia}</span>
                    </div>
                  </div>
                  <span className="text-lg font-black text-slate-800 shrink-0">{t.tasa} Bs</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Vista escritorio - Tabla */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
               <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Acciones</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Fecha (DD-MM-YYYY)</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Semana Ganadera</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Día</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Tasa BS BCV</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 p-4">
               {tasasFiltradas.map(t => {
                  const match = semanasGanaderas.find(s => s.fecha_inicio === t.fecha)
                  const semName = match ? `Semana ${match.numero_semana}` : '-'
                  return <TasasRow key={t.fecha} t={t} actualizarTasa={actualizarTasa} semana={semName} />
               })}
               {tasasFiltradas.length === 0 && (
                  <tr>
                     <td colSpan={5} className="py-8 text-center text-slate-400 font-bold border-t">No se detectaron registros de Tasas BCV</td>
                  </tr>
               )}
            </tbody>
          </table>
        </div>

        {isModalOpen && (
          <div onClick={(e) => { if(e.target === e.currentTarget) setIsModalOpen(false) }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in pb-10">
             <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden zoom-in-95 relative">
                <div className="flex justify-between items-center bg-slate-100 border-b border-slate-200">
                   <h3 className="font-bold text-slate-800 text-sm px-6">Nuevo Registro de Tasa</h3>
                   <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white hover:bg-red-500 px-5 py-4 transition-colors">
                      <X size={18}/>
                   </button>
                </div>
                <form className="p-6 space-y-4" onSubmit={handleSaveModal}>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Fecha</label>
                       <input required type="date" value={newRow.fecha} onChange={e=>setNewRow({...newRow, fecha: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Día de la semana</label>
                       <input required type="text" value={newRow.dia} onChange={e=>setNewRow({...newRow, dia: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500" placeholder="Ej: Miércoles" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Tasa (BCV)</label>
                       <input required type="number" step="0.0001" value={newRow.tasa} onChange={e=>setNewRow({...newRow, tasa: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500" placeholder="Ej: 36.502" />
                    </div>
                    <div className="pt-4 flex justify-end gap-3 mt-4">
                       <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full py-3.5 rounded-xl transition-all">
                          Guardar Tasa
                       </button>
                    </div>
                </form>
             </div>
          </div>
       )}
    {Dialog}
    </div>
  )
}

function CriosRow({ t, actualizarCrio }: { t: any, actualizarCrio: any }) {
  const [isEditing, setIsEditing] = useState(false)
  const [val, setVal] = useState(t.porcentaje_agua)

  const handleSave = () => {
    actualizarCrio(t.punto_crioscopico, Number(val))
    setIsEditing(false)
  }

  const handleCancel = () => {
    setVal(t.porcentaje_agua)
    setIsEditing(false)
  }

  return (
     <tr className="hover:bg-slate-50">
        <td className="px-4 py-4 text-sm whitespace-nowrap">
           {isEditing ? (
             <div className="flex gap-1">
               <button onClick={handleSave} className="bg-blue-600 text-white p-1.5 rounded font-bold"><Save size={14}/></button>
               <button onClick={handleCancel} className="bg-slate-200 hover:bg-red-100 text-slate-600 hover:text-red-600 p-1.5 rounded font-bold"><X size={14}/></button>
             </div>
           ) : (
             <button onClick={() => setIsEditing(true)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-1.5 rounded font-bold"><Edit2 size={14}/></button>
           )}
        </td>
        <td className="px-6 py-4 text-sm font-black text-purple-800 tracking-tight">{t.punto_crioscopico}</td>
        <td className="px-6 py-4 text-sm text-slate-500">
           {isEditing ? (
             <input
               type="number" step="0.1"
               value={val}
               onChange={(e) => setVal(e.target.value)}
               className="border border-slate-300 bg-white text-red-600 font-extrabold rounded p-1.5 w-32 focus:ring-2 focus:ring-blue-500"
              />
           ) : (
             <span className="font-extrabold">{t.porcentaje_agua}%</span>
           )}
        </td>
     </tr>
  )
}

function CrioscopiaTab({ user, onOpenBitacora }: { user: any, onOpenBitacora?: () => void }) {
  const supabase = createClient()
  const { showAlert, Dialog } = useDialog()
  const [crios, setCrios] = useState<any[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newRow, setNewRow] = useState({ punto_crioscopico: '', porcentaje_agua: '' })
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => { load() }, [])
  const load = async () => {
    const { data } = await supabase.from('tabla_crioscopia').select('*').order('punto_crioscopico', { ascending: false })
    if (data) setCrios(data)
  }

  const criosFiltrados = crios.filter(c => 
     String(c.punto_crioscopico).includes(busqueda) || 
     String(c.porcentaje_agua).includes(busqueda)
  )

  const actualizarCrio = async (pc: number, agua: number) => {
    await supabase.from('tabla_crioscopia').update({ porcentaje_agua: agua }).eq('punto_crioscopico', pc)
    logAction(supabase, user, 'Crioscopía', 'EDITAR', `Modificado PC ${pc} a ${agua}% agua`)
    load()
  }

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('tabla_crioscopia').insert({ 
       punto_crioscopico: parseFloat(newRow.punto_crioscopico), 
       porcentaje_agua: parseFloat(newRow.porcentaje_agua)
    })
    logAction(supabase, user, 'Crioscopía', 'CREAR', `Nuevo PC: ${newRow.punto_crioscopico} con ${newRow.porcentaje_agua}% agua`)
    setIsModalOpen(false)
    setNewRow({punto_crioscopico: '', porcentaje_agua: ''})
    load()
  }

  const handleDescargarPlantillaCrios = () => {
    const ws = XLSX.utils.json_to_sheet([{ 'Punto Crioscopico*': -0.530, '% Agua*': 0.0 }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, 'plantilla_crioscopia.xlsx')
  }

  const handleExportCrios = () => {
    const rows = crios.map(c => ({ 'Punto Crioscopico': c.punto_crioscopico, '% Agua': c.porcentaje_agua }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Crioscopía')
    XLSX.writeFile(wb, 'tabla_crioscopia.xlsx')
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
       const data = new Uint8Array(evt.target?.result as ArrayBuffer)
       const wb = XLSX.read(data, { type: 'array' })
       const ws = wb.Sheets[wb.SheetNames[0]]
       const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
       const bulk: any[] = []
       for (const row of rows) {
         const pc = parseFloat(String(row['Punto Crioscopico*'] || row['Punto Crioscopico'] || ''))
         const pct = parseFloat(String(row['% Agua*'] || row['% Agua'] || ''))
         if (!isNaN(pc) && !isNaN(pct)) bulk.push({ punto_crioscopico: pc, porcentaje_agua: pct })
       }
       if (bulk.length > 0) {
         await supabase.from('tabla_crioscopia').upsert(bulk)
         logAction(supabase, user, 'Crioscopía', 'IMPORTAR', `Importados ${bulk.length} puntos de crioscopía`)
         load()
         showAlert(`${bulk.length} puntos crioscópicos importados.`, { kind: 'success' })
       } else {
         showAlert('Archivo vacío o formato incorrecto.', { kind: 'error' })
       }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col gap-3">
           <div className="flex justify-between items-center">
             <h3 className="font-bold text-slate-800">Puntos Crioscópicos</h3>
           </div>
           <input
             type="text"
             placeholder="Buscar punto o %..."
             value={busqueda}
             onChange={e=>setBusqueda(e.target.value)}
             className="border border-slate-300 bg-white text-slate-900 font-medium placeholder-slate-500 rounded-lg p-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 shadow-sm w-full"
           />
           <div className="flex flex-wrap gap-2 items-center">
              {onOpenBitacora && (
                <button onClick={onOpenBitacora} className="flex items-center gap-2 bg-slate-200 text-slate-600 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                  <History size={16}/> Bitácora
                </button>
              )}
              <button onClick={handleDescargarPlantillaCrios} className="flex items-center gap-2 bg-slate-200 text-slate-700 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                <FileSpreadsheet size={16}/> Plantilla
              </button>
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                <Upload size={16}/> Importar Excel
              </button>
              <input type="file" accept=".xlsx,.xls" ref={fileRef} className="hidden" onChange={handleUpload}/>
              <button onClick={handleExportCrios} className="flex items-center gap-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                <Download size={16}/> Exportar Excel
              </button>
              <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm ml-auto">
                <Plus size={16}/> Nuevo
              </button>
           </div>
        </div>
        {/* Vista móvil - Tarjetas */}
        <div className="sm:hidden divide-y divide-slate-100">
          {criosFiltrados.length === 0 ? (
            <p className="py-8 text-center text-slate-400 font-bold">Sin registros</p>
          ) : criosFiltrados.map(t => (
            <div key={t.punto_crioscopico} className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-0.5">Punto Crioscópico</p>
                <span className="font-black text-purple-800 text-xl">{t.punto_crioscopico}</span>
                <span className="text-xs text-slate-500 ml-1">°H</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-0.5">% Dcto Agua</p>
                <span className="font-black text-red-600 text-xl">{t.porcentaje_agua}%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Vista escritorio - Tabla */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
               <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Acciones</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Punto (°H)</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">% Dcto Agua</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 p-4">
               {criosFiltrados.map(t => (
                  <CriosRow key={t.punto_crioscopico} t={t} actualizarCrio={actualizarCrio} />
               ))}
               {criosFiltrados.length === 0 && (
                  <tr>
                     <td colSpan={3} className="py-8 text-center text-slate-400 font-bold border-t">No se detectaron registros</td>
                  </tr>
               )}
            </tbody>
          </table>
        </div>

        {isModalOpen && (
          <div onClick={(e) => { if(e.target === e.currentTarget) setIsModalOpen(false) }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in pb-10">
             <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden zoom-in-95 relative">
                <div className="flex justify-between items-center bg-slate-100 border-b border-slate-200">
                   <h3 className="font-bold text-slate-800 text-sm px-6">Nuevo Registro Crioscopía</h3>
                   <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white hover:bg-red-500 px-5 py-4 transition-colors">
                      <X size={18}/>
                   </button>
                </div>
                <form className="p-6 space-y-4" onSubmit={handleSaveModal}>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Punto Crioscópico</label>
                       <input autoFocus required type="number" step="0.001" value={newRow.punto_crioscopico} onChange={e=>setNewRow({...newRow, punto_crioscopico: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500" placeholder="Ej: -0.530" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">% de Agua</label>
                       <input required type="number" step="0.1" value={newRow.porcentaje_agua} onChange={e=>setNewRow({...newRow, porcentaje_agua: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500" placeholder="Ej: 0.0" />
                    </div>
                    <div className="pt-4 flex justify-end gap-3 mt-4">
                       <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full py-3.5 rounded-xl transition-all">
                          Guardar Puntos
                       </button>
                    </div>
                </form>
             </div>
          </div>
       )}
    {Dialog}
    </div>
  )
}

function MultiSelectGanaderos({ options, selected, onChange, disabled }: any) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const filtered = options.filter((o:any) => o.nombre.toLowerCase().includes(search.toLowerCase()) || o.codigo_ganadero.toLowerCase().includes(search.toLowerCase()))
  
  return (
    <div className="relative w-full">
      <div className={`rounded bg-white min-h-[36px] p-1 flex flex-wrap gap-1 items-center ${disabled ? 'opacity-90 cursor-default' : 'cursor-text border border-slate-300'}`} onClick={()=>{if(!disabled) setOpen(true)}}>
         {selected.map((cod:string) => {
            const op = options.find((o:any) => o.codigo_ganadero === cod)
            return <div key={cod} className="bg-blue-100 text-blue-800 text-[10px] sm:text-xs px-2 py-0.5 rounded shadow-sm text-left font-bold">{op ? `${op.codigo_ganadero} ${op.nombre}` : cod}</div>
         })}
         {!disabled && (
           <input type="text" value={search} onChange={e=>setSearch(e.target.value)} className="outline-none flex-1 min-w-[50px] text-xs font-semibold px-1" placeholder={selected.length===0?"Buscar ganaderos...":""} />
         )}
      </div>
      {open && !disabled && (
         <div className="absolute top-full left-0 z-[60] min-w-[300px] w-full mt-1 bg-white border border-slate-300 rounded shadow-2xl max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2">
             <div className="p-2 border-b text-xs flex justify-between bg-slate-50 sticky top-0">
               <button type="button" onClick={(e)=>{e.stopPropagation(); onChange([])}} className="text-red-600 font-bold hover:underline">Limpiar</button>
               <button type="button" onClick={(e)=>{e.stopPropagation(); setOpen(false); setSearch('')}} className="text-slate-600 font-bold hover:underline">Cerrar</button>
             </div>
             {filtered.map((o:any) => (
                <div key={o.codigo_ganadero} onClick={()=>{
                   if(selected.includes(o.codigo_ganadero)) onChange(selected.filter((x:string)=>x!==o.codigo_ganadero))
                   else onChange([...selected, o.codigo_ganadero])
                }} className={`px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-slate-100 ${selected.includes(o.codigo_ganadero)?'bg-blue-50 text-blue-800':''}`}>
                  {o.nombre} <span className="text-slate-500 font-normal">({o.codigo_ganadero})</span> {o.rutas?.codigo_ruta ? ` - ${o.rutas.codigo_ruta}` : ''}
                </div>
             ))}
             {filtered.length === 0 && <div className="p-3 text-xs text-center text-slate-500">No hay coincidencias</div>}
         </div>
      )}
    </div>
  )
}

function PreciosRow({ p, tasaBase, ganaderosList, actualizarPrecio, borrarPrecio, onSelect, isSelected, onCancel }: any) {
  const { showAlert, Dialog: RowDialog } = useDialog()
  const [isEditing, setIsEditing] = useState(!p.id)
  const [lecheUSD, setLecheUSD] = useState(p.precio_leche_usd || 0)
  const [fleteUSD, setFleteUSD] = useState(p.precio_flete_usd || 0)
  const [grupoNombre, setGrupoNombre] = useState(p.grupo || '')
  const [ganaderosStr, setGanaderosStr] = useState<string[]>(p.ganaderos || [])

  const handleCancel = () => {
    if (!p.id && onCancel) { onCancel(); return }
    setLecheUSD(p.precio_leche_usd || 0)
    setFleteUSD(p.precio_flete_usd || 0)
    setGrupoNombre(p.grupo || '')
    setGanaderosStr(p.ganaderos || [])
    setIsEditing(false)
  }
  
  const selectedGanaderosObjs = ganaderosList.filter((g:any) => ganaderosStr.includes(g.codigo_ganadero))
  const rutasList = Array.from(new Set(selectedGanaderosObjs.map((g:any) => g.rutas?.codigo_ruta).filter(Boolean)))

  const totalBs = (Number(lecheUSD) + Number(fleteUSD)) * tasaBase
  const totalUSD = Number(lecheUSD) + Number(fleteUSD)

  const handleSave = async () => {
     if (!grupoNombre || ganaderosStr.length === 0) { await showAlert('Ingrese un Grupo y seleccione al menos un Ganadero.', { kind: 'error' }); return }  // eslint-disable-line
     actualizarPrecio(p.id, {
       grupo: grupoNombre,
       ganaderos: ganaderosStr,
       rutas: rutasList,
       precio_leche_usd: Number(lecheUSD),
       precio_flete_usd: Number(fleteUSD),
       precio_leche_bs: Math.round(Number(lecheUSD) * tasaBase * 1000) / 1000,
       precio_flete_bs: Math.round(Number(fleteUSD) * tasaBase * 1000) / 1000,
       total_pagar_usd: Number(totalUSD),
       total_pagar_bs: Number(totalBs)
     })
     setIsEditing(false)
  }

  const lecheBs = Number(lecheUSD) * tasaBase
  const fleteBs = Number(fleteUSD) * tasaBase

  return (
    <>
    <tr className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}>
       <td className="no-export border border-slate-200 text-center py-2 px-2">
         {p.id && <input type="checkbox" checked={isSelected} onChange={(e) => onSelect(p.id, e.target.checked)} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"/>}
       </td>
       <td className="border border-slate-200 text-center font-extrabold text-slate-800 py-3">
         {rutasList.length > 0 ? (
           <div className="flex flex-wrap gap-1 justify-center px-1">
             {rutasList.map(r => <span key={r as string} className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">{r as string}</span>)}
           </div>
         ) : '-'}
       </td>
       <td className="border border-slate-200 text-center font-bold text-slate-600 py-2 px-1">
         {isEditing ? (
           <input type="text" value={grupoNombre} onChange={e=>setGrupoNombre(e.target.value)} placeholder="Ej: 35" className="w-20 bg-white border border-slate-300 rounded p-1.5 text-xs font-bold uppercase"/>
         ) : (
           <span className="uppercase text-xs">{grupoNombre}</span>
         )}
       </td>
       <td className="border border-slate-200 text-left font-bold text-slate-800 px-3 py-2 min-w-[200px]">
          <MultiSelectGanaderos options={ganaderosList} selected={ganaderosStr} onChange={setGanaderosStr} disabled={!isEditing} />
       </td>
       
       <td className="border border-slate-200 text-center text-slate-600 font-bold px-1">
         {isEditing ? (
            <input type="number" step="0.001" value={lecheUSD} onChange={e=>setLecheUSD(e.target.value)} className="border border-slate-300 bg-white text-black font-extrabold rounded p-1.5 w-20 text-xs focus:ring-2 focus:ring-blue-500" />
         ) : (
            <span className="whitespace-nowrap text-xs">{Number(lecheUSD).toLocaleString('es-VE',{minimumFractionDigits:3})} $</span>
         )}
       </td>
       <td className="border border-slate-200 text-center text-slate-600 font-bold px-1">
         {isEditing ? (
            <input type="number" step="0.001" value={fleteUSD} onChange={e=>setFleteUSD(e.target.value)} className="border border-slate-300 bg-white text-black font-extrabold rounded p-1.5 w-20 text-xs focus:ring-2 focus:ring-blue-500" />
         ) : (
            <span className="whitespace-nowrap text-xs">{Number(fleteUSD).toLocaleString('es-VE',{minimumFractionDigits:3})} $</span>
         )}
       </td>
       
       <td className="border border-slate-200 text-right px-3 font-extrabold text-slate-800 bg-blue-50/50 whitespace-nowrap">{lecheBs.toLocaleString('es-VE',{minimumFractionDigits:3})} Bs</td>
       <td className="border border-slate-200 text-right px-3 font-extrabold text-slate-800 bg-teal-50/50 whitespace-nowrap">{fleteBs.toLocaleString('es-VE',{minimumFractionDigits:3})} Bs</td>
       
       <td className="border border-slate-200 text-right px-3 font-black text-emerald-700 bg-slate-50 whitespace-nowrap">{totalBs.toLocaleString('es-VE',{minimumFractionDigits:3})} Bs</td>
       <td className="border border-slate-200 text-right px-3 font-black text-emerald-700 bg-slate-50 whitespace-nowrap">{totalUSD.toLocaleString('es-VE',{minimumFractionDigits:3})} $</td>
       <td className="no-export border border-slate-200 text-center py-2 space-x-1 px-2 whitespace-nowrap">
         {isEditing ? (
           <>
             <button onClick={handleSave} className="bg-blue-600 text-white px-2 py-1.5 rounded shadow-sm hover:bg-blue-700 transition-colors"><Save size={16}/></button>
             <button onClick={handleCancel} className="bg-slate-100 text-red-500 px-2 py-1.5 rounded hover:bg-red-100 transition-colors" title="Cancelar"><X size={16}/></button>
           </>
         ) : (
           <button onClick={() => setIsEditing(true)} className="bg-slate-200 text-slate-700 px-2 py-1.5 rounded hover:bg-slate-300 transition-colors"><Edit2 size={16}/></button>
         )}
         {p.id && !isEditing && (
           <button onClick={() => borrarPrecio(p.id, p.grupo)} className="bg-red-50 text-red-600 px-2 py-1.5 rounded hover:bg-red-600 hover:text-white transition-colors"><Trash2 size={16}/></button>
         )}
       </td>
    </tr>
    {RowDialog}
    </>
  )
}

function PreciosTab({ user, onOpenBitacora }: { user: any, onOpenBitacora?: () => void }) {
  const supabase = createClient()
  const { showConfirm, showAlert, Dialog } = useDialog()
  const tableRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const semanaDropdownRef = useRef<HTMLDivElement>(null)
  const [semanas, setSemanas] = useState<any[]>([])
  const [selectedSemana, setSelectedSemana] = useState('')
  const [semanaDropdownOpen, setSemanaDropdownOpen] = useState(false)
  const [tasaBase, setTasaBase] = useState(0)

  const [precios, setPrecios] = useState<any[]>([])
  const [ganaderosList, setGanaderosList] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [dbError, setDbError] = useState('')
  const [selectedRows, setSelectedRows] = useState<string[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [sinPrecio, setSinPrecio] = useState<any[]>([])
  const [sinPrecioLoading, setSinPrecioLoading] = useState(false)

  // Import
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importRows, setImportRows] = useState<any[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; errores: string[] } | null>(null)

  useEffect(() => {
     async function pop() {
        const { data } = await supabase.from('tasas_bcv')
                         .select('*')
                         .in('dia', ['miercoles', 'Miércoles', 'miércoles', 'Miercoles'])
                         .order('fecha', { ascending: false })
                         
        if (data && data.length > 0) {
           setSemanas(data)
           
           // Detectar el miércoles de la semana actual usando fecha LOCAL (evita desfase UTC)
           const now = new Date()
           const day = now.getDay()
           const diff = (day < 3 ? 7 : 0) + day - 3
           const prevWed = new Date(now)
           prevWed.setDate(now.getDate() - diff)
           const y = prevWed.getFullYear()
           const mo = String(prevWed.getMonth() + 1).padStart(2, '0')
           const d = String(prevWed.getDate()).padStart(2, '0')
           const wedStr = `${y}-${mo}-${d}`
           
           const exist = data.find((d:any) => d.fecha === wedStr)
           if (exist) {
             setSelectedSemana(exist.fecha)
             setTasaBase(exist.tasa)
           } else {
             setSelectedSemana(data[0].fecha)
             setTasaBase(data[0].tasa)
           }
        }
        
        // Cargar ganaderos para el dropdown
        const { data: gs } = await supabase.from('ganaderos').select('codigo_ganadero, nombre, grupo, rutas!ruta_id(nombre_ruta, codigo_ruta)').eq('activo', true)
        if (gs) setGanaderosList(gs)
     }
     pop()
  }, [])

  useEffect(() => {
     if (selectedSemana) {
        setIsLoading(true)
        setDbError('')
        setSelectedRows([])
        const tObj = semanas.find(s => s.fecha === selectedSemana)
        if (tObj) setTasaBase(tObj.tasa)

        async function fetchPrefs() {
           const { data, error } = await supabase.from('precios_semanales').select('*').eq('fecha_semana', selectedSemana).order('created_at')
           if (error) {
              setDbError('Error: ' + error.message)
              setPrecios([])
           } else if (data) {
              setPrecios(data)
           }
           setIsLoading(false)
        }
        fetchPrefs()
        fetchSinPrecio(selectedSemana)
     }
  }, [selectedSemana, semanas])

  async function fetchSinPrecio(semana: string) {
    setSinPrecioLoading(true)
    // 1. Buscar todos los ganaderos activos
    const { data: gans } = await supabase
      .from('ganaderos')
      .select('id, codigo_ganadero, nombre, grupo, rutas!ruta_id(nombre_ruta, codigo_ruta, fabricas(nombre, codigo))')
      .eq('activo', true)
    // 2. Buscar los precios de la semana
    const { data: precsData } = await supabase
      .from('precios_semanales')
      .select('grupo')
      .eq('fecha_semana', semana)
    const gruposConPrecio = new Set((precsData || []).map((p: any) => p.grupo))
    // 3. Ganaderos cuyo grupo no tiene precio en esta semana
    const sinP = (gans || []).filter((g: any) => !g.grupo || !gruposConPrecio.has(g.grupo))
    if (sinP.length === 0) { setSinPrecio([]); setSinPrecioLoading(false); return }

    // 4. Calcular el martes fin de semana
    const wedParts = semana.split('-')
    const wed = new Date(parseInt(wedParts[0]), parseInt(wedParts[1])-1, parseInt(wedParts[2]))
    const tue = new Date(wed); tue.setDate(wed.getDate() + 6)
    const tueFmt = `${tue.getFullYear()}-${String(tue.getMonth()+1).padStart(2,'0')}-${String(tue.getDate()).padStart(2,'0')}`

    // 5. Buscar recepciones de esos ganaderos en el rango de la semana
    const ids = sinP.map((g: any) => g.id)
    const { data: recs } = await supabase
      .from('recepciones_detalle')
      .select('ganadero_id, litros_recepcion, recepciones_camion(fecha_ingreso)')
      .in('ganadero_id', ids)
      .gte('recepciones_camion.fecha_ingreso', semana)
      .lte('recepciones_camion.fecha_ingreso', tueFmt + 'T23:59:59')

    // 6. Sumar litros por ganadero
    const litrosMap = new Map<string, number>()
    for (const r of recs || []) {
      const camion = Array.isArray(r.recepciones_camion) ? r.recepciones_camion[0] : r.recepciones_camion
      const fechaIngreso: string | undefined = (camion as any)?.fecha_ingreso
      if (!fechaIngreso) continue
      const fecha = fechaIngreso.substring(0, 10)
      if (fecha >= semana && fecha <= tueFmt) {
        litrosMap.set(r.ganadero_id, (litrosMap.get(r.ganadero_id) || 0) + Number(r.litros_recepcion || 0))
      }
    }

    // 7. Adjuntar litros y ordenar: con litros primero
    const sinPConLitros = sinP
      .map((g: any) => ({ ...g, litrosSemana: litrosMap.get(g.id) || 0 }))
      .sort((a: any, b: any) => b.litrosSemana - a.litrosSemana)

    setSinPrecio(sinPConLitros)
    setSinPrecioLoading(false)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (semanaDropdownRef.current && !semanaDropdownRef.current.contains(e.target as Node)) {
        setSemanaDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const getSemanaGanadera = (isoDate: string): string => {
    const p = isoDate.substring(0, 10).split('-')
    const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]))
    const daysSinceWed = (d.getDay() - 3 + 7) % 7
    const wed = new Date(d); wed.setDate(d.getDate() - daysSinceWed)
    return `${wed.getFullYear()}-${String(wed.getMonth()+1).padStart(2,'0')}-${String(wed.getDate()).padStart(2,'0')}`
  }

  const formatSemanaLabel = (wedStr: string): string => {
    const fmt = (dt: Date) => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`
    const p = wedStr.split('-')
    const wed = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]))
    const tue = new Date(wed); tue.setDate(wed.getDate() + 6)
    return `Mié ${fmt(wed)} – Mar ${fmt(tue)}/${tue.getFullYear()}`
  }

  const getNumeroSemana = (wedStr: string): number => {
    const p = wedStr.split('-')
    const wed = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]))
    const jan1 = new Date(wed.getFullYear(), 0, 1)
    const daysBack = (jan1.getDay() - 3 + 7) % 7
    const firstWed = new Date(jan1); firstWed.setDate(jan1.getDate() - daysBack)
    const weekNum = Math.round((wed.getTime() - firstWed.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    return weekNum > 0 ? weekNum : 1
  }

  const actualizarPrecio = async (id: string, payload: any) => {
      if (!id) {
        const { error } = await supabase.from('precios_semanales').insert({
          ...payload,
          fecha_semana: selectedSemana
        })
        if(error) { await showAlert('Error al guardar: ' + error.message, { kind: 'error' }); return }
        logAction(supabase, user, 'Precios', 'CREAR', `Añadido precio semanal para Grupo ${payload.grupo} en la semana ${formatDate(selectedSemana)}`)
        setIsAdding(false)
      } else {
        const { error } = await supabase.from('precios_semanales').update(payload).eq('id', id)
        if(error) { await showAlert('Error al guardar: ' + error.message, { kind: 'error' }); return }
        logAction(supabase, user, 'Precios', 'EDITAR', `Actualizado precio semanal Grupo ${payload.grupo} (Semana ${formatDate(selectedSemana)})`)
      }

      // Sincronizar grupo en ganaderos y en rutas (transporte)
      if (payload.ganaderos?.length > 0)
        await supabase.from('ganaderos').update({ grupo: payload.grupo }).in('codigo_ganadero', payload.ganaderos)
      if (payload.rutas?.length > 0)
        await supabase.from('rutas').update({ grupo: payload.grupo }).in('codigo_ruta', payload.rutas)

      const { data } = await supabase.from('precios_semanales').select('*').eq('fecha_semana', selectedSemana).order('created_at')
      if(data) setPrecios(data)
   }

   const borrarPrecio = async (id: string, grupo: string) => {
      const ok = await showConfirm(`¿Borrar configuración de precio del grupo "${grupo}"?`, { danger: true, confirmLabel: 'Borrar' })
      if (!ok) return
      await supabase.from('precios_semanales').delete().eq('id', id)
      logAction(supabase, user, 'Precios', 'BORRAR', `Eliminado registro de precios para el grupo ${grupo} de la semana ${formatDate(selectedSemana)}`)
      setPrecios(p => p.filter(x => x.id !== id))
      setSelectedRows(s => s.filter(x => x !== id))
   }

  const handleMassDelete = async () => {
    if (selectedRows.length === 0) return
    const ok = await showConfirm(`¿Borrar ${selectedRows.length} registros seleccionados?`, { danger: true, confirmLabel: 'Borrar todo' })
    if (!ok) return
        await supabase.from('precios_semanales').delete().in('id', selectedRows)
     logAction(supabase, user, 'Precios', 'BORRAR_MASIVO', `Eliminados ${selectedRows.length} registros de precios en la semana ${formatDate(selectedSemana)}`)
     setPrecios(p => p.filter(x => !selectedRows.includes(x.id)))
     setSelectedRows([])
   }

  const exportAsExcel = () => {
    const rows = precios.map(p => ({
      'Semana': formatDate(selectedSemana),
      'Grupo': p.grupo || '',
      'Ganaderos': (p.ganaderos || []).join(', '),
      'Rutas': (p.rutas || []).join(', '),
      'Precio Leche USD': p.precio_leche_usd || 0,
      'Precio Flete USD': p.precio_flete_usd || 0,
      'Total USD': p.total_pagar_usd || 0,
      'Total Bs': p.total_pagar_bs || 0,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Precios')
    XLSX.writeFile(wb, `precios_${selectedSemana}.xlsx`)
    logAction(supabase, user, 'Precios', 'EXPORTAR', `Exportados precios de la semana ${formatDate(selectedSemana)}`)
  }

  const exportAsImage = async () => {
    if (!tableRef.current) return
    try {
      const el = tableRef.current
      const toHide = el.querySelectorAll<HTMLElement>('.no-export')
      toHide.forEach(e => { e.dataset.oldDisplay = e.style.display; e.style.display = 'none' })
      const dataUrl = await toPng(el, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        width: el.scrollWidth,
        height: el.scrollHeight,
        style: { overflow: 'visible' }
      })
      toHide.forEach(e => { e.style.display = e.dataset.oldDisplay || '' })
      const link = document.createElement('a')
      link.download = `PreciosSemanales-${selectedSemana}.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      showAlert('Error al exportar como imagen.', { kind: 'error' })
      console.error(e)
    }
  }

  const handleDescargarPlantillaPrecios = () => {
    const ejemplo = [{
      'Grupo': 'G001',
      'Ganaderos (códigos separados por coma)': 'G001,G002,G003',
      'Precio Leche USD': 0.35,
      'Precio Flete USD': 0.05
    }]
    const ws = XLSX.utils.json_to_sheet(ejemplo)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, 'plantilla_precios.xlsx')
  }

  const handleArchivoImportPrecios = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
      setImportRows(rows)
      setImportResult(null)
      setIsImportModalOpen(true)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleConfirmarImportPrecios = async () => {
    if (!selectedSemana) { await showAlert('Selecciona una semana antes de importar.', { kind: 'error' }); return }
    setImportLoading(true)
    const errores: string[] = []
    let ok = 0

    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i]
      const fila = i + 2
      const grupo = String(row['Grupo'] || '').trim()
      const ganaderosCsv = String(row['Ganaderos (códigos separados por coma)'] || '').trim()
      const precioLeche = parseFloat(String(row['Precio Leche USD'] || '0')) || 0
      const precioFlete = parseFloat(String(row['Precio Flete USD'] || '0')) || 0

      if (!grupo) { errores.push(`Fila ${fila}: Falta el Grupo.`); continue }
      if (!ganaderosCsv) { errores.push(`Fila ${fila}: Falta la lista de Ganaderos.`); continue }

      const ganaderosCodes = ganaderosCsv.split(',').map((c: string) => c.trim()).filter(Boolean)
      const total_pagar_usd = precioLeche + precioFlete
      const total_pagar_bs = total_pagar_usd * tasaBase

      // Derive rutas from ganaderos
      const rutasSet = new Set<string>()
      ganaderosCodes.forEach((cod: string) => {
        const g = ganaderosList.find((gl: any) => gl.codigo_ganadero === cod)
        const rutaCod = g?.rutas?.codigo_ruta || g?.rutas?.[0]?.codigo_ruta
        if (rutaCod) rutasSet.add(rutaCod)
      })

      const payload = {
        fecha_semana: selectedSemana,
        grupo,
        ganaderos: ganaderosCodes,
        rutas: Array.from(rutasSet),
        precio_leche_usd: precioLeche,
        precio_flete_usd: precioFlete,
        precio_leche_bs: Math.round(precioLeche * tasaBase * 1000) / 1000,
        precio_flete_bs: Math.round(precioFlete * tasaBase * 1000) / 1000,
        total_pagar_usd,
        total_pagar_bs
      }

      const { error } = await supabase.from('precios_semanales').upsert(payload, { onConflict: 'fecha_semana,grupo' })
      if (error) { errores.push(`Fila ${fila}: Error — ${error.message}`); continue }
      // Sincronizar grupo en ganaderos y en rutas (transporte)
      if (ganaderosCodes.length > 0)
        await supabase.from('ganaderos').update({ grupo }).in('codigo_ganadero', ganaderosCodes)
      if (Array.from(rutasSet).length > 0)
        await supabase.from('rutas').update({ grupo }).in('codigo_ruta', Array.from(rutasSet))
      ok++
    }

    logAction(supabase, user, 'Precios', 'IMPORTAR_MASIVO', `Importados ${ok} grupos de precios para la semana ${formatDate(selectedSemana)}. Errores: ${errores.length}`)
    setImportResult({ ok, errores })
    setImportLoading(false)
    if (ok > 0) {
      const { data } = await supabase.from('precios_semanales').select('*').eq('fecha_semana', selectedSemana).order('created_at')
      if (data) setPrecios(data)
    }
  }

  return (
    <div className="space-y-6">

       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
           <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Semana de Apertura</label>
              <div className="relative" ref={semanaDropdownRef}>
                <button
                  type="button"
                  onClick={() => setSemanaDropdownOpen(o => !o)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-xl transition-colors select-none"
                >
                  {selectedSemana ? (
                    <>
                      <span className="text-[10px] font-black uppercase">Sem</span>
                      <span className="text-lg font-black leading-none">{getNumeroSemana(selectedSemana)}</span>
                      <span className="text-xs font-bold">{formatSemanaLabel(selectedSemana)}</span>
                    </>
                  ) : (
                    <span className="text-xs font-bold">Sin semanas mapeadas</span>
                  )}
                  <svg className={`w-3 h-3 ml-1 transition-transform duration-200 ${semanaDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {semanaDropdownOpen && semanas.length > 0 && (
                  <div className="absolute top-full left-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden" style={{ zIndex: 9999, minWidth: '280px' }}>
                    <div className="max-h-72 overflow-y-auto">
                      {semanas.map(s => {
                        const isSelected = s.fecha === selectedSemana
                        return (
                          <button
                            key={s.fecha}
                            type="button"
                            onMouseDown={e => {
                              e.preventDefault()
                              setSelectedSemana(s.fecha)
                              setSemanaDropdownOpen(false)
                            }}
                            className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors border-b border-gray-100 last:border-0 ${
                              isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-gray-50'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className={`text-xs font-bold leading-tight ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                                Semana {getNumeroSemana(s.fecha)}
                              </div>
                              <div className="text-[10px] text-gray-700 mt-0.5">{formatSemanaLabel(s.fecha)}</div>
                            </div>
                            {isSelected && <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
           </div>
           <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Tasa BCV Referencial</label>
              <input type="number" readOnly value={tasaBase} className="w-full bg-slate-100 border border-slate-200 text-blue-800 font-black rounded-lg p-2.5" />
           </div>
       </div>

       {dbError && (
          <div className="bg-red-50 text-red-800 p-4 rounded-xl border border-red-200 shadow-sm animate-in fade-in slide-in-from-top-2">
            <h4 className="font-bold mb-2">Se requiere actualización de Base de Datos</h4>
            <p className="text-sm">Elimina la antigua tabla de precios (si existe) y ejecuta este SQL exacto en tu Supabase para habilitar el agrupamiento múltiple y los cálculos automáticos:</p>
            <pre className="text-xs bg-red-100 p-3 mt-2 rounded overflow-x-auto text-red-900 border border-red-200">
              {`DROP TABLE IF EXISTS precios_semanales;

CREATE TABLE precios_semanales (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fecha_semana DATE NOT NULL,
  grupo TEXT NOT NULL,
  ganaderos JSONB NOT NULL DEFAULT '[]',
  rutas JSONB NOT NULL DEFAULT '[]',
  precio_leche_usd NUMERIC NOT NULL DEFAULT 0,
  precio_flete_usd NUMERIC NOT NULL DEFAULT 0,
  total_pagar_usd NUMERIC NOT NULL DEFAULT 0,
  total_pagar_bs NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(fecha_semana, grupo)
);`}
            </pre>
          </div>
       )}

       <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
             <div className="flex items-center gap-3">
               <h3 className="font-bold text-slate-800 hidden md:block">Precios por Grupo</h3>
               <div className="grid grid-cols-2 gap-1.5">
                 <button onClick={exportAsImage} className="flex items-center gap-1.5 bg-slate-200 text-slate-700 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                   <ImageIcon size={14}/> Exportar Foto
                 </button>
                 <button onClick={exportAsExcel} className="flex items-center gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                   <Download size={14}/> Exportar Excel
                 </button>
                 <button onClick={handleDescargarPlantillaPrecios} className="flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                   <FileSpreadsheet size={14}/> Plantilla
                 </button>
                 <button onClick={() => importRef.current?.click()} className="flex items-center gap-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                   <Upload size={14}/> Importar Excel
                 </button>
                 <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleArchivoImportPrecios} />
               </div>
             </div>

             <div className="flex gap-2 items-center">
               <div className="relative group">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                  <input
                    type="text"
                    placeholder="Buscar por grupo, ruta, $/Bs..."
                    value={busqueda}
                    onChange={e=>setBusqueda(e.target.value)}
                    className="border border-slate-300 bg-white text-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 shadow-sm w-48 md:w-56"
                  />
               </div>
               <button
                 onClick={handleMassDelete}
                 disabled={selectedRows.length === 0}
                 className={`flex shrink-0 items-center gap-2 bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm ${selectedRows.length === 0 ? 'invisible' : ''}`}
               >
                 <Trash2 size={14}/> Eliminar ({selectedRows.length})
               </button>
               <button onClick={() => setIsAdding(true)} disabled={!!dbError} className="flex shrink-0 items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm disabled:opacity-50">
                 <Plus size={14}/> Nuevo Grupo
               </button>
             </div>
          </div>

          {isLoading ? (
             <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>
          ) : (
             <div className="overflow-x-auto pb-64" ref={tableRef}>
               <table className="min-w-full divide-y divide-slate-200 border-collapse table-auto text-sm">
                  <thead className="border-b-2 border-slate-300">
                     <tr>
                        <th className="no-export py-2 px-2 border border-slate-300 bg-slate-50 text-center text-slate-400" rowSpan={2}>
                           <input type="checkbox" checked={precios.length > 0 && selectedRows.length === precios.length} onChange={(e) => setSelectedRows(e.target.checked ? precios.map(p=>p.id) : [])} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"/>
                        </th>
                        <th className="py-2 px-3 border border-slate-300 bg-[#3b82f6] font-extrabold text-center text-white uppercase text-[11px]" rowSpan={2}>Rutas</th>
                        <th className="py-2 px-3 border border-slate-300 bg-[#3b82f6] font-extrabold text-center text-white uppercase text-[11px]" rowSpan={2}>Grupo</th>
                        <th className="py-2 px-3 border border-slate-300 bg-[#3b82f6] font-black text-center text-white text-[11px]" rowSpan={2}>BENEFICIARIO</th>
                        <th className="py-2 px-3 border border-slate-300 bg-[#3b82f6] font-extrabold text-center text-white uppercase text-[11px]" colSpan={4}>PRECIOS POR LITRO</th>
                        <th className="py-2 px-3 border border-slate-300 bg-[#3b82f6] font-extrabold text-center text-white uppercase text-[11px]" colSpan={2}>TOTAL A PAGAR A PUERTA PLANTA</th>
                        <th className="no-export py-2 px-3 border border-slate-300 bg-slate-50 font-extrabold text-center text-slate-800 text-xs" rowSpan={2}>Acciones</th>
                     </tr>
                     <tr className="bg-slate-50">
                        <th className="py-2 px-2 border border-slate-300 text-[10px] text-center font-bold">Precio a Pta. Corral Prov. $</th>
                        <th className="py-2 px-2 border border-slate-300 text-[10px] text-center font-bold">Precio de flete $</th>
                        <th className="py-2 px-3 border border-slate-300 text-[11px] font-black text-white bg-[#3b82f6]">Precio Leche Bs</th>
                        <th className="py-2 px-3 border border-slate-300 text-[11px] font-black text-white bg-[#3b82f6]">Precio de Flete Bs</th>
                        <th className="py-2 px-3 border border-slate-300 text-[11px] font-black text-slate-800 bg-[#eef6f9]">Total Pagar Bs</th>
                        <th className="py-2 px-3 border border-slate-300 text-[11px] font-black text-slate-800 bg-[#eef6f9]">Total Pagar $</th>
                     </tr>
                  </thead>
                  <tbody className="bg-white">
                     {isAdding && (
                        <PreciosRow p={{}} tasaBase={tasaBase} ganaderosList={ganaderosList} actualizarPrecio={actualizarPrecio} borrarPrecio={borrarPrecio} isSelected={false} onSelect={()=>{}} onCancel={() => setIsAdding(false)} />
                     )}
                     {precios
                        .filter(p => {
                           if (!busqueda) return true
                           const s = busqueda.toLowerCase()
                           // Buscar por nombre de ganadero también
                           const matchesGanadero = (p.ganaderos || []).some((cod:string) => {
                              const gObj = ganaderosList.find((gl:any) => gl.codigo_ganadero === cod)
                              return cod.toLowerCase().includes(s) || gObj?.nombre?.toLowerCase().includes(s)
                           })
                           return p.grupo?.toLowerCase().includes(s) || 
                                 matchesGanadero ||
                                 (p.rutas || []).some((r:string)=>r.toLowerCase().includes(s)) ||
                                 String(p.precio_leche_usd).includes(s) ||
                                 String(p.precio_flete_usd).includes(s) ||
                                 String(p.total_pagar_bs).includes(s) ||
                                 String(p.total_pagar_usd).includes(s)
                        })
                        .sort((a,b) => {
                          const numA = parseInt(a.grupo)
                          const numB = parseInt(b.grupo)
                          if (!isNaN(numA) && !isNaN(numB)) return numA - numB
                          return a.grupo.localeCompare(b.grupo)
                        })
                        .map((row: any) => (
                           <PreciosRow key={row.id} p={row} tasaBase={tasaBase} ganaderosList={ganaderosList} actualizarPrecio={actualizarPrecio} borrarPrecio={(id:string)=>borrarPrecio(id, row.grupo)} isSelected={selectedRows.includes(row.id)} onSelect={(id:string, val:boolean) => val ? setSelectedRows([...selectedRows, id]) : setSelectedRows(selectedRows.filter(x=>x!==id))} />
                        ))
                      }
                      
                      {precios.length === 0 && !isAdding && (
                         <tr><td colSpan={11} className="text-center py-10 font-bold text-slate-400">No hay configuración de precios para esta semana. Agrega una nueva.</td></tr>
                      )}
                   </tbody>
                </table>
             </div>
          )}
       </div>

       {/* ── Ganaderos sin precio asignado ── */}
       <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="flex items-center gap-3 p-4 bg-slate-50 border-b border-slate-200">
           <AlertTriangle size={18} className={sinPrecio.length > 0 ? 'text-amber-500' : 'text-emerald-500'} />
           <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide">
             Ganaderos activos sin precio para esta semana
           </h3>
           {sinPrecioLoading
             ? <Loader2 size={14} className="animate-spin text-slate-400 ml-auto" />
             : sinPrecio.length > 0
               ? <span className="ml-auto text-xs font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{sinPrecio.length} ganadero{sinPrecio.length !== 1 ? 's' : ''} sin precio</span>
               : <span className="ml-auto text-xs font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ Todos tienen precio</span>
           }
         </div>
         {!sinPrecioLoading && sinPrecio.length > 0 && (
           <div className="overflow-x-auto">
             <table className="w-full text-sm">
               <thead>
                 <tr className="border-b border-slate-100 bg-slate-50">
                   <th className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 py-2">Código</th>
                   <th className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 py-2">Nombre</th>
                   <th className="text-left text-[10px] font-black text-amber-500 uppercase tracking-widest px-4 py-2">Grupo asignado</th>
                   <th className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 py-2">Ruta</th>
                   <th className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 py-2">Fábrica</th>
                   <th className="text-right text-[10px] font-black text-red-500 uppercase tracking-widest px-4 py-2">Litros sem.</th>
                 </tr>
               </thead>
               <tbody>
                 {sinPrecio.map((g: any) => {
                   const ruta = Array.isArray(g.rutas) ? g.rutas[0] : g.rutas
                   const fabrica = ruta?.fabricas
                   const tienelitros = g.litrosSemana > 0
                   return (
                     <tr key={g.id} className={`border-b border-slate-50 transition-colors ${tienelitros ? 'hover:bg-red-50' : 'hover:bg-slate-50 opacity-60'}`}>
                       <td className="px-4 py-2.5 font-black text-slate-700">{g.codigo_ganadero}</td>
                       <td className="px-4 py-2.5 font-semibold text-slate-700">{g.nombre}</td>
                       <td className="px-4 py-2.5">
                         {g.grupo
                           ? <span className="bg-amber-100 text-amber-700 font-black text-xs px-2 py-0.5 rounded-full border border-amber-200">{g.grupo} — sin precio esta semana</span>
                           : <span className="bg-red-100 text-red-700 font-black text-xs px-2 py-0.5 rounded-full border border-red-200">Sin grupo asignado</span>
                         }
                       </td>
                       <td className="px-4 py-2.5 text-slate-500 text-xs font-semibold">{ruta?.nombre_ruta || '—'}</td>
                       <td className="px-4 py-2.5 text-slate-500 text-xs font-semibold">{fabrica ? `${fabrica.codigo} · ${fabrica.nombre}` : '—'}</td>
                       <td className="px-4 py-2.5 text-right">
                         {tienelitros
                           ? <span className="font-black text-red-600">{Math.round(g.litrosSemana).toLocaleString('es-VE')} L</span>
                           : <span className="text-slate-300 font-semibold text-xs">sin recep.</span>
                         }
                       </td>
                     </tr>
                   )
                 })}
               </tbody>
             </table>
           </div>
         )}
         {!sinPrecioLoading && sinPrecio.length === 0 && (
           <div className="p-6 text-center text-emerald-600 font-bold text-sm">
             Todos los ganaderos activos tienen precio asignado para esta semana.
           </div>
         )}
       </div>

       {/* ── Modal Importar Precios ── */}
       {isImportModalOpen && (
         <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-auto overflow-hidden animate-in zoom-in-95">
             <div className="flex justify-between items-center bg-slate-50 border-b border-slate-200 p-4">
               <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                 <Upload size={16} className="text-blue-600" /> Importar Precios desde Excel
               </h3>
               <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
             </div>
             <div className="p-4 sm:p-6">
               {importResult ? (
                 <div className="space-y-4">
                   <div className="flex gap-4">
                     <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                       <CheckCircle2 className="text-emerald-500 mx-auto mb-2" size={32} />
                       <p className="text-2xl font-black text-emerald-700">{importResult.ok}</p>
                       <p className="text-xs font-bold text-emerald-600">Grupos importados</p>
                     </div>
                     {importResult.errores.length > 0 && (
                       <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                         <X className="text-red-500 mx-auto mb-2" size={32} />
                         <p className="text-2xl font-black text-red-700">{importResult.errores.length}</p>
                         <p className="text-xs font-bold text-red-600">Filas con error</p>
                       </div>
                     )}
                   </div>
                   {importResult.errores.length > 0 && (
                     <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-h-48 overflow-y-auto space-y-1">
                       {importResult.errores.map((e, i) => <p key={i} className="text-xs text-red-700 font-semibold">• {e}</p>)}
                     </div>
                   )}
                   <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }}
                     className="w-full bg-blue-600 text-white font-black py-3 rounded-xl">Cerrar</button>
                 </div>
               ) : (
                 <div className="space-y-4">
                   <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                     <p className="text-xs font-bold text-blue-700">Se encontraron <span className="text-blue-900">{importRows.length} filas</span> en el archivo. Se usará la semana seleccionada: <strong>{formatDate(selectedSemana)}</strong></p>
                   </div>
                   <div className="overflow-x-auto max-h-64 border border-slate-200 rounded-xl">
                     <table className="min-w-full text-xs">
                       <thead className="bg-slate-50 sticky top-0">
                         <tr>
                           <th className="px-3 py-2 text-left font-black text-slate-500 whitespace-nowrap">#</th>
                           {importRows.length > 0 && Object.keys(importRows[0]).map(col => (
                             <th key={col} className="px-3 py-2 text-left font-black text-slate-500 whitespace-nowrap">{col}</th>
                           ))}
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                         {importRows.map((row, i) => (
                           <tr key={i} className="hover:bg-slate-50">
                             <td className="px-3 py-2 font-bold text-slate-400">{i + 2}</td>
                             {Object.keys(importRows[0]).map(col => (
                               <td key={col} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                                 {String(row[col] ?? '')}
                               </td>
                             ))}
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                   <div className="grid grid-cols-2 gap-3 pt-2">
                     <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }} className="bg-slate-100 text-slate-600 font-bold py-3 rounded-xl">Cancelar</button>
                     <button onClick={handleConfirmarImportPrecios} disabled={importLoading}
                       className="bg-blue-600 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
                       {importLoading ? <><Loader2 size={16} className="animate-spin" /> Importando...</> : <><Upload size={16} /> Confirmar importación</>}
                     </button>
                   </div>
                 </div>
               )}
             </div>
           </div>
         </div>
       )}
    </div>
  )
}

const VITACORA_PAGE_SIZE = 20

function VitacoraList({ moduloFilter }: { moduloFilter?: string }) {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    fetchLogs()
  }, [moduloFilter])

  const fetchLogs = async () => {
    setLoading(true)
    let query = supabase.from('bitacora').select('*').order('created_at', { ascending: false }).limit(500)
    if (moduloFilter) query = query.eq('modulo', moduloFilter)
    const { data } = await query
    if (data) setLogs(data)
    setLoading(false)
  }

  const filteredLogs = logs.filter(l =>
    l.usuario_email?.toLowerCase().includes(search.toLowerCase()) ||
    l.modulo?.toLowerCase().includes(search.toLowerCase()) ||
    l.accion?.toLowerCase().includes(search.toLowerCase()) ||
    l.detalles?.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / VITACORA_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const paginatedLogs = filteredLogs.slice(currentPage * VITACORA_PAGE_SIZE, (currentPage + 1) * VITACORA_PAGE_SIZE)

  return (
    <div className="flex flex-col h-full min-h-[500px]">
       <div className="flex justify-between items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-lg">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
             <input
               type="text"
               placeholder="Filtrar registros..."
               value={search}
               onChange={e=>{ setSearch(e.target.value); setPage(0) }}
               className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 bg-white text-black font-extrabold focus:ring-2 focus:ring-blue-500 shadow-sm"
             />
          </div>
          <button onClick={fetchLogs} className="flex items-center gap-2 text-blue-600 font-bold hover:underline">
             <RefreshCcw size={16} className={loading ? 'animate-spin' : ''}/> Actualizar
          </button>
       </div>

       {!loading && filteredLogs.length > 0 && (
         <div className="flex items-center justify-between pb-3 mb-1 border-b border-slate-200 shrink-0">
           <span className="text-xs font-bold text-slate-500">{filteredLogs.length} registros · pág. {currentPage + 1}/{totalPages}</span>
           <div className="flex gap-2">
             <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition-colors">← Anterior</button>
             <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition-colors">Siguiente →</button>
           </div>
         </div>
       )}
       <div className="overflow-y-auto pr-1 flex-1">
          {loading ? (
             <div className="flex flex-col items-center justify-center p-20">
                <Loader2 className="animate-spin text-blue-500 w-12 h-12"/>
             </div>
          ) : (
             <div className="space-y-3 pb-4">
                {paginatedLogs.map(log => (
                   <div key={log.id} className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center gap-4 hover:shadow-md transition-shadow">
                      <div className="shrink-0 flex md:flex-col items-center gap-2 md:gap-0 min-w-[120px]">
                         <span className="text-[10px] font-black text-slate-400">{new Date(log.created_at).toLocaleDateString()}</span>
                         <span className="text-sm font-black text-blue-600">{new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                      </div>
                      <div className="shrink-0">
                         <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter shadow-sm border ${
                           log.accion === 'BORRAR' || log.accion === 'BORRADO_MASIVO' || log.accion === 'BORRAR_MASIVO' ? 'bg-red-50 text-red-700 border-red-100' :
                           log.accion === 'CREAR' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                         }`}>
                            {log.accion}
                         </span>
                      </div>
                      <div className="flex-1">
                         <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5 tracking-wider">{log.modulo}</div>
                         <p className="text-sm text-slate-700 font-extrabold leading-tight">{log.detalles}</p>
                      </div>
                      <div className="shrink-0 text-right bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm">
                         <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">Operador</div>
                         <div className="text-xs font-black text-slate-800">{log.usuario_email}</div>
                      </div>
                   </div>
                ))}
                {paginatedLogs.length === 0 && <div className="text-center py-20 text-slate-300 font-extrabold">No hay registros.</div>}
             </div>
          )}
       </div>

       {!loading && filteredLogs.length > 0 && (
         <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-200 shrink-0">
           <span className="text-xs font-bold text-slate-500">{filteredLogs.length} registros · pág. {currentPage + 1}/{totalPages}</span>
           <div className="flex gap-2">
             <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition-colors">← Anterior</button>
             <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition-colors">Siguiente →</button>
           </div>
         </div>
       )}
    </div>
  )
}

function ModalVitacora({ modulo, isOpen, onClose }: { modulo: string, isOpen: boolean, onClose: () => void }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in pb-10">
       <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col m-4">
          <div className="flex justify-between items-center p-6 bg-slate-100 border-b border-slate-200">
             <div>
                <h3 className="font-black text-slate-800 text-xl flex items-center gap-2">
                   <History className="text-blue-600"/> Bitácora: {modulo}
                </h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Historial de cambios detectados</p>
             </div>
             <button onClick={onClose} className="text-slate-400 hover:text-white hover:bg-red-500 p-2 rounded-full transition-all">
                <X size={24}/>
             </button>
          </div>
          <div className="p-6 flex-1 overflow-hidden">
             <VitacoraList moduloFilter={modulo} />
          </div>
       </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PRECIO DEDUCCIONES TAB
// ─────────────────────────────────────────────────────────────────────────────
function PrecioDeduccionesTab({ user }: { user: any }) {
  const supabase = createClient()
  const { showAlert, Dialog } = useDialog()

  const [semanas, setSemanas] = useState<any[]>([])   // tasas_bcv miércoles
  const [semanasGanaderas, setSemanasGanaderas] = useState<any[]>([]) // semanas_ganaderas
  const [selectedSemana, setSelectedSemana] = useState('')
  const [semanaDropdownOpen, setSemanaDropdownOpen] = useState(false)
  const [tasaBase, setTasaBase] = useState(0)

  const [fabricas, setFabricas] = useState<any[]>([])
  const [selectedFabricaId, setSelectedFabricaId] = useState('')
  const [fabricaDropdownOpen, setFabricaDropdownOpen] = useState(false)
  const fabricaDropdownRef = useRef<HTMLDivElement>(null)

  const [rutas, setRutas] = useState<any[]>([])
  const [ganaderosMap, setGanaderosMap] = useState<Record<string, any[]>>({}) // ruta_id → ganaderos[]
  const [preciosSemanales, setPreciosSemanales] = useState<any[]>([]) // precios_semanales del semana

  // Filas de trabajo: una por ruta
  const [rows, setRows] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function init() {
      // Semanas (miércoles de tasas_bcv) + semanas_ganaderas para número
      const [{ data: tasas }, { data: semGan }] = await Promise.all([
        supabase.from('tasas_bcv').select('fecha, tasa').in('dia', ['miercoles', 'Miércoles', 'miércoles', 'Miercoles']).order('fecha', { ascending: false }),
        supabase.from('semanas_ganaderas').select('*').eq('activa', true).order('fecha_inicio', { ascending: false }),
      ])
      if (semGan) setSemanasGanaderas(semGan)
      if (tasas) {
        // Solo mostrar semanas BCV que tengan semana ganadera activa
        const fechasActivas = new Set((semGan || []).map((sg: any) => sg.fecha_inicio))
        const tasasActivas = tasas.filter((t: any) => fechasActivas.has(t.fecha))
        setSemanas(tasasActivas)
        // Auto-seleccionar la semana vigente primero, luego la actual por fecha
        const vigente = semGan?.find((s: any) => s.es_vigente)
        const wedVigente = vigente?.fecha_inicio
        const now = new Date()
        const diff = (now.getDay() < 3 ? 7 : 0) + now.getDay() - 3
        const wed = new Date(now); wed.setDate(now.getDate() - diff)
        const wedStr = `${wed.getFullYear()}-${String(wed.getMonth()+1).padStart(2,'0')}-${String(wed.getDate()).padStart(2,'0')}`
        const selFecha = wedVigente || wedStr
        const exist = tasas.find((t: any) => t.fecha === selFecha)
        const sel = exist || tasas[0]
        if (sel) { setSelectedSemana(sel.fecha); setTasaBase(sel.tasa) }
      }
      // Fábricas — ordenadas por código de menor a mayor
      const { data: fabs } = await supabase.from('fabricas').select('id, codigo, nombre').order('codigo')
      if (fabs && fabs.length > 0) { setFabricas(fabs); setSelectedFabricaId(fabs[0].id) }
    }
    init()
  }, [])

  useEffect(() => {
    if (!selectedSemana || !selectedFabricaId) return
    loadRutasData()
  }, [selectedSemana, selectedFabricaId])

  async function loadRutasData() {
    const tObj = semanas.find((s: any) => s.fecha === selectedSemana)
    if (tObj) setTasaBase(tObj.tasa)

    const [{ data: rutasData }, { data: ganaderosData }, { data: preciosData }, { data: deducData }] = await Promise.all([
      supabase.from('rutas').select('id, codigo_ruta, nombre_ruta, grupo').eq('fabrica_id', selectedFabricaId).eq('activo', true).order('codigo_ruta'),
      supabase.from('ganaderos').select('id, codigo_ganadero, nombre, grupo, ruta_id').eq('fabrica_id', selectedFabricaId).eq('activo', true),
      supabase.from('precios_semanales').select('*').eq('fecha_semana', selectedSemana),
      supabase.from('precios_deducciones').select('*').eq('fecha_semana', selectedSemana).eq('fabrica_id', selectedFabricaId),
    ])

    const gMap: Record<string, any[]> = {}
    for (const g of (ganaderosData || [])) {
      if (!g.ruta_id) continue
      if (!gMap[g.ruta_id]) gMap[g.ruta_id] = []
      gMap[g.ruta_id].push(g)
    }
    setGanaderosMap(gMap)
    setPreciosSemanales(preciosData || [])
    setRutas(rutasData || [])

    // Build rows
    const newRows = (rutasData || []).map((ruta: any) => {
      const existing = (deducData || []).find((d: any) => d.ruta_id === ruta.id)
      const ganaderoRef = existing?.ganadero_referencia_id || null
      const factor = existing?.factor_penalizacion || 0
      const precioLeche = getPrecioLeche(ganaderosData || [], preciosData || [], ganaderoRef)
      const precioUSD = precioLeche + Number(factor)
      return {
        ruta_id: ruta.id,
        ruta,
        existingId: existing?.id || null,
        ganadero_referencia_id: ganaderoRef,
        precio_leche_ref: precioLeche,
        factor_penalizacion: Number(factor),
        precio_deduccion_usd: precioUSD,
      }
    })
    setRows(newRows)
  }

  function getPrecioLeche(ganaderos: any[], precios: any[], ganaderoId: string | null): number {
    if (!ganaderoId) return 0
    const g = ganaderos.find((x: any) => x.id === ganaderoId)
    if (!g) return 0
    const precio = precios.find((p: any) => {
      const codes = (p.ganaderos || []) as string[]
      return codes.includes(g.codigo_ganadero)
    })
    return precio?.precio_leche_usd || 0
  }

  function updateRow(rutaId: string, field: string, value: any) {
    setRows(prev => prev.map(row => {
      if (row.ruta_id !== rutaId) return row
      const updated = { ...row, [field]: value }
      if (field === 'ganadero_referencia_id') {
        const gs = ganaderosMap[rutaId] || []
        const pLeche = getPrecioLeche(gs, preciosSemanales, value)
        updated.precio_leche_ref = pLeche
        updated.precio_deduccion_usd = pLeche + Number(updated.factor_penalizacion)
      }
      if (field === 'factor_penalizacion') {
        updated.precio_deduccion_usd = Number(updated.precio_leche_ref) + Number(value)
      }
      return updated
    }))
  }

  async function handleSaveAll() {
    setSaving(true)
    setSaved(false)
    let hasError = false
    for (const row of rows) {
      const payload = {
        fabrica_id: selectedFabricaId,
        fecha_semana: selectedSemana,
        ruta_id: row.ruta_id,
        ganadero_referencia_id: row.ganadero_referencia_id || null,
        factor_penalizacion: Number(row.factor_penalizacion) || 0,
        precio_deduccion_usd: Number(row.precio_deduccion_usd) || 0,
        updated_at: new Date().toISOString(),
      }
      if (row.existingId) {
        const { error } = await supabase.from('precios_deducciones').update(payload).eq('id', row.existingId)
        if (error) hasError = true
      } else {
        const { error } = await supabase.from('precios_deducciones').insert(payload)
        if (error) hasError = true
      }
    }
    setSaving(false)
    if (hasError) { showAlert('Hubo errores al guardar algunos registros.'); return }
    setSaved(true)
    logAction(supabase, user, 'Configuración', 'PRECIOS_DEDUCCIONES', `Guardados precios de deducciones semana ${selectedSemana}`)
    setTimeout(() => setSaved(false), 3000)
    loadRutasData()
  }

  const fmtUSD = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  const fmtBs = (v: number) => v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="space-y-6">
      {Dialog}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="font-black text-slate-800 text-base flex items-center gap-2"><Truck size={16} className="text-orange-500" /> Precio de Deducciones</h2>
            <p className="text-xs text-slate-500 mt-0.5">Precio base por litro para códigos 90 (faltante) y 92 (agua) — por ruta y semana.</p>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            {/* Fábrica — dropdown estilo Sidebar */}
            <div className="relative" ref={fabricaDropdownRef}>
              <button
                type="button"
                onClick={() => setFabricaDropdownOpen(o => !o)}
                className="flex items-center justify-between gap-2 bg-white border border-slate-300 hover:border-blue-400 text-gray-900 rounded-lg px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Check className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <span className="text-xs font-bold truncate text-gray-900">
                    {fabricas.find(f => f.id === selectedFabricaId)?.nombre || 'Seleccionar...'}
                  </span>
                </div>
                <ChevronDown className={`text-gray-500 shrink-0 transition-transform duration-200 ${fabricaDropdownOpen ? 'rotate-180' : ''}`} size={14} />
              </button>
              {fabricaDropdownOpen && (
                <>
                  <div className="absolute top-full left-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden z-50 min-w-[200px]">
                    {fabricas.map(f => {
                      const isSelected = f.id === selectedFabricaId
                      return (
                        <button key={f.id} type="button"
                          onMouseDown={e => { e.preventDefault(); setSelectedFabricaId(f.id); setFabricaDropdownOpen(false) }}
                          className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors border-b border-gray-100 last:border-0 ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-gray-50'}`}>
                          <div className="min-w-0">
                            <div className={`text-xs font-bold leading-tight ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>{f.nombre}</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">Cód. {f.codigo}</div>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                  <div className="fixed inset-0 z-40" onClick={() => setFabricaDropdownOpen(false)} />
                </>
              )}
            </div>
            {/* Semana */}
            {(() => {
              const selSemGan = semanasGanaderas.find((sg: any) => sg.fecha_inicio === selectedSemana)
              const selLabel = selSemGan
                ? `Sem. ${selSemGan.numero_semana} — ${formatDate(selectedSemana)}`
                : selectedSemana ? formatDate(selectedSemana) : 'Seleccionar semana'
              return (
                <div className="relative">
                  <button onClick={() => setSemanaDropdownOpen(o => !o)}
                    className="flex items-center gap-2 border border-slate-300 hover:border-blue-400 rounded-lg px-3 py-2 text-xs font-bold bg-white min-w-[210px] justify-between focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar size={13} className="text-slate-400 shrink-0" />
                      <span className="truncate text-gray-900">{selLabel}</span>
                    </div>
                    <ChevronDown className={`text-gray-500 shrink-0 transition-transform duration-200 ${semanaDropdownOpen ? 'rotate-180' : ''}`} size={14} />
                  </button>
                  {semanaDropdownOpen && (
                    <>
                      <div className="absolute z-50 top-full mt-1.5 right-0 bg-white border border-slate-200 rounded-lg shadow-2xl max-h-64 overflow-y-auto min-w-[230px]">
                        {semanas.map((s: any) => {
                          const sg = semanasGanaderas.find((x: any) => x.fecha_inicio === s.fecha)
                          const isSelected = selectedSemana === s.fecha
                          return (
                            <button key={s.fecha}
                              onMouseDown={e => { e.preventDefault(); setSelectedSemana(s.fecha); setTasaBase(s.tasa); setSemanaDropdownOpen(false) }}
                              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors border-b border-gray-100 last:border-0 ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-gray-50'}`}>
                              <div className="min-w-0">
                                {sg && <div className={`text-[10px] font-black uppercase tracking-wide ${isSelected ? 'text-blue-600' : 'text-orange-500'}`}>Semana {sg.numero_semana} · {sg.año}{sg.es_vigente ? ' ★' : ''}</div>}
                                <div className={`text-xs font-bold leading-tight ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>{formatDate(s.fecha)}</div>
                              </div>
                              {isSelected && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                      <div className="fixed inset-0 z-40" onClick={() => setSemanaDropdownOpen(false)} />
                    </>
                  )}
                </div>
              )
            })()}

          </div>
        </div>

        {/* Tasa BCV info */}
        {tasaBase > 0 && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
            <span className="text-[10px] font-black text-blue-600 uppercase">Tasa BCV inicio de semana:</span>
            <span className="text-sm font-black text-blue-800">Bs {tasaBase.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
            <span className="text-[10px] text-blue-400 ml-1">({formatDate(selectedSemana)})</span>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-bold text-sm">
            {selectedSemana ? 'No hay rutas activas para esta fábrica.' : 'Selecciona una semana para comenzar.'}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-500">Ruta</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-500">Ganadero Referencia</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500">Precio Leche Ref. (USD/L)</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500">Factor Penalización (USD/L)</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 bg-orange-50">Precio Descuento (USD/L)</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500 bg-orange-50">Precio Descuento (Bs/L)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {rows.map(row => {
                    const ganaderosRuta = ganaderosMap[row.ruta_id] || []
                    const precioBs = Number(row.precio_deduccion_usd) * tasaBase
                    return (
                      <tr key={row.ruta_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className="font-black text-blue-600 text-[11px]">{row.ruta.codigo_ruta}</span>
                          <p className="text-slate-600 font-semibold">{row.ruta.nombre_ruta}</p>
                        </td>
                        <td className="px-4 py-3 min-w-[200px]">
                          <select value={row.ganadero_referencia_id || ''}
                            onChange={e => updateRow(row.ruta_id, 'ganadero_referencia_id', e.target.value || null)}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white focus:ring-2 focus:ring-orange-400 focus:border-orange-400">
                            <option value="">(Sin referencia)</option>
                            {ganaderosRuta.map((g: any) => (
                              <option key={g.id} value={g.id}>{g.codigo_ganadero} — {g.nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-black ${row.precio_leche_ref > 0 ? 'text-green-700' : 'text-slate-300'}`}>
                            {row.precio_leche_ref > 0 ? `$ ${fmtUSD(row.precio_leche_ref)}` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input type="number" min="0" step="0.0001"
                            value={row.factor_penalizacion || ''}
                            placeholder="0.0000"
                            onChange={e => updateRow(row.ruta_id, 'factor_penalizacion', Number(e.target.value) || 0)}
                            className="w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-center focus:ring-2 focus:ring-orange-400 focus:border-orange-400" />
                        </td>
                        <td className="px-4 py-3 text-center bg-orange-50">
                          <span className="font-black text-orange-700 text-sm">$ {fmtUSD(Number(row.precio_deduccion_usd) || 0)}</span>
                        </td>
                        <td className="px-4 py-3 text-center bg-orange-50">
                          <span className="font-black text-orange-800 text-sm">Bs {fmtBs(precioBs)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {rows.map(row => {
                const ganaderosRuta = ganaderosMap[row.ruta_id] || []
                const precioBs = Number(row.precio_deduccion_usd) * tasaBase
                return (
                  <div key={row.ruta_id} className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-100 text-blue-800 font-black text-[10px] px-2 py-0.5 rounded">{row.ruta.codigo_ruta}</span>
                      <span className="font-bold text-slate-800 text-sm">{row.ruta.nombre_ruta}</span>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase">Ganadero referencia</label>
                      <select value={row.ganadero_referencia_id || ''}
                        onChange={e => updateRow(row.ruta_id, 'ganadero_referencia_id', e.target.value || null)}
                        className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold mt-1">
                        <option value="">(Sin referencia)</option>
                        {ganaderosRuta.map((g: any) => (
                          <option key={g.id} value={g.id}>{g.codigo_ganadero} — {g.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 rounded-lg p-2 text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Precio Leche Ref.</p>
                        <p className="font-black text-green-700 text-sm">$ {fmtUSD(row.precio_leche_ref || 0)}</p>
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase">Factor Penalización</label>
                        <input type="number" min="0" step="0.0001"
                          value={row.factor_penalizacion || ''}
                          placeholder="0.0000"
                          onChange={e => updateRow(row.ruta_id, 'factor_penalizacion', Number(e.target.value) || 0)}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-center mt-1" />
                      </div>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 grid grid-cols-2 gap-3 text-center">
                      <div>
                        <p className="text-[9px] font-black text-orange-500 uppercase">Precio Desc. USD/L</p>
                        <p className="font-black text-orange-700">$ {fmtUSD(Number(row.precio_deduccion_usd) || 0)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-orange-500 uppercase">Precio Desc. Bs/L</p>
                        <p className="font-black text-orange-800">Bs {fmtBs(precioBs)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              {saved && <span className="text-emerald-600 font-bold text-sm flex items-center gap-1"><CheckCircle2 size={16} /> Guardado</span>}
              <button onClick={handleSaveAll} disabled={saving || !selectedSemana}
                className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-black px-5 py-2.5 rounded-xl shadow-sm disabled:opacity-50 transition-colors">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Guardando...' : 'Guardar Todo'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FÁBRICAS TAB
// ─────────────────────────────────────────────────────────────────────────────
function FabricasTab({ user }: { user: any }) {
  const supabase = createClient()
  const [fabricas, setFabricas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editFabrica, setEditFabrica] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadFabricas() }, [])

  const loadFabricas = async () => {
    const { data } = await supabase
      .from('fabricas')
      .select('id, codigo, nombre, razon_social, rif, direccion_fiscal, activo')
      .order('codigo')
    setFabricas(data ?? [])
    setLoading(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editFabrica) return
    setSaving(true)
    await supabase.from('fabricas').update({
      nombre: editFabrica.nombre,
      razon_social: editFabrica.razon_social || null,
      rif: editFabrica.rif || null,
      direccion_fiscal: editFabrica.direccion_fiscal || null,
    }).eq('id', editFabrica.id)
    logAction(supabase, user, 'Fábricas', 'EDITAR', `Actualizada fábrica: ${editFabrica.nombre}`)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    loadFabricas()
    setEditFabrica(null)
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" size={28} /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-800">Fábricas</h2>
          <p className="text-sm text-slate-500">Configura los datos fiscales de cada fábrica para las facturas digitales.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fabricas.map(fab => (
          <div key={fab.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cód. {fab.codigo}</span>
                <h3 className="font-black text-slate-800 text-base">{fab.nombre}</h3>
              </div>
              <button
                onClick={() => setEditFabrica({ ...fab })}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Edit2 size={16} />
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              <p className="text-slate-600"><span className="font-semibold text-slate-400">Razón social:</span> {fab.razon_social || <span className="italic text-slate-300">Sin configurar</span>}</p>
              <p className="text-slate-600"><span className="font-semibold text-slate-400">RIF:</span> {fab.rif || <span className="italic text-slate-300">Sin configurar</span>}</p>
              <p className="text-slate-600 leading-snug"><span className="font-semibold text-slate-400">Dirección:</span> {fab.direccion_fiscal || <span className="italic text-slate-300">Sin configurar</span>}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Modal editar fábrica */}
      {editFabrica && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setEditFabrica(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex justify-between items-center bg-slate-100 border-b border-slate-200 rounded-t-2xl overflow-hidden">
              <h3 className="font-black text-slate-800 px-6 py-4">Editar Fábrica — {editFabrica.nombre}</h3>
              <button onClick={() => setEditFabrica(null)} className="text-slate-500 hover:text-white hover:bg-red-500 px-5 py-4 transition-colors self-stretch flex items-center"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Nombre de la fábrica</label>
                <input
                  type="text"
                  value={editFabrica.nombre}
                  onChange={e => setEditFabrica((f: any) => ({ ...f, nombre: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Razón social (para facturas)</label>
                <input
                  type="text"
                  value={editFabrica.razon_social ?? ''}
                  onChange={e => setEditFabrica((f: any) => ({ ...f, razon_social: e.target.value }))}
                  placeholder="Ej: C.A. Lácteos del Sur"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">RIF</label>
                <input
                  type="text"
                  value={editFabrica.rif ?? ''}
                  onChange={e => setEditFabrica((f: any) => ({ ...f, rif: e.target.value }))}
                  placeholder="Ej: J-12345678-9"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Dirección fiscal</label>
                <textarea
                  value={editFabrica.direccion_fiscal ?? ''}
                  onChange={e => setEditFabrica((f: any) => ({ ...f, direccion_fiscal: e.target.value }))}
                  placeholder="Dirección completa..."
                  rows={2}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditFabrica(null)} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-60"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTURACIÓN TAB (Catálogo de deducciones)
// ─────────────────────────────────────────────────────────────────────────────
function FacturacionConfigTab({ user }: { user: any }) {
  const supabase = createClient()
  const { showConfirm, Dialog } = useDialog()
  const [deducciones, setDeducciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editDed, setEditDed] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadDeds() }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setIsModalOpen(false); setEditDed(null) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const loadDeds = async () => {
    const { data } = await supabase.from('deducciones_catalogo').select('*').order('codigo')
    setDeducciones(data ?? [])
    setLoading(false)
  }

  const openCreate = () => {
    setEditDed({ codigo: '', nombre: '', activo: true })
    setError('')
    setIsModalOpen(true)
  }

  const openEdit = (d: any) => {
    setEditDed({ ...d })
    setError('')
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!editDed.codigo || !editDed.nombre) { setError('Código y nombre son obligatorios'); return }
    setSaving(true)
    if (editDed.id) {
      await supabase.from('deducciones_catalogo').update({ codigo: editDed.codigo, nombre: editDed.nombre, activo: editDed.activo }).eq('id', editDed.id)
      logAction(supabase, user, 'Facturación', 'EDITAR_DEDUCCION', `Actualizada deducción Cód.${editDed.codigo}: ${editDed.nombre}`)
    } else {
      await supabase.from('deducciones_catalogo').insert({ codigo: editDed.codigo, nombre: editDed.nombre, activo: true })
      logAction(supabase, user, 'Facturación', 'CREAR_DEDUCCION', `Creada deducción Cód.${editDed.codigo}: ${editDed.nombre}`)
    }
    setSaving(false)
    setIsModalOpen(false)
    setEditDed(null)
    loadDeds()
  }

  const toggleActivo = async (d: any) => {
    await supabase.from('deducciones_catalogo').update({ activo: !d.activo }).eq('id', d.id)
    logAction(supabase, user, 'Facturación', d.activo ? 'DESACTIVAR_DEDUCCION' : 'ACTIVAR_DEDUCCION', `Deducción Cód.${d.codigo}: ${d.nombre}`)
    loadDeds()
  }

  const handleDelete = async (d: any) => {
    const ok = await showConfirm(`¿Eliminar la deducción "${d.nombre}"?`, { danger: true, confirmLabel: 'Eliminar' })
    if (!ok) return
    await supabase.from('deducciones_catalogo').delete().eq('id', d.id)
    logAction(supabase, user, 'Facturación', 'BORRAR_DEDUCCION', `Eliminada deducción Cód.${d.codigo}: ${d.nombre}`)
    loadDeds()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-800">Catálogo de Deducciones</h2>
          <p className="text-sm text-slate-500">Deducciones disponibles para asignar a las facturas digitales.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors"
        >
          <Plus size={15} /> Nueva deducción
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" size={28} /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {deducciones.length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">Sin deducciones en el catálogo</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Código</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre / Concepto</th>
                  <th className="text-center px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                  <th className="text-center px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deducciones.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 font-bold text-slate-700">{d.codigo}</td>
                    <td className="px-5 py-3 text-slate-700">{d.nombre}</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => toggleActivo(d)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${d.activo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {d.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(d)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(d)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal crear/editar */}
      {isModalOpen && editDed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setIsModalOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex justify-between items-center bg-slate-100 border-b border-slate-200 rounded-t-2xl overflow-hidden">
              <h3 className="font-black text-slate-800 px-6 py-4">{editDed.id ? 'Editar' : 'Nueva'} Deducción</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white hover:bg-red-500 px-5 py-4 transition-colors self-stretch flex items-center"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Código</label>
                <input
                  type="text"
                  value={editDed.codigo}
                  onChange={e => setEditDed((d: any) => ({ ...d, codigo: e.target.value }))}
                  placeholder="Ej: 51"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Nombre / Concepto</label>
                <input
                  type="text"
                  value={editDed.nombre}
                  onChange={e => setEditDed((d: any) => ({ ...d, nombre: e.target.value }))}
                  placeholder="Ej: Insumos Ganaderos"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              {error && <p className="text-red-500 text-xs font-semibold">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-60"
                >
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    {Dialog}
    </div>
  )
}

function VitacoraTab({ user }: { user: any }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6">
       <div className="mb-6">
          <h3 className="text-xl font-black text-slate-800">Bitácora Global</h3>
          <p className="text-sm text-slate-500 font-bold">Control total de actividades en el sistema.</p>
       </div>
       <VitacoraList />
    </div>
  )
}

// ─── Semanas Ganaderas Tab ────────────────────────────────────────────────────
type SemanaGanadera = {
  id: string
  fecha_inicio: string
  numero_semana: number
  año: number
  activa: boolean
  es_vigente: boolean
  notas: string | null
  created_at: string
}
type SemanaStats = {
  num_grupos_precio: number
  tiene_bcv: boolean
  total_litros: number
  num_camiones: number
}

function SemanasGanaderasTab({ user }: { user: any }) {
  const supabase = createClient()
  const { showConfirm, showAlert, Dialog } = useDialog()
  const [semanas, setSemanas] = useState<SemanaGanadera[]>([])
  const [semStats, setSemStats] = useState<Record<string, SemanaStats>>({})
  const [loading, setLoading] = useState(false)
  const [dbError, setDbError] = useState(false)
  const [filtro, setFiltro] = useState<'todas' | 'activas'>('activas')
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<SemanaGanadera | null>(null)
  const [form, setForm] = useState({ fecha_inicio: '', numero_semana: '', notas: '' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState('')
  const [exportingImg, setExportingImg] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)

  function getNumSemana(wedStr: string): number {
    const p = wedStr.split('-')
    const wed = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]))
    const jan1 = new Date(wed.getFullYear(), 0, 1)
    const daysBack = (jan1.getDay() - 3 + 7) % 7
    const firstWed = new Date(jan1); firstWed.setDate(jan1.getDate() - daysBack)
    const n = Math.round((wed.getTime() - firstWed.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    return n > 0 ? n : 1
  }
  function getFechaFin(wedStr: string): string {
    const wed = new Date(wedStr + 'T12:00:00')
    const tue = new Date(wed); tue.setDate(wed.getDate() + 6)
    return `${tue.getFullYear()}-${String(tue.getMonth() + 1).padStart(2, '0')}-${String(tue.getDate()).padStart(2, '0')}`
  }
  function formatRango(wedStr: string): string {
    const wed = new Date(wedStr + 'T12:00:00')
    const tue = new Date(wed); tue.setDate(wed.getDate() + 6)
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    return `Mié ${fmt(wed)} – Mar ${fmt(tue)}/${tue.getFullYear()}`
  }
  function isWednesday(dateStr: string): boolean {
    if (!dateStr) return false
    return new Date(dateStr + 'T12:00:00').getDay() === 3
  }
  function nextWednesdayStr(): string {
    const now = new Date()
    const day = now.getDay()
    const diff = day === 3 ? 0 : (day < 3 ? 3 - day : 10 - day)
    const d = new Date(now); d.setDate(now.getDate() + diff)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  async function fetchSemanas() {
    setLoading(true)
    // order('fecha_inicio') falla con error en PostgREST si la columna no existe
    // (esquema antiguo tiene 'fecha' en vez de 'fecha_inicio').
    const { data, error } = await supabase
      .from('semanas_ganaderas')
      .select('*')
      .order('fecha_inicio', { ascending: false })
    if (error) { setDbError(true); setLoading(false); return }
    setSemanas((data || []) as SemanaGanadera[])
    setDbError(false)
    setLoading(false)
  }

  async function fetchStats(list: SemanaGanadera[]) {
    if (!list.length) return
    const fechas = list.map(s => s.fecha_inicio)
    const [{ data: precData }, { data: bcvData }, { data: camData }] = await Promise.all([
      supabase.from('precios_semanales').select('fecha_semana, grupo').in('fecha_semana', fechas),
      supabase.from('tasas_bcv').select('fecha').in('dia', ['miercoles', 'Miércoles', 'miércoles', 'Miercoles']).in('fecha', fechas),
      supabase.from('recepciones_camion').select('fecha_ingreso, litros_romana')
        .gte('fecha_ingreso', list[list.length - 1].fecha_inicio)
        .lte('fecha_ingreso', getFechaFin(list[0].fecha_inicio)),
    ])
    const map: Record<string, SemanaStats> = {}
    for (const s of list) {
      const tue = getFechaFin(s.fecha_inicio)
      const cams = camData?.filter(c => { const f = (c.fecha_ingreso || '').substring(0, 10); return f >= s.fecha_inicio && f <= tue }) || []
      map[s.fecha_inicio] = {
        num_grupos_precio: precData?.filter(p => p.fecha_semana === s.fecha_inicio).length ?? 0,
        tiene_bcv: bcvData?.some(b => b.fecha === s.fecha_inicio) ?? false,
        total_litros: cams.reduce((a, c) => a + Number(c.litros_romana || 0), 0),
        num_camiones: cams.length,
      }
    }
    setSemStats(map)
  }

  useEffect(() => {
    async function init() {
      // Auto-activar semana en curso si existe en la tabla
      const hoy = new Date()
      const dia = hoy.getDay()
      const diff = dia < 3 ? dia + 4 : dia - 3
      const mie = new Date(hoy); mie.setDate(hoy.getDate() - diff)
      const mieStr = `${mie.getFullYear()}-${String(mie.getMonth() + 1).padStart(2, '0')}-${String(mie.getDate()).padStart(2, '0')}`
      const { data: semActual } = await supabase
        .from('semanas_ganaderas').select('id, activa, es_vigente').eq('fecha_inicio', mieStr).single()
      if (semActual) {
        const upd: any = {}
        if (!semActual.activa) upd.activa = true
        if (!semActual.es_vigente) {
          await supabase.from('semanas_ganaderas').update({ es_vigente: false }).neq('id', semActual.id)
          upd.es_vigente = true
        }
        if (Object.keys(upd).length > 0) await supabase.from('semanas_ganaderas').update(upd).eq('id', semActual.id)
      }
      fetchSemanas()
    }
    init()
  }, [])
  useEffect(() => { if (semanas.length > 0) fetchStats(semanas) }, [semanas])

  function openCreate() {
    const wed = nextWednesdayStr()
    setForm({ fecha_inicio: wed, numero_semana: String(getNumSemana(wed)), notas: '' })
    setEditItem(null); setFormError(''); setModalOpen(true)
  }
  function openEdit(s: SemanaGanadera) {
    setForm({ fecha_inicio: s.fecha_inicio, numero_semana: String(s.numero_semana), notas: s.notas || '' })
    setEditItem(s); setFormError(''); setModalOpen(true)
  }

  async function handleSave() {
    if (!isWednesday(form.fecha_inicio)) { setFormError('La fecha debe ser un miércoles.'); return }
    const num = Number(form.numero_semana)
    if (!form.numero_semana || isNaN(num) || num < 1) { setFormError('Número de semana inválido.'); return }
    setSaving(true)
    const payload = {
      fecha_inicio: form.fecha_inicio,
      numero_semana: num,
      año: new Date(form.fecha_inicio + 'T12:00:00').getFullYear(),
      notas: form.notas || null,
      activa: editItem?.activa ?? false,
      es_vigente: editItem?.es_vigente ?? false,
    }
    const { error } = editItem
      ? await supabase.from('semanas_ganaderas').update(payload).eq('id', editItem.id)
      : await supabase.from('semanas_ganaderas').insert(payload)
    setSaving(false)
    if (error) { setFormError('Error: ' + error.message); return }
    setModalOpen(false)
    logAction(supabase, user, 'Semanas', editItem ? 'EDITAR' : 'CREAR', `Sem ${num} – ${formatRango(form.fecha_inicio)}`)
    fetchSemanas()
  }

  async function handleToggleActiva(s: SemanaGanadera) {
    if (s.es_vigente && s.activa) { await showAlert('La semana vigente no puede desactivarse.', { kind: 'error' }); return }
    const { error } = await supabase.from('semanas_ganaderas').update({ activa: !s.activa }).eq('id', s.id)
    if (!error) {
      setSemanas(prev => prev.map(x => x.id === s.id ? { ...x, activa: !s.activa } : x))
      logAction(supabase, user, 'Semanas', 'TOGGLE_ACTIVA', `Sem ${s.numero_semana} activa=${!s.activa}`)
    }
  }

  async function handleMarcarVigente(s: SemanaGanadera) {
    if (s.es_vigente) return
    const ok = await showConfirm(`¿Marcar Semana ${s.numero_semana} como vigente? Esto cambiará la semana preseleccionada en todo el sistema.`, { title: 'Cambiar semana vigente', confirmLabel: 'Marcar vigente' })
    if (!ok) return
    await supabase.from('semanas_ganaderas').update({ es_vigente: false }).neq('id', s.id)
    const { error } = await supabase.from('semanas_ganaderas').update({ es_vigente: true, activa: true }).eq('id', s.id)
    if (!error) {
      setSemanas(prev => prev.map(x => ({ ...x, es_vigente: x.id === s.id, activa: x.id === s.id ? true : x.activa })))
      logAction(supabase, user, 'Semanas', 'MARCAR_VIGENTE', `Sem ${s.numero_semana} marcada vigente`)
    }
  }

  async function handleDelete(s: SemanaGanadera) {
    if (s.es_vigente) { await showAlert('No puedes eliminar la semana vigente.', { kind: 'error' }); return }
    const ok = await showConfirm(`¿Eliminar Semana ${s.numero_semana} (${formatRango(s.fecha_inicio)})?`, { danger: true, confirmLabel: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('semanas_ganaderas').delete().eq('id', s.id)
    if (!error) {
      setSemanas(prev => prev.filter(x => x.id !== s.id))
      logAction(supabase, user, 'Semanas', 'BORRAR', `Sem ${s.numero_semana}`)
    }
  }

  async function handleMigrate() {
    setMigrating(true); setMigrateResult('')
    const [{ data: tasData }, { data: precData }, { data: existing }] = await Promise.all([
      supabase.from('tasas_bcv').select('fecha').in('dia', ['miercoles', 'Miércoles', 'miércoles', 'Miercoles']),
      supabase.from('precios_semanales').select('fecha_semana'),
      supabase.from('semanas_ganaderas').select('fecha_inicio'),
    ])
    const existingSet = new Set(existing?.map(e => e.fecha_inicio) || [])
    const allFechas = new Set<string>()
    tasData?.forEach(t => allFechas.add(t.fecha))
    precData?.forEach(p => allFechas.add(p.fecha_semana))
    const toInsert = Array.from(allFechas).filter(f => !existingSet.has(f) && isWednesday(f))
      .map(f => ({ fecha_inicio: f, numero_semana: getNumSemana(f), año: new Date(f + 'T12:00:00').getFullYear(), activa: false, es_vigente: false, notas: null }))
    let ok = 0, errs = 0
    for (const item of toInsert) {
      const { error } = await supabase.from('semanas_ganaderas').insert(item)
      if (error) errs++; else ok++
    }
    setMigrateResult(`${ok} semanas importadas.${errs ? ` ${errs} errores.` : ''} Actívalas manualmente según necesites.`)
    setMigrating(false)
    fetchSemanas()
  }

  async function handleExportImage() {
    if (!statsRef.current) return
    setExportingImg(true)
    try {
      const { toPng } = await import('html-to-image')
      const png = await toPng(statsRef.current, { cacheBust: true, backgroundColor: '#f8fafc' })
      const a = document.createElement('a'); a.href = png
      a.download = `semanas-ganaderas-${new Date().toISOString().substring(0, 10)}.png`; a.click()
    } catch (e) { showAlert('Error al exportar imagen.', { kind: 'error' }) }
    setExportingImg(false)
  }

  const vigente = semanas.find(s => s.es_vigente)
  const filtradas = filtro === 'activas' ? semanas.filter(s => s.activa) : semanas

  const SQL_PASO1 = `DROP TABLE IF EXISTS semanas_ganaderas;`
  const SQL_PASO2 = `CREATE TABLE semanas_ganaderas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  fecha_inicio DATE NOT NULL UNIQUE,
  numero_semana INTEGER NOT NULL,
  año INTEGER NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT false,
  es_vigente BOOLEAN NOT NULL DEFAULT false,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500 w-10 h-10" /></div>

  if (dbError) return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-500" />
          <h3 className="font-black text-amber-800">Actualización de tabla requerida</h3>
        </div>
        <p className="text-sm text-amber-700">
          La tabla <code className="bg-amber-100 px-1 rounded font-mono">semanas_ganaderas</code> existe con un esquema anterior.
          Debes ejecutar los siguientes 2 pasos en el <strong>SQL Editor de Supabase</strong>:
        </p>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-black text-amber-800 uppercase tracking-widest mb-1.5">Paso 1 — Eliminar tabla antigua</p>
            <div className="relative">
              <pre className="text-xs bg-white border border-amber-200 p-3 rounded-xl text-slate-800 font-mono">{SQL_PASO1}</pre>
              <button onClick={() => navigator.clipboard.writeText(SQL_PASO1)}
                className="absolute top-2 right-2 text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded font-bold hover:bg-amber-200 transition-colors">
                Copiar
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-black text-amber-800 uppercase tracking-widest mb-1.5">Paso 2 — Crear tabla nueva</p>
            <div className="relative">
              <pre className="text-xs bg-white border border-amber-200 p-3 rounded-xl text-slate-800 font-mono overflow-x-auto">{SQL_PASO2}</pre>
              <button onClick={() => navigator.clipboard.writeText(SQL_PASO2)}
                className="absolute top-2 right-2 text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded font-bold hover:bg-amber-200 transition-colors">
                Copiar
              </button>
            </div>
          </div>
        </div>

        <div className="bg-amber-100 rounded-xl p-3 text-xs text-amber-800 font-semibold">
          ⚠ La tabla antigua solo contiene datos de referencia para etiquetas — no afecta recepciones, precios ni tasas.
          Después del DROP podrás reimportar las semanas con el botón "Importar existentes".
        </div>

        <button onClick={fetchSemanas}
          className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-xl font-bold hover:bg-amber-600 transition-colors">
          <RefreshCcw size={16} /> Verificar (después de ejecutar los 2 pasos)
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── Header + acciones ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-800">Semanas Ganaderas</h2>
          <p className="text-sm text-slate-500">Gestiona qué semanas aparecen en los dropdowns del sistema.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleMigrate} disabled={migrating}
            className="flex items-center gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50">
            {migrating ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Importar existentes
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm">
            <Plus size={14} /> Nueva Semana
          </button>
        </div>
      </div>

      {migrateResult && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 size={16} /> {migrateResult}
        </div>
      )}

      {/* ── Vigente actual ── */}
      {vigente && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-4 text-white flex flex-wrap items-center gap-4 shadow-lg shadow-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-xl p-2"><Star size={20} className="fill-white" /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Semana Vigente</p>
              <p className="text-2xl font-black leading-none">SEM {vigente.numero_semana}</p>
              <p className="text-sm font-bold opacity-90">{formatRango(vigente.fecha_inicio)}</p>
            </div>
          </div>
          {semStats[vigente.fecha_inicio] && (
            <div className="flex flex-wrap gap-4 ml-auto">
              <div className="text-center">
                <p className="text-xl font-black">{Math.round(semStats[vigente.fecha_inicio].total_litros).toLocaleString('es-VE')}</p>
                <p className="text-[10px] font-bold opacity-75 uppercase">Litros</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-black">{semStats[vigente.fecha_inicio].num_camiones}</p>
                <p className="text-[10px] font-bold opacity-75 uppercase">Viajes</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-black">{semStats[vigente.fecha_inicio].num_grupos_precio}</p>
                <p className="text-[10px] font-bold opacity-75 uppercase">Grupos Precio</p>
              </div>
              <div className="text-center">
                <p className={`text-xl font-black ${semStats[vigente.fecha_inicio].tiene_bcv ? '' : 'opacity-50'}`}>
                  {semStats[vigente.fecha_inicio].tiene_bcv ? '✓' : '✗'}
                </p>
                <p className="text-[10px] font-bold opacity-75 uppercase">Tasa BCV</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex items-center gap-2">
        <button onClick={() => setFiltro('activas')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${filtro === 'activas' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
          Solo Activas ({semanas.filter(s => s.activa).length})
        </button>
        <button onClick={() => setFiltro('todas')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${filtro === 'todas' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
          Todas ({semanas.length})
        </button>
        <button onClick={handleExportImage} disabled={exportingImg}
          className="ml-auto flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50">
          {exportingImg ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
          Exportar Imagen
        </button>
      </div>

      {/* ── Tabla exportable ── */}
      <div ref={statsRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <Calendar size={16} className="text-blue-500" />
          <span className="font-black text-slate-700 text-sm uppercase tracking-wide">Semanas Ganaderas</span>
          <span className="text-[10px] text-slate-400 font-semibold ml-auto">Miércoles – Martes</span>
        </div>
        {filtradas.length === 0 ? (
          <div className="py-16 text-center text-slate-400 font-semibold">
            {filtro === 'activas' ? 'No hay semanas activas. Activa alguna o crea una nueva.' : 'No hay semanas registradas. Usa "Importar existentes" o crea una nueva.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Semana</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rango</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Litros</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Viajes</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Precios</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">BCV</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Activa</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(s => {
                  const st = semStats[s.fecha_inicio]
                  return (
                    <tr key={s.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${s.es_vigente ? 'bg-blue-50/50' : ''}`}>
                      {/* SEM badge */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${s.es_vigente ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            <span className="text-[9px] font-black uppercase">SEM</span>
                            <span className="text-base font-black leading-none">{s.numero_semana}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-semibold">{s.año}</span>
                        </div>
                      </td>
                      {/* Rango */}
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold text-slate-700">{formatRango(s.fecha_inicio)}</span>
                        {s.notas && <p className="text-[10px] text-slate-400 mt-0.5">{s.notas}</p>}
                      </td>
                      {/* Stats */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-bold text-slate-700">{st ? Math.round(st.total_litros).toLocaleString('es-VE') : '—'}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-bold text-slate-700">{st?.num_camiones ?? '—'}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {st ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${st.num_grupos_precio > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {st.num_grupos_precio > 0 ? `${st.num_grupos_precio} grupos` : 'Sin precios'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {st ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${st.tiene_bcv ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {st.tiene_bcv ? '✓ BCV' : '✗ BCV'}
                          </span>
                        ) : '—'}
                      </td>
                      {/* Toggle activa */}
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => handleToggleActiva(s)} title={s.activa ? 'Desactivar' : 'Activar'}>
                          {s.activa
                            ? <ToggleRight size={24} className="text-blue-500 hover:text-blue-700 transition-colors" />
                            : <ToggleLeft size={24} className="text-slate-300 hover:text-slate-500 transition-colors" />}
                        </button>
                      </td>
                      {/* Estado */}
                      <td className="px-3 py-3 text-center">
                        {s.es_vigente ? (
                          <span className="inline-flex items-center gap-1 bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded-lg">
                            <Star size={9} className="fill-white" /> VIGENTE
                          </span>
                        ) : s.activa ? (
                          <span className="inline-flex items-center bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-lg">ACTIVA</span>
                        ) : (
                          <span className="inline-flex items-center bg-slate-100 text-slate-400 text-[10px] font-black px-2 py-1 rounded-lg">INACTIVA</span>
                        )}
                      </td>
                      {/* Acciones */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!s.es_vigente && (
                            <button onClick={() => handleMarcarVigente(s)} title="Marcar como vigente"
                              className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                              <Star size={13} />
                            </button>
                          )}
                          <button onClick={() => openEdit(s)} title="Editar"
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                            <Edit2 size={13} />
                          </button>
                          {!s.es_vigente && (
                            <button onClick={() => handleDelete(s)} title="Eliminar"
                              className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal crear/editar ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-800 text-lg">{editItem ? 'Editar Semana' : 'Nueva Semana'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Fecha de inicio (miércoles)</label>
                <input type="date" value={form.fecha_inicio}
                  onChange={e => {
                    const v = e.target.value
                    setForm(f => ({ ...f, fecha_inicio: v, numero_semana: v && isWednesday(v) ? String(getNumSemana(v)) : f.numero_semana }))
                  }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                {form.fecha_inicio && !isWednesday(form.fecha_inicio) && (
                  <p className="text-[11px] text-red-500 font-semibold mt-1">⚠ Esta fecha no es miércoles.</p>
                )}
                {form.fecha_inicio && isWednesday(form.fecha_inicio) && (
                  <p className="text-[11px] text-emerald-600 font-semibold mt-1">✓ Rango: {formatRango(form.fecha_inicio)}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Número de semana</label>
                <input type="number" min="1" max="53" value={form.numero_semana}
                  onChange={e => setForm(f => ({ ...f, numero_semana: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                <p className="text-[11px] text-slate-400 font-semibold mt-1">Se calcula automáticamente al elegir la fecha. Puedes ajustarlo si tu calendario difiere.</p>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Notas (opcional)</label>
                <input type="text" value={form.notas} placeholder="Ej: Semana especial, feriados..."
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>

              {formError && <p className="text-xs text-red-600 font-bold bg-red-50 px-3 py-2 rounded-lg">{formError}</p>}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {editItem ? 'Guardar cambios' : 'Crear semana'}
              </button>
            </div>
          </div>
        </div>
      )}
    {Dialog}
    </div>
  )
}

export default function ConfiguracionTabs({ initialRol }: { initialRol: string }) {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'semanas')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [bitacoraModal, setBitacoraModal] = useState<{ open: boolean, modulo: string }>({ open: false, modulo: '' })

  useEffect(() => {
    async function fetchUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('perfiles_usuarios').select('*').eq('id', user.id).single()
        setCurrentUser(data)
      }
    }
    fetchUser()
  }, [])

  const tabsItems = [
    { id: 'semanas', label: 'Semanas Ganaderas', shortLabel: 'Semanas', icon: Calendar, iconSize: 18 },
    { id: 'usuarios', label: 'Usuarios', shortLabel: 'Usuarios', icon: Users, iconSize: 18 },
    { id: 'tasas', label: 'Tasas BCV', shortLabel: 'Tasas', icon: RefreshCcw, iconSize: 18 },
    { id: 'crioscopia', label: 'Tabla Crioscopía', shortLabel: 'Crioscopía', icon: FileSpreadsheet, iconSize: 18 },
    { id: 'precios', label: 'Precios', shortLabel: 'Precios', icon: Calculator, iconSize: 18 },
    { id: 'precios-deducciones', label: 'Precio Deducciones', shortLabel: 'Deduc.', icon: Truck, iconSize: 18 },
    { id: 'fabricas', label: 'Fábricas', shortLabel: 'Fábricas', icon: Building2, iconSize: 18 },
    { id: 'facturacion', label: 'Facturación', shortLabel: 'Fact.', icon: Receipt, iconSize: 18 },
    { id: 'vitacora', label: 'Bitácora', shortLabel: 'Bitácora', icon: History, iconSize: 18, adminOnly: true },
  ]

  return (
    <div className="space-y-6 fade-in pb-20">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Configuración del Sistema</h1>
        <p className="text-slate-500 mt-1">Parámetros avanzados, bases de datos y control de accesos.</p>
      </div>

      <div className="flex flex-wrap gap-1.5 bg-slate-200/50 p-1.5 rounded-xl">
        {tabsItems.filter(i => !i.adminOnly || currentUser?.rol === 'admin').map(item => {
           const Icon = item.icon
           return (
             <button
               key={item.id}
               onClick={() => setTab(item.id)}
               className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex-1 min-w-[70px] ${
                 tab === item.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
               }`}
             >
               <Icon size={item.iconSize ?? 18} />
               <span className="sm:hidden">{(item as any).shortLabel}</span>
               <span className="hidden sm:inline">{item.label}</span>
             </button>
           )
        })}
      </div>

      <div className="mt-6">
         {tab === 'semanas' && <SemanasGanaderasTab user={currentUser} />}
         {tab === 'usuarios' && <UsuariosTab user={currentUser} onOpenBitacora={() => setBitacoraModal({ open: true, modulo: 'Usuarios' })} />}
         {tab === 'tasas' && <TasasTab user={currentUser} onOpenBitacora={() => setBitacoraModal({ open: true, modulo: 'Tasas BCV' })} />}
         {tab === 'crioscopia' && <CrioscopiaTab user={currentUser} onOpenBitacora={() => setBitacoraModal({ open: true, modulo: 'Crioscopía' })} />}
         {tab === 'precios' && <PreciosTab user={currentUser} onOpenBitacora={() => setBitacoraModal({ open: true, modulo: 'Precios' })} />}
         {tab === 'precios-deducciones' && <PrecioDeduccionesTab user={currentUser} />}
         {tab === 'fabricas' && <FabricasTab user={currentUser} />}
         {tab === 'facturacion' && <FacturacionConfigTab user={currentUser} />}
         {tab === 'vitacora' && <VitacoraTab user={currentUser} />}
      </div>

      <ModalVitacora 
         isOpen={bitacoraModal.open} 
         modulo={bitacoraModal.modulo} 
         onClose={() => setBitacoraModal({ ...bitacoraModal, open: false })} 
      />
    </div>
  )
}
