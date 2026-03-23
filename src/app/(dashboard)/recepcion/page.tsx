'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, Save, Search, Loader2, List, FileSpreadsheet, CheckCircle2, AlertCircle, Edit2, X, History, RefreshCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { logAction } from '@/lib/log-utils'
import { useFabrica } from '@/contexts/FabricaContext'

export default function RecepcionPage() {
  const supabase = createClient()
  const router = useRouter()
  const { selectedFabricaId, selectedFabrica } = useFabrica()
  
  const [tab, setTab] = useState('nuevo') // 'nuevo' | 'historial'
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [curUser, setCurUser] = useState<any>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  // Catálogos
  const [rutas, setRutas] = useState<any[]>([])
  const [ganaderos, setGanaderos] = useState<any[]>([])
  const [crioscopia, setCrioscopia] = useState<any[]>([])

  // Datos Historial
  const [historialCamiones, setHistorialCamiones] = useState<any[]>([])
  const [filtroHistorial, setFiltroHistorial] = useState('')
  const [selectedHistorialIds, setSelectedHistorialIds] = useState<Set<string>>(new Set())
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isBitacoraOpen, setIsBitacoraOpen] = useState(false)
  const [selectedSemanaHistorial, setSelectedSemanaHistorial] = useState<string>('')

  const [camion, setCamion] = useState<{
    id?: string,
    ticket_romana: string,
    placa: string,
    codigo_ruta: string,
    ruta_id: string,
    nombre_ruta: string,
    litros_romana: number,
    fecha: string
  }>({
    ticket_romana: '',
    placa: '',
    codigo_ruta: '',
    ruta_id: '',
    nombre_ruta: '',
    litros_romana: 0,
    fecha: new Date().toISOString().split('T')[0]
  })

  const [detalles, setDetalles] = useState<any[]>([])

  useEffect(() => {
    async function loadData() {
      const { data: userData } = await supabase.auth.getUser()
      const userObj = userData?.user
      const { data: profile } = await supabase.from('perfiles_usuarios').select('rol').eq('id', userObj?.id).single()
      setIsAdmin(profile?.rol === 'admin')
      setCurUser(userObj)

      const rutasQuery = supabase.from('rutas').select('*').eq('activo', true)
      const ganaderoQuery = supabase.from('ganaderos').select('*, rutas(nombre_ruta)').eq('activo', true)

      if (selectedFabricaId) {
        rutasQuery.eq('fabrica_id', selectedFabricaId)
        ganaderoQuery.eq('fabrica_id', selectedFabricaId)
      }

      const [resRutas, resGanaderos, resCrios] = await Promise.all([
        rutasQuery,
        ganaderoQuery,
        supabase.from('tabla_crioscopia').select('*').order('punto_crioscopico', { ascending: false })
      ])

      if (resRutas.data) setRutas(resRutas.data)
      if (resGanaderos.data) setGanaderos(resGanaderos.data)
      if (resCrios.data) setCrioscopia(resCrios.data)

      setIsLoading(false)
    }
    loadData()
  }, [selectedFabricaId])

  useEffect(() => {
    if (tab === 'historial') {
      loadHistorial()
    }
  }, [tab, selectedFabricaId])

  const loadHistorial = async () => {
     setIsLoading(true)
     const q = supabase.from('recepciones_camion').select(`
       *,
       rutas (codigo_ruta, nombre_ruta),
       recepciones_detalle (
          id, litros_recepcion, grasa, proteina, acidez, temperatura, h_reductasa, ufc, crioscopia, porcentaje_agua_desc, litros_descuento, litros_a_pagar, ganadero_id,
          ganaderos (codigo_ganadero, nombre, ubicacion, tipo_proveedor)
       )
     `).order('fecha_ingreso', { ascending: false })

     if (selectedFabricaId) q.eq('fabrica_id', selectedFabricaId)

     const { data } = await q
     if (data) setHistorialCamiones(data)
     setIsLoading(false)
     // Reset semana selection so it auto-picks the most recent for this factory
     setSelectedSemanaHistorial('')
  }

  const handleCamionRutaChange = (val: string) => {
    const r = rutas.find((ru) => ru.codigo_ruta === val) || rutas.find((ru) => ru.id === val)
    setCamion({
      ...camion,
      codigo_ruta: r ? r.codigo_ruta : val,
      nombre_ruta: r ? r.nombre_ruta : '',
      ruta_id: r ? r.id : ''
    })
  }

  const cancelEdit = () => {
     setCamion({
       id: undefined,
       ticket_romana: '',
       placa: '',
       codigo_ruta: '',
       ruta_id: '',
       nombre_ruta: '',
       litros_romana: 0,
       fecha: new Date().toISOString().split('T')[0]
     })
     setDetalles([])
  }

  const handleEditRecepcion = (hc: any) => {
     setCamion({
       id: hc.id,
       ticket_romana: hc.ticket_romana,
       placa: hc.placa,
       codigo_ruta: hc.rutas?.codigo_ruta || '',
       ruta_id: hc.ruta_id,
       nombre_ruta: hc.rutas?.nombre_ruta || '',
       litros_romana: hc.litros_romana,
       fecha: hc.fecha_ingreso.split('T')[0]
     })
     
     const mappedDetalles = (hc.recepciones_detalle || []).map((d: any) => ({
        id_temp: Math.random().toString(),
        ganadero_id: d.ganadero_id,
        codigo_ganadero: d.ganaderos?.codigo_ganadero || '',
        nombre: d.ganaderos?.nombre || '',
        ubicacion: d.ganaderos?.ubicacion || '',
        ruta_nombre: '', 
        tipo_proveedor: d.ganaderos?.tipo_proveedor || '',
        litros_recepcion: d.litros_recepcion,
        grasa: d.grasa,
        proteina: d.proteina,
        acidez: d.acidez,
        temperatura: d.temperatura,
        h_reductasa: d.h_reductasa,
        ufc: d.ufc,
        crioscopia: d.crioscopia != null ? String(d.crioscopia) : '',
        porcentaje_agua_desc: d.porcentaje_agua_desc,
        litros_descuento: d.litros_descuento,
        litros_a_pagar: d.litros_a_pagar
     }))
     
     setDetalles(mappedDetalles)
     setTab('nuevo')
  }

  const totalLitrosGanaderos = detalles.reduce((acc, curr) => acc + Number(curr.litros_recepcion || 0), 0)
  const diferenciaLitros = Number(camion.litros_romana || 0) - totalLitrosGanaderos
  const totalLitrosPagar = detalles.reduce((acc, curr) => acc + Number(curr.litros_a_pagar || 0), 0)

  const addGanadero = () => {
    setDetalles([
      ...detalles, 
      {
        id_temp: Math.random().toString(),
        ganadero_id: '',
        codigo_ganadero: '',
        nombre: '',
        ubicacion: '',
        ruta_nombre: '',
        tipo_proveedor: '',
        litros_recepcion: 0,
        grasa: 0,
        proteina: 0,
        acidez: 0,
        temperatura: 0,
        h_reductasa: 0,
        ufc: 0,
        crioscopia: '', 
        porcentaje_agua_desc: 0,
        litros_descuento: 0,
        litros_a_pagar: 0
      }
    ])
  }

  const removeGanadero = (id_temp: string) => {
    setDetalles(detalles.filter(d => d.id_temp !== id_temp))
  }

  const updateDetalle = (id_temp: string, field: string, value: any) => {
    setDetalles(detalles.map(d => {
      if (d.id_temp === id_temp) {
        const row = { ...d, [field]: value }
        
        if (field === 'codigo_ganadero') {
          const g = ganaderos.find(x => x.codigo_ganadero === value)
          if (g) {
            row.ganadero_id = g.id
            row.nombre = g.nombre
            row.ubicacion = g.ubicacion || ''
            row.ruta_nombre = Array.isArray(g.rutas) ? g.rutas[0]?.nombre_ruta : g.rutas?.nombre_ruta || ''
            row.tipo_proveedor = g.tipo_proveedor
          } else {
             row.ganadero_id = ''
             row.nombre = ''
             row.tipo_proveedor = ''
          }
        }
        
        if (field === 'litros_recepcion' || field === 'crioscopia') {
           const crioNum = parseFloat(field === 'crioscopia' ? value : row.crioscopia)
           const lts = Number(field === 'litros_recepcion' ? value : row.litros_recepcion) || 0

           if (!isNaN(crioNum)) {
              const nearest = crioscopia.reduce((prev, curr) => 
                  Math.abs(curr.punto_crioscopico - crioNum) < Math.abs(prev.punto_crioscopico - crioNum) ? curr : prev
              , crioscopia[0] || { porcentaje_agua: 0 })
              
              row.porcentaje_agua_desc = nearest.porcentaje_agua || 0
              row.litros_descuento = (lts * row.porcentaje_agua_desc) / 100
              row.litros_a_pagar = lts - row.litros_descuento
           } else {
              row.porcentaje_agua_desc = 0
              row.litros_descuento = 0
              row.litros_a_pagar = lts
           }
        }

        return row
      }
      return d
    }))
  }

  const handleSave = async () => {
    if (!camion.ruta_id) return alert('Debes seleccionar una ruta válida para el camión.')
    if (detalles.length === 0) return alert('Debes agregar al menos un ganadero.')
    if (detalles.some(d => !d.ganadero_id)) return alert('Algunos ganaderos no son válidos (falta código).')

    setIsSaving(true)
    let recepcionId = camion.id

    if (camion.id) {
       const { error: recError } = await supabase.from('recepciones_camion').update({
         ticket_romana: camion.ticket_romana,
         placa: camion.placa,
         ruta_id: camion.ruta_id,
         litros_romana: camion.litros_romana,
         fecha_ingreso: new Date(camion.fecha).toISOString(),
         ...(selectedFabricaId ? { fabrica_id: selectedFabricaId } : {})
       }).eq('id', camion.id)

       if (recError) {
         alert('Error actualizando camión: ' + recError.message)
         setIsSaving(false)
         return
       }
       await supabase.from('recepciones_detalle').delete().eq('recepcion_id', camion.id)
       logAction(supabase, curUser, 'Recepción', 'EDITAR', `Actualizada recepción camión: ${camion.ticket_romana} (${camion.placa})`)
    } else {
       const { data: recData, error: recError } = await supabase.from('recepciones_camion').insert({
         ticket_romana: camion.ticket_romana,
         placa: camion.placa,
         ruta_id: camion.ruta_id,
         litros_romana: camion.litros_romana,
         fecha_ingreso: new Date(camion.fecha).toISOString(),
         ...(selectedFabricaId ? { fabrica_id: selectedFabricaId } : {})
       }).select().single()

       if (recError) {
         alert('Error guardando camión: ' + recError.message)
          setIsSaving(false)
          return
       }
       recepcionId = recData.id
       logAction(supabase, curUser, 'Recepción', 'CREAR', `Nueva recepción camión: ${camion.ticket_romana} (${camion.placa})`)
    }

    const payloadDetalles = detalles.map(d => ({
      recepcion_id: recepcionId,
      ganadero_id: d.ganadero_id,
      litros_recepcion: d.litros_recepcion,
      grasa: d.grasa,
      proteina: d.proteina,
      acidez: d.acidez,
      temperatura: d.temperatura,
      h_reductasa: d.h_reductasa,
      ufc: d.ufc,
      crioscopia: parseFloat(d.crioscopia) || 0,
      porcentaje_agua_desc: d.porcentaje_agua_desc,
      litros_descuento: d.litros_descuento,
      litros_a_pagar: d.litros_a_pagar
    }))

    const { error: detError } = await supabase.from('recepciones_detalle').insert(payloadDetalles)
    setIsSaving(false)
    if (detError) {
       alert('Error guardando detalles: ' + detError.message)
    } else {
       setShowSuccess(true)
       setTimeout(() => setShowSuccess(false), 5000)
       cancelEdit()
       setTab('historial')
    }
  }

  const toggleSelection = (id: string) => {
    const next = new Set(selectedHistorialIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedHistorialIds(next)
  }

  const toggleAll = () => {
    if (selectedHistorialIds.size === filteredCamiones.length) setSelectedHistorialIds(new Set())
    else setSelectedHistorialIds(new Set(filteredCamiones.map(r => r.id)))
  }

  const handleDeleteManyConf = async () => {
    await supabase.from('recepciones_camion').delete().in('id', Array.from(selectedHistorialIds))
    logAction(supabase, curUser, 'Recepción', 'BORRADO_MASIVO', `Eliminadas ${selectedHistorialIds.size} recepciones.`)
    setSelectedHistorialIds(new Set())
    setIsDeleteModalOpen(false)
    loadHistorial()
  }

  const handleDeleteSingle = async (id: string, refText: string) => {
    if (!confirm(`¿Estás seguro de eliminar el registro del camión ${refText}?`)) return
    await supabase.from('recepciones_camion').delete().eq('id', id)
    logAction(supabase, curUser, 'Recepción', 'BORRAR', `Eliminada recepción camión: ${refText}`)
    loadHistorial()
  }

  // Semana ganadera: miércoles a martes
  const getSemanaGanadera = (isoDate: string): string => {
    const p = isoDate.substring(0, 10).split('-')
    const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]))
    const daysSinceWed = (d.getDay() - 3 + 7) % 7
    const wed = new Date(d)
    wed.setDate(d.getDate() - daysSinceWed)
    return `${wed.getFullYear()}-${String(wed.getMonth()+1).padStart(2,'0')}-${String(wed.getDate()).padStart(2,'0')}`
  }

  const formatSemanaLabel = (wedStr: string): string => {
    const p = wedStr.split('-')
    const wed = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]))
    const tue = new Date(wed); tue.setDate(wed.getDate() + 6)
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
    return `Mié ${fmt(wed)} – Mar ${fmt(tue)}/${tue.getFullYear()}`
  }

  const semanasDisponibles = useMemo(() => {
    const weeks = new Set<string>()
    historialCamiones.forEach(hc => { if (hc.fecha_ingreso) weeks.add(getSemanaGanadera(hc.fecha_ingreso)) })
    return Array.from(weeks).sort().reverse()
  }, [historialCamiones])

  // Auto-select most recent week when historial loads
  useEffect(() => {
    if (semanasDisponibles.length > 0 && !selectedSemanaHistorial) {
      setSelectedSemanaHistorial(semanasDisponibles[0])
    }
  }, [semanasDisponibles])

  const filteredCamiones = historialCamiones.filter(hc => {
     if (selectedSemanaHistorial && hc.fecha_ingreso && getSemanaGanadera(hc.fecha_ingreso) !== selectedSemanaHistorial) return false
     if (!filtroHistorial) return true
     const t = filtroHistorial.toLowerCase()
     const codesStrings = hc.recepciones_detalle?.map((d:any) => d.ganaderos?.codigo_ganadero?.toLowerCase()).join(' ') || ''
     const nameStrings = hc.recepciones_detalle?.map((d:any) => d.ganaderos?.nombre?.toLowerCase()).join(' ') || ''
     return hc.ticket_romana?.toLowerCase().includes(t) ||
            hc.rutas?.nombre_ruta?.toLowerCase().includes(t) ||
            hc.fecha_ingreso?.includes(t) ||
            codesStrings.includes(t) ||
            nameStrings.includes(t)
  })

  const totalLitrosSemana = filteredCamiones.reduce((acc, hc) => acc + Number(hc.litros_romana || 0), 0)
  const totalLitrosPagarSemana = filteredCamiones.reduce((acc, hc) =>
    acc + (hc.recepciones_detalle?.reduce((s:number, d:any) => s + Number(d.litros_a_pagar || 0), 0) || 0), 0)

  const formatearFecha = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getFullYear()}`
  }

  if (isLoading && tab === 'nuevo') return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>

  return (
    <div className="space-y-6 fade-in pb-20 relative px-4 sm:px-0">
      {showSuccess && (
         <div className="fixed top-20 right-4 sm:right-10 z-[60] animate-in slide-in-from-top-10 fade-in duration-500">
            <div className="bg-emerald-600 text-white px-4 py-3 sm:px-6 sm:py-4 rounded-2xl shadow-2xl flex items-center gap-4">
               <CheckCircle2 size={24} className="text-emerald-100 shrink-0" />
               <div>
                 <h4 className="font-extrabold text-sm sm:text-lg">¡Operación Exitosa!</h4>
                 <p className="text-emerald-100 font-medium text-xs sm:text-sm">Datos registrados correctamente.</p>
               </div>
            </div>
         </div>
      )}
      
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center p-4 sm:p-6 border-b border-slate-200 gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Gestión de Recepción</h1>
              <p className="text-slate-500 mt-1 text-sm">Registro diario e historial de planta.</p>
            </div>
            {tab === 'nuevo' && detalles.length > 0 && (
               <button onClick={handleSave} disabled={isSaving} className="w-full lg:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 disabled:opacity-50">
                  {isSaving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                  {isSaving ? 'Guardando...' : (camion.id ? 'Guardar Cambios' : 'Guardar Recepción')}
               </button>
            )}
         </div>
         <div className="p-2 bg-slate-50 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl overflow-x-auto w-full sm:w-auto">
               <button onClick={()=>setTab('nuevo')} className={`flex items-center gap-2 px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${tab === 'nuevo' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200'}`}>
                  <Plus size={16}/> {camion.id ? 'Editando' : 'Carga de Camión'}
               </button>
               <button onClick={()=>setTab('historial')} className={`flex items-center gap-2 px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${tab === 'historial' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200'}`}>
                  <List size={16}/> Historial
               </button>
            </div>
            <div className="flex gap-3 items-center w-full sm:w-auto justify-end px-2">
               {isAdmin && (
                 <button onClick={() => setIsBitacoraOpen(true)} className="flex items-center gap-2 px-3 py-1.5 font-bold text-slate-500 hover:text-slate-800 text-xs">
                   <History size={16} /> Vitácora
                 </button>
               )}
               {camion.id && tab === 'nuevo' && (
                  <button onClick={cancelEdit} className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1">
                    <X size={14} /> Cancelar edición
                  </button>
               )}
            </div>
         </div>
      </div>

      {tab === 'historial' && (
         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col gap-3">
               {/* Selector de semana ganadera */}
               <div className="flex gap-2 items-center flex-wrap">
                  <span className="text-[10px] font-black text-slate-500 uppercase shrink-0">Semana:</span>
                  {semanasDisponibles.length === 0 ? (
                    <span className="text-xs text-slate-400">Sin registros</span>
                  ) : semanasDisponibles.map(sem => (
                    <button
                      key={sem}
                      onClick={() => { setSelectedSemanaHistorial(sem); setFiltroHistorial('') }}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${selectedSemanaHistorial === sem ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                    >
                      {formatSemanaLabel(sem)}
                    </button>
                  ))}
               </div>
               {/* Barra de búsqueda + totales */}
               <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <div className="relative flex-1 w-full">
                     <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                     <input type="text" placeholder="Filtrar dentro de la semana..." value={filtroHistorial} onChange={e => setFiltroHistorial(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-blue-500"/>
                  </div>
                  {selectedSemanaHistorial && (
                    <div className="flex gap-3 shrink-0">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-center">
                        <div className="text-[10px] font-black text-blue-500 uppercase">Litros Romana</div>
                        <div className="text-base font-black text-blue-800">{totalLitrosSemana.toLocaleString('es-VE')} L</div>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-center">
                        <div className="text-[10px] font-black text-emerald-600 uppercase">Total a Pagar</div>
                        <div className="text-base font-black text-emerald-800">{totalLitrosPagarSemana.toLocaleString('es-VE')} L</div>
                      </div>
                    </div>
                  )}
               </div>
            </div>
            
            {isLoading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500 w-10 h-10" /></div> : (
              <>
                {/* Vista Mobile - Tarjetas */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {filteredCamiones.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 font-bold text-sm">Sin registros</div>
                  ) : filteredCamiones.map(hc => (
                    <div key={hc.id} className="p-4 flex items-start gap-3">
                      <input type="checkbox" checked={selectedHistorialIds.has(hc.id)} onChange={() => toggleSelection(hc.id)} className="mt-1 w-5 h-5 shrink-0 rounded" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-extrabold text-blue-800 text-sm">{formatearFecha(hc.fecha_ingreso)}</span>
                            <p className="font-bold text-slate-800 text-xs mt-0.5">{hc.ticket_romana} · {hc.placa}</p>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{hc.recepciones_detalle?.map((d:any) => d.ganaderos?.codigo_ganadero).join(', ')}</p>
                          </div>
                          <span className="font-black text-slate-800 text-sm shrink-0">{hc.litros_romana?.toLocaleString('es-VE')} L</span>
                        </div>
                        <div className="flex justify-end mt-3 gap-2">
                          <button onClick={() => handleEditRecepcion(hc)} className="text-blue-500 bg-blue-50 p-2 rounded-lg active:scale-95"><Edit2 size={15}/></button>
                          <button onClick={() => handleDeleteSingle(hc.id, hc.ticket_romana)} className="text-red-500 bg-red-50 p-2 rounded-lg active:scale-95"><Trash2 size={15}/></button>
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
                        <th className="px-6 py-3 w-10 text-center"><input type="checkbox" checked={selectedHistorialIds.size === filteredCamiones.length && filteredCamiones.length > 0} onChange={toggleAll} /></th>
                        <th className="px-6 py-3 text-left text-[10px] font-black uppercase text-slate-500">Acciones</th>
                        <th className="px-6 py-3 text-left text-[10px] font-black uppercase text-slate-500">Fecha & Camión</th>
                        <th className="px-6 py-3 text-left text-[10px] font-black uppercase text-slate-500">Prov.</th>
                        <th className="px-6 py-3 text-left text-[10px] font-black uppercase text-slate-500 text-right">Litros Totales</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {filteredCamiones.map(hc => (
                         <tr key={hc.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-center"><input type="checkbox" checked={selectedHistorialIds.has(hc.id)} onChange={() => toggleSelection(hc.id)} /></td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm flex gap-2">
                               <button onClick={() => handleEditRecepcion(hc)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16} /></button>
                               <button onClick={() => handleDeleteSingle(hc.id, hc.ticket_romana)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16} /></button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-xs">
                               <div className="font-extrabold text-blue-800">{formatearFecha(hc.fecha_ingreso)}</div>
                               <div className="font-bold text-slate-700">{hc.ticket_romana} ({hc.placa})</div>
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500 truncate max-w-[150px]">
                              {hc.recepciones_detalle?.map((d:any) => d.ganaderos?.codigo_ganadero).join(', ')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-slate-800 text-right">{hc.litros_romana?.toLocaleString('es-VE')} L</td>
                         </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
         </div>
      )}

      {tab === 'nuevo' && (
         <div className="space-y-6 animate-in fade-in">
            {camion.id && (
               <div className="bg-orange-50 border-l-4 border-orange-500 p-3 rounded-r-xl shadow-sm">
                  <p className="text-orange-800 font-bold text-xs flex items-center gap-2">
                    <AlertCircle size={14} /> Editando registro: {camion.ticket_romana}
                  </p>
               </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-800">A. Datos del Camión</h2>
                {selectedFabrica && (
                  <span className="bg-blue-100 text-blue-800 text-xs font-black px-3 py-1 rounded-full">
                    {selectedFabrica.codigo} · {selectedFabrica.nombre}
                  </span>
                )}
              </div>
              <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Ticket Romana</label>
                  <input type="text" placeholder="Ej.: 21000" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-bold" value={camion.ticket_romana} onChange={e => setCamion({...camion, ticket_romana: e.target.value})}/>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Placa</label>
                  <input type="text" placeholder="Ej.: A45CKP" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-bold" value={camion.placa} onChange={e => setCamion({...camion, placa: e.target.value})}/>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Fecha</label>
                  <input type="date" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-bold" value={camion.fecha} onChange={e => setCamion({...camion, fecha: e.target.value})}/>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Cód. Ruta</label>
                  <input type="text" placeholder="Ej.: 300" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm font-bold" value={camion.codigo_ruta} onChange={e => handleCamionRutaChange(e.target.value)}/>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5">Nombre Ruta</label>
                  <input type="text" readOnly className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-bold text-slate-400" value={camion.nombre_ruta} />
                </div>
                
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="block text-[10px] font-black text-blue-600 uppercase mb-1.5">Litros Romana (Bruto)</label>
                  <input type="number" className="w-full bg-blue-50 border border-blue-200 rounded-lg p-3 text-xl font-black text-blue-900" value={camion.litros_romana || ''} onChange={e => setCamion({...camion, litros_romana: Number(e.target.value)})}/>
                </div>
                <div className="sm:col-span-2 lg:col-span-3 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 pt-4 lg:pt-6">
                   <div className="w-full sm:flex-1">
                     <span className="block text-[10px] font-bold text-slate-400 uppercase mb-0.5">Suma Ganaderos</span>
                     <span className="text-xl font-black text-slate-800">{totalLitrosGanaderos.toLocaleString()} L</span>
                   </div>
                   <div className="w-full sm:flex-1">
                     <span className={`block text-[10px] font-bold uppercase mb-0.5 ${diferenciaLitros === 0 ? 'text-green-600' : 'text-orange-500'}`}>Diferencia</span>
                     <span className={`text-xl font-black ${diferenciaLitros === 0 ? 'text-green-600' : 'text-orange-500'}`}>{diferenciaLitros.toLocaleString()} L</span>
                   </div>
                   <div className="w-full sm:flex-1 bg-green-50 p-2.5 rounded-xl border border-green-200 flex flex-col">
                     <span className="text-[10px] font-black text-green-700 uppercase tracking-tighter">Neto a Pagar</span>
                     <span className="text-2xl font-black text-green-700 leading-none mt-1">{Math.round(totalLitrosPagar).toLocaleString()} L</span>
                   </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-base font-bold text-slate-800">B. Ganaderos & Calidad</h2>
                <button onClick={addGanadero} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors flex items-center gap-1.5">
                  <Plus size={14}/> Agregar
                </button>
              </div>
              
              <div className="divide-y divide-slate-100">
                {detalles.length === 0 ? (
                    <div className="p-10 text-center text-slate-300 font-bold italic text-sm">No hay ganaderos cargados.</div>
                ) : (
                    detalles.map((det, index) => (
                      <div key={det.id_temp} className="p-4 sm:p-6 relative group border-l-4 border-transparent hover:border-blue-500 transition-all">
                        <button onClick={() => removeGanadero(det.id_temp)} className="absolute top-4 right-4 text-red-400 hover:bg-red-50 p-1 rounded-md transition-colors"><Trash2 size={18} /></button>
                        
                        <div className="flex items-center gap-2 mb-4">
                           <div className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold">{index + 1}</div>
                           <h3 className="font-bold text-slate-800 text-sm truncate pr-8">{det.nombre || 'Nuevo Ganadero'}</h3>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
                           <div className="col-span-1">
                             <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Cód.</label>
                             <input type="text" className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm font-bold" value={det.codigo_ganadero} onChange={e => updateDetalle(det.id_temp, 'codigo_ganadero', e.target.value)}/>
                           </div>
                           <div className="col-span-1 sm:col-span-3 lg:col-span-2">
                             <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Tipo / Ubicación</label>
                             <div className="text-[11px] font-bold text-slate-600 truncate bg-slate-50 p-2 rounded-lg border border-slate-200">
                               {det.tipo_proveedor || '-'} | {det.ubicacion || '-'}
                             </div>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 sm:gap-4 bg-slate-50/50 p-3 sm:p-4 rounded-xl border border-slate-100">
                           <div className="col-span-2 xl:col-span-2">
                              <label className="block text-[10px] font-black text-blue-700 uppercase mb-1">Litros</label>
                              <input type="number" className="w-full bg-white border border-blue-200 rounded-lg p-2 text-lg font-black text-black" value={det.litros_recepcion || ''} onChange={e => updateDetalle(det.id_temp, 'litros_recepcion', Number(e.target.value))}/>
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Grasa</label>
                              <input type="number" step="0.01" className="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold" value={det.grasa || ''} onChange={e => updateDetalle(det.id_temp, 'grasa', Number(e.target.value))}/>
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Prot.</label>
                              <input type="number" step="0.01" className="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold" value={det.proteina || ''} onChange={e => updateDetalle(det.id_temp, 'proteina', Number(e.target.value))}/>
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Acidez</label>
                              <input type="number" step="0.1" className="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold" value={det.acidez || ''} onChange={e => updateDetalle(det.id_temp, 'acidez', Number(e.target.value))}/>
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Temp.</label>
                              <input type="number" step="0.1" className="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold" value={det.temperatura || ''} onChange={e => updateDetalle(det.id_temp, 'temperatura', Number(e.target.value))}/>
                           </div>
                           <div className="col-span-2 bg-purple-50 p-2 rounded-lg border border-purple-100">
                              <label className="block text-[10px] font-black text-purple-700 uppercase mb-1 tracking-tighter">Crioscopía (°H)</label>
                              <input type="text" className="w-full border border-purple-200 rounded-lg p-2 text-sm font-black mb-2" value={det.crioscopia} onChange={e => updateDetalle(det.id_temp, 'crioscopia', e.target.value)}/>
                              <div className="flex gap-2 text-[9px] font-bold">
                                 <span className="text-red-600 bg-white px-1.5 py-0.5 rounded border border-red-100">Agua: {det.porcentaje_agua_desc}%</span>
                                 <span className="text-red-700 bg-white px-1.5 py-0.5 rounded border border-red-100">Dcto: {Math.round(det.litros_descuento)} L</span>
                              </div>
                           </div>
                        </div>

                        <div className="mt-3 flex justify-end">
                           <div className="bg-green-600 text-white px-4 py-1.5 rounded-lg flex items-center gap-3">
                              <span className="text-[10px] font-bold uppercase">A Pagar:</span>
                              <span className="text-base font-black">{Math.round(det.litros_a_pagar).toLocaleString()} L</span>
                           </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {detalles.length > 0 && (
               <div className="pt-4">
                 <button onClick={handleSave} disabled={isSaving} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-3 active:scale-95 transition-all">
                   {isSaving ? <Loader2 className="animate-spin" /> : <Save size={24} />}
                   {isSaving ? 'Guardando...' : 'Finalizar Recepción'}
                 </button>
               </div>
            )}
         </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 text-center max-w-sm w-full animate-in zoom-in-95">
             <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
             <h3 className="font-black text-lg text-slate-800 mb-2">Eliminar Registros</h3>
             <p className="text-slate-500 text-sm mb-6">¿Estás seguro de borrar {selectedHistorialIds.size} elementos? Esta acción es irreversible.</p>
             <div className="grid grid-cols-2 gap-3">
               <button onClick={()=>setIsDeleteModalOpen(false)} className="bg-slate-100 text-slate-600 font-bold py-2.5 rounded-xl">Cerrar</button>
               <button onClick={handleDeleteManyConf} className="bg-red-600 text-white font-bold py-2.5 rounded-xl">Eliminar</button>
             </div>
          </div>
        </div>
      )}

      {isBitacoraOpen && <ModalVitacora isOpen={isBitacoraOpen} onClose={() => setIsBitacoraOpen(false)} module="Recepción" />}
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
       <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <div className="flex justify-between items-center p-4 sm:p-6 bg-slate-50 border-b border-slate-200 shrink-0">
             <h3 className="font-black text-slate-800 text-base sm:text-lg flex items-center gap-2">
                <History className="text-blue-600" size={20}/> Vitácora {module}
             </h3>
             <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors p-1"><X size={24}/></button>
          </div>
          <div className="p-4 flex-1 overflow-hidden flex flex-col">
             <div className="relative mb-4 shrink-0">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                <input type="text" placeholder="Filtrar..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 font-bold text-sm" />
             </div>
             <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {loading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500"/></div> : (
                   filtered.map(log => (
                      <div key={log.id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col gap-2">
                         <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase">{new Date(log.created_at).toLocaleString()}</span>
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-blue-100 text-blue-700 uppercase">{log.accion}</span>
                         </div>
                         <p className="text-xs font-bold text-slate-800 leading-tight">{log.detalles}</p>
                         <span className="text-[9px] font-medium text-slate-500 truncate italic">{log.usuario_email}</span>
                      </div>
                   ))
                )}
             </div>
          </div>
       </div>
    </div>
  )
}
