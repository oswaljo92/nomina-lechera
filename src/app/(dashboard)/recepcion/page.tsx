'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Search, Loader2, List, FileSpreadsheet, CheckCircle2, AlertCircle, Edit2, X, History, RefreshCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { logAction } from '@/lib/log-utils'

export default function RecepcionPage() {
  const supabase = createClient()
  const router = useRouter()
  
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

      const [resRutas, resGanaderos, resCrios] = await Promise.all([
        supabase.from('rutas').select('*').eq('activo', true),
        supabase.from('ganaderos').select('*, rutas(nombre_ruta)').eq('activo', true),
        supabase.from('tabla_crioscopia').select('*').order('punto_crioscopico', { ascending: false })
      ])
      
      if (resRutas.data) setRutas(resRutas.data)
      if (resGanaderos.data) setGanaderos(resGanaderos.data)
      if (resCrios.data) setCrioscopia(resCrios.data)
        
      setIsLoading(false)
    }
    loadData()
  }, [])

  useEffect(() => {
    if (tab === 'historial') {
      loadHistorial()
    }
  }, [tab])

  const loadHistorial = async () => {
     setIsLoading(true)
     const { data, error } = await supabase.from('recepciones_camion').select(`
       *, 
       rutas (codigo_ruta, nombre_ruta),
       recepciones_detalle (
          id, litros_recepcion, grasa, proteina, acidez, temperatura, h_reductasa, ufc, crioscopia, porcentaje_agua_desc, litros_descuento, litros_a_pagar, ganadero_id,
          ganaderos (codigo_ganadero, nombre, ubicacion, tipo_proveedor)
       )
     `).order('fecha_ingreso', { ascending: false })
     
     if (data) setHistorialCamiones(data)
     setIsLoading(false)
  }

  // Auto-completar ruta del camión
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

  // Cálculos totales
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
       // UPDATE
       const { error: recError } = await supabase.from('recepciones_camion').update({
         ticket_romana: camion.ticket_romana,
         placa: camion.placa,
         ruta_id: camion.ruta_id,
         litros_romana: camion.litros_romana,
         fecha_ingreso: new Date(camion.fecha).toISOString()
       }).eq('id', camion.id)

       if (recError) {
         alert('Error actualizando camión: ' + recError.message)
         setIsSaving(false)
         return
       }
       
       // Borrar detalles viejos
       await supabase.from('recepciones_detalle').delete().eq('recepcion_id', camion.id)
       logAction(supabase, curUser, 'Recepción', 'EDITAR', `Actualizada recepción camión: ${camion.ticket_romana} (${camion.placa}) de fecha ${camion.fecha}`)
    } else {
       // INSERT
       const { data: recData, error: recError } = await supabase.from('recepciones_camion').insert({
         ticket_romana: camion.ticket_romana,
         placa: camion.placa,
         ruta_id: camion.ruta_id,
         litros_romana: camion.litros_romana,
         fecha_ingreso: new Date(camion.fecha).toISOString()
       }).select().single()

       if (recError) {
         alert('Error guardando camión: ' + recError.message)
          setIsSaving(false)
          return
       }
       recepcionId = recData.id
       logAction(supabase, curUser, 'Recepción', 'CREAR', `Nueva recepción camión: ${camion.ticket_romana} (${camion.placa}) de fecha ${camion.fecha}`)
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
       cancelEdit() // Clear state
       setTab('historial')
    }
  }

  // --- HISTORIAL ACTIONS ---
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
    logAction(supabase, curUser, 'Recepción', 'BORRADO_MASIVO', `Eliminadas ${selectedHistorialIds.size} recepciones del historial.`)
    setSelectedHistorialIds(new Set())
    setIsDeleteModalOpen(false)
    loadHistorial()
  }

  const handleDeleteSingle = async (id: string, refText: string) => {
    if (!confirm(`¿Estás seguro de eliminar el registro del camión ${refText}? \nEsta acción borrará también todos los detalles de leche asociados y NO se puede deshacer.`)) return
    await supabase.from('recepciones_camion').delete().eq('id', id)
    logAction(supabase, curUser, 'Recepción', 'BORRAR', `Eliminada recepción camión: ${refText} del historial.`)
    loadHistorial()
  }

  const filteredCamiones = historialCamiones.filter(hc => {
     const t = filtroHistorial.toLowerCase()
     
     // Buscar en nombres_codigo ganaderos si lo tipean
     const codesStrings = hc.recepciones_detalle?.map((d:any) => d.ganaderos?.codigo_ganadero?.toLowerCase()).join(' ') || ''
     const nameStrings = hc.recepciones_detalle?.map((d:any) => d.ganaderos?.nombre?.toLowerCase()).join(' ') || ''

     return hc.ticket_romana?.toLowerCase().includes(t) || 
            hc.ruta_id?.toLowerCase().includes(t) ||
            hc.rutas?.nombre_ruta?.toLowerCase().includes(t) ||
            hc.fecha_ingreso?.includes(t) ||
            codesStrings.includes(t) ||
            nameStrings.includes(t)
  })

  // Format Helper
  const formatearFecha = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getFullYear()}`
  }

  if (isLoading && tab === 'nuevo') return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>

  return (
    <div className="space-y-6 fade-in pb-20 relative">

      {/* TOAST DE ÉXITO */}
      {showSuccess && (
         <div className="fixed top-20 right-10 z-50 animate-in slide-in-from-top-10 fade-in duration-500">
            <div className="bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4">
               <CheckCircle2 size={32} className="text-emerald-100" />
               <div>
                 <h4 className="font-extrabold text-lg">¡Operación Exitosa!</h4>
                 <p className="text-emerald-100 font-medium text-sm">Los litros se han registrado y calculado correctamente.</p>
               </div>
            </div>
         </div>
      )}
      
      {/* Título y Selector de Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
         <div className="flex flex-col md:flex-row justify-between items-center p-6 border-b border-slate-200 gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Gestión de Recepción</h1>
              <p className="text-slate-500 mt-1">Registro de la recepcion diaria o revisa el historial.</p>
            </div>
            {tab === 'nuevo' && detalles.length > 0 && (
               <button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 disabled:opacity-50">
                 {isSaving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                 {isSaving ? (camion.id ? 'Actualizando...' : 'Guardando...') : (camion.id ? 'Guardar Cambios' : 'Guardar Recepción')}
               </button>
            )}
         </div>
         <div className="p-2 bg-slate-50 rounded-b-2xl flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-2 p-2 bg-slate-200/50 rounded-xl overflow-x-auto grow md:grow-0">
               <button onClick={()=>setTab('nuevo')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === 'nuevo' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'}`}>
                 <Plus size={16}/> {camion.id ? 'Editando Recepción' : 'Carga de Camión'}
               </button>
               <button onClick={()=>setTab('historial')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === 'historial' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'}`}>
                 <List size={16}/> Historial de Recepciones
               </button>
            </div>
            <div className="flex gap-4 items-center">
               {isAdmin && (
                 <button onClick={() => setIsBitacoraOpen(true)} className="flex items-center gap-2 px-4 py-2 font-bold text-slate-500 hover:text-slate-800 transition-all border border-transparent hover:border-slate-200 rounded-xl">
                   <History size={18} /> Vitácora
                 </button>
               )}
               {camion.id && tab === 'nuevo' && (
                  <button onClick={cancelEdit} className="text-sm font-bold text-red-500 hover:text-red-700 flex items-center gap-1 pr-4">
                    <X size={16} /> Cancelar Edición
                  </button>
               )}
            </div>
         </div>
      </div>

      {tab === 'historial' && (
         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between gap-4">
               <div className="relative flex-1 max-w-lg">
                  <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
                  <input type="text" placeholder="Filtrar por Fecha, Código, Ruta o Ticket..." value={filtroHistorial} onChange={e => setFiltroHistorial(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-white text-black font-semibold focus:ring-2 focus:ring-blue-500 placeholder-slate-400 shadow-sm"/>
               </div>

               <div className="flex gap-2">
                  {selectedHistorialIds.size > 0 && (
                    <button onClick={()=>setIsDeleteModalOpen(true)} className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-4 py-3 rounded-xl flex items-center gap-2 shadow-sm transition-colors border border-red-200">
                      <Trash2 size={18} /> Borrar Seleccionados ({selectedHistorialIds.size})
                    </button>
                  )}
               </div>
            </div>
            
            {isLoading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500 w-10 h-10" /></div> : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 w-10 text-center text-slate-500">
                          <input type="checkbox" checked={selectedHistorialIds.size === filteredCamiones.length && filteredCamiones.length > 0} onChange={toggleAll} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha & Camión</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Códigos Prov.</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Detalle Ganaderos</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Litros Tot.</th >
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {filteredCamiones.map(hc => {
                       const codigos = hc.recepciones_detalle?.map((d:any) => d.ganaderos?.codigo_ganadero).filter(Boolean).join(', ') || 'N/A'
                       const nombres = hc.recepciones_detalle?.map((d:any) => d.ganaderos?.nombre).filter(Boolean).join(', ') || 'N/A'

                       return (
                         <tr key={hc.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                                <input type="checkbox" checked={selectedHistorialIds.has(hc.id)} onChange={() => toggleSelection(hc.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm flex gap-2">
                               <button onClick={() => handleEditRecepcion(hc)} className="text-blue-500 hover:text-white hover:bg-blue-600 bg-blue-50 p-2 rounded transition-colors" title="Editar Recepción"><Edit2 size={16} /></button>
                               <button onClick={() => handleDeleteSingle(hc.id, hc.ticket_romana)} className="text-red-500 hover:text-white hover:bg-red-600 bg-red-50 p-2 rounded transition-colors" title="Eliminar Permanente"><Trash2 size={16} /></button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                               <div className="font-extrabold text-blue-800">{formatearFecha(hc.fecha_ingreso)}</div>
                               <div className="font-bold text-slate-700 mt-0.5">{hc.ticket_romana} <span className="text-slate-400">({hc.placa})</span></div>
                               <div className="text-xs text-slate-500">{hc.rutas?.nombre_ruta || '-'}</div>
                            </td>
                            <td className="px-6 py-4 text-sm font-extrabold text-blue-600 max-w-[150px] truncate" title={codigos}>{codigos}</td>
                            <td className="px-6 py-4 text-sm max-w-[250px] truncate font-semibold text-slate-700" title={nombres}>{nombres}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-green-700">{hc.litros_romana?.toLocaleString('es-VE')} L</td>
                         </tr>
                       )
                    })}
                    {filteredCamiones.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-500">No hay recepciones acorde al filtro.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
         </div>
      )}

      {tab === 'nuevo' && (
         <div className="space-y-6 animate-in fade-in relative">

            {camion.id && (
               <div className="bg-orange-100 border-l-4 border-orange-500 p-4 rounded-r-xl shadow-sm -mt-2 mb-4">
                  <div className="flex">
                    <AlertCircle className="text-orange-600 h-5 w-5 mr-3" />
                    <p className="text-orange-800 font-bold text-sm">Estás editando un registro histórico (Ticket: {camion.ticket_romana}). Al guardar, se reemplazará la información existente.</p>
                  </div>
               </div>
            )}

            {/* A. DATOS DEL CAMIÓN */}
            <div className={`bg-white rounded-2xl shadow-sm border ${camion.id ? 'border-orange-300' : 'border-slate-200'} overflow-hidden`}>
              <div className={`px-6 py-4 border-b flex justify-between ${camion.id ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
                <h2 className={`text-lg font-bold ${camion.id ? 'text-orange-800' : 'text-slate-800'}`}>A. Datos del Camión</h2>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Ticket Romana</label>
                  <input type="text" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-black font-semibold focus:ring-2 focus:ring-blue-500 placeholder-slate-400" value={camion.ticket_romana} onChange={e => setCamion({...camion, ticket_romana: e.target.value})}/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Placa de Camión</label>
                  <input type="text" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-black font-semibold focus:ring-2 focus:ring-blue-500 placeholder-slate-400" value={camion.placa} onChange={e => setCamion({...camion, placa: e.target.value})}/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Fecha Ingreso</label>
                  <input type="date" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-black font-semibold focus:ring-2 focus:ring-blue-500" value={camion.fecha} onChange={e => setCamion({...camion, fecha: e.target.value})}/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Cód. Ruta</label>
                  <input type="text" placeholder="Ej: 300" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-black font-semibold focus:ring-2 focus:ring-blue-500 placeholder-slate-400" value={camion.codigo_ruta} onChange={e => handleCamionRutaChange(e.target.value)}/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre Ruta</label>
                  <input type="text" readOnly className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-slate-500 font-bold" value={camion.nombre_ruta} />
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Litros Romana (Total Bruto)</label>
                  <input type="number" className="w-full bg-blue-50 border border-blue-300 rounded-lg p-3 font-extrabold text-blue-900 text-lg focus:ring-2 focus:ring-blue-500" value={camion.litros_romana || ''} onChange={e => setCamion({...camion, litros_romana: Number(e.target.value)})}/>
                </div>
                <div className="md:col-span-3 flex items-center gap-6 pt-6 animate-in slide-in-from-right-4">
                   <div className="flex-1">
                     <span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Sumatoria Ganaderos</span>
                     <span className="text-2xl font-extrabold text-slate-800">{totalLitrosGanaderos.toLocaleString('es-ES')} L</span>
                   </div>
                   <div className="flex-1">
                     <span className={`block text-xs font-semibold uppercase mb-1 ${diferenciaLitros === 0 ? 'text-green-600' : 'text-orange-500'}`}>Diferencia Litros</span>
                     <span className={`text-2xl font-extrabold ${diferenciaLitros === 0 ? 'text-green-600' : 'text-orange-500'}`}>{diferenciaLitros.toLocaleString('es-ES')} L</span>
                   </div>
                   <div className="flex-1 bg-green-50 p-3 rounded-lg border border-green-300 shadow-inner">
                     <span className="block text-[10px] font-bold text-green-700 uppercase mb-1 tracking-widest">Litros Netos a Pagar</span>
                     <span className="text-3xl font-black text-green-700 tracking-tight">{Math.round(totalLitrosPagar).toLocaleString('es-ES')} <span className="text-lg">L</span></span>
                     <span className="block text-green-600/70 text-xs font-bold mt-1">Exacto: {totalLitrosPagar.toFixed(2)} L</span>
                   </div>
                </div>
              </div>
            </div>

            {/* B & C. DATOS DEL GANADERO Y ANÁLISIS DE CALIDAD */}
            <div className={`bg-white rounded-2xl shadow-sm border ${camion.id ? 'border-orange-300' : 'border-slate-200'} overflow-hidden`}>
              <div className={`px-6 py-4 border-b flex justify-between items-center ${camion.id ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
                <h2 className={`text-lg font-bold ${camion.id ? 'text-orange-800' : 'text-slate-800'}`}>B. Datos del Ganadero y Análisis de Calidad</h2>
                <button onClick={addGanadero} className="flex items-center gap-1 text-sm font-bold bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors shadow-sm cursor-pointer">
                  <Plus size={16}/> Agregar Ganadero
                </button>
              </div>
              
              <div className="p-0">
                {detalles.length === 0 ? (
                   <div className="p-10 text-center text-slate-400 font-medium">No se han agregado ganaderos al camión. Utiliza el botón azul superior.</div>
                ) : (
                   <div className="divide-y divide-slate-100">
                     {detalles.map((det, index) => (
                       <div key={det.id_temp} className="p-6 transition-colors relative group hover:bg-slate-50/50">
                          <button onClick={() => removeGanadero(det.id_temp)} className="absolute top-4 right-4 text-red-400 hover:text-white hover:bg-red-500 p-2 rounded-lg transition-colors bg-red-50">
                            <Trash2 size={20} />
                          </button>
                          
                          <div className="flex items-center gap-2 mb-4">
                             <div className={`w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-bold ${camion.id ? 'bg-orange-500' : 'bg-blue-600'}`}>{index + 1}</div>
                             <h3 className="font-bold text-slate-700">Ganadero {det.codigo_ganadero && `- ${det.nombre}`}</h3>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
                             <div className="col-span-1">
                               <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Código Prov.</label>
                               <input type="text" placeholder="Ej: G-001" className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 placeholder-slate-400 shadow-sm" value={det.codigo_ganadero} onChange={e => updateDetalle(det.id_temp, 'codigo_ganadero', e.target.value)}/>
                             </div>
                             <div className="col-span-2">
                               <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Nombre (Auto)</label>
                               <input type="text" readOnly className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 font-bold text-slate-600" value={det.nombre || ''}/>
                             </div>
                             <div className="col-span-1">
                               <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Tipo (Auto)</label>
                               <input type="text" readOnly className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 font-black text-blue-600" value={det.tipo_proveedor || ''}/>
                             </div>
                             <div className="col-span-2">
                               <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Ubicación (Auto)</label>
                               <input type="text" readOnly className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 font-medium text-slate-500" value={det.ubicacion || ''}/>
                             </div>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4 shadow-inner">
                             <div className="xl:col-span-2">
                                <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1.5">Litros Recepción</label>
                                <input type="number" className="w-full bg-white border border-blue-300 rounded-lg p-2.5 text-black font-extrabold focus:ring-2 focus:ring-blue-500 shadow-sm" value={det.litros_recepcion || ''} onChange={e => updateDetalle(det.id_temp, 'litros_recepcion', Number(e.target.value))}/>
                             </div>
                             
                             <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Grasa (P/V)</label>
                                <input type="number" step="0.01" className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 shadow-sm" value={det.grasa || ''} onChange={e => updateDetalle(det.id_temp, 'grasa', Number(e.target.value))}/>
                             </div>
                             <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Proteína (P/V)</label>
                                <input type="number" step="0.01" className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 shadow-sm" value={det.proteina || ''} onChange={e => updateDetalle(det.id_temp, 'proteina', Number(e.target.value))}/>
                             </div>
                             <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Acidez</label>
                                <input type="number" step="0.1" className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 shadow-sm" value={det.acidez || ''} onChange={e => updateDetalle(det.id_temp, 'acidez', Number(e.target.value))}/>
                             </div>
                             <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Temp. °C</label>
                                <input type="number" step="0.1" className="w-full bg-white text-black font-semibold border border-slate-300 rounded-lg p-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 shadow-sm" value={det.temperatura || ''} onChange={e => updateDetalle(det.id_temp, 'temperatura', Number(e.target.value))}/>
                             </div>

                             <div className="xl:col-span-2 bg-purple-50 p-2.5 rounded-lg border border-purple-200">
                                <label className="block text-[10px] font-bold text-purple-700 uppercase tracking-widest mb-1.5">Crioscopía (°H) <FileSpreadsheet size={10} className="inline"/></label>
                                <input type="text" placeholder="-0.534" className="w-full bg-white border border-purple-300 text-black rounded-lg p-2.5 font-extrabold focus:ring-2 focus:ring-purple-500 mb-2 shadow-sm" value={det.crioscopia} onChange={e => updateDetalle(det.id_temp, 'crioscopia', e.target.value)}/>
                                <div className="flex gap-2 text-xs">
                                   <div className="flex-1 bg-white border border-slate-300 p-1.5 rounded-lg text-center shadow-sm">
                                     <span className="block text-[8px] font-bold text-slate-400 uppercase">Dcto Agua</span>
                                     <span className="font-extrabold text-red-500">{det.porcentaje_agua_desc}%</span>
                                   </div>
                                   <div className="flex-1 bg-white border border-slate-300 p-1.5 rounded-lg text-center shadow-sm">
                                     <span className="block text-[8px] font-bold text-slate-400 uppercase">Dcto Lts</span>
                                     <span className="font-extrabold text-red-500">{Math.round(det.litros_descuento)} L</span>
                                     <span className="block text-[9px] text-slate-400 -mt-0.5">{Number(det.litros_descuento).toFixed(2)}</span>
                                   </div>
                                </div>
                             </div>
                          </div>
                          
                          {/* NETO INDIVIDUAL */}
                          <div className="mt-4 flex justify-end">
                             <div className="bg-green-100 px-6 py-2 rounded-xl border border-green-200 shadow-sm flex items-center justify-between w-full md:w-auto md:min-w-[300px]">
                               <span className="text-xs font-bold text-green-800 uppercase tracking-wider">A Pagar</span>
                               <div className="text-right">
                                  <span className="text-xl font-black text-green-700">{Math.round(det.litros_a_pagar).toLocaleString('es-ES')} L</span>
                                  <span className="block text-[10px] font-bold text-green-600/60 -mt-1">Exactos: {Number(det.litros_a_pagar).toFixed(2)} L</span>
                               </div>
                             </div>
                          </div>

                       </div>
                     ))}
                   </div>
                )}
              </div>
            </div>

            {/* BOTON GUARDAR ABAJO */}
            {detalles.length > 0 && (
               <div className="flex justify-end pt-4">
                 <button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-extrabold flex items-center gap-2 shadow-xl shadow-emerald-500/40 transition-all hover:scale-105 disabled:opacity-50 text-lg">
                   {isSaving ? <Loader2 className="animate-spin" /> : <Save size={24} />}
                   {isSaving ? (camion.id ? 'Actualizando...' : 'Guardando...') : (camion.id ? 'Guardar Cambios' : 'Guardar Recepción')}
                 </button>
               </div>
            )}
         </div>
      )}

      {/* Modal Confirmación de Borrado */}
      {isDeleteModalOpen && (
        <div onClick={(e) => { if(e.target === e.currentTarget) setIsDeleteModalOpen(false) }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in pb-10">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden zoom-in-95 text-center p-8">
             <AlertCircle size={56} className="text-red-500 mx-auto mb-4" />
             <h3 className="text-xl font-extrabold text-slate-800 mb-2">Eliminar {selectedHistorialIds.size} Recepciones</h3>
             <p className="text-slate-500 font-medium mb-8">Esta acción borrará permanentemente los reportes seleccionados y sus litros asociados. Los analistas ahora pueden ejecutar esta acción.</p>
             <div className="flex gap-3">
               <button onClick={()=>setIsDeleteModalOpen(false)} className="flex-1 bg-slate-200 text-slate-700 font-bold rounded-xl py-3 hover:bg-slate-300 transition-all">Cancelar</button>
               <button onClick={handleDeleteManyConf} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl py-3 shadow-lg shadow-red-500/30 transition-all">Sí, Eliminar</button>
             </div>
          </div>
        </div>
      )}
      {/* Modal Vitácora */}
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
