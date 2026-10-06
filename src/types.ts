export type Pt = [number, number, number]

export type Tool = 'pen' | 'highlighter' | 'eraser' | 'text'

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

export type Background = 'blank' | 'lined' | 'grid'

export interface Page {
  id: string
  bg: Background
  strokes: Stroke[]
  texts: TextBox[]
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
