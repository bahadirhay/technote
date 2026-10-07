import { EMPTY_SEL, type ImageBox, type Pt, type Scene, type Selection, type Shape, type Sticky, type Stroke } from './types'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const shapeRect = (s: Shape): Rect => ({
  x: Math.min(s.x1, s.x2),
  y: Math.min(s.y1, s.y2),
  w: Math.abs(s.x2 - s.x1),
  h: Math.abs(s.y2 - s.y1),
})

export const strokeRect = (s: Stroke): Rect => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of s.points) {
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1])
    x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1])
  }
  const pad = s.width * (s.tool === 'highlighter' ? 2 : 1)
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }
}

const inRect = (r: Rect, x: number, y: number, pad = 0) =>
  x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad

const distSeg = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
  const dx = x2 - x1, dy = y2 - y1
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

const strokeHit = (s: Stroke, x: number, y: number) => {
  const r = 12 + s.width
  const pts = s.points
  if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y) < r
  for (let i = 1; i < pts.length; i++) if (distSeg(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) < r) return true
  return false
}

export type Hit = { kind: 'strokes'; key: number } | { kind: 'shapes' | 'images' | 'notes'; key: string }

// Üstteki nesneden alttakine doğru: çizgi > şekil > not > resim
export const hitScene = (sc: Scene, x: number, y: number): Hit | null => {
  for (let i = sc.strokes.length - 1; i >= 0; i--) if (strokeHit(sc.strokes[i], x, y)) return { kind: 'strokes', key: i }
  for (let i = sc.shapes.length - 1; i >= 0; i--) {
    const s = sc.shapes[i]
    const hit = s.kind === 'line' || s.kind === 'arrow' ? distSeg(x, y, s.x1, s.y1, s.x2, s.y2) < 14 : inRect(shapeRect(s), x, y, 10)
    if (hit) return { kind: 'shapes', key: s.id }
  }
  for (let i = sc.notes.length - 1; i >= 0; i--) if (inRect(sc.notes[i], x, y)) return { kind: 'notes', key: sc.notes[i].id }
  for (let i = sc.images.length - 1; i >= 0; i--) if (inRect(sc.images[i], x, y)) return { kind: 'images', key: sc.images[i].id }
  return null
}

export const selFromHit = (h: Hit): Selection => ({ ...EMPTY_SEL, [h.kind]: [h.key] })

export const selRect = (sc: Scene, sel: Selection): Rect | null => {
  const rs: Rect[] = [
    ...sel.strokes.map((i) => sc.strokes[i]).filter(Boolean).map(strokeRect),
    ...sc.shapes.filter((s) => sel.shapes.includes(s.id)).map(shapeRect),
    ...sc.images.filter((s) => sel.images.includes(s.id)),
    ...sc.notes.filter((s) => sel.notes.includes(s.id)),
  ]
  if (!rs.length) return null
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y))
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// Tek bir resim / şekil / not seçiliyse boyutlandırma tutamacı
export const handleOf = (sc: Scene, sel: Selection): Pt | null => {
  const n = sel.shapes.length + sel.images.length + sel.notes.length
  if (sel.strokes.length || n !== 1) return null
  const sh = sc.shapes.find((s) => s.id === sel.shapes[0])
  if (sh) return [sh.x2, sh.y2, 0]
  const o: ImageBox | Sticky | undefined = sc.images.find((s) => s.id === sel.images[0]) ?? sc.notes.find((s) => s.id === sel.notes[0])
  return o ? [o.x + o.w, o.y + o.h, 0] : null
}

export const applyMove = (sc: Scene, sel: Selection, dx: number, dy: number): Scene => ({
  strokes: sc.strokes.map((s, i) => (sel.strokes.includes(i) ? { ...s, points: s.points.map((p): Pt => [p[0] + dx, p[1] + dy, p[2]]) } : s)),
  shapes: sc.shapes.map((s) => (sel.shapes.includes(s.id) ? { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy } : s)),
  images: sc.images.map((s) => (sel.images.includes(s.id) ? { ...s, x: s.x + dx, y: s.y + dy } : s)),
  notes: sc.notes.map((s) => (sel.notes.includes(s.id) ? { ...s, x: s.x + dx, y: s.y + dy } : s)),
})

export const applyResize = (sc: Scene, sel: Selection, x: number, y: number): Scene => ({
  ...sc,
  shapes: sc.shapes.map((s) => (sel.shapes.includes(s.id) ? { ...s, x2: x, y2: y } : s)),
  images: sc.images.map((s) => {
    if (!sel.images.includes(s.id)) return s
    const w = Math.max(40, x - s.x)
    return { ...s, w, h: (w * s.h) / s.w }
  }),
  notes: sc.notes.map((s) => (sel.notes.includes(s.id) ? { ...s, w: Math.max(100, x - s.x), h: Math.max(70, y - s.y) } : s)),
})

const inPoly = (poly: Pt[], x: number, y: number) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export const lassoSelect = (sc: Scene, poly: Pt[]): Selection => {
  if (poly.length < 3) return EMPTY_SEL
  const center = (r: Rect) => inPoly(poly, r.x + r.w / 2, r.y + r.h / 2)
  return {
    strokes: sc.strokes.flatMap((s, i) => (s.points.filter((p) => inPoly(poly, p[0], p[1])).length >= s.points.length / 2 ? [i] : [])),
    shapes: sc.shapes.filter((s) => center(shapeRect(s))).map((s) => s.id),
    images: sc.images.filter(center).map((s) => s.id),
    notes: sc.notes.filter(center).map((s) => s.id),
  }
}

export const deleteSelection = (sc: Scene, sel: Selection): Scene => ({
  strokes: sc.strokes.filter((_, i) => !sel.strokes.includes(i)),
  shapes: sc.shapes.filter((s) => !sel.shapes.includes(s.id)),
  images: sc.images.filter((s) => !sel.images.includes(s.id)),
  notes: sc.notes.filter((s) => !sel.notes.includes(s.id)),
})
