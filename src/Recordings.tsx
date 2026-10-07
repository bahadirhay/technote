import { useEffect, useRef, useState } from 'react'
import { fmtClock, fmtDate } from './media'
import { loadAudio } from './store'
import type { Recording } from './types'

export interface Jump {
  id: string
  ms: number
  n: number
}

interface Props {
  recordings: Recording[]
  jump: Jump | null
  onClose: () => void
  onDelete: (id: string) => void
  onRename: (id: string) => void
}

// Kayıtlar: dinle / duraklat / durdur, ileri-geri sar, hız; küçültünce yazarken dinlemeye devam eder
export default function Recordings({ recordings, jump, onClose, onDelete, onRename }: Props) {
  const audio = useRef<HTMLAudioElement>(null)
  const [cur, setCur] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [mini, setMini] = useState(false)
  const [err, setErr] = useState('')
  const pending = useRef<{ ms: number; play: boolean } | null>(null)
  const rec = recordings.find((r) => r.id === cur)

  const select = async (id: string, atMs = 0, play = true) => {
    setErr('')
    const blob = await loadAudio(id)
    if (!blob) return setErr('Ses dosyası bulunamadı.')
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(blob)
    })
    pending.current = { ms: atMs, play }
    setCur(id)
    setT(atMs)
  }

  // Çizgiden "buradan dinle"
  useEffect(() => {
    if (jump) void select(jump.id, jump.ms, true)
  }, [jump?.n])

  useEffect(
    () => () => {
      audio.current?.pause()
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return ''
      })
    },
    [],
  )

  const applyPending = () => {
    const a = audio.current
    const p = pending.current
    if (!a || !p) return
    pending.current = null
    a.playbackRate = speed
    a.currentTime = p.ms / 1000
    if (p.play) a.play().catch(() => setErr('Oynatma için bir kez daha ▶ düğmesine dokun.'))
  }

  const toggle = () => {
    const a = audio.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }
  const stopPlay = () => {
    const a = audio.current
    if (!a) return
    a.pause()
    a.currentTime = 0
    setT(0)
  }
  const seek = (ms: number) => {
    const a = audio.current
    if (a) a.currentTime = ms / 1000
    setT(ms)
  }

  return (
    <div className={`recpanel ${mini ? 'mini' : ''}`} role="dialog" aria-label="Kayıtlar">
      <div className="rp-head">
        <strong>🎧 Kayıtlar</strong>
        <span className="spacer" />
        <button onClick={() => setMini(!mini)}>{mini ? '▲ Aç' : '▼ Küçült'}</button>
        <button onClick={onClose} aria-label="Kapat">✕</button>
      </div>

      {rec && (
        <div className="rp-player">
          <audio
            ref={audio}
            src={url}
            preload="auto"
            onCanPlay={applyPending}
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime * 1000)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
          <div className="rp-now">{rec.name}</div>
          <div className="rp-ctl">
            <button className="on" onClick={toggle}>{playing ? '⏸ Duraklat' : '▶ Oynat'}</button>
            <button onClick={stopPlay}>⏹ Durdur</button>
            <button onClick={() => seek(Math.max(0, t - 10000))}>⟲ 10</button>
            <button onClick={() => seek(Math.min(rec.durationMs, t + 10000))}>10 ⟳</button>
            <select
              value={speed}
              onChange={(e) => {
                setSpeed(+e.target.value)
                if (audio.current) audio.current.playbackRate = +e.target.value
              }}
            >
              {[1, 1.25, 1.5, 2].map((s) => (
                <option key={s} value={s}>{s}×</option>
              ))}
            </select>
          </div>
          <div className="rp-seek">
            <span>{fmtClock(t)}</span>
            <input type="range" min={0} max={Math.max(1, rec.durationMs)} step={500} value={Math.min(t, rec.durationMs)} onChange={(e) => seek(+e.target.value)} />
            <span>{fmtClock(rec.durationMs)}</span>
          </div>
        </div>
      )}
      {err && <p className="err rp-err">{err}</p>}

      {!mini && (
        <ul className="rp-list">
          {recordings.length === 0 && <li className="muted pad">Henüz kayıt yok. 🎙 Kayıt düğmesiyle başla.</li>}
          {[...recordings].reverse().map((r) => (
            <li key={r.id} className={r.id === cur ? 'on' : ''}>
              <div className="rp-meta">
                <strong>{r.name}</strong>
                <span className="muted">{fmtDate(r.startedAt)} · {fmtClock(r.durationMs)} · {(r.size / 1048576).toFixed(1)} MB</span>
              </div>
              <button onClick={() => void select(r.id, 0, true)}>▶ Dinle</button>
              <button onClick={() => onRename(r.id)} aria-label="Adı değiştir">✎</button>
              <button onClick={() => onDelete(r.id)} aria-label="Sil">🗑</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
