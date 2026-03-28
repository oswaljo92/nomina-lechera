'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Users, FileSpreadsheet, Settings2, RefreshCcw, Loader2, Upload, Download, Trash2, Undo2, Edit2, X, Search, Calculator, Save, History, Image as ImageIcon, CheckCircle2 } from 'lucide-react'
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

  return (
     <tr className="hover:bg-slate-50">
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
        <td className="px-6 py-4 text-sm">
           {isEditing ? (
             <button onClick={handleSave} className="bg-blue-600 text-white px-3 py-1 rounded font-bold text-xs"><Save size={14}/></button>
           ) : (
             <button onClick={() => setIsEditing(true)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded font-bold text-xs"><Edit2 size={14}/></button>
           )}
        </td>
     </tr>
  )
}

function TasasTab({ user, onOpenBitacora }: { user: any, onOpenBitacora?: () => void }) {
  const supabase = createClient()
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
         alert(`✅ ${bulk.length} tasas importadas con éxito.`)
       } else {
         alert('Archivo vacío o formato incorrecto.')
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
                  <History size={16}/> Vitácora
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
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Fecha (DD-MM-YYYY)</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Semana Ganadera</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Día</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Tasa BS BCV</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Acciones</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 p-4">
               {tasasFiltradas.map(t => {
                  const match = semanasGanaderas.find(s => s.fecha === t.fecha)
                  const semName = match ? `Semana ${match.semana}` : '-'
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

  return (
     <tr className="hover:bg-slate-50">
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
        <td className="px-6 py-4 text-sm">
           {isEditing ? (
             <button onClick={handleSave} className="bg-blue-600 text-white px-3 py-1 rounded font-bold text-xs"><Save size={14}/></button>
           ) : (
             <button onClick={() => setIsEditing(true)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded font-bold text-xs"><Edit2 size={14}/></button>
           )}
        </td>
     </tr>
  )
}

function CrioscopiaTab({ user, onOpenBitacora }: { user: any, onOpenBitacora?: () => void }) {
  const supabase = createClient()
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
         alert(`✅ ${bulk.length} puntos crioscópicos importados.`)
       } else {
         alert('Archivo vacío o formato incorrecto.')
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
                  <History size={16}/> Vitácora
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
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Punto (°H)</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">% Dcto Agua</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Acciones</th>
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

function PreciosRow({ p, tasaBase, ganaderosList, actualizarPrecio, borrarPrecio, onSelect, isSelected }: any) {
  const [isEditing, setIsEditing] = useState(!p.id)
  const [lecheUSD, setLecheUSD] = useState(p.precio_leche_usd || 0)
  const [fleteUSD, setFleteUSD] = useState(p.precio_flete_usd || 0)
  const [grupoNombre, setGrupoNombre] = useState(p.grupo || '')
  
  const [ganaderosStr, setGanaderosStr] = useState<string[]>(p.ganaderos || [])
  
  const selectedGanaderosObjs = ganaderosList.filter((g:any) => ganaderosStr.includes(g.codigo_ganadero))
  const rutasList = Array.from(new Set(selectedGanaderosObjs.map((g:any) => g.rutas?.codigo_ruta).filter(Boolean)))

  const totalBs = (Number(lecheUSD) + Number(fleteUSD)) * tasaBase
  const totalUSD = Number(lecheUSD) + Number(fleteUSD)

  const handleSave = () => {
     if (!grupoNombre || ganaderosStr.length === 0) return alert("Ingrese un Grupo y seleccione al menos un Ganadero")
     actualizarPrecio(p.id, { 
       grupo: grupoNombre,
       ganaderos: ganaderosStr,
       rutas: rutasList,
       precio_leche_usd: Number(lecheUSD), 
       precio_flete_usd: Number(fleteUSD),
       total_pagar_usd: Number(totalUSD),
       total_pagar_bs: Number(totalBs)
     })
     setIsEditing(false)
  }

  const lecheBs = Number(lecheUSD) * tasaBase
  const fleteBs = Number(fleteUSD) * tasaBase

  return (
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
       <td className="no-export border border-slate-200 text-center py-2 space-x-2 px-2 whitespace-nowrap">
         {isEditing ? (
           <button onClick={handleSave} className="bg-blue-600 text-white px-2 py-1.5 rounded shadow-sm hover:bg-blue-700 transition-colors"><Save size={16}/></button>
         ) : (
           <button onClick={() => setIsEditing(true)} className="bg-slate-200 text-slate-700 px-2 py-1.5 rounded hover:bg-slate-300 transition-colors"><Edit2 size={16}/></button>
         )}
         {p.id && (
           <button onClick={() => borrarPrecio(p.id, p.grupo)} className="bg-red-50 text-red-600 px-2 py-1.5 rounded hover:bg-red-600 hover:text-white transition-colors"><Trash2 size={16}/></button>
         )}
       </td>
    </tr>
  )
}

function PreciosTab({ user, onOpenBitacora }: { user: any, onOpenBitacora?: () => void }) {
  const supabase = createClient()
  const tableRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [semanas, setSemanas] = useState<any[]>([])
  const [selectedSemana, setSelectedSemana] = useState('')
  const [tasaBase, setTasaBase] = useState(0)

  const [precios, setPrecios] = useState<any[]>([])
  const [ganaderosList, setGanaderosList] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [dbError, setDbError] = useState('')
  const [selectedRows, setSelectedRows] = useState<string[]>([])
  const [busqueda, setBusqueda] = useState('')

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
        const { data: gs } = await supabase.from('ganaderos').select('codigo_ganadero, nombre, grupo, rutas(nombre_ruta, codigo_ruta)').eq('activo', true)
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
     }
  }, [selectedSemana, semanas])

  const actualizarPrecio = async (id: string, payload: any) => {
      if (!id) {
        const { error } = await supabase.from('precios_semanales').insert({
          ...payload,
          fecha_semana: selectedSemana
        })
        if(error) return alert("Error al guardar: " + error.message)
        logAction(supabase, user, 'Precios', 'CREAR', `Añadido precio semanal para Grupo ${payload.grupo} en la semana ${formatDate(selectedSemana)}`)
        setIsAdding(false)
      } else {
        const { error } = await supabase.from('precios_semanales').update(payload).eq('id', id)
        if(error) return alert("Error al guardar: " + error.message)
        logAction(supabase, user, 'Precios', 'EDITAR', `Actualizado precio semanal Grupo ${payload.grupo} (Semana ${formatDate(selectedSemana)})`)
      }

      // Sincronizar grupo en la tabla de ganaderos
      await supabase.from('ganaderos').update({ grupo: payload.grupo }).in('codigo_ganadero', payload.ganaderos)
      
      const { data } = await supabase.from('precios_semanales').select('*').eq('fecha_semana', selectedSemana).order('created_at')
      if(data) setPrecios(data)
   }

   const borrarPrecio = async (id: string, grupo: string) => {
      if(!confirm("¿Borrar configuracion de precio?")) return
      await supabase.from('precios_semanales').delete().eq('id', id)
      logAction(supabase, user, 'Precios', 'BORRAR', `Eliminado registro de precios para el grupo ${grupo} de la semana ${formatDate(selectedSemana)}`)
      setPrecios(p => p.filter(x => x.id !== id))
      setSelectedRows(s => s.filter(x => x !== id))
   }

  const handleMassDelete = async () => {
    if (selectedRows.length === 0) return
    if (!confirm(`¿Borrar ${selectedRows.length} registros seleccionados?`)) return
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
      alert("Error exportando a imagen")
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
    if (!selectedSemana) { alert('Selecciona una semana antes de importar.'); return }
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
        total_pagar_usd,
        total_pagar_bs
      }

      const { error } = await supabase.from('precios_semanales').upsert(payload, { onConflict: 'fecha_semana,grupo' })
      if (error) { errores.push(`Fila ${fila}: Error — ${error.message}`); continue }
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
              <select value={selectedSemana} onChange={e=>setSelectedSemana(e.target.value)} className="w-full bg-slate-50 border border-slate-300 text-slate-700 font-bold rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500">
                 {semanas.map(s => <option key={s.fecha} value={s.fecha}>Miércoles {formatDate(s.fecha)}</option>)}
                 {semanas.length === 0 && <option value="">Sin semanas mapeadas</option>}
              </select>
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
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-3">
             <div className="flex gap-2 items-center flex-wrap">
               <h3 className="font-bold text-slate-800 hidden md:block">Precios por Grupo</h3>
               <button onClick={exportAsImage} className="flex items-center gap-2 bg-slate-200 text-slate-700 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                 <ImageIcon size={14}/> Exportar Foto
               </button>
               <button onClick={exportAsExcel} className="flex items-center gap-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                 <Download size={14}/> Exportar Excel
               </button>
               <button onClick={handleDescargarPlantillaPrecios} className="flex items-center gap-2 bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                 <FileSpreadsheet size={14}/> Plantilla
               </button>
               <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                 <Upload size={14}/> Importar Excel
               </button>
               <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleArchivoImportPrecios} />
             </div>
             
             <div className="flex gap-2 items-center w-full md:w-auto overflow-x-auto">
               <div className="relative group shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                  <input 
                    type="text" 
                    placeholder="Buscar por grupo, ruta, $/Bs..." 
                    value={busqueda}
                    onChange={e=>setBusqueda(e.target.value)}
                    className="border border-slate-300 bg-white text-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 shadow-sm w-48 md:w-64"
                  />
               </div>

               {selectedRows.length > 0 && (
                 <button onClick={handleMassDelete} className="flex shrink-0 items-center gap-2 bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm animate-in zoom-in-95">
                   <Trash2 size={14}/> Eliminar ({selectedRows.length})
                 </button>
               )}
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
                        <PreciosRow p={{}} tasaBase={tasaBase} ganaderosList={ganaderosList} actualizarPrecio={actualizarPrecio} borrarPrecio={borrarPrecio} isSelected={false} onSelect={()=>{}} />
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

function VitacoraList({ moduloFilter }: { moduloFilter?: string }) {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchLogs()
  }, [moduloFilter])

  const fetchLogs = async () => {
    setLoading(true)
    let query = supabase.from('bitacora').select('*').order('created_at', { ascending: false }).limit(200)
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

  return (
    <div className="flex flex-col h-full min-h-[500px]">
       <div className="flex justify-between items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-lg">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
             <input 
               type="text" 
               placeholder="Filtrar registros..." 
               value={search}
               onChange={e=>setSearch(e.target.value)}
               className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 bg-white text-black font-extrabold focus:ring-2 focus:ring-blue-500 shadow-sm"
             />
          </div>
          <button onClick={fetchLogs} className="flex items-center gap-2 text-blue-600 font-bold hover:underline">
             <RefreshCcw size={16} className={loading ? 'animate-spin' : ''}/> Actualizar
          </button>
       </div>

       <div className="overflow-y-auto pr-1">
          {loading ? (
             <div className="flex flex-col items-center justify-center p-20">
                <Loader2 className="animate-spin text-blue-500 w-12 h-12"/>
             </div>
          ) : (
             <div className="space-y-3 pb-8">
                {filteredLogs.map(log => (
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
                {filteredLogs.length === 0 && <div className="text-center py-20 text-slate-300 font-extrabold">No hay registros.</div>}
             </div>
          )}
       </div>
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
                   <History className="text-blue-600"/> Vitácora: {modulo}
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

function VitacoraTab({ user }: { user: any }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6">
       <div className="mb-6">
          <h3 className="text-xl font-black text-slate-800">Vitácora Global</h3>
          <p className="text-sm text-slate-500 font-bold">Control total de actividades en el sistema.</p>
       </div>
       <VitacoraList />
    </div>
  )
}

export default function ConfiguracionTabs({ initialRol }: { initialRol: string }) {
  const supabase = createClient()
  const [tab, setTab] = useState('usuarios')
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
    { id: 'usuarios', label: 'Gestión de Usuarios', shortLabel: 'Usuarios', icon: Users },
    { id: 'tasas', label: 'Tasas BCV', shortLabel: 'Tasas', icon: RefreshCcw },
    { id: 'crioscopia', label: 'Tabla Crioscopía', shortLabel: 'Crioscopía', icon: FileSpreadsheet },
    { id: 'precios', label: 'Precios', shortLabel: 'Precios', icon: Calculator },
    { id: 'vitacora', label: 'Vitácora', shortLabel: 'Vitácora', icon: History, adminOnly: true },
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
               <Icon size={14} />
               <span className="sm:hidden">{(item as any).shortLabel}</span>
               <span className="hidden sm:inline">{item.label}</span>
             </button>
           )
        })}
      </div>

      <div className="mt-6">
         {tab === 'usuarios' && <UsuariosTab user={currentUser} onOpenBitacora={() => setBitacoraModal({ open: true, modulo: 'Usuarios' })} />}
         {tab === 'tasas' && <TasasTab user={currentUser} onOpenBitacora={() => setBitacoraModal({ open: true, modulo: 'Tasas BCV' })} />}
         {tab === 'crioscopia' && <CrioscopiaTab user={currentUser} onOpenBitacora={() => setBitacoraModal({ open: true, modulo: 'Crioscopía' })} />}
         {tab === 'precios' && <PreciosTab user={currentUser} onOpenBitacora={() => setBitacoraModal({ open: true, modulo: 'Precios' })} />}
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
