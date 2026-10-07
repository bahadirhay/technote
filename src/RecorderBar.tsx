import { fmtClock } from './media'

export type RecUi = 'idle' | 'recording' | 'paused' | 'saving'

interface Props {
  state: RecUi
  ms: number
  error: string
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onClose: () => void
}

// Ses kaydı çubuğu: başlat / duraklat / devam / durdur
export default function RecorderBar({ state, ms, error, onStart, onPause, onResume, onStop, onClose }: Props) {
  return (
    <div className={`recbar ${state}`}>
      <span className="recdot" aria-hidden />
      {state === 'idle' && <span className="reclabel">Ses kaydı</span>}
      {state === 'recording' && <span className="reclabel">Kaydediliyor</span>}
      {state === 'paused' && <span className="reclabel">Duraklatıldı</span>}
      {state === 'saving' && <span className="reclabel">Kayıt saklanıyor…</span>}
      {state !== 'idle' && state !== 'saving' && <span className="rectime">{fmtClock(ms)}</span>}
      <span className="spacer" />
      {state === 'idle' && (
        <>
          <button className="on" onClick={onStart}>⏺ Başlat</button>
          <button onClick={onClose}>✕</button>
        </>
      )}
      {state === 'recording' && (
        <>
          <button onClick={onPause}>⏸ Duraklat</button>
          <button className="stop" onClick={onStop}>⏹ Durdur</button>
        </>
      )}
      {state === 'paused' && (
        <>
          <button className="on" onClick={onResume}>▶ Devam</button>
          <button className="stop" onClick={onStop}>⏹ Durdur</button>
        </>
      )}
      {error ? (
        <p className="recnote err">{error}</p>
      ) : state === 'idle' ? (
        <p className="recnote">Kayıt sırasında ekranı kapatma veya başka uygulamaya geçme: kayıt durabilir.</p>
      ) : null}
    </div>
  )
}
