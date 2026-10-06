import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Account, { NewPassword } from './Account'
import Admin from './Admin'
import Auth from './Auth'
import Editor from './Editor'
import { cloudConfigured, fetchNotebooks, fetchProfile, removeNotebook, supabase, upsertNotebook, uploadPdf, type Profile } from './cloud'
import { clearLegacyNotebooks, exportBackup, importBackup, loadLegacyNotebooks, loadLocalPdf } from './store'
import { newPage, uid, type Notebook } from './types'

const NB_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#475569']

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (!cloudConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!cloudConfigured) {
    return <p className="loading">Sunucu ayarı eksik: VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlanmalı.</p>
  }
  if (session === undefined) return <p className="loading">Yükleniyor…</p>
  if (!session) return <Auth />
  if (recovery) return <NewPassword onDone={() => setRecovery(false)} />
  return <Gate key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} />
}

// Hesap onay durumuna göre kapı
function Gate({ userId, email }: { userId: string; email: string }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      setProfile(await fetchProfile(userId))
      setErr('')
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const logout = () => supabase.auth.signOut()

  if (err) {
    return (
      <div className="auth"><div className="card">
        <p className="err">{err}</p>
        <button onClick={load}>Tekrar dene</button> <button onClick={logout}>Çıkış</button>
      </div></div>
    )
  }
  if (profile === undefined) return <p className="loading">Yükleniyor…</p>
  if (!profile || profile.status !== 'approved') {
    const rejected = profile?.status === 'rejected'
    return (
      <div className="auth"><div className="card">
        <h1>TechNote</h1>
        <p>{email}</p>
        <p className="muted">
          {rejected
            ? 'Hesabın şu an erişime kapalı. Yöneticiyle iletişime geç.'
            : 'Hesabın yönetici onayı bekliyor. Onaylanınca defterlerine erişebilirsin.'}
        </p>
        <button onClick={load}>Durumu yenile</button> <button onClick={logout}>Çıkış</button>
      </div></div>
    )
  }
  return <Notes profile={profile} />
}

function Notes({ profile: initial }: { profile: Profile }) {
  const [profile, setProfile] = useState(initial)
  const [account, setAccount] = useState(false)
  const [nbs, setNbs] = useState<Notebook[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [admin, setAdmin] = useState(false)
  const [sync, setSync] = useState<'ok' | 'saving' | 'error'>('ok')
  const [loadErr, setLoadErr] = useState('')
  const restore = useRef<HTMLInputElement>(null)
  const ref = useRef<Notebook[]>([])
  const dirty = useRef(new Set<string>())
  const timer = useRef<number | undefined>(undefined)

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    const ids = [...dirty.current]
    if (!ids.length) return
    dirty.current.clear()
    setSync('saving')
    try {
      for (const id of ids) {
        const nb = ref.current.find((n) => n.id === id)
        if (nb) await upsertNotebook(nb)
      }
      setSync('ok')
    } catch {
      ids.forEach((id) => dirty.current.add(id))
      setSync('error')
      timer.current = window.setTimeout(flush, 5000)
    }
  }, [])

  const update = (next: Notebook[], changed: string[] = []) => {
    ref.current = next
    setNbs(next)
    if (!changed.length) return
    changed.forEach((id) => dirty.current.add(id))
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 800)
  }

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        let list = await fetchNotebooks()
        const legacy = await loadLegacyNotebooks()
        if (legacy.length && confirm(`Bu cihazda hesapsız dönemden ${legacy.length} defter var. Hesabına aktarılsın mı?`)) {
          for (const nb of legacy) {
            for (const p of nb.pages) {
              const buf = p.pdf && (await loadLocalPdf(p.pdf.docId))
              if (buf) await uploadPdf(p.pdf!.docId, buf)
            }
            await upsertNotebook(nb)
          }
          await clearLegacyNotebooks()
          list = await fetchNotebooks()
        }
        if (live) {
          ref.current = list
          setNbs(list)
        }
      } catch (e) {
        if (live) setLoadErr((e as Error).message)
      }
    })()
    const hide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', hide)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', hide)
    }
  }, [flush])

  const logout = async () => {
    await flush()
    await supabase.auth.signOut()
  }

  if (loadErr) return <p className="loading err">{loadErr}</p>
  if (!nbs) return <p className="loading">Yükleniyor…</p>
  if (account) {
    return <Account profile={profile} onBack={() => setAccount(false)} onNameChanged={(n) => setProfile({ ...profile, display_name: n })} />
  }
  if (admin) return <Admin me={profile.id} onBack={() => setAdmin(false)} />

  const open = nbs.find((n) => n.id === openId)
  if (open) {
    return (
      <Editor
        nb={open}
        onBack={async () => {
          await flush()
          setOpenId(null)
        }}
        onChange={(nb) => update(nbs.map((n) => (n.id === nb.id ? nb : n)), [nb.id])}
        sync={sync}
      />
    )
  }

  const create = () => {
    const name = prompt('Defter / ders adı?')?.trim()
    if (!name) return
    const nb: Notebook = {
      id: uid(),
      name,
      color: NB_COLORS[nbs.length % NB_COLORS.length],
      createdAt: Date.now(),
      pages: [newPage()],
    }
    update([...nbs, nb], [nb.id])
    setOpenId(nb.id)
  }
  const rename = (nb: Notebook) => {
    const name = prompt('Yeni ad', nb.name)?.trim()
    if (name) update(nbs.map((n) => (n.id === nb.id ? { ...n, name } : n)), [nb.id])
  }
  const remove = (nb: Notebook) => {
    if (!confirm(`"${nb.name}" defteri silinsin mi? Bu geri alınamaz.`)) return
    dirty.current.delete(nb.id)
    update(nbs.filter((n) => n.id !== nb.id))
    removeNotebook(nb.id).catch(() => alert('Defter sunucudan silinemedi, sayfayı yenileyince geri gelebilir.'))
  }

  return (
    <div className="home">
      <header className="bar">
        <h1>TechNote</h1>
        <span className={`syncdot ${sync}`} title={sync === 'saving' ? 'Kaydediliyor…' : sync === 'error' ? 'Kaydedilemedi, tekrar denenecek' : 'Kaydedildi'} />
        <span className="spacer" />
        {profile.is_admin && <button onClick={() => setAdmin(true)}>Kullanıcılar</button>}
        <button onClick={() => exportBackup(nbs)}>Yedekle</button>
        <button onClick={() => restore.current?.click()}>Yedekten yükle</button>
        <button onClick={() => setAccount(true)} title={profile.email}>{profile.display_name || 'Hesabım'}</button>
        <button onClick={logout}>Çıkış</button>
        <input
          ref={restore}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const imported = await importBackup(f)
              const ids = new Set(nbs.map((n) => n.id))
              const fresh = imported.filter((n) => !ids.has(n.id))
              update([...nbs, ...fresh], fresh.map((n) => n.id))
            } catch {
              alert('Yedek dosyası okunamadı veya PDF yüklenemedi.')
            }
          }}
        />
      </header>
      <div className="shelf">
        {nbs.map((nb) => (
          <div key={nb.id} className="book" style={{ background: nb.color }} onClick={() => setOpenId(nb.id)}>
            <span className="book-name">{nb.name}</span>
            <span className="book-meta">{nb.pages.length} sayfa</span>
            <span className="book-actions" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => rename(nb)}>Ad</button>
              <button onClick={() => remove(nb)}>Sil</button>
            </span>
          </div>
        ))}
        <button className="book new" onClick={create}>+ Yeni defter</button>
      </div>
      {nbs.length === 0 && <p className="hint">Her ders için ayrı bir defter oluştur.</p>}
    </div>
  )
}
