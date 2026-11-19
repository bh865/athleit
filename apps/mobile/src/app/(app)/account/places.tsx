import { friendlyError, isLastAdminError, type AppContext } from '@athleit/core';
import { leaveClub, leaveTeam } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { ADD } from '@/components/app/context-switcher';
import { H1 } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import { Avatar, Button, ListGroup, ListRow, Sheet, Text, useToast } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';

export default function AccountPlacesScreen() {
  useScreenTitle('Roles & places');
  const { contexts, addActions, userId, refresh } = useApp();
  const router = useRouter();
  const toast = useToast();
  const [leaving, setLeaving] = useState<AppContext | null>(null);
  const [blocked, setBlocked] = useState<AppContext | null>(null);
  const [busy, setBusy] = useState(false);

  async function leave() {
    if (!leaving || !userId) return;
    setBusy(true);
    const r =
      leaving.kind === 'club'
        ? await leaveClub(supabase, leaving.id, userId)
        : await leaveTeam(supabase, leaving.id, userId);
    setBusy(false);
    const place = leaving;
    setLeaving(null);
    if (r.error) {
      if (isLastAdminError(r.error)) return setBlocked(place);
      return toast(friendlyError(r.error), 'danger');
    }
    toast(`You left ${place.title}`);
    await refresh();
  }

  return (
    <AppScreen>
      <View style={{ gap: space[4] }}>
        <H1>Roles &amp; places</H1>
        <Text muted>Every team, club and family you belong to.</Text>
        {contexts.length === 0 ? (
          <Text muted>You aren’t part of a team, club or family yet.</Text>
        ) : (
          <ListGroup>
            {contexts.map((c, i) => (
              <ListRow
                key={c.key}
                title={c.title}
                subtitle={c.subtitle}
                leading={<Avatar name={c.title} />}
                last={i === contexts.length - 1}
                onPress={() =>
                  c.kind === 'family' ? router.push('/family' as never) : setLeaving(c)
                }
                testID="role-row"
              />
            ))}
          </ListGroup>
        )}
        <Text variant="caption" muted>
          Tap a team or club to leave it. Families open My children.
        </Text>
        {addActions.map((a) => (
          <Button
            key={a}
            title={ADD[a].label}
            icon="plus"
            variant="secondary"
            onPress={() => router.push(ADD[a].href as never)}
          />
        ))}
      </View>

      <Sheet open={!!leaving} onClose={() => setLeaving(null)} title="Leave" level="modal">
        <Text variant="heading">Leave {leaving?.title}?</Text>
        <Text>
          You’ll lose access to the schedule, messages and payments for {leaving?.title}. You can
          rejoin with a new invite.
        </Text>
        <Text muted>Your registrations and receipts stay on your account.</Text>
        <Button
          title={leaving?.kind === 'club' ? 'Leave club' : 'Leave team'}
          loading={busy}
          onPress={() => void leave()}
          testID="confirm-leave"
        />
        <Button title="Stay" variant="ghost" onPress={() => setLeaving(null)} />
      </Sheet>

      <Sheet
        open={!!blocked}
        onClose={() => setBlocked(null)}
        title="Can’t leave yet"
        level="modal"
      >
        <Text variant="heading">You can’t leave {blocked?.title} yet</Text>
        <Text>You’re the only admin of {blocked?.title}.</Text>
        <Text muted>Make another member an admin first, then you can leave.</Text>
        <Button
          title="Manage members"
          onPress={() => {
            const b = blocked;
            setBlocked(null);
            if (b) router.push((b.kind === 'club' ? `/clubs/${b.id}` : `/teams/${b.id}`) as never);
          }}
        />
        <Button title="Close" variant="ghost" onPress={() => setBlocked(null)} />
      </Sheet>
    </AppScreen>
  );
}
