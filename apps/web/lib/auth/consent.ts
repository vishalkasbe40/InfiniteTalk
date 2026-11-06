export const REQUIRED_CONSENTS = ['privacy_notice', 'terms', 'age_18_plus'] as const;
export type RequiredConsent = (typeof REQUIRED_CONSENTS)[number];

export interface ConsentDocument {
  kind: string;
  version: string;
  published_at: string;
}

export interface ConsentRecord {
  kind: string;
  version: string;
  granted: boolean;
  at: string;
}

/** The latest published version of each required consent document. */
export function currentVersions(docs: ConsentDocument[]): Partial<Record<RequiredConsent, string>> {
  const out: Partial<Record<RequiredConsent, { version: string; at: number }>> = {};
  for (const d of docs) {
    if (!(REQUIRED_CONSENTS as readonly string[]).includes(d.kind)) continue;
    const kind = d.kind as RequiredConsent;
    const at = Date.parse(d.published_at);
    const prev = out[kind];
    if (!prev || at > prev.at) out[kind] = { version: d.version, at };
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v!.version]));
}

/**
 * Which required consents the user still has to give for the CURRENT versions.
 * The latest record per (kind, version) wins, so a withdrawal (granted=false) counts as missing.
 * A required kind with no published document is reported as missing (fail closed).
 */
export function missingConsents(
  docs: ConsentDocument[],
  records: ConsentRecord[],
): RequiredConsent[] {
  const current = currentVersions(docs);
  return REQUIRED_CONSENTS.filter((kind) => {
    const version = current[kind];
    if (!version) return true;
    const latest = records
      .filter((r) => r.kind === kind && r.version === version)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    return !latest?.granted;
  });
}
