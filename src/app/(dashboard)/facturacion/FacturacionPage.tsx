'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Plus, Search, FileText, Image as ImageIcon, Trash2, Edit2, Eye,
  Loader2, Download, FileArchive, X, CheckCircle2, History, AlertCircle,
  Zap, Users, Truck, Droplets, TrendingDown, DollarSign, Milk,
  Check, ChevronDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useFabrica } from '@/contexts/FabricaContext'
import { logAction } from '@/lib/log-utils'
import {
  fmtBs, fmtUSD, formatDateDisplay, formatSemanaGanadera,
  buildFacturaFilename, calcularFactura, getCurrentWednesday,
  getWednesdayOfDate,
} from '@/lib/facturacion-utils'
import {
  downloadFacturaPDF, downloadFacturaImage, exportFacturasToZip,
} from '@/lib/export-factura'
import type { Factura, FacturaDeduccion } from '@/types/facturacion'
import FacturaFormModal from './FacturaFormModal'
import FacturaTemplate from './FacturaTemplate'
import BitacoraModal from '@/components/BitacoraModal'

const TIPO_LABELS: Record<string, string> = {
  ganadero: 'Ganadero',
  transportista: 'Transportista',
  ganadero_transportista: 'Ganadero + Flete',
}

const ESTADO_STYLES: Record<string, string> = {
  emitida: 'bg-green-100 text-green-700',
  borrador: 'bg-amber-100 text-amber-700',
  anulada: 'bg-red-100 text-red-600',
}

interface GenPreviewItem {
  key: string          // unique: ganadero_id or ruta_id
  tipo: 'ganadero' | 'transportista' | 'ganadero_transportista'
  codigo: string
  nombre: string
  rif: string | null
  litros: number
  litros_faltantes?: number
  litros_agua?: number
  precio_leche_usd: number
  precio_flete_usd: number
  existingFacturaId: string | null  // null = new
  // raw data for building the factura
  ganadero_id: string | null
  ruta_id: string | null
  tasa: number
  emisor: { razon_social: string; rif: string; direccion_fiscal: string }
  precio_deduccion_usd: number  // for 090/92
}

export default function FacturacionPage() {
  const supabase = createClient()
  const { selectedFabricaId, fabricas, isAllFabricas } = useFabrica()

  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading] = useState(true)
  const [curUser, setCurUser] = useState<any>(null)
  const [fabricasConFiscal, setFabricasConFiscal] = useState<any[]>([])
  const [semanasGanaderas, setSemanasGanaderas] = useState<any[]>([]) // para el selector de semanas

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroSemana, setFiltroSemana] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  // Tab de tipo
  const [tabTipo, setTabTipo] = useState<'todos' | 'ganadero' | 'transportista'>('todos')

  // Auto-generación
  const [isGenModalOpen, setIsGenModalOpen] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [genPreview, setGenPreview] = useState<GenPreviewItem[]>([])
  const [genSelected, setGenSelected] = useState<Set<string>>(new Set())
  const [genRunning, setGenRunning] = useState(false)
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0, errors: 0 })
  const [genDone, setGenDone] = useState(false)

  // Tasa BCV de inicio de semana actual
  const [tasaSemanaActual, setTasaSemanaActual] = useState(0)

  // Paginación
  const [currentPage, setCurrentPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  // Selección masiva
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modales
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editFactura, setEditFactura] = useState<Factura | null>(null)
  const [viewFactura, setViewFactura] = useState<Factura | null>(null)
  const [viewDeducciones, setViewDeducciones] = useState<FacturaDeduccion[]>([])
  const [isBitacoraOpen, setIsBitacoraOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Factura | null>(null)
  const [isDeleteBulkOpen, setIsDeleteBulkOpen] = useState(false)
  const [semDropOpen, setSemDropOpen] = useState(false)

  // Exportación
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ done: 0, total: 0 })
  // Factura actual exportando en bulk (oculta)
  const [bulkExportFactura, setBulkExportFactura] = useState<Factura | null>(null)
  const [bulkExportDeds, setBulkExportDeds] = useState<FacturaDeduccion[]>([])
  const bulkResolveRef = useRef<(() => void) | null>(null)

  // ── Carga ──────────────────────────────────────────────────────────────────
  useEffect(() => { load() }, [selectedFabricaId])

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setCurUser(user)

    const [{ data: fabData }, { data: semGanData }] = await Promise.all([
      supabase.from('fabricas').select('id, codigo, nombre, razon_social, rif, direccion_fiscal'),
      supabase.from('semanas_ganaderas').select('*').order('fecha_inicio', { ascending: false }),
    ])
    setFabricasConFiscal(fabData ?? [])
    setSemanasGanaderas(semGanData ?? [])

    // Tasa BCV de inicio de semana actual
    const wedStr = getCurrentWednesday()
    const { data: tasaData } = await supabase.from('tasas_bcv')
      .select('tasa').eq('fecha', wedStr).maybeSingle()
    if (tasaData) setTasaSemanaActual(tasaData.tasa)

    let q = supabase
      .from('facturas')
      .select('*, fabricas(nombre, codigo), facturas_deducciones(*)')
      .order('fecha_emision', { ascending: false })

    if (!isAllFabricas && selectedFabricaId !== 'all') {
      q = q.eq('fabrica_id', selectedFabricaId)
    }

    const { data } = await q
    const allFacturas = (data ?? []) as Factura[]
    setFacturas(allFacturas)

    // Auto-seleccionar semana vigente si no hay filtro (usa semanas_ganaderas, no facturas)
    if (!filtroSemana && semGanData && semGanData.length > 0) {
      const vigente = semGanData.find((s: any) => s.es_vigente)
      if (vigente) setFiltroSemana(vigente.fecha_inicio)
      else setFiltroSemana(semGanData[0].fecha_inicio)
    }

    setLoading(false)
  }

  // ── Filtrado ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = facturas
    if (filtroSemana) list = list.filter(f => f.semana_fecha === filtroSemana)
    // tabTipo overrides filtroTipo when not 'todos'
    const tipoFilter = tabTipo !== 'todos' ? tabTipo : filtroTipo
    if (tipoFilter) list = list.filter(f =>
      tipoFilter === 'transportista'
        ? (f.tipo === 'transportista' || f.tipo === 'ganadero_transportista')
        : tipoFilter === 'ganadero'
          ? (f.tipo === 'ganadero' || f.tipo === 'ganadero_transportista')
          : f.tipo === tipoFilter
    )
    if (searchTerm) {
      const t = searchTerm.toLowerCase()
      list = list.filter(f =>
        f.tercero_nombre.toLowerCase().includes(t) ||
        f.tercero_codigo.toLowerCase().includes(t) ||
        f.semana_nombre.toLowerCase().includes(t) ||
        (f.numero_factura ?? '').toLowerCase().includes(t)
      )
    }
    return list
  }, [facturas, filtroSemana, filtroTipo, searchTerm, tabTipo])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paged = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  useEffect(() => setCurrentPage(0), [searchTerm, filtroSemana, filtroTipo])

  // ── Semanas disponibles para filtro (base: semanas_ganaderas + facturas históricas) ─
  const semanasDisponibles = useMemo(() => {
    const map = new Map<string, { nombre: string; numSemana: number | null; año: number | null; vigente: boolean }>()
    // Primero las semanas ganaderas registradas
    semanasGanaderas.forEach((sg: any) => {
      map.set(sg.fecha_inicio, {
        nombre: formatSemanaGanadera(sg.fecha_inicio),
        numSemana: sg.numero_semana,
        año: sg.año,
        vigente: sg.es_vigente,
      })
    })
    // Agregar semanas de facturas históricas que no estén en semanas_ganaderas
    facturas.forEach(f => {
      if (!map.has(f.semana_fecha)) {
        map.set(f.semana_fecha, { nombre: f.semana_nombre, numSemana: null, año: null, vigente: false })
      }
    })
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [facturas, semanasGanaderas])

  // ── Selección ──────────────────────────────────────────────────────────────
  const toggleSel = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }
  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map(f => f.id)))
  }

  // ── Abrir ver detalle ──────────────────────────────────────────────────────
  const openView = async (factura: Factura) => {
    const { data: deds } = await supabase
      .from('facturas_deducciones')
      .select('*')
      .eq('factura_id', factura.id)
    setViewDeducciones((deds ?? []) as FacturaDeduccion[])
    setViewFactura(factura)
  }

  // ── Eliminar ───────────────────────────────────────────────────────────────
  const handleDelete = (factura: Factura) => {
    setDeleteTarget(factura)
  }

  const confirmDeleteSingle = async () => {
    if (!deleteTarget) return
    await supabase.from('facturas').delete().eq('id', deleteTarget.id)
    logAction(supabase, curUser, 'Facturación', 'BORRAR', `Eliminada factura: ${deleteTarget.tercero_nombre} — ${deleteTarget.semana_nombre}`)
    setDeleteTarget(null)
    load()
  }

  const handleDeleteSelected = () => {
    setIsDeleteBulkOpen(true)
  }

  const confirmDeleteBulk = async () => {
    await supabase.from('facturas').delete().in('id', Array.from(selectedIds))
    logAction(supabase, curUser, 'Facturación', 'BORRADO_MASIVO', `Eliminadas ${selectedIds.size} facturas`)
    setSelectedIds(new Set())
    setIsDeleteBulkOpen(false)
    load()
  }

  // ── Exportar individual ────────────────────────────────────────────────────
  const handleExportPDF = async (factura: Factura) => {
    const deds = (factura.facturas_deducciones ?? []) as FacturaDeduccion[]
    setViewDeducciones(deds)
    setViewFactura(factura)
    // Dar tiempo al DOM para renderizar
    await new Promise(r => setTimeout(r, 400))
    await downloadFacturaPDF('factura-template', factura)
  }

  const handleExportImage = async (factura: Factura) => {
    const deds = (factura.facturas_deducciones ?? []) as FacturaDeduccion[]
    setViewDeducciones(deds)
    setViewFactura(factura)
    await new Promise(r => setTimeout(r, 400))
    await downloadFacturaImage('factura-template', factura)
  }

  // ── Exportar bulk ──────────────────────────────────────────────────────────
  const handleBulkExport = async (format: 'pdf' | 'png') => {
    const toExport = facturas.filter(f => selectedIds.has(f.id))
    if (toExport.length === 0) return

    setExporting(true)
    setExportProgress({ done: 0, total: toExport.length })

    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    for (let i = 0; i < toExport.length; i++) {
      const f = toExport[i]
      const deds = (f.facturas_deducciones ?? []) as FacturaDeduccion[]

      // Render la factura en el contenedor oculto
      setBulkExportFactura(f)
      setBulkExportDeds(deds)

      // Esperar a que el DOM renderice
      await new Promise<void>(resolve => {
        bulkResolveRef.current = resolve
        setTimeout(resolve, 500)
      })

      try {
        const elementId = 'bulk-factura-template'
        let blob: Blob
        if (format === 'pdf') {
          const { exportFacturaToPDFBlob } = await import('@/lib/export-factura')
          blob = await exportFacturaToPDFBlob(elementId)
          zip.file(`${buildFacturaFilename(f)}.pdf`, blob)
        } else {
          const { exportFacturaToImageBlob } = await import('@/lib/export-factura')
          blob = await exportFacturaToImageBlob(elementId)
          zip.file(`${buildFacturaFilename(f)}.png`, blob)
        }
      } catch (err) {
        console.error('Error exportando', f.id, err)
      }

      setExportProgress({ done: i + 1, total: toExport.length })
    }

    setBulkExportFactura(null)

    const semanaLabel = filtroSemana ? filtroSemana : 'facturas'
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `facturas_${semanaLabel}_${format}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)

    setExporting(false)
  }

  // ── KPIs por semana seleccionada ───────────────────────────────────────────
  const kpis = useMemo(() => {
    const semList = filtroSemana ? facturas.filter(f => f.semana_fecha === filtroSemana) : facturas
    const emitidas = semList.filter(f => f.estado !== 'anulada')
    const ganaderosList = emitidas.filter(f => f.tipo === 'ganadero' || f.tipo === 'ganadero_transportista')
    const totalLitrosPagados = ganaderosList.reduce((s, f) => s + Number(f.litros_a_pagar || 0), 0)
    const totalBs = emitidas.reduce((s, f) => s + Number(f.total_bs), 0)
    const totalUSD = emitidas.reduce((s, f) => s + (f.total_bs / (f.tasa_factura || 1)), 0)
    // Faltantes y agua: leer de deducciones
    const allDeds = emitidas.flatMap(f => f.facturas_deducciones ?? [])
    const litrosFaltantes = allDeds.filter(d => d.codigo === '90').reduce((s, d) => s + Number(d.litros || 0), 0)
    const litrosAgua = allDeds.filter(d => d.codigo === '92').reduce((s, d) => s + Number(d.litros || 0), 0)
    return { totalLitrosPagados, totalBs, totalUSD, litrosFaltantes, litrosAgua }
  }, [facturas, filtroSemana])

  // ── Cargar preview de auto-generación ─────────────────────────────────────
  const buildGenPreview = useCallback(async () => {
    if (!filtroSemana || (!selectedFabricaId || selectedFabricaId === 'all')) return
    setGenLoading(true)
    setGenPreview([])
    setGenDone(false)

    // Semana: miércoles (filtroSemana) a martes +6 días
    const wedDate = new Date(filtroSemana + 'T12:00:00')
    const tueDate = new Date(wedDate); tueDate.setDate(wedDate.getDate() + 6)
    const fechaInicio = filtroSemana
    const fechaFin = `${tueDate.getFullYear()}-${String(tueDate.getMonth()+1).padStart(2,'0')}-${String(tueDate.getDate()).padStart(2,'0')}`

    // Tasa BCV del miércoles
    const { data: tasaRow } = await supabase.from('tasas_bcv').select('tasa').eq('fecha', filtroSemana).maybeSingle()
    const tasa = tasaRow?.tasa || 0

    // Fábrica emisor
    const emisorFab = fabricasConFiscal.find(f => f.id === selectedFabricaId)
    const emisor = { razon_social: emisorFab?.razon_social || '', rif: emisorFab?.rif || '', direccion_fiscal: emisorFab?.direccion_fiscal || '' }

    // Recepciones del período
    const { data: camiones } = await supabase.from('recepciones_camion')
      .select('id, ruta_id, litros_romana, agua_transporte, rutas(id, codigo_ruta, nombre_ruta, cedula, rif, grupo, ganadero_id), recepciones_detalle(ganadero_id, litros_recepcion, litros_a_pagar, ganaderos(id, codigo_ganadero, nombre, cedula, rif, grupo))')
      .eq('fabrica_id', selectedFabricaId)
      .gte('fecha_ingreso', fechaInicio + 'T00:00:00Z')
      .lte('fecha_ingreso', fechaFin + 'T23:59:59Z')

    // Precios semanales
    const { data: preciosData } = await supabase.from('precios_semanales').select('*').eq('fecha_semana', filtroSemana)
    const precios = preciosData || []

    // Precios deducciones
    const { data: precDeducData } = await supabase.from('precios_deducciones').select('*')
      .eq('fecha_semana', filtroSemana).eq('fabrica_id', selectedFabricaId)

    // Facturas ya existentes en esta semana
    const { data: existingFacts } = await supabase.from('facturas').select('id, ganadero_id, ruta_id, tipo')
      .eq('fabrica_id', selectedFabricaId).eq('semana_fecha', filtroSemana).neq('estado', 'anulada')

    const getPrecioLeche = (codigoGanadero: string): number => {
      const p = precios.find(pr => (pr.ganaderos as string[]).includes(codigoGanadero))
      return p?.precio_leche_usd || 0
    }
    const getPrecioFlete = (codigoRuta: string): number => {
      const p = precios.find(pr => (pr.rutas as string[]).includes(codigoRuta))
      return p?.precio_flete_usd || 0
    }

    const items: GenPreviewItem[] = []
    const camionesArr = camiones || []

    // ── Por ganadero ──
    const ganaderoMap: Record<string, { ganadero: any; litros: number }> = {}
    for (const cam of camionesArr) {
      for (const det of (cam.recepciones_detalle as any[] || [])) {
        const g = det.ganaderos
        if (!g) continue
        const key = g.id
        if (!ganaderoMap[key]) ganaderoMap[key] = { ganadero: g, litros: 0 }
        ganaderoMap[key].litros += Number(det.litros_a_pagar || det.litros_recepcion || 0)
      }
    }

    // ── Por ruta (transportista) ──
    const rutaMap: Record<string, { ruta: any; litrosFlete: number; litrosRomana: number; litrosGanaderos: number; litrosAgua: number }> = {}
    for (const cam of camionesArr) {
      const r = (cam as any).rutas
      if (!r) continue
      const key = r.id
      if (!rutaMap[key]) rutaMap[key] = { ruta: r, litrosFlete: 0, litrosRomana: 0, litrosGanaderos: 0, litrosAgua: 0 }
      rutaMap[key].litrosRomana += Number((cam as any).litros_romana || 0)
      rutaMap[key].litrosAgua += Number((cam as any).agua_transporte || 0)
      const sumDet = (cam.recepciones_detalle as any[] || []).reduce((s: number, d: any) => s + Number(d.litros_a_pagar || d.litros_recepcion || 0), 0)
      rutaMap[key].litrosGanaderos += sumDet
      rutaMap[key].litrosFlete += sumDet
    }

    // Check which ganaderos own their ruta
    const ganaderosConRutaPropia = new Set<string>()
    for (const [, rv] of Object.entries(rutaMap)) {
      if (rv.ruta.ganadero_id && ganaderoMap[rv.ruta.ganadero_id]) {
        ganaderosConRutaPropia.add(rv.ruta.ganadero_id)
      }
    }

    // Build GANADERO / GANADERO_TRANSPORTISTA items
    for (const [gid, { ganadero, litros }] of Object.entries(ganaderoMap)) {
      const esTransportista = ganaderosConRutaPropia.has(gid)
      const tipo: GenPreviewItem['tipo'] = esTransportista ? 'ganadero_transportista' : 'ganadero'
      const ruta = esTransportista ? Object.values(rutaMap).find(rv => rv.ruta.ganadero_id === gid) : null
      const existFact = (existingFacts || []).find(ef => ef.ganadero_id === gid && (ef.tipo === tipo || ef.tipo === 'ganadero_transportista'))
      const precioLeche = getPrecioLeche(ganadero.codigo_ganadero)
      const precioFlete = ruta ? getPrecioFlete(ruta.ruta.codigo_ruta) : 0
      const litrosFaltantes = ruta ? Math.max(0, ruta.litrosRomana - ruta.litrosGanaderos) : 0
      const litrosAgua = ruta ? ruta.litrosAgua : 0
      const precDeducRuta = ruta ? (precDeducData || []).find(pd => pd.ruta_id === ruta.ruta.id) : null

      items.push({
        key: gid,
        tipo,
        codigo: ganadero.codigo_ganadero,
        nombre: ganadero.nombre,
        rif: ganadero.rif || ganadero.cedula || null,
        litros,
        litros_faltantes: litrosFaltantes,
        litros_agua: litrosAgua,
        precio_leche_usd: precioLeche,
        precio_flete_usd: precioFlete,
        existingFacturaId: existFact?.id || null,
        ganadero_id: gid,
        ruta_id: ruta?.ruta.id || null,
        tasa,
        emisor,
        precio_deduccion_usd: precDeducRuta?.precio_deduccion_usd || 0,
      })
    }

    // Build TRANSPORTISTA items (rutas sin ganadero propio)
    for (const [rid, rv] of Object.entries(rutaMap)) {
      if (rv.ruta.ganadero_id && ganaderoMap[rv.ruta.ganadero_id]) continue // ya incluido como ganadero_transportista
      const existFact = (existingFacts || []).find(ef => ef.ruta_id === rid && ef.tipo === 'transportista')
      const precioFlete = getPrecioFlete(rv.ruta.codigo_ruta)
      const litrosFaltantes = Math.max(0, rv.litrosRomana - rv.litrosGanaderos)
      const precDeducRuta = (precDeducData || []).find(pd => pd.ruta_id === rid)

      items.push({
        key: rid,
        tipo: 'transportista',
        codigo: rv.ruta.codigo_ruta,
        nombre: rv.ruta.nombre_ruta,
        rif: rv.ruta.rif || rv.ruta.cedula || null,
        litros: rv.litrosFlete,
        litros_faltantes: litrosFaltantes,
        litros_agua: rv.litrosAgua,
        precio_leche_usd: 0,
        precio_flete_usd: precioFlete,
        existingFacturaId: existFact?.id || null,
        ganadero_id: null,
        ruta_id: rid,
        tasa,
        emisor,
        precio_deduccion_usd: precDeducRuta?.precio_deduccion_usd || 0,
      })
    }

    setGenPreview(items)
    // Pre-select: all NEW by default, existing unchecked
    setGenSelected(new Set(items.filter(i => !i.existingFacturaId).map(i => i.key)))
    setGenLoading(false)
  }, [filtroSemana, selectedFabricaId, fabricasConFiscal])

  // ── Ejecutar auto-generación ───────────────────────────────────────────────
  const runAutoGen = async () => {
    const toGen = genPreview.filter(i => genSelected.has(i.key))
    if (toGen.length === 0) return
    setGenRunning(true)
    setGenProgress({ done: 0, total: toGen.length, errors: 0 })
    let errors = 0

    for (let i = 0; i < toGen.length; i++) {
      const item = toGen[i]
      try {
        const incluyeFlete = item.tipo === 'transportista' || item.tipo === 'ganadero_transportista'
        const semNombre = formatSemanaGanadera(filtroSemana)

        // Deducciones 090 y 92 solo para transportistas/ganadero_transportista
        const deducciones: FacturaDeduccion[] = []
        if (incluyeFlete && item.precio_deduccion_usd > 0) {
          if ((item.litros_faltantes || 0) > 0) {
            const montoBs = (item.litros_faltantes || 0) * item.precio_deduccion_usd * item.tasa
            deducciones.push({ codigo: '90', nombre: 'Deducción por faltante', monto_bs: montoBs, litros: item.litros_faltantes, precio_usd: item.precio_deduccion_usd })
          }
          if ((item.litros_agua || 0) > 0) {
            const montoBs = (item.litros_agua || 0) * item.precio_deduccion_usd * item.tasa
            deducciones.push({ codigo: '92', nombre: 'Deducción por Desviación', monto_bs: montoBs, litros: item.litros_agua, precio_usd: item.precio_deduccion_usd })
          }
        }

        const calc = calcularFactura({
          litros_a_pagar: item.tipo === 'transportista' ? 0 : item.litros,
          litros_flete: incluyeFlete ? item.litros : 0,
          precio_leche_usd: item.precio_leche_usd,
          precio_flete_usd: item.precio_flete_usd,
          tasa_miercoles: item.tasa,
          tasa_factura: item.tasa,
          deducciones,
          incluye_flete: incluyeFlete,
        })

        const facturaPayload = {
          fabrica_id: selectedFabricaId,
          semana_fecha: filtroSemana,
          semana_nombre: semNombre,
          tipo: item.tipo,
          ganadero_id: item.ganadero_id,
          ruta_id: item.ruta_id,
          tercero_codigo: item.codigo,
          tercero_nombre: item.nombre,
          tercero_rif: item.rif,
          fecha_emision: filtroSemana,
          numero_factura: null,
          tasa_miercoles: item.tasa,
          tasa_factura: item.tasa,
          precio_leche_usd: item.precio_leche_usd,
          precio_flete_usd: incluyeFlete ? item.precio_flete_usd : null,
          litros_a_pagar: item.tipo === 'transportista' ? 0 : item.litros,
          litros_flete: incluyeFlete ? item.litros : null,
          ...calc,
          emisor_razon_social: item.emisor.razon_social,
          emisor_rif: item.emisor.rif,
          emisor_direccion: item.emisor.direccion_fiscal,
          estado: 'emitida',
          notas: null,
          updated_at: new Date().toISOString(),
        }

        let facturaId: string | null = null
        if (item.existingFacturaId && genSelected.has(item.key)) {
          // Reemplazar: update factura + borrar deducciones viejas
          const { error } = await supabase.from('facturas').update(facturaPayload).eq('id', item.existingFacturaId)
          if (!error) {
            facturaId = item.existingFacturaId
            await supabase.from('facturas_deducciones').delete().eq('factura_id', facturaId)
          } else errors++
        } else {
          const { data: fData, error } = await supabase.from('facturas').insert(facturaPayload).select('id').single()
          if (!error && fData) facturaId = fData.id
          else errors++
        }

        if (facturaId && deducciones.length > 0) {
          await supabase.from('facturas_deducciones').insert(
            deducciones.map(d => ({ factura_id: facturaId, codigo: d.codigo, nombre: d.nombre, monto_bs: d.monto_bs, litros: d.litros || 0, precio_usd: d.precio_usd || 0 }))
          )
        }
      } catch { errors++ }

      setGenProgress({ done: i + 1, total: toGen.length, errors })
    }

    logAction(supabase, curUser, 'Facturación', 'AUTO_GENERAR', `Generadas ${toGen.length - errors} facturas semana ${filtroSemana}. Errores: ${errors}`)
    setGenRunning(false)
    setGenDone(true)
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6 fade-in pb-24">
      {/* ── Título ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Facturación</h1>
          <p className="text-slate-500 mt-1">Recibos digitales por semana ganadera.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setIsBitacoraOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl transition-colors shadow-sm text-sm">
            <History size={15} /> Bitácora
          </button>
          <button
            onClick={() => { buildGenPreview(); setIsGenModalOpen(true) }}
            disabled={!filtroSemana || isAllFabricas}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors shadow-sm text-sm"
            title={isAllFabricas ? 'Selecciona una fábrica para generar facturas' : ''}
          >
            <Zap size={16} /> Generar Facturas
          </button>
          <button onClick={() => { setEditFactura(null); setIsFormOpen(true) }}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-sm">
            <Plus size={16} /> Nuevo Recibo
          </button>
        </div>
      </div>

      {/* ── KPI cards por semana ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Litros Pagados', value: kpis.totalLitrosPagados.toLocaleString('es-VE', { maximumFractionDigits: 0 }) + ' L', icon: Milk, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total USD', value: fmtUSD(kpis.totalUSD), icon: DollarSign, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Total Bs', value: fmtBs(kpis.totalBs), icon: DollarSign, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Litros Faltantes', value: kpis.litrosFaltantes.toLocaleString('es-VE', { maximumFractionDigits: 0 }) + ' L', icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Litros Agua', value: kpis.litrosAgua.toLocaleString('es-VE', { maximumFractionDigits: 0 }) + ' L', icon: Droplets, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Tasa BCV Semana', value: tasaSemanaActual > 0 ? `Bs ${tasaSemanaActual.toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : '—', icon: TrendingDown, color: 'text-indigo-700', bg: 'bg-indigo-50' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className={`${k.bg} rounded-2xl border border-white/60 shadow-sm p-3`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={12} className={k.color} />
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider leading-tight">{k.label}</p>
              </div>
              <p className={`text-sm font-black ${k.color} leading-tight`}>{k.value}</p>
            </div>
          )
        })}
      </div>

      {/* ── Filtros + Tabs ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Semana — dropdown con número de semana */}
        {(() => {
          const selEntry = semanasDisponibles.find(([f]) => f === filtroSemana)
          const selLabel = selEntry
            ? (selEntry[1].numSemana ? `Sem. ${selEntry[1].numSemana} — ${selEntry[1].nombre}` : selEntry[1].nombre)
            : 'Todas las semanas'
          return (
            <div className="relative">
              <button onClick={() => setSemDropOpen(o => !o)}
                className="flex items-center justify-between gap-2 bg-white border border-slate-300 hover:border-blue-400 text-gray-900 rounded-lg px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[230px]">
                <div className="flex items-center gap-2 min-w-0">
                  <Check size={13} className="text-blue-500 shrink-0" />
                  <span className="text-xs font-bold truncate">{selLabel}</span>
                </div>
                <ChevronDown className={`text-gray-500 shrink-0 transition-transform duration-200 ${semDropOpen ? 'rotate-180' : ''}`} size={14} />
              </button>
              {semDropOpen && (
                <>
                  <div className="absolute z-50 top-full mt-1.5 left-0 bg-white border border-slate-200 rounded-lg shadow-2xl max-h-64 overflow-y-auto min-w-[260px]">
                    <button onMouseDown={e => { e.preventDefault(); setFiltroSemana(''); setSemDropOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 border-b border-gray-100 transition-colors ${!filtroSemana ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                      <span className="text-xs font-bold">Todas las semanas</span>
                      {!filtroSemana && <Check size={14} className="text-blue-500" />}
                    </button>
                    {semanasDisponibles.map(([fecha, info]) => {
                      const isSelected = filtroSemana === fecha
                      return (
                        <button key={fecha} onMouseDown={e => { e.preventDefault(); setFiltroSemana(fecha); setSemDropOpen(false) }}
                          className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors border-b border-gray-100 last:border-0 ${isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-gray-50'}`}>
                          <div className="min-w-0">
                            {info.numSemana && (
                              <div className={`text-[10px] font-black uppercase tracking-wide ${isSelected ? 'text-blue-600' : 'text-blue-500'}`}>
                                Semana {info.numSemana} · {info.año}{info.vigente ? ' ★ Vigente' : ''}
                              </div>
                            )}
                            <div className={`text-xs font-bold leading-tight ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>{info.nombre}</div>
                          </div>
                          {isSelected && <Check size={14} className="text-blue-500 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                  <div className="fixed inset-0 z-40" onClick={() => setSemDropOpen(false)} />
                </>
              )}
            </div>
          )
        })()}
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar proveedor, código..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
      </div>

      {/* Tabs tipo */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {([
          { id: 'todos', label: 'Todos', icon: FileText },
          { id: 'ganadero', label: 'Ganaderos', icon: Users },
          { id: 'transportista', label: 'Transportes', icon: Truck },
        ] as const).map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTabTipo(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${tabTipo === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon size={13} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Barra de acciones masivas ───────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
          <span className="text-sm font-bold text-blue-700">{selectedIds.size} seleccionadas</span>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleBulkExport('pdf')}
              disabled={exporting}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              <FileArchive size={14} /> ZIP PDF
            </button>
            <button
              onClick={() => handleBulkExport('png')}
              disabled={exporting}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              <FileArchive size={14} /> ZIP Imagen
            </button>
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
          {exporting && (
            <span className="text-xs text-blue-600 flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              Exportando {exportProgress.done}/{exportProgress.total}...
            </span>
          )}
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto p-1 text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Tabla ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No hay recibos registrados</p>
            <p className="text-sm mt-1">Crea el primero con el botón &ldquo;Nuevo Recibo Digital&rdquo;</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filtered.length && filtered.length > 0}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha emisión</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Semana</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Proveedor</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Litros</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Total Bs</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Total USD</th>
                    <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                    <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-40">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paged.map(f => (
                    <tr key={f.id} className={`hover:bg-slate-50/50 transition-colors ${selectedIds.has(f.id) ? 'bg-blue-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSel(f.id)} className="rounded" />
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatDateDisplay(f.fecha_emision)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{f.semana_nombre}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 leading-tight">{f.tercero_nombre}</p>
                        <p className="text-[10px] text-slate-400">{f.tercero_codigo}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold
                          ${f.tipo === 'ganadero' ? 'bg-blue-100 text-blue-700'
                            : f.tipo === 'transportista' ? 'bg-purple-100 text-purple-700'
                            : 'bg-teal-100 text-teal-700'}`}>
                          {TIPO_LABELS[f.tipo]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 text-xs">
                        {Number(f.litros_a_pagar).toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 text-xs">{fmtBs(f.total_bs)}</td>
                      <td className="px-4 py-3 text-right text-slate-500 text-xs">{fmtUSD(f.total_bs / (f.tasa_factura || 1))}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${ESTADO_STYLES[f.estado] ?? ''}`}>
                          {f.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <ActionBtn icon={Eye} title="Ver factura" color="blue" onClick={() => openView(f)} />
                          <ActionBtn icon={Edit2} title="Editar" color="slate" onClick={() => { setEditFactura(f); setIsFormOpen(true) }} />
                          <ActionBtn icon={FileText} title="Descargar PDF" color="indigo" onClick={() => handleExportPDF(f)} />
                          <ActionBtn icon={ImageIcon} title="Descargar imagen" color="teal" onClick={() => handleExportImage(f)} />
                          <ActionBtn icon={Trash2} title="Eliminar" color="red" onClick={() => handleDelete(f)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3 p-4">
              {paged.map(f => (
                <div key={f.id} className={`rounded-xl border p-4 ${selectedIds.has(f.id) ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSel(f.id)} className="rounded mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="font-bold text-slate-800 text-sm leading-tight">{f.tercero_nombre}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_STYLES[f.estado]}`}>{f.estado}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{f.semana_nombre}</p>
                      <p className="text-xs text-slate-400">{formatDateDisplay(f.fecha_emision)} · {TIPO_LABELS[f.tipo]}</p>
                      <p className="font-black text-slate-800 mt-1">{fmtBs(f.total_bs)}</p>
                      <div className="flex gap-2 mt-3">
                        <MobileBtn label="Ver" onClick={() => openView(f)} />
                        <MobileBtn label="Editar" onClick={() => { setEditFactura(f); setIsFormOpen(true) }} />
                        <MobileBtn label="PDF" onClick={() => handleExportPDF(f)} />
                        <MobileBtn label="IMG" onClick={() => handleExportImage(f)} />
                        <MobileBtn label="Borrar" red onClick={() => handleDelete(f)} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Mostrar</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(0) }}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
                  >
                    {[10, 20, 50].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span>por página · {filtered.length} total</span>
                </div>
                <div className="flex gap-1">
                  <PagBtn onClick={() => setCurrentPage(0)} disabled={currentPage === 0} label="«" />
                  <PagBtn onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 0} label="‹" />
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const pg = totalPages <= 7 ? i : Math.max(0, Math.min(currentPage - 3, totalPages - 7)) + i
                    return (
                      <PagBtn
                        key={pg}
                        onClick={() => setCurrentPage(pg)}
                        disabled={false}
                        label={String(pg + 1)}
                        active={pg === currentPage}
                      />
                    )
                  })}
                  <PagBtn onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages - 1} label="›" />
                  <PagBtn onClick={() => setCurrentPage(totalPages - 1)} disabled={currentPage >= totalPages - 1} label="»" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal: Ver Factura ─────────────────────────────────────────────── */}
      {viewFactura && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setViewFactura(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center bg-slate-100 border-b border-slate-200 rounded-t-2xl overflow-hidden flex-shrink-0">
              <div className="px-6 py-4">
                <h3 className="font-black text-slate-800">Recibo Digital</h3>
                <p className="text-xs text-slate-500">{viewFactura.tercero_nombre} · {viewFactura.semana_nombre}</p>
              </div>
              <div className="flex items-center gap-2 pr-2">
                <button
                  onClick={() => handleExportPDF(viewFactura)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors no-print"
                >
                  <FileText size={13} /> PDF
                </button>
                <button
                  onClick={() => handleExportImage(viewFactura)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 transition-colors no-print"
                >
                  <ImageIcon size={13} /> Imagen
                </button>
                <button onClick={() => setViewFactura(null)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 mr-3 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              <FacturaTemplate
                factura={viewFactura}
                deducciones={viewDeducciones}
                captureId="factura-template"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Formulario ──────────────────────────────────────────────────────── */}
      <FacturaFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => load()}
        editFactura={editFactura}
        user={curUser}
        fabricas={fabricasConFiscal}
        currentFabricaId={selectedFabricaId}
      />

      {/* ── Bitácora ────────────────────────────────────────────────────── */}
      <BitacoraModal
        isOpen={isBitacoraOpen}
        onClose={() => setIsBitacoraOpen(false)}
        moduleFilter="Facturación"
        title="Bitácora — Facturación"
      />

      {/* ── Modal: Confirmar eliminación individual ──────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 text-center max-w-sm w-full animate-in zoom-in-95">
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h3 className="font-black text-lg text-slate-800">¿Eliminar factura?</h3>
            <p className="text-slate-500 text-sm mb-6 mt-2">
              Se borrará permanentemente la factura de <span className="font-bold text-slate-700">{deleteTarget.tercero_nombre}</span> ({deleteTarget.semana_nombre}).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteTarget(null)} className="bg-slate-100 text-slate-600 font-bold py-3 rounded-xl">Cerrar</button>
              <button onClick={confirmDeleteSingle} className="bg-red-600 text-white font-bold py-3 rounded-xl">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar eliminación masiva ──────────────────────────── */}
      {isDeleteBulkOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 text-center max-w-sm w-full animate-in zoom-in-95">
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h3 className="font-black text-lg text-slate-800">¿Eliminar registros?</h3>
            <p className="text-slate-500 text-sm mb-6 mt-2">Esta acción borrará permanentemente {selectedIds.size} factura(s).</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setIsDeleteBulkOpen(false)} className="bg-slate-100 text-slate-600 font-bold py-3 rounded-xl">Cerrar</button>
              <button onClick={confirmDeleteBulk} className="bg-red-600 text-white font-bold py-3 rounded-xl">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Auto-Generación de Facturas ──────────────────────────── */}
      {isGenModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-auto overflow-hidden animate-in zoom-in-95">
            <div className="flex justify-between items-center bg-amber-50 border-b border-amber-200 px-6 py-4">
              <div>
                <h3 className="font-black text-slate-800 flex items-center gap-2"><Zap size={16} className="text-amber-500" /> Generar Facturas Automáticamente</h3>
                <p className="text-xs text-slate-500 mt-0.5">Semana: {filtroSemana ? formatSemanaGanadera(filtroSemana) : '—'}</p>
              </div>
              {!genRunning && !genDone && (
                <button onClick={() => setIsGenModalOpen(false)} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
              )}
            </div>

            <div className="p-4 sm:p-6 max-h-[60vh] overflow-y-auto">
              {genLoading ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 className="animate-spin text-amber-500" size={32} />
                  <p className="text-slate-500 font-semibold text-sm">Analizando recepciones...</p>
                </div>
              ) : genDone ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <CheckCircle2 size={48} className="text-green-500" />
                  <p className="text-lg font-black text-slate-800">¡Generación completada!</p>
                  <p className="text-sm text-slate-500">{genProgress.done} procesadas · {genProgress.errors} errores</p>
                </div>
              ) : genRunning ? (
                <div className="flex flex-col items-center gap-4 py-10">
                  <Loader2 className="animate-spin text-amber-500" size={36} />
                  <p className="font-bold text-slate-700">Generando facturas...</p>
                  <div className="w-full max-w-sm">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>{genProgress.done} de {genProgress.total}</span>
                      <span>{genProgress.errors > 0 ? `${genProgress.errors} errores` : ''}</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${genProgress.total > 0 ? (genProgress.done / genProgress.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              ) : genPreview.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <AlertCircle size={36} className="mx-auto mb-3 opacity-40" />
                  <p className="font-semibold">No hay recepciones para esta semana</p>
                  <p className="text-sm mt-1">Registra recepciones en el módulo de Recepción primero.</p>
                </div>
              ) : (
                <>
                  {/* Leyenda */}
                  <div className="flex flex-wrap gap-3 mb-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                      <span className="text-slate-600 font-semibold">Nueva ({genPreview.filter(i => !i.existingFacturaId).length})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="text-slate-600 font-semibold">Reemplazar ({genPreview.filter(i => !!i.existingFacturaId).length})</span>
                    </div>
                  </div>
                  {/* Botones de selección rápida */}
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <button onClick={() => setGenSelected(new Set(genPreview.map(i => i.key)))}
                      className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold text-slate-600">Seleccionar todo</button>
                    <button onClick={() => setGenSelected(new Set(genPreview.filter(i => !i.existingFacturaId).map(i => i.key)))}
                      className="text-xs px-3 py-1.5 bg-green-50 hover:bg-green-100 rounded-lg font-semibold text-green-700 border border-green-200">Solo nuevas</button>
                    <button onClick={() => setGenSelected(new Set())}
                      className="text-xs px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg font-semibold text-slate-500 border border-slate-200">Deseleccionar todo</button>
                  </div>
                  {/* Lista */}
                  <div className="space-y-2">
                    {genPreview.map(item => (
                      <label key={item.key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${genSelected.has(item.key) ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={genSelected.has(item.key)}
                          onChange={() => {
                            const next = new Set(genSelected)
                            if (next.has(item.key)) next.delete(item.key); else next.add(item.key)
                            setGenSelected(next)
                          }}
                          className="mt-0.5 w-4 h-4 rounded text-blue-600" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${item.tipo === 'ganadero' ? 'bg-blue-100 text-blue-700' : item.tipo === 'transportista' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'}`}>
                              {TIPO_LABELS[item.tipo]}
                            </span>
                            {item.existingFacturaId
                              ? <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">REEMPLAZAR</span>
                              : <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-green-100 text-green-700">NUEVA</span>
                            }
                            <span className="text-xs font-black text-slate-700">{item.codigo}</span>
                            <span className="text-xs text-slate-600 truncate">{item.nombre}</span>
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-slate-500">
                            <span><span className="font-bold">Litros:</span> {item.litros.toLocaleString('es-VE', { maximumFractionDigits: 0 })} L</span>
                            {item.precio_leche_usd > 0 && <span><span className="font-bold">Leche:</span> $ {item.precio_leche_usd.toFixed(4)}/L</span>}
                            {item.precio_flete_usd > 0 && <span><span className="font-bold">Flete:</span> $ {item.precio_flete_usd.toFixed(4)}/L</span>}
                            {(item.litros_faltantes || 0) > 0 && <span className="text-red-500"><span className="font-bold">Faltantes:</span> {item.litros_faltantes?.toLocaleString('es-VE')} L</span>}
                            {(item.litros_agua || 0) > 0 && <span className="text-orange-500"><span className="font-bold">Agua:</span> {item.litros_agua?.toLocaleString('es-VE')} L</span>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center gap-3">
              <span className="text-xs text-slate-500 font-semibold">
                {genSelected.size} de {genPreview.length} seleccionadas
              </span>
              <div className="flex gap-3">
                {genDone ? (
                  <button onClick={() => { setIsGenModalOpen(false); setGenDone(false); setGenPreview([]) }}
                    className="bg-blue-600 text-white font-black px-5 py-2.5 rounded-xl shadow-sm">Cerrar</button>
                ) : (
                  <>
                    {!genRunning && (
                      <button onClick={() => setIsGenModalOpen(false)} className="bg-slate-100 text-slate-600 font-bold px-5 py-2.5 rounded-xl">Cancelar</button>
                    )}
                    <button onClick={runAutoGen}
                      disabled={genRunning || genLoading || genSelected.size === 0}
                      className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black px-5 py-2.5 rounded-xl shadow-sm transition-colors">
                      {genRunning ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                      {genRunning ? 'Generando...' : `Generar ${genSelected.size} facturas`}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Contenedor oculto para exportación bulk ──────────────────────── */}
      {bulkExportFactura && (
        <div
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            width: 860,
            zIndex: -1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        >
          <FacturaTemplate
            factura={bulkExportFactura}
            deducciones={bulkExportDeds}
            captureId="bulk-factura-template"
          />
        </div>
      )}
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function ActionBtn({ icon: Icon, title, color, onClick }: { icon: any; title: string; color: string; onClick: () => void }) {
  const colors: Record<string, string> = {
    blue: 'hover:bg-blue-100 hover:text-blue-700 text-slate-400',
    slate: 'hover:bg-slate-100 hover:text-slate-700 text-slate-400',
    indigo: 'hover:bg-indigo-100 hover:text-indigo-700 text-slate-400',
    teal: 'hover:bg-teal-100 hover:text-teal-700 text-slate-400',
    red: 'hover:bg-red-100 hover:text-red-600 text-slate-400',
  }
  return (
    <button title={title} onClick={onClick} className={`p-1.5 rounded-lg transition-colors ${colors[color]}`}>
      <Icon size={14} />
    </button>
  )
}

function MobileBtn({ label, onClick, red }: { label: string; onClick: () => void; red?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${red ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}
    >
      {label}
    </button>
  )
}

function PagBtn({ onClick, disabled, label, active }: { onClick: () => void; disabled: boolean; label: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 text-xs rounded-lg transition-colors font-semibold ${
        active ? 'bg-blue-600 text-white' : disabled ? 'text-slate-300 cursor-default' : 'text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  )
}
