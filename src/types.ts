export type Pt = [number, number, number]

export type Tool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'select' | 'shape' | 'note'

export interface Stroke {
  tool: 'pen' | 'highlighter'
  color: string
  width: number
  points: Pt[]
}

export interface TextBox {
  id: string
  x: number
  y: number
  w: number
  text: string
  font: string
  size: number
  color: string
}

export type Background = 'blank' | 'lined' | 'grid' | 'dotted' | 'cornell'

export const BG_NAMES: Record<Background, string> = {
  blank: 'Boş',
  lined: 'Çizgili',
  grid: 'Kareli',
  dotted: 'Noktalı',
  cornell: 'Cornell',
}

// Yazının oturacağı satır aralıkları (yazı aracı ve çizim aynı değeri kullanır)
export const BG_LINES: Partial<Record<Background, { first: number; step: number }>> = {
  lined: { first: 80, step: 34 },
  grid: { first: 0, step: 30 },
  dotted: { first: 0, step: 30 },
  cornell: { first: 100, step: 34 },
}

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow'

export const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: '▭ Dikdörtgen',
  ellipse: '◯ Elips',
  triangle: '△ Üçgen',
  line: '／ Çizgi',
  arrow: '→ Ok',
}

export interface Shape {
  id: string
  kind: ShapeKind
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  width: number
  fill: boolean
}

export interface Sticky {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
  color: string
}

export interface Scene {
  strokes: Stroke[]
  shapes: Shape[]
  images: ImageBox[]
  notes: Sticky[]
}

export interface Selection {
  strokes: number[]
  shapes: string[]
  images: string[]
  notes: string[]
}

export const EMPTY_SEL: Selection = { strokes: [], shapes: [], images: [], notes: [] }
export const isEmptySel = (s: Selection) => !(s.strokes.length || s.shapes.length || s.images.length || s.notes.length)

export interface ImageBox {
  id: string
  docId: string
  x: number
  y: number
  w: number
  h: number
}

export interface Page {
  id: string
  bg: Background
  strokes: Stroke[]
  texts: TextBox[]
  images?: ImageBox[]
  shapes?: Shape[]
  notes?: Sticky[]
  pdf?: { docId: string; pageNum: number }
}

export interface Notebook {
  id: string
  name: string
  color: string
  createdAt: number
  pages: Page[]
}

export const PAGE_W = 800
export const PAGE_H = 1100

export const uid = () => Math.random().toString(36).slice(2, 10)

export const newPage = (bg: Background = 'lined'): Page => ({
  id: uid(),
  bg,
  strokes: [],
  texts: [],
})
