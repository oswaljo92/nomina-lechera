'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Users, FileSpreadsheet, Settings2, RefreshCcw, Loader2, Upload, Download, Trash2, Undo2, Edit2, X, Search, Calculator, Save, History, Image as ImageIcon } from 'lucide-react'
import html2canvas from 'html2canvas'
import { logAction } from '@/lib/log-utils'

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
  const [nuevoUser, setNuevoUser] = useState({ email: '', password: '', role: 'analista', nombre: '', telefono: '' })
  const [editUser, setEditUser] = useState<any>(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
         setIsCreateModalOpen(false)
         setIsEditModalOpen(false)
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
     await supabase.from('perfiles_usuarios').update({
        rol: editUser.rol,
        nombre: editUser.nombre,
        telefono: editUser.telefono
     }).eq('id', editUser.id)
     setIsEditModalOpen(false)
     load()
     setLoading(false)
  }

  const uList = verBorrados ? usuariosBorrados : usuariosActivos

  return (
     <div className="space-y-6 fade-in">
       {/* Listado */}
       <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 flex justify-between p-4 border-b border-slate-200 items-center">
             <div>
               <h3 className="font-bold text-slate-800 text-lg">{verBorrados ? 'Usuarios Eliminados' : 'Directorio de Usuarios'}</h3>
               <p className="text-xs text-slate-500">{verBorrados ? 'Usuarios que no tienen acceso al sistema.' : 'Personal con acceso al sistema.'}</p>
             </div>
             <div className="flex gap-2">
                <button onClick={()=>setVerBorrados(!verBorrados)} className="text-sm font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 bg-white px-4 py-2 rounded-lg shadow-sm transition-colors">
                   {verBorrados ? 'Ver Activos' : 'Ver Borrados'}
                </button>
                {!verBorrados && (
                  <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg shadow-sm transition-colors">
                     <Plus size={16}/> Nuevo Usuario
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
                              <button onClick={()=>{setEditUser(u); setIsEditModalOpen(true)}} className="text-blue-600 hover:text-white hover:bg-blue-600 bg-blue-50 p-2 rounded transition-colors" title="Editar Rol y Datos">
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
       {isEditModalOpen && (
          <div onClick={(e) => { if(e.target === e.currentTarget) setIsEditModalOpen(false) }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in pb-10">
             <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden zoom-in-95 relative">
                {loading && <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-20 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-8 h-8"/></div>}
                <div className="flex justify-between items-center bg-slate-100 border-b border-slate-200">
                   <h3 className="font-bold text-slate-800 text-sm px-6">Editar Usuario: {editUser.email}</h3>
                   <button type="button" onClick={() => setIsEditModalOpen(false)} className="text-slate-500 hover:text-white hover:bg-red-500 px-5 py-4 transition-colors">
                      <X size={18}/>
                   </button>
                </div>
                <form className="p-6 space-y-4" onSubmit={handleEditUsuario}>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Nombre Completo (Display)</label>
                       <input autoFocus required type="text" value={editUser.nombre || ''} onChange={e=>setEditUser({...editUser, nombre: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 placeholder-slate-400" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Teléfono</label>
                       <input type="text" value={editUser.telefono || ''} onChange={e=>setEditUser({...editUser, telefono: e.target.value})} className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 placeholder-slate-400" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Reasignar Rol de Acceso</label>
                       <select value={editUser.rol} onChange={e=>setEditUser({...editUser, rol: e.target.value})} className="w-full bg-white text-black font-bold border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500">
                          <option value="analista">Analista</option>
                          <option value="admin">Administrador</option>
                       </select>
                    </div>
                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-4">
                       <button type="button" onClick={()=>setIsEditModalOpen(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3.5 px-6 rounded-xl transition-all">
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
       const text = evt.target?.result as string
       const lines = text.split('\n').filter(l => l.trim())
       
       const bulk = []
       for (let i = 1; i < lines.length; i++) { 
          const parts = lines[i].split(',')
          const fecha = parts[0]
          const dia = parts[1]
          const tasaStr = parts[2]
          if (fecha && tasaStr && !isNaN(parseFloat(tasaStr))) {
            bulk.push({ fecha: fecha.trim(), dia: dia?.trim() || '', tasa: parseFloat(tasaStr) })
          }
       }
       if (bulk.length > 0) {
         await supabase.from('tasas_bcv').upsert(bulk)
         logAction(supabase, user, 'Tasas BCV', 'IMPORTAR', `Cargados por CSV: ${bulk.length} registros de tasas`)
         load()
         alert('CSV Cargado con éxito')
       } else {
         alert('CSV vacío o formato incorrecto.')
       }
    }
    reader.readAsText(file)
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
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-3">
           <h3 className="font-bold text-slate-800 hidden md:block">Tasas Registradas</h3>
           <div className="flex gap-2 items-center w-full md:w-auto overflow-x-auto">
              <input 
                type="text" 
                placeholder="Buscar fecha, día o tasa..." 
                value={busqueda} 
                onChange={e=>setBusqueda(e.target.value)} 
                className="border border-slate-300 bg-white text-slate-900 font-medium placeholder-slate-500 rounded-lg p-1.5 px-3 text-sm focus:ring-2 focus:ring-blue-500 shadow-sm w-full md:w-56" 
              />
              {onOpenBitacora && (
                <button onClick={onOpenBitacora} className="flex shrink-0 items-center gap-2 bg-slate-200 text-slate-600 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                  <History size={16}/> Vitácora
                </button>
              )}
              <button onClick={() => fileRef.current?.click()} className="flex shrink-0 items-center gap-2 bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                <Upload size={16}/> CSV
              </button>
              <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleUpload}/>
              <button onClick={() => downloadCSV(tasas, 'tasas_bcv')} className="flex shrink-0 items-center gap-2 bg-slate-200 text-slate-700 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                <Download size={16}/> Exportar
              </button>
              <button onClick={() => setIsModalOpen(true)} className="flex shrink-0 items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm">
                <Plus size={16}/> Nuevo
              </button>
           </div>
        </div>
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
       const text = evt.target?.result as string
       const lines = text.split('\n').filter(l => l.trim())
       
       const bulk = []
       for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',')
          const pc = parseFloat(parts[0])
          const pct = parseFloat(parts[1])
          if (!isNaN(pc) && !isNaN(pct)) {
            bulk.push({ punto_crioscopico: pc, porcentaje_agua: pct })
          }
       }
       if (bulk.length > 0) {
         await supabase.from('tabla_crioscopia').upsert(bulk)
         logAction(supabase, user, 'Crioscopía', 'IMPORTAR', `Importados por CSV: ${bulk.length} registros de crioscopía`)
         load()
         alert('CSV de Crioscopía cargado con éxito')
       } else {
         alert('CSV vacío o mal formateado.')
       }
    }
    reader.readAsText(file)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-3">
           <h3 className="font-bold text-slate-800 hidden md:block">Puntos Crioscópicos</h3>
           <div className="flex gap-2 items-center w-full md:w-auto overflow-x-auto">
              <input 
                type="text" 
                placeholder="Buscar punto o %..." 
                value={busqueda} 
                onChange={e=>setBusqueda(e.target.value)} 
                className="border border-slate-300 bg-white text-slate-900 font-medium placeholder-slate-500 rounded-lg p-1.5 px-3 text-sm focus:ring-2 focus:ring-blue-500 shadow-sm w-full md:w-56" 
              />
              {onOpenBitacora && (
                <button onClick={onOpenBitacora} className="flex shrink-0 items-center gap-2 bg-slate-200 text-slate-600 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                  <History size={16}/> Vitácora
                </button>
              )}
              <button onClick={() => fileRef.current?.click()} className="flex shrink-0 items-center gap-2 bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                <Upload size={16}/> Subir CSV
              </button>
              <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleUpload}/>
              <button onClick={() => downloadCSV(crios, 'tabla_crioscopia')} className="flex shrink-0 items-center gap-2 bg-slate-200 text-slate-700 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors">
                <Download size={16}/> Exportar
              </button>
              <button onClick={() => setIsModalOpen(true)} className="flex shrink-0 items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm">
                <Plus size={16}/> Nuevo
              </button>
           </div>
        </div>
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
      <div className={`border border-slate-300 rounded bg-white min-h-[36px] p-1 flex flex-wrap gap-1 items-center ${disabled ? 'opacity-90 cursor-default' : 'cursor-text'}`} onClick={()=>{if(!disabled) setOpen(true)}}>
         {selected.map((cod:string) => {
            const op = options.find((o:any) => o.codigo_ganadero === cod)
            return <div key={cod} className="bg-blue-100 text-blue-800 text-[10px] sm:text-xs px-2 py-0.5 rounded shadow-sm text-left font-bold">{op?.nombre || cod}</div>
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
       <td className="border border-slate-200 text-center py-2 px-2">
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
       <td className="border border-slate-200 text-center py-2 space-x-2 px-2 whitespace-nowrap">
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

  useEffect(() => {
     async function pop() {
        const { data } = await supabase.from('tasas_bcv')
                         .select('*')
                         .in('dia', ['miercoles', 'Miércoles', 'miércoles', 'Miercoles'])
                         .order('fecha', { ascending: false })
                         
        if (data && data.length > 0) {
           setSemanas(data)
           
           // Detect start of current week (Wednesday)
           const now = new Date()
           const day = now.getDay()
           const diff = (day < 3 ? 7 : 0) + day - 3
           const prevWed = new Date(now)
           prevWed.setDate(now.getDate() - diff)
           const wedStr = prevWed.toISOString().split('T')[0]
           
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

  const exportAsImage = async () => {
    if (!tableRef.current) return
    try {
      const canvas = await html2canvas(tableRef.current, { scale: 2, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `PreciosSemanales-${selectedSemana}.png`
      link.href = imgData
      link.click()
    } catch (e) {
      alert("Error exportando a imagen")
      console.error(e)
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
             <div className="flex gap-2 items-center">
               <h3 className="font-bold text-slate-800 hidden md:block">Precios por Grupo</h3>
               <button onClick={exportAsImage} className="flex items-center gap-2 bg-slate-200 text-slate-700 hover:bg-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                 <ImageIcon size={14}/> Exportar Foto
               </button>
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
                        <th className="py-2 px-2 border border-slate-300 bg-slate-50 text-center text-slate-400" rowSpan={2}>
                           <input type="checkbox" checked={precios.length > 0 && selectedRows.length === precios.length} onChange={(e) => setSelectedRows(e.target.checked ? precios.map(p=>p.id) : [])} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"/>
                        </th>
                        <th className="py-2 px-3 border border-slate-300 bg-[#3b82f6] font-extrabold text-center text-white uppercase text-[11px]" rowSpan={2}>Rutas</th>
                        <th className="py-2 px-3 border border-slate-300 bg-[#3b82f6] font-extrabold text-center text-white uppercase text-[11px]" rowSpan={2}>Grupo</th>
                        <th className="py-2 px-3 border border-slate-300 bg-[#3b82f6] font-black text-center text-white text-[11px]" rowSpan={2}>BENEFICIARIO</th>
                        <th className="py-2 px-3 border border-slate-300 bg-[#3b82f6] font-extrabold text-center text-white uppercase text-[11px]" colSpan={4}>PRECIOS POR LITRO</th>
                        <th className="py-2 px-3 border border-slate-300 bg-[#3b82f6] font-extrabold text-center text-white uppercase text-[11px]" colSpan={2}>TOTAL A PAGAR A PUERTA PLANTA</th>
                        <th className="py-2 px-3 border border-slate-300 bg-slate-50 font-extrabold text-center text-slate-800 text-xs" rowSpan={2}>Acciones</th>
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
    { id: 'usuarios', label: 'Gestión de Usuarios', icon: Users },
    { id: 'tasas', label: 'Tasas BCV', icon: RefreshCcw },
    { id: 'crioscopia', label: 'Tabla Crioscopía', icon: FileSpreadsheet },
    { id: 'precios', label: 'Precios', icon: Calculator },
    { id: 'vitacora', label: 'Vitácora', icon: History, adminOnly: true },
  ]

  return (
    <div className="space-y-6 fade-in pb-20">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Configuración del Sistema</h1>
        <p className="text-slate-500 mt-1">Parámetros avanzados, bases de datos y control de accesos.</p>
      </div>

      <div className="flex space-x-2 bg-slate-200/50 p-1.5 rounded-xl overflow-x-auto">
        {tabsItems.filter(i => !i.adminOnly || currentUser?.rol === 'admin').map(item => {
           const Icon = item.icon
           return (
             <button
               key={item.id}
               onClick={() => setTab(item.id)}
               className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                 tab === item.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
               }`}
             >
               <Icon size={16} /> {item.label}
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
