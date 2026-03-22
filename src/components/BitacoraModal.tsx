'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, RefreshCcw, Loader2, History, Search } from 'lucide-react'

interface BitacoraModalProps {
  isOpen: boolean
  onClose: () => void
  moduleFilter?: string // Si se provee, solo mostrar logs de este módulo
  title?: string
}

export default function BitacoraModal({ isOpen, onClose, moduleFilter, title }: BitacoraModalProps) {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchLogs()
    }
  }, [isOpen])

  const fetchLogs = async () => {
    setLoading(true)
    let query = supabase
      .from('bitacora')
      .select('*')
      .order('created_at', { ascending: false })

    if (moduleFilter) {
      query = query.eq('modulo', moduleFilter)
    }

    const { data } = await query.limit(100)
    if (data) setLogs(data)
    setLoading(false)
  }

  const filteredLogs = logs.filter(l => 
    l.usuario_email?.toLowerCase().includes(search.toLowerCase()) ||
    l.accion?.toLowerCase().includes(search.toLowerCase()) ||
    l.detalles?.toLowerCase().includes(search.toLowerCase()) ||
    (!moduleFilter && l.modulo?.toLowerCase().includes(search.toLowerCase()))
  )

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('es-VE')
  }

  if (!isOpen) return null

  return (
    <div onClick={(e) => { if(e.target === e.currentTarget) onClose() }} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in p-4 pb-12">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] zoom-in-95">
        <div className="flex justify-between items-center bg-slate-100 border-b border-slate-200 p-4">
           <div className="flex items-center gap-2">
              <History className="text-blue-600" size={20}/>
              <h3 className="font-bold text-slate-800">{title || `Bitácora de Actividad ${moduleFilter ? `- ${moduleFilter}` : ''}`}</h3>
           </div>
           <button onClick={onClose} className="text-slate-500 hover:text-white hover:bg-red-500 p-2 rounded-lg transition-colors">
              <X size={20}/>
           </button>
        </div>

        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
           <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
              <input 
                type="text" 
                placeholder="Filtrar por usuario, acción..." 
                value={search}
                onChange={e=>setSearch(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-blue-500"
              />
           </div>
           <button onClick={fetchLogs} className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:underline">
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''}/> Actualizar
           </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
           {loading ? (
              <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500 w-10 h-10"/></div>
           ) : (
              <div className="space-y-3">
                 {filteredLogs.map((log) => (
                    <div key={log.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:shadow-md transition-shadow">
                       <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-3">
                             <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                log.accion === 'BORRAR' || log.accion === 'BORRADO_MASIVO' ? 'bg-red-100 text-red-700 border border-red-200' :
                                log.accion === 'CREAR' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                'bg-blue-100 text-blue-700 border border-blue-200'
                             }`}>
                                {log.accion}
                             </div>
                             {!moduleFilter && (
                                <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">{log.modulo}</span>
                             )}
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">{formatDate(log.created_at)}</span>
                       </div>
                       <p className="text-sm font-bold text-slate-800 mb-1">{log.detalles}</p>
                       <div className="text-[11px] font-semibold text-slate-500">Usuario: {log.usuario_email}</div>
                    </div>
                 ))}
                 {filteredLogs.length === 0 && (
                    <div className="text-center py-20 text-slate-400 font-bold italic">No se encontraron registros que coincidan con la búsqueda.</div>
                 )}
              </div>
           )}
        </div>
      </div>
    </div>
  )
}
