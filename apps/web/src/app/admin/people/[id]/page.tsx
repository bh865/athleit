import { getPerson } from '@athleit/db/admin';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Crumbs, KeyValue, PageTitle, Panel, Timeline } from '@/components/admin/kit';
import { NoteForm } from '@/components/admin/team-actions';
import { getAdminContext } from '@/lib/admin/context';
import { createClient } from '@/lib/supabase/server';

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getAdminContext();
  const res = await getPerson(await createClient(), id);
  if (res.error || !res.data) notFound();
  const { person, teams, clubs, households, push_devices, notes } = res.data;
  return (
    <>
      <Crumbs items={[{ label: 'Customers' }, { label: 'People', href: '/admin/people' }, { label: person.name }]} />
      <PageTitle title={person.name} sub="Viewing this profile is logged. Phone numbers are masked; no tokens or passwords exist here." />
      <Panel title="Account" source="profiles, auth.users">
        <KeyValue rows={[{ k: 'Email', v: person.email }, { k: 'Phone', v: person.phone_masked }, { k: 'Joined', v: d(person.created_at) }, { k: 'Last sign-in', v: d(person.last_sign_in_at) }, { k: 'Push devices', v: String(push_devices) }]} />
      </Panel>
      <Panel title="Team and club roles" source="team_memberships, club_memberships">
        <KeyValue rows={[...teams.map((t) => ({ k: t.name, v: <><Link href={`/admin/teams/${t.team_id}`}>{t.role}</Link> · {t.status}</> })), ...clubs.map((c) => ({ k: c.name, v: <><Link href={`/admin/clubs/${c.club_id}`}>{c.role}</Link> · {c.status}</> }))]} />
      </Panel>
      <Panel title="Households" source="households, household_members">
        <KeyValue rows={households.map((h) => ({ k: h.name, v: `${h.relationship} · ${h.members.join(', ')}` }))} />
      </Panel>
      <Panel title="Support notes" source="admin_notes">
        <Timeline items={notes.map((n) => ({ title: n.note, meta: `${n.author ?? 'Unknown'} · ${d(n.at)}` }))} empty="No notes yet." />
        <NoteForm subjectType="person" subjectId={id} />
      </Panel>
    </>
  );
}
