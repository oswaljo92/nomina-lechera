'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit2, Trash2, Loader2, X, Search, AlertCircle, History, RefreshCcw } from 'lucide-react'
import { logAction } from '@/lib/log-utils'
import { useFabrica } from '@/contexts/FabricaContext'

export default function RutasPage() {
  const supabase = createClient()
  const { selectedFabricaId, selectedFabrica } = useFabrica()
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

  useEffect(() => { load() }, [selectedFabricaId])

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

    const rutaQ = supabase.from('rutas').select('*').order('created_at', { ascending: false })
    if (selectedFabricaId) rutaQ.eq('fabrica_id', selectedFabricaId)
    const { data: rutasData } = await rutaQ
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
    logAction(supabase, curUser, 'Rutas', 'BORRADO_MASIVO', `Eliminadas ${selectedIds.size} rutas.`)
    setSelectedIds(new Set())
    setIsDeleteModalOpen(false)
    load()
  }

  const handleDeleteSingle = async (id: string, nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar la ruta: ${nombre}?`)) return
    await supabase.from('rutas').delete().eq('id', id)
    logAction(supabase, curUser, 'Rutas', 'BORRAR', `Eliminada ruta: ${nombre}`)
    load()
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const rutaPayload: any = {
      codigo_ruta: editRuta.codigo_ruta,
      nombre_ruta: editRuta.nombre_ruta,
      sap: editRuta.sap,
      activo: editRuta.activo !== false,
      ...(selectedFabricaId ? { fabrica_id: selectedFabricaId } : {})
    }
    if (editRuta.id) {
       await supabase.from('rutas').update(rutaPayload).eq('id', editRuta.id)
       logAction(supabase, curUser, 'Rutas', 'EDITAR', `Editada ruta: ${editRuta.nombre_ruta}`)
    } else {
       await supabase.from('rutas').insert(rutaPayload)
       logAction(supabase, curUser, 'Rutas', 'CREAR', `Creada ruta: ${editRuta.nombre_ruta}`)
    }
    setIsModalOpen(false)
    load()
  }

  if (loading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>

  return (
    <div className="space-y-6 fade-in pb-20 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Rutas</h1>
            {selectedFabrica && <span className="bg-blue-100 text-blue-800 text-xs font-black px-3 py-1 rounded-full">{selectedFabrica.codigo} · {selectedFabrica.nombre}</span>}
          </div>
          <p className="text-slate-500 text-sm">Gestión de rutas de recolección.</p>
        </div>
        {isAdmin && (
          <button onClick={() => setIsBitacoraOpen(true)} className="flex items-center justify-center gap-2 px-6 py-2.5 font-bold text-slate-500 hover:text-slate-800 transition-all border border-slate-200 rounded-xl bg-white w-full sm:w-auto shadow-sm">
             <History size={18} /> Vitácora
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col lg:flex-row justify-between gap-4">
           <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar ruta..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-blue-500"
              />
           </div>
           
           <div className="flex flex-col sm:flex-row gap-2">
              {selectedIds.size > 0 && isAdmin && (
                <button onClick={()=>setIsDeleteModalOpen(true)} className="bg-red-50 text-red-700 font-bold px-4 py-2 rounded-xl flex items-center justify-center gap-2 border border-red-100">
                  <Trash2 size={16} /> Borrar ({selectedIds.size})
                </button>
              )}
              <button onClick={() => { setEditRuta({codigo_ruta: '', nombre_ruta: '', sap: ''}); setIsModalOpen(true) }} className="bg-blue-600 text-white font-bold px-5 py-2 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
                <Plus size={18} /> Nueva Ruta
              </button>
           </div>
        </div>

        {/* Vista Mobile - Tarjetas */}
        <div className="sm:hidden divide-y divide-slate-100">
          {filteredRutas.length === 0 ? (
            <div className="p-10 text-center text-slate-400 font-bold text-sm">Sin resultados</div>
          ) : filteredRutas.map((ruta) => (
            <div key={ruta.id} className="p-4 flex items-start gap-3">
              {isAdmin && (
                <input type="checkbox" checked={selectedIds.has(ruta.id)} onChange={() => toggleSelection(ruta.id)} className="mt-1 w-5 h-5 shrink-0 rounded" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-black text-blue-600">{ruta.codigo_ruta}</span>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">{ruta.nombre_ruta}</p>
                    {ruta.sap && <p className="text-xs text-slate-500 mt-0.5">SAP: {ruta.sap}</p>}
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black ${ruta.activo !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    {ruta.activo !== false ? 'ACTIVA' : 'BLOQUEADA'}
                  </span>
                </div>
                <div className="flex justify-end mt-3 gap-2">
                  <button onClick={() => { setEditRuta(ruta); setIsModalOpen(true) }} className="text-blue-500 bg-blue-50 p-2 rounded-lg active:scale-95"><Edit2 size={15} /></button>
                  {isAdmin && <button onClick={() => handleDeleteSingle(ruta.id, ruta.nombre_ruta)} className="text-red-500 bg-red-50 p-2 rounded-lg active:scale-95"><Trash2 size={15} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Vista Desktop - Tabla */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {isAdmin && <th className="px-6 py-3 w-10 text-center"><input type="checkbox" checked={selectedIds.size === filteredRutas.length && filteredRutas.length > 0} onChange={toggleAll} /></th>}
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase text-slate-500">Acciones</th>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase text-slate-500">Código</th>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase text-slate-500">Nombre</th>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase text-slate-500 text-right">Estado / SAP</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredRutas.map((ruta) => (
                <tr key={ruta.id} className="hover:bg-slate-50 transition-colors">
                  {isAdmin && <td className="px-6 py-4 text-center"><input type="checkbox" checked={selectedIds.has(ruta.id)} onChange={() => toggleSelection(ruta.id)} /></td>}
                  <td className="px-6 py-4 whitespace-nowrap text-sm flex gap-3">
                     <button onClick={() => { setEditRuta(ruta); setIsModalOpen(true) }} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16} /></button>
                     {isAdmin && <button onClick={() => handleDeleteSingle(ruta.id, ruta.nombre_ruta)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16} /></button>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs font-black text-blue-600">{ruta.codigo_ruta}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-slate-800">{ruta.nombre_ruta}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                     <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${ruta.activo !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                           {ruta.activo !== false ? 'ACTIVA' : 'BLOQUEADA'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">{ruta.sap || '-'}</span>
                     </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto overflow-hidden animate-in zoom-in-95">
             <div className="flex justify-between items-center bg-slate-50 border-b border-slate-200 p-4">
                <h3 className="font-black text-slate-800 text-sm">{editRuta.id ? 'Editar Ruta' : 'Nueva Ruta'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
             </div>
             
             <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-4">
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Código</label>
                   <input autoFocus required type="text" value={editRuta.codigo_ruta} onChange={e=>setEditRuta({...editRuta, codigo_ruta: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold" />
                </div>
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Nombre</label>
                   <input required type="text" value={editRuta.nombre_ruta} onChange={e=>setEditRuta({...editRuta, nombre_ruta: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold" />
                </div>
                <div>
                   <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">SAP (Opcional)</label>
                   <input type="text" value={editRuta.sap} onChange={e=>setEditRuta({...editRuta, sap: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold" />
                </div>
                
                <div>
                    <label className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer">
                      <input type="checkbox" checked={editRuta.activo !== false} onChange={e=>setEditRuta({...editRuta, activo: e.target.checked})} className="w-4 h-4 rounded text-blue-600" />
                      <span className="text-xs font-bold text-slate-700">Ruta Activa</span>
                    </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-6 border-t">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-100 text-slate-600 font-bold py-3 rounded-xl order-2 sm:order-1">Cancelar</button>
                   <button type="submit" className="bg-blue-600 text-white font-black py-3 rounded-xl order-1 sm:order-2 shadow-lg shadow-blue-500/20">Guardar</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 text-center max-w-sm w-full animate-in zoom-in-95">
             <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
             <h3 className="font-black text-lg text-slate-800">¿Eliminar registros?</h3>
             <p className="text-slate-500 text-sm mb-6 mt-2">Esta acción borrará permanentemente {selectedIds.size} rutas.</p>
             <div className="grid grid-cols-2 gap-3">
               <button onClick={()=>setIsDeleteModalOpen(false)} className="bg-slate-100 text-slate-600 font-bold py-3 rounded-xl">Cerrar</button>
               <button onClick={handleDeleteManyConf} className="bg-red-600 text-white font-black py-3 rounded-xl">Eliminar</button>
             </div>
          </div>
        </div>
      )}

      {isBitacoraOpen && <ModalVitacora isOpen={isBitacoraOpen} onClose={() => setIsBitacoraOpen(false)} module="Rutas" />}
    </div>
  )
}

function ModalVitacora({ isOpen, onClose, module }: { isOpen: boolean, onClose: () => void, module: string }) {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { if (isOpen) fetchLogs() }, [isOpen])

  const fetchLogs = async () => {
    setLoading(true)
    const { data } = await supabase.from('bitacora').select('*').eq('modulo', module).order('created_at', { ascending: false }).limit(50)
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
       <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <div className="flex justify-between items-center p-4 sm:p-6 bg-slate-50 border-b border-slate-200 shrink-0">
             <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <History className="text-blue-600" size={18}/> Vitácora {module}
             </h3>
             <button onClick={onClose} className="text-slate-400 hover:text-red-500 p-1"><X size={24}/></button>
          </div>
          <div className="p-4 flex-1 overflow-hidden flex flex-col">
             <div className="relative mb-4">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                <input type="text" placeholder="Filtrar..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 font-bold text-xs" />
             </div>
             <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {loading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500"/></div> : (
                   filtered.map(log => (
                      <div key={log.id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col gap-1">
                         <div className="flex justify-between items-center">
                            <span className="text-[8px] font-black text-slate-400 uppercase">{new Date(log.created_at).toLocaleString()}</span>
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-blue-100 text-blue-700 uppercase">{log.accion}</span>
                         </div>
                         <p className="text-[11px] font-bold text-slate-800 leading-tight">{log.detalles}</p>
                         <span className="text-[8px] font-medium text-slate-500 italic truncate">{log.usuario_email}</span>
                      </div>
                   ))
                )}
             </div>
          </div>
       </div>
    </div>
  )
}
