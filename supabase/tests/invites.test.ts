import { describe, expect, it } from 'vitest';
import { actAs, actAsAnon, actAsService, createUser, expectSqlError, useDb } from './helpers';

const { db } = useDb();

describe('beta_invites', () => {
  it('students and anonymous callers cannot read or add invites', async () => {
    const a = await createUser(db());
    await actAsService(db());
    await db().query("insert into public.beta_invites (email) values ('invited@example.test')");
    await actAs(db(), a);
    await expectSqlError(db(), 'select * from public.beta_invites');
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
