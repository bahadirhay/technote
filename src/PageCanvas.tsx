import { useEffect, useRef } from 'react'
import { drawShape, drawStroke, recognizeShape } from './ink'
import { applyMove, applyResize, handleOf, hitScene, lassoSelect, selFromHit, selRect } from './geometry'
import {
  BG_LINES, EMPTY_SEL, PAGE_H, PAGE_W, isEmptySel, uid,
  type Background, type Page, type Pt, type Scene, type Selection, type Shape, type ShapeKind, type Stroke, type Tool,
} from './types'

interface Props {
  page: Page
  tool: Tool
  color: string
  width: number
  shapeKind: ShapeKind
  shapeFill: boolean
  bgImage?: HTMLCanvasElement | null
  imgs: Map<string, HTMLImageElement>
  selection: Selection
  smooth: boolean
  onScene: (scene: Scene) => void
  onSelect: (sel: Selection) => void
  onPlaceText: (x: number, y: number) => void
  onPlaceNote: (x: number, y: number) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  fingerDraw: boolean
  recClock?: () => { id: string; ms: number } | null
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

type Drag =
  | { mode: 'move'; sx: number; sy: number; base: Scene; sel: Selection }
  | { mode: 'resize'; base: Scene; sel: Selection }

export default function PageCanvas({
  page, tool, color, width, shapeKind, shapeFill, bgImage, imgs, selection, smooth,
  onScene, onSelect, onPlaceText, onPlaceNote, scrollRef, fingerDraw, recClock,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef<Stroke | null>(null)
  const liveShape = useRef<Shape | null>(null)
  const snap = useRef<Shape | null>(null)
  const snapTimer = useRef<number | undefined>(undefined)
  const still = useRef<Pt | null>(null)
  const lasso = useRef<Pt[] | null>(null)
  const erasing = useRef<Stroke[] | null>(null)
  const touches = useRef(new Map<number, number>())
  const tap = useRef<{ x: number; y: number; ok: boolean } | null>(null)
  const drag = useRef<Drag | null>(null)
  const draft = useRef<Scene | null>(null)
  // Dokunma ile doğrudan çizim/taşıma (parmak çizim modu ya da seçme aracı)
  const direct = fingerDraw || tool === 'select'

  const pageScene = (): Scene => ({
    strokes: page.strokes,
    shapes: page.shapes ?? [],
    images: page.images ?? [],
    notes: page.notes ?? [],
  })

  const draw = (sc: Scene = draft.current ?? pageScene(), extra?: { stroke?: Stroke | null }) => {
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
    for (const im of sc.images) {
      const el = imgs.get(im.docId)
      if (el) ctx.drawImage(el, im.x, im.y, im.w, im.h)
      else {
        ctx.fillStyle = '#e2e8f0'
        ctx.fillRect(im.x, im.y, im.w, im.h)
      }
    }
    for (const n of sc.notes) {
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,.25)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 3
      ctx.fillStyle = n.color
      ctx.fillRect(n.x, n.y, n.w, n.h)
      ctx.restore()
    }
    for (const s of sc.shapes) drawShape(ctx, s)
    if (liveShape.current) drawShape(ctx, liveShape.current)
    for (const s of sc.strokes) drawStroke(ctx, s, smooth)
    if (snap.current) drawShape(ctx, snap.current)
    else if (extra?.stroke) drawStroke(ctx, extra.stroke, smooth)
    if (tool === 'select') {
      ctx.save()
      ctx.strokeStyle = '#1d4ed8'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      const r = selRect(sc, selection)
      if (r) {
        ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8)
        const h = handleOf(sc, selection)
        if (h) {
          ctx.setLineDash([])
          ctx.fillStyle = '#1d4ed8'
          ctx.beginPath()
          ctx.arc(h[0], h[1], HANDLE / 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 3
          ctx.stroke()
        }
      }
      if (lasso.current && lasso.current.length > 1) {
        ctx.setLineDash([6, 5])
        ctx.strokeStyle = '#1d4ed8'
        ctx.beginPath()
        ctx.moveTo(lasso.current[0][0], lasso.current[0][1])
        for (const p of lasso.current) ctx.lineTo(p[0], p[1])
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  useEffect(() => {
    const c = ref.current!
    const dpr = window.devicePixelRatio || 1
    if (c.width !== PAGE_W * dpr) {
      c.width = PAGE_W * dpr
      c.height = PAGE_H * dpr
    }
    draw()
  })

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
      draw({ ...pageScene(), strokes: next })
    }
  }

  const selectDown = (x: number, y: number) => {
    const sc = pageScene()
    if (!isEmptySel(selection)) {
      const h = handleOf(sc, selection)
      if (h && Math.hypot(h[0] - x, h[1] - y) < HANDLE * 1.6) {
        drag.current = { mode: 'resize', base: sc, sel: selection }
        draft.current = sc
        return
      }
      const r = selRect(sc, selection)
      if (r && x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= r.y + r.h + 6) {
        drag.current = { mode: 'move', sx: x, sy: y, base: sc, sel: selection }
        draft.current = sc
        return
      }
    }
    const hit = hitScene(sc, x, y)
    if (hit) {
      const sel = selFromHit(hit)
      onSelect(sel)
      drag.current = { mode: 'move', sx: x, sy: y, base: sc, sel }
      draft.current = sc
      return
    }
    onSelect(EMPTY_SEL)
    lasso.current = [[x, y, 0]]
  }

  const selectMove = (x: number, y: number) => {
    const d = drag.current
    if (d) {
      draft.current = d.mode === 'move' ? applyMove(d.base, d.sel, x - d.sx, y - d.sy) : applyResize(d.base, d.sel, x, y)
    } else if (lasso.current) lasso.current.push([x, y, 0])
  }

  const down = (e: React.PointerEvent) => {
    // Yazı/not aracı: dokunuş bırakılınca (up) kutu açılır; kaydırma ile karışmasın
    if (tool === 'text' || tool === 'note') {
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
        liveShape.current = null
        lasso.current = null
        drag.current = null
        draft.current = null
      }
      if (!direct || touches.current.size >= 2) {
        draw()
        return
      }
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = pos(e)
    if (tool === 'select') return selectDown(p[0], p[1])
    if (tool === 'eraser') return eraseAt(p[0], p[1])
    if (tool === 'shape') {
      liveShape.current = { id: uid(), kind: shapeKind, x1: p[0], y1: p[1], x2: p[0], y2: p[1], color, width, fill: shapeFill }
      return
    }
    snap.current = null
    still.current = p
    const rc = recClock?.()
    live.current = { tool, color, width, points: [p], ...(rc ? { rec: rc } : {}) }
    draw(undefined, { stroke: live.current })
  }

  const move = (e: React.PointerEvent) => {
    if (tool === 'text' || tool === 'note') {
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
      else if (liveShape.current) {
        liveShape.current.x2 = x
        liveShape.current.y2 = y
      } else if (erasing.current || tool === 'eraser') {
        if (e.buttons) eraseAt(x, y)
      } else if (live.current) {
        const pr = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5
        live.current.points.push([x, y, pr])
        // Kalemi ~0,5 sn bekletince çizim düzgün şekle döner
        if (live.current.tool === 'pen') {
          if (!still.current || Math.hypot(x - still.current[0], y - still.current[1]) > 4) {
            still.current = [x, y, pr]
            window.clearTimeout(snapTimer.current)
            snap.current = null
            snapTimer.current = window.setTimeout(() => {
              const l = live.current
              const g = l && recognizeShape(l.points)
              if (l && g) {
                snap.current = { id: uid(), ...g, color: l.color, width: l.width, fill: false }
                draw(undefined, { stroke: l })
              }
            }, 500)
          }
        }
      }
    }
    if (live.current) draw(undefined, { stroke: live.current })
    else if (liveShape.current || (tool === 'select' && (drag.current || lasso.current))) draw()
  }

  const up = (e: React.PointerEvent) => {
    if (tool === 'text' || tool === 'note') {
      touches.current.delete(e.pointerId)
      const t = tap.current
      tap.current = null
      if (t?.ok && touches.current.size === 0) {
        const p = pos(e)
        if (tool === 'text') onPlaceText(p[0], p[1])
        else onPlaceNote(p[0], p[1])
      }
      return
    }
    if (e.pointerType === 'touch') touches.current.delete(e.pointerId)
    if (drag.current && draft.current) {
      onScene(draft.current)
      drag.current = null
      draft.current = null
    }
    if (lasso.current) {
      onSelect(lassoSelect(pageScene(), lasso.current))
      lasso.current = null
    }
    if (liveShape.current) {
      const s = liveShape.current
      liveShape.current = null
      if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 8) onScene({ ...pageScene(), shapes: [...(page.shapes ?? []), s] })
      else draw()
    }
    window.clearTimeout(snapTimer.current)
    if (live.current && snap.current) {
      const s = snap.current
      snap.current = null
      live.current = null
      onScene({ ...pageScene(), shapes: [...(page.shapes ?? []), s] })
    } else if (live.current) {
      onScene({ ...pageScene(), strokes: [...page.strokes, live.current] })
      live.current = null
    } else if (erasing.current) {
      onScene({ ...pageScene(), strokes: erasing.current })
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
