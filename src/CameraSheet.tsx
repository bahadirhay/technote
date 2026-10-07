import { useEffect, useRef, useState } from 'react'

interface Props {
  onCapture: (photo: Blob) => void
  onClose: () => void
}

const explain = (e: unknown): string => {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError') return 'Kamera izni verilmedi. iPad: Ayarlar → Safari → Kamera bölümünden izin ver, sonra tekrar dene.'
  if (name === 'NotFoundError') return 'Bu cihazda kamera bulunamadı.'
  return 'Kamera açılamadı. Başka bir uygulama kamerayı kullanıyor olabilir.'
}

// Kamera: çek (fotoğraf), dondur / devam (önizlemeyi duraklat), kamera değiştir, kapat (durdur ve serbest bırak)
export default function CameraSheet({ onCapture, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [paused, setPaused] = useState(false)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState('')
  const [shots, setShots] = useState(0)

  useEffect(() => {
    let live = true
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop())
        stream.current = s
        const v = video.current!
        v.srcObject = s
        void v.play().catch(() => undefined)
        setReady(true)
        setPaused(false)
      })
      .catch((e) => live && setErr(explain(e)))
    return () => {
      live = false
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
    }
  }, [facing])

  const togglePause = () => {
    const v = video.current
    if (!v) return
    if (v.paused) {
      void v.play()
      setPaused(false)
    } else {
      v.pause()
      setPaused(true)
    }
  }

  const shoot = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob(
      (b) => {
        if (!b) return
        onCapture(b)
        setShots((n) => n + 1)
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <div className="camera" role="dialog" aria-label="Kamera">
      <video ref={video} playsInline muted autoPlay className={paused ? 'frozen' : ''} />
      {err && <p className="cam-msg err">{err}</p>}
      {!err && !ready && <p className="cam-msg">Kamera açılıyor…</p>}
      {shots > 0 && <p className="cam-count">{shots} fotoğraf sayfaya eklendi</p>}
      <div className="cam-bar">
        <button onClick={shoot} disabled={!ready || !!err} className="shutter" aria-label="Fotoğraf çek">📸 Çek</button>
        <button onClick={togglePause} disabled={!ready}>{paused ? '▶ Devam' : '⏸ Dondur'}</button>
        <button onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')} disabled={!ready && !err}>🔄 Çevir</button>
        <button onClick={onClose} className="stop">⏹ Kapat</button>
      </div>
    </div>
  )
}
