'use client';

import { previewOf, sumCents, type AppContext } from '@athleit/core';
import {
  getNotificationFailures,
  getRoster,
  getThreadList,
  listChildren,
  type Result,
} from '@athleit/db/api';
import { getConnectedAccountStatus, getHouseholdPayments } from '@athleit/db/payments';
import { listDocuments } from '@athleit/db/registration';
import { getFeedTokenStatus, getNextUp } from '@athleit/db/scheduling';
import Link from 'next/link';

import { Amount, dueText } from '@/components/payments/money';
import { Badge, ButtonLink, Icon, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './home.module.css';
import { TileShell } from './tile-shell';

/** Latest announcement in the team's announcement thread. Read counts are staff-only and not shown here. */
export function AnnouncementTile({ teamId }: { teamId: string }) {
  const res = useLoad(() => getThreadList(getClient(), teamId), [teamId]);
  const row = (res.data ?? []).find((t) => t.type === 'announcement' && t.last_body !== null);
  return (
    <TileShell
      id="home-announcement"
      title="Latest announcement"
      href={row ? `/messages/${row.thread_id}` : '/messages'}
      res={res}
      empty={!row}
      hasData={res.data !== null}
    >
      {row ? (
        <Text as="p">
          {previewOf({
            body: row.last_body ?? '',
            deleted: row.last_deleted,
            hidden: row.last_hidden,
          })}
        </Text>
      ) : null}
    </TileShell>
  );
}

/** Pinned or recent documents. Read-only for families; uploading lives on the documents page. */
export function DocumentsTile({ teamId }: { teamId: string }) {
  const res = useLoad(() => listDocuments(getClient(), { teamId }), [teamId]);
  const docs = [...(res.data ?? [])]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    .slice(0, 3);
  return (
    <TileShell
      id="home-documents"
      title="Documents"
      href={`/teams/${teamId}/documents`}
      res={res}
      empty={docs.length === 0}
      hasData={res.data !== null}
    >
      <ul className={styles.threads}>
        {docs.map((d) => (
          <li key={d.id}>
            <Link href={`/teams/${teamId}/documents`} className={styles.thread}>
              <Icon name="file-text" size="sm" />
              <span className={styles.threadText}>
                <span className={styles.threadTitle}>{d.title}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </TileShell>
  );
}

/** My children: first names and the teams they are on. */
export function FamilyTile() {
  const res = useLoad(() => listChildren(getClient()), []);
  const kids = res.data ?? [];
  return (
    <TileShell
      id="home-family"
      title="My children"
      href="/family"
      linkLabel="Manage"
      res={res}
      empty={kids.length === 0}
      hasData={res.data !== null}
    >
      <ul className={styles.threads}>
        {kids.slice(0, 4).map((k) => (
          <li key={k.id}>
            <Link href={`/family/children/${k.id}`} className={styles.thread}>
              <span className={styles.threadText}>
                <span className={styles.threadTitle}>{k.first_name}</span>
                <span className={styles.threadPreview}>
                  {(k.team_players ?? [])
                    .map((tp) => tp.teams?.name)
                    .filter(Boolean)
                    .join(', ') || 'Not on a team yet'}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </TileShell>
  );
}

/** Payout account status: an icon and a word, never colour alone. Coach and manager see status only. */
export function PayoutsTile({ owner }: { owner: { teamId?: string; clubId?: string } }) {
  const res = useLoad(
    () => getConnectedAccountStatus(getClient(), owner),
    [owner.teamId, owner.clubId],
  );
  const s = res.data;
  const ready = Boolean(s?.charges_enabled && s?.payouts_enabled);
  return (
    <TileShell
      id="home-payouts"
      title="Payouts"
      href="/pay"
      res={res}
      empty={false}
      hasData={res.data !== null || !res.loading}
    >
      {ready ? (
        <Badge tone="success">Ready</Badge>
      ) : s?.exists_account ? (
        <Badge tone="warning">Needs information</Badge>
      ) : (
        <Badge tone="warning">Not set up</Badge>
      )}
    </TileShell>
  );
}

/** Families can subscribe once; the tile disappears after the first feed link exists. */
export function CalendarTile() {
  const res = useLoad(() => getFeedTokenStatus(getClient()), []);
  return (
    <TileShell
      id="home-calendar"
      title="Add to your calendar"
      href="/schedule"
      linkLabel="Get link"
      res={res}
      empty={(res.data ?? []).length > 0}
      hasData={res.data !== null}
    >
      <Text muted as="p">
        One link keeps games and practices in sync with your phone calendar.
      </Text>
    </TileShell>
  );
}

/** Admin only: failed notification deliveries. Hidden when there are none. */
export function NotificationHealthTile({ teamId }: { teamId: string }) {
  const res = useLoad(() => getNotificationFailures(getClient(), teamId), [teamId]);
  const n = (res.data ?? []).length;
  return (
    <TileShell
      id="home-notification-health"
      title="Notification health"
      href="/notifications/settings"
      res={res}
      empty={n === 0}
      hasData={res.data !== null}
    >
      <Badge tone="danger">{`${n} failed ${n === 1 ? 'delivery' : 'deliveries'}`}</Badge>
    </TileShell>
  );
}

/** New-team checklist for admins and managers. Dismisses itself once everything is done. */
export function SetupTile({ teamId }: { teamId: string }) {
  const res = useLoad(async (): Promise<Result<{ players: number; events: number }>> => {
    const c = getClient();
    const [r, n] = await Promise.all([getRoster(c, teamId), getNextUp(c, 20)]);
    if (r.error) return r;
    if (n.error) return n;
    return {
      data: { players: r.data.length, events: n.data.filter((e) => e.team_id === teamId).length },
      error: null,
    };
  }, [teamId]);
  const d = res.data;
  const steps = [
    { done: (d?.players ?? 0) > 0, label: 'Add your first player', href: '/roster' },
    { done: (d?.events ?? 0) > 0, label: 'Schedule your first event', href: '/schedule' },
    { done: false, label: 'Invite families', href: `/teams/${teamId}/invites` },
  ];
  const open = steps.filter((s) => !s.done);
  // "Invite families" cannot be detected; show it only while the first two are open.
  const visible = steps.slice(0, 2).some((s) => !s.done) ? open : [];
  return (
    <TileShell
      id="home-setup"
      title="Set up your team"
      res={res}
      empty={visible.length === 0}
      hasData={d !== null}
    >
      <ul className={styles.threads}>
        {visible.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className={styles.thread}>
              <Icon name="list-checks" size="sm" />
              <span className={styles.threadText}>
                <span className={styles.threadTitle}>{s.label}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </TileShell>
  );
}

/** Two or more places: quick jumps. Hidden with a single place. */
export function PlacesTile({
  places,
}: {
  places: readonly Pick<AppContext, 'key' | 'title' | 'subtitle' | 'kind' | 'id'>[];
}) {
  if (places.length < 2) return null;
  const href = (p: { kind: string; id: string }) =>
    p.kind === 'team' ? `/teams/${p.id}` : p.kind === 'club' ? `/clubs/${p.id}` : '/family';
  return (
    <TileShell
      id="home-places"
      title="Your places"
      res={{ loading: false, error: null, reload: () => undefined }}
      empty={false}
      hasData
    >
      <ul className={styles.threads}>
        {places.slice(0, 5).map((p) => (
          <li key={p.key}>
            <Link href={href(p)} className={styles.thread}>
              <span className={styles.threadText}>
                <span className={styles.threadTitle}>{p.title}</span>
                <span className={styles.threadPreview}>{p.subtitle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </TileShell>
  );
}

/** Amount due for the family: big mono total, what it is for, when, and one Pay button. */
export function DueTile({ id }: { id: string }) {
  const res = useLoad(() => getHouseholdPayments(getClient()), []);
  const due = (res.data ?? []).filter((r) => r.can_pay);
  const first = [...due].sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
  const total = sumCents(due.map((r) => r.amount_cents));
  return (
    <TileShell id={id} title="Amount due" res={res} empty={!first} hasData={res.data !== null}>
      {first ? (
        <div className={styles.amount} data-testid="due-card">
          <Badge tone="neutral">{`${due.length} request${due.length === 1 ? '' : 's'}`}</Badge>
          <Amount cents={total} variant="monoLg" label="Amount due" />
          <Text variant="caption" muted>
            {due.length === 1
              ? `${first.title}${first.player_first_name ? ` · ${first.player_first_name}` : ''}`
              : `${due.length} payments`}{' '}
            · due {dueText(first.due_at)}
          </Text>
          <ButtonLink href="/pay">Pay {`$${(total / 100).toFixed(2)}`}</ButtonLink>
        </div>
      ) : null}
    </TileShell>
  );
}
