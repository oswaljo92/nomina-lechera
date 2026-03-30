'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Plus, Search, FileText, Image as ImageIcon, Trash2, Edit2, Eye,
  Loader2, Download, FileArchive, X, CheckCircle2, History,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useFabrica } from '@/contexts/FabricaContext'
import { logAction } from '@/lib/log-utils'
import {
  fmtBs, fmtUSD, formatDateDisplay, formatSemanaGanadera,
  buildFacturaFilename,
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

export default function FacturacionPage() {
  const supabase = createClient()
  const { selectedFabricaId, fabricas, isAllFabricas } = useFabrica()

  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading] = useState(true)
  const [curUser, setCurUser] = useState<any>(null)
  const [fabricasConFiscal, setFabricasConFiscal] = useState<any[]>([])

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroSemana, setFiltroSemana] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

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

    const fabQ = supabase.from('fabricas').select('id, codigo, nombre, razon_social, rif, direccion_fiscal')
    const { data: fabData } = await fabQ
    setFabricasConFiscal(fabData ?? [])

    let q = supabase
      .from('facturas')
      .select('*, fabricas(nombre, codigo), facturas_deducciones(*)')
      .order('fecha_emision', { ascending: false })

    if (!isAllFabricas && selectedFabricaId !== 'all') {
      q = q.eq('fabrica_id', selectedFabricaId)
    }

    const { data } = await q
    setFacturas((data ?? []) as Factura[])
    setLoading(false)
  }

  // ── Filtrado ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = facturas
    if (filtroSemana) list = list.filter(f => f.semana_fecha === filtroSemana)
    if (filtroTipo) list = list.filter(f => f.tipo === filtroTipo)
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
  }, [facturas, filtroSemana, filtroTipo, searchTerm])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paged = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  useEffect(() => setCurrentPage(0), [searchTerm, filtroSemana, filtroTipo])

  // ── Semanas disponibles para filtro ───────────────────────────────────────
  const semanasDisponibles = useMemo(() => {
    const set = new Map<string, string>()
    facturas.forEach(f => set.set(f.semana_fecha, f.semana_nombre))
    return Array.from(set.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [facturas])

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
  const handleDelete = async (factura: Factura) => {
    if (!confirm(`¿Eliminar la factura de ${factura.tercero_nombre} (${factura.semana_nombre})?`)) return
    await supabase.from('facturas').delete().eq('id', factura.id)
    logAction(supabase, curUser, 'Facturación', 'BORRAR', `Eliminada factura: ${factura.tercero_nombre} — ${factura.semana_nombre}`)
    load()
  }

  const handleDeleteSelected = async () => {
    if (!confirm(`¿Eliminar ${selectedIds.size} factura(s) seleccionadas?`)) return
    await supabase.from('facturas').delete().in('id', Array.from(selectedIds))
    logAction(supabase, curUser, 'Facturación', 'BORRADO_MASIVO', `Eliminadas ${selectedIds.size} facturas`)
    setSelectedIds(new Set())
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

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const emitidas = facturas.filter(f => f.estado === 'emitida')
    return {
      total: facturas.length,
      totalBs: emitidas.reduce((s, f) => s + Number(f.total_bs), 0),
      totalUSD: emitidas.reduce((s, f) => s + (f.total_bs / (f.tasa_factura || 1)), 0),
      semanas: new Set(facturas.map(f => f.semana_fecha)).size,
    }
  }, [facturas])

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBitacoraOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl transition-colors shadow-sm text-sm"
          >
            <History size={15} /> Bitácora
          </button>
          <button
            onClick={() => { setEditFactura(null); setIsFormOpen(true) }}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-sm"
          >
            <Plus size={16} /> Nuevo Recibo Digital
          </button>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total recibos', value: kpis.total.toString(), color: 'from-blue-500 to-indigo-600' },
          { label: 'Semanas', value: kpis.semanas.toString(), color: 'from-cyan-500 to-blue-500' },
          { label: 'Total Bs', value: fmtBs(kpis.totalBs), color: 'from-emerald-500 to-teal-600' },
          { label: 'Total USD', value: fmtUSD(kpis.totalUSD), color: 'from-amber-500 to-orange-500' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${k.color} opacity-[0.07] rounded-bl-full -mr-6 -mt-6`} />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{k.label}</p>
            <p className="text-xl font-black text-slate-800 mt-1 leading-tight">{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar proveedor, código, semana..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        <select
          value={filtroSemana}
          onChange={e => setFiltroSemana(e.target.value)}
          className="px-3 py-2.5 text-sm border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">Todas las semanas</option>
          {semanasDisponibles.map(([fecha, nombre]) => (
            <option key={fecha} value={fecha}>{nombre}</option>
          ))}
        </select>

        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="px-3 py-2.5 text-sm border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">Todos los tipos</option>
          <option value="ganadero">Ganadero</option>
          <option value="transportista">Transportista</option>
          <option value="ganadero_transportista">Ganadero + Flete</option>
        </select>
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
