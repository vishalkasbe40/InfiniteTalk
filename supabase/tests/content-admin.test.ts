import type pg from 'pg';
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

async function staff(role: 'admin' | 'content_reviewer' = 'content_reviewer') {
  const id = await createUser(db());
  await grantRole(db(), id, role);
  return id;
}

const val = async (client: pg.Client, sql: string, params: unknown[] = []) =>
  Object.values((await client.query(sql, params)).rows[0])[0] as string;

const setStatus = (table: string, id: string, status: string) =>
  db().query('select public.api_content_set_status($1, $2, $3)', [table, id, status]);

async function approve(table: string, id: string) {
  await setStatus(table, id, 'in_review');
  await setStatus(table, id, 'approved');
}

/** Build a full chain as `who` (aal2), returning ids. Nothing approved yet. */
async function chain(client: pg.Client) {
  const source = await val(
    client,
    "select public.api_content_save_source(null, 'official_syllabus', ' Official syllabus PDF ', 'Exam body', 'https://example.org/syllabus.pdf', '2026-01-10', '2026-11-06', null)",
  );
  const family = await val(
    client,
    "select public.api_content_save_family(null, ' tfam ', 'Test family', null)",
  );
  const exam = await val(
    client,
    "select public.api_content_save_exam(null, $1, 'TEXAM', 'Test exam', null, 'Maharashtra')",
    [family],
  );
  const stage = await val(
    client,
    "select public.api_content_save_stage(null, $1, 'PRE', 'Prelims', null, 1::smallint)",
    [exam],
  );
  const paper = await val(
    client,
    "select public.api_content_save_paper(null, $1, 'GS1', 'Paper I', null, 120::smallint, 200, 0.333, $2)",
    [stage, source],
  );
  const syllabus = await val(
    client,
    "select public.api_content_save_syllabus(null, $1, 'v2026', '2026-01-01', $2)",
    [paper, source],
  );
  const subject = await val(
    client,
    "select public.api_content_save_subject(null, $1, 'History', null, 1::smallint)",
    [syllabus],
  );
  const topic = await val(
    client,
    "select public.api_content_save_topic(null, $1, 'Topic 1', null, 1, null, 90, 1::smallint)",
    [subject],
  );
  return { source, family, exam, stage, paper, syllabus, subject, topic };
}

describe('content management RPCs', () => {
  it('an MFA content reviewer builds a chain; values are cleaned; everything starts as draft and is audited', async () => {
    const r = await staff();
    await actAs(db(), r, 'aal2');
    const c = await chain(db());
    const fam = await db().query(
      'select code, status, created_by from public.exam_families where id = $1',
      [c.family],
    );
    expect(fam.rows).toEqual([{ code: 'TFAM', status: 'draft', created_by: r }]);
    expect(
      (await db().query('select title from public.sources where id = $1', [c.source])).rows[0]
        .title,
    ).toBe('Official syllabus PDF');
    await actAsSuperuser(db());
    const audit = await db().query(
      "select count(*)::int as n from public.audit_log where action = 'content.create' and actor_id = $1",
      [r],
    );
    expect(audit.rows[0].n).toBe(8);
  });

  it('approving requires parents (and the cited source) approved first; then the student sees it', async () => {
    const r = await staff();
    await actAs(db(), r, 'aal2');
    const c = await chain(db());
    await setStatus('exams', c.exam, 'in_review');
    await expectSqlError(
      db(),
      "select public.api_content_set_status('exams', $1, 'approved')",
      [c.exam],
      '22023',
    );
    await approve('exam_families', c.family);
    await setStatus('exams', c.exam, 'approved');
    await approve('exam_stages', c.stage);
    await setStatus('papers', c.paper, 'in_review');
    await expectSqlError(
      db(),
      "select public.api_content_set_status('papers', $1, 'approved')",
      [c.paper],
      '22023',
    );
    await approve('sources', c.source);
    await setStatus('papers', c.paper, 'approved');
    await approve('syllabus_versions', c.syllabus);
    await approve('subjects', c.subject);
    await approve('topics', c.topic);

    const s = await createUser(db());
    await actAs(db(), s);
    expect(
      (await db().query('select id from public.papers where id = $1', [c.paper])).rows,
    ).toEqual([{ id: c.paper }]);
  });

  it('approved content is fixed; only allowed status changes; retire works and blocks new children', async () => {
    const r = await staff();
    await actAs(db(), r, 'aal2');
    const c = await chain(db());
    await approve('exam_families', c.family);
    await expectSqlError(
      db(),
      "select public.api_content_save_family($1, 'TFAM', 'Renamed', null)",
      [c.family],
      '22023',
    );
    await expectSqlError(
      db(),
      "select public.api_content_set_status('exam_families', $1, 'draft')",
      [c.family],
      '22023',
    );
    await expectSqlError(
      db(),
      "select public.api_content_set_status('subjects', $1, 'approved')",
      [c.subject],
      '22023',
    ); // draft -> approved skips review
    await setStatus('exam_families', c.family, 'retired');
    await expectSqlError(
      db(),
      "select public.api_content_save_exam(null, $1, 'NEW', 'New exam', null, null)",
      [c.family],
      '22023',
    );
  });

  it('a draft can be edited, sent to review, and sent back', async () => {
    const r = await staff();
    await actAs(db(), r, 'aal2');
    const c = await chain(db());
    await db().query(
      "select public.api_content_save_topic($1, $2, 'Topic renamed', 'विषय', 1, null, 120, 2::smallint)",
      [c.topic, c.subject],
    );
    await setStatus('topics', c.topic, 'in_review');
    await db().query(
      "select public.api_content_save_topic($1, $2, 'Topic again', null, 1, null, 120, 2::smallint)",
      [c.topic, c.subject],
    );
    await setStatus('topics', c.topic, 'draft');
    const t = await db().query('select name_en, status from public.topics where id = $1', [
      c.topic,
    ]);
    expect(t.rows).toEqual([{ name_en: 'Topic again', status: 'draft' }]);
  });

  it('a non-default topic weight needs a note before approval', async () => {
    const r = await staff();
    await actAs(db(), r, 'aal2');
    const c = await chain(db());
    for (const [t, id] of [
      ['exam_families', c.family],
      ['exams', c.exam],
      ['exam_stages', c.stage],
      ['sources', c.source],
      ['papers', c.paper],
      ['syllabus_versions', c.syllabus],
      ['subjects', c.subject],
    ] as const)
      await approve(t, id);
    await db().query(
      "select public.api_content_save_topic($1, $2, 'Heavy topic', null, 3, null, 90, 1::smallint)",
      [c.topic, c.subject],
    );
    await setStatus('topics', c.topic, 'in_review');
    await expectSqlError(
      db(),
      "select public.api_content_set_status('topics', $1, 'approved')",
      [c.topic],
      '22023',
    );
    await setStatus('topics', c.topic, 'draft');
    await db().query(
      "select public.api_content_save_topic($1, $2, 'Heavy topic', null, 3, 'Official syllabus lists 3 sub-areas', 90, 1::smallint)",
      [c.topic, c.subject],
    );
    await approve('topics', c.topic);
  });

  it('self-approval is allowed but flagged; approval by another reviewer is not flagged', async () => {
    const author = await staff();
    const other = await staff('admin');
    await actAs(db(), author, 'aal2');
    const fam1 = await val(
      db(),
      "select public.api_content_save_family(null, 'SELF1', 'Self', null)",
    );
    const fam2 = await val(
      db(),
      "select public.api_content_save_family(null, 'SELF2', 'Other', null)",
    );
    await approve('exam_families', fam1);
    await setStatus('exam_families', fam2, 'in_review');
    await actAs(db(), other, 'aal2');
    await setStatus('exam_families', fam2, 'approved');
    await actAsSuperuser(db());
    const flags = await db().query(
      "select entity_id, meta->>'self_approved' as self from public.audit_log where action = 'content.status' and meta->>'to' = 'approved' and entity_id = any($1)",
      [[fam1, fam2]],
    );
    expect(Object.fromEntries(flags.rows.map((r) => [r.entity_id, r.self]))).toEqual({
      [fam1]: 'true',
      [fam2]: 'false',
    });
    const approvedBy = await db().query(
      'select approved_by from public.exam_families where id = $1',
      [fam2],
    );
    expect(approvedBy.rows[0].approved_by).toBe(other);
  });

  it('refuses students, staff without MFA, anon, unknown tables and bad input', async () => {
    const student = await createUser(db());
    const r = await staff();
    const call = "select public.api_content_save_family(null, 'XFAM', 'x', null)";
    await actAs(db(), student, 'aal2');
    await expectSqlError(db(), call);
    await actAs(db(), r, 'aal1');
    await expectSqlError(db(), call);
    await actAsAnon(db());
    await expectSqlError(db(), call);
    await actAs(db(), r, 'aal2');
    const fam = await val(db(), call);
    await expectSqlError(
      db(),
      "select public.api_content_set_status('user_roles', $1, 'approved')",
      [fam],
      '22023',
    );
    await expectSqlError(
      db(),
      "select public.api_content_save_family(null, 'bad code!', 'x', null)",
      [],
      '23514',
    );
    await expectSqlError(
      db(),
      "select public.api_content_save_exam(null, null, 'E1', 'x', null, null)",
      [],
      '22023',
    );
    await expectSqlError(
      db(),
      "select public.api_content_save_source(null, 'other', 'x', null, 'javascript:alert(1)', null, null, null)",
      [],
      '23514',
    );
  });
});
