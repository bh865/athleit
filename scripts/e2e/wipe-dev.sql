-- Clean-slate wipe for the Athleit DEV project ONLY. Run via scripts/e2e/wipe-dev.sh, never directly.
-- One transaction. Any failed verification RAISES, which rolls everything back.
-- Kept (config): sport_configs, fee_config, platform_settings, platform_setting_definitions.
-- Everything else in public is user/test data (billing_price_versions is cleared on purpose: its Stripe price is gone).
begin;

create temp table _keep(t text primary key) on commit drop;
insert into _keep values ('sport_configs'),('fee_config'),('platform_settings'),('platform_setting_definitions');

-- BEFORE snapshot of kept tables. created_by / updated_by are excluded: they are ON DELETE SET NULL links to profiles and
-- become null when the users go (that is the only expected change to kept rows).
create temp table _before on commit drop as
select k.t,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', k.t), false, true, '')))[1]::text::bigint as n,
  (xpath('/row/h/text()', query_to_xml(format(
     'select coalesce(md5(string_agg(to_jsonb(x)::text, '','' order by to_jsonb(x)::text)), ''empty'') h from (select to_jsonb(t) - ''created_by'' - ''updated_by'' as x from public.%I t) s', k.t), false, true, '')))[1]::text as h
from _keep k;
create temp table _before_misc on commit drop as
select (select count(*) from supabase_migrations.schema_migrations) migs,
       (select count(*) from cron.job) crons,
       (select count(*) from storage.buckets) buckets;

-- Sanity: the only kept->wiped foreign key we expect is to profiles (SET NULL, handled below) or between kept tables.
do $$
declare v_bad text;
begin
  select string_agg(conrelid::regclass::text || '->' || confrelid::regclass::text, ', ') into v_bad
  from pg_constraint c
  where c.contype = 'f' and c.conrelid::regclass::text in (select 'public.' || t from _keep)
    and c.confrelid::regclass::text not in (select 'public.' || t from _keep)
    and c.confrelid::regclass::text not in ('public.profiles', 'auth.users');
  if v_bad is not null then raise exception 'unexpected FK from kept table: %', v_bad; end if;
end $$;

-- Replica mode skips user triggers (append-only guards, no_truncate) for THIS transaction only.
set local session_replication_role = replica;

-- Detach kept rows from profiles (otherwise profiles can't be emptied: FK from kept tables).
update public.fee_config set created_by = null where created_by is not null;
update public.platform_settings set updated_by = null where updated_by is not null;

do $$
declare v_list text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by c.relname) into v_list
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
    and c.relname not in (select t from _keep) and c.relname <> 'profiles';
  execute 'truncate ' || v_list || ' restart identity';  -- deliberately NO cascade
end $$;
delete from public.profiles;  -- not truncatable: kept tables hold FKs to it

-- Normal triggers/FK actions back on before touching auth (cascades identities, sessions, refresh tokens, MFA factors).
set local session_replication_role = origin;
delete from auth.users;

-- VERIFY
do $$
declare r record; v_n bigint; v_h text; v_msg text := '';
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','p') and c.relname not in (select t from _keep) loop
    execute format('select count(*) from public.%I', r.relname) into v_n;
    if v_n <> 0 then v_msg := v_msg || r.relname || '=' || v_n || ' '; end if;
  end loop;
  if v_msg <> '' then raise exception 'wiped tables not empty: %', v_msg; end if;
  if (select count(*) from auth.users) <> 0 or (select count(*) from auth.identities) <> 0 then raise exception 'auth not empty'; end if;
  for r in select * from _before loop
    execute format('select count(*) from public.%I', r.t) into v_n;
    execute format('select coalesce(md5(string_agg(to_jsonb(x)::text, '','' order by to_jsonb(x)::text)), ''empty'') from (select to_jsonb(t) - ''created_by'' - ''updated_by'' as x from public.%I t) s', r.t) into v_h;
    if v_n <> r.n or v_h <> r.h then raise exception 'kept table % changed (n % -> %)', r.t, r.n, v_n; end if;
  end loop;
  if (select migs from _before_misc) <> (select count(*) from supabase_migrations.schema_migrations)
     or (select crons from _before_misc) <> (select count(*) from cron.job)
     or (select buckets from _before_misc) <> (select count(*) from storage.buckets) then
    raise exception 'migrations, cron jobs or buckets changed';
  end if;
  if current_setting('session_replication_role') <> 'origin' then raise exception 'replication role not restored'; end if;
end $$;

-- @END@
