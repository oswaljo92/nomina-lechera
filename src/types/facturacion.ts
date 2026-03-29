export type TipoFactura = 'ganadero' | 'transportista' | 'ganadero_transportista'
export type EstadoFactura = 'borrador' | 'emitida' | 'anulada'

export interface DeduccionCatalogo {
  id: string
  codigo: string
  nombre: string
  activo: boolean
  created_at: string
}

export interface FacturaDeduccion {
  id?: string
  factura_id?: string
  codigo: string
  nombre: string
  monto_bs: number
  created_at?: string
}

export interface Factura {
  id: string
  fabrica_id: string

  semana_fecha: string   // ISO date (miércoles)
  semana_nombre: string  // "Mié DD/MMM – Mar DD/MMM/YYYY"

  tipo: TipoFactura
  ganadero_id: string | null
  ruta_id: string | null
  tercero_codigo: string
  tercero_nombre: string
  tercero_rif: string | null

  fecha_emision: string
  numero_factura: string | null

  tasa_miercoles: number
  tasa_factura: number

  precio_leche_usd: number
  precio_flete_usd: number | null

  litros_a_pagar: number
  litros_flete: number | null

  base_bs: number
  flete_bs: number | null
  nota_debito_leche_bs: number
  nota_debito_flete_bs: number | null
  nota_debito_total_bs: number
  subtotal_bs: number
  deducciones_total_bs: number
  base_islr_bs: number
  islr_bs: number
  total_bs: number

  emisor_razon_social: string
  emisor_rif: string
  emisor_direccion: string

  estado: EstadoFactura
  notas: string | null
  created_at: string
  updated_at: string

  // Joined data
  facturas_deducciones?: FacturaDeduccion[]
  fabricas?: { nombre: string; codigo: string }
}

export interface FacturaCalcResult {
  base_bs: number
  flete_bs: number
  nota_debito_leche_bs: number
  nota_debito_flete_bs: number
  nota_debito_total_bs: number
  subtotal_bs: number
  deducciones_total_bs: number
  base_islr_bs: number
  islr_bs: number
  total_bs: number
}

export interface FacturaFormData {
  fabrica_id: string
  tipo: TipoFactura
  ganadero_id: string | null
  ruta_id: string | null
  tercero_codigo: string
  tercero_nombre: string
  tercero_rif: string
  semana_fecha: string
  semana_nombre: string
  fecha_emision: string
  numero_factura: string
  tasa_miercoles: number
  tasa_factura: number
  precio_leche_usd: number
  precio_flete_usd: number
  litros_a_pagar: number
  litros_flete: number
  deducciones: FacturaDeduccion[]
  emisor_razon_social: string
  emisor_rif: string
  emisor_direccion: string
  notas: string
}
