'use client';

import { useEffect, useRef, useState } from 'react';

import { useTeam } from '@/components/app/team-context';
import { TRIAL_NOTE_KEY } from '@/components/billing/billing-panel';
import { Button, ButtonLink, Card, Icon, Text } from '@/components/ui';
import { getTeamBilling } from '@athleit/db/billing';
import { getClient } from '@/lib/supabase/browser';

/** Quick polls first (the webhook usually lands within seconds), then quiet ones; the redirect itself grants nothing. */
const DELAYS_MS = [1000, 1500, 2000, 3000, 4000, 6000, 8000, 10000];
const QUIET_MS = 15000;

export default function BillingSuccessPage() {
  const { team } = useTeam();
  const [confirmed, setConfirmed] = useState(false);
  const [slow, setSlow] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const attempt = useRef(0);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const r = await getTeamBilling(getClient(), team.id);
      if (!live) return;
      if (r.data && (r.data.state === 'active' || r.data.state === 'cancel_scheduled')) {
        try {
          setNote(sessionStorage.getItem(TRIAL_NOTE_KEY));
          sessionStorage.removeItem(TRIAL_NOTE_KEY);
        } catch {
          /* storage can be blocked; the note is a courtesy */
        }
        return setConfirmed(true);
      }
      const i = attempt.current++;
      if (i >= DELAYS_MS.length) setSlow(true);
      timer = setTimeout(poll, DELAYS_MS[i] ?? QUIET_MS);
    };
    timer = setTimeout(poll, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [team.id]);

  return (
    <Card style={{ padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }} data-testid="billing-success">
      <Icon name={confirmed ? 'check-circle' : 'hourglass'} weight="fill" size="lg" />
      <Text variant="heading" as="h2">
        {confirmed ? 'You’re subscribed' : 'We’re confirming your payment'}
      </Text>
      <Text variant="body" as="p" role="status">
        {confirmed
          ? 'Thanks. Your team’s subscription is active.'
          : slow
            ? 'This is taking longer than usual. You can leave this page: we’ll email every team admin when it’s confirmed.'
            : 'This usually takes a few seconds.'}
      </Text>
      {note && confirmed ? <Text variant="caption" muted as="p">{note}</Text> : null}
      {!confirmed && slow ? (
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Check again
        </Button>
      ) : null}
      <div>
        <ButtonLink href={`/teams/${team.id}/billing`}>Go to billing</ButtonLink>
      </div>
    </Card>
  );
}
