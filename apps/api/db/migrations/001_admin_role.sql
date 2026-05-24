-- 001 — Admin role + sc_admin_profiles + sc_can() update.
-- Adds a third top-level role ('admin') to the shared Supabase, with three
-- additive sub-levels (is_admin / is_admin_support / is_admin_sales). The
-- Silver Castle app is unaware of admins — its route guards reject anyone
-- whose role isn't 'tenant' or 'provider', so admins simply can't enter SC.
-- Idempotent.

-- 1. Allow role='admin' on sc_profiles
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'sc_profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%in%(%tenant%provider%)%'
  loop
    execute format('alter table sc_profiles drop constraint %I', c);
  end loop;
end $$;

alter table sc_profiles
  add constraint sc_profiles_role_check
  check (role in ('tenant','provider','admin'));

-- 2. sc_admin_profiles — parallel arm to sc_tenant_profiles / sc_provider_profiles
create table if not exists sc_admin_profiles (
  id                uuid primary key references sc_profiles(id) on delete cascade,
  is_admin          boolean not null default true,
  is_admin_support  boolean not null default false,
  is_admin_sales    boolean not null default false,
  created_at        timestamptz not null default now(),
  created_by        uuid references sc_profiles(id) on delete set null
);

create index if not exists sc_admin_profiles_level_idx
  on sc_admin_profiles (is_admin, is_admin_support, is_admin_sales);

-- RLS: service-role only. Reads happen exclusively via the API context
-- (adminClient), never directly from the browser.
alter table sc_admin_profiles enable row level security;

-- 3. sc_can() — recognise admin role-keys
create or replace function sc_can(p_user uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from sc_profiles p
    left join sc_tenant_profiles tp on tp.id = p.id
    left join sc_admin_profiles  ap on ap.id = p.id
    join sc_permissions perm on perm.action = p_action
    where p.id = p_user
      and perm.role_key = any(array_remove(array[
        case when p.role = 'tenant' then 'tenant' end,
        case when tp.is_organizer then 'tenant.organizer' end,
        case when tp.is_committee_member or tp.is_committee_chair then 'tenant.committee' end,
        case when tp.is_committee_chair then 'tenant.chair' end,
        case when p.role = 'provider' then 'provider.' || coalesce(p.provider_type,'generic') end,
        case when p.role = 'admin' then 'admin' end,
        case when ap.is_admin_support then 'admin.support' end,
        case when ap.is_admin_sales   then 'admin.sales' end
      ], null))
  );
$$;
