'use client';

import { friendlyError } from '@athleit/core';
import { addOpponent, deleteOpponent, getOpponents } from '@athleit/db/scheduling';
import { useState } from 'react';

import { FormMessage, LoadState } from '@/components/app/states';
import { Button, IconButton, ListGroup, ListRow, Sheet, Text, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './schedule.module.css';

/** Saved opponents for a team, so staff pick instead of retyping. */
export function OpponentsManager({
  open,
  onClose,
  teamId,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
}) {
  const opps = useLoad(
    () => (open ? getOpponents(getClient(), teamId) : Promise.resolve({ data: [], error: null })),
    [open, teamId],
  );
  const [opp, setOpp] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(
    p: PromiseLike<{ error: { message: string; code?: string | undefined } | null }>,
    after: () => void,
  ) {
    setError(null);
    const r = await p;
    if (r.error) return setError(friendlyError(r.error));
    after();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Opponents" placement="right">
      <div className={styles.form}>
        <Text variant="heading" as="h2">
          Opponents
        </Text>
        <LoadState
          loading={opps.loading}
          error={opps.error}
          empty={(opps.data ?? []).length === 0}
          emptyText="No opponents yet."
          onRetry={opps.reload}
        >
          <ListGroup>
            {(opps.data ?? []).map((o) => (
              <li key={o.id}>
                <ListRow
                  title={o.name}
                  trailing={
                    <IconButton
                      icon="trash"
                      label={`Remove ${o.name}`}
                      onClick={() => void run(deleteOpponent(getClient(), o.id), opps.reload)}
                    />
                  }
                />
              </li>
            ))}
          </ListGroup>
        </LoadState>
        <TextField
          label="Opponent name"
          value={opp}
          onChange={(e) => setOpp(e.target.value)}
          maxLength={100}
        />
        <Button
          variant="secondary"
          disabled={!opp.trim()}
          onClick={() =>
            void run(addOpponent(getClient(), teamId, opp.trim()), () => {
              setOpp('');
              opps.reload();
            })
          }
        >
          Save opponent
        </Button>
        <FormMessage error={error} />
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}
