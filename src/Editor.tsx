import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import PageCanvas from './PageCanvas'
import { renderPdfPage, openPdf } from './pdf'
import { loadImage, saveImage, savePdf } from './store'
import {
  BG_LINES,
  BG_NAMES,
  PAGE_H,
  PAGE_W,
  newPage,
  uid,
  type Background,
  type ImageBox,
  type Notebook,
  type Page,
  type Stroke,
  type TextBox,
  type Tool,
} from './types'

const COLORS = ['#111827', '#1d4ed8', '#dc2626', '#16a34a', '#d97706', '#9333ea']
const HL_COLORS = ['#facc15', '#4ade80', '#f472b6', '#38bdf8', '#fb923c', '#a78bfa']
const COLOR_NAMES: Record<string, string> = {
  '#111827': 'Siyah', '#1d4ed8': 'Mavi', '#dc2626': 'Kırmızı', '#16a34a': 'Yeşil', '#d97706': 'Turuncu', '#9333ea': 'Mor',
  '#facc15': 'Sarı', '#4ade80': 'Açık yeşil', '#f472b6': 'Pembe', '#38bdf8': 'Açık mavi', '#fb923c': 'Turuncu', '#a78bfa': 'Açık mor',
}
const FONTS = ['system-ui', 'Georgia', 'Courier New', 'Comic Sans MS', 'Marker Felt', 'Bradley Hand', 'Snell Roundhand']

interface Props {
  nb: Notebook
  onChange: (nb: Notebook) => void
  onBack: () => void
  sync?: 'ok' | 'saving' | 'error'
}

export default function Editor({ nb, onChange, onBack, sync }: Props) {
  const [idx, setIdx] = useState(0)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [hlColor, setHlColor] = useState(HL_COLORS[0])
  const [width, setWidth] = useState(2.5)
  const [font, setFont] = useState(FONTS[0])
  const [fontSize, setFontSize] = useState(22)
  const [bgImage, setBgImage] = useState<HTMLCanvasElement | null>(null)
  const [scale, setScale] = useState(1)
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [imgs, setImgs] = useState<Map<string, HTMLImageElement>>(new Map())
  const [smooth, setSmooth] = useState(() => {
    try {
      return localStorage.getItem('technote:smooth') !== '0'
    } catch {
      return true
    }
  })
  const loadingImgs = useRef(new Set<string>())
  const imgInput = useRef<HTMLInputElement>(null)
  const [fingerDraw, setFingerDraw] = useState(() => {
    try {
      const v = localStorage.getItem('technote:fingerDraw')
      return v ? v === '1' : window.innerWidth < 820
    } catch {
      return window.innerWidth < 820
    }
  })
  const toggleFinger = () => {
    setFingerDraw(!fingerDraw)
    try { localStorage.setItem('technote:fingerDraw', fingerDraw ? '0' : '1') } catch { /* yok say */ }
  }
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

  useEffect(() => {
    for (const im of page.images ?? []) {
      if (imgs.has(im.docId) || loadingImgs.current.has(im.docId)) continue
      loadingImgs.current.add(im.docId)
      loadImage(im.docId)
        .then(async (blob) => {
          if (!blob) return
          const el = new Image()
          el.src = URL.createObjectURL(blob)
          await el.decode().catch(() => undefined)
          setImgs((m) => new Map(m).set(im.docId, el))
        })
        .finally(() => loadingImgs.current.delete(im.docId))
    }
  }, [page.images, imgs])

  const commit = (pages: Page[]) => {
    undo.current.push(nb.pages)
    if (undo.current.length > 50) undo.current.shift()
    redo.current = []
    onChange({ ...nb, pages })
  }
  const patch = (p: Partial<Page>) => commit(nb.pages.map((x) => (x.id === page.id ? { ...x, ...p } : x)))

  // Boş kalan yazı kutularını temizler (odak kaybında silmek yeni kutuyu anında öldürüyordu)
  const sweepEmpty = () => {
    if (!nb.pages.some((p) => p.texts.some((t) => !t.text.trim()))) return
    onChange({ ...nb, pages: nb.pages.map((p) => ({ ...p, texts: p.texts.filter((t) => t.text.trim()) })) })
  }
  const pickTool = (t: Tool) => {
    if (t !== 'text') sweepEmpty()
    if (t !== 'select') setSelectedId(null)
    setTool(t)
  }
  const goPage = (i: number) => {
    sweepEmpty()
    setSelectedId(null)
    setIdx(i)
  }

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

  const addImage = async (file: File) => {
    setBusy(true)
    try {
      const url = URL.createObjectURL(file)
      const src = new Image()
      src.src = url
      await src.decode()
      const k = Math.min(1, 1600 / Math.max(src.naturalWidth, src.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(src.naturalWidth * k))
      c.height = Math.max(1, Math.round(src.naturalHeight * k))
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, 0.88))
      if (!blob) throw new Error('Resim işlenemedi')
      const docId = uid()
      await saveImage(docId, blob)
      const el = new Image()
      el.src = URL.createObjectURL(blob)
      await el.decode().catch(() => undefined)
      setImgs((m) => new Map(m).set(docId, el))
      const w = Math.min(PAGE_W * 0.6, c.width)
      const h = (w * c.height) / c.width
      const top = ((wrap.current?.scrollTop ?? 0) / scale) + 40
      const box: ImageBox = {
        id: uid(), docId, w, h,
        x: (PAGE_W - w) / 2,
        y: Math.max(20, Math.min(top, PAGE_H - h - 20)),
      }
      patch({ images: [...(page.images ?? []), box] })
      setTool('select')
      setSelectedId(box.id)
    } catch {
      alert('Resim eklenemedi.')
    } finally {
      setBusy(false)
    }
  }
  const deleteImage = () => {
    if (!selectedId) return
    patch({ images: (page.images ?? []).filter((i) => i.id !== selectedId) })
    setSelectedId(null)
  }
  const toggleSmooth = () => {
    setSmooth(!smooth)
    try { localStorage.setItem('technote:smooth', smooth ? '0' : '1') } catch { /* yok say */ }
  }

  // Çizgili/kareli sayfada yazı en yakın çizgiye oturur
  const lines = page.pdf ? undefined : BG_LINES[page.bg]
  const lineH = lines?.step ?? 0
  const placeText = (x: number, y: number) => {
    let top = y - fontSize * 0.7
    if (lineH) {
      const first = lines!.first
      const lineY = first + Math.max(0, Math.ceil((y - first) / lineH)) * lineH
      top = lineY - (lineH / 2 + fontSize * 0.35)
    }
    const left = Math.min(Math.max(8, x - 4), PAGE_W - 120)
    const t: TextBox = { id: uid(), x: left, y: Math.max(0, top), w: PAGE_W - left - 16, text: '', font, size: fontSize, color }
    patch({ texts: [...page.texts.filter((x) => x.text.trim()), t] })
  }
  const editText = (id: string, p: Partial<TextBox>) =>
    patch({ texts: page.texts.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const removeText = (id: string) => patch({ texts: page.texts.filter((t) => t.id !== id) })

  return (
    <div className="editor">
      <header className="bar">
        <button onClick={() => { sweepEmpty(); onBack() }}>‹ Defterler</button>
        <strong className="title">{nb.name}</strong>
        <span className={`syncdot ${sync ?? 'ok'}`} title={sync === 'saving' ? 'Kaydediliyor…' : sync === 'error' ? 'Kaydedilemedi' : 'Kaydedildi'} />
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
        {(['pen', 'highlighter', 'eraser', 'text', 'select'] as Tool[]).map((t) => (
          <button key={t} className={tool === t ? 'on' : ''} onClick={() => pickTool(t)}>
            {{ pen: '✎ Kalem', highlighter: '🖍 Fosforlu', eraser: '⌫ Silgi', text: 'T Yazı', select: '⬚ Resim seç' }[t]}
          </button>
        ))}
        <span className="sep" />
        {(tool === 'highlighter' ? HL_COLORS : COLORS).map((c) => (
          <button
            key={c}
            className={`swatch ${(tool === 'highlighter' ? hlColor : color) === c ? 'on' : ''}`}
            style={{ background: c }}
            aria-label={COLOR_NAMES[c]}
            title={COLOR_NAMES[c]}
            onClick={() => (tool === 'highlighter' ? setHlColor(c) : setColor(c))}
          />
        ))}
        <span className="preview" title="Seçili renk ve kalınlık">
          <i
            style={{
              background: tool === 'highlighter' ? hlColor : color,
              opacity: tool === 'highlighter' ? 0.5 : 1,
              width: tool === 'text' ? 14 : Math.min(30, Math.max(3, tool === 'highlighter' ? width * 2.5 : width * 1.6)),
              height: tool === 'text' ? 14 : Math.min(30, Math.max(3, tool === 'highlighter' ? width * 2.5 : width * 1.6)),
            }}
          />
        </span>
        <span className="cname">{COLOR_NAMES[tool === 'highlighter' ? hlColor : color]}</span>
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
        {tool === 'select' && selectedId && <button onClick={deleteImage}>🗑 Resmi sil</button>}
        <button onClick={() => imgInput.current?.click()} disabled={busy}>🖼 Resim</button>
        <input
          ref={imgInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) addImage(f)
          }}
        />
        <button className={smooth ? 'on' : ''} onClick={toggleSmooth} title="Yazıyı yumuşat">〰 Yumuşat</button>
        <button className={fingerDraw ? 'on' : ''} onClick={toggleFinger} title="Parmakla çizim">
          ☝ {fingerDraw ? 'Parmak: çiz' : 'Parmak: kaydır'}
        </button>
        {!page.pdf && (
          <select value={page.bg} onChange={(e) => patch({ bg: e.target.value as Background })}>
            {(Object.keys(BG_NAMES) as Background[]).map((b) => (
              <option key={b} value={b}>{BG_NAMES[b]}</option>
            ))}
          </select>
        )}
      </div>

      <div className="scroll" ref={wrap}>
        <div className="paper" style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
          <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'relative' }}>
            <PageCanvas
              page={page}
              tool={tool}
              color={tool === 'highlighter' ? hlColor : color}
              width={width}
              bgImage={bgImage}
              scrollRef={wrap}
              fingerDraw={fingerDraw}
              imgs={imgs}
              selectedId={selectedId}
              smooth={smooth}
              onImages={(images) => patch({ images })}
              onSelect={setSelectedId}
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
                  style={{ fontFamily: t.font, fontSize: t.size, color: t.color, lineHeight: lineH ? `${lineH}px` : 1.3 }}
                  onChange={(e) => editText(t.id, { text: e.target.value })}
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
        <button onClick={() => goPage(Math.max(0, idx - 1))} disabled={idx === 0}>‹</button>
        <span>{idx + 1} / {nb.pages.length}</span>
        <button onClick={() => goPage(Math.min(nb.pages.length - 1, idx + 1))} disabled={idx >= nb.pages.length - 1}>›</button>
        <span className="spacer" />
        <button onClick={() => addPage()}>+ Sayfa</button>
        <button onClick={delPage}>Sayfayı sil</button>
      </footer>
    </div>
  )
}
