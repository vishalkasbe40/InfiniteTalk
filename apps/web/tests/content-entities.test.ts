import { describe, expect, it } from 'vitest';
import {
  ENTITIES,
  entityByTable,
  formatRelaxations,
  parseRelaxations,
  toRpcParams,
} from '../lib/content/entities';

const parent = '00000000-0000-4000-8000-000000000004';

describe('content entity definitions', () => {
  it('covers every level with a parent link to the level above', () => {
    expect(ENTITIES.topics.parent?.key).toBe('subjects');
    expect(ENTITIES.subjects.parent?.key).toBe('syllabus');
    expect(ENTITIES.families.children).toEqual(['exams']);
    expect(ENTITIES.exams.children).toEqual(['stages', 'eligibility']);
    expect(entityByTable('exam_stages')?.key).toBe('stages');
  });

  it('builds RPC parameters with types, trimming and upper-cased codes', () => {
    const r = toRpcParams(
      ENTITIES.papers,
      {
        code: ' gs1 ',
        name_en: ' Paper I ',
        name_mr: '',
        duration_min: '120',
        total_marks: '200',
        negative_marking: '0.25',
      },
      null,
      parent,
    );
    expect(r).toEqual({
      ok: true,
      params: {
        p_id: null,
        p_stage_id: parent,
        p_code: 'GS1',
        p_name_en: 'Paper I',
        p_name_mr: null,
        p_duration_min: 120,
        p_total_marks: 200,
        p_negative_marking: 0.25,
        p_source_id: null,
      },
    });
  });

  it.each([
    ['missing required name', ENTITIES.families, { code: 'X1' }, 'Name (English) is required.'],
    ['bad code', ENTITIES.families, { code: 'no spaces!', name_en: 'x' }, 'Code: use'],
    [
      'non-integer minutes',
      ENTITIES.papers,
      { code: 'P1', name_en: 'x', duration_min: '1.5' },
      'whole number',
    ],
    [
      'out-of-range fraction',
      ENTITIES.papers,
      { code: 'P1', name_en: 'x', negative_marking: '2' },
      'between 0 and 1',
    ],
    [
      'unsafe link',
      ENTITIES.sources,
      { kind: 'other', title: 't', url: 'javascript:alert(1)' },
      'must start with https://',
    ],
    [
      'unknown source kind',
      ENTITIES.sources,
      { kind: 'blog', title: 't' },
      'Choose a source kind.',
    ],
  ])('rejects %s', (_n, def, values, message) => {
    const r = toRpcParams(def, values, null, def.parent ? parent : null);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain(message);
  });

  it('requires a valid parent for child items and a valid id when editing', () => {
    expect(toRpcParams(ENTITIES.exams, { code: 'E1', name_en: 'x' }, null, null).ok).toBe(false);
    expect(
      toRpcParams(ENTITIES.families, { code: 'F1', name_en: 'x' }, 'not-a-uuid', null).ok,
    ).toBe(false);
  });
});

describe('eligibility rules', () => {
  const exam = '00000000-0000-4000-8000-000000000005';

  it('parses relaxations and the education level into RPC parameters', () => {
    const r = toRpcParams(
      ENTITIES.eligibility,
      {
        label: ' Advt 1/2026 ',
        min_education: 'graduate',
        age_min: '19',
        age_max: '38',
        age_relaxations: 'obc=3\nSC : 5\n\n',
      },
      null,
      exam,
    );
    expect(r.ok && r.params).toMatchObject({
      p_exam_id: exam,
      p_label: 'Advt 1/2026',
      p_min_education: 'graduate',
      p_age_min: 19,
      p_age_relaxations: { OBC: 3, SC: 5 },
      p_domicile_state: null,
    });
  });

  it('rejects unknown education levels and malformed or excessive relaxations', () => {
    const base = { label: 'x', min_education: 'graduate' };
    expect(
      toRpcParams(ENTITIES.eligibility, { ...base, min_education: 'phd' }, null, exam).ok,
    ).toBe(false);
    for (const bad of ['OBC', 'OBC=20', '3=OBC', 'OBC=three', 'OBC=3\nobc=5']) {
      expect(
        toRpcParams(ENTITIES.eligibility, { ...base, age_relaxations: bad }, null, exam).ok,
      ).toBe(false);
    }
  });

  it('round-trips relaxations for editing', () => {
    expect(parseRelaxations(formatRelaxations({ OBC: 3, SC: 5 }))).toEqual({ OBC: 3, SC: 5 });
    expect(formatRelaxations(null)).toBe('');
  });
});
