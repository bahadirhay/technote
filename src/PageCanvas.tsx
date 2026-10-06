import { useCallback, useEffect, useRef } from 'react'
import { PAGE_H, PAGE_W, type Page, type Pt, type Stroke, type Tool } from './types'

interface Props {
  page: Page
  tool: Tool
  color: string
  width: number
  bgImage?: HTMLCanvasElement | null
  onStrokes: (strokes: Stroke[]) => void
  onPlaceText: (x: number, y: number) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  fingerDraw: boolean
}

const drawBg = (ctx: CanvasRenderingContext2D, bg: Page['bg']) => {
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)
  ctx.strokeStyle = '#cfd8e3'
  ctx.lineWidth = 1
  ctx.beginPath()
  if (bg === 'lined') for (let y = 80; y < PAGE_H; y += 34) { ctx.moveTo(0, y); ctx.lineTo(PAGE_W, y) }
  if (bg === 'grid') {
    for (let y = 0; y < PAGE_H; y += 30) { ctx.moveTo(0, y); ctx.lineTo(PAGE_W, y) }
    for (let x = 0; x < PAGE_W; x += 30) { ctx.moveTo(x, 0); ctx.lineTo(x, PAGE_H) }
  }
  ctx.stroke()
}

const drawStroke = (ctx: CanvasRenderingContext2D, s: Stroke) => {
  const pts = s.points
  if (!pts.length) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = s.color
  if (s.tool === 'highlighter') {
    ctx.globalAlpha = 0.35
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

export default function PageCanvas({ page, tool, color, width, bgImage, onStrokes, onPlaceText, scrollRef, fingerDraw }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef<Stroke | null>(null)
  const erasing = useRef<Stroke[] | null>(null)
  const touches = useRef(new Map<number, number>())
  const tap = useRef<{ x: number; y: number; ok: boolean } | null>(null)

  const redraw = useCallback(
    (strokes: Stroke[], extra?: Stroke | null) => {
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
      for (const s of strokes) drawStroke(ctx, s)
      if (extra) drawStroke(ctx, extra)
    },
    [page.bg, bgImage],
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
      // 2 parmak: cizimi iptal et, kaydirma moduna gec
      if (touches.current.size >= 2) live.current = null
      if (!fingerDraw || touches.current.size >= 2) {
        redraw(page.strokes)
        return
      }
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = pos(e)
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
    if (e.pointerType === 'touch' && (!fingerDraw || touches.current.size >= 2)) {
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
      if (erasing.current || tool === 'eraser') {
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
