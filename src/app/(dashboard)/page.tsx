'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Loader2, TrendingUp, Filter, DollarSign, Users,
  Droplets, Truck, Thermometer, FlaskConical, Scale,
  ArrowUpDown, ArrowUp, ArrowDown, Activity, BarChart3,
  Calculator, Minus
} from 'lucide-react'
import { useFabrica } from '@/contexts/FabricaContext'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ComposedChart, Bar
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

function getWednesdayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const daysFromWed = day < 3 ? day + 4 : day - 3
  const wed = new Date(d)
  wed.setDate(d.getDate() - daysFromWed)
  return `${wed.getFullYear()}-${String(wed.getMonth() + 1).padStart(2, '0')}-${String(wed.getDate()).padStart(2, '0')}`
}

function getCurrentWednesday(): string {
  const now = new Date()
  const day = now.getDay()
  const daysFromWed = day < 3 ? day + 4 : day - 3
  const wed = new Date(now)
  wed.setDate(now.getDate() - daysFromWed)
  return `${wed.getFullYear()}-${String(wed.getMonth() + 1).padStart(2, '0')}-${String(wed.getDate()).padStart(2, '0')}`
}

function fmtUSD(n: number): string {
  return `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtBs(n: number): string {
  return `Bs ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtLts(n: number): string {
  return `${Math.round(n).toLocaleString('es-VE')} L`
}

// ─── Tarjeta KPI base ──────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, gradient, iconBg, accent
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  gradient: string
  iconBg: string
  accent: string
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 relative overflow-hidden group hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5`}>
      <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${gradient} opacity-[0.07] rounded-bl-full -mr-12 -mt-12 transition-transform group-hover:scale-110`} />
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${iconBg} text-white shadow-sm`}>
          <Icon size={16} />
        </div>
        {accent && <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${accent}`}>{sub}</span>}
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl sm:text-3xl font-black text-slate-800 leading-none">{value}</p>
    </div>
  )
}

// ─── Tarjeta financiera compacta ───────────────────────────────────────────
function FinCard({
  label, value, icon: Icon, color, textColor, bgColor
}: {
  label: string
  value: string
  icon: React.ElementType
  color: string
  textColor: string
  bgColor: string
}) {
  return (
    <div className={`${bgColor} rounded-2xl border p-4 relative overflow-hidden group hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${color} text-white`}>
          <Icon size={14} />
        </div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-xl font-black ${textColor} leading-tight`}>{value}</p>
    </div>
  )
}

// ─── Tarjeta calidad ────────────────────────────────────────────────────────
function QualCard({
  label, value, unit, icon: Icon, colorClass, trend
}: {
  label: string
  value: string
  unit?: string
  icon: React.ElementType
  colorClass: string
  trend?: 'up' | 'down' | 'neutral'
}) {
  const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 relative overflow-hidden group hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
      <div className={`absolute inset-0 bg-gradient-to-br ${colorClass} opacity-[0.04] group-hover:opacity-[0.07] transition-opacity`} />
      <div className="flex items-center justify-between mb-2">
        <Icon size={15} className={`${colorClass.includes('emerald') ? 'text-emerald-500' : colorClass.includes('blue') ? 'text-blue-500' : colorClass.includes('amber') ? 'text-amber-500' : colorClass.includes('purple') ? 'text-purple-500' : colorClass.includes('red') ? 'text-red-500' : colorClass.includes('rose') ? 'text-rose-500' : colorClass.includes('teal') ? 'text-teal-500' : 'text-slate-500'}`} />
        <TrendIcon size={12} className="text-slate-300" />
      </div>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">{label}</p>
      <p className="text-xl font-black text-slate-800 leading-none">
        {value}<span className="text-xs font-semibold text-slate-400 ml-1">{unit}</span>
      </p>
    </div>
  )
}

// ─── Componente principal ───────────────────────────────────────────────────
export default function DashboardPage() {
  const supabase = createClient()
  const { fabricas, selectedFabricaId, selectedFabrica, isAllFabricas } = useFabrica()

  const [isLoading, setIsLoading] = useState(true)
  const [userRole, setUserRole] = useState<'admin' | 'analista'>('analista')
  const [recepciones, setRecepciones] = useState<any[]>([])
  const [camiones, setCamiones] = useState<any[]>([])
  const [tasas, setTasas] = useState<any[]>([])
  const [filtroProveedor, setFiltroProveedor] = useState('Todos')
  const [preciosSemanales, setPreciosSemanales] = useState<any[]>([])
  const [selectedSemanaChart, setSelectedSemanaChart] = useState('')

  const [showQuality, setShowQuality] = useState({
    Grasa: true, Proteina: true, Temperatura: true, Crioscopia: false
  })
  const [showVolPrec, setShowVolPrec] = useState<Record<string, boolean>>({
    Litros: true,
    PrecioLeche: true,
    PrecioFlete: true,
    PrecioTotal: false,
    PrecioTotalBs: false,
  })

  const volPrecSeries = [
    { key: 'Litros', label: 'Litros', color: '#3b82f6' },
    { key: 'PrecioLeche', label: 'Precio Leche $', color: '#10b981' },
    { key: 'PrecioFlete', label: 'Precio Flete $', color: '#f59e0b' },
    { key: 'PrecioTotal', label: 'Precio Total $', color: '#8b5cf6' },
    { key: 'PrecioTotalBs', label: 'Total Bs', color: '#ef4444' },
  ]

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('perfiles_usuarios').select('rol').eq('id', user.id).single()
        setUserRole((profile?.rol as 'admin' | 'analista') || 'analista')
      }
      const [recsRes, camionesRes, tasRes, precsRes] = await Promise.all([
        supabase.from('recepciones_detalle').select(`
          *,
          recepciones_camion ( fecha_ingreso, fabrica_id ),
          ganaderos ( tipo_proveedor, grupo )
        `),
        supabase.from('recepciones_camion').select('id, litros_romana, fabrica_id, fecha_ingreso'),
        supabase.from('tasas_bcv').select('*').order('fecha', { ascending: true }),
        supabase.from('precios_semanales').select('fecha_semana, grupo, precio_leche_usd, precio_flete_usd'),
      ])
      if (recsRes.data) setRecepciones(recsRes.data)
      if (camionesRes.data) setCamiones(camionesRes.data)
      if (tasRes.data) setTasas(tasRes.data)
      if (precsRes.data) setPreciosSemanales(precsRes.data)
      setIsLoading(false)
    }
    fetchData()
  }, [])

  // ── Filtros ────────────────────────────────────────────────────────────────
  const recFiltered = useMemo(() => recepciones.filter(r => {
    if (!isAllFabricas && r.recepciones_camion?.fabrica_id !== selectedFabricaId) return false
    if (filtroProveedor !== 'Todos' && r.ganaderos?.tipo_proveedor !== filtroProveedor) return false
    return true
  }), [recepciones, isAllFabricas, selectedFabricaId, filtroProveedor])

  const recFiltradoFabrica = useMemo(() => recepciones.filter(r =>
    isAllFabricas || r.recepciones_camion?.fabrica_id === selectedFabricaId
  ), [recepciones, isAllFabricas, selectedFabricaId])

  const camionesFiltrados = useMemo(() =>
    isAllFabricas ? camiones : camiones.filter(c => c.fabrica_id === selectedFabricaId),
    [camiones, isAllFabricas, selectedFabricaId]
  )

  // ── Tasas helpers ──────────────────────────────────────────────────────────
  const tasaMap = useMemo(() => new Map(tasas.map(t => [t.fecha, Number(t.tasa)])), [tasas])
  const lastTasa = useMemo(() => tasas.length > 0 ? Number(tasas[tasas.length - 1].tasa) : 40, [tasas])

  // ── KPIs básicos ───────────────────────────────────────────────────────────
  const totalLitros = useMemo(() => recFiltered.reduce((a, c) => a + Number(c.litros_recepcion || 0), 0), [recFiltered])
  const proveedoresActivos = useMemo(() => new Set(recFiltered.map(r => r.ganadero_id)).size, [recFiltered])

  // ── KPIs financieros ───────────────────────────────────────────────────────
  const financials = useMemo(() => {
    let sumLecheUSD = 0, sumFleteUSD = 0
    let sumLecheBs = 0, sumFleteBs = 0
    let sumWeightedTotal = 0, sumLitros = 0
    // Para precio prom ponderado Bs: solo semana en curso, tasa diaria real
    let sumWeightedBsSemana = 0, sumLitrosSemana = 0
    const currentWed = getCurrentWednesday()

    for (const r of recFiltered) {
      const fechaStr = r.recepciones_camion?.fecha_ingreso?.substring(0, 10)
      if (!fechaStr) continue
      const wedStr = getWednesdayOfWeek(fechaStr)
      const grupo = r.ganaderos?.grupo
      const precio = preciosSemanales.find(p => p.fecha_semana === wedStr && p.grupo === grupo)
      const litros = Number(r.litros_a_pagar || r.litros_recepcion || 0)
      const tasa = tasaMap.get(fechaStr) ?? lastTasa
      const precioLeche = Number(precio?.precio_leche_usd || 0)
      const precioFlete = Number(precio?.precio_flete_usd || 0)
      const precioTotal = precioLeche + precioFlete

      sumLecheUSD += litros * precioLeche
      sumFleteUSD += litros * precioFlete
      sumLecheBs += litros * precioLeche * tasa
      sumFleteBs += litros * precioFlete * tasa
      sumWeightedTotal += precioTotal * litros
      sumLitros += litros

      // Precio prom ponderado Bs: acumular solo la semana en curso con tasa diaria
      if (wedStr === currentWed) {
        sumWeightedBsSemana += precioTotal * litros * tasa
        sumLitrosSemana += litros
      }
    }

    const precioPromUSD = sumLitros > 0 ? sumWeightedTotal / sumLitros : 0
    const precioPromBs = sumLitrosSemana > 0 ? sumWeightedBsSemana / sumLitrosSemana : precioPromUSD * lastTasa
    return {
      precioPromUSD,
      precioPromBs,
      totalPagarUSD: sumLecheUSD + sumFleteUSD,
      totalPagarBs: sumLecheBs + sumFleteBs,
      totalLecheUSD: sumLecheUSD,
      totalLecheBs: sumLecheBs,
      totalFleteUSD: sumFleteUSD,
      totalFleteBs: sumFleteBs,
    }
  }, [recFiltered, preciosSemanales, tasaMap, lastTasa])

  // ── KPIs de calidad ────────────────────────────────────────────────────────
  const qualityMetrics = useMemo(() => {
    let sumAcidez = 0, sumTemp = 0, sumGrasa = 0, sumProt = 0, sumPorcAgua = 0, sumLitros = 0
    let totalDescAgua = 0

    for (const r of recFiltered) {
      const litros = Number(r.litros_recepcion || 0)
      sumAcidez += Number(r.acidez || 0) * litros
      sumTemp += Number(r.temperatura || 0) * litros
      sumGrasa += Number(r.grasa || 0) * litros
      sumProt += Number(r.proteina || 0) * litros
      sumPorcAgua += Number(r.porcentaje_agua_desc || 0) * litros
      sumLitros += litros
      totalDescAgua += Number(r.litros_descuento || 0)
    }

    let totalFaltantes = 0, totalSobrantes = 0
    for (const camion of camionesFiltrados) {
      const camRecs = recFiltradoFabrica.filter(r => r.recepcion_id === camion.id)
      const sumRecep = camRecs.reduce((a, c) => a + Number(c.litros_recepcion || 0), 0)
      const romana = Number(camion.litros_romana || 0)
      if (sumRecep > romana) totalFaltantes += sumRecep - romana
      else if (romana > sumRecep && sumRecep > 0) totalSobrantes += romana - sumRecep
    }

    return {
      acidez: sumLitros > 0 ? sumAcidez / sumLitros : 0,
      temp: sumLitros > 0 ? sumTemp / sumLitros : 0,
      grasa: sumLitros > 0 ? sumGrasa / sumLitros : 0,
      proteina: sumLitros > 0 ? sumProt / sumLitros : 0,
      porcAgua: sumLitros > 0 ? sumPorcAgua / sumLitros : 0,
      totalDescAgua,
      totalFaltantes,
      totalSobrantes,
      diferencias: totalSobrantes - totalFaltantes,
    }
  }, [recFiltered, recFiltradoFabrica, camionesFiltrados])

  // ── Datos gráfico de área semanal ──────────────────────────────────────────
  const diasSemana = ['Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Lunes', 'Martes']
  const mapDiasNat = [3, 4, 5, 6, 0, 1, 2]

  const litrosSemanaData = useMemo(() => diasSemana.map((dia, index) => {
    const natIndex = mapDiasNat[index]
    const sum = recFiltered
      .filter(r => new Date(r.recepciones_camion?.fecha_ingreso).getDay() === natIndex)
      .reduce((a, c) => a + Number(c.litros_recepcion || 0), 0)
    return { name: dia, Litros: sum }
  }), [recFiltered])

  // ── Tortas ─────────────────────────────────────────────────────────────────
  const propiosLts = useMemo(() => recFiltered.filter(r => r.ganaderos?.tipo_proveedor === 'PROPIO').reduce((a, c) => a + Number(c.litros_recepcion || 0), 0), [recFiltered])
  const tercerosLts = useMemo(() => recFiltered.filter(r => r.ganaderos?.tipo_proveedor === 'TERCERO').reduce((a, c) => a + Number(c.litros_recepcion || 0), 0), [recFiltered])
  const pie1Data = [{ name: 'Propios', value: propiosLts || 0 }, { name: 'Terceros', value: tercerosLts || 0 }]
  const pie2Data = useMemo(() => fabricas.map(f => ({
    name: `${f.codigo} · ${f.nombre}`,
    value: camionesFiltrados.filter(c => c.fabrica_id === f.id).reduce((a, c) => a + Number(c.litros_romana || 0), 0)
  })).filter(d => d.value > 0), [fabricas, camionesFiltrados])

  // ── Calidad diaria ─────────────────────────────────────────────────────────
  const calidadData = useMemo(() => diasSemana.map((dia, index) => {
    const natIndex = mapDiasNat[index]
    const dayRecords = recFiltered.filter(r => new Date(r.recepciones_camion?.fecha_ingreso).getDay() === natIndex)
    if (dayRecords.length === 0) return { name: dia, Temperatura: null, Grasa: null, Proteina: null, Crioscopia: null }
    const n = dayRecords.length
    return {
      name: dia,
      Temperatura: (dayRecords.reduce((a, c) => a + Number(c.temperatura || 0), 0) / n).toFixed(2),
      Grasa: (dayRecords.reduce((a, c) => a + Number(c.grasa || 0), 0) / n).toFixed(2),
      Proteina: (dayRecords.reduce((a, c) => a + Number(c.proteina || 0), 0) / n).toFixed(2),
      Crioscopia: (dayRecords.reduce((a, c) => a + Number(c.crioscopia || 0), 0) / n).toFixed(3),
    }
  }), [recFiltered])

  // ── Fluctuación BCV por semana ganadera ───────────────────────────────────
  const bcvSemanalData = useMemo(() => {
    const byWeek = new Map<string, { sum: number, count: number, min: number, max: number }>()
    for (const t of tasas) {
      const wedStr = getWednesdayOfWeek(t.fecha)
      const entry = byWeek.get(wedStr) || { sum: 0, count: 0, min: Infinity, max: -Infinity }
      const v = Number(t.tasa)
      entry.sum += v
      entry.count += 1
      entry.min = Math.min(entry.min, v)
      entry.max = Math.max(entry.max, v)
      byWeek.set(wedStr, entry)
    }
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wedStr, { sum, count, min, max }]) => {
        const wed = new Date(wedStr + 'T12:00:00')
        const tue = new Date(wed); tue.setDate(wed.getDate() + 6)
        const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
        return {
          name: fmt(wed),
          label: `${fmt(wed)} – ${fmt(tue)}/${tue.getFullYear()}`,
          Promedio: Number((sum / count).toFixed(3)),
          Mínima: Number(min.toFixed(3)),
          Máxima: Number(max.toFixed(3)),
        }
      })
  }, [tasas])

  // ── Semanas disponibles ────────────────────────────────────────────────────
  const semanasDisponibles = useMemo(() => {
    const fromTasas = tasas
      .filter(t => ['miercoles', 'Miércoles', 'miércoles', 'Miercoles'].includes(t.dia))
      .map(t => t.fecha)
    const fromPrecios = preciosSemanales.map(p => p.fecha_semana)
    return [...new Set([...fromTasas, ...fromPrecios])].sort((a, b) => b.localeCompare(a))
  }, [tasas, preciosSemanales])

  useEffect(() => {
    if (semanasDisponibles.length > 0 && !selectedSemanaChart) {
      const now = new Date()
      const day = now.getDay()
      const diff = (day < 3 ? 7 : 0) + day - 3
      const wed = new Date(now)
      wed.setDate(now.getDate() - diff)
      const wedStr = `${wed.getFullYear()}-${String(wed.getMonth() + 1).padStart(2, '0')}-${String(wed.getDate()).padStart(2, '0')}`
      setSelectedSemanaChart(semanasDisponibles.find(d => d === wedStr) || semanasDisponibles[0])
    }
  }, [semanasDisponibles])

  // ── Volumen vs Precios mejorado ────────────────────────────────────────────
  const volPrecData = useMemo(() => {
    const empty = diasSemana.map(dia => ({ name: dia, Litros: 0, PrecioLeche: 0, PrecioFlete: 0, PrecioTotal: 0, PrecioTotalBs: 0 }))
    if (!selectedSemanaChart) return empty

    const wedObj = new Date(selectedSemanaChart + 'T12:00:00')
    const weekDates = diasSemana.map((_, i) => {
      const d = new Date(wedObj)
      d.setDate(wedObj.getDate() + i)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })

    const preciosSemana = preciosSemanales.filter(p => p.fecha_semana === selectedSemanaChart)

    return diasSemana.map((dia, index) => {
      const dayDate = weekDates[index]
      const dayRecs = recFiltered.filter(r => r.recepciones_camion?.fecha_ingreso?.substring(0, 10) === dayDate)
      const totalLts = dayRecs.reduce((a, c) => a + Number(c.litros_recepcion || 0), 0)
      const tasaForDay = tasaMap.get(dayDate) ?? lastTasa

      let precioLecheUSD = 0, precioFleteUSD = 0
      if (dayRecs.length > 0 && preciosSemana.length > 0) {
        let sumLeche = 0, sumFlete = 0, sumLits = 0
        for (const r of dayRecs) {
          const grupo = r.ganaderos?.grupo
          const ps = preciosSemana.find(p => p.grupo === grupo)
          const litros = Number(r.litros_recepcion || 0)
          sumLeche += (ps ? Number(ps.precio_leche_usd) : 0) * litros
          sumFlete += (ps ? Number(ps.precio_flete_usd) : 0) * litros
          sumLits += litros
        }
        if (sumLits > 0) {
          precioLecheUSD = sumLeche / sumLits
          precioFleteUSD = sumFlete / sumLits
        }
      }

      const precioTotalUSD = precioLecheUSD + precioFleteUSD
      return {
        name: dia,
        Litros: totalLts,
        PrecioLeche: Number(precioLecheUSD.toFixed(4)),
        PrecioFlete: Number(precioFleteUSD.toFixed(4)),
        PrecioTotal: Number(precioTotalUSD.toFixed(4)),
        PrecioTotalBs: Number((precioTotalUSD * tasaForDay).toFixed(2)),
      }
    })
  }, [selectedSemanaChart, recFiltered, preciosSemanales, tasaMap, lastTasa])

  // ── Helpers de formato ─────────────────────────────────────────────────────
  function formatDateString(dateStr: string) {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr
  }
  function formatSemanaLabel(wedStr: string) {
    const wed = new Date(wedStr + 'T12:00:00')
    const tue = new Date(wed); tue.setDate(wed.getDate() + 6)
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    return `${fmt(wed)} - ${fmt(tue)}`
  }

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <Loader2 className="animate-spin text-blue-500 w-12 h-12" />
      <p className="text-slate-400 font-semibold">Cargando dashboard...</p>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 fade-in pb-24">

      {/* ── HEADER ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl text-white shadow-md shadow-blue-500/30">
            <BarChart3 size={22} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Dashboard Ejecutivo</h1>
            <p className="text-slate-400 text-sm font-medium">Análisis en tiempo real · {isAllFabricas ? 'Todas las fábricas' : selectedFabrica?.nombre}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-black text-blue-700">
              {isAllFabricas ? 'Todas las fábricas' : `${selectedFabrica?.codigo} · ${selectedFabrica?.nombre}`}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
            <Filter size={14} className="text-slate-400" />
            <select
              value={filtroProveedor}
              onChange={e => setFiltroProveedor(e.target.value)}
              className="bg-transparent border-none text-slate-700 text-sm focus:ring-0 font-semibold cursor-pointer"
            >
              <option value="Todos">Todos los Proveedores</option>
              <option value="PROPIO">Solo Propios</option>
              <option value="TERCERO">Solo Terceros</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── KPIs PRINCIPALES (4 tarjetas) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Volumen Total" value={fmtLts(totalLitros)}
          icon={Droplets} gradient="from-blue-500 to-cyan-400"
          iconBg="from-blue-500 to-cyan-400" accent="bg-blue-100 text-blue-700"
          sub="litros"
        />
        <KpiCard
          label="Proveedores Activos" value={String(proveedoresActivos)}
          icon={Users} gradient="from-indigo-500 to-purple-400"
          iconBg="from-indigo-500 to-purple-400" accent="bg-indigo-100 text-indigo-700"
          sub="proveedores"
        />
        <KpiCard
          label="Precio Prom. Pond." value={`$${financials.precioPromUSD.toFixed(3)}`}
          icon={DollarSign} gradient="from-teal-500 to-emerald-400"
          iconBg="from-teal-500 to-emerald-400" accent="bg-teal-100 text-teal-700"
          sub="por litro"
        />
        <KpiCard
          label="Precio Prom. en Bs" value={`${financials.precioPromBs.toFixed(3)} Bs`}
          icon={TrendingUp} gradient="from-violet-500 to-purple-400"
          iconBg="from-violet-500 to-purple-400" accent="bg-violet-100 text-violet-700"
          sub="por litro"
        />
      </div>

      {/* ── RESUMEN FINANCIERO ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calculator size={18} className="text-emerald-600" />
          <h2 className="font-black text-slate-700 text-base uppercase tracking-wide">Resumen Financiero</h2>
          <span className="ml-auto text-xs text-slate-400 font-semibold">Tasa BCV: {lastTasa.toFixed(2)} Bs/$</span>
        </div>

        {/* Totales generales */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-4 text-white shadow-lg shadow-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="opacity-80" />
              <span className="text-xs font-bold opacity-80 uppercase tracking-wider">Total a Pagar USD</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black">{fmtUSD(financials.totalPagarUSD)}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-4 text-white shadow-lg shadow-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="opacity-80" />
              <span className="text-xs font-bold opacity-80 uppercase tracking-wider">Total a Pagar Bs</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black">{fmtBs(financials.totalPagarBs)}</p>
          </div>
        </div>

        {/* Desglose Leche y Flete */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <FinCard label="Leche USD" value={fmtUSD(financials.totalLecheUSD)} icon={Droplets}
            color="bg-blue-500" textColor="text-blue-700" bgColor="bg-blue-50 border-blue-200" />
          <FinCard label="Leche Bs" value={fmtBs(financials.totalLecheBs)} icon={Droplets}
            color="bg-sky-500" textColor="text-sky-700" bgColor="bg-sky-50 border-sky-200" />
          <FinCard label="Flete USD" value={fmtUSD(financials.totalFleteUSD)} icon={Truck}
            color="bg-orange-500" textColor="text-orange-700" bgColor="bg-orange-50 border-orange-200" />
          <FinCard label="Flete Bs" value={fmtBs(financials.totalFleteBs)} icon={Truck}
            color="bg-amber-500" textColor="text-amber-700" bgColor="bg-amber-50 border-amber-200" />
        </div>
      </div>

      {/* ── GRÁFICO VOLUMEN SEMANAL ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h3 className="font-bold text-slate-700 mb-6 text-base sm:text-lg flex items-center gap-2">
          <Activity size={18} className="text-blue-500" />
          Volumen Semanal de Leche (Miércoles a Martes)
        </h3>
        <div className="h-64 sm:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={litrosSemanaData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorLitros" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.15)' }} />
              <Area type="monotone" dataKey="Litros" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorLitros)" activeDot={{ r: 8, fill: '#3b82f6' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── TORTAS + BCV ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-700 text-center text-sm uppercase tracking-widest mb-2 text-slate-500">Por Proveedor</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie1Data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={5} dataKey="value">
                  {pie1Data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString('es-VE')} L`, '']} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-700 text-center text-sm uppercase tracking-widest mb-2 text-slate-500">Por Fábrica</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie2Data} cx="50%" cy="50%" innerRadius={0} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pie2Data.map((_, index) => <Cell key={index} fill={COLORS[(index + 2) % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString('es-VE')} L`, '']} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-700 mb-1 text-sm uppercase tracking-widest text-center text-slate-500">Fluctuación Tasa BCV</h3>
          <p className="text-center text-[10px] text-slate-400 font-semibold mb-3">Promedio por semana ganadera</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bcvSemanalData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                  interval={Math.max(0, Math.floor(bcvSemanalData.length / 5) - 1)}
                  angle={-35}
                  textAnchor="end"
                />
                <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9 }} width={45} tickFormatter={(v: number) => v.toFixed(0)} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #fde68a', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.15)', fontSize: 11 }}
                  formatter={(value: any, name: any) => [`${Number(value).toFixed(3)} Bs/$`, name]}
                  labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.label || ''}
                />
                <Line type="monotone" dataKey="Promedio" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 7, fill: '#d97706' }} />
                <Line type="monotone" dataKey="Máxima" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="Mínima" stroke="#10b981" strokeWidth={1} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-1">
            <span className="flex items-center gap-1 text-[9px] font-bold text-amber-500"><span className="w-3 h-0.5 bg-amber-400 inline-block rounded"/>Prom</span>
            <span className="flex items-center gap-1 text-[9px] font-bold text-red-400"><span className="w-3 h-0.5 bg-red-400 inline-block rounded"/>Máx</span>
            <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-500"><span className="w-3 h-0.5 bg-emerald-400 inline-block rounded"/>Mín</span>
            <span className="text-[9px] font-black text-slate-500">Última: <span className="text-amber-600">{lastTasa.toFixed(3)} Bs/$</span></span>
          </div>
        </div>
      </div>

      {/* ── CALIDAD INTERACTIVA ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
          <h3 className="font-bold text-slate-700 text-base sm:text-lg flex items-center gap-2">
            <FlaskConical size={18} className="text-emerald-500" />
            Parámetros de Calidad (Tendencia Semanal)
          </h3>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(showQuality) as Array<keyof typeof showQuality>).map(k => {
              const colors: Record<string, string> = {
                Grasa: 'border-emerald-500 bg-emerald-500',
                Proteina: 'border-purple-500 bg-purple-500',
                Temperatura: 'border-red-500 bg-red-500',
                Crioscopia: 'border-blue-500 bg-blue-500',
              }
              return (
                <button
                  key={k}
                  onClick={() => setShowQuality(prev => ({ ...prev, [k]: !prev[k] }))}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full border-2 transition-all ${showQuality[k] ? `${colors[k]} text-white` : 'bg-white text-slate-400 border-slate-300'}`}
                >
                  {k === 'Crioscopia' ? 'Crioscopía' : k}
                </button>
              )
            })}
          </div>
        </div>
        <div className="h-64 sm:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={calidadData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.15)' }} />
              {showQuality.Grasa && <Line type="monotone" dataKey="Grasa" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 7 }} connectNulls />}
              {showQuality.Proteina && <Line type="monotone" dataKey="Proteina" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 7 }} connectNulls />}
              {showQuality.Temperatura && <Line type="monotone" dataKey="Temperatura" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 7 }} connectNulls />}
              {showQuality.Crioscopia && <Line type="monotone" dataKey="Crioscopia" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 7 }} connectNulls />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── VOLUMEN vs PRECIOS (solo admin) ── */}
      {userRole === 'admin' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 ring-2 ring-indigo-100">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
            <div>
              <h3 className="font-bold text-slate-700 text-base sm:text-lg flex items-center gap-2">
                <DollarSign size={18} className="text-indigo-500" />
                Volúmenes Recolectados vs Precios Base
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Promedio ponderado diario por grupo de precio</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                <Filter size={13} className="text-slate-400" />
                <select
                  value={selectedSemanaChart}
                  onChange={e => setSelectedSemanaChart(e.target.value)}
                  className="bg-transparent border-none text-slate-700 text-xs focus:ring-0 font-semibold cursor-pointer"
                >
                  {semanasDisponibles.length === 0 && <option value="">Sin semanas</option>}
                  {semanasDisponibles.map(s => (
                    <option key={s} value={s}>Sem. {formatSemanaLabel(s)}</option>
                  ))}
                </select>
              </div>
              {volPrecSeries.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => setShowVolPrec(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full border-2 transition-all ${showVolPrec[key] ? 'text-white' : 'bg-white text-slate-400 border-slate-300'}`}
                  style={showVolPrec[key] ? { backgroundColor: color, borderColor: color } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-72 sm:h-96 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={volPrecData} margin={{ top: 20, right: 30, bottom: 10, left: 10 }}>
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fill: '#3b82f6', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 20px 40px -10px rgb(0 0 0 / 0.15)', padding: '10px 14px' }}
                  formatter={(value: any, name: any) => {
                    const s = volPrecSeries.find((x: any) => x.key === name)
                    if (name === 'Litros') return [`${Number(value).toLocaleString('es-VE')} L`, 'Litros']
                    if (name === 'PrecioTotalBs') return [`${Number(value).toFixed(3)} Bs/L`, 'Total Bs/L']
                    return [`$${Number(value).toFixed(3)}/L`, s?.label || name]
                  }}
                />
                {showVolPrec.Litros && <Bar yAxisId="left" dataKey="Litros" fill="url(#barGrad)" radius={[6, 6, 0, 0]} maxBarSize={40} />}
                {showVolPrec.PrecioLeche && <Line yAxisId="right" type="monotone" dataKey="PrecioLeche" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 7 }} connectNulls />}
                {showVolPrec.PrecioFlete && <Line yAxisId="right" type="monotone" dataKey="PrecioFlete" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} activeDot={{ r: 7 }} connectNulls />}
                {showVolPrec.PrecioTotal && <Line yAxisId="right" type="monotone" dataKey="PrecioTotal" stroke="#8b5cf6" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 4, fill: '#8b5cf6' }} activeDot={{ r: 7 }} connectNulls />}
                {showVolPrec.PrecioTotalBs && <Line yAxisId="right" type="monotone" dataKey="PrecioTotalBs" stroke="#ef4444" strokeWidth={2.5} strokeDasharray="4 2" dot={{ r: 4, fill: '#ef4444' }} activeDot={{ r: 7 }} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Leyenda de colores */}
          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-100">
            {volPrecSeries.map(({ key, label, color }) => showVolPrec[key] && (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs text-slate-500 font-semibold">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PARÁMETROS DE CALIDAD (tarjetas) ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full">
            <Scale size={14} className="text-slate-500" />
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Parámetros de Calidad</span>
          </div>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Promedios ponderados */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <QualCard
            label="Acidez Prom. Pond." value={qualityMetrics.acidez.toFixed(1)} unit="°D"
            icon={FlaskConical} colorClass="from-emerald-500 to-teal-400" trend="neutral"
          />
          <QualCard
            label="Temperatura Prom." value={qualityMetrics.temp.toFixed(1)} unit="°C"
            icon={Thermometer} colorClass="from-blue-500 to-cyan-400" trend="neutral"
          />
          <QualCard
            label="Grasa Prom. Pond." value={qualityMetrics.grasa.toFixed(2)} unit="%"
            icon={Droplets} colorClass="from-amber-500 to-yellow-400" trend="neutral"
          />
          <QualCard
            label="Proteína Prom. Pond." value={qualityMetrics.proteina.toFixed(2)} unit="%"
            icon={Scale} colorClass="from-purple-500 to-violet-400" trend="neutral"
          />
          <QualCard
            label="% Agua Promedio" value={qualityMetrics.porcAgua.toFixed(2)} unit="%"
            icon={Droplets} colorClass="from-sky-500 to-blue-400" trend="neutral"
          />
        </div>

        {/* Totales de agua y diferencias */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4 relative overflow-hidden group hover:shadow-lg transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-rose-400 opacity-[0.04]" />
            <div className="flex items-center gap-2 mb-2">
              <ArrowDown size={15} className="text-red-500" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desc. Agua Aplicado</p>
            </div>
            <p className="text-2xl font-black text-red-600">{Math.round(qualityMetrics.totalDescAgua).toLocaleString('es-VE')}</p>
            <p className="text-xs text-red-400 font-semibold mt-0.5">litros descontados</p>
          </div>

          <div className="bg-white rounded-2xl border border-rose-200 shadow-sm p-4 relative overflow-hidden group hover:shadow-lg transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500 to-pink-400 opacity-[0.04]" />
            <div className="flex items-center gap-2 mb-2">
              <ArrowDown size={15} className="text-rose-500" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Litros Faltantes</p>
            </div>
            <p className="text-2xl font-black text-rose-600">{Math.round(qualityMetrics.totalFaltantes).toLocaleString('es-VE')}</p>
            <p className="text-xs text-rose-400 font-semibold mt-0.5">declarados &gt; romana</p>
          </div>

          <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4 relative overflow-hidden group hover:shadow-lg transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-green-400 opacity-[0.04]" />
            <div className="flex items-center gap-2 mb-2">
              <ArrowUp size={15} className="text-emerald-500" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Litros Sobrantes</p>
            </div>
            <p className="text-2xl font-black text-emerald-600">{Math.round(qualityMetrics.totalSobrantes).toLocaleString('es-VE')}</p>
            <p className="text-xs text-emerald-400 font-semibold mt-0.5">romana &gt; declarados</p>
          </div>

          <div className={`bg-white rounded-2xl border shadow-sm p-4 relative overflow-hidden group hover:shadow-lg transition-all ${qualityMetrics.diferencias >= 0 ? 'border-emerald-200' : 'border-rose-200'}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${qualityMetrics.diferencias >= 0 ? 'from-emerald-500 to-green-400' : 'from-rose-500 to-pink-400'} opacity-[0.04]`} />
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpDown size={15} className={qualityMetrics.diferencias >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Diferencias</p>
            </div>
            <p className={`text-2xl font-black ${qualityMetrics.diferencias >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {qualityMetrics.diferencias >= 0 ? '+' : ''}{Math.round(qualityMetrics.diferencias).toLocaleString('es-VE')}
            </p>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">sobrantes − faltantes</p>
          </div>
        </div>
      </div>

    </div>
  )
}
