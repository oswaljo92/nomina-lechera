'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { X, Plus, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getCurrentWednesday, formatSemanaGanadera, getSemanaNumero, calcularFactura, fmtBs, fmtNum,
} from '@/lib/facturacion-utils'
import type { Factura, FacturaFormData, TipoFactura, DeduccionCatalogo } from '@/types/facturacion'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  editFactura?: Factura | null
  user: any
  fabricas: { id: string; nombre: string; codigo: string; razon_social?: string; rif?: string; direccion_fiscal?: string }[]
  currentFabricaId: string
}

const EMPTY_FORM: FacturaFormData = {
  fabrica_id: '',
  tipo: 'ganadero',
  ganadero_id: null,
  ruta_id: null,
  tercero_codigo: '',
  tercero_nombre: '',
  tercero_rif: '',
  semana_fecha: '',
  semana_nombre: '',
  fecha_emision: '',
  numero_factura: '',
  tasa_miercoles: 0,
  tasa_factura: 0,
  precio_leche_usd: 0,
  precio_flete_usd: 0,
  litros_a_pagar: 0,
  litros_flete: 0,
  deducciones: [],
  emisor_razon_social: '',
  emisor_rif: '',
  emisor_direccion: '',
  notas: '',
}

export default function FacturaFormModal({
  isOpen, onClose, onSaved, editFactura, user, fabricas, currentFabricaId,
}: Props) {
  const supabase = createClient()
  const [form, setForm] = useState<FacturaFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadingData, setLoadingData] = useState(false)

  // Catálogos
  const [semanas, setSemanas] = useState<{ fecha: string; tasa: number }[]>([])
  const [ganaderos, setGanaderos] = useState<any[]>([])
  const [rutas, setRutas] = useState<any[]>([])
  const [catalogoDeducciones, setCatalogoDeducciones] = useState<DeduccionCatalogo[]>([])
  const [tasaMap, setTasaMap] = useState<Map<string, number>>(new Map())

  // Deducción nueva
  const [newDed, setNewDed] = useState({ codigo: '', nombre: '', monto_bs: '' })
  const [showDedForm, setShowDedForm] = useState(false)

  // Flete manual
  const [tieneFlete, setTieneFlete] = useState(false)

  // Búsqueda de ganadero
  const [searchGanadero, setSearchGanadero] = useState('')
  const [showGanDropdown, setShowGanDropdown] = useState(false)
  const ganSearchRef = useRef<HTMLDivElement>(null)

  // ── Escape key ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Click fuera del dropdown ganadero ────────────────────────────────────
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ganSearchRef.current && !ganSearchRef.current.contains(e.target as Node)) {
        setShowGanDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Cargar catálogos ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    async function loadCatalogos() {
      const fabId = currentFabricaId !== 'all' ? currentFabricaId : (fabricas[0]?.id ?? '')

      const [semanasRes, ganRes, rutaRes, dedRes, tasRes] = await Promise.all([
        supabase.from('tasas_bcv')
          .select('fecha, tasa')
          .in('dia', ['miercoles', 'Miércoles', 'miércoles', 'Miercoles'])
          .order('fecha', { ascending: false }),
        supabase.from('ganaderos')
          .select('id, codigo_ganadero, nombre, rif, cedula, grupo, ruta_id, rutas(id, codigo_ruta, nombre_ruta, rif, cedula)')
          .eq('activo', true)
          .eq('fabrica_id', fabId),
        supabase.from('rutas')
          .select('id, codigo_ruta, nombre_ruta, rif, cedula, grupo')
          .eq('activo', true)
          .eq('fabrica_id', fabId),
        supabase.from('deducciones_catalogo').select('*').eq('activo', true).order('codigo'),
        supabase.from('tasas_bcv').select('fecha, tasa').order('fecha', { ascending: true }),
      ])

      if (semanasRes.data) setSemanas(semanasRes.data)
      if (ganRes.data) setGanaderos(ganRes.data)
      if (rutaRes.data) setRutas(rutaRes.data)
      if (dedRes.data) setCatalogoDeducciones(dedRes.data as DeduccionCatalogo[])
      if (tasRes.data) {
        const map = new Map(tasRes.data.map((t: any) => [t.fecha, Number(t.tasa)]))
        setTasaMap(map)
      }
    }
    loadCatalogos()
  }, [isOpen, currentFabricaId])

  // ── Inicializar form ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return

    if (editFactura) {
      setTieneFlete(editFactura.tipo === 'ganadero_transportista')
      setForm({
        fabrica_id: editFactura.fabrica_id,
        tipo: editFactura.tipo,
        ganadero_id: editFactura.ganadero_id,
        ruta_id: editFactura.ruta_id,
        tercero_codigo: editFactura.tercero_codigo,
        tercero_nombre: editFactura.tercero_nombre,
        tercero_rif: editFactura.tercero_rif ?? '',
        semana_fecha: editFactura.semana_fecha,
        semana_nombre: editFactura.semana_nombre,
        fecha_emision: editFactura.fecha_emision,
        numero_factura: editFactura.numero_factura ?? '',
        tasa_miercoles: editFactura.tasa_miercoles,
        tasa_factura: editFactura.tasa_factura,
        precio_leche_usd: editFactura.precio_leche_usd,
        precio_flete_usd: editFactura.precio_flete_usd ?? 0,
        litros_a_pagar: editFactura.litros_a_pagar,
        litros_flete: editFactura.litros_flete ?? 0,
        deducciones: editFactura.facturas_deducciones ?? [],
        emisor_razon_social: editFactura.emisor_razon_social,
        emisor_rif: editFactura.emisor_rif,
        emisor_direccion: editFactura.emisor_direccion,
        notas: editFactura.notas ?? '',
      })
    } else {
      const fabId = currentFabricaId !== 'all' ? currentFabricaId : (fabricas[0]?.id ?? '')
      const fab = fabricas.find(f => f.id === fabId)
      const today = new Date().toISOString().split('T')[0]
      setTieneFlete(false)
      setSearchGanadero('')
      setForm({
        ...EMPTY_FORM,
        fabrica_id: fabId,
        fecha_emision: today,
        emisor_razon_social: fab?.razon_social ?? '',
        emisor_rif: fab?.rif ?? '',
        emisor_direccion: fab?.direccion_fiscal ?? '',
      })
    }
    setError('')
  }, [isOpen, editFactura])

  // ── Auto-seleccionar semana en curso al crear nuevo ───────────────────────
  useEffect(() => {
    if (!isOpen || editFactura || semanas.length === 0) return
    // Solo si no hay semana seleccionada aún
    setForm(f => {
      if (f.semana_fecha) return f
      const currentWed = getCurrentWednesday()
      const sem = semanas.find(s => s.fecha === currentWed)
      if (!sem) return f
      return {
        ...f,
        semana_fecha: currentWed,
        semana_nombre: formatSemanaGanadera(currentWed),
        tasa_miercoles: Number(sem.tasa),
      }
    })
  }, [isOpen, editFactura, semanas])

  // ── Sincronizar búsqueda al editar ────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !editFactura) return
    if (editFactura.ganadero_id && ganaderos.length > 0) {
      const gan = ganaderos.find(g => g.id === editFactura.ganadero_id)
      if (gan) setSearchGanadero(`${gan.codigo_ganadero} — ${gan.nombre}`)
    } else if (!editFactura.ganadero_id) {
      setSearchGanadero('')
    }
  }, [isOpen, editFactura, ganaderos])

  // ── Cuando cambia fecha_emision → actualizar tasa_factura ─────────────────
  useEffect(() => {
    if (!form.fecha_emision) return
    const tasa = tasaMap.get(form.fecha_emision)
    if (tasa && tasa !== form.tasa_factura) {
      setForm(f => ({ ...f, tasa_factura: tasa }))
    }
  }, [form.fecha_emision, tasaMap])

  // ── Cuando cambia semana → actualizar tasa_miercoles ─────────────────────
  useEffect(() => {
    if (!form.semana_fecha) return
    const sem = semanas.find(s => s.fecha === form.semana_fecha)
    if (sem && sem.tasa !== form.tasa_miercoles) {
      setForm(f => ({
        ...f,
        tasa_miercoles: Number(sem.tasa),
        semana_nombre: formatSemanaGanadera(form.semana_fecha),
      }))
    }
  }, [form.semana_fecha, semanas])

  // ── Ganaderos filtrados (búsqueda) ────────────────────────────────────────
  const filteredGanaderos = useMemo(() => {
    if (!searchGanadero.trim()) return ganaderos.slice(0, 20)
    const q = searchGanadero.toLowerCase()
    return ganaderos.filter(g =>
      g.codigo_ganadero?.toLowerCase().includes(q) ||
      g.nombre?.toLowerCase().includes(q) ||
      g.rif?.toLowerCase().includes(q) ||
      g.cedula?.toLowerCase().includes(q)
    ).slice(0, 15)
  }, [ganaderos, searchGanadero])

  // ── Cargar datos de litros al seleccionar ganadero + semana ──────────────
  const loadGanaderoData = useCallback(async (ganaderoId: string, semanaFecha: string) => {
    if (!ganaderoId || !semanaFecha) return
    setLoadingData(true)

    const gan = ganaderos.find(g => g.id === ganaderoId)
    if (!gan) { setLoadingData(false); return }

    // Dates of semana (Wed – Tue)
    const wedDate = new Date(semanaFecha + 'T12:00:00')
    const tueDate = new Date(wedDate)
    tueDate.setDate(wedDate.getDate() + 6)
    const wedStr = semanaFecha
    const tueStr = tueDate.toISOString().split('T')[0]

    // Litros del ganadero en la semana
    const { data: recepCamiones } = await supabase
      .from('recepciones_camion')
      .select('id')
      .eq('fabrica_id', form.fabrica_id)
      .gte('fecha_ingreso', wedStr)
      .lte('fecha_ingreso', tueStr)

    const camionIds = (recepCamiones ?? []).map((c: any) => c.id)
    let litrosGanadero = 0
    if (camionIds.length > 0) {
      const { data: detalles } = await supabase
        .from('recepciones_detalle')
        .select('litros_a_pagar, litros_recepcion')
        .eq('ganadero_id', ganaderoId)
        .in('recepcion_id', camionIds)
      litrosGanadero = (detalles ?? []).reduce(
        (s: number, d: any) => s + Number(d.litros_a_pagar || d.litros_recepcion || 0), 0
      )
    }

    // Precio semanal por grupo
    const { data: precioData } = await supabase
      .from('precios_semanales')
      .select('precio_leche_usd, precio_flete_usd')
      .eq('fecha_semana', semanaFecha)
      .eq('grupo', gan.grupo)
      .maybeSingle()

    const precioLeche = Number(precioData?.precio_leche_usd ?? 0)
    const precioFlete = Number(precioData?.precio_flete_usd ?? 0)

    // Determinar si ganadero == transportista (por RIF o cédula)
    const ruta = Array.isArray(gan.rutas) ? gan.rutas[0] : gan.rutas
    const esTransportista = ruta && (
      (gan.rif && ruta.rif && gan.rif.trim() === ruta.rif.trim()) ||
      (gan.cedula && ruta.cedula && gan.cedula.trim() === ruta.cedula.trim())
    )

    let litrosFlete = 0
    let tipo: TipoFactura = 'ganadero'
    let terceroCodigo = gan.codigo_ganadero
    let rutaId: string | null = null

    if (esTransportista) {
      tipo = 'ganadero_transportista'
      rutaId = ruta.id
      terceroCodigo = `${gan.codigo_ganadero}-${ruta.codigo_ruta}`
      setTieneFlete(true)

      // Litros totales transportados en la semana por esa ruta
      if (camionIds.length > 0) {
        const { data: allDetalles } = await supabase
          .from('recepciones_detalle')
          .select('litros_a_pagar, litros_recepcion, ganaderos!inner(ruta_id)')
          .in('recepcion_id', camionIds)
          .eq('ganaderos.ruta_id', ruta.id)
        litrosFlete = (allDetalles ?? []).reduce(
          (s: number, d: any) => s + Number(d.litros_a_pagar || d.litros_recepcion || 0), 0
        )
      }
    } else {
      setTieneFlete(false)
    }

    setForm(f => ({
      ...f,
      tipo,
      ganadero_id: ganaderoId,
      ruta_id: rutaId,
      tercero_codigo: terceroCodigo,
      tercero_nombre: gan.nombre,
      tercero_rif: gan.rif ?? '',
      precio_leche_usd: precioLeche,
      precio_flete_usd: precioFlete,
      litros_a_pagar: litrosGanadero,
      litros_flete: litrosFlete,
    }))
    setLoadingData(false)
  }, [ganaderos, form.fabrica_id, supabase])

  // ── Activar/desactivar flete manual ──────────────────────────────────────
  const handleFleteToggle = useCallback(async (checked: boolean) => {
    setTieneFlete(checked)
    if (!checked) {
      setForm(f => ({
        ...f,
        tipo: 'ganadero',
        precio_flete_usd: 0,
        litros_flete: 0,
        ruta_id: null,
      }))
      return
    }
    if (!form.ganadero_id || !form.semana_fecha) {
      setForm(f => ({ ...f, tipo: 'ganadero_transportista' }))
      return
    }
    setLoadingData(true)
    const gan = ganaderos.find(g => g.id === form.ganadero_id)
    if (!gan) { setLoadingData(false); return }

    const { data: precioData } = await supabase
      .from('precios_semanales')
      .select('precio_flete_usd')
      .eq('fecha_semana', form.semana_fecha)
      .eq('grupo', gan.grupo)
      .maybeSingle()
    const precioFlete = Number(precioData?.precio_flete_usd ?? 0)

    // Litros del flete por la ruta del ganadero
    const ruta = Array.isArray(gan.rutas) ? gan.rutas[0] : gan.rutas
    let litrosFlete = 0
    let rutaId: string | null = ruta?.id ?? null

    if (ruta) {
      const wedDate = new Date(form.semana_fecha + 'T12:00:00')
      const tueDate = new Date(wedDate)
      tueDate.setDate(wedDate.getDate() + 6)
      const tueStr = tueDate.toISOString().split('T')[0]

      const { data: recepCamiones } = await supabase
        .from('recepciones_camion')
        .select('id')
        .eq('fabrica_id', form.fabrica_id)
        .gte('fecha_ingreso', form.semana_fecha)
        .lte('fecha_ingreso', tueStr)

      const camionIds = (recepCamiones ?? []).map((c: any) => c.id)
      if (camionIds.length > 0) {
        const { data: allDetalles } = await supabase
          .from('recepciones_detalle')
          .select('litros_a_pagar, litros_recepcion, ganaderos!inner(ruta_id)')
          .in('recepcion_id', camionIds)
          .eq('ganaderos.ruta_id', ruta.id)
        litrosFlete = (allDetalles ?? []).reduce(
          (s: number, d: any) => s + Number(d.litros_a_pagar || d.litros_recepcion || 0), 0
        )
      }
    }

    setForm(f => ({
      ...f,
      tipo: 'ganadero_transportista',
      precio_flete_usd: precioFlete,
      litros_flete: litrosFlete,
      ruta_id: rutaId,
    }))
    setLoadingData(false)
  }, [form.ganadero_id, form.semana_fecha, form.fabrica_id, ganaderos, supabase])

  const loadRutaData = useCallback(async (rutaId: string, semanaFecha: string) => {
    if (!rutaId || !semanaFecha) return
    setLoadingData(true)

    const ruta = rutas.find(r => r.id === rutaId)
    if (!ruta) { setLoadingData(false); return }

    const wedDate = new Date(semanaFecha + 'T12:00:00')
    const tueDate = new Date(wedDate)
    tueDate.setDate(wedDate.getDate() + 6)
    const tueStr = tueDate.toISOString().split('T')[0]

    const { data: recepCamiones } = await supabase
      .from('recepciones_camion')
      .select('id')
      .eq('fabrica_id', form.fabrica_id)
      .gte('fecha_ingreso', semanaFecha)
      .lte('fecha_ingreso', tueStr)

    const camionIds = (recepCamiones ?? []).map((c: any) => c.id)
    let litrosFlete = 0

    if (camionIds.length > 0) {
      const { data: allDetalles } = await supabase
        .from('recepciones_detalle')
        .select('litros_a_pagar, litros_recepcion, ganaderos!inner(ruta_id)')
        .in('recepcion_id', camionIds)
        .eq('ganaderos.ruta_id', rutaId)
      litrosFlete = (allDetalles ?? []).reduce(
        (s: number, d: any) => s + Number(d.litros_a_pagar || d.litros_recepcion || 0), 0
      )
    }

    const { data: precioData } = await supabase
      .from('precios_semanales')
      .select('precio_flete_usd')
      .eq('fecha_semana', semanaFecha)
      .eq('grupo', ruta.grupo)
      .maybeSingle()

    const precioFlete = Number(precioData?.precio_flete_usd ?? 0)

    setForm(f => ({
      ...f,
      tipo: 'transportista',
      ganadero_id: null,
      ruta_id: rutaId,
      tercero_codigo: ruta.codigo_ruta,
      tercero_nombre: ruta.nombre_ruta,
      tercero_rif: ruta.rif ?? '',
      precio_flete_usd: precioFlete,
      litros_flete: litrosFlete,
      litros_a_pagar: 0,
    }))
    setLoadingData(false)
  }, [rutas, form.fabrica_id, supabase])

  // ── Cálculo en vivo ───────────────────────────────────────────────────────
  const calc = calcularFactura({
    litros_a_pagar: form.litros_a_pagar,
    litros_flete: form.litros_flete,
    precio_leche_usd: form.precio_leche_usd,
    precio_flete_usd: form.precio_flete_usd,
    tasa_miercoles: form.tasa_miercoles,
    tasa_factura: form.tasa_factura,
    deducciones: form.deducciones,
    incluye_flete: form.tipo === 'ganadero_transportista' || form.tipo === 'transportista',
  })

  // ── Deducciones ───────────────────────────────────────────────────────────
  const addDeduccionFromCatalog = (ded: DeduccionCatalogo) => {
    if (form.deducciones.find(d => d.codigo === ded.codigo)) return
    setForm(f => ({
      ...f,
      deducciones: [...f.deducciones, { codigo: ded.codigo, nombre: ded.nombre, monto_bs: 0 }],
    }))
  }

  const addCustomDeduccion = () => {
    if (!newDed.codigo || !newDed.nombre || !newDed.monto_bs) return
    setForm(f => ({
      ...f,
      deducciones: [...f.deducciones, {
        codigo: newDed.codigo,
        nombre: newDed.nombre,
        monto_bs: parseFloat(newDed.monto_bs),
      }],
    }))
    setNewDed({ codigo: '', nombre: '', monto_bs: '' })
    setShowDedForm(false)
  }

  const removeDed = (idx: number) => {
    setForm(f => ({ ...f, deducciones: f.deducciones.filter((_, i) => i !== idx) }))
  }

  const updateDedMonto = (idx: number, val: string) => {
    setForm(f => {
      const deds = [...f.deducciones]
      deds[idx] = { ...deds[idx], monto_bs: parseFloat(val) || 0 }
      return { ...f, deducciones: deds }
    })
  }

  // ── Guardar ────────────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.semana_fecha) { setError('Selecciona la semana ganadera'); return }
    if (!form.fecha_emision) { setError('Selecciona la fecha de emisión'); return }
    if (!form.tercero_nombre) { setError('Selecciona el ganadero o transportista'); return }
    if (form.tasa_miercoles <= 0) { setError('La tasa del miércoles es requerida (verifica Tasas BCV en Configuración)'); return }
    if (form.tasa_factura <= 0) { setError('No se encontró tasa BCV para la fecha de emisión'); return }

    setSaving(true)

    const payload = {
      fabrica_id: form.fabrica_id,
      semana_fecha: form.semana_fecha,
      semana_nombre: form.semana_nombre,
      tipo: form.tipo,
      ganadero_id: form.ganadero_id,
      ruta_id: form.ruta_id,
      tercero_codigo: form.tercero_codigo,
      tercero_nombre: form.tercero_nombre,
      tercero_rif: form.tercero_rif || null,
      fecha_emision: form.fecha_emision,
      numero_factura: form.numero_factura || null,
      tasa_miercoles: form.tasa_miercoles,
      tasa_factura: form.tasa_factura,
      precio_leche_usd: form.precio_leche_usd,
      precio_flete_usd: form.precio_flete_usd || null,
      litros_a_pagar: form.litros_a_pagar,
      litros_flete: form.litros_flete || null,
      base_bs: calc.base_bs,
      flete_bs: calc.flete_bs || null,
      nota_debito_leche_bs: calc.nota_debito_leche_bs,
      nota_debito_flete_bs: calc.nota_debito_flete_bs || null,
      nota_debito_total_bs: calc.nota_debito_total_bs,
      subtotal_bs: calc.subtotal_bs,
      deducciones_total_bs: calc.deducciones_total_bs,
      base_islr_bs: calc.base_islr_bs,
      islr_bs: calc.islr_bs,
      total_bs: calc.total_bs,
      emisor_razon_social: form.emisor_razon_social,
      emisor_rif: form.emisor_rif,
      emisor_direccion: form.emisor_direccion,
      notas: form.notas || null,
      updated_at: new Date().toISOString(),
    }

    let facturaId = editFactura?.id

    if (editFactura) {
      const { error: updErr } = await supabase.from('facturas').update(payload).eq('id', editFactura.id)
      if (updErr) { setError(updErr.message); setSaving(false); return }
      await supabase.from('facturas_deducciones').delete().eq('factura_id', editFactura.id)
    } else {
      const { data: ins, error: insErr } = await supabase.from('facturas').insert(payload).select('id').single()
      if (insErr || !ins) { setError(insErr?.message ?? 'Error al insertar'); setSaving(false); return }
      facturaId = ins.id
    }

    if (form.deducciones.length > 0 && facturaId) {
      const dedsPayload = form.deducciones.map(d => ({
        factura_id: facturaId,
        codigo: d.codigo,
        nombre: d.nombre,
        monto_bs: d.monto_bs,
      }))
      await supabase.from('facturas_deducciones').insert(dedsPayload)
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  if (!isOpen) return null

  const incluyeFlete = form.tipo === 'ganadero_transportista' || form.tipo === 'transportista'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex justify-between items-center bg-slate-100 border-b border-slate-200 rounded-t-2xl overflow-hidden flex-shrink-0">
          <div className="px-6 py-4">
            <h3 className="font-black text-slate-800">
              {editFactura ? 'Editar Recibo Digital' : 'Nuevo Recibo Digital'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Complete los datos del recibo digital</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white hover:bg-red-500 px-5 py-4 transition-colors self-stretch flex items-center"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6 overflow-y-auto flex-1">

          {/* ── Sección: Emisor y semana ─────────────────────────── */}
          <Section title="Datos del emisor y semana">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Fábrica / Emisor */}
              <div>
                <label className="label">Fábrica emisora</label>
                <select
                  value={form.fabrica_id}
                  onChange={e => {
                    const fab = fabricas.find(f => f.id === e.target.value)
                    setForm(f => ({
                      ...f,
                      fabrica_id: e.target.value,
                      emisor_razon_social: fab?.razon_social ?? '',
                      emisor_rif: fab?.rif ?? '',
                      emisor_direccion: fab?.direccion_fiscal ?? '',
                    }))
                  }}
                  className="input"
                >
                  {fabricas.map(f => (
                    <option key={f.id} value={f.id}>{f.nombre} (Cód.{f.codigo})</option>
                  ))}
                </select>
              </div>

              {/* Número de factura */}
              <div>
                <label className="label">N° Recibo (opcional)</label>
                <input
                  type="text"
                  value={form.numero_factura}
                  onChange={e => setForm(f => ({ ...f, numero_factura: e.target.value }))}
                  placeholder="Ej: R-001-2025"
                  className="input"
                />
              </div>

              {/* Semana ganadera */}
              <div>
                <label className="label">Semana ganadera</label>
                <select
                  value={form.semana_fecha}
                  onChange={e => {
                    const wStr = e.target.value
                    const sem = semanas.find(s => s.fecha === wStr)
                    setForm(f => ({
                      ...f,
                      semana_fecha: wStr,
                      semana_nombre: wStr ? formatSemanaGanadera(wStr) : '',
                      tasa_miercoles: sem ? Number(sem.tasa) : 0,
                    }))
                    if (form.ganadero_id && wStr) loadGanaderoData(form.ganadero_id, wStr)
                    if (form.ruta_id && form.tipo === 'transportista' && wStr) loadRutaData(form.ruta_id, wStr)
                  }}
                  className="input"
                  required
                >
                  <option value="">— Seleccionar semana —</option>
                  {semanas.map(s => (
                    <option key={s.fecha} value={s.fecha}>
                      Sem. {getSemanaNumero(s.fecha)} — {formatSemanaGanadera(s.fecha)} (tasa: {fmtNum(s.tasa, 3)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Fecha de emisión */}
              <div>
                <label className="label">Fecha de emisión / pago</label>
                <input
                  type="date"
                  value={form.fecha_emision}
                  onChange={e => {
                    const d = e.target.value
                    const tasa = tasaMap.get(d) ?? 0
                    setForm(f => ({ ...f, fecha_emision: d, tasa_factura: tasa }))
                  }}
                  className="input"
                  required
                />
                {form.fecha_emision && form.tasa_factura === 0 && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ No hay tasa BCV para esta fecha. Ingresa manualmente.</p>
                )}
              </div>

              {/* Tasas */}
              <div>
                <label className="label">Tasa inicio semana (Bs/$)</label>
                <input
                  type="number"
                  step="0.001"
                  value={form.tasa_miercoles || ''}
                  onChange={e => setForm(f => ({ ...f, tasa_miercoles: parseFloat(e.target.value) || 0 }))}
                  className="input"
                  placeholder="0.000"
                />
              </div>
              <div>
                <label className="label">Tasa fecha emisión (Bs/$)</label>
                <input
                  type="number"
                  step="0.001"
                  value={form.tasa_factura || ''}
                  onChange={e => setForm(f => ({ ...f, tasa_factura: parseFloat(e.target.value) || 0 }))}
                  className="input"
                  placeholder="0.000"
                />
              </div>
            </div>

            {/* Emisor info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="label">Razón social emisor</label>
                <input type="text" value={form.emisor_razon_social} onChange={e => setForm(f => ({ ...f, emisor_razon_social: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">RIF emisor</label>
                <input type="text" value={form.emisor_rif} onChange={e => setForm(f => ({ ...f, emisor_rif: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Dirección fiscal</label>
                <input type="text" value={form.emisor_direccion} onChange={e => setForm(f => ({ ...f, emisor_direccion: e.target.value }))} className="input" />
              </div>
            </div>
          </Section>

          {/* ── Sección: Proveedor ───────────────────────────────── */}
          <Section title="Proveedor">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Tipo de proveedor</label>
                <select
                  value={form.tipo === 'transportista' ? 'transportista' : 'ganadero'}
                  onChange={e => {
                    const t = e.target.value
                    setTieneFlete(false)
                    setSearchGanadero('')
                    setForm(f => ({
                      ...f,
                      tipo: t as TipoFactura,
                      ganadero_id: null,
                      ruta_id: null,
                      tercero_codigo: '',
                      tercero_nombre: '',
                      tercero_rif: '',
                      litros_a_pagar: 0,
                      litros_flete: 0,
                    }))
                  }}
                  className="input"
                >
                  <option value="ganadero">Ganadero</option>
                  <option value="transportista">Transportista (solo flete)</option>
                </select>
              </div>

              {form.tipo !== 'transportista' ? (
                /* ── Búsqueda de ganadero ── */
                <div ref={ganSearchRef} className="relative">
                  <label className="label">
                    Ganadero {loadingData && <Loader2 size={12} className="inline animate-spin ml-1" />}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchGanadero}
                      onChange={e => {
                        setSearchGanadero(e.target.value)
                        setShowGanDropdown(true)
                        // Si borra el texto, limpia la selección
                        if (!e.target.value) {
                          setTieneFlete(false)
                          setForm(f => ({
                            ...f,
                            ganadero_id: null,
                            tercero_codigo: '',
                            tercero_nombre: '',
                            tercero_rif: '',
                            litros_a_pagar: 0,
                            litros_flete: 0,
                            tipo: 'ganadero',
                          }))
                        }
                      }}
                      onFocus={() => setShowGanDropdown(true)}
                      placeholder="Buscar por código, nombre, RIF o cédula…"
                      className="input pr-8"
                    />
                    {form.ganadero_id && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchGanadero('')
                          setTieneFlete(false)
                          setForm(f => ({
                            ...f,
                            ganadero_id: null,
                            tercero_codigo: '',
                            tercero_nombre: '',
                            tercero_rif: '',
                            litros_a_pagar: 0,
                            litros_flete: 0,
                            tipo: 'ganadero',
                          }))
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {showGanDropdown && filteredGanaderos.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto mt-1">
                      {filteredGanaderos.map(g => (
                        <button
                          key={g.id}
                          type="button"
                          className="w-full text-left px-3 py-2.5 text-xs hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                          onClick={() => {
                            setSearchGanadero(`${g.codigo_ganadero} — ${g.nombre}`)
                            setShowGanDropdown(false)
                            setTieneFlete(false)
                            if (form.semana_fecha) {
                              loadGanaderoData(g.id, form.semana_fecha)
                            } else {
                              setForm(f => ({
                                ...f,
                                ganadero_id: g.id,
                                tercero_nombre: g.nombre,
                                tercero_rif: g.rif ?? '',
                                tercero_codigo: g.codigo_ganadero,
                              }))
                            }
                          }}
                        >
                          <span className="font-bold text-slate-800">{g.codigo_ganadero}</span>
                          <span className="text-slate-600 ml-2">{g.nombre}</span>
                          {(g.rif || g.cedula) && (
                            <span className="text-slate-400 ml-2 float-right">{g.rif || g.cedula}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="label">Ruta / Transportista {loadingData && <Loader2 size={12} className="inline animate-spin ml-1" />}</label>
                  <select
                    value={form.ruta_id ?? ''}
                    onChange={e => {
                      setForm(f => ({ ...f, ruta_id: e.target.value }))
                      if (e.target.value && form.semana_fecha) {
                        loadRutaData(e.target.value, form.semana_fecha)
                      }
                    }}
                    className="input"
                  >
                    <option value="">— Seleccionar ruta —</option>
                    {rutas.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.codigo_ruta} — {r.nombre_ruta}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Checkbox: Tiene flete (solo para ganaderos) */}
            {form.tipo !== 'transportista' && form.ganadero_id && (
              <div className="mt-3">
                <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={tieneFlete}
                      onChange={e => handleFleteToggle(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">
                    Tiene flete
                    {loadingData && <Loader2 size={12} className="inline animate-spin ml-1 text-blue-500" />}
                  </span>
                </label>
                {tieneFlete && (
                  <p className="text-xs text-blue-600 mt-1 ml-14">
                    Se incluirá flete en este recibo — tipo: Ganadero + Flete
                  </p>
                )}
              </div>
            )}

            {form.tipo === 'ganadero_transportista' && !form.ganadero_id && (
              <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 font-medium">
                ✓ Este ganadero es también transportista — se incluirá flete en el mismo recibo.
              </div>
            )}

            {/* Litros y precios */}
            {form.tercero_nombre && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {(form.tipo !== 'transportista') && (
                  <>
                    <NumInput label="Litros a pagar" value={form.litros_a_pagar} onChange={v => setForm(f => ({ ...f, litros_a_pagar: v }))} />
                    <NumInput label="Precio leche USD" value={form.precio_leche_usd} onChange={v => setForm(f => ({ ...f, precio_leche_usd: v }))} decimals={4} />
                  </>
                )}
                {incluyeFlete && (
                  <>
                    <NumInput label="Litros flete" value={form.litros_flete} onChange={v => setForm(f => ({ ...f, litros_flete: v }))} />
                    <NumInput label="Precio flete USD" value={form.precio_flete_usd} onChange={v => setForm(f => ({ ...f, precio_flete_usd: v }))} decimals={4} />
                  </>
                )}
              </div>
            )}
          </Section>

          {/* ── Sección: Deducciones ─────────────────────────────── */}
          <Section title="Deducciones">
            {catalogoDeducciones.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {catalogoDeducciones.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => addDeduccionFromCatalog(d)}
                    disabled={!!form.deducciones.find(x => x.codigo === d.codigo)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      form.deducciones.find(x => x.codigo === d.codigo)
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
                        : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    + Cód.{d.codigo} {d.nombre}
                  </button>
                ))}
              </div>
            )}

            {form.deducciones.length > 0 && (
              <div className="space-y-2 mb-3">
                {form.deducciones.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    <span className="text-xs font-bold text-red-700 w-16">Cód.{d.codigo}</span>
                    <span className="text-xs text-slate-700 flex-1">{d.nombre}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={d.monto_bs || ''}
                      onChange={e => updateDedMonto(i, e.target.value)}
                      placeholder="Monto Bs"
                      className="w-28 text-right border border-red-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-red-300 bg-white"
                    />
                    <span className="text-xs text-slate-400">Bs</span>
                    <button type="button" onClick={() => removeDed(i)} className="p-1 text-red-400 hover:text-red-700 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showDedForm ? (
              <div className="flex gap-2 items-end bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="w-20">
                  <label className="label">Código</label>
                  <input type="text" value={newDed.codigo} onChange={e => setNewDed(n => ({ ...n, codigo: e.target.value }))} className="input" placeholder="00" />
                </div>
                <div className="flex-1">
                  <label className="label">Concepto</label>
                  <input type="text" value={newDed.nombre} onChange={e => setNewDed(n => ({ ...n, nombre: e.target.value }))} className="input" placeholder="Descripción" />
                </div>
                <div className="w-28">
                  <label className="label">Monto Bs</label>
                  <input type="number" step="0.01" value={newDed.monto_bs} onChange={e => setNewDed(n => ({ ...n, monto_bs: e.target.value }))} className="input" placeholder="0.00" />
                </div>
                <button type="button" onClick={addCustomDeduccion} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">Agregar</button>
                <button type="button" onClick={() => setShowDedForm(false)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"><X size={16} /></button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDedForm(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 transition-colors"
              >
                <Plus size={14} /> Agregar deducción personalizada
              </button>
            )}
          </Section>

          {/* ── Resumen de cálculo ───────────────────────────────── */}
          {form.tercero_nombre && (
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-1.5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Resumen de cálculo</p>
              <CalcRow label="Base leche (tasa inicio semana)" value={fmtBs(calc.base_bs)} />
              {incluyeFlete && <CalcRow label="Servicio de flete" value={fmtBs(calc.flete_bs)} />}
              {(form.tasa_factura > 0 && form.tasa_factura !== form.tasa_miercoles) && (
                <CalcRow label="Nota de débito diferencial" value={fmtBs(calc.nota_debito_total_bs)} accent="amber" />
              )}
              <CalcRow label="Subtotal" value={fmtBs(calc.subtotal_bs)} bold />
              {calc.deducciones_total_bs > 0 && (
                <CalcRow label="Total deducciones" value={`– ${fmtBs(calc.deducciones_total_bs)}`} accent="red" />
              )}
              <CalcRow label="Base ISLR" value={fmtBs(calc.base_islr_bs)} />
              <CalcRow label="ISLR retenido (1%)" value={`– ${fmtBs(calc.islr_bs)}`} accent="orange" />
              <div className="border-t-2 border-slate-300 pt-2 mt-2">
                <CalcRow label="Total a facturar" value={fmtBs(calc.total_bs)} bold big />
              </div>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="label">Notas (opcional)</label>
            <textarea
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              rows={2}
              className="input resize-none"
              placeholder="Observaciones adicionales..."
            />
          </div>

          {error && <p className="text-red-500 text-sm font-semibold bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {editFactura ? 'Guardar cambios' : 'Crear recibo'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .label { display:block; font-size:0.7rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.25rem; }
        .input { width:100%; background:white; color:#0f172a; font-size:0.8rem; border:1px solid #cbd5e1; border-radius:0.5rem; padding:0.5rem 0.625rem; outline:none; }
        .input:focus { ring: 2px; border-color:#3b82f6; box-shadow:0 0 0 2px rgba(59,130,246,0.2); }
      `}</style>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">{title}</p>
      {children}
    </div>
  )
}

function NumInput({ label, value, onChange, decimals = 2 }: { label: string; value: number; onChange: (v: number) => void; decimals?: number }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        step={Math.pow(10, -decimals).toString()}
        value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="input"
        placeholder="0"
      />
    </div>
  )
}

function CalcRow({ label, value, bold, big, accent }: { label: string; value: string; bold?: boolean; big?: boolean; accent?: 'amber' | 'red' | 'orange' }) {
  const color = accent === 'amber' ? 'text-amber-600' : accent === 'red' ? 'text-red-600' : accent === 'orange' ? 'text-orange-600' : 'text-slate-700'
  return (
    <div className="flex justify-between items-baseline">
      <span className={`text-xs ${color} ${bold ? 'font-bold' : ''}`}>{label}</span>
      <span className={`font-semibold ${color} ${big ? 'text-base font-black' : 'text-xs'}`}>{value}</span>
    </div>
  )
}
