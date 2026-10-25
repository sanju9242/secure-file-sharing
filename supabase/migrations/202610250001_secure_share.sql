create extension if not exists pgcrypto;

drop view if exists public.user_file_summary;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'User',
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'User'),
    lower(new.email)
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, full_name, email)
select u.id,
       coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), 'User'),
       lower(u.email)
from auth.users u
where u.email is not null
on conflict (id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      updated_at = now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  original_name text not null constraint files_original_name_length check (length(original_name) between 1 and 180),
  storage_bucket text not null default 'encrypted-files'
    constraint files_storage_bucket_allowed check (storage_bucket in ('encrypted-files', 'secure_files')),
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null constraint files_size_nonnegative check (file_size >= 0),
  encryption_algorithm text not null default 'AES-256-GCM'
    constraint files_encryption_algorithm_aes_gcm check (encryption_algorithm = 'AES-256-GCM'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint files_id_owner_unique unique (id, owner_id)
);

alter table public.files add column if not exists original_name text;
alter table public.files add column if not exists encryption_algorithm text not null default 'AES-256-GCM';
alter table public.files add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'files' and column_name = 'storage_bucket'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'files' and column_name = 'file_name'
    ) then
      alter table public.files add column storage_bucket text not null default 'secure_files';
    else
      alter table public.files add column storage_bucket text not null default 'encrypted-files';
    end if;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.files'::regclass and conname = 'files_storage_bucket_allowed'
  ) then
    alter table public.files add constraint files_storage_bucket_allowed
      check (storage_bucket in ('encrypted-files', 'secure_files'));
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'files' and column_name = 'file_name'
  ) then
    execute 'update public.files set original_name = file_name where original_name is null';
    execute 'alter table public.files drop column file_name';
  end if;
end;
$$;

update public.files set original_name = 'file' where original_name is null or original_name = '';
alter table public.files alter column original_name set not null;
alter table public.files alter column file_size set default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.files'::regclass and conname = 'files_original_name_length'
  ) then
    alter table public.files add constraint files_original_name_length
      check (length(original_name) between 1 and 180);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.files'::regclass and conname = 'files_size_nonnegative'
  ) then
    alter table public.files add constraint files_size_nonnegative check (file_size >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.files'::regclass and conname = 'files_encryption_algorithm_aes_gcm'
  ) then
    alter table public.files add constraint files_encryption_algorithm_aes_gcm
      check (encryption_algorithm = 'AES-256-GCM');
  end if;
end;
$$;

create index if not exists files_owner_created_idx on public.files (owner_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.files'::regclass and conname = 'files_id_owner_unique'
  ) then
    alter table public.files add constraint files_id_owner_unique unique (id, owner_id);
  end if;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists files_updated_at on public.files;
drop trigger if exists files_set_updated_at on public.files;
create trigger files_set_updated_at
before update on public.files
for each row execute function public.set_updated_at();

create table if not exists public.file_shares (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null,
  owner_id uuid not null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  permission text not null default 'read' constraint file_shares_permission_read check (permission = 'read'),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint file_shares_file_owner_fk foreign key (file_id, owner_id)
    references public.files(id, owner_id) on delete cascade,
  constraint file_shares_not_self check (owner_id <> recipient_id)
);

alter table public.file_shares add column if not exists permission text not null default 'read';
alter table public.file_shares add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.file_shares'::regclass and conname = 'file_shares_permission_read'
  ) then
    alter table public.file_shares add constraint file_shares_permission_read check (permission = 'read');
  end if;
end;
$$;

create index if not exists file_shares_owner_created_idx on public.file_shares (owner_id, created_at desc);
create index if not exists file_shares_recipient_active_idx on public.file_shares (recipient_id, file_id)
  where revoked_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.file_shares'::regclass and conname = 'file_shares_file_owner_fk'
  ) then
    alter table public.file_shares add constraint file_shares_file_owner_fk
      foreign key (file_id, owner_id) references public.files(id, owner_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.file_shares'::regclass and conname = 'file_shares_not_self'
  ) then
    alter table public.file_shares add constraint file_shares_not_self check (owner_id <> recipient_id);
  end if;
end;
$$;

drop trigger if exists file_shares_updated_at on public.file_shares;
drop trigger if exists file_shares_set_updated_at on public.file_shares;
create trigger file_shares_set_updated_at
before update on public.file_shares
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.files enable row level security;
alter table public.file_shares enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select to authenticated
using (id = (select auth.uid()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Users can view their own files" on public.files;
drop policy if exists files_select_owner_or_active_recipient on public.files;
create policy files_select_owner_or_active_recipient on public.files
for select to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.file_shares s
    where s.file_id = files.id
      and s.recipient_id = (select auth.uid())
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now())
  )
);

drop policy if exists "Users can insert their own files" on public.files;
drop policy if exists files_insert_owner on public.files;
create policy files_insert_owner on public.files
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and storage_path like (select auth.uid())::text || '/%'
  and encryption_algorithm = 'AES-256-GCM'
);

drop policy if exists "Users can update their own files" on public.files;
drop policy if exists files_update_owner on public.files;
create policy files_update_owner on public.files
for update to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and storage_path like (select auth.uid())::text || '/%'
  and encryption_algorithm = 'AES-256-GCM'
);

drop policy if exists "Users can delete their own files" on public.files;
drop policy if exists files_delete_owner on public.files;
create policy files_delete_owner on public.files
for delete to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "Users can view their own shares" on public.file_shares;
drop policy if exists file_shares_select_participant on public.file_shares;
create policy file_shares_select_participant on public.file_shares
for select to authenticated
using (
  owner_id = (select auth.uid())
  or (
    recipient_id = (select auth.uid())
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  )
);

drop policy if exists "Users can create shares for their own files" on public.file_shares;
drop policy if exists file_shares_insert_owner on public.file_shares;
create policy file_shares_insert_owner on public.file_shares
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and recipient_id <> (select auth.uid())
);

drop policy if exists "Users can update their own shares" on public.file_shares;
drop policy if exists file_shares_update_owner on public.file_shares;
create policy file_shares_update_owner on public.file_shares
for update to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
);

drop policy if exists "Users can delete shares for their own files" on public.file_shares;
drop policy if exists file_shares_delete_owner on public.file_shares;
create policy file_shares_delete_owner on public.file_shares
for delete to authenticated
using (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('encrypted-files', 'encrypted-files', false, 26214432)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "Authenticated users can upload to secure_files" on storage.objects;
drop policy if exists "Authenticated users can view their own secure_files" on storage.objects;
drop policy if exists "Authenticated users can update their own secure_files" on storage.objects;
drop policy if exists "Authenticated users can delete their own secure_files" on storage.objects;
drop policy if exists encrypted_files_insert_owner_path on storage.objects;
create policy encrypted_files_insert_owner_path on storage.objects
for insert to authenticated
with check (
  bucket_id = 'encrypted-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists encrypted_files_select_owner_or_recipient on storage.objects;
create policy encrypted_files_select_owner_or_recipient on storage.objects
for select to authenticated
using (
  bucket_id = 'encrypted-files'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.files f
      join public.file_shares s on s.file_id = f.id
      where f.storage_bucket = 'encrypted-files'
        and f.storage_path = name
        and s.recipient_id = (select auth.uid())
        and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())
    )
  )
);

drop policy if exists encrypted_files_update_owner_path on storage.objects;
create policy encrypted_files_update_owner_path on storage.objects
for update to authenticated
using (
  bucket_id = 'encrypted-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'encrypted-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists encrypted_files_delete_owner_path on storage.objects;
create policy encrypted_files_delete_owner_path on storage.objects
for delete to authenticated
using (
  bucket_id = 'encrypted-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create view public.user_file_summary
with (security_invoker = true)
as
select f.id, f.owner_id, p.full_name as owner_name, f.original_name,
       f.storage_bucket, f.storage_path, f.mime_type, f.file_size,
       f.encryption_algorithm, f.created_at
from public.files f
join public.profiles p on p.id = f.owner_id;
