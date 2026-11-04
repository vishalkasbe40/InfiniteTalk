import { describe, expect, it } from 'vitest';
import {
  actAs,
  actAsAnon,
  actAsSuperuser,
  createUser,
  expectSqlError,
  grantRole,
  useDb,
} from './helpers';

const { db } = useDb();

describe('new-user provisioning', () => {
  it('creates profile, student role and notification preferences, ignoring metadata', async () => {
    await actAsSuperuser(db());
    const { rows } = await db().query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('meta@example.test', '{"role":"admin"}') returning id`,
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

  it('rejects invalid values via constraints', async () => {
    const a = await createUser(db());
    await actAs(db(), a);
    await expectSqlError(
      db(),
      "update public.profiles set preferred_language = 'xx' where id = $1",
      [a],
      '23514',
    );
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

  it('a student sees only their own roles', async () => {
    const a = await createUser(db());
    await createUser(db());
    await actAs(db(), a);
    const { rows } = await db().query<{ user_id: string }>('select user_id from public.user_roles');
    expect(rows.every((r) => r.user_id === a)).toBe(true);
  });

  it('student role works without MFA', async () => {
    const a = await createUser(db());
    await actAs(db(), a, 'aal1');
    const { rows } = await db().query("select private.has_role('student') as ok");
    expect(rows[0].ok).toBe(true);
  });

  it('admin role is denied without MFA (aal1) and granted with aal2', async () => {
    const admin = await createUser(db());
    await grantRole(db(), admin, 'admin');
    await actAs(db(), admin, 'aal1');
    expect((await db().query("select private.has_role('admin') as ok")).rows[0].ok).toBe(false);
    await actAs(db(), admin, 'aal2');
    expect((await db().query("select private.has_role('admin') as ok")).rows[0].ok).toBe(true);
  });

  it('content_reviewer also requires aal2', async () => {
    const r = await createUser(db());
    await grantRole(db(), r, 'content_reviewer');
    await actAs(db(), r, 'aal1');
    expect((await db().query("select private.has_role('content_reviewer') as ok")).rows[0].ok).toBe(
      false,
    );
  });

  it('a student with aal2 still is not an admin', async () => {
    const a = await createUser(db());
    await actAs(db(), a, 'aal2');
    expect((await db().query("select private.has_role('admin') as ok")).rows[0].ok).toBe(false);
  });

  it('a forged role claim in the JWT does not grant admin', async () => {
    const a = await createUser(db());
    await db().query('reset role');
    await db().query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({
        sub: a,
        role: 'authenticated',
        aal: 'aal2',
        app_role: 'admin',
        user_role: 'admin',
      }),
    ]);
    await db().query('set local role authenticated');
    expect((await db().query("select private.has_role('admin') as ok")).rows[0].ok).toBe(false);
  });
});

describe('consents', () => {
  it('a student cannot insert consent rows directly', async () => {
    const a = await createUser(db());
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
    await actAs(db(), a);
    await db().query("select public.api_record_consent('terms', '2026-11-01', true)");
    const mine = await db().query<{
      user_id: string;
      kind: string;
      version: string;
      granted: boolean;
    }>('select user_id, kind, version, granted from public.consents');
    expect(mine.rows).toEqual([
      { user_id: a, kind: 'terms', version: '2026-11-01', granted: true },
    ]);
    await actAs(db(), b);
    expect((await db().query('select * from public.consents')).rowCount).toBe(0);
  });

  it('withdrawal is a new row; consent rows cannot be edited or deleted', async () => {
    const a = await createUser(db());
    await actAs(db(), a);
    await db().query("select public.api_record_consent('email_reminders', 'v1', true)");
    await db().query("select public.api_record_consent('email_reminders', 'v1', false)");
    expect((await db().query('select * from public.consents')).rowCount).toBe(2);
    await expectSqlError(db(), 'update public.consents set granted = true');
    await expectSqlError(db(), 'delete from public.consents');
    // Even the owner/service path cannot rewrite history.
    await actAsSuperuser(db());
    await expectSqlError(db(), 'update public.consents set granted = true');
    await expectSqlError(db(), 'delete from public.consents');
  });

  it('rejects invalid versions and unauthenticated callers', async () => {
    const a = await createUser(db());
    await actAs(db(), a);
    await expectSqlError(
      db(),
      "select public.api_record_consent('terms', 'bad version!', true)",
      [],
      '22023',
    );
    await expectSqlError(
      db(),
      "select public.api_record_consent('terms', $1, true)",
      ['x'.repeat(33)],
      '22023',
    );
    await actAsAnon(db());
    await expectSqlError(db(), "select public.api_record_consent('terms', 'v1', true)");
  });
});

describe('notification_preferences', () => {
  it("a student can update their own preferences but not another student's", async () => {
    const a = await createUser(db());
    const b = await createUser(db());
    await actAs(db(), a);
    expect(
      (
        await db().query(
          'update public.notification_preferences set email = true where user_id = $1',
          [a],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await db().query(
          'update public.notification_preferences set email = true where user_id = $1',
          [b],
        )
      ).rowCount,
    ).toBe(0);
    const { rows } = await db().query<{ user_id: string }>(
      'select user_id from public.notification_preferences',
    );
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
    expect((await db().query('select * from public.audit_log')).rowCount).toBe(1);
    await expectSqlError(db(), "update public.audit_log set action = 'x'");
    await actAsSuperuser(db());
    await expectSqlError(db(), "update public.audit_log set action = 'x'");
    await expectSqlError(db(), 'delete from public.audit_log');
  });
});
