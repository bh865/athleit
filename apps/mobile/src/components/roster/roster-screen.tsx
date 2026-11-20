import {
  ROSTER_SORTS,
  ROSTER_STATUS_FILTERS,
  ageLabel,
  filterRoster,
  fullName,
  playerCountLabel,
  positionOptions,
  rosterCounts,
  rosterRowSpoken,
  sortRoster,
  type RosterSort,
  type RosterStatusFilter,
} from '@athleit/core';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Heading,
  Icon,
  ListGroup,
  ListRow,
  LoadingSkeleton,
  Text,
  TextField,
  useTheme,
  useToast,
} from '@/components/ui';

import { AddSheet } from './add-sheet';
import { Jersey, PickChip, StatusMark } from './parts';
import { PlayerAvatar } from './player-avatar';
import { PlayerSheet } from './player-sheet';
import { useRosterData } from './use-roster-data';

/**
 * Roster screen (More > Roster). Staff and club admins get the list with a player sheet; parents and
 * players get the squad grid (first names only). Capabilities decide what shows; the database decides
 * what is returned (docs/permissions.md).
 */
export function RosterScreen() {
  const { team, caps, rows, ready, facts, roster, reloadAll } = useRosterData();
  const router = useRouter();
  const toast = useToast();
  const full = caps.has('roster.viewFull');
  const canPlace = caps.has('roster.place');
  const canEdit = caps.has('roster.edit');
  const positions = positionOptions(team.sport);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RosterStatusFilter>('active');
  const [sort, setSort] = useState<RosterSort>('jersey');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ playerId: string | null } | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(null), 3000);
    return () => clearTimeout(t);
  }, [justAdded]);

  const selected = rows.find((r) => r.team_player_id === selectedId) ?? null;
  const visible = sortRoster(filterRoster(rows, { query, status: full ? status : 'active' }), sort);
  const counts = rosterCounts(rows, canPlace ? ready.length : 0);
  const subtitle = `${team.name}${team.season_label ? ` · ${team.season_label}` : ''}`;
  const openPeople = (view: 'requests' | 'invites') =>
    router.push(`/teams/${team.id}?section=people&view=${view}` as never);

  const header = (
    <View style={{ gap: space[3] }}>
      <Text muted>{subtitle}</Text>
      {canPlace && (
        <View style={{ gap: space[2] }}>
          <Button
            title="Add player"
            icon="plus"
            variant={selected || adding ? 'secondary' : 'primary'}
            disabled={ready.length === 0}
            onPress={() => {
              setSelectedId(null);
              setAdding({ playerId: null });
            }}
          />
          {ready.length === 0 && (
            <Text variant="caption" muted>
              Approve a join request first.{' '}
              <Text
                variant="caption"
                accessibilityRole="link"
                onPress={() => openPeople('requests')}
                style={{ textDecorationLine: 'underline' }}
              >
                Review requests
              </Text>
            </Text>
          )}
        </View>
      )}
    </View>
  );

  if (roster.loading && rows.length === 0)
    return (
      <View style={{ gap: space[4] }}>
        {header}
        <LoadingSkeleton rows={5} />
      </View>
    );
  if (roster.error)
    return (
      <View style={{ gap: space[4] }}>
        {header}
        <ErrorState
          message="Can’t load the roster. Check your connection. Nothing was changed."
          onRetry={roster.reload}
        />
      </View>
    );

  const search = (
    <TextField
      label="Search players"
      placeholder="Search by name or number"
      value={query}
      onChangeText={setQuery}
      autoCorrect={false}
      returnKeyType="search"
    />
  );
  const noResults = (
    <EmptyState
      icon="magnifying-glass"
      title={query.trim() ? `No players match “${query.trim()}”` : 'No players found'}
      body="Try a name or a jersey number."
      action={
        <Button
          title="Clear search"
          variant="secondary"
          onPress={() => {
            setQuery('');
            if (full) setStatus('all');
          }}
        />
      }
    />
  );

  // Parents and players: squad grid ----------------------------------------------------------------
  if (!full)
    return (
      <View style={{ gap: space[4] }}>
        {header}
        {rows.length === 0 ? (
          <EmptyState icon="users-three" title="No players on the roster yet." />
        ) : (
          <>
            <Text variant="monoSm" muted>
              {playerCountLabel(rows.length)}
            </Text>
            {search}
            {visible.length === 0 ? (
              noResults
            ) : (
              <View
                testID="roster-limited"
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}
              >
                {visible.map((r) => (
                  <Tile key={r.team_player_id}>
                    <Jersey value={r.jersey_number} variant="monoXl" />
                    <Text variant="bodyBold" numberOfLines={1}>
                      {r.first_name}
                    </Text>
                    {r.position ? <PositionPill label={r.position} /> : null}
                  </Tile>
                ))}
              </View>
            )}
            <Text variant="caption" muted>
              Teammates are shown by first name only.
            </Text>
          </>
        )}
      </View>
    );

  // Staff and club admins ---------------------------------------------------------------------------
  return (
    <View style={{ gap: space[4] }}>
      {header}

      {rows.length > 0 && (
        <View style={{ flexDirection: 'row', gap: space[2] }} accessibilityLabel="Roster summary">
          <Stat label="Active" value={counts.active} />
          <Stat label="Inactive" value={counts.inactive} />
          {canPlace && <Stat label="Ready to add" value={counts.ready} />}
        </View>
      )}

      {canPlace && ready.length > 0 && (
        <Card style={{ gap: space[3], padding: space[4] }}>
          <View style={{ gap: space[1] }}>
            <Heading level="heading" accessibilityRole="header">
              Ready to add
            </Heading>
            <Text variant="caption" muted>
              {ready.length} approved {ready.length === 1 ? 'child' : 'children'} not on the roster
              yet.
            </Text>
          </View>
          {ready.map((c) => (
            <View
              key={c.playerId}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}
            >
              <PlayerAvatar name={c.name} size="sm" />
              <Text style={{ flex: 1 }} numberOfLines={1}>
                {c.name}
              </Text>
              <Button
                title="Add"
                variant="secondary"
                accessibilityLabel={`Add ${c.name} to the roster`}
                onPress={() => {
                  setSelectedId(null);
                  setAdding({ playerId: c.playerId });
                }}
              />
            </View>
          ))}
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="users-three"
          title={canPlace ? 'Your roster is empty' : 'No players on the roster yet.'}
          {...(canPlace ? { body: 'Approve a join request, then add the child here.' } : {})}
          action={
            canPlace ? (
              <View style={{ gap: space[2] }}>
                <Button
                  title="Review requests"
                  variant="secondary"
                  onPress={() => openPeople('requests')}
                />
                <Button
                  title="Open invites"
                  variant="ghost"
                  onPress={() => openPeople('invites')}
                />
              </View>
            ) : undefined
          }
        />
      ) : (
        <>
          {search}
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
            accessibilityRole="radiogroup"
            accessibilityLabel="Status filter"
          >
            {ROSTER_STATUS_FILTERS.map((f) => (
              <PickChip
                key={f.value}
                label={f.label}
                selected={status === f.value}
                onPress={() => setStatus(f.value)}
              />
            ))}
            <PickChip
              accessibilityRole="button"
              label={`Sort: ${ROSTER_SORTS.find((s) => s.value === sort)?.label ?? ''}`}
              onPress={() =>
                setSort(
                  ROSTER_SORTS[
                    (ROSTER_SORTS.findIndex((s) => s.value === sort) + 1) % ROSTER_SORTS.length
                  ]!.value,
                )
              }
            />
          </View>
          {!canEdit && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Icon name="lock-simple" size="sm" />
              <Text variant="caption" muted>
                Read-only for club admins
              </Text>
            </View>
          )}
          {visible.length === 0 ? (
            noResults
          ) : (
            <ListGroup testID="roster-list">
              {visible.map((r) => {
                const f = r.player_id ? facts.get(r.player_id) : undefined;
                return (
                  <ListRow
                    key={r.team_player_id}
                    title={fullName(r)}
                    subtitle={[r.position, f ? ageLabel(f.age) : null].filter(Boolean).join(' · ')}
                    selected={selectedId === r.team_player_id || r.player_id === justAdded}
                    leading={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                        <View style={{ minWidth: space[8] + space[1] }}>
                          <Jersey
                            value={r.jersey_number}
                            variant="monoLg"
                            muted={r.status === 'inactive'}
                          />
                        </View>
                        <PlayerAvatar name={fullName(r)} photoPath={f?.photoPath} size="sm" />
                      </View>
                    }
                    trailing={<StatusMark status={r.status} />}
                    onPress={() => setSelectedId(r.team_player_id)}
                    accessibilityLabel={rosterRowSpoken(r)}
                  />
                );
              })}
            </ListGroup>
          )}
        </>
      )}

      <PlayerSheet
        row={selected}
        rows={rows}
        facts={selected?.player_id ? facts.get(selected.player_id) : undefined}
        canEdit={canEdit}
        canSeeContacts={caps.has('contacts.view')}
        positions={positions}
        teamName={team.name}
        onClose={() => setSelectedId(null)}
        onChanged={reloadAll}
        onRemoved={() => {
          setSelectedId(null);
          reloadAll();
        }}
      />
      <AddSheet
        open={adding !== null}
        teamId={team.id}
        candidates={ready}
        initialPlayerId={adding?.playerId ?? null}
        rows={rows}
        positions={positions}
        onClose={() => setAdding(null)}
        onPlaced={(playerId) => {
          const child = ready.find((c) => c.playerId === playerId);
          setAdding(null);
          setQuery('');
          setStatus('active');
          setJustAdded(playerId);
          toast(`${child?.firstName ?? 'Player'} is on the roster`);
          reloadAll();
        }}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const { theme } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flex: 1,
        gap: space[1],
        padding: space[3],
        borderRadius: radius.lg,
        borderWidth: componentTokens.card.border,
        borderColor: theme.color.line,
        backgroundColor: theme.color.surface,
      }}
    >
      <Text variant="monoLg">{value}</Text>
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );
}

function Tile({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: '47.5%',
        gap: space[2],
        padding: space[4],
        borderRadius: radius.xl,
        borderWidth: componentTokens.card.border,
        borderColor: theme.color.line,
        backgroundColor: theme.color.surface,
      }}
    >
      {children}
    </View>
  );
}

function PositionPill({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        paddingVertical: space[1],
        paddingHorizontal: space[2],
        borderRadius: radius.pill,
        backgroundColor: theme.color.surfaceAlt,
      }}
    >
      <Text variant="caption" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
