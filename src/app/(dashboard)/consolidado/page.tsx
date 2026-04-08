'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, Download, Search, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useFabrica } from '@/contexts/FabricaContext'
import * as XLSX from 'xlsx'

type Detalle = {
  id: string
  litros_recepcion: number
  litros_a_pagar: number
  litros_descuento: number
  ganaderos: { codigo_ganadero: string; nombre: string; grupo: string | null; tipo_proveedor: string } | null
}

type Camion = {
  id: string
  fecha_ingreso: string
  ticket_romana: string
  placa: string
  litros_romana: number
  agua_transporte: number
  rutas: { nombre_ruta: string } | null
  recepciones_detalle: Detalle[]
}

type Tab = 'romana' | 'ganadero' | 'fsd'

const fmt = (n: number) => Math.round(n).toLocaleString('es-VE')
const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.substring(0, 10).split('-')
  return `${d}/${m}/${y}`
}
const getSemana = (iso: string) => {
  const p = iso.substring(0, 10).split('-')
  const d = new Date(+p[0], +p[1] - 1, +p[2])
  const diff = (d.getDay() - 3 + 7) % 7
  const wed = new Date(d); wed.setDate(d.getDate() - diff)
  const tue = new Date(wed); tue.setDate(wed.getDate() + 6)
  const f2 = (dt: Date) => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`
  return { key: wed.toISOString().substring(0, 10), label: `${f2(wed)} – ${f2(tue)}/${tue.getFullYear()}` }
}

const exportExcel = (rows: any[], filename: string) => {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export default function ConsolidadoPage() {
  const supabase = createClient()
  const { selectedFabricaId } = useFabrica()
  const [tab, setTab] = useState<Tab>('romana')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Camion[]>([])

  const today = new Date().toISOString().substring(0, 10)
  const firstOfMonth = today.substring(0, 8) + '01'
  const [desde, setDesde] = useState(firstOfMonth)
  const [hasta, setHasta] = useState(today)

  // Tab 1 filters
  const [t1Texto, setT1Texto] = useState('')

  // Tab 2 filters
  const [t2Vista, setT2Vista] = useState<'diaria' | 'total'>('diaria')
  const [t2Fecha, setT2Fecha] = useState(today)
  const [t2Texto, setT2Texto] = useState('')

  // Tab 3 filters
  const [t3Mode, setT3Mode] = useState<'diario' | 'semanal'>('diario')
  const [t3Fecha, setT3Fecha] = useState('')
  const [t3Expanded, setT3Expanded] = useState<Set<string>>(new Set())

  useEffect(() => { load() }, [selectedFabricaId, desde, hasta])

  const load = async () => {
    setLoading(true)
    const q = supabase.from('recepciones_camion')
      .select('id, fecha_ingreso, ticket_romana, placa, litros_romana, agua_transporte, rutas(nombre_ruta), recepciones_detalle(id, litros_recepcion, litros_a_pagar, litros_descuento, ganaderos(codigo_ganadero, nombre, grupo, tipo_proveedor))')
      .gte('fecha_ingreso', `${desde}T00:00:00`)
      .lte('fecha_ingreso', `${hasta}T23:59:59`)
      .order('fecha_ingreso', { ascending: false })
    if (selectedFabricaId && selectedFabricaId !== 'all') q.eq('fabrica_id', selectedFabricaId)
    const { data: rows } = await q
    setData((rows || []) as any)
    setLoading(false)
  }

  const toggleExpand = (key: string) =>
    setT3Expanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  // ---- Tab 1: Por Romana ----
  const rowsRomana = useMemo(() => {
    const t = t1Texto.toLowerCase()
    return data
      .filter(c => !t || c.ticket_romana.toLowerCase().includes(t) || (c.rutas?.nombre_ruta || '').toLowerCase().includes(t))
      .map(c => {
        const litros_pagados = c.recepciones_detalle.reduce((s, d) => s + (d.litros_a_pagar || 0), 0)
        const litros_romana = c.litros_romana || 0
        return {
          id: c.id,
          fecha: c.fecha_ingreso.substring(0, 10),
          ticket: c.ticket_romana,
          ruta: c.rutas?.nombre_ruta || '—',
          litros_romana,
          litros_pagados,
          dif: litros_romana - litros_pagados,
          num_gans: c.recepciones_detalle.length,
          agua_transp: c.agua_transporte || 0,
        }
      })
  }, [data, t1Texto])

  const totRomana = useMemo(() => ({
    litros_romana: rowsRomana.reduce((s, r) => s + r.litros_romana, 0),
    litros_pagados: rowsRomana.reduce((s, r) => s + r.litros_pagados, 0),
    dif: rowsRomana.reduce((s, r) => s + r.dif, 0),
    agua_transp: rowsRomana.reduce((s, r) => s + r.agua_transp, 0),
  }), [rowsRomana])

  // ---- Tab 2: Por Ganadero ----
  const rowsGanadero = useMemo(() => {
    const t = t2Texto.toLowerCase()
    const rows: any[] = []
    for (const c of data) {
      const fecha = c.fecha_ingreso.substring(0, 10)
      const ruta = c.rutas?.nombre_ruta || '—'
      if (t2Vista === 'diaria' && fecha !== t2Fecha) continue
      for (const d of c.recepciones_detalle) {
        const cod = d.ganaderos?.codigo_ganadero || ''
        const nom = d.ganaderos?.nombre || ''
        const grp = d.ganaderos?.grupo || ''
        if (t && !cod.toLowerCase().includes(t) && !nom.toLowerCase().includes(t) && !grp.toLowerCase().includes(t) && !ruta.toLowerCase().includes(t)) continue
        rows.push({ id: d.id, fecha, ticket: c.ticket_romana, ruta, codigo: cod, nombre: nom, grupo: grp || '—', tipo: d.ganaderos?.tipo_proveedor || '', litros_rec: d.litros_recepcion || 0, litros_desc: d.litros_descuento || 0, litros_pagar: d.litros_a_pagar || 0 })
      }
    }
    return rows
  }, [data, t2Vista, t2Fecha, t2Texto])

  const totGanadero = useMemo(() => ({
    litros_rec: rowsGanadero.reduce((s, r) => s + r.litros_rec, 0),
    litros_desc: rowsGanadero.reduce((s, r) => s + r.litros_desc, 0),
    litros_pagar: rowsGanadero.reduce((s, r) => s + r.litros_pagar, 0),
  }), [rowsGanadero])

  // ---- Tab 3: Faltante / Sobrante / Desviación ----
  const rowsFSD = useMemo(() => {
    type G = { periodo: string; label: string; litros_romana: number; litros_gans: number; agua_propio: number; agua_tercero: number; agua_transp: number; det_propio: any[]; det_tercero: any[]; det_transp: any[] }
    const map = new Map<string, G>()
    for (const c of data) {
      const fecha = c.fecha_ingreso.substring(0, 10)
      const { key, label } = t3Mode === 'semanal' ? getSemana(fecha) : { key: fecha, label: fmtFecha(fecha) }
      if (t3Fecha) {
        const include = t3Mode === 'diario' ? fecha === t3Fecha : getSemana(fecha).key === getSemana(t3Fecha).key
        if (!include) continue
      }
      if (!map.has(key)) map.set(key, { periodo: key, label, litros_romana: 0, litros_gans: 0, agua_propio: 0, agua_tercero: 0, agua_transp: 0, det_propio: [], det_tercero: [], det_transp: [] })
      const g = map.get(key)!
      g.litros_romana += c.litros_romana || 0
      g.agua_transp += c.agua_transporte || 0
      if ((c.agua_transporte || 0) > 0) g.det_transp.push({ ticket: c.ticket_romana, placa: c.placa, fecha, agua: c.agua_transporte })
      for (const d of c.recepciones_detalle) {
        g.litros_gans += d.litros_recepcion || 0
        const agua = d.litros_descuento || 0
        if (d.ganaderos?.tipo_proveedor === 'PROPIO') {
          g.agua_propio += agua
          if (agua > 0) g.det_propio.push({ codigo: d.ganaderos?.codigo_ganadero, nombre: d.ganaderos?.nombre, agua, fecha })
        } else {
          g.agua_tercero += agua
          if (agua > 0) g.det_tercero.push({ codigo: d.ganaderos?.codigo_ganadero, nombre: d.ganaderos?.nombre, agua, fecha })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.periodo.localeCompare(a.periodo))
  }, [data, t3Mode, t3Fecha])

  const totFSD = useMemo(() => ({
    litros_romana: rowsFSD.reduce((s, r) => s + r.litros_romana, 0),
    litros_gans: rowsFSD.reduce((s, r) => s + r.litros_gans, 0),
    agua_propio: rowsFSD.reduce((s, r) => s + r.agua_propio, 0),
    agua_tercero: rowsFSD.reduce((s, r) => s + r.agua_tercero, 0),
    agua_transp: rowsFSD.reduce((s, r) => s + r.agua_transp, 0),
  }), [rowsFSD])

  const TABS: { id: Tab; label: string }[] = [
    { id: 'romana', label: 'Por Romana' },
    { id: 'ganadero', label: 'Por Ganadero' },
    { id: 'fsd', label: 'Falt. / Sobr. / Desviación' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header sticky */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow shrink-0">
            <BarChart3 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-black text-slate-900 text-lg leading-tight">Consolidado Recepción</h1>
            <p className="text-xs text-slate-500">{data.length} tickets en el período</p>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === t.id ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6 max-w-screen-xl mx-auto space-y-4">

        {/* Período de carga */}
        <div className="flex flex-wrap gap-2 items-center bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm">
          <span className="text-xs font-black text-slate-500 uppercase tracking-wide shrink-0">Período:</span>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-700" />
          <span className="text-xs text-slate-400">—</span>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-700" />
          <button onClick={load} className="text-xs bg-indigo-600 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">Actualizar</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-500 w-10 h-10" /></div>
        ) : (
          <>
            {/* ===== TAB 1: POR ROMANA ===== */}
            {tab === 'romana' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex-1 min-w-[180px] relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={t1Texto} onChange={e => setT1Texto(e.target.value)} placeholder="Buscar ticket, placa o ruta…" className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-bold text-slate-700 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  <button onClick={() => exportExcel(rowsRomana.map(r => ({ Fecha: fmtFecha(r.fecha), 'Ticket Romana': r.ticket, Ruta: r.ruta, 'Litros Romana': Math.round(r.litros_romana), 'Litros Pagados': Math.round(r.litros_pagados), 'DIF.': Math.round(r.dif), 'N° Ganaderos': r.num_gans, 'Agua Transporte (L)': Math.round(r.agua_transp) })), 'consolidado_romana')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 border border-emerald-200 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors">
                    <Download size={14} /> Exportar
                  </button>
                </div>

                {/* Mobile: cards */}
                <div className="sm:hidden space-y-2">
                  {rowsRomana.length === 0
                    ? <div className="text-center py-10 text-slate-400 font-bold text-sm">Sin registros</div>
                    : rowsRomana.map(r => (
                      <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-black text-indigo-700">{fmtFecha(r.fecha)}</span>
                          <span className="text-xs font-black text-slate-800">{fmt(r.litros_romana)} L</span>
                        </div>
                        <div className="text-sm font-black text-slate-900">{r.ticket}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{r.ruta} · {r.num_gans} gans.</div>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-600">
                          <span><b>Pagados:</b> {fmt(r.litros_pagados)} L</span>
                          <span className={r.dif >= 0 ? 'text-emerald-700' : 'text-red-700'}><b>DIF:</b> {r.dif >= 0 ? '+' : ''}{fmt(r.dif)} L</span>
                          {r.agua_transp > 0 && <span className="text-violet-700"><b>Agua Transp:</b> {fmt(r.agua_transp)} L</span>}
                        </div>
                      </div>
                    ))}
                  {rowsRomana.length > 0 && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                      <div className="text-xs font-black text-indigo-800 mb-1">TOTALES — {rowsRomana.length} tickets</div>
                      <div className="flex flex-wrap gap-3 text-xs">
                        <span><b>Romana:</b> {fmt(totRomana.litros_romana)} L</span>
                        <span><b>Pagados:</b> {fmt(totRomana.litros_pagados)} L</span>
                        <span className={totRomana.dif >= 0 ? 'text-emerald-700' : 'text-red-700'}><b>DIF:</b> {totRomana.dif >= 0 ? '+' : ''}{fmt(totRomana.dif)} L</span>
                        <span><b>Agua Transp:</b> {fmt(totRomana.agua_transp)} L</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Desktop: tabla */}
                <div className="hidden sm:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['Fecha', 'Ticket Romana', 'Ruta', 'Lit. Romana', 'Lit. Pagados', 'DIF.', '# Gans', 'Agua Transp.'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-black text-slate-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rowsRomana.length === 0
                          ? <tr><td colSpan={8} className="text-center py-10 text-slate-400 font-bold">Sin registros para este período o filtro</td></tr>
                          : rowsRomana.map(r => (
                            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-2 font-bold text-indigo-700 whitespace-nowrap">{fmtFecha(r.fecha)}</td>
                              <td className="px-3 py-2 font-black text-slate-900">{r.ticket}</td>
                              <td className="px-3 py-2 text-slate-700">{r.ruta}</td>
                              <td className="px-3 py-2 font-black text-slate-900 text-right">{fmt(r.litros_romana)}</td>
                              <td className="px-3 py-2 font-bold text-slate-700 text-right">{fmt(r.litros_pagados)}</td>
                              <td className={`px-3 py-2 font-black text-right ${r.dif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{r.dif >= 0 ? '+' : ''}{fmt(r.dif)}</td>
                              <td className="px-3 py-2 text-slate-500 text-center">{r.num_gans}</td>
                              <td className="px-3 py-2 font-bold text-violet-700 text-right">{r.agua_transp > 0 ? fmt(r.agua_transp) : '—'}</td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot className="bg-indigo-50 border-t-2 border-indigo-200">
                        <tr>
                          <td colSpan={3} className="px-3 py-2.5 font-black text-indigo-800 uppercase text-xs">Totales — {rowsRomana.length} tickets</td>
                          <td className="px-3 py-2.5 font-black text-indigo-900 text-right">{fmt(totRomana.litros_romana)}</td>
                          <td className="px-3 py-2.5 font-black text-indigo-900 text-right">{fmt(totRomana.litros_pagados)}</td>
                          <td className={`px-3 py-2.5 font-black text-right ${totRomana.dif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{totRomana.dif >= 0 ? '+' : ''}{fmt(totRomana.dif)}</td>
                          <td></td>
                          <td className="px-3 py-2.5 font-black text-violet-800 text-right">{fmt(totRomana.agua_transp)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ===== TAB 2: POR GANADERO ===== */}
            {tab === 'ganadero' && (
              <div className="space-y-3">
                {/* Sub-toggle */}
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                  {([['diaria', 'Vista Diaria'], ['total', 'Todos los días']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setT2Vista(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${t2Vista === v ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                      {l}
                    </button>
                  ))}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2 items-center">
                  {t2Vista === 'diaria' && (
                    <input type="date" value={t2Fecha} onChange={e => setT2Fecha(e.target.value)} className="text-xs border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  )}
                  <div className="flex-1 min-w-[180px] relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={t2Texto} onChange={e => setT2Texto(e.target.value)} placeholder="Buscar código, nombre, grupo o ruta…" className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-bold text-slate-700 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  <button onClick={() => exportExcel(rowsGanadero.map(r => ({ Fecha: fmtFecha(r.fecha), 'Cód. Ganadero': r.codigo, Ruta: r.ruta, Nombre: r.nombre, Grupo: r.grupo !== '—' ? r.grupo : '', Tipo: r.tipo, Ticket: r.ticket, 'Litros Rec. (L)': Math.round(r.litros_rec), 'Agua Dcto (L)': Math.round(r.litros_desc), 'Litros a Pagar (L)': Math.round(r.litros_pagar) })), 'consolidado_ganadero')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 border border-emerald-200 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors">
                    <Download size={14} /> Exportar
                  </button>
                </div>

                {/* Mobile: cards */}
                <div className="sm:hidden space-y-2">
                  {rowsGanadero.length === 0
                    ? <div className="text-center py-10 text-slate-400 font-bold text-sm">Sin registros</div>
                    : rowsGanadero.map(r => (
                      <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                        <div className="flex justify-between items-start mb-1">
                          <div>
                            <span className="text-xs font-black text-indigo-700">{r.codigo}</span>
                            {t2Vista === 'total' && <span className="text-xs text-slate-400 ml-1.5">{fmtFecha(r.fecha)}</span>}
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${r.tipo === 'PROPIO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{r.tipo}</span>
                        </div>
                        <div className="text-sm font-black text-slate-900">{r.nombre}</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {r.grupo !== '—' && <span className="inline-block bg-violet-100 text-violet-800 text-[10px] font-black px-2 py-0.5 rounded uppercase">{r.grupo}</span>}
                          <span className="inline-block bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded">{r.ruta}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{r.ticket}</div>
                        <div className="flex gap-3 mt-2 text-xs text-slate-600">
                          <span><b>Rec:</b> {fmt(r.litros_rec)} L</span>
                          {r.litros_desc > 0 && <span className="text-red-600"><b>Agua:</b> {fmt(r.litros_desc)} L</span>}
                          <span className="text-emerald-700"><b>Pagar:</b> {fmt(r.litros_pagar)} L</span>
                        </div>
                      </div>
                    ))}
                  {rowsGanadero.length > 0 && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                      <div className="text-xs font-black text-indigo-800 mb-1">TOTALES — {rowsGanadero.length} registros</div>
                      <div className="flex flex-wrap gap-3 text-xs">
                        <span><b>Recepción:</b> {fmt(totGanadero.litros_rec)} L</span>
                        <span><b>Agua:</b> {fmt(totGanadero.litros_desc)} L</span>
                        <span className="text-emerald-700"><b>A Pagar:</b> {fmt(totGanadero.litros_pagar)} L</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Desktop: tabla */}
                <div className="hidden sm:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {t2Vista === 'total' && <th className="px-3 py-2.5 text-left font-black text-slate-600 uppercase tracking-wide whitespace-nowrap">Fecha</th>}
                          {['Cód.', 'Ruta', 'Nombre', 'Grupo', 'Tipo', 'Ticket', 'Lit. Rec.', 'Agua (Dcto)', 'Lit. a Pagar'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-black text-slate-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rowsGanadero.length === 0
                          ? <tr><td colSpan={10} className="text-center py-10 text-slate-400 font-bold">Sin registros para este período o filtro</td></tr>
                          : rowsGanadero.map(r => (
                            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                              {t2Vista === 'total' && <td className="px-3 py-2 font-bold text-indigo-700 whitespace-nowrap">{fmtFecha(r.fecha)}</td>}
                              <td className="px-3 py-2 font-black text-slate-900 whitespace-nowrap">{r.codigo}</td>
                              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.ruta}</td>
                              <td className="px-3 py-2 text-slate-700">{r.nombre}</td>
                              <td className="px-3 py-2">
                                {r.grupo !== '—'
                                  ? <span className="bg-violet-100 text-violet-800 text-[10px] font-black px-2 py-0.5 rounded uppercase">{r.grupo}</span>
                                  : <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${r.tipo === 'PROPIO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{r.tipo}</span>
                              </td>
                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.ticket}</td>
                              <td className="px-3 py-2 font-black text-slate-900 text-right">{fmt(r.litros_rec)}</td>
                              <td className="px-3 py-2 font-bold text-red-600 text-right">{r.litros_desc > 0 ? fmt(r.litros_desc) : '—'}</td>
                              <td className="px-3 py-2 font-black text-emerald-700 text-right">{fmt(r.litros_pagar)}</td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot className="bg-indigo-50 border-t-2 border-indigo-200">
                        <tr>
                          <td colSpan={t2Vista === 'total' ? 7 : 6} className="px-3 py-2.5 font-black text-indigo-800 uppercase text-xs">Totales — {rowsGanadero.length} registros</td>
                          <td className="px-3 py-2.5 font-black text-indigo-900 text-right">{fmt(totGanadero.litros_rec)}</td>
                          <td className="px-3 py-2.5 font-black text-red-700 text-right">{fmt(totGanadero.litros_desc)}</td>
                          <td className="px-3 py-2.5 font-black text-emerald-800 text-right">{fmt(totGanadero.litros_pagar)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ===== TAB 3: FALTANTE / SOBRANTE / DESVIACIÓN ===== */}
            {tab === 'fsd' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                    {([['diario', 'Diario'], ['semanal', 'Semana Ganadera']] as const).map(([v, l]) => (
                      <button key={v} onClick={() => { setT3Mode(v); setT3Fecha('') }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${t3Mode === v ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input type="date" value={t3Fecha} onChange={e => setT3Fecha(e.target.value)} className="text-xs border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    {t3Fecha && <button onClick={() => setT3Fecha('')} className="text-xs text-slate-400 hover:text-slate-700 font-bold">✕</button>}
                  </div>
                  <button onClick={() => exportExcel(rowsFSD.map(r => { const dif = r.litros_romana - r.litros_gans; return { Período: r.label, 'Lit. Romana': r.litros_romana, 'Lit. Ganaderos': r.litros_gans, 'Diferencia': dif, 'Tipo': dif >= 0 ? 'SOBRANTE' : 'FALTANTE', 'Agua Propio (L)': r.agua_propio, 'Agua Tercero (L)': r.agua_tercero, 'Agua Transporte (L)': r.agua_transp } }), 'consolidado_fsd')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 border border-emerald-200 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors ml-auto">
                    <Download size={14} /> Exportar
                  </button>
                </div>

                {/* Leyenda */}
                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase">
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg">▲ Sobrante = Romana &gt; Ganaderos</span>
                  <span className="bg-red-100 text-red-700 px-2 py-1 rounded-lg">▼ Faltante = Romana &lt; Ganaderos</span>
                  <span className="text-slate-400 font-normal text-[10px] self-center">· Clic en fila para ver detalle</span>
                </div>

                {/* Mobile: cards FSD */}
                <div className="sm:hidden space-y-2">
                  {rowsFSD.length === 0
                    ? <div className="text-center py-10 text-slate-400 font-bold text-sm">Sin registros</div>
                    : rowsFSD.map(r => {
                      const dif = r.litros_romana - r.litros_gans
                      const isSobr = dif >= 0
                      const expanded = t3Expanded.has(r.periodo)
                      return (
                        <div key={r.periodo} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className="p-3">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-black text-indigo-700">{r.label}</span>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isSobr ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {isSobr ? '▲ SOB' : '▼ FALT'} {fmt(Math.abs(dif))} L
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                              <span><b>Romana:</b> {fmt(r.litros_romana)} L</span>
                              <span><b>Ganaderos:</b> {fmt(r.litros_gans)} L</span>
                              <span className="text-green-700"><b>Agua Propio:</b> {fmt(r.agua_propio)} L</span>
                              <span className="text-orange-700"><b>Agua Tercero:</b> {fmt(r.agua_tercero)} L</span>
                              <span className="text-violet-700"><b>Agua Transp:</b> {fmt(r.agua_transp)} L</span>
                            </div>
                            <button onClick={() => toggleExpand(r.periodo)} className="mt-2 text-xs text-indigo-600 font-bold flex items-center gap-1">
                              {expanded ? <><ChevronUp size={12} /> Ocultar detalle</> : <><ChevronDown size={12} /> Ver detalle</>}
                            </button>
                          </div>
                          {expanded && (
                            <div className="border-t border-slate-100 px-3 pb-3 pt-2 bg-slate-50 space-y-3">
                              {r.det_propio.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-black text-green-700 uppercase mb-1">Agua Ganadero Propio</p>
                                  {r.det_propio.map((d: any, i: number) => (
                                    <div key={i} className="flex justify-between text-xs text-slate-600"><span>{d.codigo} · {d.nombre}</span><span className="font-black text-green-700">{fmt(d.agua)} L</span></div>
                                  ))}
                                </div>
                              )}
                              {r.det_tercero.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-black text-orange-700 uppercase mb-1">Agua Terceros</p>
                                  {r.det_tercero.map((d: any, i: number) => (
                                    <div key={i} className="flex justify-between text-xs text-slate-600"><span>{d.codigo} · {d.nombre}</span><span className="font-black text-orange-700">{fmt(d.agua)} L</span></div>
                                  ))}
                                </div>
                              )}
                              {r.det_transp.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-black text-violet-700 uppercase mb-1">Agua Transporte</p>
                                  {r.det_transp.map((d: any, i: number) => (
                                    <div key={i} className="flex justify-between text-xs text-slate-600"><span>Ticket {d.ticket}{d.placa !== '0' ? ` · ${d.placa}` : ''}</span><span className="font-black text-violet-700">{fmt(d.agua)} L</span></div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  {rowsFSD.length > 0 && (() => {
                    const totDif = totFSD.litros_romana - totFSD.litros_gans
                    return (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                        <div className="text-xs font-black text-indigo-800 mb-1">TOTALES — {rowsFSD.length} períodos</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <span><b>Romana:</b> {fmt(totFSD.litros_romana)} L</span>
                          <span><b>Ganaderos:</b> {fmt(totFSD.litros_gans)} L</span>
                          <span className={`font-black ${totDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}><b>Diferencia:</b> {totDif >= 0 ? '+' : ''}{fmt(totDif)} L</span>
                          <span className="text-green-700"><b>Agua Propio:</b> {fmt(totFSD.agua_propio)} L</span>
                          <span className="text-orange-700"><b>Agua Tercero:</b> {fmt(totFSD.agua_tercero)} L</span>
                          <span className="text-violet-700"><b>Agua Transp:</b> {fmt(totFSD.agua_transp)} L</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Desktop: tabla FSD */}
                <div className="hidden sm:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 w-8"></th>
                          {['Período', 'Lit. Romana', 'Lit. Ganaderos', 'Diferencia', 'Falt./Sobr.', 'Agua Propio', 'Agua Tercero', 'Agua Transporte'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-black text-slate-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rowsFSD.length === 0
                          ? <tr><td colSpan={9} className="text-center py-10 text-slate-400 font-bold">Sin registros para este período o filtro</td></tr>
                          : rowsFSD.map(r => {
                            const dif = r.litros_romana - r.litros_gans
                            const isSobr = dif >= 0
                            const expanded = t3Expanded.has(r.periodo)
                            return (
                              <React.Fragment key={r.periodo}>
                                <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => toggleExpand(r.periodo)}>
                                  <td className="px-3 py-2.5 text-slate-400">
                                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </td>
                                  <td className="px-3 py-2.5 font-bold text-indigo-700 whitespace-nowrap">{r.label}</td>
                                  <td className="px-3 py-2.5 font-black text-slate-900 text-right">{fmt(r.litros_romana)}</td>
                                  <td className="px-3 py-2.5 font-bold text-slate-700 text-right">{fmt(r.litros_gans)}</td>
                                  <td className={`px-3 py-2.5 font-black text-right ${isSobr ? 'text-emerald-700' : 'text-red-700'}`}>{isSobr ? '+' : ''}{fmt(dif)}</td>
                                  <td className="px-3 py-2.5 text-center">
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isSobr ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{isSobr ? 'SOBRANTE' : 'FALTANTE'}</span>
                                  </td>
                                  <td className="px-3 py-2.5 font-bold text-green-700 text-right">{r.agua_propio > 0 ? fmt(r.agua_propio) : '—'}</td>
                                  <td className="px-3 py-2.5 font-bold text-orange-600 text-right">{r.agua_tercero > 0 ? fmt(r.agua_tercero) : '—'}</td>
                                  <td className="px-3 py-2.5 font-bold text-violet-700 text-right">{r.agua_transp > 0 ? fmt(r.agua_transp) : '—'}</td>
                                </tr>
                                {expanded && (
                                  <tr className="border-b border-slate-200 bg-slate-50">
                                    <td colSpan={9} className="px-6 py-4">
                                      <div className="grid grid-cols-3 gap-4">
                                        <div>
                                          <p className="text-[10px] font-black text-green-700 uppercase mb-2">Agua Ganadero Propio</p>
                                          {r.det_propio.length === 0
                                            ? <p className="text-xs text-slate-400">Sin registros</p>
                                            : r.det_propio.map((d: any, i: number) => (
                                              <div key={i} className="flex justify-between text-xs text-slate-700 bg-white rounded-lg px-2.5 py-1.5 border border-green-100 mb-1">
                                                <span className="truncate">{d.codigo} · {d.nombre}</span>
                                                <span className="font-black text-green-700 ml-2 shrink-0">{fmt(d.agua)} L</span>
                                              </div>
                                            ))}
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-black text-orange-700 uppercase mb-2">Agua Terceros</p>
                                          {r.det_tercero.length === 0
                                            ? <p className="text-xs text-slate-400">Sin registros</p>
                                            : r.det_tercero.map((d: any, i: number) => (
                                              <div key={i} className="flex justify-between text-xs text-slate-700 bg-white rounded-lg px-2.5 py-1.5 border border-orange-100 mb-1">
                                                <span className="truncate">{d.codigo} · {d.nombre}</span>
                                                <span className="font-black text-orange-700 ml-2 shrink-0">{fmt(d.agua)} L</span>
                                              </div>
                                            ))}
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-black text-violet-700 uppercase mb-2">Agua Transporte</p>
                                          {r.det_transp.length === 0
                                            ? <p className="text-xs text-slate-400">Sin registros</p>
                                            : r.det_transp.map((d: any, i: number) => (
                                              <div key={i} className="flex justify-between text-xs text-slate-700 bg-white rounded-lg px-2.5 py-1.5 border border-violet-100 mb-1">
                                                <span>Ticket {d.ticket}{d.placa !== '0' ? ` · ${d.placa}` : ''}</span>
                                                <span className="font-black text-violet-700 ml-2 shrink-0">{fmt(d.agua)} L</span>
                                              </div>
                                            ))}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            )
                          })}
                      </tbody>
                      <tfoot className="bg-indigo-50 border-t-2 border-indigo-200">
                        {(() => {
                          const totDif = totFSD.litros_romana - totFSD.litros_gans
                          return (
                            <tr>
                              <td></td>
                              <td className="px-3 py-2.5 font-black text-indigo-800 uppercase text-xs">Totales — {rowsFSD.length} períodos</td>
                              <td className="px-3 py-2.5 font-black text-indigo-900 text-right">{fmt(totFSD.litros_romana)}</td>
                              <td className="px-3 py-2.5 font-black text-indigo-900 text-right">{fmt(totFSD.litros_gans)}</td>
                              <td className={`px-3 py-2.5 font-black text-right ${totDif >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{totDif >= 0 ? '+' : ''}{fmt(totDif)}</td>
                              <td></td>
                              <td className="px-3 py-2.5 font-black text-green-800 text-right">{fmt(totFSD.agua_propio)}</td>
                              <td className="px-3 py-2.5 font-black text-orange-800 text-right">{fmt(totFSD.agua_tercero)}</td>
                              <td className="px-3 py-2.5 font-black text-violet-800 text-right">{fmt(totFSD.agua_transp)}</td>
                            </tr>
                          )
                        })()}
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
