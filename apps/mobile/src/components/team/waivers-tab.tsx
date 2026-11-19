import {
  friendlyError,
  matchesComplianceFilter,
  matchesQuery,
  remindable,
  shortDateLabel,
  summarizeCompliance,
  type ComplianceFilter,
} from '@athleit/core';
import {
  getWaiverCompliance,
  listWaiverReminders,
  listWaivers,
  remindWaiverSigners,
  setTeamRequiredWaiver,
} from '@athleit/db/registration';
import { componentTokens, space } from '@athleit/tokens';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { FormMessage } from '@/components/app/kit';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Icon,
  IconCircle,
  ListGroup,
  ListRow,
  SegmentedControl,
  Text,
  useTheme,
  useToast,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { ConfirmSheet, ListState, SearchField, StatTile, Tiles } from './parts';
import { useTeam } from './team-context';

const TONE = { signed: 'success', missing: 'danger', expired: 'warning' } as const;
const LABEL = { signed: 'Signed', missing: 'Missing', expired: 'Expired' } as const;

/** Waivers on mobile: read-only compliance with reminders, and the library with required toggles. Writing waivers is web-only. */
export function WaiversTab() {
  const [tab, setTab] = useState<'compliance' | 'library'>('compliance');
  return (
    <View style={{ gap: space[4] }}>
      <SegmentedControl
        label="Waivers"
        value={tab}
        options={[
          { value: 'compliance', label: 'Compliance' },
          { value: 'library', label: 'Library' },
        ]}
        onChange={setTab}
      />
      {tab === 'compliance' ? <Compliance onLibrary={() => setTab('library')} /> : <Library />}
    </View>
  );
}

function Compliance({ onLibrary }: { onLibrary: () => void }) {
  const { team, caps } = useTeam();
  const { theme } = useTheme();
  const toast = useToast();
  const manage = caps.has('registration.manage');
  const [tick, setTick] = useState(0);
  const rows = useLoad(() => getWaiverCompliance(supabase, team.id), [team.id, tick]);
  const reminders = useLoad(
    () =>
      manage
        ? listWaiverReminders(supabase, team.id)
        : Promise.resolve({ data: new Map<string, string>(), error: null }),
    [team.id, manage, tick],
  );
  const [filter, setFilter] = useState<ComplianceFilter>('needs');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ waiverId: string; title: string; n: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sum = summarizeCompliance(rows.data ?? []);
  const last = reminders.data ?? new Map<string, string>();

  async function send() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    const r = await remindWaiverSigners(supabase, team.id, { waiverId: confirm.waiverId });
    setBusy(false);
    setConfirm(null);
    if (r.error) return setError(friendlyError(r.error));
    toast(
      r.data === 0
        ? 'Already reminded in the last 24 hours'
        : `Reminded ${r.data} ${r.data === 1 ? 'guardian' : 'guardians'}`,
    );
    setTick((n) => n + 1);
  }

  return (
    <View style={{ gap: space[4] }}>
      <FormMessage error={error} />
      <ListState
        name="waiver status"
        loading={rows.loading}
        error={rows.error}
        onRetry={rows.reload}
        empty={{
          when: sum.total === 0,
          icon: 'shield-check',
          text: 'No required waivers yet. Mark a waiver as required in the Library.',
          action: <Button title="Open Library" variant="secondary" onPress={onLibrary} />,
        }}
      >
        <Tiles>
          <StatTile label="Signed" value={sum.signed} tone="ok" />
          <StatTile label="Expired" value={sum.expired} tone={sum.expired ? 'warn' : undefined} />
          <StatTile label="Missing" value={sum.missing} tone={sum.missing ? 'bad' : undefined} />
        </Tiles>
        {sum.expired + sum.missing === 0 ? (
          <Card style={{ alignItems: 'center', gap: space[2] }}>
            <IconCircle>
              <Icon name="check" />
            </IconCircle>
            <Text variant="bodyBold">Everyone is up to date</Text>
            <Text muted style={{ textAlign: 'center' }}>
              All {sum.total} required signatures are in. {sum.players} players, {sum.waivers}{' '}
              waivers.
            </Text>
          </Card>
        ) : (
          <Text variant="bodyBold">
            {sum.playersNeedingAttention}{' '}
            {sum.playersNeedingAttention === 1 ? 'player needs' : 'players need'} attention
          </Text>
        )}
        <SegmentedControl
          label="Waiver status"
          value={filter}
          options={[
            { value: 'needs', label: `Needs attention ${sum.expired + sum.missing}` },
            { value: 'all', label: `All ${sum.total}` },
            { value: 'signed', label: `Signed ${sum.signed}` },
          ]}
          onChange={setFilter}
        />
        <SearchField label="Search players" value={search} onChange={setSearch} />
        {sum.groups.map((g) => {
          const shown = g.rows.filter(
            (r) =>
              matchesComplianceFilter(r.state, filter) &&
              matchesQuery(search, `${r.first_name} ${r.last_name}`),
          );
          if (shown.length === 0 && (filter !== 'all' || search)) return null;
          const expanded = open[g.waiverId] ?? g.signed < g.total;
          const targets = remindable(g.rows, last);
          return (
            <Card key={g.waiverId} style={{ gap: space[3] }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen((o) => ({ ...o, [g.waiverId]: !expanded }))}
                style={{
                  minHeight: componentTokens.minTarget,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                }}
              >
                <Text variant="monoSm">
                  {g.signed}/{g.total}
                </Text>
                <Text variant="bodyBold" style={{ flex: 1 }}>
                  {g.title}
                </Text>
                <Icon
                  name={expanded ? 'caret-up' : 'caret-down'}
                  size="sm"
                  color={theme.color.muted}
                />
              </Pressable>
              {expanded ? (
                <>
                  {shown.map((r) => (
                    <View
                      key={`${r.player_id}-${r.waiver_id}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space[3],
                        minHeight: componentTokens.listRow.height,
                      }}
                    >
                      <Avatar name={`${r.first_name} ${r.last_name}`} size="sm" />
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyBold" numberOfLines={1}>
                          {r.first_name} {r.last_name}
                        </Text>
                        <Text variant="caption" muted>
                          {r.accepted_at
                            ? `Signed ${shortDateLabel(r.accepted_at)}`
                            : 'Never signed'}
                        </Text>
                      </View>
                      <Badge tone={TONE[r.state]}>{LABEL[r.state]}</Badge>
                    </View>
                  ))}
                  {manage && targets.length > 0 ? (
                    <Button
                      title={`Send reminder to ${targets.length}`}
                      icon="bell-ringing"
                      variant="secondary"
                      onPress={() =>
                        setConfirm({ waiverId: g.waiverId, title: g.title, n: targets.length })
                      }
                    />
                  ) : null}
                </>
              ) : null}
            </Card>
          );
        })}
      </ListState>
      <ConfirmSheet
        open={confirm !== null}
        title={`Remind ${confirm?.n ?? 0} ${confirm?.n === 1 ? 'guardian' : 'guardians'}?`}
        body={`We will email and push a signing reminder for ${confirm?.title ?? 'this waiver'}. Nobody gets more than one reminder a day.`}
        confirmLabel="Send reminders"
        busy={busy}
        onConfirm={() => void send()}
        onClose={() => setConfirm(null)}
      />
    </View>
  );
}

function Library() {
  const { team, caps } = useTeam();
  const { theme } = useTheme();
  const manage = caps.has('registration.manage');
  const [tick, setTick] = useState(0);
  const waivers = useLoad(() => listWaivers(supabase, { teamId: team.id }), [team.id, tick]);
  const required = useLoad(async () => {
    const { data, error } = await supabase
      .from('team_required_waivers')
      .select('waiver_id')
      .eq('team_id', team.id);
    return error
      ? { data: null, error: { message: error.message } }
      : { data: (data ?? []).map((r) => r.waiver_id), error: null };
  }, [team.id, tick]);
  const [error, setError] = useState<string | null>(null);
  const reqIds = new Set(required.data ?? []);

  async function toggle(id: string, on: boolean) {
    setError(null);
    const r = await setTeamRequiredWaiver(supabase, team.id, id, on);
    if (r.error) setError(friendlyError(r.error));
    setTick((n) => n + 1);
  }
  return (
    <View style={{ gap: space[3] }}>
      <FormMessage error={error} />
      <ListState
        name="waivers"
        loading={waivers.loading || required.loading}
        error={waivers.error ?? required.error}
        onRetry={() => setTick((n) => n + 1)}
        empty={{
          when: (waivers.data?.length ?? 0) === 0,
          icon: 'file-text',
          text: 'No waivers yet. Write one on the web.',
        }}
      >
        <ListGroup>
          {(waivers.data ?? []).map((w, i, a) => {
            const v = Math.max(0, ...w.waiver_versions.map((x) => x.version));
            const on = reqIds.has(w.id);
            return (
              <ListRow
                key={w.id}
                last={i === a.length - 1}
                leading={
                  <IconCircle>
                    <Icon name="file-text" />
                  </IconCircle>
                }
                title={w.title}
                subtitle={`${v > 0 ? `Published v${v}` : 'Draft'} · Updated ${shortDateLabel(w.updated_at)}`}
                trailing={
                  manage && v > 0 ? (
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityLabel={`Required: ${w.title}`}
                      accessibilityState={{ checked: on }}
                      onPress={() => void toggle(w.id, !on)}
                      style={{
                        minHeight: componentTokens.minTarget,
                        minWidth: componentTokens.minTarget,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon
                        name={on ? 'check-circle' : 'circle-dashed'}
                        weight={on ? 'fill' : 'regular'}
                        color={on ? theme.color.ok : theme.color.muted}
                      />
                      <Text variant="caption" muted>
                        Required
                      </Text>
                    </Pressable>
                  ) : on ? (
                    <Badge>Required</Badge>
                  ) : undefined
                }
              />
            );
          })}
        </ListGroup>
      </ListState>
      <Text variant="caption" muted>
        Edit on web: waivers are written on the web app. Parents read and sign on web and mobile.
      </Text>
    </View>
  );
}
