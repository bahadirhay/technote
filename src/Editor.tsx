import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import PageCanvas from './PageCanvas'
import { renderPdfPage, openPdf } from './pdf'
import { savePdf } from './store'
import {
  PAGE_H,
  PAGE_W,
  newPage,
  uid,
  type Background,
  type Notebook,
  type Page,
  type Stroke,
  type TextBox,
  type Tool,
} from './types'

const COLORS = ['#111827', '#1d4ed8', '#dc2626', '#16a34a', '#d97706', '#9333ea']
const FONTS = ['system-ui', 'Georgia', 'Courier New', 'Comic Sans MS', 'Marker Felt', 'Bradley Hand', 'Snell Roundhand']

interface Props {
  nb: Notebook
  onChange: (nb: Notebook) => void
  onBack: () => void
}

export default function Editor({ nb, onChange, onBack }: Props) {
  const [idx, setIdx] = useState(0)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(2.5)
  const [font, setFont] = useState(FONTS[0])
  const [fontSize, setFontSize] = useState(22)
  const [bgImage, setBgImage] = useState<HTMLCanvasElement | null>(null)
  const [scale, setScale] = useState(1)
  const [busy, setBusy] = useState(false)
  const undo = useRef<Page[][]>([])
  const redo = useRef<Page[][]>([])
  const wrap = useRef<HTMLDivElement>(null)
  const pdfInput = useRef<HTMLInputElement>(null)

  const page = nb.pages[Math.min(idx, nb.pages.length - 1)]

  useLayoutEffect(() => {
    const el = wrap.current!
    const fit = () => setScale(Math.min(1.4, (el.clientWidth - 24) / PAGE_W))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    setBgImage(null)
    if (!page.pdf) return
    let live = true
    renderPdfPage(page.pdf.docId, page.pdf.pageNum).then((c) => live && setBgImage(c))
    return () => {
      live = false
    }
  }, [page.id, page.pdf])

  const commit = (pages: Page[]) => {
    undo.current.push(nb.pages)
    if (undo.current.length > 50) undo.current.shift()
    redo.current = []
    onChange({ ...nb, pages })
  }
  const patch = (p: Partial<Page>) => commit(nb.pages.map((x) => (x.id === page.id ? { ...x, ...p } : x)))

  const doUndo = () => {
    const prev = undo.current.pop()
    if (!prev) return
    redo.current.push(nb.pages)
    onChange({ ...nb, pages: prev })
  }
  const doRedo = () => {
    const next = redo.current.pop()
    if (!next) return
    undo.current.push(nb.pages)
    onChange({ ...nb, pages: next })
  }

  const addPage = (bg: Background = page.bg) => {
    const pages = [...nb.pages]
    pages.splice(idx + 1, 0, newPage(bg))
    commit(pages)
    setIdx(idx + 1)
  }
  const delPage = () => {
    if (!confirm('Bu sayfa silinsin mi?')) return
    const pages = nb.pages.filter((p) => p.id !== page.id)
    commit(pages.length ? pages : [newPage()])
    setIdx(Math.max(0, idx - 1))
  }

  const importPdf = async (file: File) => {
    setBusy(true)
    try {
      const data = await file.arrayBuffer()
      const docId = uid()
      await savePdf(docId, data)
      const doc = await openPdf(docId, data)
      const added: Page[] = Array.from({ length: doc.numPages }, (_, i) => ({
        ...newPage('blank'),
        pdf: { docId, pageNum: i + 1 },
      }))
      const pages = [...nb.pages]
      pages.splice(idx + 1, 0, ...added)
      commit(pages)
      setIdx(idx + 1)
    } catch {
      alert('PDF eklenemedi.')
    } finally {
      setBusy(false)
    }
  }

  const placeText = (x: number, y: number) => {
    const t: TextBox = { id: uid(), x, y, w: 300, text: '', font, size: fontSize, color }
    patch({ texts: [...page.texts, t] })
  }
  const editText = (id: string, p: Partial<TextBox>) =>
    patch({ texts: page.texts.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const removeText = (id: string) => patch({ texts: page.texts.filter((t) => t.id !== id) })

  return (
    <div className="editor">
      <header className="bar">
        <button onClick={onBack}>‹ Defterler</button>
        <strong className="title">{nb.name}</strong>
        <span className="spacer" />
        <button onClick={doUndo} title="Geri al">↶</button>
        <button onClick={doRedo} title="Yinele">↷</button>
        <button onClick={() => pdfInput.current?.click()} disabled={busy}>
          {busy ? 'Yükleniyor…' : 'PDF ekle'}
        </button>
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) importPdf(f)
          }}
        />
      </header>

      <div className="tools">
        {(['pen', 'highlighter', 'eraser', 'text'] as Tool[]).map((t) => (
          <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>
            {{ pen: '✎ Kalem', highlighter: '🖍 Fosforlu', eraser: '⌫ Silgi', text: 'T Yazı' }[t]}
          </button>
        ))}
        <span className="sep" />
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${color === c ? 'on' : ''}`}
            style={{ background: c }}
            aria-label={c}
            onClick={() => setColor(c)}
          />
        ))}
        <span className="sep" />
        {tool === 'text' ? (
          <>
            <select value={font} onChange={(e) => setFont(e.target.value)} style={{ fontFamily: font }}>
              {FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
              ))}
            </select>
            <input type="number" min={10} max={80} value={fontSize} onChange={(e) => setFontSize(+e.target.value)} />
          </>
        ) : (
          <input type="range" min={1} max={12} step={0.5} value={width} onChange={(e) => setWidth(+e.target.value)} />
        )}
        <span className="spacer" />
        {!page.pdf && (
          <select value={page.bg} onChange={(e) => patch({ bg: e.target.value as Background })}>
            <option value="blank">Boş</option>
            <option value="lined">Çizgili</option>
            <option value="grid">Kareli</option>
          </select>
        )}
      </div>

      <div className="scroll" ref={wrap}>
        <div className="paper" style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
          <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'relative' }}>
            <PageCanvas
              page={page}
              tool={tool}
              color={color}
              width={width}
              bgImage={bgImage}
              scrollRef={wrap}
              onStrokes={(strokes: Stroke[]) => patch({ strokes })}
              onPlaceText={placeText}
            />
            {page.texts.map((t) => (
              <div
                key={t.id}
                className="tbox"
                style={{ left: t.x, top: t.y, width: t.w, pointerEvents: tool === 'text' ? 'auto' : 'none' }}
              >
                <textarea
                  autoFocus={!t.text}
                  value={t.text}
                  rows={Math.max(1, t.text.split('\n').length)}
                  style={{ fontFamily: t.font, fontSize: t.size, color: t.color }}
                  onChange={(e) => editText(t.id, { text: e.target.value })}
                  onBlur={(e) => !e.target.value && removeText(t.id)}
                />
                {tool === 'text' && (
                  <button className="x" onClick={() => removeText(t.id)} aria-label="Sil">×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="bar pager">
        <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>‹</button>
        <span>{idx + 1} / {nb.pages.length}</span>
        <button onClick={() => setIdx(Math.min(nb.pages.length - 1, idx + 1))} disabled={idx >= nb.pages.length - 1}>›</button>
        <span className="spacer" />
        <button onClick={() => addPage()}>+ Sayfa</button>
        <button onClick={delPage}>Sayfayı sil</button>
      </footer>
    </div>
  )
}
