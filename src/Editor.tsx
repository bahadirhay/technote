import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import PageCanvas from './PageCanvas'
import { OcrFailure, ocrAvailable, readHandwriting } from './ocr'
import { deleteSelection } from './geometry'
import { hashStrokes, strokesToPng } from './ink'
import { indexEnabled } from './search'
import { renderPdfPage, openPdf } from './pdf'
import { deleteAudio, loadAudio, loadImage, saveAudio, saveImage, savePdf } from './store'
import CameraSheet from './CameraSheet'
import RecorderBar, { type RecUi } from './RecorderBar'
import Recordings, { type Jump } from './Recordings'
import { RecordConsent, SaveSheet, type SaveChoice } from './RecordDialogs'
import { AudioRecorder, exportAudio, fmtClock, fmtDate } from './media'
import {
  BG_LINES,
  BG_NAMES,
  EMPTY_SEL,
  SHAPE_NAMES,
  isEmptySel,
  PAGE_H,
  PAGE_W,
  newPage,
  uid,
  type Background,
  type ImageBox,
  type Scene,
  type Selection,
  type ShapeKind,
  type Sticky,
  type Notebook,
  type Page,
  type Recording,
  type TextBox,
  type Tool,
} from './types'

const COLORS = ['#111827', '#1d4ed8', '#dc2626', '#16a34a', '#d97706', '#9333ea']
const NOTE_COLORS = ['#fde68a', '#bbf7d0', '#fbcfe8', '#bfdbfe', '#fed7aa', '#e9d5ff']
const HL_COLORS = ['#facc15', '#4ade80', '#f472b6', '#38bdf8', '#fb923c', '#a78bfa']
const COLOR_NAMES: Record<string, string> = {
  '#111827': 'Siyah', '#1d4ed8': 'Mavi', '#dc2626': 'Kırmızı', '#16a34a': 'Yeşil', '#d97706': 'Turuncu', '#9333ea': 'Mor',
  '#facc15': 'Sarı', '#4ade80': 'Açık yeşil', '#f472b6': 'Pembe', '#38bdf8': 'Açık mavi', '#fb923c': 'Turuncu', '#a78bfa': 'Açık mor',
  '#fde68a': 'Sarı not', '#bbf7d0': 'Yeşil not', '#fbcfe8': 'Pembe not', '#bfdbfe': 'Mavi not', '#fed7aa': 'Turuncu not', '#e9d5ff': 'Mor not',
}
const FONTS = ['system-ui', 'Caveat', 'Kalam', 'Patrick Hand', 'Dancing Script', 'Courgette', 'Indie Flower', 'Lora Italic', 'Playfair Italic', 'Georgia']

interface Props {
  nb: Notebook
  onChange: (nb: Notebook) => void
  onBack: () => void
  startPage?: number
  onPageMeta: (nbId: string, pageId: string, meta: { searchText: string; indexedHash: string }) => void
  sync?: 'ok' | 'saving' | 'error'
}

export default function Editor({ nb, onChange, onBack, sync, startPage, onPageMeta }: Props) {
  const [idx, setIdx] = useState(startPage ?? 0)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [hlColor, setHlColor] = useState(HL_COLORS[0])
  const [width, setWidth] = useState(2.5)
  const [font, setFont] = useState(FONTS[0])
  const [fontSize, setFontSize] = useState(22)
  const [bgImage, setBgImage] = useState<HTMLCanvasElement | null>(null)
  const [scale, setScale] = useState(1)
  const [busy, setBusy] = useState(false)
  const [activeText, setActiveText] = useState<string | null>(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  // Sunucuda el yazısı servisi kurulu değilse ilgili düğmeler hiç gösterilmez
  const [ocrReady, setOcrReady] = useState(false)
  const ocrReadyRef = useRef(false)
  useEffect(() => {
    let live = true
    void ocrAvailable().then((ok) => {
      if (!live) return
      ocrReadyRef.current = ok
      setOcrReady(ok)
    })
    return () => {
      live = false
    }
  }, [])
  const ocrDown = () => {
    ocrReadyRef.current = false
    setOcrReady(false)
  }
  const [selection, setSelection] = useState<Selection>(EMPTY_SEL)
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect')
  const [shapeFill, setShapeFill] = useState(false)
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0])
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
      const v = localStorage.getItem('technote:fingerDraw2')
      return v ? v === '1' : window.innerWidth < 820
    } catch {
      return window.innerWidth < 820
    }
  })
  const toggleFinger = () => {
    setFingerDraw(!fingerDraw)
    try { localStorage.setItem('technote:fingerDraw2', fingerDraw ? '0' : '1') } catch { /* yok say */ }
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

  // Masaüstü/klavyeli iPad: Delete veya Backspace seçili öğeleri siler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT')) return
      if (tool === 'select' && !isEmptySel(selection)) {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
    if (t !== 'select') setSelection(EMPTY_SEL)
    setTool(t)
  }
  const goPage = (i: number) => {
    void indexPage(page.id)
    sweepEmpty()
    setSelection(EMPTY_SEL)
    setActiveText(null)
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

  const addImage = async (file: Blob) => {
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
      setSelection({ ...EMPTY_SEL, images: [box.id] })
    } catch {
      alert('Resim eklenemedi.')
    } finally {
      setBusy(false)
    }
  }
  const deleteSelected = () => {
    const sc: Scene = { strokes: page.strokes, shapes: page.shapes ?? [], images: page.images ?? [], notes: page.notes ?? [] }
    patch(deleteSelection(sc, selection))
    setSelection(EMPTY_SEL)
  }
  const placeNote = (x: number, y: number) => {
    const w = 220
    const note: Sticky = {
      id: uid(), w, h: 160, text: '', color: noteColor,
      x: Math.min(Math.max(10, x - w / 2), PAGE_W - w - 10),
      y: Math.min(Math.max(10, y - 30), PAGE_H - 170),
    }
    patch({ notes: [...(page.notes ?? []), note] })
  }
  const editNote = (id: string, text: string) =>
    patch({ notes: (page.notes ?? []).map((n) => (n.id === id ? { ...n, text } : n)) })
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
  // --- Arka planda el yazısı tanıma (arama için). Yazı olduğu gibi kalır, sadece metni saklanır. ---
  const nbRef = useRef(nb)
  useEffect(() => {
    nbRef.current = nb
  })
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // --- Kamera ve ses kaydı ---
  const [camOpen, setCamOpen] = useState(false)
  const [recOpen, setRecOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [jump, setJump] = useState<Jump | null>(null)
  const [recState, setRecState] = useState<RecUi>('idle')
  const [recMs, setRecMs] = useState(0)
  const [recErr, setRecErr] = useState('')
  const recRef = useRef<{ id: string; startedAt: number; rec: AudioRecorder; choice: SaveChoice } | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [saveSheet, setSaveSheet] = useState<{ id: string; name: string; blob: Blob } | null>(null)
  const recStateRef = useRef<RecUi>('idle')
  const setRec = (st: RecUi) => {
    recStateRef.current = st
    setRecState(st)
  }
  const MAX_REC_MS = 2 * 3600 * 1000

  // Başlat: seçim hatırlanmışsa doğrudan, yoksa önce onay penceresi
  const requestStart = () => {
    setRecErr('')
    let pref: string | null = null
    try {
      pref = localStorage.getItem('technote:recSavePref')
    } catch {
      /* hatırlanamaz, her seferinde sorulur */
    }
    if (pref === 'icloud' || pref === 'device') return void startRecording(pref)
    setConsentOpen(true)
  }
  const chooseConsent = (choice: SaveChoice, remember: boolean) => {
    setConsentOpen(false)
    if (remember) {
      try {
        localStorage.setItem('technote:recSavePref', choice)
      } catch {
        /* yok say */
      }
    }
    void startRecording(choice)
  }
  const startRecording = async (choice: SaveChoice) => {
    setRecErr('')
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return setRecErr('Bu tarayıcı ses kaydını desteklemiyor.')
    }
    try {
      const rec = await AudioRecorder.create()
      recRef.current = { id: uid(), startedAt: Date.now(), rec, choice }
      setRecMs(0)
      setRec('recording')
    } catch (e) {
      const n = (e as { name?: string })?.name
      setRecErr(
        n === 'NotAllowedError'
          ? 'Mikrofon izni verilmedi. iPad: Ayarlar → Safari → Mikrofon bölümünden izin ver, sonra tekrar dene.'
          : 'Mikrofon açılamadı. Başka bir uygulama kullanıyor olabilir.',
      )
    }
  }
  const pauseRecording = () => {
    recRef.current?.rec.pause()
    setRec('paused')
  }
  const resumeRecording = () => {
    recRef.current?.rec.resume()
    setRec('recording')
  }
  const stopRecording = async (): Promise<void> => {
    const cur = recRef.current
    if (!cur) return
    recRef.current = null
    setRec('saving')
    const { blob, durationMs, mime } = await cur.rec.stop()
    if (durationMs < 1000 || blob.size === 0) {
      setRec('idle')
      return
    }
    const meta: Recording = {
      id: cur.id,
      name: `Ders kaydı ${fmtDate(cur.startedAt)}`,
      startedAt: cur.startedAt,
      durationMs: Math.round(durationMs),
      mime,
      size: blob.size,
      where: 'device',
    }
    try {
      await saveAudio(meta.id, blob)
    } catch {
      // Cihaz deposu doluysa kaydı kaybetmemek için hemen dosya olarak kaydettir
      alert('Kayıt cihaz deposuna yazılamadı. Şimdi Dosyalar\'a kaydediyoruz, kaybolmasın.')
      await exportAudio(blob, meta.name)
    }
    const base = nbRef.current
    onChangeRef.current({ ...base, recordings: [...(base.recordings ?? []), meta] })
    setRec('idle')
    setRecOpen(false)
    setPanelOpen(true)
    if (cur.choice === 'icloud') setSaveSheet({ id: meta.id, name: meta.name, blob })
  }
  // Süre sayacı + en uzun kayıt sınırı
  useEffect(() => {
    if (recState !== 'recording' && recState !== 'paused') return
    const t = window.setInterval(() => {
      const cur = recRef.current
      if (!cur) return
      const ms = cur.rec.ms()
      setRecMs(ms)
      if (ms >= MAX_REC_MS) void stopRecording()
    }, 250)
    return () => window.clearInterval(t)
  }, [recState])
  // Uygulama arka plana gidip mikrofon kesildiyse: o ana kadarki kısmı kaydet
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && recRef.current?.rec.isDead()) {
        void stopRecording()
        alert('Uygulama arka plana geçtiği için kayıt durdu. O ana kadarki kısım kaydedildi.')
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  // Defterden çıkılırsa sürmekte olan kayıt kaybolmasın
  useEffect(
    () => () => {
      if (recRef.current) void stopRecording()
    },
    [],
  )
  const recClock = () =>
    recStateRef.current === 'recording' && recRef.current
      ? { id: recRef.current.id, ms: Math.round(recRef.current.rec.ms()) }
      : null
  const renameRec = (id: string) => {
    const base = nbRef.current
    const r = base.recordings?.find((x) => x.id === id)
    const name = prompt('Kayıt adı', r?.name ?? '')?.trim()
    if (name) onChange({ ...base, recordings: (base.recordings ?? []).map((x) => (x.id === id ? { ...x, name } : x)) })
  }
  const deleteRec = (id: string) => {
    if (!confirm('Bu ses kaydı silinsin mi? Geri alınamaz.')) return
    const base = nbRef.current
    onChange({ ...base, recordings: (base.recordings ?? []).filter((x) => x.id !== id) })
    void deleteAudio(id)
  }
  const markSaved = (id: string) => {
    const base = nbRef.current
    onChange({ ...base, recordings: (base.recordings ?? []).map((x) => (x.id === id ? { ...x, savedAt: Date.now() } : x)) })
  }
  // Paylaşım ekranı SADECE dokunuşun içinde açılabilir (Safari): ses hazırsa hiç beklemeden çağrılır
  const exportRec = (id: string, blob?: Blob) => {
    const r = nbRef.current.recordings?.find((x) => x.id === id)
    if (!r) return
    const go = (b: Blob) => void exportAudio(b, r.name).then((ok) => ok && markSaved(id))
    if (blob) return go(blob)
    void loadAudio(id, r.where !== 'device').then((b) => (b ? go(b) : alert('Ses dosyası bu cihazda bulunamadı.')))
  }
  const saveSheetNow = () => {
    const sh = saveSheet
    if (!sh) return
    void exportAudio(sh.blob, sh.name).then((ok) => {
      if (ok) {
        markSaved(sh.id)
        setSaveSheet(null)
      }
    })
  }
  // Başka cihazda kaydedilmiş bir kaydın sesini, kaydettiğin dosyadan bu cihaza geri ekler
  const attachRec = async (id: string, file: File) => {
    try {
      await saveAudio(id, file)
      const base = nbRef.current
      onChange({ ...base, recordings: (base.recordings ?? []).map((x) => (x.id === id ? { ...x, where: 'device' } : x)) })
      setJump((j) => ({ id, ms: 0, n: (j?.n ?? 0) + 1 }))
    } catch {
      alert('Dosya eklenemedi.')
    }
  }
  const listenable = selection.strokes
    .map((i) => page.strokes[i])
    .find((st) => st?.rec && nb.recordings?.some((r) => r.id === st.rec!.id))
  const listenFrom = () => {
    if (!listenable?.rec) return
    const { id, ms } = listenable.rec
    setJump((j) => ({ id, ms: Math.max(0, ms - 3000), n: (j?.n ?? 0) + 1 }))
    setPanelOpen(true)
  }
  const goBack = async () => {
    if (recStateRef.current === 'recording' || recStateRef.current === 'paused') {
      if (!confirm('Ses kaydı sürüyor. Durdurup kaydedelim mi?')) return
      await stopRecording()
    }
    sweepEmpty()
    void indexPage(page.id)
    onBack()
  }

  const indexing = useRef(new Set<string>())
  const indexBlocked = useRef(false)
  const indexPage = async (pageId: string) => {
    if (indexBlocked.current || !ocrReadyRef.current || indexing.current.has(pageId) || !indexEnabled()) return
    const pg = nbRef.current.pages.find((p) => p.id === pageId)
    if (!pg) return
    const pen = pg.strokes.filter((s) => s.tool === 'pen')
    const hash = hashStrokes(pen)
    if (!pen.length) {
      if (pg.searchText || pg.indexedHash) onPageMeta(nbRef.current.id, pageId, { searchText: '', indexedHash: '' })
      return
    }
    if (pg.indexedHash === hash) return
    const png = strokesToPng(pen)
    if (!png) return
    indexing.current.add(pageId)
    try {
      const text = await readHandwriting(png.b64)
      onPageMeta(nbRef.current.id, pageId, { searchText: text === '[okunamadı]' ? '' : text, indexedHash: hash })
    } catch (e) {
      // Kota doldu / kurulu değil / yetki yok: bu oturumda tekrar deneme (sessizce)
      if (e instanceof OcrFailure && e.unavailable) ocrDown()
      if (/hakkın doldu|onaylı|süresi dolmuş|kotası|kullanılamıyor/.test((e as Error).message)) indexBlocked.current = true
    } finally {
      indexing.current.delete(pageId)
    }
  }
  // Yazmayı bırakıp 45 sn geçince, ya da uygulama arka plana gidince
  useEffect(() => {
    const t = window.setTimeout(() => void indexPage(page.id), 45000)
    return () => window.clearTimeout(t)
  }, [page.strokes, page.id])
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void indexPage(page.id)
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [page.id])

  // Seçili el yazısını Claude ile okutup yazı kutusuna çevirir
  const convertStrokes = async (indices: number[]) => {
    const picked = indices.map((i) => page.strokes[i]).filter((s) => s && s.tool === 'pen')
    const png = strokesToPng(picked)
    if (!png) return alert('Önce çevirmek istediğin el yazısını "Seç / taşı" ile çevreleyerek seç.')
    setOcrBusy(true)
    try {
      let text = ''
      try {
        text = await readHandwriting(png.b64)
      } catch (e) {
        if (e instanceof OcrFailure && e.unavailable) ocrDown()
        return alert((e as Error).message)
      }
      if (!text || text === '[okunamadı]') return alert('Yazı okunamadı. Daha net veya daha büyük yazmayı dene.')
      const rects = picked.flatMap((s) => s.points)
      const x0 = Math.min(...rects.map((p) => p[0])), y0 = Math.min(...rects.map((p) => p[1]))
      const x1 = Math.max(...rects.map((p) => p[0]))
      const nLines = text.split('\n').length
      const size = Math.min(40, Math.max(18, Math.round((png.h / nLines) * 0.45)))
      const left = Math.min(Math.max(8, x0), PAGE_W - 140)
      // Çizgili/kareli sayfada ilk satırın tabanı en yakın çizgiye otursun
      let top = y0
      if (lineH) {
        const base = y0 - 24 + (png.h - 48) / nLines
        const lineY = lines!.first + Math.max(0, Math.round((base - lines!.first) / lineH)) * lineH
        top = lineY - (lineH / 2 + size * 0.35)
      }
      const box: TextBox = {
        id: uid(), x: left, y: Math.max(0, top), w: Math.min(PAGE_W - left - 16, Math.max(260, x1 - x0 + 60)),
        text, font, size, color,
      }
      const drop = new Set(indices.filter((i) => page.strokes[i]?.tool === 'pen'))
      patch({ strokes: page.strokes.filter((_, i) => !drop.has(i)), texts: [...page.texts.filter((t) => t.text.trim()), box] })
      setSelection(EMPTY_SEL)
      setTool('text')
      setActiveText(box.id)
    } catch {
      alert('Bağlantı hatası, tekrar dene.')
    } finally {
      setOcrBusy(false)
    }
  }
  const convertToText = () => convertStrokes(selection.strokes)
  // Sayfadaki tüm el yazısını tek istekte çevirir
  const convertPage = () => {
    const all = page.strokes.flatMap((s, i) => (s.tool === 'pen' ? [i] : []))
    if (!all.length) return alert('Bu sayfada çevrilecek el yazısı yok.')
    if (!confirm('Sayfadaki tüm el yazısı yazıya çevrilsin mi?\nİstersen geri al (↶) ile eski haline dönebilirsin.')) return
    void convertStrokes(all)
  }
  const activeBox = tool === 'text' ? page.texts.find((t) => t.id === activeText) : undefined
  const removeText = (id: string) => patch({ texts: page.texts.filter((t) => t.id !== id) })

  return (
    <div className="editor">
      <header className="bar">
        <button onClick={() => void goBack()}>‹ Defterler</button>
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

      <div className="mediabar">
        <button onClick={() => setCamOpen(true)}>📷 Kamera</button>
        <button className={recState === 'idle' ? '' : 'rec-on'} onClick={() => setRecOpen(true)}>
          🎙 Kayıt{recState === 'recording' || recState === 'paused' ? ` ${fmtClock(recMs)}` : ''}
        </button>
        <button onClick={() => setPanelOpen(!panelOpen)}>🎧 Kayıtlar ({nb.recordings?.length ?? 0})</button>
      </div>
      {recOpen && (
        <RecorderBar
          state={recState}
          ms={recMs}
          error={recErr}
          onStart={requestStart}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={() => void stopRecording()}
          onClose={() => setRecOpen(false)}
        />
      )}
      <div className="tools">
        {(['pen', 'highlighter', 'eraser', 'shape', 'note', 'text', 'select'] as Tool[]).map((t) => (
          <button key={t} className={tool === t ? 'on' : ''} onClick={() => pickTool(t)}>
            {{ pen: '✎ Kalem', highlighter: '🖍 Fosforlu', eraser: '⌫ Silgi', text: 'T Yazı', select: '⬚ Seç / taşı', shape: '▭ Şekil', note: '🗒 Not' }[t]}
          </button>
        ))}
        <span className="sep" />
        {(tool === 'highlighter' ? HL_COLORS : tool === 'note' ? NOTE_COLORS : COLORS).map((c) => {
          const cur = tool === 'highlighter' ? hlColor : tool === 'note' ? noteColor : color
          return (
            <button
              key={c}
              className={`swatch ${cur === c ? 'on' : ''}`}
              style={{ background: c }}
              aria-label={COLOR_NAMES[c]}
              title={COLOR_NAMES[c]}
              onClick={() => {
                if (tool === 'highlighter') setHlColor(c)
                else if (tool === 'note') setNoteColor(c)
                else {
                  setColor(c)
                  if (tool === 'text' && activeBox) editText(activeBox.id, { color: c })
                }
              }}
            />
          )
        })}
        <span className="preview" title="Seçili renk ve kalınlık">
          <i
            style={{
              background: tool === 'highlighter' ? hlColor : tool === 'note' ? noteColor : color,
              opacity: tool === 'highlighter' ? 0.5 : 1,
              width: tool === 'text' ? 14 : Math.min(30, Math.max(3, tool === 'highlighter' ? width * 2.5 : width * 1.6)),
              height: tool === 'text' ? 14 : Math.min(30, Math.max(3, tool === 'highlighter' ? width * 2.5 : width * 1.6)),
            }}
          />
        </span>
        <span className="cname">{COLOR_NAMES[tool === 'highlighter' ? hlColor : tool === 'note' ? noteColor : color]}</span>
        <span className="sep" />
        {tool === 'text' ? (
          <>
            <div className="fontchips">
              {FONTS.map((f) => (
                <button
                  key={f}
                  className={'fontchip' + ((activeBox?.font ?? font) === f ? ' on' : '')}
                  style={{ fontFamily: f }}
                  onClick={() => {
                    setFont(f)
                    if (activeBox) editText(activeBox.id, { font: f })
                  }}
                >
                  Merhaba ğüşiöç
                </button>
              ))}
            </div>
            <input
              type="number"
              min={10}
              max={80}
              value={activeBox?.size ?? fontSize}
              onChange={(e) => {
                setFontSize(+e.target.value)
                if (activeBox && +e.target.value >= 10) editText(activeBox.id, { size: +e.target.value })
              }}
            />
          </>
        ) : (
          <input type="range" min={1} max={12} step={0.5} value={width} onChange={(e) => setWidth(+e.target.value)} />
        )}
        <span className="spacer" />
        {tool === 'shape' && (
          <>
            <select value={shapeKind} onChange={(e) => setShapeKind(e.target.value as ShapeKind)}>
              {(Object.keys(SHAPE_NAMES) as ShapeKind[]).map((k) => (
                <option key={k} value={k}>{SHAPE_NAMES[k]}</option>
              ))}
            </select>
            <button className={shapeFill ? 'on' : ''} onClick={() => setShapeFill(!shapeFill)}>Dolgu</button>
          </>
        )}
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
              selection={selection}
              smooth={smooth}
              shapeKind={shapeKind}
              shapeFill={shapeFill}
              onScene={(sc) => patch(sc)}
              onSelect={setSelection}
              onPlaceNote={placeNote}
              recClock={recClock}
              onPlaceText={placeText}
            />
            {(page.notes ?? []).map((n) => (
              <textarea
                key={n.id}
                className="note-text"
                placeholder={tool === 'note' ? 'Not yaz…' : ''}
                value={n.text}
                onChange={(e) => editNote(n.id, e.target.value)}
                style={{ left: n.x, top: n.y, width: n.w, height: n.h, pointerEvents: tool === 'note' ? 'auto' : 'none' }}
              />
            ))}
            {page.texts.map((t) => (
              <div
                key={t.id}
                className="tbox"
                style={{ left: t.x, top: t.y, width: t.w, pointerEvents: tool === 'text' ? 'auto' : 'none' }}
              >
                <textarea
                  autoFocus={!t.text}
                  value={t.text}
                  rows={Math.max(t.text ? 1 : 3, t.text.split('\n').length)}
                  style={{ fontFamily: t.font, fontSize: t.size, color: t.color, lineHeight: lineH ? `${lineH}px` : 1.3 }}
                  lang="tr"
                  placeholder="Klavyeyle yaz ya da Apple Pencil ile buraya yaz (Scribble)"
                  onFocus={() => setActiveText(t.id)}
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

      {tool === 'select' && !isEmptySel(selection) && (
        <div className="selbar">
          <span className="muted">
            {selection.strokes.length + selection.shapes.length + selection.images.length + selection.notes.length} seçili
          </span>
          <button onClick={deleteSelected}>🗑 Sil</button>
          {listenable && <button onClick={listenFrom}>▶ Buradan dinle</button>}
          {ocrReady && selection.strokes.length > 0 && (
            <button className="on" onClick={convertToText} disabled={ocrBusy}>
              {ocrBusy ? 'Çevriliyor…' : 'Aa Yazıya çevir'}
            </button>
          )}
          <button onClick={() => setSelection(EMPTY_SEL)}>Bırak</button>
        </div>
      )}
      <footer className="bar pager">
        <button onClick={() => goPage(Math.max(0, idx - 1))} disabled={idx === 0}>‹</button>
        <span>{idx + 1} / {nb.pages.length}</span>
        <button onClick={() => goPage(Math.min(nb.pages.length - 1, idx + 1))} disabled={idx >= nb.pages.length - 1}>›</button>
        <span className="spacer" />
        {ocrReady && (
          <button onClick={convertPage} disabled={ocrBusy} title="Sayfadaki tüm el yazısını yazıya çevir">Aa Çevir</button>
        )}
        <button onClick={() => addPage()}>+ Sayfa</button>
        <button onClick={delPage}>Sayfayı sil</button>
      </footer>
      {panelOpen && (
        <Recordings
          recordings={nb.recordings ?? []}
          jump={jump}
          onClose={() => setPanelOpen(false)}
          onDelete={deleteRec}
          onRename={renameRec}
          onExport={exportRec}
          onAttach={(id, f) => void attachRec(id, f)}
        />
      )}
      {consentOpen && <RecordConsent onChoose={chooseConsent} onCancel={() => setConsentOpen(false)} />}
      {saveSheet && <SaveSheet name={saveSheet.name} onSave={saveSheetNow} onLater={() => setSaveSheet(null)} />}
      {camOpen && <CameraSheet onCapture={(b) => void addImage(b)} onClose={() => setCamOpen(false)} />}
    </div>
  )
}
