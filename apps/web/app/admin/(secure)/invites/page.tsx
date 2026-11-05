import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth/staff';
import { InviteForm } from './invite-form';
import { RevokeButton } from './revoke-button';

export const metadata: Metadata = { title: 'Invitations · ExamSaathi admin' };

const fmt = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });

export default async function InvitesPage() {
  const { supabase } = await requireStaff('/admin/invites');
  const { data, error } = await supabase
    .from('beta_invites')
    .select('id, email, note, invited_at, used_at')
    .order('invited_at', { ascending: false })
    .limit(500);

  return (
    <main>
      <h1>Invitations</h1>
      <p className="muted">
        Only invited email addresses can create an account. Each invitation works once.
      </p>
      <InviteForm />
      <h2>All invitations</h2>
      {error ? (
        <p className="msg msg-error" role="alert">
          Could not load invitations. Please reload the page.
        </p>
      ) : data.length === 0 ? (
        <p className="muted">No invitations yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Note</th>
                <th scope="col">Invited</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{i.note ?? ''}</td>
                  <td>{fmt.format(new Date(i.invited_at))}</td>
                  <td>
                    {i.used_at ? (
                      `Joined ${fmt.format(new Date(i.used_at))}`
                    ) : (
                      <RevokeButton id={i.id} email={i.email} />
                    )}
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
