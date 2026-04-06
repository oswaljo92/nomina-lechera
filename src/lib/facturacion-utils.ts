import type { FacturaCalcResult, FacturaDeduccion, Factura } from '@/types/facturacion'

// ── Semana ganadera helpers ──────────────────────────────────────────────────

/** Devuelve la fecha del miércoles de la semana ganadera correspondiente a una fecha ISO */
export function getWednesdayOfDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay() // 0=Dom, 3=Mié
  const daysFromWed = day < 3 ? day + 4 : day - 3
  const wed = new Date(d)
  wed.setDate(d.getDate() - daysFromWed)
  return `${wed.getFullYear()}-${String(wed.getMonth() + 1).padStart(2, '0')}-${String(wed.getDate()).padStart(2, '0')}`
}

/** Devuelve el miércoles de la semana actual */
export function getCurrentWednesday(): string {
  const now = new Date()
  return getWednesdayOfDate(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  )
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Formatea semana como "Mié 01/Ene – Mar 07/Ene/2025" */
export function formatSemanaGanadera(wednesdayIso: string): string {
  const wed = new Date(wednesdayIso + 'T12:00:00')
  const tue = new Date(wed)
  tue.setDate(wed.getDate() + 6)

  const wedDay = String(wed.getDate()).padStart(2, '0')
  const wedMes = MESES_CORTOS[wed.getMonth()]
  const tueDay = String(tue.getDate()).padStart(2, '0')
  const tueMes = MESES_CORTOS[tue.getMonth()]
  const tueYear = tue.getFullYear()

  return `Mié ${wedDay}/${wedMes} – Mar ${tueDay}/${tueMes}/${tueYear}`
}

/** Convierte "YYYY-MM-DD" a "DD/MM/YYYY" para display */
export function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

/** Devuelve el número de semana ISO (1-53) a partir de la fecha del miércoles */
export function getSemanaNumero(wednesdayIso: string): number {
  const d = new Date(wednesdayIso + 'T12:00:00')
  const day = d.getDay() || 7
  d.setDate(d.getDate() + 4 - day) // jueves más cercano
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// ── Cálculo de factura ───────────────────────────────────────────────────────

/**
 * Pipeline contable:
 *   pl_bs           = precio_leche_bs (3 dec) si viene; si no: round(precio_leche_usd × tasa_miercoles, 3)
 *   base_bs         = litros_a_pagar × pl_bs                                  (directo en Bs)
 *   nota_deb_leche  = litros_a_pagar × precio_usd × tasa_factura − base_bs     (diferencia a tasa emisión)
 *   flete_bs        = litros_flete × pf_bs                                     (si aplica)
 *   nota_deb_flete  = litros_flete × precio_flete_usd × tasa_factura − flete_bs
 *   subtotal_bs     = base_bs − ded_total  (leche cruda menos deducciones)
 *   islr_bs         = subtotal_bs × tasa_islr  (retención referencial, no afecta el total)
 *   total_bs        = subtotal_bs + flete_bs  (flete solo si ganadero_transportista o transportista)
 */
export const ISLR_TERCERO = 0.03        // 3%   — terceros (ruta 300)
export const ISLR_PROPIO  = 0.0099302   // 0.99302% — propios ganadero+transportista
export const ISLR_DEFAULT = 0.01        // 1%   — ganadero puro (sin flete)

export function calcularFactura(params: {
  litros_a_pagar: number
  litros_flete: number
  precio_leche_usd: number
  precio_flete_usd: number
  tasa_miercoles: number
  tasa_factura: number
  deducciones: Pick<FacturaDeduccion, 'monto_bs'>[]
  incluye_flete: boolean
  islr_rate?: number        // fracción: 0.03 = 3%, 0.0099302 = 0.99302% — si omitido usa ISLR_DEFAULT
  precio_leche_bs?: number  // precio directo en Bs/L con 3 decimales (de precios_semanales)
  precio_flete_bs?: number  // precio flete directo en Bs/L con 3 decimales
}): FacturaCalcResult {
  const {
    litros_a_pagar, litros_flete,
    precio_leche_usd, precio_flete_usd,
    tasa_miercoles, tasa_factura,
    deducciones, incluye_flete,
    islr_rate = ISLR_DEFAULT,
    precio_leche_bs: pl_bs_raw,
    precio_flete_bs: pf_bs_raw,
  } = params

  // Precio en Bs/L con 3 decimales: usa el valor directo si viene, sino lo deriva de USD × tasa
  const pl_bs = (pl_bs_raw != null && pl_bs_raw > 0)
    ? Math.round(pl_bs_raw * 1000) / 1000
    : Math.round(precio_leche_usd * tasa_miercoles * 1000) / 1000
  const pf_bs = (pf_bs_raw != null && pf_bs_raw > 0)
    ? Math.round(pf_bs_raw * 1000) / 1000
    : Math.round(precio_flete_usd * tasa_miercoles * 1000) / 1000

  const base_bs = litros_a_pagar * pl_bs

  // Tasas redondeadas a 4 decimales — solo para el cálculo de la ND
  const tm4 = Math.round(tasa_miercoles * 10000) / 10000
  const tf4 = Math.round(tasa_factura   * 10000) / 10000
  const pl_bs_nd = (pl_bs_raw != null && pl_bs_raw > 0)
    ? Math.round(pl_bs_raw * 1000) / 1000
    : Math.round(precio_leche_usd * tm4 * 1000) / 1000
  const pf_bs_nd = (pf_bs_raw != null && pf_bs_raw > 0)
    ? Math.round(pf_bs_raw * 1000) / 1000
    : Math.round(precio_flete_usd * tm4 * 1000) / 1000
  const base_bs_nd = litros_a_pagar * pl_bs_nd

  // Nota de débito: monto total a tasa emisión (4 dec) menos base a tasa inicio semana (4 dec)
  const nota_debito_leche_bs = litros_a_pagar * precio_leche_usd * tf4 - base_bs_nd

  let flete_bs = 0
  let nota_debito_flete_bs = 0
  if (incluye_flete && litros_flete > 0 && pf_bs > 0) {
    flete_bs = litros_flete * pf_bs
    const flete_bs_nd = litros_flete * pf_bs_nd
    nota_debito_flete_bs = litros_flete * precio_flete_usd * tf4 - flete_bs_nd
  }

  // Total ND redondeado a 2 decimales para registro contable
  const nota_debito_total_bs = Math.round((nota_debito_leche_bs + nota_debito_flete_bs) * 100) / 100
  const deducciones_total_bs = deducciones.reduce((s, d) => s + Number(d.monto_bs), 0)
  const subtotal_bs = base_bs - deducciones_total_bs  // leche cruda − deducciones
  const base_islr_bs = subtotal_bs  // alias para display "Subtotal"
  const islr_bs = flete_bs * islr_rate  // ISLR sólo sobre servicio de flete (no sobre leche)
  const total_bs = subtotal_bs + (incluye_flete ? flete_bs : 0)

  return {
    base_bs,
    flete_bs,
    nota_debito_leche_bs,
    nota_debito_flete_bs,
    nota_debito_total_bs,
    subtotal_bs,
    deducciones_total_bs,
    base_islr_bs,
    islr_bs,
    total_bs,
  }
}

// ── Conversión USD ────────────────────────────────────────────────────────────

/** Convierte montos de Bs a USD usando tasa_factura */
export function calcToUSD(calc: FacturaCalcResult, tasa: number): FacturaCalcResult {
  if (!tasa || tasa === 0) return calc
  return {
    base_bs: calc.base_bs / tasa,
    flete_bs: calc.flete_bs / tasa,
    nota_debito_leche_bs: calc.nota_debito_leche_bs / tasa,
    nota_debito_flete_bs: calc.nota_debito_flete_bs / tasa,
    nota_debito_total_bs: calc.nota_debito_total_bs / tasa,
    subtotal_bs: calc.subtotal_bs / tasa,
    deducciones_total_bs: calc.deducciones_total_bs / tasa,
    base_islr_bs: calc.base_islr_bs / tasa,
    islr_bs: calc.islr_bs / tasa,
    total_bs: calc.total_bs / tasa,
  }
}

// ── Formato numérico ──────────────────────────────────────────────────────────

export function fmtBs(n: number): string {
  return `Bs ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtUSD(n: number): string {
  return `$ ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtNum(n: number, decimals = 3): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function fmtMonto(n: number, currency: 'bs' | 'usd'): string {
  return currency === 'bs' ? fmtBs(n) : fmtUSD(n)
}

// ── Naming de archivos ────────────────────────────────────────────────────────

/** Sanitiza un string para usarlo como nombre de archivo en todos los SO */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 200)
}

/** Construye el nombre de archivo de una factura según el tipo */
export function buildFacturaFilename(factura: Pick<Factura, 'tipo' | 'tercero_codigo' | 'tercero_nombre'>): string {
  // tipo 'ganadero_transportista': codigo ya contiene "G001-T002"
  return sanitizeFilename(`${factura.tercero_codigo} - ${factura.tercero_nombre}`)
}
