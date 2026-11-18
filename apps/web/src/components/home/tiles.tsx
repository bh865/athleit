'use client';

import { describeEventTime } from '@athleit/core';
import { getJoinRequests, type Result } from '@athleit/db/api';
import {
  getCapacitySummary,
  getWaiverCompliance,
  listMyRegistrations,
  listRegistrationEvents,
} from '@athleit/db/registration';
import {
  getHouseholdScheduleRange,
  getTeamRecord,
  getTeamScheduleRange,
} from '@athleit/db/scheduling';
import Link from 'next/link';

import { Badge, Icon, Text } from '@/components/ui';
import { useViewerZone } from '@/components/schedule/use-viewer-zone';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './home.module.css';
import { TileShell } from './tile-shell';

const DAY = 24 * 60 * 60 * 1000;
const RSVP_LABEL: Record<string, string> = {
  going: 'Going',
  not_going: 'Can’t go',
  maybe: 'Maybe',
};

/** "This week": the next 7 days. Staff see the team's events with RSVP counts; families see each child's RSVP. */
export function WeekTile({
  teamId,
  staff,
  family,
}: {
  teamId: string | null;
  staff: boolean;
  family: boolean;
}) {
  const zone = useViewerZone();
  const res = useLoad(async () => {
    const from = new Date();
    const to = new Date(from.getTime() + 7 * DAY);
    if (staff && teamId) {
      const r = await getTeamScheduleRange(
        getClient(),
        teamId,
        from.toISOString(),
        to.toISOString(),
      );
      if (r.error) return r;
      return {
        data: r.data.map((e) => ({
          key: e.id,
          id: e.id,
          title: e.title,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          timezone: e.timezone,
          cancelled: e.status === 'cancelled',
          reason: e.cancelled_reason,
          meta:
            e.status === 'cancelled' ? 'Cancelled' : `${e.going} going · ${e.no_reply} no reply`,
          who: '',
        })),
        error: null,
      };
    }
    const r = await getHouseholdScheduleRange(getClient(), from.toISOString(), to.toISOString());
    if (r.error) return r;
    return {
      data: r.data.map((e) => ({
        key: `${e.event_id}:${e.player_id}`,
        id: e.event_id,
        title: e.title,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        timezone: e.timezone,
        cancelled: e.status === 'cancelled',
        reason: e.cancelled_reason,
        meta:
          e.status === 'cancelled'
            ? 'Cancelled'
            : e.rsvp_status
              ? (RSVP_LABEL[e.rsvp_status] ?? e.rsvp_status)
              : 'No reply',
        who: e.player_first_name,
      })),
      error: null,
    };
  }, [teamId, staff, family]);
  const rows = (res.data ?? []).slice(0, 6);
  return (
    <TileShell
      id="home-week"
      title="This week"
      href="/schedule"
      linkLabel="See full schedule"
      res={res}
      empty={rows.length === 0}
      hasData={res.data !== null}
    >
      <ul className={styles.threads}>
        {rows.map((e) => {
          const t = describeEventTime(e.starts_at, e.ends_at, e.timezone, zone ?? 'UTC');
          return (
            <li key={e.key}>
              <Link href={`/events/${e.id}`} className={styles.thread}>
                <span className={styles.threadText}>
                  <span className={styles.threadTitle}>
                    {t.weekdayShort} {t.startLabel} · {e.title}
                  </span>
                  <span className={styles.threadPreview}>
                    {e.who ? `${e.who}: ` : ''}
                    {e.meta}
                    {e.cancelled && e.reason ? ` · ${e.reason}` : ''}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </TileShell>
  );
}

/** Season record and the last result. Hidden until a game has been played. */
export function RecordTile({ teamId }: { teamId: string }) {
  const res = useLoad(() => getTeamRecord(getClient(), teamId), [teamId]);
  const r = res.data;
  return (
    <TileShell
      id="home-record"
      title="Team record"
      href="/schedule"
      res={res}
      empty={!r || r.games === 0}
      hasData={r !== null}
    >
      {r ? (
        <>
          <div
            className={styles.stats}
            role="group"
            aria-label={`Record ${r.wins} wins, ${r.losses} losses, ${r.ties} ties`}
          >
            {[
              { v: r.wins, l: 'Wins' },
              { v: r.losses, l: 'Losses' },
              { v: r.ties, l: 'Ties' },
            ].map((c) => (
              <div key={c.l} className={styles.count}>
                <span className={styles.countValue}>{c.v}</span>
                <span className={styles.countLabel}>{c.l}</span>
              </div>
            ))}
          </div>
          <Text variant="caption" muted>
            {r.season_label}
          </Text>
        </>
      ) : null}
    </TileShell>
  );
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
        <ul className={styles.threads}>
          {d?.own.map((o, i) => (
            <li key={`${o.name}${i}`}>
              <Link href="/registrations" className={styles.thread}>
                <Icon name="clipboard-text" size="sm" />
                <span className={styles.threadText}>
                  <span className={styles.threadTitle}>Sign {o.name}’s waiver</span>
                  <span className={styles.threadPreview}>{o.event}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
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
      href={`/teams/${teamId}/requests`}
      linkLabel="Approve or decline"
      res={res}
      empty={pending.length === 0}
      hasData={res.data !== null}
    >
      <ul className={styles.threads}>
        {pending.slice(0, 3).map((r) => (
          <li key={r.id}>
            <Link href={`/teams/${teamId}/requests`} className={styles.thread}>
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
