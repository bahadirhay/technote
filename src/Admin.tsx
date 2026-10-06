import { useCallback, useEffect, useState } from 'react'
import {
  addInvite,
  getSignupsOpen,
  listInvites,
  listProfiles,
  removeInvite,
  setProfileStatus,
  setSignupsOpen,
  type Invite,
  type Profile,
  type Status,
} from './cloud'

export default function Admin({ me, onBack }: { me: string; onBack: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [open, setOpen] = useState(true)
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const [p, i, o] = await Promise.all([listProfiles(), listInvites(), getSignupsOpen()])
      setProfiles(p)
      setInvites(i)
      setOpen(o)
      setErr('')
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
      await load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const setStatus = (id: string, s: Status) => run(() => setProfileStatus(id, s))

  const group = (s: Status) => profiles.filter((p) => p.status === s)
  const row = (p: Profile, actions: React.ReactNode) => (
    <li key={p.id}>
      <span className="grow">{p.email}{p.is_admin && ' (yönetici)'}</span>
      {p.id !== me && actions}
    </li>
  )

  return (
    <div className="home">
      <header className="bar">
        <button onClick={onBack}>‹ Defterler</button>
        <h1>Kullanıcılar</h1>
      </header>
      <div className="admin">
        {err && <p className="err">{err}</p>}

        <section>
          <h2>Yeni kayıtlar</h2>
          <label className="check">
            <input type="checkbox" checked={open} onChange={(e) => run(() => setSignupsOpen(e.target.checked))} />
            Herkes kayıt olabilsin (kapalıysa sadece davetliler)
          </label>
        </section>

        <section>
          <h2>Onay bekleyenler ({group('pending').length})</h2>
          <ul>
            {group('pending').map((p) =>
              row(p, (
                <>
                  <button className="on" onClick={() => setStatus(p.id, 'approved')}>Onayla</button>
                  <button onClick={() => setStatus(p.id, 'rejected')}>Reddet</button>
                </>
              )),
            )}
          </ul>
        </section>

        <section>
          <h2>Onaylılar ({group('approved').length})</h2>
          <ul>{group('approved').map((p) => row(p, <button onClick={() => setStatus(p.id, 'rejected')}>Erişimi kaldır</button>))}</ul>
        </section>

        <section>
          <h2>Reddedilenler ({group('rejected').length})</h2>
          <ul>{group('rejected').map((p) => row(p, <button onClick={() => setStatus(p.id, 'approved')}>Onayla</button>))}</ul>
        </section>

        <section>
          <h2>Davetliler</h2>
          <form
            className="inline"
            onSubmit={(e) => {
              e.preventDefault()
              if (email.trim()) run(() => addInvite(email)).then(() => setEmail(''))
            }}
          >
            <input type="email" placeholder="ornek@mail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="on">Davet et</button>
          </form>
          <p className="muted">Bu e-postayla kayıt olan kişi otomatik onaylanır.</p>
          <ul>
            {invites.map((i) => (
              <li key={i.email}>
                <span className="grow">{i.email}</span>
                <button onClick={() => run(() => removeInvite(i.email))}>Kaldır</button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
