import { listAdmins } from '@athleit/db/admin';

import { AddAdmin, AdminRowActions } from '@/components/admin/admins-client';
import { DataTable, PageTitle, StatusPill, type Column } from '@/components/admin/kit';
import { ErrorState } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { createClient } from '@/lib/supabase/server';

export default async function AdminsPage() {
  const ctx = await getAdminContext('owner');
  const res = await listAdmins(await createClient());
  if (res.error)
    return (
      <>
        <PageTitle title="Admins" />
        <ErrorState message="Couldn’t load admins. Nothing was changed." />
      </>
    );
  type R = (typeof res.data.items)[number];
  const cols: Column<R>[] = [
    { key: 'name', header: 'Name', cell: (r) => r.name },
    { key: 'email', header: 'Email', cell: (r) => r.email ?? '—' },
    { key: 'role', header: 'Role', cell: (r) => r.role },
    {
      key: 'mfa',
      header: 'Two-step verification',
      cell: (r) => (
        <StatusPill tone={r.mfa_enrolled ? 'ok' : 'warn'}>
          {r.mfa_enrolled ? 'Set up' : 'Not set up'}
        </StatusPill>
      ),
    },
    {
      key: 'since',
      header: 'Since',
      cell: (r) =>
        new Date(r.since).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <AdminRowActions profileId={r.profile_id} name={r.name} current={r.role} role={ctx.role} />
      ),
    },
  ];
  return (
    <>
      <PageTitle
        title="Admins"
        sub="At least one owner must always exist."
        actions={<AddAdmin role={ctx.role} />}
      />
      <DataTable
        caption="Platform admins"
        columns={cols}
        rows={res.data.items}
        rowKey={(r) => r.profile_id}
        buildHref={() => '/admin/admins'}
      />
    </>
  );
}
