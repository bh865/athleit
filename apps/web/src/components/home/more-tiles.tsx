'use client';

import { sumCents, teamTabHref } from '@athleit/core';
import { getPhotoUrl, getRoster, listChildren, type Result } from '@athleit/db/api';
import {
  getCollectionSummary,
  getHouseholdPayments,
  listPaymentEvents,
  type Owner,
} from '@athleit/db/payments';
import { listDocuments } from '@athleit/db/registration';
import { getNextUp } from '@athleit/db/scheduling';
import Link from 'next/link';

import { Amount, dueText } from '@/components/payments/money';
import { Avatar, Badge, ButtonLink, Icon, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './home.module.css';
import { TileShell } from './tile-shell';

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
function ChildRow({
  child,
}: {
  child: {
    id: string;
    first_name: string;
    photo_path?: string | null;
    team_players?: { teams?: { name: string } | null }[] | null;
  };
}) {
  const path = child.photo_path ?? null;
  const photo = useLoad(
    () =>
      path
        ? getPhotoUrl(getClient(), path)
        : Promise.resolve({ data: null, error: null } as Result<string | null>),
    [path],
  );
  return (
    <Link href={`/family/children/${child.id}`} className={styles.thread}>
      <Avatar name={child.first_name} size="md" src={photo.data} />
      <span className={styles.threadText}>
        <span className={styles.threadTitle}>{child.first_name}</span>
        <span className={styles.threadPreview}>
          {(child.team_players ?? [])
            .map((tp) => tp.teams?.name)
            .filter(Boolean)
            .join(', ') || 'Not on a team yet'}
        </span>
      </span>
    </Link>
  );
}

export function FamilyTile() {
  const res = useLoad(() => listChildren(getClient()), []);
  const kids = res.data ?? [];
  return (
    <TileShell
      id="home-family"
      title="My children"
      res={res}
      empty={kids.length === 0}
      hasData={res.data !== null}
    >
      <ul className={styles.threads}>
        {kids.slice(0, 4).map((k) => (
          <li key={k.id}>
            <ChildRow child={k} />
          </li>
        ))}
      </ul>
      <ButtonLink href="/family" variant="secondary" className={styles.bottomButton}>
        View family
      </ButtonLink>
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
    { done: false, label: 'Invite families', href: teamTabHref(teamId, 'people', 'invites') },
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

/** Staff: what is still owed across open requests, styled like Amount due. Hidden when nothing is open. */
export function OutstandingTile({ owner }: { owner: Owner }) {
  const res = useLoad(async (): Promise<
    Result<{ outstanding: number; expected: number; collected: number; count: number }>
  > => {
    const c = getClient();
    const events = await listPaymentEvents(c, owner);
    if (events.error) return events;
    const open = events.data.filter((e) => e.status === 'published').slice(0, 10);
    const sums = await Promise.all(open.map((e) => getCollectionSummary(c, e.id)));
    const rows = sums.flatMap((s) => (s.data ? [s.data] : []));
    return {
      data: {
        outstanding: sumCents(rows.map((r) => Number(r.outstanding_cents))),
        expected: sumCents(rows.map((r) => Number(r.expected_cents))),
        collected: sumCents(rows.map((r) => Number(r.collected_cents))),
        count: open.length,
      },
      error: null,
    };
  }, [owner.teamId, owner.clubId]);
  const d = res.data;
  const pct = d && d.expected > 0 ? Math.min(100, Math.floor((d.collected * 100) / d.expected)) : 0;
  return (
    <TileShell
      id="home-payments"
      title="Outstanding payments"
      res={res}
      empty={!d || d.count === 0}
      hasData={d !== null}
    >
      {d ? (
        <div className={styles.amount} data-testid="payments-card">
          <Badge tone="neutral">{`${d.count} open request${d.count === 1 ? '' : 's'}`}</Badge>
          <Amount cents={d.outstanding} variant="monoLg" label="Outstanding" />
          <div
            className={styles.bar}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Collected"
          >
            <span className={styles.barFill} style={{ width: `${pct}%` }} />
          </div>
          <Text variant="caption" muted>
            {pct}% collected
          </Text>
          <ButtonLink href="/pay" variant="secondary">
            View payments
          </ButtonLink>
        </div>
      ) : null}
    </TileShell>
  );
}
