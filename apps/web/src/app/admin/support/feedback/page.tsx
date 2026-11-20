import { adminListFeedback } from '@athleit/db/support';
import Link from 'next/link';

import { PageTitle, Panel } from '@/components/admin/kit';
import { FeedbackStatus } from '@/components/admin/support/feedback-status';
import { ErrorState } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { createClient } from '@/lib/supabase/server';

/** Idea and feedback tickets, grouped by their first tag (untagged ideas stand alone). */
export default async function FeedbackPage() {
  const ctx = await getAdminContext();
  const res = await adminListFeedback(await createClient());
  return (
    <>
      <PageTitle
        title="Feedback"
        sub="Ideas people sent, grouped by tag. Support reads and tags; admins change the status."
      />
      {res.error ? (
        <ErrorState message="Couldn’t load feedback. Nothing was changed." />
      ) : res.data.items.length === 0 ? (
        <Panel>
          <p>No ideas yet.</p>
        </Panel>
      ) : (
        res.data.items.map((g) => (
          <Panel
            key={`${g.tagged}:${g.label}`}
            title={g.label}
            source={`${g.count} request${g.count === 1 ? '' : 's'}`}
          >
            <ul>
              {g.requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/support/tickets/${r.id}`}>{r.ref}</Link> {r.subject}
                </li>
              ))}
            </ul>
            {g.requests[0] ? (
              <FeedbackStatus id={g.requests[0].id} status={g.feedback_status} role={ctx.role} />
            ) : null}
          </Panel>
        ))
      )}
    </>
  );
}
