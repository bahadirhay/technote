import { shapeRect, strokeRect } from './geometry'
import type { Pt, Shape, Stroke } from './types'

// Titreşimi azaltır: komşu noktaların ağırlıklı ortalaması (uçlar sabit)
export const smoothPts = (pts: Pt[]): Pt[] => {
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

export const drawStroke = (ctx: CanvasRenderingContext2D, s: Stroke, smooth: boolean) => {
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


export const drawShape = (ctx: CanvasRenderingContext2D, s: Shape) => {
  const r = shapeRect(s)
  ctx.save()
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineWidth = s.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (s.kind === 'rect') ctx.rect(r.x, r.y, r.w, r.h)
  else if (s.kind === 'ellipse') ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2)
  else if (s.kind === 'triangle') {
    ctx.moveTo(r.x + r.w / 2, r.y)
    ctx.lineTo(r.x + r.w, r.y + r.h)
    ctx.lineTo(r.x, r.y + r.h)
    ctx.closePath()
  } else {
    ctx.moveTo(s.x1, s.y1)
    ctx.lineTo(s.x2, s.y2)
    if (s.kind === 'arrow') {
      const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1)
      const len = 14 + s.width * 2.5
      for (const d of [-0.5, 0.5]) {
        ctx.moveTo(s.x2, s.y2)
        ctx.lineTo(s.x2 - len * Math.cos(a + d), s.y2 - len * Math.sin(a + d))
      }
    }
  }
  if (s.fill && s.kind !== 'line' && s.kind !== 'arrow') {
    ctx.globalAlpha = 0.18
    ctx.fill()
    ctx.globalAlpha = 1
  }
  ctx.stroke()
  ctx.restore()
}


// ---- Şekil tanıma (kalemi bir an bekletince çizim düzgün şekle döner) ----

type Guess = Pick<Shape, 'kind' | 'x1' | 'y1' | 'x2' | 'y2'>

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

const distToLine = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
}

// Ramer–Douglas–Peucker: köşe sayısını bulmak için sadeleştirme
const rdp = (pts: Pt[], eps: number): Pt[] => {
  if (pts.length < 3) return pts
  let idx = 0, max = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToLine(pts[i], pts[0], pts[pts.length - 1])
    if (d > max) { max = d; idx = i }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]]
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)]
}

export const recognizeShape = (points: Pt[]): Guess | null => {
  if (points.length < 8) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1])
    if (i) len += dist(points[i - 1], p)
  }
  const w = x1 - x0, h = y1 - y0
  const diag = Math.hypot(w, h)
  if (diag < 40) return null
  const first = points[0], last = points[points.length - 1]
  const closed = dist(first, last) < Math.max(0.22 * len, 0.18 * diag)

  if (!closed) {
    const chord = dist(first, last)
    if (chord < 40) return null
    const dev = Math.max(...points.map((p) => distToLine(p, first, last)))
    if (dev < 0.07 * chord) return { kind: 'line', x1: first[0], y1: first[1], x2: last[0], y2: last[1] }
    return null
  }

  // Kapalı çizimde başlangıç=bitiş olduğundan döngüyü en uzak noktadan ikiye bölüp köşeleri say
  const loop = [...points, points[0]]
  let far = 0, fd = 0
  for (let i = 0; i < points.length; i++) {
    const d = dist(points[0], points[i])
    if (d > fd) { fd = d; far = i }
  }
  const eps = 0.06 * diag
  const corners = rdp(loop.slice(0, far + 1), eps).length - 1 + (rdp(loop.slice(far), eps).length - 1)
  if (corners === 3 && w > 30 && h > 30) return { kind: 'triangle', x1: x0, y1: y0, x2: x1, y2: y1 }
  if (corners === 4 && w > 30 && h > 30) return { kind: 'rect', x1: x0, y1: y0, x2: x1, y2: y1 }
  // Elips: merkezden uzaklıklar (normalize) neredeyse sabitse
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const rs = points.map((p) => Math.hypot((p[0] - cx) / (w / 2 || 1), (p[1] - cy) / (h / 2 || 1)))
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length)
  if (w > 30 && h > 30 && sd / mean < 0.1) return { kind: 'ellipse', x1: x0, y1: y0, x2: x1, y2: y1 }
  return null
}

// Seçili çizgileri tanıma (OCR) için beyaz zeminli PNG yapar
export const strokesToPng = (strokes: Stroke[], maxSide = 1400): { b64: string; w: number; h: number } | null => {
  if (!strokes.length) return null
  const rects = strokes.map(strokeRect)
  const pad = 24
  const x = Math.min(...rects.map((r) => r.x)) - pad
  const y = Math.min(...rects.map((r) => r.y)) - pad
  const w = Math.max(...rects.map((r) => r.x + r.w)) + pad - x
  const h = Math.max(...rects.map((r) => r.y + r.h)) + pad - y
  const k = Math.min(2, maxSide / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * k))
  c.height = Math.max(1, Math.round(h * k))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.setTransform(k, 0, 0, k, -x * k, -y * k)
  // Renk önemsiz: hepsini siyah çiz, fosforlu varsa atla (yazı değil)
  for (const s of strokes) if (s.tool === 'pen') drawStroke(ctx, { ...s, color: '#000' }, true)
  return { b64: c.toDataURL('image/png').split(',')[1], w, h }
}
