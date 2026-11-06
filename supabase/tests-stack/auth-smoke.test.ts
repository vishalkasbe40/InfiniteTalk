import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// End-to-end smoke test against a REAL local Supabase stack (`supabase start`), exercising
// GoTrue (auth) and PostgREST (data API) on top of our migrations. Runs in CI only
// (job `supabase-stack`); keys are the stack's throwaway local keys, never real ones.
const url = process.env.API_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.ANON_KEY ?? process.env.PUBLISHABLE_KEY ?? '';
const serviceKey = process.env.SERVICE_ROLE_KEY ?? process.env.SECRET_KEY ?? '';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, opts);
const password = `pw-${randomUUID()}`;
const created: string[] = [];

async function createConfirmedUser(): Promise<{ id: string; email: string }> {
  const email = `smoke-${randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  created.push(data.user!.id);
  return { id: data.user!.id, email };
}

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, opts);
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return client;
}

describe('real Supabase stack', () => {
  let a: { id: string; email: string };
  let b: { id: string; email: string };
  let asA: SupabaseClient;
  const consentVersion = `ci-${Date.now()}`;

  beforeAll(async () => {
    expect(anonKey, 'ANON_KEY missing').not.toBe('');
    expect(serviceKey, 'SERVICE_ROLE_KEY missing').not.toBe('');
    a = await createConfirmedUser(); // fires on_auth_user_created as GoTrue's DB role
    b = await createConfirmedUser();
    asA = await signedIn(a.email);
    const { error } = await admin
      .from('consent_documents')
      .insert({ kind: 'terms', version: consentVersion });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });

  it('provisions profile and student role for users created through GoTrue', async () => {
    const { data, error } = await admin.from('user_roles').select('role').eq('user_id', a.id);
    expect(error).toBeNull();
    expect(data).toEqual([{ role: 'student' }]);
  });

  it('public self sign-up is disabled (invite-only beta)', async () => {
    const anon = createClient(url, anonKey, opts);
    const { error } = await anon.auth.signUp({ email: `x-${randomUUID()}@example.test`, password });
    expect(error).not.toBeNull();
  });

  it('a signed-in student sees only their own profile via the API', async () => {
    const { data, error } = await asA.from('profiles').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([{ id: a.id }]);
    const other = await asA.from('profiles').select('id').eq('id', b.id);
    expect(other.data).toEqual([]);
  });

  it('protected columns and role grants are rejected via the API', async () => {
    const del = await asA.from('profiles').update({ deleted_at: null }).eq('id', a.id);
    expect(del.error?.code).toBe('42501');
    const role = await asA.from('user_roles').insert({ user_id: a.id, role: 'admin' });
    expect(role.error?.code).toBe('42501');
  });

  it('records consent through the RPC for the caller only', async () => {
    const { error } = await asA.rpc('api_record_consent', {
      p_kind: 'terms',
      p_version: consentVersion,
      p_granted: true,
    });
    expect(error).toBeNull();
    const { data } = await asA.from('consents').select('user_id, version');
    expect(data).toEqual([{ user_id: a.id, version: consentVersion }]);
  });

  it('does not expose the private schema through the API', async () => {
    const { error } = await asA.schema('private').rpc('has_role', { p_role: 'admin' });
    expect(error).not.toBeNull();
  });

  it('anonymous API callers cannot read student data', async () => {
    const anon = createClient(url, anonKey, opts);
    const { data, error } = await anon.from('profiles').select('id');
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
