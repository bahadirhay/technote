import { useEffect, useRef, useState } from 'react'
import Editor from './Editor'
import { exportBackup, importBackup, loadNotebooks, saveNotebooks } from './store'
import { newPage, uid, type Notebook } from './types'

const NB_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#475569']

export default function App() {
  const [nbs, setNbs] = useState<Notebook[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const restore = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadNotebooks().then(setNbs)
    navigator.storage?.persist?.()
  }, [])

  useEffect(() => {
    if (nbs) saveNotebooks(nbs)
  }, [nbs])

  if (!nbs) return <p className="loading">Yükleniyor…</p>

  const open = nbs.find((n) => n.id === openId)
  if (open) {
    return (
      <Editor
        nb={open}
        onBack={() => setOpenId(null)}
        onChange={(nb) => setNbs(nbs.map((n) => (n.id === nb.id ? nb : n)))}
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
    setNbs([...nbs, nb])
    setOpenId(nb.id)
  }
  const rename = (nb: Notebook) => {
    const name = prompt('Yeni ad', nb.name)?.trim()
    if (name) setNbs(nbs.map((n) => (n.id === nb.id ? { ...n, name } : n)))
  }
  const remove = (nb: Notebook) => {
    if (confirm(`"${nb.name}" defteri silinsin mi? Bu geri alınamaz.`)) setNbs(nbs.filter((n) => n.id !== nb.id))
  }

  return (
    <div className="home">
      <header className="bar">
        <h1>TechNote</h1>
        <span className="spacer" />
        <button onClick={() => exportBackup(nbs)}>Yedekle</button>
        <button onClick={() => restore.current?.click()}>Yedekten yükle</button>
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
              setNbs([...nbs, ...imported.filter((n) => !ids.has(n.id))])
            } catch {
              alert('Yedek dosyası okunamadı.')
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
