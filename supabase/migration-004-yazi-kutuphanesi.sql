-- Anonim el yazısı kütüphanesi (kullanıcı "Veri bağışla"yı açarsa dolar). SQL Editor'da bir kez çalıştır.
-- Kayıtta kullanıcı kimliği, defter veya sayfa bilgisi YOKTUR.

create table if not exists public.ink_samples (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  strokes jsonb not null,
  ocr_text text not null,
  corrected_text text,
  lang text not null default 'tr'
);
alter table public.ink_samples enable row level security;
drop policy if exists "ink_admin_read" on public.ink_samples;
create policy "ink_admin_read" on public.ink_samples for select to authenticated using (public.is_admin());
drop policy if exists "ink_admin_delete" on public.ink_samples;
create policy "ink_admin_delete" on public.ink_samples for delete to authenticated using (public.is_admin());

-- Onaylı kullanıcı örnek ekler; geri dönen id sadece düzeltme için cihazda tutulur
create or replace function public.ink_donate(p_strokes jsonb, p_text text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if auth.uid() is null or not public.is_approved() then return null; end if;
  if length(p_text) > 2000 or length(p_strokes::text) > 400000 then return null; end if;
  insert into public.ink_samples (strokes, ocr_text) values (p_strokes, p_text) returning id into v;
  return v;
end $$;
grant execute on function public.ink_donate(jsonb, text) to authenticated;

create or replace function public.ink_correct(p_id uuid, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_approved() or length(p_text) > 2000 then return; end if;
  update public.ink_samples set corrected_text = p_text where id = p_id;
end $$;
grant execute on function public.ink_correct(uuid, text) to authenticated;
