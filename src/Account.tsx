import { useEffect, useState } from 'react'
import { OcrFailure, lastProvider, ocrStatus, selfTest, type OcrStatus } from './ocr'
import { indexEnabled, setIndexEnabled } from './search'
import { donateState, setDonate } from './donate'
import { supabase, updateDisplayName, updatePassword, type Profile } from './cloud'

export function NewPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) return setMsg('Şifreler aynı değil.')
    try {
      await updatePassword(pw)
      onDone()
    } catch (err) {
      setMsg((err as Error).message)
    }
  }

  return (
    <div className="auth">
      <form onSubmit={submit}>
        <h1>Yeni şifre</h1>
        <input type="password" placeholder="Yeni şifre (en az 6 karakter)" minLength={6} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input type="password" placeholder="Yeni şifre (tekrar)" minLength={6} required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <button className="on">Şifreyi kaydet</button>
        {msg && <p className="err">{msg}</p>}
      </form>
    </div>
  )
}

export default function Account({ profile, onBack, onNameChanged }: { profile: Profile; onBack: () => void; onNameChanged: (n: string) => void }) {
  const [name, setName] = useState(profile.display_name)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [nameMsg, setNameMsg] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [ocrMsg, setOcrMsg] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [indexOn, setIndexOn] = useState(indexEnabled())
  const [savePref, setSavePref] = useState(() => {
    try {
      return localStorage.getItem('technote:recSavePref') ?? 'ask'
    } catch {
      return 'ask'
    }
  })
  const [srv, setSrv] = useState<OcrStatus | null>(null)
  const [donate, setDonateUi] = useState(donateState() === 'on')
  useEffect(() => {
    if (profile.is_admin) void ocrStatus().then(setSrv)
  }, [profile.is_admin])

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateDisplayName(name)
      onNameChanged(name.trim())
      setNameMsg('Kaydedildi.')
    } catch (err) {
      setNameMsg((err as Error).message)
    }
  }

  const savePw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) return setPwMsg('Şifreler aynı değil.')
    try {
      await updatePassword(pw)
      setPw('')
      setPw2('')
      setPwMsg('Şifren değiştirildi.')
    } catch (err) {
      setPwMsg((err as Error).message)
    }
  }

  return (
    <div className="home">
      <header className="bar">
        <button onClick={onBack}>‹ Defterler</button>
        <h1>Hesabım</h1>
      </header>
      <div className="admin">
        <section>
          <h2>E-posta</h2>
          <p className="muted">{profile.email}</p>
        </section>

        <section>
          <h2>Adın</h2>
          <form className="inline" onSubmit={saveName}>
            <input type="text" maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setNameMsg('') }} />
            <button className="on">Kaydet</button>
          </form>
          {nameMsg && <p className="muted">{nameMsg}</p>}
        </section>

        <section>
          <h2>Şifre değiştir</h2>
          <form className="stack" onSubmit={savePw}>
            <input type="password" placeholder="Yeni şifre (en az 6 karakter)" minLength={6} required autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setPwMsg('') }} />
            <input type="password" placeholder="Yeni şifre (tekrar)" minLength={6} required autoComplete="new-password" value={pw2} onChange={(e) => { setPw2(e.target.value); setPwMsg('') }} />
            <button className="on">Şifreyi değiştir</button>
          </form>
          {pwMsg && <p className={pwMsg.endsWith('.') && !pwMsg.includes('değil') ? 'muted' : 'err'}>{pwMsg}</p>}
        </section>

        <section>
          <h2>Ses kaydı</h2>
          <p className="muted">Kayıt bitince iCloud Drive'a kaydetme ekranı açılsın mı?</p>
          <select
            value={savePref}
            onChange={(e) => {
              setSavePref(e.target.value)
              try {
                if (e.target.value === 'ask') localStorage.removeItem('technote:recSavePref')
                else localStorage.setItem('technote:recSavePref', e.target.value)
              } catch {
                /* yok say */
              }
            }}
          >
            <option value="ask">Her kayıtta sor</option>
            <option value="icloud">Evet, kayıt bitince iCloud ekranını aç</option>
            <option value="device">Hayır, sadece bu cihazda kalsın</option>
          </select>
        </section>

        <section>
          <h2>Veri bağışla (anonim)</h2>
          <p className="muted">
            Açıksa el yazın ve çevrilen yazı, adın ve defterin olmadan saklanır; Türkçe el yazısını ücretsiz tanıyan kendi
            sistemimizi eğitmek için kullanılır. Sadece bundan sonrası için geçerlidir.
          </p>
          <label>
            <input
              type="checkbox"
              checked={donate}
              onChange={(e) => {
                setDonate(e.target.checked)
                setDonateUi(e.target.checked)
              }}
            />{' '}
            El yazımı anonim olarak bağışla
          </label>
        </section>

        <section>
          <h2>Kalemle yazma testi (Scribble)</h2>
          <p className="muted">
            Apple Pencil ile aşağıdaki kutuya yaz: iPad el yazını cihaz içinde, internetsiz ve ücretsiz yazıya çevirir.
            Türkçe karakterleri dene: ş ğ ı ö ü ç İ. Çalışmazsa: Ayarlar → Apple Pencil → Scribble açık olsun ve
            iPad'in iPadOS 27 veya üstünde olsun.
          </p>
          <textarea
            className="scribble-test"
            lang="tr"
            rows={3}
            placeholder="Kalemle buraya yaz…"
          />
        </section>

        <section>
          <h2>El yazısı çevirme</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={indexOn}
              onChange={(e) => {
                setIndexOn(e.target.checked)
                setIndexEnabled(e.target.checked)
              }}
            />
            Arama için el yazımı arka planda tanı (yazın değişmez; her sayfa için en fazla bir istek)
          </label>
          {profile.is_admin && (
            <>
              <p className="muted">
                Sunucu durumu (sadece yöneticiye görünür):{' '}
                {srv === null ? 'kontrol ediliyor…' : srv.ready ? `✓ hazır (${srv.provider}) · yedek model: ${srv.altModel ?? 'yok'} · adres: ${srv.altHost ?? 'yok'}` : `✗ eksik: ${srv.missing.join(', ')}`}
              </p>
              {srv?.altModels && (
                <p className="muted" style={{ wordBreak: 'break-all' }}>Yedek serviste kullanılabilir modeller: {srv.altModels.join(', ')}</p>
              )}
              <button
                disabled={ocrBusy}
                onClick={async () => {
                  setOcrBusy(true)
                  setOcrMsg('Deneniyor…')
                  try {
                    const t = await selfTest()
                    setOcrMsg(t ? `✓ Çalışıyor (${lastProvider || '?'}). Okunan: "${t}"` : 'Servis cevap verdi ama yazı okunamadı.')
                  } catch (e) {
                    setOcrMsg(`✗ ${(e as OcrFailure).technical || (e as Error).message}`)
                  } finally {
                    setOcrBusy(false)
                  }
                }}
              >
                Servisi test et
              </button>
              {ocrMsg && <p className="muted">{ocrMsg}</p>}
            </>
          )}
        </section>

        <section>
          <button onClick={() => supabase.auth.signOut()}>Çıkış yap</button>
          <p className="muted">Sürüm: {__APP_VERSION__}</p>
        </section>
      </div>
    </div>
  )
}
