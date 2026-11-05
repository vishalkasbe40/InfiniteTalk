import { describe, expect, it } from 'vitest';
import { actAs, actAsAnon, actAsService, createUser, expectSqlError, useDb } from './helpers';

const { db } = useDb();

describe('beta_invites', () => {
  it('students and anonymous callers cannot read or add invites', async () => {
    const a = await createUser(db());
    await actAsService(db());
    await db().query("insert into public.beta_invites (email) values ('invited@example.test')");
    await actAs(db(), a);
    // Admins can read invites (review: admin screens), so students get an empty result, not an error.
    expect((await db().query('select * from public.beta_invites')).rowCount).toBe(0);
    await expectSqlError(
      db(),
      "insert into public.beta_invites (email) values ('me@example.test')",
    );
    await actAsAnon(db());
    await expectSqlError(db(), 'select * from public.beta_invites');
  });

  it('the service role can manage invites; emails are normalised and unique', async () => {
    await actAsService(db());
    await db().query("insert into public.beta_invites (email) values ('  Priya@Example.TEST ')");
    const { rows } = await db().query(
      "select email from public.beta_invites where email like 'priya@%'",
    );
    expect(rows).toEqual([{ email: 'priya@example.test' }]);
    await expectSqlError(
      db(),
      "insert into public.beta_invites (email) values ('PRIYA@example.test')",
      [],
      '23505',
    );
    await expectSqlError(
      db(),
      "insert into public.beta_invites (email) values ('not-an-email')",
      [],
      '23514',
    );
  });

  it('ships draft consent documents for each required kind', async () => {
    const { rows } = await db().query(
      "select kind from public.consent_documents where version like '2026-11-%' order by kind",
    );
    expect(rows.map((r) => r.kind)).toEqual(['privacy_notice', 'terms', 'age_18_plus']);
  });
});

describe('svc_auth_email_status', () => {
  it('reports none / unconfirmed / confirmed, for the service role only', async () => {
    const a = await createUser(db(), 'Status@Example.test');
    await actAsService(db());
    const status = async (e: string) =>
      (await db().query('select public.svc_auth_email_status($1) as s', [e])).rows[0].s;
    expect(await status('status@example.test')).toBe('unconfirmed');
    expect(await status('nobody@example.test')).toBe('none');
    await db().query('reset role');
    await db().query('update auth.users set email_confirmed_at = now() where id = $1', [a]);
    await actAsService(db());
    expect(await status(' STATUS@example.test ')).toBe('confirmed');

    await actAs(db(), a);
    await expectSqlError(db(), "select public.svc_auth_email_status('x@example.test')");
    await actAsAnon(db());
    await expectSqlError(db(), "select public.svc_auth_email_status('x@example.test')");
  });
});
