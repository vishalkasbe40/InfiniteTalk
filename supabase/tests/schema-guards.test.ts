import { describe, expect, it } from 'vitest';
import { useDb } from './helpers';

// Generic guards that apply to every current AND future migration (ADR 0003).
// If a new table or function legitimately needs an exception, add it to an explicit
// allow-list here with a comment, so the exception is reviewed.
const { db } = useDb();

describe('schema guards', () => {
  it('has RLS enabled on every table in public', async () => {
    const { rows } = await db().query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('grants anon nothing on public tables', async () => {
    const { rows } = await db().query<{ relname: string; priv: string }>(`
      select c.relname, p.priv
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as p(priv)
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        and has_table_privilege('anon', c.oid, p.priv)`);
    expect(rows).toEqual([]);
  });

  it('grants authenticated no table-level write privileges (column grants only)', async () => {
    const { rows } = await db().query<{ relname: string; priv: string }>(`
      select c.relname, p.priv
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as p(priv)
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and has_table_privilege('authenticated', c.oid, p.priv)`);
    expect(rows).toEqual([]);
  });

  it('exposes only api_* functions in public to authenticated, and none to anon', async () => {
    const { rows } = await db().query<{ proname: string; anon: boolean; authed: boolean }>(`
      select p.proname,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'`);
    expect(rows.filter((r) => r.anon).map((r) => r.proname)).toEqual([]);
    expect(
      rows.filter((r) => r.authed && !r.proname.startsWith('api_')).map((r) => r.proname),
    ).toEqual([]);
  });

  it('lets authenticated execute only allow-listed private functions', async () => {
    const allowed = ['has_role']; // read-only helper used inside RLS policies
    const { rows } = await db().query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'EXECUTE')`);
    expect(rows.map((r) => r.proname).filter((n) => !allowed.includes(n))).toEqual([]);
  });

  it('grants anon and authenticated nothing on public sequences', async () => {
    const { rows } = await db().query(`
      select c.relname, r.rolname, p.priv
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) as r(rolname)
      cross join unnest(array['USAGE','SELECT','UPDATE']) as p(priv)
      where n.nspname = 'public' and c.relkind = 'S'
        and has_sequence_privilege(r.rolname, c.oid, p.priv)`);
    expect(rows).toEqual([]);
  });

  it('keeps evidence tables append-only even for service_role', async () => {
    const { rows } = await db().query(`
      select t.tbl, p.priv
      from unnest(array['public.consents','public.audit_log']) as t(tbl)
      cross join unnest(array['UPDATE','DELETE','TRUNCATE']) as p(priv)
      where has_table_privilege('service_role', t.tbl, p.priv)`);
    expect(rows).toEqual([]);
  });

  it('requires security_invoker on every public view', async () => {
    const { rows } = await db().query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and not coalesce('security_invoker=true' = any(c.reloptions), false)`);
    expect(rows).toEqual([]);
  });

  it('has no functions executable by authenticated outside public/private/auth', async () => {
    const { rows } = await db().query(`
      select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('public', 'private', 'auth', 'pg_catalog', 'information_schema')
        and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')`);
    expect(rows).toEqual([]);
  });

  it('pins search_path on every SECURITY DEFINER function', async () => {
    const { rows } = await db().query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(rows).toEqual([]);
  });
});
