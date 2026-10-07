import { useCallback, useEffect, useRef } from 'react'
import { BG_LINES, PAGE_H, PAGE_W, type Background, type ImageBox, type Page, type Pt, type Stroke, type Tool } from './types'

interface Props {
  page: Page
  tool: Tool
  color: string
  width: number
  bgImage?: HTMLCanvasElement | null
  imgs: Map<string, HTMLImageElement>
  selectedId: string | null
  smooth: boolean
  onStrokes: (strokes: Stroke[]) => void
  onImages: (images: ImageBox[]) => void
  onSelect: (id: string | null) => void
  onPlaceText: (x: number, y: number) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  fingerDraw: boolean
}

const HANDLE = 22

const drawBg = (ctx: CanvasRenderingContext2D, bg: Background) => {
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)
  const L = BG_LINES[bg]
  ctx.strokeStyle = '#cfd8e3'
  ctx.lineWidth = 1
  ctx.beginPath()
  if (bg === 'lined') for (let y = L!.first; y < PAGE_H; y += L!.step) { ctx.moveTo(0, y); ctx.lineTo(PAGE_W, y) }
  if (bg === 'grid') {
    for (let y = 0; y < PAGE_H; y += 30) { ctx.moveTo(0, y); ctx.lineTo(PAGE_W, y) }
    for (let x = 0; x < PAGE_W; x += 30) { ctx.moveTo(x, 0); ctx.lineTo(x, PAGE_H) }
  }
  if (bg === 'cornell') for (let y = L!.first; y < 930; y += L!.step) { ctx.moveTo(190, y); ctx.lineTo(PAGE_W, y) }
  ctx.stroke()
  if (bg === 'dotted') {
    ctx.fillStyle = '#94a3b8'
    for (let y = 30; y < PAGE_H; y += 30) for (let x = 30; x < PAGE_W; x += 30) { ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill() }
  }
  if (bg === 'cornell') {
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(190, 60); ctx.lineTo(190, 940)
    ctx.moveTo(0, 60); ctx.lineTo(PAGE_W, 60)
    ctx.moveTo(0, 940); ctx.lineTo(PAGE_W, 940)
    ctx.stroke()
  }
}

// Titreşimi azaltır: komşu noktaların ağırlıklı ortalaması (uçlar sabit)
const smoothPts = (pts: Pt[]): Pt[] => {
  let cur = pts
  for (let k = 0; k < 2 && cur.length > 2; k++) {
    const out: Pt[] = [cur[0]]
    for (let i = 1; i < cur.length - 1; i++) {
      out.push([
        (cur[i - 1][0] + 2 * cur[i][0] + cur[i + 1][0]) / 4,
        (cur[i - 1][1] + 2 * cur[i][1] + cur[i + 1][1]) / 4,
        cur[i][2],
      ])
    }
    out.push(cur[cur.length - 1])
    cur = out
  }
  return cur
}

const drawStroke = (ctx: CanvasRenderingContext2D, s: Stroke, smooth: boolean) => {
  if (!s.points.length) return
  const pts = smooth ? smoothPts(s.points) : s.points
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = s.color
  if (s.tool === 'highlighter') {
    ctx.globalAlpha = 0.45
    ctx.globalCompositeOperation = 'multiply'
    ctx.lineWidth = s.width * 4
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (const p of pts) ctx.lineTo(p[0], p[1])
    ctx.stroke()
  } else {
    if (pts.length === 1) {
      ctx.fillStyle = s.color
      ctx.beginPath()
      ctx.arc(pts[0][0], pts[0][1], s.width / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1, p] = pts[i]
      ctx.lineWidth = s.width * (0.4 + 1.2 * p)
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
  }
  ctx.restore()
}

type Drag = { id: string; mode: 'move' | 'resize'; dx: number; dy: number; ratio: number }

export default function PageCanvas({
  page, tool, color, width, bgImage, imgs, selectedId, smooth,
  onStrokes, onImages, onSelect, onPlaceText, scrollRef, fingerDraw,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef<Stroke | null>(null)
  const erasing = useRef<Stroke[] | null>(null)
  const touches = useRef(new Map<number, number>())
  const tap = useRef<{ x: number; y: number; ok: boolean } | null>(null)
  const drag = useRef<Drag | null>(null)
  const draft = useRef<ImageBox[] | null>(null)
  // Dokunma ile doğrudan çizim/taşıma (parmak çizim modu ya da resim seçme)
  const direct = fingerDraw || tool === 'select'

  const redraw = useCallback(
    (strokes: Stroke[], extra?: Stroke | null, images: ImageBox[] = page.images ?? []) => {
      const c = ref.current
      if (!c) return
      const ctx = c.getContext('2d')!
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (bgImage) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, PAGE_W, PAGE_H)
        ctx.drawImage(bgImage, 0, 0, PAGE_W, PAGE_H)
      } else drawBg(ctx, page.bg)
      for (const im of images) {
        const el = imgs.get(im.docId)
        if (el) ctx.drawImage(el, im.x, im.y, im.w, im.h)
        else {
          ctx.fillStyle = '#e2e8f0'
          ctx.fillRect(im.x, im.y, im.w, im.h)
        }
      }
      for (const s of strokes) drawStroke(ctx, s, smooth)
      if (extra) drawStroke(ctx, extra, smooth)
      const sel = tool === 'select' && images.find((i) => i.id === selectedId)
      if (sel) {
        ctx.save()
        ctx.strokeStyle = '#1d4ed8'
        ctx.lineWidth = 2
        ctx.setLineDash([8, 6])
        ctx.strokeRect(sel.x, sel.y, sel.w, sel.h)
        ctx.setLineDash([])
        ctx.fillStyle = '#1d4ed8'
        ctx.beginPath()
        ctx.arc(sel.x + sel.w, sel.y + sel.h, HANDLE / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.restore()
      }
    },
    [page.bg, page.images, bgImage, imgs, selectedId, tool, smooth],
  )

  useEffect(() => {
    const c = ref.current!
    const dpr = window.devicePixelRatio || 1
    if (c.width !== PAGE_W * dpr) {
      c.width = PAGE_W * dpr
      c.height = PAGE_H * dpr
    }
    redraw(page.strokes)
  }, [page.strokes, redraw])

  const pos = (e: React.PointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * PAGE_W
    const y = ((e.clientY - r.top) / r.height) * PAGE_H
    return [x, y, e.pressure > 0 && e.pointerType === 'pen' ? e.pressure : 0.5]
  }

  const eraseAt = (x: number, y: number) => {
    const base = erasing.current ?? page.strokes
    const r = 14
    const next = base.filter((s) => !s.points.some((p) => Math.hypot(p[0] - x, p[1] - y) < r))
    if (next.length !== base.length) {
      erasing.current = next
      redraw(next)
    }
  }

  const selectDown = (x: number, y: number) => {
    const list = page.images ?? []
    const sel = list.find((i) => i.id === selectedId)
    if (sel && Math.hypot(sel.x + sel.w - x, sel.y + sel.h - y) < HANDLE * 1.6) {
      drag.current = { id: sel.id, mode: 'resize', dx: 0, dy: 0, ratio: sel.w / sel.h }
      draft.current = list
      return
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const im = list[i]
      if (x >= im.x && x <= im.x + im.w && y >= im.y && y <= im.y + im.h) {
        onSelect(im.id)
        drag.current = { id: im.id, mode: 'move', dx: x - im.x, dy: y - im.y, ratio: im.w / im.h }
        draft.current = list
        return
      }
    }
    onSelect(null)
  }

  const selectMove = (x: number, y: number) => {
    const d = drag.current
    if (!d || !draft.current) return
    draft.current = draft.current.map((im) => {
      if (im.id !== d.id) return im
      if (d.mode === 'move') return { ...im, x: x - d.dx, y: y - d.dy }
      const w = Math.max(40, x - im.x)
      return { ...im, w, h: w / d.ratio }
    })
    redraw(page.strokes, null, draft.current)
  }

  const down = (e: React.PointerEvent) => {
    // Yazı aracı: dokunuş bırakılınca (up) kutu açılır; kaydırma ile karışmasın
    if (tool === 'text') {
      tap.current = { x: e.clientX, y: e.clientY, ok: true }
      if (e.pointerType === 'touch') touches.current.set(e.pointerId, e.clientY)
      if (touches.current.size >= 2) tap.current.ok = false
      return
    }
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, e.clientY)
      // 2 parmak: çizimi iptal et, kaydırma moduna geç
      if (touches.current.size >= 2) {
        live.current = null
        drag.current = null
        draft.current = null
      }
      if (!direct || touches.current.size >= 2) {
        redraw(page.strokes)
        return
      }
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = pos(e)
    if (tool === 'select') return selectDown(p[0], p[1])
    if (tool === 'eraser') return eraseAt(p[0], p[1])
    live.current = { tool, color, width, points: [p] }
    redraw(page.strokes, live.current)
  }

  const move = (e: React.PointerEvent) => {
    if (tool === 'text') {
      const t = tap.current
      if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) t.ok = false
      const last = touches.current.get(e.pointerId)
      if (e.pointerType === 'touch' && last != null && scrollRef.current) {
        scrollRef.current.scrollTop -= e.clientY - last
        touches.current.set(e.pointerId, e.clientY)
      }
      return
    }
    if (e.pointerType === 'touch' && (!direct || touches.current.size >= 2)) {
      const last = touches.current.get(e.pointerId)
      if (last != null && scrollRef.current) {
        scrollRef.current.scrollTop -= (e.clientY - last) / touches.current.size
        touches.current.set(e.pointerId, e.clientY)
      }
      return
    }
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const ev of events) {
      const r = ref.current!.getBoundingClientRect()
      const x = ((ev.clientX - r.left) / r.width) * PAGE_W
      const y = ((ev.clientY - r.top) / r.height) * PAGE_H
      if (tool === 'select') selectMove(x, y)
      else if (erasing.current || tool === 'eraser') {
        if (e.buttons) eraseAt(x, y)
      } else if (live.current) {
        const pr = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5
        live.current.points.push([x, y, pr])
      }
    }
    if (live.current) redraw(page.strokes, live.current)
  }

  const up = (e: React.PointerEvent) => {
    if (tool === 'text') {
      touches.current.delete(e.pointerId)
      const t = tap.current
      tap.current = null
      if (t?.ok && touches.current.size === 0) {
        const p = pos(e)
        onPlaceText(p[0], p[1])
      }
      return
    }
    if (e.pointerType === 'touch') touches.current.delete(e.pointerId)
    if (drag.current && draft.current) {
      onImages(draft.current)
      drag.current = null
      draft.current = null
    }
    if (live.current) {
      onStrokes([...page.strokes, live.current])
      live.current = null
    } else if (erasing.current) {
      onStrokes(erasing.current)
      erasing.current = null
    }
  }

  return (
    <canvas
      ref={ref}
      className="page-canvas"
      style={{ touchAction: 'none', width: PAGE_W, height: PAGE_H }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  )
}
