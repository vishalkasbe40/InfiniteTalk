import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Activity log · ExamSaathi admin' };

const fmt = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

const LABELS: Record<string, string> = {
  'role.grant': 'Role granted',
  'role.revoke': 'Role removed',
  'invite.add': 'Invitation added',
  'invite.revoke': 'Invitation cancelled',
  'mfa.enrolled': 'Authenticator added (mfa.enrolled)',
  'mfa.verify_failed': 'Wrong two-step code (mfa.verify_failed)',
  'mfa.verified': 'Two-step code accepted',
  'mfa.reset': 'Authenticators reset (runbook)',
  'content.create': 'Content created',
  'content.update': 'Content edited',
  'content.status': 'Content status changed',
};

export default async function AuditPage() {
  const { supabase } = await requireStaff('/admin/audit');
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, actor_id, action, entity_type, entity_id, meta, at')
    .order('id', { ascending: false })
    .limit(100);

  return (
    <main>
      <h1>Activity log</h1>
      <p className="muted">
        The latest 100 sensitive actions. Entries can never be edited or deleted.
      </p>
      {error ? (
        <p className="msg msg-error" role="alert">
          Could not load the activity log. Please reload the page.
        </p>
      ) : data.length === 0 ? (
        <p className="muted">No activity yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">When (IST)</th>
                <th scope="col">Action</th>
                <th scope="col">Item</th>
                <th scope="col">By</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id}>
                  <td>{fmt.format(new Date(e.at))}</td>
                  <td>
                    {LABELS[e.action] ?? e.action}
                    {e.meta?.role ? ` (${String(e.meta.role)})` : ''}
                    {e.meta?.to
                      ? ` (${String(e.meta.from)} → ${String(e.meta.to)}${e.meta.self_approved ? ', self-approved' : ''})`
                      : ''}
                  </td>
                  <td>
                    {e.entity_type}{' '}
                    <code className="small">{String(e.entity_id ?? '').slice(0, 8)}</code>
                  </td>
                  <td>
                    <code className="small">
                      {e.actor_id ? String(e.actor_id).slice(0, 8) : 'system'}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
