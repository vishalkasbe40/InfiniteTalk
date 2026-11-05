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

describe('two-step attempt limit', () => {
  it('locks a staff member after 5 failed codes in 15 minutes and audits each failure', async () => {
    const a = await createUser(db());
    await grantRole(db(), a, 'admin');
    await actAs(db(), a, 'aal1');
    expect((await db().query('select public.api_mfa_guard() as left')).rows[0].left).toBe(5);
    for (let i = 0; i < 5; i++) await db().query("select public.api_mfa_record('verify_failed')");
    await expectSqlError(db(), 'select public.api_mfa_guard()', [], '54000');

    await actAsSuperuser(db());
    const audit = await db().query(
      "select count(*)::int as n from public.audit_log where action = 'mfa.verify_failed' and actor_id = $1",
      [a],
    );
    expect(audit.rows[0].n).toBe(5);
    // Old failures stop counting.
    await db().query(
      "update private.mfa_failures set at = now() - interval '16 minutes' where user_id = $1",
      [a],
    );
    await actAs(db(), a, 'aal1');
    expect((await db().query('select public.api_mfa_guard() as left')).rows[0].left).toBe(5);
  });

  it('one staff member’s failures do not lock another', async () => {
    const a = await createUser(db());
    const b = await createUser(db());
    await grantRole(db(), a, 'admin');
    await grantRole(db(), b, 'content_reviewer');
    await actAs(db(), a);
    for (let i = 0; i < 5; i++) await db().query("select public.api_mfa_record('verify_failed')");
    await actAs(db(), b);
    expect((await db().query('select public.api_mfa_guard() as left')).rows[0].left).toBe(5);
  });

  it('students and anon cannot use it; unknown events are rejected; the table is private', async () => {
    const s = await createUser(db());
    const a = await createUser(db());
    await grantRole(db(), a, 'admin');
    await actAs(db(), s);
    await expectSqlError(db(), 'select public.api_mfa_guard()');
    await expectSqlError(db(), "select public.api_mfa_record('verify_failed')");
    await expectSqlError(db(), 'select * from private.mfa_failures');
    await actAs(db(), a);
    await expectSqlError(db(), "select public.api_mfa_record('anything')", [], '22023');
    await expectSqlError(db(), 'delete from private.mfa_failures');
    await actAsAnon(db());
    await expectSqlError(db(), 'select public.api_mfa_guard()');
  });
});
