import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentVersions, missingConsents, type RequiredConsent } from './consent';

/** Published consent documents (readable by any signed-in user, or the service role). */
export async function loadConsentDocuments(client: SupabaseClient) {
  const { data, error } = await client
    .from('consent_documents')
    .select('kind, version, published_at');
  if (error) throw new Error('could not load consent documents');
  return data;
}

/** Missing consents for the signed-in user of this (user-scoped) client. */
export async function loadMissingConsents(client: SupabaseClient): Promise<RequiredConsent[]> {
  const [docs, records] = await Promise.all([
    loadConsentDocuments(client),
    client.from('consents').select('kind, version, granted, at'),
  ]);
  if (records.error) throw new Error('could not load consents');
  return missingConsents(docs, records.data);
}

export { currentVersions };
