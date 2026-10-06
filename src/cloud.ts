import { createClient } from '@supabase/supabase-js'
import type { Notebook } from './types'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const cloudConfigured = Boolean(URL && KEY)
export const supabase = createClient(URL ?? 'http://localhost', KEY ?? 'missing')

export type Status = 'pending' | 'approved' | 'rejected'
export interface Profile {
  id: string
  email: string
  status: Status
  is_admin: boolean
  created_at: string
}
export interface Invite {
  email: string
}

const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export const fetchProfile = async (userId: string) =>
  must(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle<Profile>())

export const fetchNotebooks = async (): Promise<Notebook[]> => {
  const rows = must(await supabase.from('notebooks').select('id,name,color,created_at,pages').order('created_at'))
  return (rows as { id: string; name: string; color: string; created_at: number; pages: Notebook['pages'] }[]).map(
    (r) => ({ id: r.id, name: r.name, color: r.color, createdAt: r.created_at, pages: r.pages }),
  )
}

export const upsertNotebook = async (nb: Notebook) => {
  must(
    await supabase.from('notebooks').upsert(
      { id: nb.id, name: nb.name, color: nb.color, created_at: nb.createdAt, pages: nb.pages, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,id' },
    ).select('id'),
  )
}

export const removeNotebook = async (id: string) => {
  must(await supabase.from('notebooks').delete().eq('id', id).select('id'))
}

const pdfPath = async (docId: string) => {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Oturum yok')
  return `${data.user.id}/${docId}.pdf`
}

export const uploadPdf = async (docId: string, data: ArrayBuffer) => {
  const { error } = await supabase.storage
    .from('pdfs')
    .upload(await pdfPath(docId), data, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(error.message)
}

export const downloadPdf = async (docId: string): Promise<ArrayBuffer | undefined> => {
  const { data, error } = await supabase.storage.from('pdfs').download(await pdfPath(docId))
  if (error || !data) return undefined
  return data.arrayBuffer()
}

// --- yönetici ---
export const listProfiles = async () =>
  must(await supabase.from('profiles').select('*').order('created_at', { ascending: false })) as Profile[]

export const setProfileStatus = async (id: string, status: Status) => {
  must(await supabase.from('profiles').update({ status }).eq('id', id).select('id'))
}

export const listInvites = async () => must(await supabase.from('invites').select('email').order('created_at')) as Invite[]

export const addInvite = async (email: string) => {
  const e = email.trim().toLowerCase()
  must(await supabase.from('invites').upsert({ email: e }).select('email'))
  // Zaten kayıtlı ama bekleyen biri varsa direkt onayla
  must(await supabase.from('profiles').update({ status: 'approved' }).eq('email', e).eq('status', 'pending').select('id'))
}

export const removeInvite = async (email: string) => {
  must(await supabase.from('invites').delete().eq('email', email).select('email'))
}

export const getSignupsOpen = async () =>
  must(await supabase.from('settings').select('signups_open').maybeSingle<{ signups_open: boolean }>())?.signups_open ?? true

export const setSignupsOpen = async (open: boolean) => {
  must(await supabase.from('settings').update({ signups_open: open }).eq('id', true).select('id'))
}
