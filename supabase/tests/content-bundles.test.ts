import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module shared with the import workflow
import { isOfficialHost, validateBundle } from '../../content/validate.mjs';
import { actAsSuperuser, useDb } from './helpers';

// Every bundle in content/imports must validate and import cleanly (as drafts), twice (ADR 0005).
const dir = join(import.meta.dirname, '..', '..', 'content', 'imports');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort();
const { db } = useDb();

describe('content bundle validator', () => {
  it('accepts only official hosts', () => {
    expect(isOfficialHost('mpsc.gov.in')).toBe(true);
    expect(isOfficialHost('www.ssc.nic.in')).toBe(true);
    expect(isOfficialHost('ibps.in')).toBe(true);
    expect(isOfficialHost('adda247.com')).toBe(false);
    expect(isOfficialHost('evilgov.in')).toBe(false);
    expect(isOfficialHost('mpsc.gov.in.example.com')).toBe(false);
  });

  it('reports unofficial links, missing fingerprints and uncited facts', () => {
    const errors = validateBundle(
      {
        format: 'examsaathi.content-bundle/v1',
        ref: 'bad-bundle',
        sources: [
          {
            key: 's',
            kind: 'official_syllabus',
            title: 't',
            url: 'https://blog.example.com/x.pdf',
          },
        ],
        families: [
          {
            code: 'X',
            exams: [
              {
                code: 'X_E',
                eligibility: [{ label: 'r' }],
                stages: [{ papers: [{ code: 'P', total_marks: 200 }] }],
              },
            ],
          },
        ],
      },
      'other-name.json',
    ) as string[];
    expect(errors.join('\n')).toMatch(/file name/);
    expect(errors.join('\n')).toMatch(/not on the official-domain list/);
    expect(errors.join('\n')).toMatch(/document_sha256/);
    expect(errors.join('\n')).toMatch(/eligibility "r": an official source is required/);
    expect(errors.join('\n')).toMatch(/paper P: an official source is required/);
  });
});

describe.each(files.length ? files : ['(none)'])('bundle %s', (file) => {
  it.skipIf(file === '(none)')('validates and imports as drafts (idempotently)', async () => {
    const bundle = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    expect(validateBundle(bundle, file)).toEqual([]);
    await actAsSuperuser(db());
    const q = 'select private.import_content_bundle($1::jsonb) as r';
    await db().query(q, [JSON.stringify(bundle)]);
    const again = (await db().query(q, [JSON.stringify(bundle)])).rows[0].r;
    expect(again.created).toEqual({});
    // Every row the import created is a draft (seed rows, if loaded, are ignored).
    const { rows } = await db().query(
      `select count(*)::int as n from public.audit_log a
       cross join lateral (select private.content_row(a.entity_type, a.entity_id::uuid) ->> 'status' as status) r
       where a.action = 'content.import' and r.status <> 'draft'`,
    );
    expect(rows[0].n).toBe(0);
  });
});
