import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, expect, inject } from 'vitest';

/**
 * One connection per test file. Every test runs inside a transaction that is rolled back,
 * so tests never see each other's rows. Role switching uses SET LOCAL, exactly like
 * PostgREST does for each request.
 */
export function useDb(): { db: () => pg.Client } {
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: inject('dbUrl') });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });
  beforeEach(async () => {
    await client.query('begin');
  });
  afterEach(async () => {
    await client.query('rollback');
  });
  return { db: () => client };
}

/** Insert an auth user as the superuser (fires the provisioning trigger). */
export async function createUser(db: pg.Client, email = `${randomUUID()}@example.test`) {
  await db.query('reset role');
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  );
  return rows[0]!.id;
}

export async function grantRole(db: pg.Client, userId: string, role: string) {
  await db.query('reset role');
  await db.query('insert into public.user_roles (user_id, role) values ($1, $2)', [userId, role]);
}

/** Act as an authenticated user, as PostgREST would for a request with that JWT. */
export async function actAs(db: pg.Client, userId: string, aal: 'aal1' | 'aal2' = 'aal1') {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: 'authenticated', aal }),
  ]);
  await db.query('set local role authenticated');
}

export async function actAsAnon(db: pg.Client) {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: 'anon' }),
  ]);
  await db.query('set local role anon');
}

export async function actAsSuperuser(db: pg.Client) {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claims', '', true)");
}

/** Run a statement that must fail with the given SQLSTATE, without aborting the test transaction. */
export async function expectSqlError(
  db: pg.Client,
  sql: string,
  params: unknown[] = [],
  code = '42501',
) {
  await db.query('savepoint expect_error');
  let error: (Error & { code?: string }) | undefined;
  try {
    await db.query(sql, params);
  } catch (err) {
    error = err as Error & { code?: string };
  }
  await db.query('rollback to savepoint expect_error');
  expect(error, `expected "${sql}" to fail with ${code}`).toBeDefined();
  expect(error?.code).toBe(code);
}
