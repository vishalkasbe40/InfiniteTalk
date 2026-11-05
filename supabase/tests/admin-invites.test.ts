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

async function admin() {
  const id = await createUser(db());
  await grantRole(db(), id, 'admin');
  return id;
}

describe('admin invite management', () => {
  it('an MFA admin can add, list and revoke invites; each action is audited without the email', async () => {
    const a = await admin();
    await actAs(db(), a, 'aal2');
    const id = (
      await db().query(
        "select public.api_admin_add_invite('  New.Student@Example.TEST ', 'batch 1') as id",
      )
    ).rows[0].id;
    const listed = await db().query('select email, note from public.beta_invites where id = $1', [
      id,
    ]);
    expect(listed.rows).toEqual([{ email: 'new.student@example.test', note: 'batch 1' }]);

    await db().query('select public.api_admin_revoke_invite($1)', [id]);
    expect(
      (await db().query('select 1 from public.beta_invites where id = $1', [id])).rowCount,
    ).toBe(0);

    await actAsSuperuser(db());
    const audit = await db().query(
      'select action, actor_id, meta from public.audit_log where entity_id = $1 order by id',
      [id],
    );
    expect(audit.rows).toEqual([
      { action: 'invite.add', actor_id: a, meta: {} },
      { action: 'invite.revoke', actor_id: a, meta: {} },
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain('example.test');
  });

  it('rejects duplicates, bad emails and long notes', async () => {
    const a = await admin();
    await actAs(db(), a, 'aal2');
    await db().query("select public.api_admin_add_invite('dup@example.test')");
    await expectSqlError(
      db(),
      "select public.api_admin_add_invite('DUP@example.test')",
      [],
      '23505',
    );
    await expectSqlError(db(), "select public.api_admin_add_invite('not-an-email')", [], '22023');
    await expectSqlError(
      db(),
      'select public.api_admin_add_invite($1, $2)',
      ['x@example.test', 'n'.repeat(201)],
      '22023',
    );
  });

  it('a used invite cannot be revoked', async () => {
    const a = await admin();
    const s = await createUser(db());
    await actAsSuperuser(db());
    const id = (
      await db().query(
        "insert into public.beta_invites (email, used_at, used_by) values ('used@example.test', now(), $1) returning id",
        [s],
      )
    ).rows[0].id;
    await actAs(db(), a, 'aal2');
    await expectSqlError(db(), 'select public.api_admin_revoke_invite($1)', [id], '22023');
  });

  it('admins without MFA, reviewers, students and anon are refused', async () => {
    const a = await admin();
    const reviewer = await createUser(db());
    await grantRole(db(), reviewer, 'content_reviewer');
    const student = await createUser(db());
    const add = "select public.api_admin_add_invite('x@example.test')";

    await actAs(db(), a, 'aal1');
    await expectSqlError(db(), add);
    expect((await db().query('select * from public.beta_invites')).rowCount).toBe(0);
    await actAs(db(), reviewer, 'aal2');
    await expectSqlError(db(), add);
    await actAs(db(), student, 'aal2');
    await expectSqlError(db(), add);
    expect((await db().query('select * from public.beta_invites')).rowCount).toBe(0);
    await expectSqlError(db(), "insert into public.beta_invites (email) values ('y@example.test')");
    await actAsAnon(db());
    await expectSqlError(db(), add);
  });
});
