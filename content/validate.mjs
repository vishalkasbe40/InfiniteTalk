// Checks a content bundle before it is imported (CI test and the import workflow).
// The database re-checks the structure; this adds the rules that need files: the official-host
// allow-list, the file name, and required fingerprints. ADR 0005.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const domains = JSON.parse(
  readFileSync(new URL('./official-domains.json', import.meta.url), 'utf8'),
);

export function isOfficialHost(host) {
  const h = host.toLowerCase();
  return domains.hosts.includes(h) || domains.suffixes.some((s) => h.endsWith(s));
}

/** Returns a list of problems (empty = valid). */
export function validateBundle(bundle, fileName) {
  const errors = [];
  const fail = (m) => errors.push(m);
  if (bundle?.format !== 'examsaathi.content-bundle/v1')
    fail('format must be examsaathi.content-bundle/v1');
  if (typeof bundle?.ref !== 'string' || !/^[a-z0-9][a-z0-9-]{2,80}$/.test(bundle.ref)) {
    fail('ref must be lowercase letters, digits and dashes');
  } else if (fileName && basename(fileName, '.json') !== bundle.ref) {
    fail(`file name must be ${bundle.ref}.json`);
  }
  const keys = new Set();
  for (const s of bundle?.sources ?? []) {
    const label = `source "${s?.key}"`;
    if (!s?.key || keys.has(s.key)) fail(`${label}: key missing or repeated`);
    keys.add(s?.key);
    if (!['official_notification', 'official_syllabus'].includes(s?.kind))
      fail(`${label}: kind must be official`);
    let url;
    try {
      url = new URL(s?.url);
    } catch {
      fail(`${label}: invalid link`);
      continue;
    }
    if (url.protocol !== 'https:') fail(`${label}: link must use https`);
    if (!isOfficialHost(url.hostname))
      fail(`${label}: ${url.hostname} is not on the official-domain list`);
    if (!/^[0-9a-f]{64}$/.test(s?.document_sha256 ?? ''))
      fail(`${label}: document_sha256 is required`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s?.retrieved_on ?? ''))
      fail(`${label}: retrieved_on date is required`);
    if (!s?.title) fail(`${label}: title is required`);
  }
  const cite = (where, key, required) => {
    if (key == null) {
      if (required) fail(`${where}: an official source is required`);
    } else if (!keys.has(key)) fail(`${where}: unknown source "${key}"`);
  };
  for (const f of bundle?.families ?? []) {
    for (const e of f?.exams ?? []) {
      for (const r of e?.eligibility ?? []) cite(`eligibility "${r?.label}"`, r?.source, true);
      for (const st of e?.stages ?? []) {
        for (const p of st?.papers ?? []) {
          const facts =
            p?.duration_min != null || p?.total_marks != null || p?.negative_marking != null;
          cite(`paper ${p?.code}`, p?.source, facts);
          for (const sv of p?.syllabus_versions ?? [])
            cite(`syllabus "${sv?.label}"`, sv?.source, true);
        }
      }
    }
  }
  return errors;
}
