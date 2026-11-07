import { describe, expect, it } from 'vitest';
import {
  actAs,
  actAsAnon,
  actAsService,
  actAsSuperuser,
  consentAll,
  createUser,
  expectSqlError,
  grantRole,
  publishConsentDocument,
  useDb,
} from './helpers';

// Draft-only import used by the content agent (ADR 0005) and eligibility rules.
const { db } = useDb();

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

/** Fictional bundle: every name and link is made up. */
function bundle(overrides: Record<string, unknown> = {}) {
  return {
    format: 'examsaathi.content-bundle/v1',
    ref: 'test-fictional-bundle',
    sources: [
      {
        key: 'notice',
        kind: 'official_notification',
        title: 'Fictional recruitment notice 2026',
        publisher: 'Fictional Commission',
        url: 'https://example.gov.in/notice.pdf',
        published_on: '2026-01-10',
        retrieved_on: '2026-11-07',
        document_sha256: SHA_A,
      },
      {
        key: 'syllabus',
        kind: 'official_syllabus',
        title: 'Fictional syllabus 2026',
        url: 'https://example.gov.in/syllabus.pdf',
        document_sha256: SHA_B,
      },
    ],
    families: [
      {
        code: 'FICT',
        name_en: 'Fictional Commission',
        exams: [
          {
            code: 'FICT_CIVIL',
            name_en: 'Fictional civil services',
            state: 'Maharashtra',
            eligibility: [
              {
                label: 'Notice 2026: general posts',
                min_education: 'graduate',
                education_note: 'Any degree; final-year students may apply.',
                age_min: 19,
                age_max: 38,
                age_reference_date: '2026-04-01',
                age_relaxations: { OBC: 3, SC: 5 },
                domicile_state: 'Maharashtra',
                source: 'notice',
              },
            ],
            stages: [
              {
                code: 'PRE',
                name_en: 'Preliminary',
                sort_order: 1,
                papers: [
                  {
                    code: 'GS1',
                    name_en: 'General Studies I',
                    duration_min: 120,
                    total_marks: 200,
                    source: 'notice',
                    syllabus_versions: [
                      {
                        label: 'Syllabus 2026',
                        effective_from: '2026-01-10',
                        source: 'syllabus',
                        subjects: [
                          {
                            name_en: 'History',
                            sort_order: 1,
                            topics: [
                              { name_en: 'Fictional topic one', sort_order: 1 },
                              { name_en: 'Fictional topic two', sort_order: 2 },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

const importBundle = async (b: unknown) =>
  (
    await db().query<{ r: Record<string, unknown> }>(
      'select private.import_content_bundle($1::jsonb) as r',
      [JSON.stringify(b)],
    )
  ).rows[0]!.r;

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db().query(sql, params)).rows[0] as T;

async function staff() {
  const id = await createUser(db());
  await grantRole(db(), id, 'content_reviewer');
  return id;
}

describe('content import (owner only, drafts only)', () => {
  it('creates the whole tree as unowned drafts and audits each row with the bundle ref', async () => {
    await actAsSuperuser(db());
    const r = await importBundle(bundle());
    expect(r).toMatchObject({
      ref: 'test-fictional-bundle',
      created: {
        sources: 2,
        exam_families: 1,
        exams: 1,
        eligibility_rules: 1,
        exam_stages: 1,
        papers: 1,
        syllabus_versions: 1,
        subjects: 1,
        topics: 2,
      },
      existing: {},
    });
    const statuses = await db().query(`
      select status, created_by, approved_by, id from public.topics
      union all select status, created_by, approved_by, id from public.eligibility_rules
      union all select status, created_by, approved_by, id from public.sources`);
    // Only rows this import created (the real-stack CI run also loads supabase/seed.sql).
    const { rows: mine } = await db().query<{ entity_id: string }>(
      "select entity_id from public.audit_log where action = 'content.import'",
    );
    const ids = new Set(mine.map((m) => m.entity_id));
    statuses.rows = statuses.rows.filter((x) => ids.has(x.id));
    expect(statuses.rows).toHaveLength(5);
    expect(statuses.rows.every((x) => x.status === 'draft' && x.created_by === null)).toBe(true);
    expect(statuses.rows.every((x) => x.approved_by === null)).toBe(true);
    const audit = await one<{ n: string; refs: string[] }>(
      `select count(*) as n, array_agg(distinct meta ->> 'ref') as refs
       from public.audit_log where action = 'content.import'`,
    );
    expect(Number(audit.n)).toBe(11);
    expect(audit.refs).toEqual(['test-fictional-bundle']);
    const rule = await one<{ age_relaxations: unknown; min_education: string; source: string }>(
      `select r.age_relaxations, r.min_education, s.title as source
       from public.eligibility_rules r join public.sources s on s.id = r.source_id`,
    );
    expect(rule).toEqual({
      age_relaxations: { OBC: 3, SC: 5 },
      min_education: 'graduate',
      source: 'Fictional recruitment notice 2026',
    });
  });

  it('is idempotent: a second run reuses everything and writes no audit rows', async () => {
    await actAsSuperuser(db());
    await importBundle(bundle());
    const before = await one<{ n: string }>('select count(*) as n from public.audit_log');
    const r = await importBundle(bundle());
    expect(r.created).toEqual({});
    expect(r.existing).toMatchObject({ sources: 2, topics: 2, eligibility_rules: 1 });
    const after = await one<{ n: string }>('select count(*) as n from public.audit_log');
    expect(after.n).toBe(before.n);
  });

  it('adds a new source draft when the official document changed (new fingerprint)', async () => {
    await actAsSuperuser(db());
    await importBundle(bundle());
    const changed = bundle();
    changed.sources[1]!.document_sha256 = 'c'.repeat(64);
    changed.families[0]!.exams[0]!.stages[0]!.papers[0]!.syllabus_versions[0]!.label =
      'Syllabus 2026 (revised)';
    const r = await importBundle(changed);
    expect(r.created).toMatchObject({ sources: 1, syllabus_versions: 1 });
    const n = await one<{ n: string }>(
      "select count(*) as n from public.sources where url = 'https://example.gov.in/syllabus.pdf'",
    );
    expect(Number(n.n)).toBe(2);
  });

  it('never edits existing rows, even drafts', async () => {
    await actAsSuperuser(db());
    await importBundle(bundle());
    const edited = bundle();
    edited.families[0]!.name_en = 'Renamed by a later bundle';
    await importBundle(edited);
    const fam = await one<{ name_en: string }>(
      "select name_en from public.exam_families where code = 'FICT'",
    );
    expect(fam.name_en).toBe('Fictional Commission');
  });

  it('refuses to silently ignore changed details under an existing label or code', async () => {
    await actAsSuperuser(db());
    await importBundle(bundle());
    const sql = 'select private.import_content_bundle($1::jsonb)';
    const changedAge = bundle();
    changedAge.families[0]!.exams[0]!.eligibility[0]!.age_max = 43;
    await expectSqlError(db(), sql, [JSON.stringify(changedAge)], '22023');
    const changedMarks = bundle();
    changedMarks.families[0]!.exams[0]!.stages[0]!.papers[0]!.total_marks = 250;
    await expectSqlError(db(), sql, [JSON.stringify(changedMarks)], '22023');
    // A new syllabus document under the old label must become a new version instead.
    const newDoc = bundle();
    newDoc.sources[1]!.document_sha256 = 'd'.repeat(64);
    await expectSqlError(db(), sql, [JSON.stringify(newDoc)], '22023');
    newDoc.families[0]!.exams[0]!.stages[0]!.papers[0]!.syllabus_versions[0]!.label =
      'Syllabus 2027';
    const r = await importBundle(newDoc);
    expect(r.created).toMatchObject({ sources: 1, syllabus_versions: 1, subjects: 1, topics: 2 });
  });

  it('treats null relaxations as none', async () => {
    await actAsSuperuser(db());
    const b = bundle();
    (b.families[0]!.exams[0]!.eligibility[0] as { age_relaxations: unknown }).age_relaxations =
      null;
    await importBundle(b);
    const rule = await one<{ age_relaxations: unknown }>(
      'select age_relaxations from public.eligibility_rules',
    );
    expect(rule.age_relaxations).toEqual({});
  });

  it('rejects unofficial or insecure sources and uncited facts', async () => {
    await actAsSuperuser(db());
    const bad = (mutate: (b: ReturnType<typeof bundle>) => void) => {
      const b = bundle();
      mutate(b);
      return JSON.stringify(b);
    };
    const sql = 'select private.import_content_bundle($1::jsonb)';
    await expectSqlError(db(), sql, [bad((b) => (b.sources[0]!.kind = 'other'))], '22023');
    await expectSqlError(
      db(),
      sql,
      [bad((b) => (b.sources[0]!.url = 'http://example.org/x.pdf'))],
      '22023',
    );
    for (const url of [
      'https://blog.example.com/x.pdf',
      'https://example.gov.in:8443/x.pdf',
      'https://user@example.gov.in/x.pdf',
      'https://evilgov.in/x.pdf',
    ]) {
      await expectSqlError(db(), sql, [bad((b) => (b.sources[0]!.url = url))], '22023');
    }
    await expectSqlError(
      db(),
      sql,
      [bad((b) => delete (b.sources[0] as { document_sha256?: string }).document_sha256)],
      '22023',
    );
    await expectSqlError(
      db(),
      sql,
      [bad((b) => delete (b.families[0]!.exams[0]!.eligibility[0] as { source?: string }).source)],
      '22023',
    );
    await expectSqlError(
      db(),
      sql,
      [
        bad(
          (b) =>
            delete (b.families[0]!.exams[0]!.stages[0]!.papers[0] as { source?: string }).source,
        ),
      ],
      '22023',
    );
    await expectSqlError(
      db(),
      sql,
      [bad((b) => (b.families[0]!.exams[0]!.eligibility[0]!.source = 'nope'))],
      '22023',
    );
    await expectSqlError(db(), sql, [bad((b) => (b.ref = 'Bad Ref!'))], '22023');
    await expectSqlError(db(), sql, [bad((b) => (b.format = 'v0'))], '22023');
    await expectSqlError(
      db(),
      sql,
      [
        bad(
          (b) =>
            (b.families[0]!.exams[0]!.eligibility[0]!.age_relaxations = { obc: 99 } as unknown as {
              OBC: number;
              SC: number;
            }),
        ),
      ],
      '23514',
    );
    expect(
      Number(
        (
          await one<{ n: string }>(
            "select count(*) as n from public.sources where url like 'https://example.gov.in/%'",
          )
        ).n,
      ),
    ).toBe(0);
  });

  it('cannot be called through the API by anyone', async () => {
    const user = await staff();
    const sql = 'select private.import_content_bundle($1::jsonb)';
    const b = [JSON.stringify(bundle())];
    await actAsAnon(db());
    await expectSqlError(db(), sql, b);
    await actAs(db(), user, 'aal2');
    await expectSqlError(db(), sql, b);
    await actAsService(db());
    await expectSqlError(db(), sql, b);
  });
});

describe('eligibility rules', () => {
  async function imported() {
    await actAsSuperuser(db());
    await importBundle(bundle());
    return one<Record<string, string>>(`
      select (select id from public.sources where url = 'https://example.gov.in/notice.pdf') as notice,
             (select id from public.exam_families where code = 'FICT') as family,
             (select id from public.exams where code = 'FICT_CIVIL') as exam,
             (select r.id from public.eligibility_rules r join public.exams e on e.id = r.exam_id
              where e.code = 'FICT_CIVIL') as rule`);
  }

  const setStatus = (table: string, id: string, status: string) =>
    db().query('select public.api_content_set_status($1, $2, $3)', [table, id, status]);
  const approve = async (table: string, id: string) => {
    await setStatus(table, id, 'in_review');
    await setStatus(table, id, 'approved');
  };

  it('imported drafts are approved by staff through the normal top-down workflow', async () => {
    const ids = await imported();
    const reviewer = await staff();
    await actAs(db(), reviewer, 'aal2');
    await setStatus('eligibility_rules', ids.rule!, 'in_review');
    await expectSqlError(
      db(),
      "select public.api_content_set_status('eligibility_rules', $1, 'approved')",
      [ids.rule],
      '22023',
    );
    await approve('exam_families', ids.family!);
    await approve('exams', ids.exam!);
    // Exam chain approved, but the cited notice is still a draft.
    await expectSqlError(
      db(),
      "select public.api_content_set_status('eligibility_rules', $1, 'approved')",
      [ids.rule],
      '22023',
    );
    await approve('sources', ids.notice!);
    await setStatus('eligibility_rules', ids.rule!, 'approved');
    await actAsSuperuser(db());
    const audit = await one<{ self_approved: boolean }>(
      `select (meta ->> 'self_approved')::boolean as self_approved from public.audit_log
       where action = 'content.status' and entity_type = 'eligibility_rules' and meta ->> 'to' = 'approved'`,
    );
    // Agent-created rows have no human author, so approval is flagged for a second look.
    expect(audit.self_approved).toBe(true);
  });

  it('blocks retiring an exam while an eligibility rule below it is not retired', async () => {
    const ids = await imported();
    const { rows: branch } = await db().query<{ t: string; id: string }>(
      `select entity_type as t, entity_id as id from public.audit_log
       where action = 'content.import' and entity_type in
         ('topics', 'subjects', 'syllabus_versions', 'papers', 'exam_stages')`,
    );
    const reviewer = await staff();
    await actAs(db(), reviewer, 'aal2');
    // Retire the stage branch bottom-up, leaving only the eligibility rule under the exam.
    for (const table of ['topics', 'subjects', 'syllabus_versions', 'papers', 'exam_stages']) {
      for (const r of branch.filter((b) => b.t === table)) await setStatus(table, r.id, 'retired');
    }
    await expectSqlError(
      db(),
      "select public.api_content_set_status('exams', $1, 'retired')",
      [ids.exam],
      '22023',
    );
    await setStatus('eligibility_rules', ids.rule!, 'retired');
    await setStatus('exams', ids.exam!, 'retired');
  });

  it('staff with two-step verification can save rules; others cannot', async () => {
    const ids = await imported();
    const reviewer = await staff();
    const call = `select public.api_content_save_eligibility(null, $1, 'Manual rule', null, 'class_12', null,
      18::smallint, 27::smallint, null, '{"EWS": 0}'::jsonb, null, null, null, null, $2)`;
    await actAs(db(), reviewer, 'aal1');
    await expectSqlError(db(), call, [ids.exam, ids.notice]);
    await actAs(db(), reviewer, 'aal2');
    const id = await one<{ api_content_save_eligibility: string }>(call, [ids.exam, ids.notice]);
    expect(id.api_content_save_eligibility).toMatch(/^[0-9a-f-]{36}$/);
    await expectSqlError(
      db(),
      `select public.api_content_save_eligibility(null, $1, 'Bad ages', null, 'class_12', null,
        40::smallint, 20::smallint, null, '{}'::jsonb, null, null, null, null, null)`,
      [ids.exam],
      '23514',
    );
  });

  it('students see only approved rules', async () => {
    const ids = await imported();
    await publishConsentDocument(db(), 'privacy_notice', 'v1');
    const student = await createUser(db());
    await consentAll(db(), student);
    await actAs(db(), student);
    expect((await db().query('select id from public.eligibility_rules')).rows).toEqual([]);
    const reviewer = await staff();
    await actAs(db(), reviewer, 'aal2');
    await approve('exam_families', ids.family!);
    await approve('exams', ids.exam!);
    await approve('sources', ids.notice!);
    await approve('eligibility_rules', ids.rule!);
    await actAs(db(), student);
    expect((await db().query('select id from public.eligibility_rules')).rows).toHaveLength(1);
  });
});
