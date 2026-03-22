'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit2, Trash2, Loader2, X, Search, AlertCircle, History, RefreshCcw } from 'lucide-react'
import { logAction } from '@/lib/log-utils'

export default function RutasPage() {
  const supabase = createClient()
  const [rutas, setRutas] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [curUser, setCurUser] = useState<any>(null)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isBitacoraOpen, setIsBitacoraOpen] = useState(false)
  const [editRuta, setEditRuta] = useState<any>(null)

  useEffect(() => { load() }, [])

  // Modals Keyboard Event
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false)
        setIsDeleteModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const load = async () => {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    const userObj = userData?.user
    const { data: profile } = await supabase.from('perfiles_usuarios').select('rol').eq('id', userObj?.id).single()
    setIsAdmin(profile?.rol === 'admin')
    setCurUser(userObj)

    const { data: rutasData } = await supabase.from('rutas').select('*').order('created_at', { ascending: false })
    if (rutasData) setRutas(rutasData)
    setLoading(false)
  }

  // Filtrado Avanzado
  const filteredRutas = rutas.filter(r => {
    const term = searchTerm.toLowerCase()
    return r.codigo_ruta?.toLowerCase().includes(term) ||
           r.nombre_ruta?.toLowerCase().includes(term) ||
           r.sap?.toLowerCase().includes(term)
  })

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (selectedIds.size === filteredRutas.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredRutas.map(r => r.id)))
  }

  const handleDeleteManyConf = async () => {
    await supabase.from('rutas').delete().in('id', Array.from(selectedIds))
    logAction(supabase, curUser, 'Rutas', 'BORRADO_MASIVO', `Eliminadas ${selectedIds.size} rutas permanentemente.`)
    setSelectedIds(new Set())
    setIsDeleteModalOpen(false)
    load()
  }

  const handleDeleteSingle = async (id: string, nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar la ruta: ${nombre}? \nEsta acción no se puede deshacer.`)) return
    await supabase.from('rutas').delete().eq('id', id)
    logAction(supabase, curUser, 'Rutas', 'BORRAR', `Eliminada ruta: ${nombre}`)
    load()
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editRuta.id) {
       await supabase.from('rutas').update({ 
         codigo_ruta: editRuta.codigo_ruta, 
         nombre_ruta: editRuta.nombre_ruta, 
         sap: editRuta.sap,
         activo: editRuta.activo !== false
       }).eq('id', editRuta.id)
       logAction(supabase, curUser, 'Rutas', 'EDITAR', `Editada ruta: ${editRuta.nombre_ruta} (${editRuta.codigo_ruta})`)
    } else {
       await supabase.from('rutas').insert({ 
         codigo_ruta: editRuta.codigo_ruta, 
         nombre_ruta: editRuta.nombre_ruta, 
         sap: editRuta.sap,
         activo: editRuta.activo !== false
       })
       logAction(supabase, curUser, 'Rutas', 'CREAR', `Creada nueva ruta: ${editRuta.nombre_ruta} (${editRuta.codigo_ruta})`)
    }
    setIsModalOpen(false)
    load()
  }

  if (loading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>

  return (
    <div className="space-y-6 fade-in pb-20">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Rutas de Recolección</h1>
          <p className="text-slate-500">Gestión de rutas.</p>
        </div>
        {isAdmin && (
          <button onClick={() => setIsBitacoraOpen(true)} className="flex items-center gap-2 px-6 py-3 font-bold text-slate-500 hover:text-slate-800 transition-all border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm">
             <History size={20} /> Vitácora
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Barra de Búsqueda y Herramientas */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between gap-4">
           <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por código, código SAP, o nombre de ruta..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-white text-black font-semibold focus:ring-2 focus:ring-blue-500 placeholder-slate-400 shadow-sm"
              />
           </div>
           
           <div className="flex gap-2">
              {selectedIds.size > 0 && isAdmin && (
                <button onClick={()=>setIsDeleteModalOpen(true)} className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-4 py-3 rounded-xl flex items-center gap-2 shadow-sm transition-colors border border-red-200">
                  <Trash2 size={18} /> Borrar Masivo ({selectedIds.size})
                </button>
              )}
              <button onClick={() => { setEditRuta({codigo_ruta: '', nombre_ruta: '', sap: ''}); setIsModalOpen(true) }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-xl flex items-center gap-2 shadow-sm transition-colors">
                <Plus size={18} /> Nueva Ruta
              </button>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {isAdmin && (
                  <th className="px-6 py-3 w-10">
                    <input type="checkbox" checked={selectedIds.size === filteredRutas.length && filteredRutas.length > 0} onChange={toggleAll} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Código</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">SAP</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredRutas.map((ruta) => (
                <tr key={ruta.id} className="hover:bg-slate-50 transition-colors">
                  {isAdmin && (
                    <td className="px-6 py-4">
                      <input type="checkbox" checked={selectedIds.has(ruta.id)} onChange={() => toggleSelection(ruta.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                    </td>
                  )}
                  {/* ACCIONES PRIMERO */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm flex gap-3">
                     <button onClick={() => { setEditRuta(ruta); setIsModalOpen(true) }} className="text-blue-500 hover:text-white hover:bg-blue-600 bg-blue-50 p-2 rounded transition-colors" title="Editar Ruta"><Edit2 size={16} /></button>
                     {isAdmin && (
                        <button onClick={() => handleDeleteSingle(ruta.id, ruta.nombre_ruta)} className="text-red-500 hover:text-white hover:bg-red-600 bg-red-50 p-2 rounded transition-colors" title="Eliminar Ruta"><Trash2 size={16} /></button>
                     )}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-blue-600">{ruta.codigo_ruta}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800">{ruta.nombre_ruta}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                     {ruta.activo !== false ? (
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full text-xs tracking-wider">ACTIVA</span>
                     ) : (
                        <span className="bg-rose-100 text-rose-800 font-bold px-3 py-1 rounded-full text-xs tracking-wider">BLOQUEADA</span>
                     )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-500">{ruta.sap || '-'}</td>
                </tr>
              ))}
              {filteredRutas.length === 0 && (
                <tr><td colSpan={5} className="text-center py-10 text-slate-500">No hay rutas encontradas. Modifique la búsqueda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal CRUD */}
      {isModalOpen && (
        <div onClick={(e) => { if(e.target === e.currentTarget) setIsModalOpen(false) }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in pb-10">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden zoom-in-95">
             <div className="flex justify-between items-center bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                <h3 className="font-bold text-slate-800 text-sm px-4">{editRuta.id ? 'Editar Ruta' : 'Crear Nueva Ruta'}</h3>
                {/* Boton Cerrar Windows 11 Style */}
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white hover:bg-red-500 px-4 py-3 transition-colors">
                   <X size={18}/>
                </button>
             </div>
             
             <form onSubmit={handleSave} className="p-6 space-y-4">
                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-1">Código de Ruta</label>
                   <input autoFocus required type="text" value={editRuta.codigo_ruta} onChange={e=>setEditRuta({...editRuta, codigo_ruta: e.target.value})} className="w-full bg-white text-black placeholder-slate-400 border border-slate-300 rounded p-2 focus:ring-2 focus:ring-blue-500 font-bold" placeholder="Ej: 300" />
                </div>
                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre Ruta</label>
                   <input required type="text" value={editRuta.nombre_ruta} onChange={e=>setEditRuta({...editRuta, nombre_ruta: e.target.value})} className="w-full bg-white text-black placeholder-slate-400 border border-slate-300 rounded p-2 focus:ring-2 focus:ring-blue-500 font-bold" placeholder="Ruta Central..." />
                </div>
                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-1">Código SAP (Opcional)</label>
                   <input type="text" value={editRuta.sap} onChange={e=>setEditRuta({...editRuta, sap: e.target.value})} className="w-full bg-white text-black placeholder-slate-400 border border-slate-300 rounded p-2 focus:ring-2 focus:ring-blue-500 font-bold" placeholder="Ej: R-300" />
                </div>
                
                <div className="pt-2">
                   <label className="flex items-center gap-3 bg-slate-50 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                     <input 
                       type="checkbox" 
                       checked={editRuta.activo !== false}
                       onChange={e=>setEditRuta({...editRuta, activo: e.target.checked})}
                       className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                     />
                     <div>
                       <div className="font-extrabold text-slate-800 text-sm">Ruta Activa y Operativa</div>
                       <div className="text-xs font-semibold text-slate-500">Desmarca para "Bloquear" la ruta temporalmente.</div>
                     </div>
                   </label>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-4">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-200 text-slate-700 font-bold px-5 py-2 rounded hover:bg-slate-300 transition-colors">Cancelar</button>
                   <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded shadow-lg shadow-blue-500/30 transition-colors">Guardar</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Modal Confirmación de Borrado */}
      {isDeleteModalOpen && (
        <div onClick={(e) => { if(e.target === e.currentTarget) setIsDeleteModalOpen(false) }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in pb-10">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden zoom-in-95 text-center p-8">
             <AlertCircle size={56} className="text-red-500 mx-auto mb-4" />
             <h3 className="text-xl font-extrabold text-slate-800 mb-2">Eliminar {selectedIds.size} Rutas</h3>
             <p className="text-slate-500 font-medium mb-8">Esta acción es destructiva e irreversible. Se borrarán permanentemente del sistema.</p>
             <div className="flex gap-3">
               <button onClick={()=>setIsDeleteModalOpen(false)} className="flex-1 bg-slate-200 text-slate-700 font-bold rounded-xl py-3 hover:bg-slate-300 transition-all">Cancelar</button>
               <button onClick={handleDeleteManyConf} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl py-3 shadow-lg shadow-red-500/30 transition-all">Sí, Eliminar</button>
             </div>
          </div>
        </div>
      )}

      {/* Modal Vitácora */}
      {isBitacoraOpen && <ModalVitacora isOpen={isBitacoraOpen} onClose={() => setIsBitacoraOpen(false)} module="Rutas" />}
    </div>
  )
}

function ModalVitacora({ isOpen, onClose, module }: { isOpen: boolean, onClose: () => void, module: string }) {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (isOpen) fetchLogs()
  }, [isOpen])

  const fetchLogs = async () => {
    setLoading(true)
    const { data } = await supabase.from('bitacora').select('*').eq('modulo', module).order('created_at', { ascending: false }).limit(100)
    if (data) setLogs(data)
    setLoading(false)
  }

  const filtered = logs.filter(l => 
    l.usuario_email?.toLowerCase().includes(search.toLowerCase()) ||
    l.accion?.toLowerCase().includes(search.toLowerCase()) ||
    l.detalles?.toLowerCase().includes(search.toLowerCase())
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in pb-10">
       <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col m-4">
          <div className="flex justify-between items-center p-6 bg-slate-100 border-b border-slate-200">
             <div>
                <h3 className="font-black text-slate-800 text-xl flex items-center gap-2">
                   <History className="text-blue-600"/> Vitácora de {module}
                </h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Historial detallado para auditoría en planta</p>
             </div>
             <button onClick={onClose} className="text-slate-400 hover:text-white hover:bg-red-500 p-2 rounded-full transition-all">
                <X size={24}/>
             </button>
          </div>
          <div className="p-6 flex-1 overflow-hidden flex flex-col">
             <div className="flex justify-between items-center gap-4 mb-4">
                <div className="relative flex-1 max-w-lg">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                   <input type="text" placeholder="Filtrar por usuario, acción o detalle..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 bg-white text-black font-extrabold focus:ring-2 focus:ring-blue-500 shadow-sm" />
                </div>
                <button onClick={fetchLogs} className="flex items-center gap-2 text-blue-600 font-bold hover:underline">
                   <RefreshCcw size={16} className={loading ? 'animate-spin' : ''}/> Actualizar
                </button>
             </div>

             <div className="flex-1 overflow-y-auto pr-2 space-y-3 pb-8">
                {loading ? <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500 w-12 h-12"/></div> : (
                  <>
                    {filtered.map(log => (
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
                             <p className="text-sm text-slate-700 font-extrabold leading-tight">{log.detalles}</p>
                          </div>
                          <div className="shrink-0 text-right bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm">
                             <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">Operador</div>
                             <div className="text-xs font-black text-slate-800">{log.usuario_email}</div>
                          </div>
                       </div>
                    ))}
                    {filtered.length === 0 && <div className="text-center py-20 text-slate-300 font-extrabold">No hay registros para este módulo.</div>}
                  </>
                )}
             </div>
          </div>
       </div>
    </div>
  )
}
