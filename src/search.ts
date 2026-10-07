import type { Notebook, Page } from './types'

// Sayfadaki aranabilir tüm yazı: yazı kutuları + notlar (yazılı) + arka planda tanınan el yazısı
export const pageText = (p: Page): string =>
  [p.searchText ?? '', ...p.texts.map((t) => t.text), ...(p.notes ?? []).map((n) => n.text)].join('\n').trim()

export interface Hit {
  nbId: string
  nbName: string
  nbColor: string
  pageIndex: number
  snippet: string
}

const norm = (s: string) => s.toLocaleLowerCase('tr')

export const searchNotebooks = (nbs: Notebook[], query: string, limit = 40): Hit[] => {
  const q = norm(query.trim())
  if (q.length < 2) return []
  const hits: Hit[] = []
  for (const nb of nbs) {
    if (norm(nb.name).includes(q)) hits.push({ nbId: nb.id, nbName: nb.name, nbColor: nb.color, pageIndex: 0, snippet: 'Defter adı' })
    nb.pages.forEach((p, i) => {
      const text = pageText(p)
      const at = norm(text).indexOf(q)
      if (at < 0) return
      const from = Math.max(0, at - 24)
      const snippet = (from > 0 ? '…' : '') + text.slice(from, at + q.length + 48).replace(/\s+/g, ' ')
      hits.push({ nbId: nb.id, nbName: nb.name, nbColor: nb.color, pageIndex: i, snippet })
    })
  }
  return hits.slice(0, limit)
}

// "Arama için el yazısını tanı" ayarı (Hesabım'dan kapatılabilir)
export const indexEnabled = (): boolean => {
  try {
    return localStorage.getItem('technote:index') !== '0'
  } catch {
    return true
  }
}
export const setIndexEnabled = (on: boolean) => {
  try {
    localStorage.setItem('technote:index', on ? '1' : '0')
  } catch {
    /* yok say */
  }
}
