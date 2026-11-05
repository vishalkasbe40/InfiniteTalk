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

/** Builds a minimal taxonomy as the owner. Returns ids. */
async function taxonomy(
  client: pg.Client,
  opts: { paperStatus?: string; syllabusStatus?: string } = {},
) {
  await actAsSuperuser(client);
  const one = async (sql: string, params: unknown[]) =>
    (await client.query(sql, params)).rows[0].id as string;
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const fam = await one(
    "insert into public.exam_families (code, name_en, status) values ($1, 'Fam', 'approved') returning id",
    [`F${suffix}`],
  );
  const exam = await one(
    "insert into public.exams (family_id, code, name_en, status) values ($1, $2, 'Exam', 'approved') returning id",
    [fam, `E${suffix}`],
  );
  const stage = await one(
    "insert into public.exam_stages (exam_id, code, name_en, status) values ($1, 'PRE', 'Stage', 'approved') returning id",
    [exam],
  );
  const paper = await one(
    "insert into public.papers (stage_id, code, name_en, status) values ($1, 'P1', 'Paper', $2) returning id",
    [stage, opts.paperStatus ?? 'approved'],
  );
  const syllabus = await one(
    "insert into public.syllabus_versions (paper_id, label, effective_from, status) values ($1, 'v1', '2026-01-01', $2) returning id",
    [paper, opts.syllabusStatus ?? 'approved'],
  );
  const draftPaper = await one(
    "insert into public.papers (stage_id, code, name_en, status) values ($1, 'P2', 'Draft paper', 'draft') returning id",
    [stage],
  );
  return { fam, exam, stage, paper, syllabus, draftPaper };
}

const futureDate = () => new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
const week = [0, 120, 120, 120, 120, 120, 240];

describe('exam taxonomy visibility', () => {
  it('students see approved content only; MFA staff also see drafts; anon sees nothing', async () => {
    const t = await taxonomy(db());
    const a = await createUser(db());
    await actAs(db(), a);
    const visible = await db().query('select id from public.papers where id = any($1)', [
      [t.paper, t.draftPaper],
    ]);
    expect(visible.rows).toEqual([{ id: t.paper }]);

    const reviewer = await createUser(db());
    await grantRole(db(), reviewer, 'content_reviewer');
    await actAs(db(), reviewer, 'aal1');
    expect(
      (await db().query('select 1 from public.papers where id = $1', [t.draftPaper])).rowCount,
    ).toBe(0);
    await actAs(db(), reviewer, 'aal2');
    expect(
      (await db().query('select 1 from public.papers where id = $1', [t.draftPaper])).rowCount,
    ).toBe(1);

    await actAsAnon(db());
    await expectSqlError(db(), 'select * from public.papers');
  });

  it('students cannot write content', async () => {
    const t = await taxonomy(db());
    const a = await createUser(db());
    await actAs(db(), a);
    await expectSqlError(db(), "update public.papers set status = 'approved' where id = $1", [
      t.draftPaper,
    ]);
    await expectSqlError(
      db(),
      "insert into public.exam_families (code, name_en) values ('X1', 'x')",
    );
  });

  it('paper exam facts require a cited source', async () => {
    const t = await taxonomy(db());
    await expectSqlError(
      db(),
      "insert into public.papers (stage_id, code, name_en, duration_min) values ($1, 'P9', 'x', 120)",
      [t.stage],
      '23514',
    );
  });

  it('rejects prerequisite cycles', async () => {
    const t = await taxonomy(db());
    const subj = (
      await db().query(
        "insert into public.subjects (syllabus_version_id, name_en) values ($1, 's') returning id",
        [t.syllabus],
      )
    ).rows[0].id;
    const mk = async (n: string) =>
      (
        await db().query(
          'insert into public.topics (subject_id, name_en) values ($1, $2) returning id',
          [subj, n],
        )
      ).rows[0].id;
    const [x, y, z] = [await mk('x'), await mk('y'), await mk('z')];
    await db().query('insert into public.topic_prerequisites values ($1, $2), ($2, $3)', [x, y, z]);
    await expectSqlError(
      db(),
      'insert into public.topic_prerequisites values ($1, $2)',
      [z, x],
      '23514',
    );
  });
});

describe('api_save_onboarding', () => {
  it('saves goal, availability and language for the caller only', async () => {
    const t = await taxonomy(db());
    const a = await createUser(db());
    const b = await createUser(db());
    await actAs(db(), a);
    await db().query('select public.api_save_onboarding($1, $2, $3, $4)', [
      t.paper,
      'mr',
      futureDate(),
      week,
    ]);

    const goal = await db().query(
      'select paper_id, syllabus_version_id, active from public.student_exam_goals',
    );
    expect(goal.rows).toEqual([
      { paper_id: t.paper, syllabus_version_id: t.syllabus, active: true },
    ]);
    const avail = await db().query(
      'select weekday, minutes, is_rest_day from public.study_availability order by weekday',
    );
    expect(avail.rows.map((r) => r.minutes)).toEqual(week);
    expect(avail.rows[0].is_rest_day).toBe(true);
    expect((await db().query('select preferred_language from public.profiles')).rows).toEqual([
      { preferred_language: 'mr' },
    ]);

    await actAs(db(), b);
    expect((await db().query('select * from public.student_exam_goals')).rowCount).toBe(0);
    expect((await db().query('select * from public.study_availability')).rowCount).toBe(0);
  });

  it('replaces the previous goal and keeps it as history', async () => {
    const t = await taxonomy(db());
    const a = await createUser(db());
    await actAs(db(), a);
    await db().query('select public.api_save_onboarding($1, $2, $3, $4)', [
      t.paper,
      'en',
      futureDate(),
      week,
    ]);
    await db().query('select public.api_save_onboarding($1, $2, $3, $4)', [
      t.paper,
      'en',
      futureDate(),
      week,
    ]);
    const { rows } = await db().query(
      'select active from public.student_exam_goals order by created_at',
    );
    expect(rows.filter((r) => r.active)).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });

  it('rejects draft papers, draft syllabi and invalid input', async () => {
    const t = await taxonomy(db());
    const draftSyllabus = await taxonomy(db(), { syllabusStatus: 'draft' });
    const a = await createUser(db());
    await actAs(db(), a);
    const call = 'select public.api_save_onboarding($1, $2, $3, $4)';
    await expectSqlError(db(), call, [t.draftPaper, 'en', futureDate(), week], '22023');
    await expectSqlError(db(), call, [draftSyllabus.paper, 'en', futureDate(), week], '22023');
    await expectSqlError(db(), call, [t.paper, 'xx', futureDate(), week], '22023');
    await expectSqlError(db(), call, [t.paper, 'en', '2020-01-01', week], '22023');
    await expectSqlError(db(), call, [t.paper, 'en', '2099-01-01', week], '22023');
    await expectSqlError(db(), call, [t.paper, 'en', futureDate(), [60, 60]], '22023');
    await expectSqlError(
      db(),
      call,
      [t.paper, 'en', futureDate(), [0, 0, 0, 0, 0, 0, 10]],
      '22023',
    );
    await expectSqlError(
      db(),
      call,
      [t.paper, 'en', futureDate(), [0, 0, 0, 0, 0, 0, 800]],
      '22023',
    );
  });

  it('students cannot write goals or availability directly; anon cannot call the RPC', async () => {
    const t = await taxonomy(db());
    const a = await createUser(db());
    await actAs(db(), a);
    await expectSqlError(
      db(),
      "insert into public.student_exam_goals (student_id, paper_id, syllabus_version_id, target_date) values ($1, $2, $3, '2027-01-01')",
      [a, t.paper, t.syllabus],
    );
    await expectSqlError(db(), 'update public.study_availability set minutes = 1');
    await actAsAnon(db());
    await expectSqlError(db(), 'select public.api_save_onboarding($1, $2, $3, $4)', [
      t.paper,
      'en',
      futureDate(),
      week,
    ]);
  });
});
