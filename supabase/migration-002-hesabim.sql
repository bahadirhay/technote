-- Zaten schema.sql'i çalıştırdıysan SADECE bunu çalıştır (Hesabım / ad özelliği için).

alter table public.profiles add column if not exists display_name text not null default '';

create or replace function public.handle_new_user() returns trigger
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
  insert into public.profiles (id, email, display_name, status)
  values (new.id, v_email, left(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), 60), v_status);
  return new;
end $$;

create or replace function public.set_display_name(n text) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set display_name = left(trim(n), 60) where id = auth.uid()
$$;
grant execute on function public.set_display_name(text) to authenticated;
