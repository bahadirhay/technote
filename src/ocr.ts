import { supabase } from './cloud'

export class OcrFailure extends Error {}

const KNOWN: Record<string, string> = {
  not_configured: 'El yazısı çevirme henüz kurulmadı (sunucuda anahtar eksik veya geçersiz).',
  unauthorized: 'Oturumun süresi dolmuş, çıkış yapıp tekrar gir.',
  forbidden: 'Bu özellik için hesabının onaylı olması gerekir.',
  rate_limited: 'Google ücretsiz kotası şu an dolu, biraz bekleyip tekrar dene.',
  daily_limit: 'Bugünlük el yazısı çevirme hakkın doldu, yarın tekrar dene.',
  refused: 'Bu yazı çevrilemedi (içerik reddedildi).',
}

// PNG (base64) -> okunan yazı. Hata olursa kullanıcıya gösterilecek mesajla OcrFailure fırlatır.
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
    throw new OcrFailure('Bağlantı hatası, tekrar dene.')
  }
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string; status?: number; detail?: string }
  if (!res.ok) {
    if (body.error && KNOWN[body.error]) throw new OcrFailure(KNOWN[body.error] + (body.detail ? ` [${body.detail}]` : ''))
    if (!body.error && res.status === 404) throw new OcrFailure('El yazısı çevirme sunucuda bulunamadı (api/ocr yayında değil).')
    const what = [body.error ?? `HTTP ${res.status}`, body.status].filter(Boolean).join(' ')
    throw new OcrFailure(`El yazısı çevrilemedi (${what}${body.detail ? `: ${body.detail}` : ''})`)
  }
  return (body.text ?? '').trim()
}

// Hesabım ekranındaki test: tuvale "Merhaba dünya 123" yazıp servise okutur
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
