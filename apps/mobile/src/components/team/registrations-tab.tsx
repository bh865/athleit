import { matchesQuery, registrationPriceLabel } from '@athleit/core';
import {
  getCapacitySummary,
  listForms,
  listRegistrationEvents,
  type CapacitySummary,
} from '@athleit/db/registration';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Card,
  Icon,
  IconCircle,
  ListGroup,
  ListRow,
  SegmentedControl,
  Text,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { ListState, SearchField, ShowMore, StatTile, Tiles, useShowMore } from './parts';
import { useTeam } from './team-context';

type Tab = 'open' | 'draft' | 'closed';
const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

/** Registrations: events (Open / Draft / Closed) with counts and search, plus the Forms library. Authoring is web-only. */
export function RegistrationsTab() {
  const { team, caps } = useTeam();
  const router = useRouter();
  const manage = caps.has('registration.manage');
  const owner = { teamId: team.id };
  const events = useLoad(async () => {
    const res = await listRegistrationEvents(supabase, owner);
    if (res.error) return res;
    const open = res.data.filter((e) => e.status === 'open');
    const sums = await Promise.all(open.map((e) => getCapacitySummary(supabase, e.id)));
    const byId = new Map<string, CapacitySummary | null>();
    open.forEach((e, i) => byId.set(e.id, sums[i]?.data ?? null));
    return { data: { rows: res.data, byId }, error: null };
  }, [team.id]);
  const forms = useLoad(
    () => (manage ? listForms(supabase, owner) : Promise.resolve({ data: [], error: null })),
    [team.id, manage],
  );
  const [tab, setTab] = useState<Tab>('open');
  const [search, setSearch] = useState('');
  const rows = events.data?.rows ?? [];
  const group = (e: { status: string }): Tab =>
    e.status === 'open' ? 'open' : e.status === 'draft' ? 'draft' : 'closed';
  const counts = { open: 0, draft: 0, closed: 0 } as Record<Tab, number>;
  for (const e of rows) counts[group(e)] += 1;
  const sum = (pick: (s: CapacitySummary) => number) =>
    [...(events.data?.byId.values() ?? [])].reduce((n, s) => n + (s ? pick(s) : 0), 0);
  const shown = rows.filter((e) => group(e) === tab && matchesQuery(search, e.title));
  const page = useShowMore(shown, `${tab}|${search}`);

  return (
    <View style={{ gap: space[4] }}>
      <Tiles>
        <StatTile
          label="To review"
          value={sum((s) => s.submitted + s.pending_verification)}
          tone="warn"
        />
        <StatTile label="Waitlisted" value={sum((s) => s.waitlisted)} note="across events" />
        <StatTile label="Accepted" value={sum((s) => s.accepted)} note="not yet placed" />
        <StatTile label="Open events" value={counts.open} note={`of ${rows.length} total`} />
      </Tiles>
      <SegmentedControl
        label="Registration status"
        value={tab}
        options={(['open', 'draft', 'closed'] as const).map((t) => ({
          value: t,
          label: `${t.charAt(0).toUpperCase()}${t.slice(1)} ${counts[t]}`,
        }))}
        onChange={setTab}
      />
      <SearchField label="Search registrations" value={search} onChange={setSearch} />
      <ListState
        name="registrations"
        loading={events.loading}
        error={events.error}
        onRetry={events.reload}
        empty={{
          when: rows.length === 0,
          icon: 'clipboard-text',
          text: manage
            ? 'No registrations yet. Create one on the web: building events and forms is web-only.'
            : 'No registrations yet.',
        }}
      >
        {shown.length === 0 ? (
          <Text muted>
            No {tab} registrations{search ? ' match that search' : ''}.
          </Text>
        ) : (
          <ListGroup testID="registration-events">
            {page.items.map((e, i) => {
              const s = events.data?.byId.get(e.id);
              const toReview = s ? s.submitted + s.pending_verification : 0;
              return (
                <ListRow
                  key={e.id}
                  last={i === page.items.length - 1}
                  title={e.title}
                  subtitle={[
                    date(e.opens_at) ? `Opens ${date(e.opens_at)}` : null,
                    date(e.closes_at) ? `closes ${date(e.closes_at)}` : null,
                    registrationPriceLabel(e.price_cents),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    s ? (
                      <View style={{ alignItems: 'flex-end', gap: space[1] }}>
                        <Text variant="monoSm">
                          {s.taken}
                          {s.capacity > 0 ? ` of ${s.capacity}` : ''}
                        </Text>
                        {toReview > 0 ? (
                          <Badge tone="warning">{`${toReview} to review`}</Badge>
                        ) : null}
                      </View>
                    ) : null
                  }
                  onPress={() => router.push(`/manage/registration/${e.id}` as never)}
                />
              );
            })}
          </ListGroup>
        )}
        <ShowMore
          total={page.total}
          shown={page.items.length}
          remaining={page.remaining}
          onMore={page.more}
        />
      </ListState>
      {manage ? (
        <Card style={{ gap: space[3] }}>
          <Text variant="heading">Forms library</Text>
          <ListState
            name="forms"
            loading={forms.loading}
            error={forms.error}
            onRetry={forms.reload}
            empty={{
              when: (forms.data?.length ?? 0) === 0,
              icon: 'clipboard-text',
              text: 'No forms yet. A form is the set of questions parents answer.',
            }}
          >
            <ListGroup>
              {(forms.data ?? []).map((f, i, a) => (
                <ListRow
                  key={f.id}
                  last={i === a.length - 1}
                  leading={
                    <IconCircle>
                      <Icon name="clipboard-text" />
                    </IconCircle>
                  }
                  title={f.name}
                  subtitle={f.form_versions.length > 0 ? 'Published' : 'Draft only'}
                />
              ))}
            </ListGroup>
          </ListState>
          <Text variant="caption" muted>
            Create and edit registrations and forms on the web.
          </Text>
        </Card>
      ) : null}
    </View>
  );
}
