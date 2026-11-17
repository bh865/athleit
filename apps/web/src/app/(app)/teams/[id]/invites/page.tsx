'use client';

import styles from '@/components/app/app.module.css';
import { InvitePanel, type RoleOption } from '@/components/app/invite-panel';
import { useTeam } from '@/components/app/team-context';

const STAFF: RoleOption[] = [
  { value: 'coach', label: 'Coach' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];
const FAMILY: RoleOption[] = [{ value: 'parent', label: 'Parent' }];

export default function InvitesPage() {
  const { team, caps } = useTeam();
  if (!caps.has('invites.createFamily'))
    return <p className={styles.notice}>Only team staff can create invites.</p>;
  // Staff (coach/manager/admin) are added by invite link, and only team admins can mint those.
  const roles = caps.has('invites.createStaff') ? [...STAFF, ...FAMILY] : FAMILY;
  return (
    <section className={styles.stack}>
      <h2 className={styles.section}>Invite people</h2>
      <p className={styles.muted}>
        {caps.has('invites.createStaff')
          ? 'Coaches, managers and admins join only through an invite link you create here.'
          : 'You can invite parents. Only team admins can invite staff.'}
      </p>
      <InvitePanel target={{ teamId: team.id }} roles={roles} />
    </section>
  );
}
