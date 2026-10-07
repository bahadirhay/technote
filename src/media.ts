// Ses kaydedici: başlat / duraklat / devam / durdur. Süre, duraklatılan zamanları saymaz.

export const pickAudioMime = (): string => {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const t of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t
  }
  return ''
}

export type RecState = 'recording' | 'paused' | 'stopped'

export interface RecResult {
  blob: Blob
  durationMs: number
  mime: string
}

export class AudioRecorder {
  state: RecState = 'recording'
  private mr: MediaRecorder
  private stream: MediaStream
  private chunks: Blob[] = []
  private t0 = 0
  private pausedTotal = 0
  private pausedAt = 0
  private wake: WakeLockSentinel | null = null

  private constructor(stream: MediaStream, mr: MediaRecorder) {
    this.stream = stream
    this.mr = mr
    mr.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data)
    }
  }

  // Mikrofon izni, kullanıcı dokunuşuyla çağrılınca sorulur
  static async create(): Promise<AudioRecorder> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    const mime = pickAudioMime()
    const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 48000 })
    const r = new AudioRecorder(stream, mr)
    mr.start(1000)
    r.t0 = performance.now()
    // Ekran kapanmasın (en iyi çaba). Uygulama değişirse kayıt yine de durabilir.
    try {
      r.wake = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      r.wake = null
    }
    return r
  }

  // Duraklatma süreleri hariç, kaydın şu anki ms'si
  ms(): number {
    const now = this.state === 'paused' ? this.pausedAt : performance.now()
    return Math.max(0, now - this.t0 - this.pausedTotal)
  }

  pause() {
    if (this.state !== 'recording') return
    this.mr.pause()
    this.pausedAt = performance.now()
    this.state = 'paused'
  }

  resume() {
    if (this.state !== 'paused') return
    this.mr.resume()
    this.pausedTotal += performance.now() - this.pausedAt
    this.state = 'recording'
  }

  // İşletim sistemi mikrofonu keserse (arka plana geçme vb.) iz biter
  isDead(): boolean {
    return this.stream.getAudioTracks().every((t) => t.readyState === 'ended')
  }

  private release() {
    this.stream.getTracks().forEach((t) => t.stop())
    void this.wake?.release().catch(() => undefined)
    this.wake = null
  }

  stop(): Promise<RecResult> {
    const durationMs = this.ms()
    if (this.state === 'paused') this.pausedTotal += performance.now() - this.pausedAt
    this.state = 'stopped'
    return new Promise((resolve) => {
      const finish = () => {
        this.release()
        const mime = this.mr.mimeType || pickAudioMime() || 'audio/mp4'
        resolve({ blob: new Blob(this.chunks, { type: mime }), durationMs, mime })
      }
      if (this.mr.state === 'inactive') return finish()
      this.mr.onstop = finish
      this.mr.stop()
    })
  }

  // Kaydetmeden bırak (mikrofonu serbest bırakır)
  cancel() {
    this.state = 'stopped'
    try {
      if (this.mr.state !== 'inactive') this.mr.stop()
    } catch {
      /* yok say */
    }
    this.release()
  }
}

export const fmtClock = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export const fmtDate = (t: number): string =>
  new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
