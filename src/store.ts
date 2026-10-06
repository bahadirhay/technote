import { get, set, del } from 'idb-keyval'
import type { Notebook } from './types'

const KEY = 'technote:notebooks'

export const loadNotebooks = async (): Promise<Notebook[]> =>
  (await get<Notebook[]>(KEY)) ?? []

export const saveNotebooks = (nbs: Notebook[]) => set(KEY, nbs)

export const savePdf = (id: string, data: ArrayBuffer) => set(`technote:pdf:${id}`, data)
export const loadPdf = (id: string) => get<ArrayBuffer>(`technote:pdf:${id}`)
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
