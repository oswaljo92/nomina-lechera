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

// ── Cálculo de factura ───────────────────────────────────────────────────────

/**
 * Pipeline contable (Opción A — confirmado por usuario):
 *   base_bs         = litros_a_pagar × precio_leche_usd × tasa_miercoles
 *   nota_deb_leche  = litros_a_pagar × precio_leche_usd × (tasa_factura − tasa_miercoles)
 *   flete_bs        = litros_flete × precio_flete_usd × tasa_miercoles  (si aplica)
 *   nota_deb_flete  = litros_flete × precio_flete_usd × (tasa_factura − tasa_miercoles)  (si aplica)
 *   subtotal_bs     = base_bs  (solo leche base, per spec)
 *   ded_total       = Σ deducciones
 *   base_islr       = subtotal_bs − ded_total
 *   islr_bs         = base_islr × 1%
 *   total_bs        = base_islr + islr_bs  (= base_islr × 1.01, per spec)
 */
export function calcularFactura(params: {
  litros_a_pagar: number
  litros_flete: number
  precio_leche_usd: number
  precio_flete_usd: number
  tasa_miercoles: number
  tasa_factura: number
  deducciones: Pick<FacturaDeduccion, 'monto_bs'>[]
  incluye_flete: boolean
}): FacturaCalcResult {
  const {
    litros_a_pagar, litros_flete,
    precio_leche_usd, precio_flete_usd,
    tasa_miercoles, tasa_factura,
    deducciones, incluye_flete,
  } = params

  const base_bs = litros_a_pagar * precio_leche_usd * tasa_miercoles
  const nota_debito_leche_bs = litros_a_pagar * precio_leche_usd * (tasa_factura - tasa_miercoles)

  let flete_bs = 0
  let nota_debito_flete_bs = 0
  if (incluye_flete && litros_flete > 0 && precio_flete_usd > 0) {
    flete_bs = litros_flete * precio_flete_usd * tasa_miercoles
    // Fórmula simétrica a leche (se omite el tasa_miercoles duplicado del spec — typo)
    nota_debito_flete_bs = litros_flete * precio_flete_usd * (tasa_factura - tasa_miercoles)
  }

  const nota_debito_total_bs = nota_debito_leche_bs + nota_debito_flete_bs
  const subtotal_bs = base_bs // Por spec: subtotal = solo base leche
  const deducciones_total_bs = deducciones.reduce((s, d) => s + Number(d.monto_bs), 0)
  const base_islr_bs = subtotal_bs - deducciones_total_bs
  const islr_bs = base_islr_bs * 0.01
  const total_bs = base_islr_bs + islr_bs // Por spec: total = base_islr × 1.01

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
