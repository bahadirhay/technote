import { get, set, del } from 'idb-keyval'
import type { Notebook } from './types'
import { downloadAudio, downloadImage, downloadPdf, removeAudio, uploadImage, uploadPdf } from './cloud'

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
const imgKey = (id: string) => `technote:img:${id}`
export const saveImage = async (id: string, blob: Blob) => {
  await uploadImage(id, blob)
  await set(imgKey(id), blob)
}
export const loadImage = async (id: string) => {
  const local = await get<Blob>(imgKey(id))
  if (local) return local
  const remote = await downloadImage(id)
  if (remote) await set(imgKey(id), remote)
  return remote
}

const audKey = (id: string) => `technote:aud:${id}`
// Ses SADECE cihazda saklanır, sunucuya yüklenmez (kullanıcı isterse kendi bulutuna kaydeder)
export const saveAudio = async (id: string, blob: Blob) => {
  await set(audKey(id), blob)
}
export const hasLocalAudio = async (id: string) => (await get<Blob>(audKey(id))) != null
// allowCloud: sadece eski sürümde sunucuya yüklenmiş kayıtlar için
export const loadAudio = async (id: string, allowCloud = false) => {
  const local = await get<Blob>(audKey(id))
  if (local || !allowCloud) return local
  const remote = await downloadAudio(id)
  if (remote) await set(audKey(id), remote)
  return remote
}
export const deleteAudio = async (id: string) => {
  await del(audKey(id))
  await removeAudio(id).catch(() => undefined)
}

export const deletePdf = (id: string) => del(`technote:pdf:${id}`)

const toB64 = (buf: ArrayBuffer) => {
  const u8 = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(bin)
}
const fromB64 = (b64: string) => {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf
}

export const exportBackup = async (nbs: Notebook[]) => {
  const pdfs: Record<string, string> = {}
  const images: Record<string, { type: string; b64: string }> = {}
  for (const nb of nbs) {
    for (const p of nb.pages) {
      if (p.pdf && !pdfs[p.pdf.docId]) {
        const buf = await loadPdf(p.pdf.docId)
        if (buf) pdfs[p.pdf.docId] = toB64(buf)
      }
      for (const im of p.images ?? []) {
        if (images[im.docId]) continue
        const blob = await loadImage(im.docId)
        if (blob) images[im.docId] = { type: blob.type, b64: toB64(await blob.arrayBuffer()) }
      }
    }
  }
  const blob = new Blob([JSON.stringify({ notebooks: nbs, pdfs, images })], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `technote-yedek-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export const importBackup = async (file: File): Promise<Notebook[]> => {
  const data = JSON.parse(await file.text()) as {
    notebooks: Notebook[]
    pdfs?: Record<string, string>
    images?: Record<string, { type: string; b64: string }>
  }
  for (const [id, b64] of Object.entries(data.pdfs ?? {})) await savePdf(id, fromB64(b64).buffer as ArrayBuffer)
  for (const [id, im] of Object.entries(data.images ?? {})) await saveImage(id, new Blob([fromB64(im.b64)], { type: im.type }))
  return data.notebooks
}
