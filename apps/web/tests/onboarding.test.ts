import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  formatMinutes,
  maxTargetDate,
  onboardingSchema,
  todayInIndia,
} from '../lib/onboarding/schema';

const today = '2026-11-05';
const valid = {
  paper_id: '00000000-0000-4000-8000-000000000004',
  language: 'en',
  target_date: '2027-06-01',
  minutes_0: '0',
  minutes_1: '120',
  minutes_2: '120',
  minutes_3: '120',
  minutes_4: '120',
  minutes_5: '120',
  minutes_6: '240',
};

describe('onboarding validation', () => {
  it('accepts a complete answer and orders minutes Sunday-first', () => {
    const r = onboardingSchema(today).safeParse(valid);
    expect(r.success && r.data.minutes).toEqual([0, 120, 120, 120, 120, 120, 240]);
  });

  it.each([
    ['past date', { target_date: '2026-11-05' }],
    ['more than 3 years ahead', { target_date: '2029-11-06' }],
    ['unknown language', { language: 'hi' }],
    ['not a uuid', { paper_id: 'abc' }],
    ['an unlisted daily time', { minutes_1: '45' }],
    ['a missing day', { minutes_3: undefined }],
  ])('rejects %s', (_name, patch) => {
    expect(onboardingSchema(today).safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it('requires at least 30 minutes per week', () => {
    const zeros = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [`minutes_${d}`, '0']));
    expect(onboardingSchema(today).safeParse({ ...valid, ...zeros }).success).toBe(false);
    expect(onboardingSchema(today).safeParse({ ...valid, ...zeros, minutes_2: '30' }).success).toBe(
      true,
    );
  });
});

describe('dashboard helpers', () => {
  it('counts whole days and formats study time', () => {
    expect(daysUntil('2026-11-15', '2026-11-05')).toBe(10);
    expect(formatMinutes(0)).toBe('Rest day');
    expect(formatMinutes(30)).toBe('30 min');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(840)).toBe('14 h');
  });

  it('uses the India calendar date', () => {
    // 20:00 UTC on 5 Nov is already 6 Nov in India.
    expect(todayInIndia(new Date('2026-11-05T20:00:00Z'))).toBe('2026-11-06');
  });
});

describe('target date limits', () => {
  it('allows up to 3 calendar years ahead, like the database', () => {
    expect(maxTargetDate('2026-11-05')).toBe('2029-11-05');
    expect(
      onboardingSchema('2026-11-05').safeParse({ ...valid, target_date: '2029-11-05' }).success,
    ).toBe(true);
    expect(daysUntil('2026-11-01', '2026-11-05')).toBe(-4);
  });
});
