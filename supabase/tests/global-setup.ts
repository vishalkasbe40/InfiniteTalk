import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

// Creates a throwaway database, applies the Supabase shim and every migration in order,
// and drops it afterwards. TEST_DATABASE_URL must point at a disposable local/CI server.
const adminUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres';
const dbName = `es_test_${process.pid}_${Date.now()}`;

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

export default async function setup(project: TestProject) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const drop = async () => {
    const a = new pg.Client({ connectionString: adminUrl });
    await a.connect();
    await a.query(`drop database if exists ${dbName} with (force)`);
    await a.end();
  };

  const url = withDb(adminUrl, dbName);
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    const root = join(import.meta.dirname, '..');
    await client.query(await readFile(join(root, 'tests/shim/supabase-shim.sql'), 'utf8'));
    const migrations = (await readdir(join(root, 'migrations')))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of migrations) {
      try {
        await client.query(await readFile(join(root, 'migrations', file), 'utf8'));
      } catch (err) {
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    // Never leave half-built test databases behind on the server.
    await client.end().catch(() => undefined);
    await drop();
    throw err;
  }
  await client.end();

  project.provide('dbUrl', url);
  return drop;
}

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string;
  }
}
