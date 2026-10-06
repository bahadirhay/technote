-- TechNote: Supabase şeması. SQL Editor'a yapıştırıp bir kez çalıştır.

create table public.settings (
  id boolean primary key default true check (id),
  signups_open boolean not null default true
);
insert into public.settings values (true, true);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.invites (
  email text primary key,
  created_at timestamptz not null default now()
);

create table public.notebooks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  color text not null,
  created_at bigint not null,
  pages jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Yardımcı fonksiyonlar (RLS içinde profiles tablosuna güvenle bakmak için)
create function public.is_approved() returns boolean
language sql security definer stable set search_path = '' as $$
  select coalesce((select status = 'approved' from public.profiles where id = auth.uid()), false)
$$;

create function public.is_admin() returns boolean
language sql security definer stable set search_path = '' as $$
  select coalesce((select is_admin and status = 'approved' from public.profiles where id = auth.uid()), false)
$$;

-- Yeni kayıt: davetliyse onaylı, kayıtlar açıksa onay bekliyor, kapalıysa reddedildi
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(new.email);
  v_status text;
begin
  if exists (select 1 from public.invites where email = v_email) then
    v_status := 'approved';
    delete from public.invites where email = v_email;
  elsif (select signups_open from public.settings) then
    v_status := 'pending';
  else
    v_status := 'rejected';
  end if;
  insert into public.profiles (id, email, status) values (new.id, v_email, v_status);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Satır düzeyi güvenlik
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.notebooks enable row level security;

create policy "profil: kendi veya admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profil: sadece admin günceller" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "davet: sadece admin" on public.invites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "ayar: sadece admin" on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "defter: sadece sahibi ve onaylıysa" on public.notebooks
  for all to authenticated
  using (user_id = auth.uid() and public.is_approved())
  with check (user_id = auth.uid() and public.is_approved());

-- PDF depolama: her kullanıcı sadece kendi klasörü
insert into storage.buckets (id, name, public) values ('pdfs', 'pdfs', false)
  on conflict (id) do nothing;

create policy "pdf: sadece sahibi ve onaylıysa" on storage.objects
  for all to authenticated
  using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved())
  with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());

-- ADIM 2: Uygulamada kendi hesabınla kayıt olduktan SONRA, bunu çalıştırıp kendini admin yap:
-- update public.profiles set is_admin = true, status = 'approved' where email = 'SENIN_EPOSTAN';
