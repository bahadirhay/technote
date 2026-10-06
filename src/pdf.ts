import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PAGE_H, PAGE_W } from './types'
import { loadPdf } from './store'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const docs = new Map<string, Promise<pdfjs.PDFDocumentProxy>>()

export const openPdf = (docId: string, data?: ArrayBuffer) => {
  let d = docs.get(docId)
  if (!d) {
    d = (async () => {
      const buf = data ?? (await loadPdf(docId))
      if (!buf) throw new Error('PDF bulunamadı')
      return pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise
    })()
    docs.set(docId, d)
  }
  return d
}

// PDF sayfasini 800x1100 sayfa alanina oranini koruyarak sigdirir
export const renderPdfPage = async (docId: string, pageNum: number) => {
  const doc = await openPdf(docId)
  const page = await doc.getPage(pageNum)
  const base = page.getViewport({ scale: 1 })
  const fit = Math.min(PAGE_W / base.width, PAGE_H / base.height)
  const out = 2
  const vp = page.getViewport({ scale: fit * out })
  const c = document.createElement('canvas')
  c.width = PAGE_W * out
  c.height = PAGE_H * out
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.translate((c.width - vp.width) / 2, (c.height - vp.height) / 2)
  await page.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise
  return c
}
