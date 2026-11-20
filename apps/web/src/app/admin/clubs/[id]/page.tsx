import { getClub } from '@athleit/db/admin';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BillingPill, Crumbs, KeyValue, PageTitle, Panel, Timeline } from '@/components/admin/kit';
import { NoteForm } from '@/components/admin/team-actions';
import { getAdminContext } from '@/lib/admin/context';
import { createClient } from '@/lib/supabase/server';

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getAdminContext();
  const res = await getClub(await createClient(), id);
  if (res.error || !res.data) notFound();
  const { club, teams, admins, notes } = res.data;
  return (
    <>
      <Crumbs
        items={[
          { label: 'Customers' },
          { label: 'Clubs', href: '/admin/clubs' },
          { label: club.name },
        ]}
      />
      <PageTitle
        title={club.name}
        sub={`Created ${new Date(club.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
      />
      <Panel title="Teams" source="teams">
        <KeyValue
          rows={teams.map((t) => ({
            k: t.name,
            v: (
              <>
                <Link href={`/admin/teams/${t.id}`}>{t.sport}</Link>{' '}
                <BillingPill state={t.billing_state} />
              </>
            ),
          }))}
        />
      </Panel>
      <Panel title="Club admins" source="club_memberships">
        <KeyValue
          rows={admins.map((a) => ({ k: a.name, v: `${a.role}${a.email ? ` · ${a.email}` : ''}` }))}
        />
      </Panel>
      <Panel title="Support notes" source="admin_notes">
        <Timeline
          items={notes.map((n) => ({
            title: n.note,
            meta: `${n.author ?? 'Unknown'} · ${new Date(n.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          }))}
          empty="No notes yet."
        />
        <NoteForm subjectType="club" subjectId={id} />
      </Panel>
    </>
  );
}
