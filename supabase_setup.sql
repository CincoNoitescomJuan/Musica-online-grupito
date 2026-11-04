-- ROLEPLAY MUSIC — esquema inicial para Supabase
-- Ejecuta TODO este archivo en Supabase > SQL Editor > New query.
-- Crea perfiles, canciones, roles y buckets privados para audio y portadas.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'Aventurero',
  role text not null default 'member' check (role in ('member','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 90),
  artist text,
  campaign text,
  description text,
  lyrics text,
  audio_path text not null,
  cover_path text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists songs_created_at_idx on public.songs(created_at desc);
create index if not exists songs_created_by_idx on public.songs(created_by);

-- Comprueba el rol sin provocar recursión en las políticas RLS de profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Crea automáticamente el perfil de cada usuario nuevo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username',''), split_part(new.email,'@',1), 'Aventurero')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_roleplay on auth.users;
create trigger on_auth_user_created_roleplay
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.songs enable row level security;

-- Los usuarios autenticados pueden ver perfiles, pero nadie puede cambiar su propio rol.
drop policy if exists "Profiles readable by signed-in users" on public.profiles;
create policy "Profiles readable by signed-in users"
on public.profiles for select to authenticated
using (true);

-- Canciones: cualquier miembro autenticado puede leer y subir.
drop policy if exists "Songs readable by members" on public.songs;
create policy "Songs readable by members"
on public.songs for select to authenticated
using (true);

drop policy if exists "Members can upload songs" on public.songs;
create policy "Members can upload songs"
on public.songs for insert to authenticated
with check (created_by = (select auth.uid()));

-- Solo administradores pueden modificar metadatos o borrar canciones.
drop policy if exists "Admins can update songs" on public.songs;
create policy "Admins can update songs"
on public.songs for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete songs" on public.songs;
create policy "Admins can delete songs"
on public.songs for delete to authenticated
using (public.is_admin());

-- Buckets privados: los archivos se sirven mediante URL firmada al usuario conectado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('roleplay-audio','roleplay-audio',false,52428800,
   array['audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/mp4','audio/x-m4a']),
  ('roleplay-covers','roleplay-covers',false,5242880,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lectura de archivos solo para miembros autenticados.
drop policy if exists "Members can read roleplay audio" on storage.objects;
create policy "Members can read roleplay audio"
on storage.objects for select to authenticated
using (bucket_id in ('roleplay-audio','roleplay-covers'));

-- Cada miembro puede subir dentro de su propia carpeta (UID/archivo).
drop policy if exists "Members can upload own roleplay files" on storage.objects;
create policy "Members can upload own roleplay files"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('roleplay-audio','roleplay-covers')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Solo administradores pueden actualizar o eliminar archivos.
drop policy if exists "Admins can update roleplay files" on storage.objects;
create policy "Admins can update roleplay files"
on storage.objects for update to authenticated
using (bucket_id in ('roleplay-audio','roleplay-covers') and public.is_admin())
with check (bucket_id in ('roleplay-audio','roleplay-covers') and public.is_admin());

drop policy if exists "Admins can delete roleplay files" on storage.objects;
create policy "Admins can delete roleplay files"
on storage.objects for delete to authenticated
using (bucket_id in ('roleplay-audio','roleplay-covers') and public.is_admin());

-- IMPORTANTE: después de crear tu primera cuenta, conviértela en administradora:
-- sustituye el correo por el que uses para registrarte y ejecuta esta consulta aparte:
-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'TU_CORREO');


-- MIGRACIÓN PARA ACCESO SIN CORREO NI CONTRASEÑA
-- 1) En Supabase Dashboard > Authentication > Providers > Anonymous,
--    activa el proveedor Anonymous.
-- 2) Los usuarios anónimos reciben una identidad auth.uid() y sesión persistente
--    en el navegador. La aplicación recuerda además el nombre en localStorage.
-- 3) Los usuarios solo pueden cambiar su propio username; no pueden cambiar role.

grant update (username) on public.profiles to authenticated;

drop policy if exists "Users can update own username" on public.profiles;
create policy "Users can update own username"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- No se concede permiso de actualización sobre role. La promoción a admin
-- debe hacerse desde SQL Editor por el propietario del proyecto.
