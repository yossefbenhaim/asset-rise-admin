-- 001 — Admin role + sc_admin_profiles + sc_can() update.
-- Adds a third top-level role ('admin') to the shared Supabase, with three
-- additive sub-levels (is_admin / is_admin_support / is_admin_sales).
-- Idempotent: skips work if the constraint already permits 'admin'.

-- 1. Replace the role CHECK so it allows 'admin'.
--    Drop ANY existing CHECK constraint on sc_profiles whose definition
--    mentions 'role' (regardless of whether it uses IN or ANY syntax), then
--    re-add the explicit one. Only the first run does work; subsequent
--    runs see the new constraint already in place and exit early.
do $$
declare
  c text;
  needs_replace boolean := true;
begin
  -- If a constraint already lists 'admin', we're done.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'sc_profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%admin%'
      and pg_get_constraintdef(oid) like '%role%'
  ) then
    needs_replace := false;
  end if;

  if needs_replace then
    for c in
      select conname from pg_constraint
      where conrelid = 'sc_profiles'::regclass
        and contype = 'c'
        and (
          pg_get_constraintdef(oid) ilike '%role%' and
          pg_get_constraintdef(oid) like '%tenant%' and
          pg_get_constraintdef(oid) like '%provider%'
        )
    loop
      execute format('alter table sc_profiles drop constraint %I', c);
    end loop;

    alter table sc_profiles
      add constraint sc_profiles_role_check
      check (role in ('tenant','provider','admin'));
  end if;
end $$;

-- 2. sc_admin_profiles
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
