'use client';

import { teamTabHref } from '@athleit/core';
import { getJoinRequests, type Result } from '@athleit/db/api';
import {
  getCapacitySummary,
  getWaiverCompliance,
  listMyRegistrations,
  listRegistrationEvents,
} from '@athleit/db/registration';
import { getTeamRecord, getTeamSchedule } from '@athleit/db/scheduling';
import Link from 'next/link';

import { Badge, ButtonLink, Icon, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './home.module.css';
import { TileShell } from './tile-shell';

/** Season record shown big beside Next up, with the last result. Hidden until a game has been played. */
export function RecordTile({ teamId }: { teamId: string }) {
  const res = useLoad(async (): Promise<Result<RecordView | null>> => {
    const c = getClient();
    const [rec, past] = await Promise.all([
      getTeamRecord(c, teamId),
      getTeamSchedule(c, teamId, 'past', 10),
    ]);
    if (rec.error) return rec;
    if (!rec.data) return { data: null, error: null };
    const last = (past.data ?? []).find(
      (e) =>
        e.type === 'game' &&
        e.status !== 'cancelled' &&
        e.our_score != null &&
        e.their_score != null,
    );
    return {
      data: {
        record: rec.data,
        last: last
          ? {
              outcome:
                last.our_score! > last.their_score!
                  ? 'W'
                  : last.our_score! < last.their_score!
                    ? 'L'
                    : 'T',
              score: `${last.our_score}–${last.their_score}`,
              opponent: last.opponent_name ?? '',
              when: new Date(last.starts_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              }),
            }
          : null,
      },
      error: null,
    };
  }, [teamId]);
  const r = res.data?.record;
  const last = res.data?.last;
  return (
    <TileShell
      id="home-record"
      title={r ? `${r.season_label} · Record` : 'Team record'}
      href="/schedule"
      res={res}
      empty={!r || r.games === 0}
      hasData={r !== undefined}
    >
      {r ? (
        <>
          <span
            className={styles.record}
            aria-label={`${r.wins} wins, ${r.losses} losses, ${r.ties} ties`}
          >
            {r.wins}–{r.losses}–{r.ties}
          </span>
          <Text variant="caption" muted>
            Wins · Losses · Ties
          </Text>
          {last ? (
            <div className={styles.lastResult}>
              <span className={styles.pill}>
                {last.outcome} {last.score}
              </span>
              <Text variant="caption" muted>
                {last.opponent ? `vs. ${last.opponent} · ` : ''}
                {last.when}
              </Text>
            </div>
          ) : null}
        </>
      ) : null}
    </TileShell>
  );
}

interface RecordView {
  record: { wins: number; losses: number; ties: number; games: number; season_label: string };
  last: { outcome: string; score: string; opponent: string; when: string } | null;
}

interface WaiverView {
  mode: 'staff' | 'family';
  signed: number;
  open: { name: string; status: string }[];
  own: { name: string; event: string }[];
}

/**
 * Waivers and compliance. Families see their own registrations that still need a waiver; staff see counts and
 * first names only. Never signed text or medical answers.
 */
export function WaiversTile({
  teamId,
  staff,
  family,
}: {
  teamId: string | null;
  staff: boolean;
  family: boolean;
}) {
  const res = useLoad(async (): Promise<Result<WaiverView | null>> => {
    if (staff && teamId) {
      const r = await getWaiverCompliance(getClient(), teamId);
      if (r.error) return r;
      return {
        data: {
          mode: 'staff',
          signed: r.data.filter((w) => w.status === 'signed').length,
          open: r.data
            .filter((w) => w.status !== 'signed')
            .map((w) => ({ name: w.first_name, status: w.status })),
          own: [] as { name: string; event: string }[],
        },
        error: null,
      };
    }
    if (family) {
      const r = await listMyRegistrations(getClient());
      if (r.error) return r;
      return {
        data: {
          mode: 'family',
          signed: 0,
          open: [] as { name: string; status: string }[],
          own: r.data
            .filter((x) => x.next_step === 'sign_waivers')
            .map((x) => ({ name: x.player_first_name ?? 'Player', event: x.event_title })),
        },
        error: null,
      };
    }
    return { data: null, error: null };
  }, [teamId, staff, family]);
  const d = res.data;
  const empty = !d || (d.mode === 'staff' ? d.open.length === 0 : d.own.length === 0);
  return (
    <TileShell
      id="home-waivers"
      title="Waivers"
      href="/registrations"
      res={res}
      empty={empty}
      hasData={d !== null}
    >
      {d?.mode === 'staff' ? (
        <>
          <div className={styles.stats}>
            <div className={styles.count}>
              <span className={styles.countValue}>{d.signed}</span>
              <span className={styles.countLabel}>Signed</span>
            </div>
            <div className={styles.count}>
              <span className={styles.countValue}>{d.open.length}</span>
              <span className={styles.countLabel}>Missing</span>
            </div>
          </div>
          <ul className={styles.threads}>
            {d.open.slice(0, 4).map((w, i) => (
              <li key={`${w.name}${i}`}>
                <Badge tone={w.status === 'expired' ? 'warning' : 'danger'}>
                  {w.name} · {w.status === 'expired' ? 'Expired' : 'Missing'}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className={styles.threads}>
          {d?.own.slice(0, 2).map((o, i) => (
            <div key={`${o.name}${i}`} className={styles.block}>
              <div className={styles.blockHead}>
                <Icon name="warning" weight="fill" />
                <div>
                  <Text variant="bodyBold" as="div">
                    {o.name}’s waiver needs signing
                  </Text>
                  <Text variant="caption" muted as="div">
                    {o.event}
                  </Text>
                </div>
              </div>
              <ButtonLink href="/registrations">
                <Icon name="pencil" size="sm" /> Sign waiver
              </ButtonLink>
            </div>
          ))}
        </div>
      )}
    </TileShell>
  );
}

/** Join requests the person can decide. Names are staff-only data already; only the first lines show here. */
export function ApprovalsTile({ teamId }: { teamId: string }) {
  const res = useLoad(() => getJoinRequests(getClient(), teamId), [teamId]);
  const pending = (res.data ?? []).filter((r) => r.status === 'pending');
  return (
    <TileShell
      id="home-approvals"
      title={`Join requests${pending.length ? ` · ${pending.length}` : ''}`}
      href={teamTabHref(teamId, 'people', 'requests')}
      linkLabel="Approve or decline"
      res={res}
      empty={pending.length === 0}
      hasData={res.data !== null}
    >
      <ul className={styles.threads}>
        {pending.slice(0, 3).map((r) => (
          <li key={r.id}>
            <Link href={teamTabHref(teamId, 'people', 'requests')} className={styles.thread}>
              <span className={styles.threadText}>
                <span className={styles.threadTitle}>{r.requester_name}</span>
                <span className={styles.threadPreview}>Parent of {r.player_first_name}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </TileShell>
  );
}

interface RegView {
  rows: { id: string; title: string; line: string }[];
}

/** Registrations: staff see capacity across open events; families see their own status. */
export function RegistrationsTile({ teamId, staff }: { teamId: string | null; staff: boolean }) {
  const res = useLoad(async (): Promise<Result<RegView>> => {
    const c = getClient();
    if (staff && teamId) {
      const events = await listRegistrationEvents(c, { teamId });
      if (events.error) return events;
      const open = events.data.filter((e) => e.status === 'open').slice(0, 5);
      const sums = await Promise.all(open.map((e) => getCapacitySummary(c, e.id)));
      return {
        data: {
          rows: open.map((e, i) => ({
            id: e.id,
            title: e.title,
            line: sums[i]?.data
              ? `${sums[i]!.data!.submitted} submitted · ${sums[i]!.data!.accepted} accepted`
              : 'Open',
          })),
        },
        error: null,
      };
    }
    const mine = await listMyRegistrations(c);
    if (mine.error) return mine;
    return {
      data: {
        rows: mine.data.slice(0, 3).map((r) => ({
          id: r.id,
          title: r.event_title,
          line: `${r.player_first_name ?? 'Player'} · ${r.status}`,
        })),
      },
      error: null,
    };
  }, [teamId, staff]);
  const rows = res.data?.rows ?? [];
  return (
    <TileShell
      id="home-registrations"
      title="Registrations"
      href="/registrations"
      res={res}
      empty={rows.length === 0}
      hasData={res.data !== null}
    >
      <ul className={styles.threads}>
        {rows.map((r) => (
          <li key={r.id}>
            <Link href="/registrations" className={styles.thread}>
              <span className={styles.threadText}>
                <span className={styles.threadTitle}>{r.title}</span>
                <span className={styles.threadPreview}>{r.line}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </TileShell>
  );
}
