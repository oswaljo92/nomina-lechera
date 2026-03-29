'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit2, Trash2, Loader2, X, Search, AlertCircle, History, Upload, Download, FileSpreadsheet, CheckCircle2, ArrowLeft } from 'lucide-react'
import { logAction } from '@/lib/log-utils'
import { useFabrica } from '@/contexts/FabricaContext'
import * as XLSX from 'xlsx'


export default function RutasPage() {
  const supabase = createClient()
  const { selectedFabricaId, selectedFabrica, isAllFabricas } = useFabrica()
  const [rutas, setRutas] = useState<any[]>([])
  const [ganaderosMap, setGanaderosMap] = useState<Record<string, any[]>>({})
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [curUser, setCurUser] = useState<any>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // Selección masiva
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isBitacoraOpen, setIsBitacoraOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [editRuta, setEditRuta] = useState<any>(null)

  // Import
  const [importRows, setImportRows] = useState<any[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; errores: string[] } | null>(null)

  // Error duplicado en formulario
  const [errorDuplicado, setErrorDuplicado] = useState('')

  // Para sincronizar grupo con precios_semanales
  const [originalGrupo, setOriginalGrupo] = useState<string | null>(null)

  // Paginación
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(0)

  useEffect(() => { load() }, [selectedFabricaId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsModalOpen(false); setIsDeleteModalOpen(false); setIsImportModalOpen(false) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const load = async () => {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    const userObj = userData?.user
    const { data: profile } = await supabase.from('perfiles_usuarios').select('rol').eq('id', userObj?.id).single()
    setIsAdmin(profile?.rol === 'admin')
    setCurUser(userObj)

    const rutaQ = supabase.from('rutas').select('*').order('created_at', { ascending: false })
    if (selectedFabricaId && selectedFabricaId !== 'all') rutaQ.eq('fabrica_id', selectedFabricaId)
    const ganaderosQ = supabase.from('ganaderos').select('codigo_ganadero, nombre, grupo, ruta_id').eq('activo', true)
    const [{ data: rutasData }, { data: ganaderosData }] = await Promise.all([rutaQ, ganaderosQ])
    if (rutasData) setRutas(rutasData)
    if (ganaderosData) {
      const map: Record<string, any[]> = {}
      for (const g of ganaderosData) {
        if (!g.ruta_id) continue
        if (!map[g.ruta_id]) map[g.ruta_id] = []
        map[g.ruta_id].push(g)
      }
      setGanaderosMap(map)
    }
    setLoading(false)
  }

  const filteredRutas = rutas.filter(r => {
    const term = searchTerm.toLowerCase()
    return r.codigo_ruta?.toLowerCase().includes(term) ||
           r.nombre_ruta?.toLowerCase().includes(term) ||
           r.sap?.toLowerCase().includes(term) ||
           r.cedula?.toLowerCase().includes(term) ||
           r.rif?.toLowerCase().includes(term)
  })

  const totalPages = Math.ceil(filteredRutas.length / pageSize)
  const pagedRutas = filteredRutas.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  useEffect(() => { setCurrentPage(0) }, [searchTerm])

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }
  const toggleAll = () => {
    if (selectedIds.size === filteredRutas.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredRutas.map(r => r.id)))
  }

  const handleDeleteManyConf = async () => {
    await supabase.from('rutas').delete().in('id', Array.from(selectedIds))
    logAction(supabase, curUser, 'Rutas', 'BORRADO_MASIVO', `Eliminadas ${selectedIds.size} rutas.`)
    setSelectedIds(new Set()); setIsDeleteModalOpen(false); load()
  }

  const handleDeleteSingle = async (id: string, nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar la ruta: ${nombre}?`)) return
    await supabase.from('rutas').delete().eq('id', id)
    logAction(supabase, curUser, 'Rutas', 'BORRAR', `Eliminada ruta: ${nombre}`)
    load()
  }

  // ─── Guardar con validación de duplicado ──────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorDuplicado('')

    // Verificar duplicado globalmente
    const dupQ = supabase.from('rutas').select('id, nombre_ruta, fabricas(nombre)').eq('codigo_ruta', editRuta.codigo_ruta)
    if (editRuta.id) dupQ.neq('id', editRuta.id)
    const { data: dup } = await dupQ
    if (dup && dup.length > 0) {
      const fab = (dup[0] as any).fabricas?.nombre || 'otra fábrica'
      setErrorDuplicado(`⚠️ El código "${editRuta.codigo_ruta}" ya existe (${dup[0].nombre_ruta} — ${fab}). Los códigos deben ser únicos.`)
      return
    }

    const rutaPayload: any = {
      codigo_ruta: editRuta.codigo_ruta,
      nombre_ruta: editRuta.nombre_ruta,
      sap: editRuta.sap || null,
      cedula: editRuta.cedula || null,
      rif: editRuta.rif || null,
      grupo: editRuta.grupo || null,
      activo: editRuta.activo !== false,
      ...(selectedFabricaId && selectedFabricaId !== 'all' ? { fabrica_id: selectedFabricaId } : {})
    }

    if (editRuta.id) {
      await supabase.from('rutas').update(rutaPayload).eq('id', editRuta.id)
      logAction(supabase, curUser, 'Rutas', 'EDITAR', `Editada ruta: ${editRuta.nombre_ruta}`)

      // Sincronizar grupo con precios_semanales si cambió
      const nuevoGrupo = rutaPayload.grupo ?? null
      if (nuevoGrupo !== originalGrupo) {
        const { data: allPrecios } = await supabase.from('precios_semanales').select('id, grupo, rutas')
        for (const precio of (allPrecios || [])) {
          const rList = (precio.rutas || []) as string[]
          const hasThis = rList.includes(editRuta.codigo_ruta)
          if (hasThis && precio.grupo !== nuevoGrupo) {
            await supabase.from('precios_semanales').update({ rutas: rList.filter((c: string) => c !== editRuta.codigo_ruta) }).eq('id', precio.id)
          } else if (!hasThis && precio.grupo === nuevoGrupo && nuevoGrupo !== null) {
            await supabase.from('precios_semanales').update({ rutas: [...rList, editRuta.codigo_ruta] }).eq('id', precio.id)
          }
        }
      }
    } else {
      await supabase.from('rutas').insert(rutaPayload)
      logAction(supabase, curUser, 'Rutas', 'CREAR', `Creada ruta: ${editRuta.nombre_ruta}`)
    }
    setIsModalOpen(false); load()
  }

  // ─── EXPORTAR a Excel ─────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = rutas.map(r => ({
      'Código Ruta': r.codigo_ruta,
      'Nombre Ruta': r.nombre_ruta,
      'SAP': r.sap || '',
      'Cédula': r.cedula || '',
      'RIF': r.rif || '',
      'Activo': r.activo !== false ? 'SI' : 'NO'
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rutas')
    const fab = isAllFabricas ? 'todas' : (selectedFabrica?.codigo || 'fab')
    XLSX.writeFile(wb, `rutas_${fab}.xlsx`)
    logAction(supabase, curUser, 'Rutas', 'EXPORTAR', `Exportadas ${rutas.length} rutas.`)
  }

  // ─── DESCARGAR PLANTILLA ──────────────────────────────────────────────────
  const handleDescargarPlantilla = () => {
    const ejemplo = [{
      'Código Ruta*': 'R01',
      'Nombre Ruta*': 'Ruta Norte',
      'SAP': 'SAP001',
      'Cédula': '12345678',
      'RIF': '123456789',
      'Activo (SI/NO)': 'SI'
    }]
    const ws = XLSX.utils.json_to_sheet(ejemplo)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, 'plantilla_rutas.xlsx')
  }

  // ─── LEER ARCHIVO EXCEL ───────────────────────────────────────────────────
  const handleArchivoImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
      setImportRows(rows); setImportResult(null); setIsImportModalOpen(true)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // ─── CONFIRMAR IMPORTACIÓN ────────────────────────────────────────────────
  const handleConfirmarImport = async () => {
    setImportLoading(true)
    const errores: string[] = []
    let ok = 0

    const { data: existentes } = await supabase.from('rutas').select('codigo_ruta')
    const codigosExistentes = new Set((existentes || []).map((r: any) => r.codigo_ruta?.toLowerCase()))
    const codigosEnArchivo = new Set<string>()

    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i]
      const fila = i + 2
      const codigo = String(row['Código Ruta*'] || row['Código Ruta'] || '').trim()
      const nombre = String(row['Nombre Ruta*'] || row['Nombre Ruta'] || '').trim()

      if (!codigo) { errores.push(`Fila ${fila}: Falta el Código de Ruta.`); continue }
      if (!nombre) { errores.push(`Fila ${fila}: Falta el Nombre de Ruta.`); continue }
      if (codigosExistentes.has(codigo.toLowerCase())) { errores.push(`Fila ${fila}: Código "${codigo}" ya existe en la base de datos.`); continue }
      if (codigosEnArchivo.has(codigo.toLowerCase())) { errores.push(`Fila ${fila}: Código "${codigo}" está duplicado en el archivo.`); continue }

      codigosEnArchivo.add(codigo.toLowerCase())

      const payload: any = {
        codigo_ruta: codigo,
        nombre_ruta: nombre,
        sap: String(row['SAP'] || '').trim() || null,
        cedula: String(row['Cédula'] || '') || null,
        rif: String(row['RIF'] || '') || null,
        activo: String(row['Activo (SI/NO)'] || 'SI').trim().toUpperCase() !== 'NO',
        ...(selectedFabricaId && selectedFabricaId !== 'all' ? { fabrica_id: selectedFabricaId } : {})
      }

      const { error } = await supabase.from('rutas').insert(payload)
      if (error) { errores.push(`Fila ${fila}: Error al guardar — ${error.message}`); continue }
      ok++
    }

    logAction(supabase, curUser, 'Rutas', 'IMPORTAR_MASIVO', `Importadas ${ok} rutas. Errores: ${errores.length}`)
    setImportResult({ ok, errores })
    setImportLoading(false)
    if (ok > 0) load()
  }

  if (loading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-500 w-12 h-12" /></div>

  return (
    <div className="space-y-6 fade-in pb-20 px-4 sm:px-0">

      {/* ── Encabezado ── */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Rutas</h1>
            {isAllFabricas
              ? <span className="bg-blue-100 text-blue-800 text-xs font-black px-3 py-1 rounded-full">Todas las fábricas</span>
              : selectedFabrica && <span className="bg-blue-100 text-blue-800 text-xs font-black px-3 py-1 rounded-full">{selectedFabrica.codigo} · {selectedFabrica.nombre}</span>
            }
          </div>
          <p className="text-slate-500 text-sm">Gestión de rutas de recolección.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button onClick={() => setIsBitacoraOpen(true)} className="flex items-center gap-2 px-4 py-2 font-bold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl bg-white shadow-sm text-sm">
              <History size={16} /> Bitácora
            </button>
          )}
          <button onClick={handleDescargarPlantilla} className="flex items-center gap-2 px-4 py-2 font-bold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl bg-white shadow-sm text-sm">
            <FileSpreadsheet size={16} /> Plantilla
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 font-bold text-emerald-700 hover:text-emerald-900 border border-emerald-200 rounded-xl bg-emerald-50 shadow-sm text-sm">
            <Download size={16} /> Exportar
          </button>
          <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 px-4 py-2 font-bold text-blue-700 hover:text-blue-900 border border-blue-200 rounded-xl bg-blue-50 shadow-sm text-sm">
            <Upload size={16} /> Importar Excel
          </button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleArchivoImport} />
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col lg:flex-row justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input type="text" placeholder="Buscar ruta..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {selectedIds.size > 0 && isAdmin && (
              <button onClick={() => setIsDeleteModalOpen(true)} className="bg-red-50 text-red-700 font-bold px-4 py-2 rounded-xl flex items-center justify-center gap-2 border border-red-100">
                <Trash2 size={16} /> Borrar ({selectedIds.size})
              </button>
            )}
            <button onClick={() => { setEditRuta({ codigo_ruta: '', nombre_ruta: '', sap: '', cedula: '', rif: '', grupo: '' }); setOriginalGrupo(null); setErrorDuplicado(''); setIsModalOpen(true) }}
              className="bg-blue-600 text-white font-bold px-5 py-2 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
              <Plus size={18} /> Nueva Ruta
            </button>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y divide-slate-100">
          {pagedRutas.length === 0 ? (
            <div className="p-10 text-center text-slate-400 font-bold text-sm">Sin resultados</div>
          ) : pagedRutas.map((ruta) => (
            <div key={ruta.id} className="p-4 flex items-start gap-3">
              {isAdmin && <input type="checkbox" checked={selectedIds.has(ruta.id)} onChange={() => toggleSelection(ruta.id)} className="mt-1 w-5 h-5 shrink-0 rounded" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-black text-blue-600">{ruta.codigo_ruta}</span>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">{ruta.nombre_ruta}</p>
                    <div className="flex gap-3 mt-0.5">
                      {ruta.sap && <p className="text-xs text-slate-500">SAP: {ruta.sap}</p>}
                      {ruta.cedula && <p className="text-xs text-slate-500">CI: {ruta.cedula}</p>}
                      {ruta.rif && <p className="text-xs text-slate-500">RIF: {ruta.rif}</p>}
                    </div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black ${ruta.activo !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    {ruta.activo !== false ? 'ACTIVA' : 'BLOQUEADA'}
                  </span>
                </div>
                <div className="flex justify-end mt-3 gap-2">
                  <button onClick={() => { setEditRuta(ruta); setOriginalGrupo(ruta.grupo ?? null); setErrorDuplicado(''); setIsModalOpen(true) }} className="text-blue-500 bg-blue-50 p-2 rounded-lg"><Edit2 size={15} /></button>
                  {isAdmin && <button onClick={() => handleDeleteSingle(ruta.id, ruta.nombre_ruta)} className="text-red-500 bg-red-50 p-2 rounded-lg"><Trash2 size={15} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {isAdmin && <th className="px-4 py-3 w-10 text-center"><input type="checkbox" checked={selectedIds.size === filteredRutas.length && filteredRutas.length > 0} onChange={toggleAll} /></th>}
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-500">Acciones</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-500">Código</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-500">Nombre Ruta</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-500">Grupo</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-500">Ganaderos</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-500">Cédula / RIF</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-500">SAP</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-slate-500">Estado</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {pagedRutas.map((ruta) => (
                <tr key={ruta.id} className="hover:bg-slate-50 transition-colors">
                  {isAdmin && <td className="px-4 py-3 text-center"><input type="checkbox" checked={selectedIds.has(ruta.id)} onChange={() => toggleSelection(ruta.id)} /></td>}
                  <td className="px-4 py-3 whitespace-nowrap flex gap-3">
                    <button onClick={() => { setEditRuta(ruta); setOriginalGrupo(ruta.grupo ?? null); setErrorDuplicado(''); setIsModalOpen(true) }} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16} /></button>
                    {isAdmin && <button onClick={() => handleDeleteSingle(ruta.id, ruta.nombre_ruta)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16} /></button>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-black text-blue-600">{ruta.codigo_ruta}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-slate-800">{ruta.nombre_ruta}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    {ruta.grupo
                      ? <span className="bg-violet-100 text-violet-800 text-[10px] font-black px-2 py-0.5 rounded uppercase">{ruta.grupo}</span>
                      : (() => { const g = ganaderosMap[ruta.id]?.[0]; return g?.grupo ? <span className="bg-violet-100 text-violet-800 text-[10px] font-black px-2 py-0.5 rounded uppercase">{g.grupo}</span> : <span className="text-slate-300">—</span> })()
                    }
                  </td>
                  <td className="px-4 py-3 max-w-[250px]">
                    <div className="flex flex-wrap gap-1">
                      {(ganaderosMap[ruta.id] || []).length === 0
                        ? <span className="text-slate-300 text-xs">—</span>
                        : (ganaderosMap[ruta.id] || []).map((g: any) => (
                            <span key={g.codigo_ganadero} className="bg-blue-100 text-blue-800 text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
                              {g.codigo_ganadero} {g.nombre}
                            </span>
                          ))
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                    {ruta.cedula && <div>CI: {ruta.cedula}</div>}
                    {ruta.rif && <div className="text-[10px] text-slate-400">RIF: {ruta.rif}</div>}
                    {!ruta.cedula && !ruta.rif && <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">{ruta.sap || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${ruta.activo !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {ruta.activo !== false ? 'ACTIVA' : 'BLOQUEADA'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span>Mostrar:</span>
            {[10,20,30,50].map(n => (
              <button key={n} onClick={() => { setPageSize(n); setCurrentPage(0) }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${pageSize === n ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                {n}
              </button>
            ))}
            <span className="ml-2">de {filteredRutas.length} registros</span>
          </div>
          <div className="flex items-center gap-1">
            <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => Math.max(0, p-1))}
              className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-40">
              ‹ Ant
            </button>
            {Array.from({length: totalPages}, (_,i) => i).filter(i => Math.abs(i - currentPage) <= 2).map(i => (
              <button key={i} onClick={() => setCurrentPage(i)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${currentPage === i ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                {i + 1}
              </button>
            ))}
            <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => Math.min(totalPages-1, p+1))}
              className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-600 hover:bg-slate-300 disabled:opacity-40">
              Sig ›
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal Crear / Editar ── */}
      {isModalOpen && editRuta && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto overflow-hidden animate-in zoom-in-95">
            <div className="flex justify-between items-center bg-slate-50 border-b border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-blue-600 p-1 rounded-lg hover:bg-blue-50 transition-colors">
                  <ArrowLeft size={18} />
                </button>
                <h3 className="font-black text-slate-800 text-sm">{editRuta.id ? 'Editar Ruta' : 'Nueva Ruta'}</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
            </div>

            <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-4">
              {errorDuplicado && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                  <p className="text-red-700 text-xs font-bold">{errorDuplicado}</p>
                </div>
              )}

              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Identificación</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Código Ruta *</label>
                  <input autoFocus type="text" value={editRuta.codigo_ruta}
                    onChange={e => { setEditRuta({ ...editRuta, codigo_ruta: e.target.value }); setErrorDuplicado('') }}
                    placeholder="Ej: R01"
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Nombre Ruta *</label>
                  <input type="text" value={editRuta.nombre_ruta} onChange={e => setEditRuta({ ...editRuta, nombre_ruta: e.target.value })}
                    placeholder="Ej: Ruta Norte"
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Cédula</label>
                  <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                    <span className="bg-blue-600 text-white font-black text-sm px-3 py-2.5 shrink-0 animate-pulse select-none">V</span>
                    <input
                      type="text"
                      value={(editRuta.cedula || '').replace(/^V/i, '')}
                      onChange={e => setEditRuta({ ...editRuta, cedula: 'V' + e.target.value.replace(/^V/i, '') })}
                      onFocus={e => { const p = e.currentTarget.parentElement; if (p) p.scrollLeft = 0 }}
                      placeholder="20940780"
                      className="flex-1 p-2.5 text-sm font-bold focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">RIF</label>
                  <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                    <select
                      value={(editRuta.rif || 'J').charAt(0).toUpperCase()}
                      onChange={e => {
                        const nums = (editRuta.rif || '').replace(/^[VEPJCGRvepjcgr]/, '')
                        setEditRuta({ ...editRuta, rif: e.target.value + nums })
                      }}
                      className="bg-blue-50 text-blue-700 font-black text-sm px-2 py-2.5 border-r border-slate-300 focus:outline-none cursor-pointer shrink-0"
                    >
                      {['V','E','P','J','C','G','R'].map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <input
                      type="text"
                      value={(editRuta.rif || '').replace(/^[VEPJCGRvepjcgr]/, '')}
                      onChange={e => {
                        const prefix = (editRuta.rif || 'J').charAt(0).toUpperCase()
                        const valid = ['V','E','P','J','C','G','R']
                        const pfx = valid.includes(prefix) ? prefix : 'J'
                        setEditRuta({ ...editRuta, rif: pfx + e.target.value.replace(/^[VEPJCGRvepjcgr]/, '') })
                      }}
                      onFocus={e => { const p = e.currentTarget.parentElement; if (p) p.scrollLeft = 0 }}
                      placeholder="000193681"
                      className="flex-1 p-2.5 text-sm font-bold focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">SAP</label>
                  <input type="text" value={editRuta.sap || ''} onChange={e => setEditRuta({ ...editRuta, sap: e.target.value })}
                    placeholder="Código SAP"
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Grupo</label>
                  <input type="text" value={editRuta.grupo || ''} onChange={e => setEditRuta({ ...editRuta, grupo: e.target.value })}
                    placeholder="Ej: 35"
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 uppercase" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer w-full">
                    <input type="checkbox" checked={editRuta.activo !== false} onChange={e => setEditRuta({ ...editRuta, activo: e.target.checked })} className="w-4 h-4 rounded text-blue-600" />
                    <span className="text-xs font-bold text-slate-700">Ruta Activa</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-100 text-slate-600 font-bold py-3 rounded-xl">Cancelar</button>
                <button type="submit" className="bg-blue-600 text-white font-black py-3 rounded-xl shadow-lg shadow-blue-500/20">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Eliminar ── */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 text-center max-w-sm w-full animate-in zoom-in-95">
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h3 className="font-black text-lg text-slate-800">¿Eliminar registros?</h3>
            <p className="text-slate-500 text-sm mb-6 mt-2">Esta acción borrará permanentemente {selectedIds.size} rutas.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="bg-slate-100 text-slate-600 font-bold py-3 rounded-xl">Cerrar</button>
              <button onClick={handleDeleteManyConf} className="bg-red-600 text-white font-black py-3 rounded-xl">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Importar Excel ── */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-auto overflow-hidden animate-in zoom-in-95">
            <div className="flex justify-between items-center bg-slate-50 border-b border-slate-200 p-4">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <Upload size={16} className="text-blue-600" /> Importar Rutas desde Excel
              </h3>
              <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
            </div>

            <div className="p-4 sm:p-6">
              {importResult ? (
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                      <CheckCircle2 className="text-emerald-500 mx-auto mb-2" size={32} />
                      <p className="text-2xl font-black text-emerald-700">{importResult.ok}</p>
                      <p className="text-xs font-bold text-emerald-600">Rutas importadas</p>
                    </div>
                    {importResult.errores.length > 0 && (
                      <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                        <AlertCircle className="text-red-500 mx-auto mb-2" size={32} />
                        <p className="text-2xl font-black text-red-700">{importResult.errores.length}</p>
                        <p className="text-xs font-bold text-red-600">Filas con error</p>
                      </div>
                    )}
                  </div>
                  {importResult.errores.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-h-48 overflow-y-auto space-y-1">
                      {importResult.errores.map((e, i) => <p key={i} className="text-xs text-red-700 font-semibold">• {e}</p>)}
                    </div>
                  )}
                  <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }}
                    className="w-full bg-blue-600 text-white font-black py-3 rounded-xl">Cerrar</button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <p className="text-xs font-bold text-blue-700">Se encontraron <span className="text-blue-900">{importRows.length} filas</span> en el archivo.</p>
                  </div>
                  <div className="overflow-x-auto max-h-64 border border-slate-200 rounded-xl">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-black text-slate-500 whitespace-nowrap">#</th>
                          {importRows.length > 0 && Object.keys(importRows[0]).map(col => (
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
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button onClick={() => { setIsImportModalOpen(false); setImportResult(null) }} className="bg-slate-100 text-slate-600 font-bold py-3 rounded-xl">Cancelar</button>
                    <button onClick={handleConfirmarImport} disabled={importLoading}
                      className="bg-blue-600 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
                      {importLoading ? <><Loader2 size={16} className="animate-spin" /> Importando...</> : <><Upload size={16} /> Confirmar importación</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isBitacoraOpen && <ModalVitacora isOpen={isBitacoraOpen} onClose={() => setIsBitacoraOpen(false)} module="Rutas" />}
    </div>
  )
}

function ModalVitacora({ isOpen, onClose, module }: { isOpen: boolean, onClose: () => void, module: string }) {
  const supabase = createClient()
  const [logs, setLogs] = useState<any[]>([])
  const [semanas, setSemanas] = useState<string[]>([])
  const [selectedSemana, setSelectedSemana] = useState('')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [bitacoraPage, setBitacoraPage] = useState(0)
  const BITACORA_PAGE_SIZE = 20

  useEffect(() => { if (isOpen) fetchLogs() }, [isOpen])

  const fetchLogs = async () => {
    setLoading(true)
    const { data } = await supabase.from('bitacora').select('*').eq('modulo', module).order('created_at', { ascending: false }).limit(500)
    if (data) {
      setLogs(data)
      const weeks = new Set<string>()
      data.forEach(l => {
        if (l.created_at) {
          const d = new Date(l.created_at)
          const daysSinceWed = (d.getDay() - 3 + 7) % 7
          const wed = new Date(d)
          wed.setDate(d.getDate() - daysSinceWed)
          const key = `${wed.getFullYear()}-${String(wed.getMonth()+1).padStart(2,'0')}-${String(wed.getDate()).padStart(2,'0')}`
          weeks.add(key)
        }
      })
      const sorted = Array.from(weeks).sort().reverse()
      setSemanas(sorted)
      const now = new Date()
      const day = now.getDay()
      const diff = (day < 3 ? 7 : 0) + day - 3
      const prevWed = new Date(now)
      prevWed.setDate(now.getDate() - diff)
      const wedStr = `${prevWed.getFullYear()}-${String(prevWed.getMonth()+1).padStart(2,'0')}-${String(prevWed.getDate()).padStart(2,'0')}`
      setSelectedSemana(sorted.includes(wedStr) ? wedStr : (sorted[0] || ''))
    }
    setLoading(false)
  }

  const formatSemana = (wedStr: string) => {
    if (!wedStr) return 'Todas'
    const [y,m,d] = wedStr.split('-')
    const wed = new Date(parseInt(y), parseInt(m)-1, parseInt(d))
    const tue = new Date(wed); tue.setDate(wed.getDate() + 6)
    const fmt = (dt: Date) => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`
    return `Mié ${fmt(wed)} – Mar ${fmt(tue)}/${tue.getFullYear()}`
  }

  const filtered = logs.filter(l => {
    if (selectedSemana) {
      const d = new Date(l.created_at)
      const daysSinceWed = (d.getDay() - 3 + 7) % 7
      const wed = new Date(d); wed.setDate(d.getDate() - daysSinceWed)
      const key = `${wed.getFullYear()}-${String(wed.getMonth()+1).padStart(2,'0')}-${String(wed.getDate()).padStart(2,'0')}`
      if (key !== selectedSemana) return false
    }
    if (!search) return true
    return l.usuario_email?.toLowerCase().includes(search.toLowerCase()) ||
      l.accion?.toLowerCase().includes(search.toLowerCase()) ||
      l.detalles?.toLowerCase().includes(search.toLowerCase())
  })

  const totalBitacoraPages = Math.ceil(filtered.length / BITACORA_PAGE_SIZE)
  const pagedLogs = filtered.slice(bitacoraPage * BITACORA_PAGE_SIZE, (bitacoraPage + 1) * BITACORA_PAGE_SIZE)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 sm:p-6 bg-slate-50 border-b border-slate-200 shrink-0">
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
            <History className="text-blue-600" size={18} /> Bitácora {module}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 p-1"><X size={24} /></button>
        </div>
        <div className="p-4 flex gap-2 flex-wrap bg-slate-50 border-b border-slate-200 shrink-0">
          <select value={selectedSemana} onChange={e => { setSelectedSemana(e.target.value); setBitacoraPage(0) }}
            className="border border-slate-300 bg-white text-slate-700 font-bold rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500">
            <option value="">Todas las semanas</option>
            {semanas.map(s => <option key={s} value={s}>{formatSemana(s)}</option>)}
          </select>
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-3 top-2 text-slate-400" size={14} />
            <input type="text" placeholder="Filtrar..." value={search} onChange={e => { setSearch(e.target.value); setBitacoraPage(0) }}
              className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-slate-300 font-bold text-xs" />
          </div>
        </div>
        {totalBitacoraPages > 1 && (
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-500">{filtered.length} registros</span>
            <div className="flex items-center gap-1">
              <button disabled={bitacoraPage === 0} onClick={() => setBitacoraPage(p => p-1)}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-600 disabled:opacity-40">‹ Ant</button>
              <span className="text-xs font-bold text-slate-600 px-2">{bitacoraPage + 1} / {totalBitacoraPages}</span>
              <button disabled={bitacoraPage >= totalBitacoraPages - 1} onClick={() => setBitacoraPage(p => p+1)}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-600 disabled:opacity-40">Sig ›</button>
            </div>
          </div>
        )}
        <div className="p-4 flex-1 overflow-y-auto space-y-2">
          {loading ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500" /></div> : (
            pagedLogs.length === 0 ? (
              <div className="py-10 text-center text-slate-400 font-bold text-sm">Sin registros</div>
            ) : pagedLogs.map(log => (
              <div key={log.id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] font-black text-slate-400 uppercase">{new Date(log.created_at).toLocaleString('es-VE')}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${log.accion === 'BORRAR' || log.accion === 'BORRADO_MASIVO' ? 'bg-red-100 text-red-700' : log.accion === 'CREAR' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{log.accion}</span>
                </div>
                <p className="text-[11px] font-bold text-slate-800 leading-tight">{log.detalles}</p>
                <span className="text-[8px] font-medium text-slate-500 italic truncate">{log.usuario_email}</span>
              </div>
            ))
          )}
        </div>
        {totalBitacoraPages > 1 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-500">{filtered.length} registros</span>
            <div className="flex items-center gap-1">
              <button disabled={bitacoraPage === 0} onClick={() => setBitacoraPage(p => p-1)}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-600 disabled:opacity-40">‹ Ant</button>
              <span className="text-xs font-bold text-slate-600 px-2">{bitacoraPage + 1} / {totalBitacoraPages}</span>
              <button disabled={bitacoraPage >= totalBitacoraPages - 1} onClick={() => setBitacoraPage(p => p+1)}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-600 disabled:opacity-40">Sig ›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
