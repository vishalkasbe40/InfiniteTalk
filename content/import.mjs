// Loads every bundle in content/imports into the hosted database as DRAFTS (ADR 0005).
// Run by .github/workflows/import-content.yml with SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.
// Uses the Supabase Management API's SQL endpoint (runs as the database owner). Safe to re-run:
// existing rows are reused, never changed. Prints only counts, never secrets.
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateBundle } from './validate.mjs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error(
    'Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF (see docs/runbooks/staging-setup.md)',
  );
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`database query failed (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

const ready = await sql(
  "select to_regprocedure('private.import_content_bundle(jsonb)') is not null as ok",
);
if (!ready[0]?.ok) {
  console.error(
    'The database has no import function yet. Run the "Deploy database" workflow first.',
  );
  process.exit(1);
}

const dir = new URL('./imports/', import.meta.url).pathname;
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort();
let failed = false;
for (const file of files) {
  const text = readFileSync(join(dir, file), 'utf8');
  const bundle = JSON.parse(text);
  const errors = validateBundle(bundle, file);
  if (errors.length) {
    console.error(`✗ ${file}:\n  - ${errors.join('\n  - ')}`);
    failed = true;
    continue;
  }
  const json = JSON.stringify(bundle);
  let tag;
  do tag = `$b${randomBytes(8).toString('hex')}$`;
  while (json.includes(tag));
  try {
    const rows = await sql(
      `select private.import_content_bundle(${tag}${json}${tag}::jsonb) as result`,
    );
    const r = rows[0].result;
    console.log(
      `✓ ${file}: created ${JSON.stringify(r.created)}; already present ${JSON.stringify(r.existing)}`,
    );
  } catch (err) {
    console.error(`✗ ${file}: ${err.message}`);
    failed = true;
  }
}
if (!files.length) console.log('No bundles to import.');
process.exit(failed ? 1 : 0);
