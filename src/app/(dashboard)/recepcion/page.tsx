'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Trash2, Save, Search, Loader2, List, FileSpreadsheet, CheckCircle2, AlertCircle, Edit2, X, History, RefreshCcw, Upload, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { logAction } from '@/lib/log-utils'
import { useFabrica } from '@/contexts/FabricaContext'

export default function RecepcionPage() {
  const supabase = createClient()
  const router = useRouter()
  const { selectedFabricaId, selectedFabrica, isAllFabricas } = useFabrica()
  
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
  const [semanaDropdownOpen, setSemanaDropdownOpen] = useState(false)
  const semanaDropdownRef = useRef<HTMLDivElement>(null)
  const [historialPage, setHistorialPage] = useState(0)
  const [historialPageSize, setHistorialPageSize] = useState(10)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importRows, setImportRows] = useState<any[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; errores: string[]; exitosos: any[]; fallidos: Array<{fila: number; datos: any; motivo: string}> } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const [camion, setCamion] = useState<{
    id?: string,
    ticket_romana: string,
    placa: string,
    codigo_ruta: string,
    ruta_id: string,
    nombre_ruta: string,
    litros_romana: number,
    agua_transporte: number,
    fecha: string
  }>({
    ticket_romana: '',
    placa: '',
    codigo_ruta: '',
    ruta_id: '',
    nombre_ruta: '',
    litros_romana: 0,
    agua_transporte: 0,
    fecha: new Date().toISOString().split('T')[0]
  })

  const [detalles, setDetalles] = useState<any[]>([])

  // Cuando estamos en "Todas las fábricas", el usuario debe escoger a cuál fábrica
  // se asignará la carga antes de guardar.
  const [fabricaParaCarga, setFabricaParaCarga] = useState<string>('')
  const { fabricas } = useFabrica()

  // ID efectivo para guardar: si es "all" usa fabricaParaCarga, si no usa selectedFabricaId
  const fabricaIdParaGuardar = isAllFabricas ? fabricaParaCarga : selectedFabricaId

  useEffect(() => {
    async function loadData() {
      const { data: userData } = await supabase.auth.getUser()
      const userObj = userData?.user
      const { data: profile } = await supabase.from('perfiles_usuarios').select('rol').eq('id', userObj?.id).single()
      setIsAdmin(profile?.rol === 'admin')
      setCurUser(userObj)

      // En modo "Todas", cargamos todos los catálogos; se filtrarán al elegir fábrica
      const rutasQuery = supabase.from('rutas').select('*').eq('activo', true)
      const ganaderoQuery = supabase.from('ganaderos').select('*, rutas!ruta_id(nombre_ruta)').eq('activo', true)

      if (selectedFabricaId && selectedFabricaId !== 'all') {
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

  // Cuando cambia la fábrica seleccionada para carga (modo Todas), recargar catálogos filtrados
  useEffect(() => {
    if (!isAllFabricas || !fabricaParaCarga) return
    async function reloadCatalogos() {
      const [resRutas, resGanaderos] = await Promise.all([
        supabase.from('rutas').select('*').eq('activo', true).eq('fabrica_id', fabricaParaCarga),
        supabase.from('ganaderos').select('*, rutas!ruta_id(nombre_ruta)').eq('activo', true).eq('fabrica_id', fabricaParaCarga)
      ])
      if (resRutas.data) setRutas(resRutas.data)
      if (resGanaderos.data) setGanaderos(resGanaderos.data)
      // Limpiar selección de ruta/ganaderos al cambiar fábrica
      setCamion(c => ({ ...c, codigo_ruta: '', ruta_id: '', nombre_ruta: '' }))
      setDetalles([])
    }
    reloadCatalogos()
  }, [fabricaParaCarga, isAllFabricas])

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

     if (selectedFabricaId && selectedFabricaId !== 'all') q.eq('fabrica_id', selectedFabricaId)

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
       agua_transporte: 0,
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
       agua_transporte: hc.agua_transporte || 0,
       fecha: new Date(hc.fecha_ingreso).toISOString().split('T')[0]
     })
     
     const mappedDetalles = (hc.recepciones_detalle || []).map((d: any) => {
        const crioNum = parseFloat(d.crioscopia)
        const lts = Number(d.litros_recepcion) || 0
        let pctAgua = d.porcentaje_agua_desc || 0
        let litrosDesc = d.litros_descuento || 0
        let litrosPagar = d.litros_a_pagar ?? lts
        if (!isNaN(crioNum) && crioscopia.length > 0) {
          const nearest = crioscopia.reduce((prev: any, curr: any) =>
            Math.abs(curr.punto_crioscopico - crioNum) < Math.abs(prev.punto_crioscopico - crioNum) ? curr : prev
          , crioscopia[0])
          pctAgua = nearest.porcentaje_agua || 0
          litrosDesc = (lts * pctAgua) / 100
          litrosPagar = lts - litrosDesc
        }
        return {
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
          porcentaje_agua_desc: pctAgua,
          litros_descuento: litrosDesc,
          litros_a_pagar: litrosPagar,
        }
     })
     
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
    if (isAllFabricas && !fabricaParaCarga) return alert('Debes seleccionar a qué fábrica se asignará esta carga.')
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
         agua_transporte: camion.agua_transporte || 0,
         fecha_ingreso: camion.fecha + 'T12:00:00Z',
         ...(fabricaIdParaGuardar ? { fabrica_id: fabricaIdParaGuardar } : {})
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
         agua_transporte: camion.agua_transporte || 0,
         fecha_ingreso: camion.fecha + 'T12:00:00Z',
         ...(fabricaIdParaGuardar ? { fabrica_id: fabricaIdParaGuardar } : {})
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

  const handleExport = () => {
    const rows: any[] = []
    for (const hc of historialCamiones) {
      for (const d of (hc.recepciones_detalle || [])) {
        rows.push({
          'Fecha ingreso': hc.fecha_ingreso ? hc.fecha_ingreso.slice(0, 10) : '',
          'Codigo Ganadero': d.ganaderos?.codigo_ganadero || '',
          'Litros Recepcion': d.litros_recepcion ?? 0,
          'Grasa': d.grasa ?? 0,
          'Proteina': d.proteina ?? 0,
          'Acidez': d.acidez ?? 0,
          'Temperatura': d.temperatura ?? 0,
          'Crioscopia': d.crioscopia ?? 0,
          'Reductasa': d.h_reductasa ?? 0,
          'UFC': d.ufc ?? 0,
          'Ticket Romana': hc.ticket_romana || '',
          'Placa': hc.placa || '',
        })
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Recepciones')
    XLSX.writeFile(wb, `recepciones_${selectedFabrica?.codigo || 'fab'}.xlsx`)
    logAction(supabase, curUser, 'Recepción', 'EXPORTAR', `Exportados ${rows.length} registros.`)
  }

  const handleDescargarPlantilla = () => {
    const ejemplo = [{
      'Fecha ingreso': '15-01-2024',
      'Codigo Ganadero': 'G001',
      'Litros Recepcion': 100,
      'Grasa': 3.5,
      'Proteina': 3.2,
      'Acidez': 16,
      'Temperatura': 4,
      'Crioscopia': -0.530,
      'Reductasa': 3,
      'UFC': 50000,
      'Ticket Romana': 'T001',
      'Placa': 'ABC123',
    }]
    const ws = XLSX.utils.json_to_sheet(ejemplo)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, 'plantilla_recepciones.xlsx')
  }

  const handleArchivoImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: 0, raw: false }) as any[]
      setImportRows(rows)
      setImportResult(null)
      setIsImportModalOpen(true)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleConfirmarImport = async () => {
    if (!fabricaIdParaGuardar) return
    setImportLoading(true)
    const errores: string[] = []
    const exitosos: any[] = []
    const fallidos: Array<{fila: number; datos: any; motivo: string}> = []
    let ok = 0

    const parseDate = (val: string) => {
      const s = String(val).trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
        const [d, m, y] = s.split('/')
        return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
      }
      if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
        const [d, m, y] = s.split('-')
        return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
      }
      return s
    }

    // Cargar ganaderos y crioscopia ANTES de agrupar para conocer la ruta de cada ganadero
    const { data: ganaderosBD } = await supabase.from('ganaderos').select('id, codigo_ganadero, ruta_id').eq('fabrica_id', fabricaIdParaGuardar)
    const ganaderosMap = new Map((ganaderosBD || []).map((g: any) => [String(g.codigo_ganadero).trim(), g]))

    const { data: criosBD } = await supabase.from('tabla_crioscopia').select('punto_crioscopico, porcentaje_agua').order('punto_crioscopico', { ascending: false })
    const criosTable = criosBD || []
    const nearestCrio = (val: number) => {
      if (criosTable.length === 0) return { punto_crioscopico: val, porcentaje_agua: 0 }
      return criosTable.reduce((prev: any, curr: any) =>
        Math.abs(curr.punto_crioscopico - val) < Math.abs(prev.punto_crioscopico - val) ? curr : prev
      , criosTable[0])
    }

    // Agrupar por ticket+fecha+ruta (placa es opcional, no forma parte del key)
    const grupos = new Map<string, { fecha: string; ticket: string; placa: string; ruta_id: string | null; detalles: any[] }>()
    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i]
      const fila = i + 2
      const fecha = parseDate(String(row['Fecha ingreso'] || ''))
      const ticket = String(row['Ticket Romana'] || '').trim()
      const placa = String(row['Placa'] || '').trim() || '0'
      const codigoGan = String(row['Codigo Ganadero'] || '').trim()
      if (!fecha) { const m = 'Falta Fecha ingreso'; errores.push(`Fila ${fila}: ${m}`); fallidos.push({ fila, datos: row, motivo: m }); continue }
      if (!ticket) { const m = 'Falta Ticket Romana'; errores.push(`Fila ${fila}: ${m}`); fallidos.push({ fila, datos: row, motivo: m }); continue }
      if (!codigoGan) { const m = 'Falta Codigo Ganadero'; errores.push(`Fila ${fila}: ${m}`); fallidos.push({ fila, datos: row, motivo: m }); continue }
      const ganObj = ganaderosMap.get(codigoGan)
      if (!ganObj) { const m = `Ganadero "${codigoGan}" no encontrado`; errores.push(`Fila ${fila}: ${m}`); fallidos.push({ fila, datos: row, motivo: m }); continue }
      const ruta_id = ganObj.ruta_id || null
      const key = `${ticket}|${fecha}|${ruta_id}`
      if (!grupos.has(key)) grupos.set(key, { fecha, ticket, placa, ruta_id, detalles: [] })
      grupos.get(key)!.detalles.push({ ...row, _fila: fila })
    }

    const insertarDetalle = async (camionId: string, d: any, grupo: { fecha: string; ticket: string; placa: string }) => {
      const cod = String(d['Codigo Ganadero'] || '').trim()
      const ganObj = ganaderosMap.get(cod)
      if (!ganObj) { errores.push(`Fila ${d._fila}: Ganadero "${cod}" no encontrado.`); fallidos.push({ fila: d._fila, datos: d, motivo: `Ganadero "${cod}" no encontrado.` }); return false }
      const litrosDet = Number(d['Litros Recepcion']) || 0
      const crioVal = Number(d['Crioscopia']) || 0
      const crioMatch = nearestCrio(crioVal)
      const pctAgua = crioMatch.porcentaje_agua || 0
      const litrosDesc = (litrosDet * pctAgua) / 100
      const litrosPagar = litrosDet - litrosDesc
      const { error: detErr } = await supabase.from('recepciones_detalle').insert({
        recepcion_id: camionId,
        ganadero_id: ganObj.id,
        litros_recepcion: litrosDet,
        grasa: Number(d['Grasa']) || 0,
        proteina: Number(d['Proteina']) || 0,
        acidez: Number(d['Acidez']) || 0,
        temperatura: Number(d['Temperatura']) || 0,
        crioscopia: crioMatch.punto_crioscopico,
        h_reductasa: Number(d['Reductasa']) || 0,
        ufc: Number(d['UFC']) || 0,
        porcentaje_agua_desc: pctAgua,
        litros_descuento: litrosDesc,
        litros_a_pagar: litrosPagar,
      })
      if (detErr) {
        errores.push(`Fila ${d._fila}: ${detErr.message}`)
        fallidos.push({ fila: d._fila, datos: d, motivo: detErr.message })
        return false
      }
      ok++
      exitosos.push({ Fila: d._fila, Fecha: grupo.fecha, 'Cód. Ganadero': cod, 'Litros': litrosDet, 'Ticket': grupo.ticket, Placa: grupo.placa, 'Crioscopía': crioMatch.punto_crioscopico, 'Agua %': pctAgua, 'Dcto L': Math.round(litrosDesc), 'A Pagar L': Math.round(litrosPagar) })
      return true
    }

    const recalcularLitrosRomana = async (camionId: string) => {
      const { data: allDets } = await supabase.from('recepciones_detalle').select('litros_a_pagar').eq('recepcion_id', camionId)
      const total = (allDets || []).reduce((s: number, d: any) => s + (Number(d.litros_a_pagar) || 0), 0)
      await supabase.from('recepciones_camion').update({ litros_romana: total }).eq('id', camionId)
    }

    for (const [, grupo] of grupos) {
      const fechaISO = `${grupo.fecha}T12:00:00`
      const { data: existing } = await supabase.from('recepciones_camion').select('id').eq('ticket_romana', grupo.ticket).eq('fabrica_id', fabricaIdParaGuardar).eq('fecha_ingreso', fechaISO).eq('ruta_id', grupo.ruta_id ?? '').maybeSingle()

      if (existing) {
        // Ticket ya existe — intentar completar ganaderos faltantes
        const camionId = existing.id
        const { data: existingDets } = await supabase.from('recepciones_detalle').select('ganadero_id').eq('recepcion_id', camionId)
        const existingGanIds = new Set((existingDets || []).map((d: any) => d.ganadero_id))
        let addedInGroup = 0
        for (const d of grupo.detalles) {
          const cod = String(d['Codigo Ganadero'] || '').trim()
          const ganObj = ganaderosMap.get(cod)
          if (!ganObj) { errores.push(`Fila ${d._fila}: Ganadero "${cod}" no encontrado.`); fallidos.push({ fila: d._fila, datos: d, motivo: `Ganadero "${cod}" no encontrado.` }); continue }
          if (existingGanIds.has(ganObj.id)) {
            errores.push(`Fila ${d._fila}: Ganadero "${cod}" ya importado en ticket "${grupo.ticket}", omitido.`)
            fallidos.push({ fila: d._fila, datos: d, motivo: `Ganadero "${cod}" ya importado en ticket "${grupo.ticket}"` })
            continue
          }
          const inserted = await insertarDetalle(camionId, d, grupo)
          if (inserted) addedInGroup++
        }
        if (addedInGroup > 0) await recalcularLitrosRomana(camionId)
        continue
      }

      // Ticket nuevo — crear camión e insertar todos los detalles
      const litrosRomana = grupo.detalles.reduce((s: number, d: any) => s + (Number(d['Litros Recepcion']) || 0), 0)
      const { data: camionIns, error: camionErr } = await supabase.from('recepciones_camion').insert({
        ticket_romana: grupo.ticket,
        placa: grupo.placa,
        fecha_ingreso: fechaISO,
        litros_romana: litrosRomana,
        ruta_id: grupo.ruta_id,
        fabrica_id: fabricaIdParaGuardar,
      }).select('id').single()

      if (camionErr || !camionIns) { errores.push(`Ticket "${grupo.ticket}": Error al crear — ${camionErr?.message}`); continue }

      let addedInGroup = 0
      for (const d of grupo.detalles) {
        const inserted = await insertarDetalle(camionIns.id, d, grupo)
        if (inserted) addedInGroup++
      }
      // Recalcular litros_romana con base en los detalles realmente insertados
      if (addedInGroup > 0) await recalcularLitrosRomana(camionIns.id)
    }

    logAction(supabase, curUser, 'Recepción', 'IMPORTAR_MASIVO', `Importados ${ok} registros. Errores: ${errores.length}`)
    setImportResult({ ok, errores, exitosos, fallidos })
    setImportLoading(false)
    if (ok > 0) loadHistorial()
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

  const getNumeroSemana = (wedStr: string): number => {
    const p = wedStr.split('-')
    const wed = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]))
    // Semana 1 = el miércoles anterior o igual al 1 de enero (puede caer en dic del año anterior)
    const jan1 = new Date(wed.getFullYear(), 0, 1)
    const daysBack = (jan1.getDay() - 3 + 7) % 7
    const firstWed = new Date(jan1)
    firstWed.setDate(jan1.getDate() - daysBack)
    const diff = wed.getTime() - firstWed.getTime()
    const weekNum = Math.round(diff / (7 * 24 * 60 * 60 * 1000)) + 1
    return weekNum > 0 ? weekNum : 1
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

  const historialTotalPages = Math.ceil(filteredCamiones.length / historialPageSize)
  const pagedCamiones = filteredCamiones.slice(historialPage * historialPageSize, (historialPage + 1) * historialPageSize)

  useEffect(() => { setHistorialPage(0) }, [selectedSemanaHistorial, filtroHistorial])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (semanaDropdownRef.current && !semanaDropdownRef.current.contains(e.target as Node)) {
        setSemanaDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const totalLitrosSemana = filteredCamiones.reduce((acc, hc) => acc + Number(hc.litros_romana || 0), 0)
  const totalLitrosPagarSemana = filteredCamiones.reduce((acc, hc) =>
    acc + (hc.recepciones_detalle?.reduce((s:number, d:any) => s + Number(d.litros_a_pagar || 0), 0) || 0), 0)

  const formatearFecha = (iso: string) => {
    if (!iso) return ''
    // Usar métodos UTC para evitar desfase por zona horaria del navegador
    const d = new Date(iso)
    const day   = String(d.getUTCDate()).padStart(2, '0')
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const year  = d.getUTCFullYear()
    return `${day}-${month}-${year}`
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
         <div className="p-2 bg-slate-50 flex flex-col gap-2 sm:flex-row sm:gap-4 sm:items-center sm:justify-between">
            <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl w-full sm:w-auto">
               <button onClick={()=>setTab('nuevo')} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${tab === 'nuevo' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200'}`}>
                  <Plus size={16}/> {camion.id ? 'Editando' : 'Carga de Camión'}
               </button>
               <button onClick={()=>setTab('historial')} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${tab === 'historial' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200'}`}>
                  <List size={16}/> Historial
               </button>
            </div>
            <div className="flex gap-2 items-center w-full sm:w-auto sm:justify-end px-1">
               {isAdmin && (
                 <button onClick={() => setIsBitacoraOpen(true)} className="flex items-center gap-2 px-3 py-2 font-bold text-slate-500 hover:text-slate-800 text-xs rounded-xl border border-slate-200 bg-white">
                   <History size={15} /> Bitácora
                 </button>
               )}
               {camion.id && tab === 'nuevo' && (
                  <button onClick={cancelEdit} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-sm bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-all">
                    <X size={15} /> Cancelar edición
                  </button>
               )}
            </div>
         </div>
      </div>

      {tab === 'historial' && (
         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col gap-3">
               {/* Selector de semana ganadera */}
               <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase shrink-0">Semana:</span>
                  {semanasDisponibles.length === 0 ? (
                    <span className="text-xs text-slate-400">Sin registros</span>
                  ) : (() => {
                    const idx = semanasDisponibles.indexOf(selectedSemanaHistorial)
                    const hasPrev = idx < semanasDisponibles.length - 1
                    const hasNext = idx > 0
                    return (
                      <div className="flex items-center gap-1">
                        {/* Flecha anterior */}
                        <button
                          disabled={!hasPrev}
                          onClick={() => { setSelectedSemanaHistorial(semanasDisponibles[idx + 1]); setFiltroHistorial(''); setSemanaDropdownOpen(false) }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-200 text-slate-600 font-black hover:bg-blue-100 hover:text-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                        >‹</button>

                        {/* Dropdown custom */}
                        <div className="relative" ref={semanaDropdownRef}>
                          <button
                            type="button"
                            onClick={() => setSemanaDropdownOpen(o => !o)}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-xl transition-colors select-none"
                          >
                            <span className="text-[10px] font-black uppercase">Sem</span>
                            <span className="text-lg font-black leading-none">{getNumeroSemana(selectedSemanaHistorial)}</span>
                            <span className="text-xs font-bold">{formatSemanaLabel(selectedSemanaHistorial)}</span>
                            <svg className={`w-3 h-3 ml-1 transition-transform duration-200 ${semanaDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                          </button>

                          {semanaDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden" style={{ zIndex: 9999, minWidth: '280px' }}>
                              <div className="max-h-72 overflow-y-auto">
                                {semanasDisponibles.map(sem => {
                                  const isSelected = sem === selectedSemanaHistorial
                                  return (
                                    <button
                                      key={sem}
                                      type="button"
                                      onMouseDown={e => {
                                        e.preventDefault()
                                        setSelectedSemanaHistorial(sem)
                                        setFiltroHistorial('')
                                        setSemanaDropdownOpen(false)
                                      }}
                                      className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors border-b border-gray-100 last:border-0 ${
                                        isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-gray-50'
                                      }`}
                                    >
                                      <div className="min-w-0">
                                        <div className={`text-xs font-bold leading-tight ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                                          Semana {getNumeroSemana(sem)}
                                        </div>
                                        <div className="text-[10px] text-gray-700 mt-0.5">{formatSemanaLabel(sem)}</div>
                                      </div>
                                      {isSelected && <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Flecha siguiente */}
                        <button
                          disabled={!hasNext}
                          onClick={() => { setSelectedSemanaHistorial(semanasDisponibles[idx - 1]); setFiltroHistorial(''); setSemanaDropdownOpen(false) }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-200 text-slate-600 font-black hover:bg-blue-100 hover:text-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                        >›</button>

                        <span className="text-[10px] text-slate-400 font-bold ml-1">{semanasDisponibles.length} semanas</span>
                      </div>
                    )
                  })()}
               </div>
               {/* Barra de búsqueda + totales */}
               <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <div className="relative flex-1 w-full">
                     <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                     <input type="text" placeholder="Filtrar dentro de la semana..." value={filtroHistorial} onChange={e => setFiltroHistorial(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-blue-500"/>
                  </div>
                  {selectedHistorialIds.size > 0 && isAdmin && (
                    <button onClick={() => setIsDeleteModalOpen(true)} className="w-full sm:w-auto bg-red-50 text-red-700 font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 border border-red-100">
                      <Trash2 size={16} /> Borrar ({selectedHistorialIds.size})
                    </button>
                  )}
                  {/* Plantilla / Exportar / Importar — grid en mobile, flex en desktop */}
                  <div className="grid grid-cols-3 sm:flex gap-2 w-full sm:w-auto">
                    <button onClick={handleDescargarPlantilla} className="flex items-center justify-center gap-1.5 px-3 py-2.5 font-bold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl bg-white shadow-sm text-xs">
                      <FileSpreadsheet size={15} /> Plantilla
                    </button>
                    <button onClick={handleExport} className="flex items-center justify-center gap-1.5 px-3 py-2.5 font-bold text-emerald-700 hover:text-emerald-900 border border-emerald-200 rounded-xl bg-emerald-50 shadow-sm text-xs">
                      <Download size={15} /> Exportar
                    </button>
                    {isAdmin ? (
                      <>
                        <button onClick={() => importRef.current?.click()} disabled={!fabricaIdParaGuardar} className="flex items-center justify-center gap-1.5 px-3 py-2.5 font-bold text-blue-700 hover:text-blue-900 border border-blue-200 rounded-xl bg-blue-50 shadow-sm text-xs disabled:opacity-40">
                          <Upload size={15} /> Importar
                        </button>
                        <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleArchivoImport} />
                      </>
                    ) : (
                      <div />
                    )}
                  </div>
                  {selectedSemanaHistorial && (
                    <div className="flex gap-3 shrink-0">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-center">
                        <div className="text-[10px] font-black text-blue-500 uppercase">Litros Romana</div>
                        <div className="text-base font-black text-blue-800">{totalLitrosSemana.toLocaleString('es-VE')} L</div>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-center">
                        <div className="text-[10px] font-black text-emerald-600 uppercase">Total a Pagar</div>
                        <div className="text-base font-black text-emerald-800">{Math.round(totalLitrosPagarSemana).toLocaleString('es-VE')} L</div>
                      </div>
                    </div>
                  )}
               </div>
            </div>
            
            {isLoading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500 w-10 h-10" /></div> : (
              <>
                {/* Vista Mobile - Tarjetas */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {pagedCamiones.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 font-bold text-sm">Sin registros</div>
                  ) : pagedCamiones.map(hc => (
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
                        <th className="px-6 py-3 text-left text-[10px] font-black uppercase text-slate-500">Ruta</th>
                        <th className="px-6 py-3 text-left text-[10px] font-black uppercase text-slate-500">Prov.</th>
                        <th className="px-6 py-3 text-right text-[10px] font-black uppercase text-slate-500">Litros Totales</th>
                        <th className="px-6 py-3 text-right text-[10px] font-black uppercase text-emerald-600">Litros a Pagar</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {pagedCamiones.map(hc => (
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
                            <td className="px-6 py-4 whitespace-nowrap text-xs">
                              {hc.rutas ? (
                                <div>
                                  <span className="font-black text-indigo-700">{hc.rutas.codigo_ruta}</span>
                                  <div className="text-slate-500 font-semibold">{hc.rutas.nombre_ruta}</div>
                                </div>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500 truncate max-w-[150px]">
                              {hc.recepciones_detalle?.map((d:any) => d.ganaderos?.codigo_ganadero).join(', ')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-slate-800 text-right">{hc.litros_romana?.toLocaleString('es-VE')} L</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-emerald-700 text-right">
                              {hc.recepciones_detalle?.reduce((s: number, d: any) => s + (Number(d.litros_a_pagar) || 0), 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })} L
                            </td>
                         </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Pagination */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <span>Mostrar:</span>
                {[10,20,30,50].map(n => (
                  <button key={n} onClick={() => { setHistorialPageSize(n); setHistorialPage(0) }}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${historialPageSize === n ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                    {n}
                  </button>
                ))}
                <span className="ml-2">de {filteredCamiones.length} registros</span>
              </div>
              <div className="flex items-center gap-1">
                <button disabled={historialPage === 0} onClick={() => setHistorialPage(p => Math.max(0, p-1))}
                  className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-40">
                  ‹ Ant
                </button>
                {Array.from({length: historialTotalPages}, (_,i) => i).filter(i => Math.abs(i - historialPage) <= 2).map(i => (
                  <button key={i} onClick={() => setHistorialPage(i)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${historialPage === i ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                    {i + 1}
                  </button>
                ))}
                <button disabled={historialPage >= historialTotalPages - 1} onClick={() => setHistorialPage(p => Math.min(historialTotalPages-1, p+1))}
                  className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-40">
                  Sig ›
                </button>
              </div>
            </div>
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
                {isAllFabricas
                  ? <span className="bg-amber-100 text-amber-800 text-xs font-black px-3 py-1 rounded-full">Todas las fábricas</span>
                  : selectedFabrica && (
                    <span className="bg-blue-100 text-blue-800 text-xs font-black px-3 py-1 rounded-full">
                      {selectedFabrica.codigo} · {selectedFabrica.nombre}
                    </span>
                  )
                }
              </div>

              {/* ── Selector de fábrica (solo cuando estamos en "Todas") ── */}
              {isAllFabricas && (
                <div className="px-4 sm:px-6 pt-4 pb-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-1">
                      <AlertCircle size={12} /> Asignar carga a la fábrica:
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {fabricas.map(f => (
                        <label key={f.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all ${fabricaParaCarga === f.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                          <input
                            type="radio"
                            name="fabrica_carga"
                            value={f.id}
                            checked={fabricaParaCarga === f.id}
                            onChange={() => setFabricaParaCarga(f.id)}
                            className="accent-blue-600"
                          />
                          <span className={`text-xs font-black ${fabricaParaCarga === f.id ? 'text-blue-700' : 'text-slate-600'}`}>
                            {f.codigo} · {f.nombre}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

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
                
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="block text-[10px] font-black text-blue-600 uppercase mb-1.5">Litros Romana (Bruto)</label>
                  <input type="number" className="w-full bg-blue-50 border border-blue-200 rounded-lg p-3 text-xl font-black text-blue-900" value={camion.litros_romana || ''} onChange={e => setCamion({...camion, litros_romana: Number(e.target.value)})}/>
                </div>
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="block text-[10px] font-black text-orange-500 uppercase mb-1.5">Agua a Transporte (L)</label>
                  <input type="number" min="0" step="0.01" className="w-full bg-orange-50 border border-orange-200 rounded-lg p-3 text-xl font-black text-orange-800" value={camion.agua_transporte || ''} placeholder="0" onChange={e => setCamion({...camion, agua_transporte: Number(e.target.value)})}/>
                  <p className="text-[9px] text-orange-400 mt-1 font-semibold">Solo estadísticas y deducción cód. 92</p>
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

      {isImportModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-auto overflow-hidden animate-in zoom-in-95">
            <div className="flex justify-between items-center bg-slate-50 border-b border-slate-200 p-4">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2"><Upload size={16} className="text-blue-600" /> Importar Recepciones desde Excel</h3>
              <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
            </div>
            <div className="p-4 sm:p-6">
              {importResult ? (
                <div className="space-y-4">
                  {/* Contadores */}
                  <div className="flex gap-4">
                    <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                      <CheckCircle2 className="text-emerald-500 mx-auto mb-2" size={32} />
                      <p className="text-2xl font-black text-emerald-700">{importResult.ok}</p>
                      <p className="text-xs font-bold text-emerald-600">Detalles importados</p>
                    </div>
                    {importResult.fallidos.length > 0 && (
                      <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                        <AlertCircle className="text-red-500 mx-auto mb-2" size={32} />
                        <p className="text-2xl font-black text-red-700">{importResult.fallidos.length}</p>
                        <p className="text-xs font-bold text-red-600">No importados</p>
                      </div>
                    )}
                  </div>

                  {/* Tabla de registros exitosos */}
                  {importResult.exitosos.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-emerald-700 uppercase mb-1">Registros importados correctamente</p>
                      <div className="overflow-x-auto max-h-48 border border-emerald-200 rounded-xl">
                        <table className="w-full text-[11px]">
                          <thead className="bg-emerald-50 sticky top-0">
                            <tr>
                              {Object.keys(importResult.exitosos[0]).map(col => (
                                <th key={col} className="px-3 py-2 text-left font-black text-emerald-700 whitespace-nowrap">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-50">
                            {importResult.exitosos.map((row, i) => (
                              <tr key={i} className="hover:bg-emerald-50">
                                {Object.keys(importResult.exitosos[0]).map(col => (
                                  <td key={col} className="px-3 py-2 text-slate-700 whitespace-nowrap">{String(row[col] ?? '')}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Tabla de registros fallidos */}
                  {importResult.fallidos.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-red-700 uppercase mb-1">Registros no importados</p>
                      <div className="overflow-x-auto max-h-48 border border-red-200 rounded-xl">
                        <table className="w-full text-[11px]">
                          <thead className="bg-red-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-black text-red-700 whitespace-nowrap">#</th>
                              <th className="px-3 py-2 text-left font-black text-red-700 whitespace-nowrap">Fecha ingreso</th>
                              <th className="px-3 py-2 text-left font-black text-red-700 whitespace-nowrap">Cod. Ganadero</th>
                              <th className="px-3 py-2 text-left font-black text-red-700 whitespace-nowrap">Ticket</th>
                              <th className="px-3 py-2 text-left font-black text-red-700 whitespace-nowrap">Motivo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-50">
                            {importResult.fallidos.map((f, i) => (
                              <tr key={i} className="hover:bg-red-50">
                                <td className="px-3 py-2 font-bold text-red-400">{f.fila}</td>
                                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{String(f.datos['Fecha ingreso'] ?? '')}</td>
                                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{String(f.datos['Codigo Ganadero'] ?? '')}</td>
                                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{String(f.datos['Ticket Romana'] ?? '')}</td>
                                <td className="px-3 py-2 text-red-700 font-semibold whitespace-nowrap">{f.motivo}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">Cerrar</button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1">
                    <p className="font-black">Formato esperado de columnas:</p>
                    <p className="font-semibold">Fecha ingreso · Codigo Ganadero · Litros Recepcion · Grasa · Proteina · Acidez · Temperatura · Crioscopia · Reductasa · UFC · Ticket Romana · Placa</p>
                    <p className="text-blue-600 mt-1">Fecha acepta DD-MM-YYYY o YYYY-MM-DD (se convierte automáticamente). Los campos numéricos vacíos se toman como 0. Descarga la plantilla para ver el formato exacto.</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-semibold">
                    Se encontraron <span className="font-black">{importRows.length} filas</span> en el archivo. Los tickets que ya existen en la misma fecha serán omitidos.
                  </div>
                  {importRows.length > 0 && (
                    <div className="overflow-x-auto max-h-56 border border-slate-200 rounded-xl">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-black text-slate-500 whitespace-nowrap">#</th>
                            {Object.keys(importRows[0]).map(col => (
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
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }} className="flex-1 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl">Cancelar</button>
                    <button onClick={handleConfirmarImport} disabled={importLoading} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                      {importLoading ? <><Loader2 size={16} className="animate-spin" /> Importando...</> : <><Upload size={16} /> Confirmar Importación</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
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

const BITACORA_PAGE_SIZE = 20

function ModalVitacora({ isOpen, onClose, module }: { isOpen: boolean, onClose: () => void, module: string }) {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [bitacoraPage, setBitacoraPage] = useState(0)

  useEffect(() => {
    if (isOpen) fetchLogs()
  }, [isOpen])

  const fetchLogs = async () => {
    setLoading(true)
    const { data } = await supabase.from('bitacora').select('*').eq('modulo', module).order('created_at', { ascending: false }).limit(500)
    if (data) setLogs(data)
    setLoading(false)
  }

  const filtered = logs.filter(l =>
    l.usuario_email?.toLowerCase().includes(search.toLowerCase()) ||
    l.accion?.toLowerCase().includes(search.toLowerCase()) ||
    l.detalles?.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / BITACORA_PAGE_SIZE))
  const page = Math.min(bitacoraPage, totalPages - 1)
  const paginated = filtered.slice(page * BITACORA_PAGE_SIZE, (page + 1) * BITACORA_PAGE_SIZE)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
       <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <div className="flex justify-between items-center p-4 sm:p-6 bg-slate-50 border-b border-slate-200 shrink-0">
             <h3 className="font-black text-slate-800 text-base sm:text-lg flex items-center gap-2">
                <History className="text-blue-600" size={20}/> Bitácora {module}
             </h3>
             <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors p-1"><X size={24}/></button>
          </div>
          <div className="p-4 flex-1 overflow-hidden flex flex-col">
             <div className="relative mb-4 shrink-0">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                <input type="text" placeholder="Filtrar..." value={search} onChange={e=>{ setSearch(e.target.value); setBitacoraPage(0) }} className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 font-bold text-sm" />
             </div>
             {!loading && filtered.length > 0 && (
               <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-100 shrink-0">
                 <span className="text-xs font-bold text-slate-500">{filtered.length} registros · pág. {page + 1}/{totalPages}</span>
                 <div className="flex gap-2">
                   <button onClick={() => setBitacoraPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition-colors">← Anterior</button>
                   <button onClick={() => setBitacoraPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition-colors">Siguiente →</button>
                 </div>
               </div>
             )}
             <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {loading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500"/></div> : (
                   paginated.map(log => (
                      <div key={log.id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col gap-2">
                         <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase">{new Date(log.created_at).toLocaleString()}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${log.accion === 'BORRAR' || log.accion?.includes('BORRAR') ? 'bg-red-100 text-red-700' : log.accion === 'CREAR' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{log.accion}</span>
                         </div>
                         <p className="text-xs font-bold text-slate-800 leading-tight">{log.detalles}</p>
                         <span className="text-[9px] font-medium text-slate-500 truncate italic">{log.usuario_email}</span>
                      </div>
                   ))
                )}
             </div>
             {!loading && filtered.length > 0 && (
               <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100 shrink-0">
                 <span className="text-xs font-bold text-slate-500">{filtered.length} registros · pág. {page + 1}/{totalPages}</span>
                 <div className="flex gap-2">
                   <button onClick={() => setBitacoraPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition-colors">← Anterior</button>
                   <button onClick={() => setBitacoraPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-600 disabled:opacity-40 hover:bg-slate-200 transition-colors">Siguiente →</button>
                 </div>
               </div>
             )}
          </div>
       </div>
    </div>
  )
}
