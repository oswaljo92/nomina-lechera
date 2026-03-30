'use client'

import React, { useState } from 'react'
import { DollarSign, RefreshCcw } from 'lucide-react'
import type { Factura, FacturaDeduccion } from '@/types/facturacion'
import {
  fmtBs, fmtUSD, fmtNum, formatDateDisplay, formatSemanaGanadera,
  calcularFactura, calcToUSD,
} from '@/lib/facturacion-utils'

interface FacturaTemplateProps {
  factura: Factura
  deducciones: FacturaDeduccion[]
  /** Si true, renderiza en modo compacto para previsualización inline */
  preview?: boolean
  /** ID único del elemento raíz para captura PDF/imagen */
  captureId?: string
}

export default function FacturaTemplate({
  factura,
  deducciones,
  preview = false,
  captureId = 'factura-template',
}: FacturaTemplateProps) {
  const [moneda, setMoneda] = useState<'bs' | 'usd'>('bs')

  const incluyeFlete = factura.tipo === 'ganadero_transportista' || factura.tipo === 'transportista'

  // Recalcular con deducciones actuales (para previsualización dinámica)
  const calc = calcularFactura({
    litros_a_pagar: factura.litros_a_pagar,
    litros_flete: factura.litros_flete ?? 0,
    precio_leche_usd: factura.precio_leche_usd,
    precio_flete_usd: factura.precio_flete_usd ?? 0,
    tasa_miercoles: factura.tasa_miercoles,
    tasa_factura: factura.tasa_factura,
    deducciones,
    incluye_flete: incluyeFlete,
  })

  const display = moneda === 'usd' ? calcToUSD(calc, factura.tasa_factura) : calc

  const sym = moneda === 'bs' ? 'Bs' : '$'
  const fmt = (n: number) => moneda === 'bs' ? fmtBs(n) : fmtUSD(n)

  const tipoLabel = factura.tipo === 'ganadero'
    ? 'Ganadero'
    : factura.tipo === 'transportista'
    ? 'Transportista'
    : 'Ganadero / Transportista'

  return (
    <div
      id={captureId}
      className={`bg-white font-sans ${preview ? 'text-xs' : 'text-sm'}`}
      style={{ minWidth: preview ? undefined : 680, maxWidth: 860 }}
    >
      {/* Switch Bs/USD — no se imprime */}
      <div className="no-print flex justify-end p-3 gap-2 border-b border-slate-100">
        <span className="text-xs text-slate-500 self-center">Moneda:</span>
        <button
          onClick={() => setMoneda('bs')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${moneda === 'bs' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
          Bs
        </button>
        <button
          onClick={() => setMoneda('usd')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${moneda === 'usd' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
          <DollarSign size={11} /> USD
        </button>
      </div>

      {/* ── CABECERA ─────────────────────────────────────────────── */}
      <div className="px-8 pt-6 pb-4 border-b-2 border-slate-800">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-lg font-black text-slate-800 uppercase tracking-wide">
              {factura.emisor_razon_social || 'EMPRESA'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">RIF: {factura.emisor_rif || '—'}</p>
            <p className="text-xs text-slate-500 leading-snug mt-0.5 max-w-xs">
              {factura.emisor_direccion || '—'}
            </p>
          </div>
          <div className="text-right">
            <div className="inline-block bg-slate-800 text-white px-4 py-2 rounded-lg">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Recibo Digital</p>
              {factura.numero_factura && (
                <p className="text-base font-black mt-0.5">{factura.numero_factura}</p>
              )}
            </div>
            <div className="mt-2 text-xs text-slate-600 space-y-0.5">
              <p><span className="font-semibold">Fecha de emisión:</span> {formatDateDisplay(factura.fecha_emision)}</p>
              <p><span className="font-semibold">Semana ganadera:</span> {factura.semana_nombre}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── DATOS DEL RECEPTOR ───────────────────────────────────── */}
      <div className="px-8 py-4 bg-slate-50 border-b border-slate-200">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div>
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Proveedor</span>
            <p className="font-bold text-slate-800 mt-0.5">{factura.tercero_nombre}</p>
            <p className="text-slate-500">Código: {factura.tercero_codigo}</p>
            {factura.tercero_rif && <p className="text-slate-500">RIF: {factura.tercero_rif}</p>}
          </div>
          <div>
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Tipo</span>
            <p className="font-semibold text-slate-700 mt-0.5">{tipoLabel}</p>
            <p className="text-slate-500 mt-1">
              Tasa inicio semana: {fmtNum(factura.tasa_miercoles, 3)} Bs/$
            </p>
            <p className="text-slate-500">
              Tasa fecha factura: {fmtNum(factura.tasa_factura, 3)} Bs/$
            </p>
          </div>
        </div>
      </div>

      {/* ── CUERPO: ÍTEMS ────────────────────────────────────────── */}
      <div className="px-8 py-4">
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col className="w-[42%]" />
            <col className="w-[13%]" />
            <col className="w-[16%]" />
            <col className="w-[13%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr className="border-b-2 border-slate-300">
              <th className="text-left py-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Concepto</th>
              <th className="text-right py-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Litros</th>
              <th className="text-right py-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Precio USD</th>
              <th className="text-right py-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Tasa</th>
              <th className="text-right py-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Total {sym}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">

            {/* Leche */}
            {(factura.tipo === 'ganadero' || factura.tipo === 'ganadero_transportista') && (
              <>
                <tr>
                  <td className="py-2.5 font-medium text-slate-700">Leche cruda — {fmtNum(factura.litros_a_pagar, 0)} L</td>
                  <td className="py-2.5 text-right text-slate-600">{fmtNum(factura.litros_a_pagar, 0)}</td>
                  <td className="py-2.5 text-right text-slate-600">{fmtUSD(factura.precio_leche_usd)}</td>
                  <td className="py-2.5 text-right text-slate-600">{fmtNum(factura.tasa_miercoles, 3)}</td>
                  <td className="py-2.5 text-right font-semibold text-slate-800">{fmt(display.base_bs)}</td>
                </tr>
                {(factura.tasa_factura !== factura.tasa_miercoles) && (
                  <tr className="bg-amber-50/50">
                    <td className="py-2 pl-4 text-amber-700 italic">
                      Nota de débito diferencial semana {factura.semana_nombre} — leche
                    </td>
                    <td className="py-2 text-right text-amber-600">{fmtNum(factura.litros_a_pagar, 0)}</td>
                    <td className="py-2 text-right text-amber-600">{fmtUSD(factura.precio_leche_usd)}</td>
                    <td className="py-2 text-right text-amber-600">
                      Δ {fmtNum(factura.tasa_factura - factura.tasa_miercoles, 3)}
                    </td>
                    <td className="py-2 text-right font-semibold text-amber-700">{fmt(display.nota_debito_leche_bs)}</td>
                  </tr>
                )}
              </>
            )}

            {/* Flete */}
            {incluyeFlete && factura.litros_flete != null && factura.precio_flete_usd != null && (
              <>
                <tr>
                  <td className="py-2.5 font-medium text-slate-700">
                    Servicio de flete — {fmtNum(factura.litros_flete, 0)} L
                  </td>
                  <td className="py-2.5 text-right text-slate-600">{fmtNum(factura.litros_flete, 0)}</td>
                  <td className="py-2.5 text-right text-slate-600">{fmtUSD(factura.precio_flete_usd)}</td>
                  <td className="py-2.5 text-right text-slate-600">{fmtNum(factura.tasa_miercoles, 3)}</td>
                  <td className="py-2.5 text-right font-semibold text-slate-800">{fmt(display.flete_bs)}</td>
                </tr>
                {(factura.tasa_factura !== factura.tasa_miercoles) && (
                  <tr className="bg-amber-50/50">
                    <td className="py-2 pl-4 text-amber-700 italic">
                      Nota de débito diferencial semana {factura.semana_nombre} — flete
                    </td>
                    <td className="py-2 text-right text-amber-600">{fmtNum(factura.litros_flete, 0)}</td>
                    <td className="py-2 text-right text-amber-600">{fmtUSD(factura.precio_flete_usd)}</td>
                    <td className="py-2 text-right text-amber-600">
                      Δ {fmtNum(factura.tasa_factura - factura.tasa_miercoles, 3)}
                    </td>
                    <td className="py-2 text-right font-semibold text-amber-700">{fmt(display.nota_debito_flete_bs)}</td>
                  </tr>
                )}
              </>
            )}

            {/* Transportista puro */}
            {factura.tipo === 'transportista' && factura.litros_flete != null && factura.precio_flete_usd != null && (
              <>
                <tr>
                  <td className="py-2.5 font-medium text-slate-700">
                    Servicio de flete — {fmtNum(factura.litros_flete, 0)} L
                  </td>
                  <td className="py-2.5 text-right text-slate-600">{fmtNum(factura.litros_flete, 0)}</td>
                  <td className="py-2.5 text-right text-slate-600">{fmtUSD(factura.precio_flete_usd ?? 0)}</td>
                  <td className="py-2.5 text-right text-slate-600">{fmtNum(factura.tasa_miercoles, 3)}</td>
                  <td className="py-2.5 text-right font-semibold text-slate-800">{fmt(display.flete_bs)}</td>
                </tr>
                {(factura.tasa_factura !== factura.tasa_miercoles) && (
                  <tr className="bg-amber-50/50">
                    <td className="py-2 pl-4 text-amber-700 italic">
                      Nota de débito diferencial semana {factura.semana_nombre} — flete
                    </td>
                    <td className="py-2 text-right text-amber-600">{fmtNum(factura.litros_flete, 0)}</td>
                    <td className="py-2 text-right text-amber-600">{fmtUSD(factura.precio_flete_usd ?? 0)}</td>
                    <td className="py-2 text-right text-amber-600">
                      Δ {fmtNum(factura.tasa_factura - factura.tasa_miercoles, 3)}
                    </td>
                    <td className="py-2 text-right font-semibold text-amber-700">{fmt(display.nota_debito_flete_bs)}</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── FOOTER: TOTALES ──────────────────────────────────────── */}
      <div className="px-8 pb-8">
        <div className="ml-auto max-w-xs space-y-1.5 border-t-2 border-slate-300 pt-3">

          {(factura.tasa_factura !== factura.tasa_miercoles) && (
            <FooterRow
              label="Total Nota de Débito"
              value={fmt(display.nota_debito_total_bs)}
              accent="amber"
            />
          )}

          {/* Subtotal = leche cruda − deducciones */}
          <FooterRow label="Subtotal" value={fmt(display.base_islr_bs)} />

          {incluyeFlete && display.flete_bs > 0 && (
            <FooterRow label="Flete" value={fmt(display.flete_bs)} />
          )}

          <div className="border-t border-slate-200 pt-1.5">
            <FooterRow label="ISLR retenido (1%)" value={`– ${fmt(display.islr_bs)}`} accent="orange" />
          </div>

          <div className="border-t-2 border-slate-800 pt-2">
            <div className="flex justify-between items-center">
              <span className="font-black text-slate-800 text-sm uppercase tracking-wide">Total a facturar</span>
              <span className="font-black text-slate-800 text-base">{fmt(display.total_bs)}</span>
            </div>
          </div>
        </div>

        {/* Notas */}
        {factura.notas && (
          <div className="mt-6 pt-4 border-t border-slate-200">
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Notas</p>
            <p className="text-xs text-slate-600">{factura.notas}</p>
          </div>
        )}

        {/* Pie legal */}
        <div className="mt-6 pt-4 border-t border-slate-200 text-[10px] text-slate-400 text-center">
          Documento emitido electrónicamente — Nómina Lechera
        </div>
      </div>
    </div>
  )
}

function FooterRow({
  label, value, accent,
}: {
  label: string
  value: string
  accent?: 'red' | 'amber' | 'orange'
}) {
  const color = accent === 'red'
    ? 'text-red-600'
    : accent === 'amber'
    ? 'text-amber-600'
    : accent === 'orange'
    ? 'text-orange-600'
    : 'text-slate-700'

  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className={`text-xs ${color}`}>{label}</span>
      <span className={`text-xs font-semibold ${color} whitespace-nowrap`}>{value}</span>
    </div>
  )
}
