import type { Metadata } from 'next';
import { EnrolForm } from '@/app/admin/mfa/mfa-forms';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Two-step security · ExamSaathi admin' };

const fmt = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });

export default async function SecurityPage() {
  const { supabase } = await requireStaff('/admin/security');
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = (data?.all ?? []).filter(
    (f) => f.factor_type === 'totp' && f.status === 'verified',
  );
  return (
    <main>
      <h1>Two-step security</h1>
      <section className="card" aria-labelledby="authenticators">
        <h2 id="authenticators">Your authenticators</h2>
        <p data-testid="authenticator-count">
          {verified.length} {verified.length === 1 ? 'authenticator' : 'authenticators'} set up.
        </p>
        <ul>
          {verified.map((f) => (
            <li key={f.id}>
              {f.friendly_name ?? 'Authenticator'} (added {fmt.format(new Date(f.created_at))})
            </li>
          ))}
        </ul>
      </section>
      <section className="card" aria-labelledby="backup">
        <h2 id="backup">Add a backup authenticator</h2>
        <p className="muted">
          Strongly recommended: add a second device (for example another phone or a tablet), so you
          can still get in if you lose one. If you lose all of them, follow the “lost phone” steps
          in docs/runbooks/admin-lost-authenticator.md.
        </p>
        <EnrolForm next="/admin/security" />
      </section>
    </main>
  );
}
