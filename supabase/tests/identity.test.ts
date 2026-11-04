import { describe, expect, it } from 'vitest';
import {
  actAs,
  actAsAnon,
  actAsService,
  actAsSuperuser,
  createUser,
  expectSqlError,
  grantRole,
  publishConsentDocument,
  useDb,
} from './helpers';

const { db } = useDb();

async function setClaims(claims: Record<string, unknown>) {
  await db().query('reset role');
  await db().query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  await db().query('set local role authenticated');
}

async function hasRole(role: string): Promise<boolean> {
  const { rows } = await db().query<{ ok: boolean }>('select private.has_role($1) as ok', [role]);
  return rows[0]!.ok;
}

describe('new-user provisioning', () => {
  it('creates profile, student role and notification preferences, ignoring metadata', async () => {
    await actAsSuperuser(db());
    const { rows } = await db().query<{ id: string }>(
      `insert into auth.users (id, email, raw_user_meta_data)
       values (gen_random_uuid(), 'meta@example.test', '{"role":"admin"}') returning id`,
    );
    const id = rows[0]!.id;
    const roles = await db().query('select role from public.user_roles where user_id = $1', [id]);
    expect(roles.rows).toEqual([{ role: 'student' }]);
    expect((await db().query('select 1 from public.profiles where id = $1', [id])).rowCount).toBe(
      1,
    );
    expect(
      (await db().query('select 1 from public.notification_preferences where user_id = $1', [id]))
        .rowCount,
    ).toBe(1);
  });
});

describe('profiles', () => {
  it('a student sees only their own profile', async () => {
    const a = await createUser(db());
    await createUser(db());
    await actAs(db(), a);
    const { rows } = await db().query<{ id: string }>('select id from public.profiles');
    expect(rows).toEqual([{ id: a }]);
  });

  it("a student cannot update another student's profile", async () => {
    const a = await createUser(db());
    const b = await createUser(db());
    await actAs(db(), a);
    const res = await db().query("update public.profiles set display_name = 'x' where id = $1", [
      b,
    ]);
    expect(res.rowCount).toBe(0);
  });

  it('a student can edit allowed columns of their own profile', async () => {
    const a = await createUser(db());
    await actAs(db(), a);
    const res = await db().query(
      "update public.profiles set display_name = 'Priya', preferred_language = 'mr' where id = $1",
      [a],
    );
    expect(res.rowCount).toBe(1);
  });

  it('a student cannot change protected columns (deleted_at, id)', async () => {
    const a = await createUser(db());
    await actAs(db(), a);
    await expectSqlError(db(), 'update public.profiles set deleted_at = null where id = $1', [a]);
    await expectSqlError(db(), 'update public.profiles set id = gen_random_uuid() where id = $1', [
      a,
    ]);
  });

  it('a student cannot insert or delete profiles', async () => {
    const a = await createUser(db());
    await actAs(db(), a);
    await expectSqlError(db(), 'insert into public.profiles (id) values (gen_random_uuid())');
    await expectSqlError(db(), 'delete from public.profiles where id = $1', [a]);
  });

  it('rejects invalid language, timezone and display names', async () => {
    const a = await createUser(db());
    await actAs(db(), a);
    const update = (col: string) => `update public.profiles set ${col} = $2 where id = $1`;
    await expectSqlError(db(), update('preferred_language'), [a, 'xx'], '23514');
    await expectSqlError(db(), update('timezone'), [a, 'Not/AZone'], '22023');
    for (const bad of ['   ', 'a‮b', 'tab\there', 'x'.repeat(61)]) {
      await expectSqlError(db(), update('display_name'), [a, bad], '23514');
    }
    const ok = await db().query(
      "update public.profiles set timezone = 'Asia/Kolkata', display_name = 'प्रिया' where id = $1",
      [a],
    );
    expect(ok.rowCount).toBe(1);
  });

  it('anon cannot read profiles', async () => {
    await createUser(db());
    await actAsAnon(db());
    await expectSqlError(db(), 'select * from public.profiles');
  });
});

describe('roles and has_role', () => {
  it('a student cannot grant themselves a role', async () => {
    const a = await createUser(db());
    await actAs(db(), a);
    await expectSqlError(
      db(),
      "insert into public.user_roles (user_id, role) values ($1, 'admin')",
      [a],
    );
    await expectSqlError(db(), "update public.user_roles set role = 'admin' where user_id = $1", [
      a,
    ]);
  });

  it('a student sees exactly their own roles', async () => {
    const a = await createUser(db());
    await createUser(db());
    await actAs(db(), a);
    const { rows } = await db().query('select user_id, role from public.user_roles');
    expect(rows).toEqual([{ user_id: a, role: 'student' }]);
  });

  it('an MFA admin can list all roles; without MFA only their own', async () => {
    const admin = await createUser(db());
    const b = await createUser(db());
    await grantRole(db(), admin, 'admin');
    await actAs(db(), admin, 'aal1');
    const own = await db().query('select distinct user_id from public.user_roles');
    expect(own.rows).toEqual([{ user_id: admin }]);
    await actAs(db(), admin, 'aal2');
    const all = await db().query(
      'select distinct user_id from public.user_roles where user_id = any($1)',
      [[admin, b]],
    );
    expect(all.rowCount).toBe(2);
  });

  it('student role works without MFA', async () => {
    const a = await createUser(db());
    await actAs(db(), a, 'aal1');
    expect(await hasRole('student')).toBe(true);
  });

  it('admin role is denied without MFA (aal1) and granted with aal2', async () => {
    const admin = await createUser(db());
    await grantRole(db(), admin, 'admin');
    await actAs(db(), admin, 'aal1');
    expect(await hasRole('admin')).toBe(false);
    await actAs(db(), admin, 'aal2');
    expect(await hasRole('admin')).toBe(true);
  });

  it('content_reviewer also requires aal2', async () => {
    const r = await createUser(db());
    await grantRole(db(), r, 'content_reviewer');
    await actAs(db(), r, 'aal1');
    expect(await hasRole('content_reviewer')).toBe(false);
  });

  it('a student with aal2 still is not an admin', async () => {
    const a = await createUser(db());
    await actAs(db(), a, 'aal2');
    expect(await hasRole('admin')).toBe(false);
  });

  it('has_role fails closed when the JWT has no aal or no sub claim', async () => {
    const admin = await createUser(db());
    await grantRole(db(), admin, 'admin');
    await setClaims({ sub: admin, role: 'authenticated' });
    expect(await hasRole('admin')).toBe(false);
    await setClaims({ role: 'authenticated', aal: 'aal2' });
    expect(await hasRole('admin')).toBe(false);
  });

  it('a forged role claim in the JWT does not grant admin', async () => {
    const a = await createUser(db());
    await setClaims({
      sub: a,
      role: 'authenticated',
      aal: 'aal2',
      app_role: 'admin',
      user_role: 'admin',
    });
    expect(await hasRole('admin')).toBe(false);
  });

  it('a soft-deleted admin loses staff access', async () => {
    const admin = await createUser(db());
    await grantRole(db(), admin, 'admin');
    await actAsSuperuser(db());
    await db().query('update public.profiles set deleted_at = now() where id = $1', [admin]);
    await actAs(db(), admin, 'aal2');
    expect(await hasRole('admin')).toBe(false);
  });

  it('every staff role grant and revoke is audited, even via the service role', async () => {
    const u = await createUser(db());
    await actAsService(db());
    await db().query(
      "insert into public.user_roles (user_id, role) values ($1, 'content_reviewer')",
      [u],
    );
    await db().query(
      "delete from public.user_roles where user_id = $1 and role = 'content_reviewer'",
      [u],
    );
    await actAsSuperuser(db());
    const { rows } = await db().query(
      "select action, meta->>'role' as role from public.audit_log where entity_id = $1 order by id",
      [u],
    );
    expect(rows).toEqual([
      { action: 'role.grant', role: 'content_reviewer' },
      { action: 'role.revoke', role: 'content_reviewer' },
    ]);
  });
});

describe('consents', () => {
  it('a student cannot insert consent rows directly', async () => {
    const a = await createUser(db());
    await publishConsentDocument(db(), 'terms', 'v1');
    await actAs(db(), a);
    await expectSqlError(
      db(),
      "insert into public.consents (user_id, kind, version, granted) values ($1, 'terms', 'v1', true)",
      [a],
    );
  });

  it('api_record_consent records consent for the caller only', async () => {
    const a = await createUser(db());
    const b = await createUser(db());
    await publishConsentDocument(db(), 'terms', '2026-11-01');
    await actAs(db(), a);
    await db().query("select public.api_record_consent('terms', '2026-11-01', true)");
    const mine = await db().query('select user_id, kind, version, granted from public.consents');
    expect(mine.rows).toEqual([
      { user_id: a, kind: 'terms', version: '2026-11-01', granted: true },
    ]);
    await actAs(db(), b);
    expect((await db().query('select * from public.consents')).rowCount).toBe(0);
  });

  it('withdrawal is a new row; nobody can edit, delete or truncate consents', async () => {
    const a = await createUser(db());
    await publishConsentDocument(db(), 'email_reminders', 'v1');
    await actAs(db(), a);
    await db().query("select public.api_record_consent('email_reminders', 'v1', true)");
    await db().query("select public.api_record_consent('email_reminders', 'v1', false)");
    expect((await db().query('select * from public.consents')).rowCount).toBe(2);
    await expectSqlError(db(), 'update public.consents set granted = true');
    await expectSqlError(db(), 'delete from public.consents');
    for (const actor of [actAsService, actAsSuperuser]) {
      await actor(db());
      await expectSqlError(db(), 'update public.consents set granted = true');
      await expectSqlError(db(), 'delete from public.consents');
      await expectSqlError(db(), 'truncate public.consents');
    }
  });

  it('rejects unpublished versions and unauthenticated callers', async () => {
    const a = await createUser(db());
    await publishConsentDocument(db(), 'terms', 'v1');
    await actAs(db(), a);
    const call = 'select public.api_record_consent($1, $2, true)';
    await expectSqlError(db(), call, ['terms', 'v999'], '22023');
    await expectSqlError(db(), call, ['privacy_notice', 'v1'], '22023');
    await expectSqlError(db(), call, ['terms', 'bad version!'], '22023');
    await actAsAnon(db());
    await expectSqlError(db(), call, ['terms', 'v1']);
    // authenticated role but no user id in the token: the function's own check
    await setClaims({ role: 'authenticated' });
    await expectSqlError(db(), call, ['terms', 'v1']);
  });

  it('students can read published consent documents but not change them', async () => {
    const a = await createUser(db());
    await publishConsentDocument(db(), 'terms', 'v1');
    await actAs(db(), a);
    const docs = await db().query(
      "select version from public.consent_documents where kind = 'terms'",
    );
    expect(docs.rows).toEqual([{ version: 'v1' }]);
    await expectSqlError(
      db(),
      "insert into public.consent_documents (kind, version) values ('terms', 'v2')",
    );
  });
});

describe('notification_preferences', () => {
  it("a student can update their own preferences but not another student's", async () => {
    const a = await createUser(db());
    const b = await createUser(db());
    await actAs(db(), a);
    const set = 'update public.notification_preferences set email = true where user_id = $1';
    expect((await db().query(set, [a])).rowCount).toBe(1);
    expect((await db().query(set, [b])).rowCount).toBe(0);
    const { rows } = await db().query('select user_id from public.notification_preferences');
    expect(rows).toEqual([{ user_id: a }]);
  });

  it('enforces bounds and blocks changing the owner', async () => {
    const a = await createUser(db());
    await actAs(db(), a);
    await expectSqlError(
      db(),
      'update public.notification_preferences set max_per_day = 50',
      [],
      '23514',
    );
    await expectSqlError(
      db(),
      'update public.notification_preferences set user_id = gen_random_uuid()',
    );
  });
});

describe('audit_log', () => {
  it('students cannot read, write or tamper with the audit log', async () => {
    const a = await createUser(db());
    await actAsSuperuser(db());
    await db().query("select private.write_audit('test', 'thing', '1', '{}'::jsonb, $1)", [a]);
    await actAs(db(), a);
    expect((await db().query('select * from public.audit_log')).rowCount).toBe(0);
    await expectSqlError(
      db(),
      "insert into public.audit_log (action, entity_type) values ('x', 'y')",
    );
    await expectSqlError(db(), "select private.write_audit('x', 'y', null)");
  });

  it('only an MFA admin can read it, and nobody can modify it', async () => {
    const admin = await createUser(db());
    await grantRole(db(), admin, 'admin');
    await actAsSuperuser(db());
    await db().query("select private.write_audit('test', 'thing', '1')");
    await actAs(db(), admin, 'aal1');
    expect((await db().query('select * from public.audit_log')).rowCount).toBe(0);
    await actAs(db(), admin, 'aal2');
    expect(
      (await db().query("select 1 from public.audit_log where action = 'test'")).rowCount,
    ).toBe(1);
    await expectSqlError(db(), "update public.audit_log set action = 'x'");
    for (const actor of [actAsService, actAsSuperuser]) {
      await actor(db());
      await expectSqlError(db(), "update public.audit_log set action = 'x'");
      await expectSqlError(db(), 'delete from public.audit_log');
      await expectSqlError(db(), 'truncate public.audit_log');
    }
  });

  it('nobody but the owner can reset the audit sequence', async () => {
    const a = await createUser(db());
    await actAs(db(), a);
    await expectSqlError(db(), "select setval('public.audit_log_id_seq', 1)");
    await actAsAnon(db());
    await expectSqlError(db(), "select setval('public.audit_log_id_seq', 1)");
  });
});
