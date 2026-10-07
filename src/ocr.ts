import { supabase } from './cloud'

// message: kullanıcıya gösterilecek sade metin. technical: sadece yönetici ekranında gösterilir.
export class OcrFailure extends Error {
  unavailable: boolean
  technical: string
  constructor(message: string, unavailable = false, technical = '') {
    super(message)
    this.unavailable = unavailable
    this.technical = technical
  }
}

const UNAVAILABLE = 'El yazısı çevirme şu an kullanılamıyor. Biraz sonra tekrar dene.'
const GENERIC = 'El yazısı şu an çevrilemedi, biraz sonra tekrar dene.'

const FRIENDLY: Record<string, string> = {
  unauthorized: 'Oturumun süresi dolmuş, çıkış yapıp tekrar gir.',
  forbidden: 'Bu özellik için hesabının onaylı olması gerekir.',
  rate_limited: 'Ücretsiz çeviri kotası şu an dolu, biraz bekleyip tekrar dene.',
  daily_limit: 'Bugünlük el yazısı çevirme hakkın doldu, yarın tekrar dene.',
  refused: 'Bu yazı çevrilemedi.',
}

export interface OcrStatus {
  ready: boolean
  provider?: 'gemini' | 'claude' | null
  altModel?: string | null
  altHost?: string | null
  altModels?: string[] | null
  missing: string[]
}

let status: Promise<OcrStatus> | null = null

// Son başarılı çevirmeyi hangi servis yaptı (sadece yönetici testinde gösterilir)
export let lastProvider = ''

// Sunucuda servis kurulu mu? (oturum başına bir kez sorulur)
export const ocrStatus = (): Promise<OcrStatus> => {
  status ??= fetch('/api/ocr', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<OcrStatus>) : { ready: false, missing: ['api/ocr yayında değil'] }))
    .catch(() => ({ ready: false, missing: ['sunucuya ulaşılamadı'] }))
  return status
}
export const ocrAvailable = async () => (await ocrStatus()).ready
export const markOcrUnavailable = (missing: string[]) => {
  status = Promise.resolve({ ready: false, missing })
}

// PNG (base64) -> okunan yazı. Hata olursa OcrFailure fırlatır.
export const readHandwriting = async (b64: string): Promise<string> => {
  const { data } = await supabase.auth.getSession()
  let res: Response
  try {
    res = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ image: b64 }),
    })
  } catch {
    throw new OcrFailure('Bağlantı hatası, tekrar dene.', false, 'fetch başarısız')
  }
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string; status?: number; detail?: string; provider?: string }
  if (!res.ok) {
    const tech = [body.error ?? `HTTP ${res.status}`, body.status, body.detail].filter(Boolean).join(' · ')
    if (body.error === 'not_configured' || (!body.error && res.status === 404)) {
      markOcrUnavailable([body.detail ?? tech])
      throw new OcrFailure(UNAVAILABLE, true, tech)
    }
    if (body.error && FRIENDLY[body.error]) throw new OcrFailure(FRIENDLY[body.error], false, tech)
    throw new OcrFailure(GENERIC, false, tech)
  }
  lastProvider = body.provider ?? ''
  return (body.text ?? '').trim()
}

// Yönetici testi: tuvale "Merhaba dünya 123" yazıp servise okutur
export const selfTest = async (): Promise<string> => {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 160
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#000'
  ctx.font = '64px "Bradley Hand", "Marker Felt", cursive, sans-serif'
  ctx.fillText('Merhaba dünya 123', 24, 100)
  return readHandwriting(c.toDataURL('image/png').split(',')[1])
}
