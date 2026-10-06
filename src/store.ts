import { get, set, del } from 'idb-keyval'
import type { Notebook } from './types'
import { downloadPdf, uploadPdf } from './cloud'

const KEY = 'technote:notebooks'

export const loadNotebooks = async (): Promise<Notebook[]> =>
  (await get<Notebook[]>(KEY)) ?? []


// Eski (hesapsız) sürümden kalan yerel defterler
export const loadLegacyNotebooks = loadNotebooks
export const clearLegacyNotebooks = () => del(KEY)

const pdfKey = (id: string) => `technote:pdf:${id}`

// PDF: önce buluta yükle, sonra cihaz önbelleğine yaz
export const savePdf = async (id: string, data: ArrayBuffer) => {
  await uploadPdf(id, data)
  await set(pdfKey(id), data)
}
export const loadLocalPdf = (id: string) => get<ArrayBuffer>(pdfKey(id))
export const loadPdf = async (id: string) => {
  const local = await get<ArrayBuffer>(pdfKey(id))
  if (local) return local
  const remote = await downloadPdf(id)
  if (remote) await set(pdfKey(id), remote)
  return remote
}
export const deletePdf = (id: string) => del(`technote:pdf:${id}`)

export const exportBackup = async (nbs: Notebook[]) => {
  const pdfs: Record<string, string> = {}
  const ids = new Set(nbs.flatMap((n) => n.pages.flatMap((p) => (p.pdf ? [p.pdf.docId] : []))))
  for (const id of ids) {
    const buf = await loadPdf(id)
    if (buf) {
      const u8 = new Uint8Array(buf)
      let bin = ''
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000))
      pdfs[id] = btoa(bin)
    }
  }
  const blob = new Blob([JSON.stringify({ notebooks: nbs, pdfs })], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `technote-yedek-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export const importBackup = async (file: File): Promise<Notebook[]> => {
  const data = JSON.parse(await file.text()) as { notebooks: Notebook[]; pdfs: Record<string, string> }
  for (const [id, b64] of Object.entries(data.pdfs ?? {})) {
    const bin = atob(b64)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    await savePdf(id, buf.buffer)
  }
  return data.notebooks
}
