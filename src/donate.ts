// Anonim el yazısı kütüphanesi: kullanıcı izin verirse çevrilen yazı + kalem çizgileri kaydedilir.
import { supabase } from './cloud'
import type { Stroke } from './types'

const KEY = 'technote:donate'

// 'on' | 'off' | null (henüz sorulmadı)
export const donateState = (): 'on' | 'off' | null => {
  try {
    const v = localStorage.getItem(KEY)
    return v === '1' ? 'on' : v === '0' ? 'off' : null
  } catch {
    return null
  }
}
export const setDonate = (on: boolean) => {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* yok say */ }
}

// İlk çeviride bir kez sorar
export const askDonate = (): boolean => {
  const s = donateState()
  if (s) return s === 'on'
  const ok = confirm(
    'Uygulamayı geliştirmek için el yazını ANONİM olarak saklayalım mı?\n\n' +
      '• Sadece kalem çizgileri ve çevrilen yazı saklanır; adın, defterin, sayfan saklanmaz.\n' +
      '• Amaç: Türkçe el yazısını ücretsiz ve cihazda tanıyan kendi sistemimizi eğitmek.\n' +
      '• İstediğin an Hesabım\'dan kapatabilirsin. Anonim olduğu için geçmiş kayıtlar sonradan ayıklanamaz.\n\n' +
      'Tamam = izin veriyorum, İptal = saklama.',
  )
  setDonate(ok)
  return ok
}

const slim = (strokes: Stroke[]) =>
  strokes.map((s) => ({ t: s.tool, w: s.width, p: s.points.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 100) / 100]) }))

export const sendSample = async (strokes: Stroke[], text: string): Promise<string | null> => {
  if (!askDonate()) return null
  try {
    const { data, error } = await supabase.rpc('ink_donate', { p_strokes: slim(strokes), p_text: text })
    return error || !data ? null : (data as string)
  } catch {
    return null
  }
}

export const sendCorrection = async (id: string, text: string) => {
  if (donateState() !== 'on') return
  try { await supabase.rpc('ink_correct', { p_id: id, p_text: text }) } catch { /* yok say */ }
}
