import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { toPng } from 'html-to-image'
import JSZip from 'jszip'
import { buildFacturaFilename } from './facturacion-utils'
import type { Factura } from '@/types/facturacion'

// ── Helpers de descarga ───────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Captura de elemento HTML ──────────────────────────────────────────────────

async function captureElement(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
  })
}

// ── Exportar a PDF ────────────────────────────────────────────────────────────

export async function exportFacturaToPDFBlob(elementId: string): Promise<Blob> {
  const el = document.getElementById(elementId)
  if (!el) throw new Error(`Elemento #${elementId} no encontrado`)

  // Ocultar botones no imprimibles
  const toHide = el.querySelectorAll<HTMLElement>('.no-print')
  toHide.forEach(e => { e.dataset.origDisplay = e.style.display; e.style.display = 'none' })

  const canvas = await captureElement(el)

  toHide.forEach(e => { e.style.display = e.dataset.origDisplay || '' })

  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pdfW = pdf.internal.pageSize.getWidth()
  const pdfH = (canvas.height * pdfW) / canvas.width
  pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH)

  return pdf.output('blob')
}

export async function downloadFacturaPDF(elementId: string, factura: Pick<Factura, 'tipo' | 'tercero_codigo' | 'tercero_nombre'>): Promise<void> {
  const blob = await exportFacturaToPDFBlob(elementId)
  downloadBlob(blob, `${buildFacturaFilename(factura)}.pdf`)
}

// ── Exportar a imagen PNG ─────────────────────────────────────────────────────

export async function exportFacturaToImageBlob(elementId: string): Promise<Blob> {
  const el = document.getElementById(elementId)
  if (!el) throw new Error(`Elemento #${elementId} no encontrado`)

  const toHide = el.querySelectorAll<HTMLElement>('.no-print')
  toHide.forEach(e => { e.dataset.origDisplay = e.style.display; e.style.display = 'none' })

  const dataUrl = await toPng(el, {
    backgroundColor: '#ffffff',
    pixelRatio: 2,
    width: el.scrollWidth,
    height: el.scrollHeight,
    style: { overflow: 'visible' },
  })

  toHide.forEach(e => { e.style.display = e.dataset.origDisplay || '' })

  const res = await fetch(dataUrl)
  return res.blob()
}

export async function downloadFacturaImage(elementId: string, factura: Pick<Factura, 'tipo' | 'tercero_codigo' | 'tercero_nombre'>): Promise<void> {
  const blob = await exportFacturaToImageBlob(elementId)
  downloadBlob(blob, `${buildFacturaFilename(factura)}.png`)
}

// ── Exportar masivo en ZIP ────────────────────────────────────────────────────

export type BulkExportFormat = 'pdf' | 'png'

export interface BulkExportItem {
  elementId: string
  factura: Pick<Factura, 'tipo' | 'tercero_codigo' | 'tercero_nombre'>
}

export async function exportFacturasToZip(
  items: BulkExportItem[],
  format: BulkExportFormat,
  zipName: string,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const zip = new JSZip()

  for (let i = 0; i < items.length; i++) {
    const { elementId, factura } = items[i]
    try {
      let blob: Blob
      if (format === 'pdf') {
        blob = await exportFacturaToPDFBlob(elementId)
        zip.file(`${buildFacturaFilename(factura)}.pdf`, blob)
      } else {
        blob = await exportFacturaToImageBlob(elementId)
        zip.file(`${buildFacturaFilename(factura)}.png`, blob)
      }
    } catch (err) {
      console.error(`Error exportando factura ${elementId}:`, err)
    }
    onProgress?.(i + 1, items.length)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, zipName)
}
