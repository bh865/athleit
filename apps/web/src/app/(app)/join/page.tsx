'use client';

import { friendlyError, joinCodeSchema } from '@athleit/core';
import { listChildren, requestToJoin } from '@athleit/db/api';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

import styles from '@/components/app/app.module.css';
import { formText } from '@/components/app/form-utils';
import { FormMessage } from '@/components/app/states';
import { Button, Card, Select, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

function JoinForm() {
  const params = useSearchParams();
  const client = getClient();
  const children = useLoad(() => listChildren(client), []);
  const [codeError, setCodeError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = joinCodeSchema.safeParse(formText(fd, 'code'));
    if (!code.success) return setCodeError(code.error.issues[0]?.message);
    setCodeError(undefined);
    setError(null);
    setBusy(true);
    const res = await requestToJoin(client, {
      teamCode: code.data,
      playerId: formText(fd, 'playerId') || null,
      message: formText(fd, 'message').trim() || null,
    });
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setSent(true);
  }

  if (sent) {
    return (
      <Card className={styles.stack} data-testid="join-sent">
        <h1 className={styles.title}>Request sent</h1>
        <p>
          The team’s staff will review it. You’ll see the team here once they approve; until then
          you can’t see any of its information.
        </p>
      </Card>
    );
  }

  const options = [
    { value: '', label: 'No child (I’m a parent or guardian)' },
    ...(children.data ?? []).map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}` })),
  ];

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className={styles.stack}>
        <h1 className={styles.title}>Join a team</h1>
        <p className={styles.muted}>
          Enter the team code from your coach. This sends a request; the team’s staff approve it
          before you get any access.
        </p>
        <TextField
          name="code"
          label="Team code"
          mono
          autoCapitalize="characters"
          autoComplete="off"
          error={codeError}
        />
        <Select
          name="playerId"
          label="Which child is this for?"
          options={options}
          defaultValue={params.get('player') ?? ''}
          hint="Add your child first if they’re not listed."
        />
        <TextField name="message" label="Message (optional)" maxLength={500} />
        <FormMessage error={error} />
        <Button type="submit" loading={busy}>
          Send request
        </Button>
      </form>
    </Card>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <JoinForm />
    </Suspense>
  );
}
