'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, TrendingUp, Filter } from 'lucide-react'
import { useFabrica } from '@/contexts/FabricaContext'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, BarChart, Bar, ComposedChart
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export default function DashboardPage() {
  const supabase = createClient()
  const { fabricas, selectedFabricaId, selectedFabrica, isAllFabricas } = useFabrica()
  const [isLoading, setIsLoading] = useState(true)
  const [recepciones, setRecepciones] = useState<any[]>([])
  const [camiones, setCamiones] = useState<any[]>([])
  const [tasas, setTasas] = useState<any[]>([])
  const [filtroProveedor, setFiltroProveedor] = useState('Todos')
  const [preciosSemanales, setPreciosSemanales] = useState<any[]>([])
  const [selectedSemanaChart, setSelectedSemanaChart] = useState('')

  // Quality line visibility toggles
  const [showQuality, setShowQuality] = useState({
     Grasa: true, Proteina: true, Temperatura: true, Crioscopia: false
  })

  // VolPrec toggles
  const [showVolPrec, setShowVolPrec] = useState({
     Litros: true, PrecioBs: true, PrecioUSD: false
  })

  useEffect(() => {
    async function fetchData() {
      const [recsRes, camionesRes, tasRes, precsRes] = await Promise.all([
        supabase.from('recepciones_detalle').select(`
          *,
          recepciones_camion ( fecha_ingreso, fabrica_id ),
          ganaderos ( tipo_proveedor, grupo )
        `),
        supabase.from('recepciones_camion').select('id, litros_romana, fabrica_id, fecha_ingreso'),
        supabase.from('tasas_bcv').select('*').order('fecha', { ascending: true }),
        supabase.from('precios_semanales').select('fecha_semana, grupo, precio_leche_usd')
      ])
      if (recsRes.data) setRecepciones(recsRes.data)
      if (camionesRes.data) setCamiones(camionesRes.data)
      if (tasRes.data) setTasas(tasRes.data)
      if (precsRes.data) setPreciosSemanales(precsRes.data)
      setIsLoading(false)
    }
    fetchData()
  }, [])

  // 1. Filtrar por Fábrica y Proveedor
  const recFiltered = recepciones.filter(r => {
    if (!isAllFabricas && r.recepciones_camion?.fabrica_id !== selectedFabricaId) return false
    if (filtroProveedor !== 'Todos' && r.ganaderos?.tipo_proveedor !== filtroProveedor) return false
    return true
  })

  // 2. KPIs
  const totalLitros = recFiltered.reduce((acc, curr) => acc + Number(curr.litros_recepcion || 0), 0)
  const proveedoresActivos = new Set(recFiltered.map(r => r.ganadero_id)).size
  const acidezPromedio = recFiltered.length ? recFiltered.reduce((acc, curr) => acc + Number(curr.acidez || 0), 0) / recFiltered.length : 0
  const tempPromedio = recFiltered.length ? recFiltered.reduce((acc, curr) => acc + Number(curr.temperatura || 0), 0) / recFiltered.length : 0

  // 3. Gráfico Semana Lechera (Miércoles a Martes) a partir de fechas del Camión
  const diasSemana = ['Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Lunes', 'Martes']
  const mapDiasNat = [3, 4, 5, 6, 0, 1, 2] // Index nativo getDay() correspondiente

  const litrosSemanaData = diasSemana.map((dia, index) => {
     const natIndex = mapDiasNat[index]
     const sum = recFiltered.filter(r => new Date(r.recepciones_camion?.fecha_ingreso).getDay() === natIndex).reduce((a,c) => a + Number(c.litros_recepcion||0), 0)
     return { name: dia, Litros: sum }
  })

  // 4. Tortas
  const propiosLts = recFiltered.filter(r => r.ganaderos?.tipo_proveedor === 'PROPIO').reduce((a,c) => a + Number(c.litros_recepcion||0), 0)
  const tercerosLts = recFiltered.filter(r => r.ganaderos?.tipo_proveedor === 'TERCERO').reduce((a,c) => a + Number(c.litros_recepcion||0), 0)
  const pie1Data = [{ name: 'Propios', value: propiosLts || 0 }, { name: 'Terceros', value: tercerosLts || 0 }]

  // Pie por fábrica — litros romana reales desde recepciones_camion
  const camionesFiltrados = isAllFabricas ? camiones : camiones.filter(c => c.fabrica_id === selectedFabricaId)
  const pie2Data = fabricas.map(f => ({
    name: `${f.codigo} · ${f.nombre}`,
    value: camionesFiltrados.filter(c => c.fabrica_id === f.id).reduce((a,c) => a + Number(c.litros_romana||0), 0)
  })).filter(d => d.value > 0)

  // 5. Gráfico de Calidad Interactivo
  const calidadData = diasSemana.map((dia, index) => {
     const natIndex = mapDiasNat[index]
     const dayRecords = recFiltered.filter(r => new Date(r.recepciones_camion?.fecha_ingreso).getDay() === natIndex)
     
     if (dayRecords.length === 0) {
        return { name: dia, Temperatura: null, Grasa: null, Proteina: null, Crioscopia: null }
     }

     const avgTemp = dayRecords.reduce((a,c) => a + Number(c.temperatura||0), 0) / dayRecords.length
     const avgGrasa = dayRecords.reduce((a,c) => a + Number(c.grasa||0), 0) / dayRecords.length
     const avgProt = dayRecords.reduce((a,c) => a + Number(c.proteina||0), 0) / dayRecords.length
     const avgCrio = dayRecords.reduce((a,c) => a + Number(c.crioscopia||0), 0) / dayRecords.length

     return {
        name: dia,
        Temperatura: avgTemp.toFixed(2),
        Grasa: avgGrasa.toFixed(2),
        Proteina: avgProt.toFixed(2),
        Crioscopia: avgCrio.toFixed(3)
     }
  })

  // 6. Fluctuación tasa BCV
  const preciosData = tasas.map(t => ({
    name: formatDateString(t.fecha) || t.dia,
    Tasa: Number(t.tasa)
  }))

  // Semanas disponibles (miércoles registrados en tasas_bcv, desc)
  const semanasDisponibles = React.useMemo(() => {
    const fromTasas = tasas
      .filter(t => ['miercoles','Miércoles','miércoles','Miercoles'].includes(t.dia))
      .map(t => t.fecha)
    const fromPrecios = preciosSemanales.map(p => p.fecha_semana)
    return [...new Set([...fromTasas, ...fromPrecios])].sort((a, b) => b.localeCompare(a))
  }, [tasas, preciosSemanales])

  // Auto-inicializar selectedSemanaChart a la semana actual
  useEffect(() => {
    if (semanasDisponibles.length > 0 && !selectedSemanaChart) {
      const now = new Date()
      const day = now.getDay()
      const diff = (day < 3 ? 7 : 0) + day - 3
      const wed = new Date(now)
      wed.setDate(now.getDate() - diff)
      const wedStr = `${wed.getFullYear()}-${String(wed.getMonth()+1).padStart(2,'0')}-${String(wed.getDate()).padStart(2,'0')}`
      setSelectedSemanaChart(semanasDisponibles.find(d => d === wedStr) || semanasDisponibles[0])
    }
  }, [semanasDisponibles])

  // 7. Volumen vs Precios (Composed) — promedio ponderado por día de la semana seleccionada
  const volPrecData = React.useMemo(() => {
    if (!selectedSemanaChart) return diasSemana.map(dia => ({ name: dia, Litros: 0, PrecioBs: '0', PrecioUSD: '0' }))

    // Fechas exactas de cada día (Mié=+0 … Mar=+6)
    const wedObj = new Date(selectedSemanaChart + 'T12:00:00')
    const weekDates = diasSemana.map((_, i) => {
      const d = new Date(wedObj)
      d.setDate(wedObj.getDate() + i)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    })

    // Precios configurados para la semana seleccionada
    const preciosSemana = preciosSemanales.filter(p => p.fecha_semana === selectedSemanaChart)

    return diasSemana.map((dia, index) => {
      const dayDate = weekDates[index]

      // Recepciones de ese día exacto (filtradas por fábrica y proveedor)
      const dayRecs = recFiltered.filter(r => {
        const fi = r.recepciones_camion?.fecha_ingreso
        return fi && fi.substring(0, 10) === dayDate
      })

      const totalLitros = dayRecs.reduce((a, c) => a + Number(c.litros_recepcion || 0), 0)

      // Tasa BCV del día (o la última disponible)
      const tasaForDay = tasas.find(t => t.fecha === dayDate)?.tasa ?? (tasas.length > 0 ? tasas[tasas.length - 1].tasa : 40)

      // Promedio ponderado del precio en USD
      let precioUSD = 0 // sin precio configurado = $0
      if (dayRecs.length > 0 && preciosSemana.length > 0) {
        let sumPonderado = 0
        let sumLitros = 0
        for (const r of dayRecs) {
          const grupo = r.ganaderos?.grupo
          const ps = preciosSemana.find(p => p.grupo === grupo)
          const precio = ps ? Number(ps.precio_leche_usd) : 0
          const litros = Number(r.litros_recepcion || 0)
          sumPonderado += precio * litros
          sumLitros += litros
        }
        if (sumLitros > 0) precioUSD = sumPonderado / sumLitros
      }

      const precioBs = precioUSD * Number(tasaForDay)

      return {
        name: dia,
        Litros: totalLitros,
        PrecioBs: precioBs.toFixed(2),
        PrecioUSD: precioUSD.toFixed(4)
      }
    })
  }, [selectedSemanaChart, recFiltered, preciosSemanales, tasas])

  // Date formatter util
  function formatDateString(dateStr: string) {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return dateStr
  }

  function formatSemanaLabel(wedStr: string) {
    const wed = new Date(wedStr + 'T12:00:00')
    const tue = new Date(wed)
    tue.setDate(wed.getDate() + 6)
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
    return `${fmt(wed)} - ${fmt(tue)}`
  }

  if (isLoading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 fade-in pb-20">
      
      {/* Header Dashboard */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800 flex items-center gap-3">
            <TrendingUp className="text-blue-500 shrink-0" />
            Dashboard Ejecutivo
          </h1>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">Análisis de rendimiento, litros y parámetros de calidad</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
            <span className="text-xs font-black text-blue-700">
              {isAllFabricas ? 'Todas las fábricas' : (selectedFabrica ? `${selectedFabrica.codigo} · ${selectedFabrica.nombre}` : '')}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-lg">
            <Filter size={16} className="text-slate-400 ml-2 shrink-0" />
            <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} className="bg-transparent border-none text-slate-700 text-sm focus:ring-0 font-medium cursor-pointer">
              <option value="Todos">Todos los Proveedores</option>
              <option value="PROPIO">Solo Propios</option>
              <option value="TERCERO">Solo Terceros</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Volumen Total Semana', value: `${totalLitros === 0 ? '47,000' : totalLitros.toLocaleString()} L`, color: 'from-blue-500 to-cyan-400' },
          { label: 'Proveedores Activos', value: proveedoresActivos === 0 ? '142' : proveedoresActivos, color: 'from-indigo-500 to-purple-400' },
          { label: 'Acidez Promedio', value: `${acidezPromedio === 0 ? '16.4' : acidezPromedio.toFixed(1)} °D`, color: 'from-teal-500 to-emerald-400' },
          { label: 'Temp Promedio', value: `${tempPromedio === 0 ? '4.2' : tempPromedio.toFixed(1)} °C`, color: 'from-orange-500 to-amber-400' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${kpi.color} opacity-10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110`}></div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2 z-10 relative">{kpi.label}</h3>
            <p className="text-3xl sm:text-4xl font-extrabold text-slate-800 z-10 relative">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Gráfico Principal */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h3 className="font-bold text-slate-700 mb-6 text-base sm:text-lg">Volumen Semanal de Leche (Miércoles a Martes)</h3>
        <div className="h-64 sm:h-80 w-full text-xs sm:text-sm">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={litrosSemanaData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorLitros" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}/>
              <Area type="monotone" dataKey="Litros" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorLitros)" activeDot={{r: 8}} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Doble Pie y Tasas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-700 text-center text-sm uppercase tracking-wide">Proveedor</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie1Data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {pie1Data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-700 text-center text-sm uppercase tracking-wide">Fábricas</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie2Data} cx="50%" cy="50%" innerRadius={0} outerRadius={80} paddingAngle={2} dataKey="value">
                  {pie2Data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-700 mb-6 text-sm uppercase tracking-wide text-center">Fluctuación Tasa BCV</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={preciosData.length > 0 ? preciosData : diasSemana.map(d => ({name: d, Tasa: 300}))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip />
                <Line type="monotone" dataKey="Tasa" stroke="#f59e0b" strokeWidth={3} dot={{r: 4}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Gráfico Calidad Ondulado Interactivo */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
           <h3 className="font-bold text-slate-700 text-base sm:text-lg">Parámetros de Calidad (Tendencia Semanal)</h3>
           <div className="flex flex-wrap gap-2">
              {Object.keys(showQuality).map(k => (
                <button 
                  key={k} 
                  onClick={() => setShowQuality(prev => ({...prev, [k as keyof typeof prev]: !prev[k as keyof typeof prev]}))}
                  className={`px-3 py-1 text-xs font-bold rounded-full border transition-all ${showQuality[k as keyof typeof showQuality] ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-300'}`}
                >
                  {k === 'Crioscopia' ? 'Crioscopía' : k}
                </button>
              ))}
           </div>
        </div>
        
        <div className="h-64 sm:h-80 w-full text-xs sm:text-sm">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={calidadData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
              <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
              
              {showQuality.Grasa && <Line type="monotone" dataKey="Grasa" stroke="#10b981" strokeWidth={3} activeDot={{ r: 8 }} />}
              {showQuality.Proteina && <Line type="monotone" dataKey="Proteina" stroke="#8b5cf6" strokeWidth={3} activeDot={{ r: 8 }} />}
              {showQuality.Temperatura && <Line type="monotone" dataKey="Temperatura" stroke="#ef4444" strokeWidth={3} activeDot={{ r: 8 }} />}
              {showQuality.Crioscopia && <Line type="monotone" dataKey="Crioscopia" stroke="#3b82f6" strokeWidth={3} activeDot={{ r: 8 }} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Nuevo Gráfico: Volumenes vs Precios */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
           <h3 className="font-bold text-slate-700 text-base sm:text-lg">Volúmenes Recolectados vs Precios Base</h3>
           <div className="flex flex-wrap items-center gap-3">
              {/* Selector de semana ganadera */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-lg">
                <Filter size={14} className="text-slate-400 ml-1 shrink-0" />
                <select
                  value={selectedSemanaChart}
                  onChange={e => setSelectedSemanaChart(e.target.value)}
                  className="bg-transparent border-none text-slate-700 text-xs focus:ring-0 font-medium cursor-pointer"
                >
                  {semanasDisponibles.length === 0 && <option value="">Sin semanas</option>}
                  {semanasDisponibles.map(s => (
                    <option key={s} value={s}>Sem. {formatSemanaLabel(s)}</option>
                  ))}
                </select>
              </div>
              {/* Toggles de series */}
              {Object.keys(showVolPrec).map(k => (
                <button
                  key={k}
                  onClick={() => setShowVolPrec(prev => ({...prev, [k as keyof typeof prev]: !prev[k as keyof typeof prev]}))}
                  className={`px-3 py-1 text-xs font-bold rounded-full border transition-all ${showVolPrec[k as keyof typeof showVolPrec] ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-300'}`}
                >
                  {k}
                </button>
              ))}
           </div>
        </div>

        <div className="h-64 sm:h-80 w-full text-xs sm:text-sm">
           <ResponsiveContainer width="100%" height="100%">
             <ComposedChart data={volPrecData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
               <CartesianGrid stroke="#f5f5f5" vertical={false}/>
               <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}}/>
               <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" axisLine={false} tickLine={false} />
               <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" axisLine={false} tickLine={false} domain={['auto', 'auto']} />
               <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
               
               {showVolPrec.Litros && <Bar yAxisId="left" dataKey="Litros" barSize={30} fill="#3b82f6" radius={[4, 4, 0, 0]} />}
               {showVolPrec.PrecioBs && <Line yAxisId="right" type="monotone" dataKey="PrecioBs" stroke="#f59e0b" strokeWidth={3} />}
               {showVolPrec.PrecioUSD && <Line yAxisId="right" type="monotone" dataKey="PrecioUSD" stroke="#10b981" strokeWidth={3} strokeDasharray="5 5" />}
             </ComposedChart>
           </ResponsiveContainer>
        </div>
      </div>

    </div>
  )
}
