-- El yazısı çevirme için kullanıcı başı günlük sınır. SQL Editor'da bir kez çalıştır.

create table if not exists public.ocr_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ocr_usage enable row level security;
-- Politika yok: tabloya sadece aşağıdaki fonksiyon dokunabilir.

create or replace function public.ocr_take(max_per_day int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  c int;
begin
  if auth.uid() is null or not public.is_approved() then
    return false;
  end if;
  insert into public.ocr_usage (user_id, day, count) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = public.ocr_usage.count + 1
  returning count into c;
  return c <= max_per_day;
end $$;

grant execute on function public.ocr_take(int) to authenticated;
