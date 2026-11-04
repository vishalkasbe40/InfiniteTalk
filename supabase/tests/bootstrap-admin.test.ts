import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

// Runs the real founder script through psql (it commits, so it uses its own connection
// and cleans up the user it creates; the append-only audit row intentionally remains).
const script = join(import.meta.dirname, '..', 'scripts', 'bootstrap-admin.sql');

describe('scripts/bootstrap-admin.sql', () => {
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: inject('dbUrl') });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });

  const run = (email: string) =>
    execFileSync('psql', [inject('dbUrl'), '-q', '-v', `admin_email=${email}`, '-f', script], {
      stdio: 'pipe',
      encoding: 'utf8',
    });

  it('grants admin to an existing user and audits it', async () => {
    const email = `Founder-${randomUUID()}@example.test`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id',
      [email.toLowerCase()],
    );
    const id = rows[0]!.id;
    try {
      run(email); // case-insensitive match
      run(email); // idempotent
      const roles = await client.query(
        'select role from public.user_roles where user_id = $1 order by role',
        [id],
      );
      expect(roles.rows.map((r) => r.role)).toEqual(['student', 'admin']);
      const audit = await client.query(
        "select 1 from public.audit_log where action = 'role.grant' and entity_id = $1",
        [id],
      );
      expect(audit.rowCount).toBe(1);
    } finally {
      await client.query('delete from auth.users where id = $1', [id]);
    }
  });

  it('fails clearly for an unknown email and grants nothing', () => {
    expect(() => run(`nobody-${randomUUID()}@example.test`)).toThrow(/sign up first/);
  });
});
