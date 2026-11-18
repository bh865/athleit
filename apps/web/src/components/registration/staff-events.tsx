'use client';

import {
  listForms,
  listRegistrationEvents,
  listWaivers,
  type Owner,
} from '@athleit/db/registration';
import { registrationPriceLabel } from '@athleit/core';
import Link from 'next/link';

import { LoadState } from '@/components/app/states';
import { Badge, Button, Card, Heading, ListGroup, ListRow, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './registration.module.css';

const EVENT_TONE = {
  open: 'success',
  draft: 'neutral',
  closed: 'warning',
  archived: 'neutral',
} as const;
export const ownerQuery = (o: Owner) => (o.teamId ? `team=${o.teamId}` : `club=${o.clubId}`);

/** Staff home for an owner: its registrations, plus its reusable forms and waivers. Authoring screens are web-only. */
export function StaffRegistrations({ owner, canManage }: { owner: Owner; canManage: boolean }) {
  const client = getClient();
  const events = useLoad(() => listRegistrationEvents(client, owner), [owner.teamId, owner.clubId]);
  const forms = useLoad(() => listForms(client, owner), [owner.teamId, owner.clubId]);
  const waivers = useLoad(() => listWaivers(client, owner), [owner.teamId, owner.clubId]);
  const q = ownerQuery(owner);
  return (
    <div className={styles.stack}>
      <div className={`${styles.row} ${styles.between}`}>
        <Heading as="h2">Registrations</Heading>
        {canManage ? (
          <Link href={`/manage/registration/new?${q}`}>
            <Button>New registration</Button>
          </Link>
        ) : null}
      </div>
      <LoadState
        loading={events.loading}
        error={events.error}
        empty={events.data?.length === 0}
        emptyText="No registrations yet."
        onRetry={events.reload}
      >
        <ListGroup>
          {(events.data ?? []).map((e) => (
            <li key={e.id}>
              <ListRow
                href={`/manage/registration/${e.id}`}
                title={e.title}
                subtitle={`${registrationPriceLabel(e.price_cents)} · ${e.capacity ? `${e.capacity} spots` : 'No limit'} · ${e.kind}`}
                trailing={
                  <Badge tone={EVENT_TONE[e.status as keyof typeof EVENT_TONE] ?? 'neutral'}>
                    {e.status}
                  </Badge>
                }
              />
            </li>
          ))}
        </ListGroup>
      </LoadState>

      {canManage && (
        <div className={styles.stack}>
          <Card>
            <div className={styles.stack}>
              <div className={`${styles.row} ${styles.between}`}>
                <Heading as="h2">Forms</Heading>
                <Link href={`/manage/forms/new?${q}`}>
                  <Button variant="secondary">New form</Button>
                </Link>
              </div>
              <LoadState
                loading={forms.loading}
                error={forms.error}
                empty={forms.data?.length === 0}
                emptyText="No forms yet. A form is the set of questions parents answer."
                onRetry={forms.reload}
              >
                <ListGroup>
                  {(forms.data ?? []).map((f) => (
                    <li key={f.id}>
                      <ListRow
                        href={`/manage/forms/${f.id}`}
                        title={f.name}
                        subtitle={f.form_versions.length > 0 ? 'Published' : 'Draft only'}
                      />
                    </li>
                  ))}
                </ListGroup>
              </LoadState>
            </div>
          </Card>
          <Card>
            <div className={styles.stack}>
              <div className={`${styles.row} ${styles.between}`}>
                <Heading as="h2">Waivers</Heading>
                <Link href={`/manage/waivers/new?${q}`}>
                  <Button variant="secondary">New waiver</Button>
                </Link>
              </div>
              <Text muted>Counsel should review every waiver before you publish it.</Text>
              <LoadState
                loading={waivers.loading}
                error={waivers.error}
                empty={waivers.data?.length === 0}
                emptyText="No waivers yet."
                onRetry={waivers.reload}
              >
                <ListGroup>
                  {(waivers.data ?? []).map((w) => (
                    <li key={w.id}>
                      <ListRow
                        href={`/manage/waivers/${w.id}`}
                        title={w.title}
                        subtitle={w.waiver_versions.length > 0 ? 'Published' : 'Draft only'}
                      />
                    </li>
                  ))}
                </ListGroup>
              </LoadState>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
