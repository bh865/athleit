'use client';

import { firstRunState } from '@athleit/core';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';

import { LoadState } from '@/components/app/states';
import { Button, EmptyState, PageHeader } from '@/components/ui';

import { IntentHub } from './intent-hub';
import styles from './onboarding.module.css';
import { RequestCards } from './request-cards';
import { HUB_SKIPPED_KEY, flagsSnapshot, setFlag, subscribeFlags } from './storage';
import { useMyRequests } from './use-my-requests';

/** Home for someone with no place: their requests if any, otherwise the intent hub. */
export function FirstRun({ displayName }: { displayName: string | null }) {
  const router = useRouter();
  const mine = useMyRequests();
  const snap = useSyncExternalStore(subscribeFlags, flagsSnapshot, () => null);
  const flags = snap === null ? null : { done: snap[0] === '1', skipped: snap[1] === '1' };

  const state = firstRunState({
    hasPlace: false,
    requests: mine.requests,
    completedHubBefore: Boolean(flags?.done),
  });
  const returning = state === 'hubReturning';
  const title = `Welcome${displayName ? `, ${displayName}` : ''}`;
  const subtitle =
    state === 'pending'
      ? 'Your request is on its way.'
      : returning
        ? 'You’re not on any team right now. Join or start something new.'
        : 'What brings you here? Pick the closest one. You can add more later.';

  return (
    <>
      <PageHeader titleTestId="display-name" title={title} subtitle={subtitle} />
      <LoadState
        loading={(mine.loading && !mine.data) || !flags}
        error={mine.error}
        onRetry={mine.reload}
      >
        <div className={styles.stack}>
          <RequestCards requests={mine.requests} hasPlace={false} onChanged={mine.reload} />
          {state === 'pending' ? (
            <div className={styles.stack}>
              <p className={styles.kicker}>While you wait</p>
              <Button variant="secondary" onClick={() => router.push('/onboarding/parent')}>
                Add another child
              </Button>
              <Button variant="secondary" onClick={() => router.push('/onboarding/code')}>
                Use another code
              </Button>
            </div>
          ) : flags?.skipped && state === 'hub' ? (
            <EmptyState
              title="You’re not on a team yet"
              action={
                <Button onClick={() => router.push('/onboarding')}>What brings you here?</Button>
              }
            />
          ) : (
            <IntentHub
              returning={returning}
              onSkip={
                state === 'hub'
                  ? () => {
                      setFlag(HUB_SKIPPED_KEY);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </LoadState>
    </>
  );
}

/** Pending requests above Home for someone who already has a place (for example a family). */
export function PendingStrip() {
  const mine = useMyRequests();
  return <RequestCards requests={mine.requests} hasPlace onChanged={mine.reload} />;
}
