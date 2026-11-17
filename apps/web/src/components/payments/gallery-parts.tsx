'use client';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  SegmentedControl,
  Text,
  TextField,
} from '@/components/ui';
import { useState } from 'react';

import { Amount } from './money';
import styles from './payments.module.css';
import { ReceiptView } from './receipt';

const receipt = {
  payment_id: 'p',
  receipt_display_id: 'RCP-20481',
  succeeded_at: '2026-11-30T12:00:00Z',
  status: 'succeeded',
  total_charged_cents: 4666,
  base_cents: 4500,
  platform_fee_cents: 0,
  processing_fee_passthrough_cents: 166,
  refunded_cents: 0,
  items: [
    { display_id: 'PR-3317', title: 'Jersey fee', player_first_name: 'Maya', amount_cents: 4500 },
  ],
} as never;

function Req({
  title,
  sub,
  cents,
  status,
}: {
  title: string;
  sub: string;
  cents: number;
  status?: string;
}) {
  return (
    <div className={styles.requestRow}>
      <div className={styles.grow}>
        <Text variant="bodyBold" as="div">
          {title}
        </Text>
        <Text variant="caption" muted as="div">
          {sub}
        </Text>
      </div>
      {status ? <Badge tone={status === 'Paid' ? 'success' : 'warning'}>{status}</Badge> : null}
      <Amount cents={cents} />
      {!status ? <Icon name="caret-right" /> : null}
    </div>
  );
}

/** Pay list, request detail, confirm (server-computed lines), receipt. */
export function PayGallery() {
  return (
    <div className={styles.grid}>
      <Card>
        <div className={styles.stack}>
          <Text variant="title" as="h3">
            Pay
          </Text>
          <div>
            <Text variant="bodyBold" muted as="div">
              Amount due
            </Text>
            <Amount cents={9000} variant="monoXl" />
          </div>
          <Req title="Jersey fee" sub="Maya · due Nov 30" cents={4500} />
          <Req title="Tournament fee" sub="Eli · due Dec 5" cents={4500} />
          <Button size="lg" fullWidth>
            Pay <Amount cents={9000} />
          </Button>
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <Text variant="bodyBold" muted as="div">
            Jersey fee
          </Text>
          <Amount cents={4500} variant="monoXl" />
          <div className={styles.lines}>
            {[
              ['For', 'Maya Reyes'],
              ['Due', 'Nov 30, 2026'],
              ['From', 'Coach Dana'],
              ['Request ID', 'PR-3317'],
            ].map(([k, v]) => (
              <div key={k} className={styles.line}>
                <Text muted>{k}</Text>
                {k === 'Request ID' ? (
                  <Text variant="mono">{v}</Text>
                ) : (
                  <Text variant="bodyBold">{v}</Text>
                )}
              </div>
            ))}
          </div>
          <Button size="lg" fullWidth>
            Pay <Amount cents={4500} />
          </Button>
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <Text variant="heading" as="h3">
            Confirm payment
          </Text>
          <div className={styles.lines}>
            <div className={styles.line}>
              <Text muted>Jersey fee · PR-3317</Text>
              <Amount cents={4500} />
            </div>
            <div className={styles.line}>
              <Text muted>Athleit charge</Text>
              <Amount cents={95} />
            </div>
            <div className={styles.line}>
              <Text muted>Service fee</Text>
              <Amount cents={169} />
            </div>
            <div className={`${styles.line} ${styles.total}`}>
              <Text variant="bodyBold">Total</Text>
              <Amount cents={4764} variant="monoLg" />
            </div>
          </div>
          <Button size="lg" fullWidth>
            Continue to payment
          </Button>
        </div>
      </Card>
      <Card>
        <ReceiptView receipt={receipt} onDone={() => undefined} />
      </Card>
    </div>
  );
}

/** Empty, loading, error, processing, declined, history. */
export function PayStatesGallery() {
  return (
    <div className={styles.grid}>
      <Card>
        <EmptyState
          icon="credit-card"
          title="Nothing to pay"
          body="Payment requests from your teams will appear here."
        />
      </Card>
      <Card>
        <LoadingSkeleton />
      </Card>
      <Card>
        <ErrorState
          message="Payment didn’t go through. Your card was not charged."
          onRetry={() => undefined}
        />
      </Card>
      <Card>
        <div className={styles.center}>
          <Text variant="heading" as="h3">
            Processing
          </Text>
          <Text muted as="p">
            Waiting for confirmation. Please don’t close this window.
          </Text>
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <Text variant="heading" as="h3">
            Receipts
          </Text>
          <div className={styles.requestRow}>
            <Icon name="receipt" />
            <div className={styles.grow}>
              <Text variant="mono" as="div">
                RCP-20481
              </Text>
              <Text variant="caption" muted as="div">
                Nov 30, 2026
              </Text>
            </div>
            <Amount cents={4666} />
            <Icon name="caret-right" />
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Connect status (4 states), fee policy + live breakdown, collection with ring, action sheets, dispute, club. */
export function PayStaffGallery() {
  const [policy, setPolicy] = useState<'absorb' | 'pass_on'>('pass_on');
  return (
    <div className={styles.grid}>
      {(
        [
          [
            'Not started',
            'neutral',
            'Set up payouts',
            'Set up payouts to collect fees. It takes a few minutes with Stripe.',
          ],
          ['In review', 'warning', 'Check status', 'Stripe is reviewing your details.'],
          ['Needs info', 'danger', 'Finish setup', 'Stripe needs a little more information.'],
          ['Ready', 'success', 'Open payout settings', 'Payouts are on.'],
        ] as const
      ).map(([label, tone, cta, body]) => (
        <Card key={label}>
          <div className={styles.stack}>
            <div className={styles.between}>
              <Text variant="heading" as="h3">
                Payouts
              </Text>
              <Badge tone={tone}>{label}</Badge>
            </div>
            <Text muted as="p">
              {body}
            </Text>
            <Button variant={label === 'Ready' ? 'secondary' : 'primary'}>{cta}</Button>
          </div>
        </Card>
      ))}
      <Card>
        <div className={styles.stack}>
          <Text variant="heading" as="h3">
            New payment request
          </Text>
          <TextField label="Title" defaultValue="Jersey fee" readOnly />
          <TextField label="Amount" mono defaultValue="45.00" readOnly />
          <TextField label="Due date" defaultValue="2026-11-30" readOnly />
          <SegmentedControl
            label="Who pays the card fee"
            value={policy}
            onChange={setPolicy}
            options={[
              { value: 'absorb', label: 'We pay the fee' },
              { value: 'pass_on', label: 'Families pay a service fee' },
            ]}
          />
          <div className={styles.lines}>
            <div className={styles.line}>
              <Text muted>Request</Text>
              <Amount cents={4500} />
            </div>
            {policy === 'pass_on' ? (
              <div className={styles.line}>
                <Text muted>Service fee</Text>
                <Amount cents={166} />
              </div>
            ) : null}
            <div className={styles.line}>
              <Text variant="bodyBold">Each family pays</Text>
              <Amount cents={policy === 'pass_on' ? 4666 : 4500} variant="monoLg" />
            </div>
          </div>
          <Button size="lg" fullWidth>
            Send request
          </Button>
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <div className={styles.row}>
            <div className={styles.ring} style={{ ['--pct' as string]: 60 }}>
              <div className={styles.ringInner}>
                <Text variant="mono">60%</Text>
              </div>
            </div>
            <div className={styles.grow}>
              <Text variant="heading" as="h3">
                Jersey fee
              </Text>
              <Text muted as="div">
                <Amount cents={27000} /> of <Amount cents={45000} /> · due Nov 30
              </Text>
            </div>
          </div>
          <div className={styles.row}>
            <Button variant="secondary">Send reminder</Button>
            <Button variant="secondary">
              <Icon name="download-simple" /> Export CSV
            </Button>
          </div>
          <ul className={styles.list}>
            {[
              ['Maya Reyes', 'PR-3317', 'Paid', 'success'],
              ['Eli Reyes', 'PR-3318', 'Unpaid', 'warning'],
              ['Zara Khan', 'PR-3319', 'Disputed', 'danger'],
            ].map(([n, id, s, t]) => (
              <li key={id} className={styles.item}>
                <div className={styles.grow}>
                  <Text variant="bodyBold" as="div">
                    {n}
                  </Text>
                  <Text variant="monoSm" muted as="div">
                    {id}
                  </Text>
                </div>
                <Badge tone={t as 'success' | 'warning' | 'danger'}>{s}</Badge>
                <Amount cents={4500} />
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <Text variant="heading" as="h3">
            Record offline payment
          </Text>
          <TextField label="Method" defaultValue="Cash" readOnly />
          <TextField label="Note (optional)" readOnly />
          <Button size="lg" fullWidth>
            Mark paid
          </Button>
          <Text variant="heading" as="h3">
            Refund
          </Text>
          <TextField
            label="Amount to refund (leave blank for all)"
            mono
            hint="Card fees from Stripe aren’t returned."
            readOnly
          />
          <Button size="lg" fullWidth>
            Refund
          </Button>
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <p role="note" className={`${styles.notice} ${styles.noticeBad}`}>
            A payment was disputed. Open Payments to review it.
          </p>
          <Text variant="heading" as="h3">
            Club dues · club-issued
          </Text>
          <Text muted as="p">
            Totals and names appear only for events your club sent.
          </Text>
        </div>
      </Card>
    </div>
  );
}
