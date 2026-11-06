import { describe, expect, it } from 'vitest';
import { currentVersions, missingConsents } from '../lib/auth/consent';

const docs = [
  { kind: 'privacy_notice', version: 'p1', published_at: '2026-11-01T00:00:00Z' },
  { kind: 'privacy_notice', version: 'p2', published_at: '2026-12-01T00:00:00Z' },
  { kind: 'terms', version: 't1', published_at: '2026-11-01T00:00:00Z' },
  { kind: 'age_18_plus', version: 'a1', published_at: '2026-11-01T00:00:00Z' },
  { kind: 'email_reminders', version: 'e1', published_at: '2026-11-01T00:00:00Z' },
];
const rec = (kind: string, version: string, granted: boolean, at = '2026-12-02T00:00:00Z') => ({
  kind,
  version,
  granted,
  at,
});

describe('consent rules', () => {
  it('uses the latest published version of each required document', () => {
    expect(currentVersions(docs)).toEqual({ privacy_notice: 'p2', terms: 't1', age_18_plus: 'a1' });
  });

  it('requires re-consent when a document version changes', () => {
    const records = [
      rec('privacy_notice', 'p1', true),
      rec('terms', 't1', true),
      rec('age_18_plus', 'a1', true),
    ];
    expect(missingConsents(docs, records)).toEqual(['privacy_notice']);
  });

  it('is satisfied when all current versions are granted', () => {
    const records = [
      rec('privacy_notice', 'p2', true),
      rec('terms', 't1', true),
      rec('age_18_plus', 'a1', true),
    ];
    expect(missingConsents(docs, records)).toEqual([]);
  });

  it('treats a later withdrawal as missing', () => {
    const records = [
      rec('privacy_notice', 'p2', true),
      rec('terms', 't1', true, '2026-12-01T00:00:00Z'),
      rec('terms', 't1', false, '2026-12-03T00:00:00Z'),
      rec('age_18_plus', 'a1', true),
    ];
    expect(missingConsents(docs, records)).toEqual(['terms']);
  });

  it('fails closed when a required document has never been published', () => {
    expect(missingConsents([], [])).toEqual(['privacy_notice', 'terms', 'age_18_plus']);
  });
});
