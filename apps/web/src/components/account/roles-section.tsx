'use client';

import { friendlyError, isLastAdminError, type AppContext } from '@athleit/core';
import { leaveClub, leaveTeam } from '@athleit/db/api';
import { useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { ADD_LABEL } from '@/components/app/context-switcher';
import {
  Avatar,
  Button,
  ButtonLink,
  Card,
  ChipLabel,
  ConfirmSheet,
  Icon,
  Sheet,
  Text,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './account.module.css';

export function RolesSection() {
  const { contexts, addActions, userId, refresh } = useApp();
  const toast = useToast();
  const [leaving, setLeaving] = useState<AppContext | null>(null);
  const [blocked, setBlocked] = useState<AppContext | null>(null);
  const [busy, setBusy] = useState(false);

  async function leave() {
    if (!leaving || !userId) return;
    setBusy(true);
    const client = getClient();
    const r =
      leaving.kind === 'club'
        ? await leaveClub(client, leaving.id, userId)
        : await leaveTeam(client, leaving.id, userId);
    setBusy(false);
    if (r.error) {
      const place = leaving;
      setLeaving(null);
      if (isLastAdminError(r.error)) return setBlocked(place);
      return toast(friendlyError(r.error), 'danger');
    }
    toast(`You left ${leaving.title}`);
    setLeaving(null);
    await refresh();
  }

  return (
    <section id="roles" className={styles.section} aria-labelledby="roles-h">
      <div className={styles.sectionHead}>
        <Text variant="heading" as="h2" id="roles-h">
          Roles &amp; places
        </Text>
        <Text muted as="p">
          Every team, club and family you belong to.
        </Text>
      </div>
      <Card className={styles.card}>
        {contexts.length === 0 ? (
          <Text muted as="p">
            You aren’t part of a team, club or family yet.
          </Text>
        ) : (
          <ul
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
            className={styles.stack}
            aria-label="Your places"
          >
            {contexts.map((c) => (
              <li key={c.key} className={styles.row} data-testid="role-row">
                <Avatar name={c.title} size="md" />
                <div className={styles.rowText}>
                  <Text variant="bodyBold" className={styles.truncate}>
                    {c.title}
                  </Text>
                  <span className={styles.chips}>
                    <ChipLabel>{c.subtitle}</ChipLabel>
                  </span>
                </div>
                {c.kind === 'family' ? (
                  <ButtonLink href="/family" variant="ghost">
                    My children
                  </ButtonLink>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => setLeaving(c)}
                    aria-label={`Leave ${c.title}`}
                  >
                    Leave
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {addActions.length ? (
          <div className={styles.chips}>
            {addActions.map((a) => (
              <ButtonLink key={a} href={ADD_LABEL[a].href} variant="secondary">
                <Icon name="plus" size="sm" /> {ADD_LABEL[a].label}
              </ButtonLink>
            ))}
          </div>
        ) : null}
      </Card>

      <ConfirmSheet
        open={!!leaving}
        onClose={() => setLeaving(null)}
        title={`Leave ${leaving?.title ?? ''}?`}
        confirmLabel={leaving?.kind === 'club' ? 'Leave club' : 'Leave team'}
        cancelLabel="Stay"
        busy={busy}
        onConfirm={() => void leave()}
      >
        <Text as="p">
          You’ll lose access to the schedule, messages and payments for {leaving?.title}. You can
          rejoin with a new invite.
        </Text>
        <Text muted as="p">
          Your registrations and receipts stay on your account.
        </Text>
      </ConfirmSheet>

      <Sheet
        open={!!blocked}
        onClose={() => setBlocked(null)}
        title="Can’t leave yet"
        level="modal"
      >
        <div className={styles.stack}>
          <Text variant="heading" as="h2">
            You can’t leave {blocked?.title} yet
          </Text>
          <Text as="p">You’re the only admin of {blocked?.title}.</Text>
          <Text muted as="p">
            Make another member an admin first, then you can leave.
          </Text>
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setBlocked(null)}>
              Close
            </Button>
            {blocked ? (
              <ButtonLink
                href={
                  blocked.kind === 'club' ? `/clubs/${blocked.id}` : `/teams/${blocked.id}/members`
                }
              >
                Manage members
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </Sheet>
    </section>
  );
}
