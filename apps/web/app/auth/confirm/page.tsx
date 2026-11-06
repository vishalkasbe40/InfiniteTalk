import type { Metadata } from 'next';
import { confirmEmailLink } from '@/app/actions/auth';
import { AuthCard } from '@/components/auth-card';
import { confirmParamsSchema } from '@/lib/auth/schemas';
import { createUserClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Continue · ExamSaathi' };

// Landing page for links in our emails. Opening the link does nothing by itself: the student
// presses "Continue", which posts to a server action that verifies the token (review 0003 #4).
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = confirmParamsSchema.safeParse(await searchParams);
  if (!params.success) {
    return (
      <AuthCard title="This link is not valid">
        <p className="msg msg-error" role="alert">
          The link is incomplete or has expired. Please request a new one from the log-in page.
        </p>
      </AuthCard>
    );
  }
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  const label =
    params.data.type === 'recovery' ? 'Continue to reset my password' : 'Continue to ExamSaathi';

  return (
    <AuthCard title="One more step">
      {data.user && (
        <p className="notice">
          You are currently logged in as <strong>{data.user.email}</strong>. Continuing will log you
          in with the account this link was sent to.
        </p>
      )}
      <form action={confirmEmailLink} className="stack">
        <input type="hidden" name="token_hash" value={params.data.token_hash} />
        <input type="hidden" name="type" value={params.data.type} />
        {params.data.next && <input type="hidden" name="next" value={params.data.next} />}
        <button type="submit" className="btn">
          {label}
        </button>
      </form>
    </AuthCard>
  );
}
