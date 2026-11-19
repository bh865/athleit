'use client';

import { Button, Icon, SegmentedControl } from '@/components/ui';

import { Amount } from './money';
import styles from './parent-pay.module.css';
import { StatusPill } from './status-pill';

function Req({
  title,
  sub,
  cents,
  pill,
  on,
  quiet,
}: {
  title: string;
  sub: string;
  cents: number;
  pill: React.ReactNode;
  on?: boolean;
  quiet?: boolean;
}) {
  return (
    <li className={`${styles.reqCard} ${quiet ? styles.reqQuiet : ''}`}>
      {quiet ? null : (
        <label className={styles.checkLabel}>
          <input type="checkbox" className={styles.check} defaultChecked={on} aria-label={title} />
        </label>
      )}
      <span className={styles.grow}>
        <strong>{title}</strong>
        <div className={styles.quiet}>{sub}</div>
      </span>
      {pill}
      <Amount cents={cents} />
    </li>
  );
}

/** Static states for the parent Pay redesign: due summary, groups, payment summary, checkout steps, receipts. */
export function ParentPayGallery() {
  return (
    <div className={styles.stack}>
      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.summary}>
            <span className={styles.kicker}>Amount due</span>
            <Amount cents={52000} variant="monoXl" label="Amount due" />
            <p className={styles.quiet}>5 of 5 requests selected · 4 due this week</p>
            <p className={styles.strip}>
              <Icon name="warning" size="sm" weight="fill" /> <strong>1 overdue</strong>
              <span>· Oldest: Fall 2026 Registration for Maya, 5 days late</span>
            </p>
          </section>
          <SegmentedControl
            label="Show"
            value="needs"
            options={[
              { value: 'needs', label: 'Needs payment 5' },
              { value: 'processing', label: 'Processing 1' },
              { value: 'paid', label: 'Paid 1' },
            ]}
            onChange={() => undefined}
          />
          <p className={styles.note}>
            <Icon name="info" size="sm" />
            <span>
              These are paid separately. Pay one group at a time. Tournament Fee goes to Riverside
              Youth Soccer Club, so it is next.
            </span>
          </p>
          <ul className={styles.reqs}>
            <Req
              on
              title="Fall 2026 Registration"
              sub="Athleit FC"
              cents={18500}
              pill={
                <StatusPill tone="bad" icon="warning">
                  Overdue 5 days
                </StatusPill>
              }
            />
            <Req
              on
              title="Team Jersey"
              sub="Athleit FC"
              cents={4500}
              pill={
                <StatusPill tone="warn" icon="clock">
                  Due in 3 days
                </StatusPill>
              }
            />
            <Req
              title="Tournament Fee"
              sub="Riverside Youth Soccer Club"
              cents={6000}
              pill={
                <StatusPill tone="neutral" icon="calendar-blank">
                  Due Dec 1
                </StatusPill>
              }
            />
            <Req
              quiet
              title="Photo Package"
              sub="Athleit FC"
              cents={2630}
              pill={
                <StatusPill tone="ok" icon="check-circle">
                  Paid
                </StatusPill>
              }
            />
          </ul>
        </div>
        <aside className={styles.panel} style={{ position: 'static' }}>
          <span className={styles.kicker}>Payment summary</span>
          <div className={styles.panelLine}>
            <span>Fall 2026 Registration · Maya</span>
            <Amount cents={18500} />
          </div>
          <div className={`${styles.panelLine} ${styles.panelTotal}`}>
            <span>Total</span>
            <Amount cents={23000} />
          </div>
          <Button size="lg" fullWidth>
            <Icon name="lock-simple" size="sm" /> Pay $230.00
          </Button>
          <p className={styles.quiet}>Pay next: Riverside Youth Soccer Club · $60.00</p>
        </aside>
      </div>

      <ol className={styles.steps} aria-label="Checkout steps">
        <li className={`${styles.step} ${styles.stepOn}`}>
          <span className={styles.stepDot}>1</span>Review
        </li>
        <li className={styles.step}>
          <span className={styles.stepDot}>2</span>Pay
        </li>
        <li className={styles.step}>
          <span className={styles.stepDot}>3</span>Done
        </li>
      </ol>
      <div className={styles.center}>
        <span className={styles.bad} aria-hidden>
          <Icon name="credit-card" size="xl" />
        </span>
        <strong>Your card was declined</strong>
        <p className={styles.quiet}>
          Your card was declined. You were not charged. Try another card.
        </p>
      </div>

      <span className={styles.month}>November 2026</span>
      <button type="button" className={styles.receiptRow}>
        <Icon name="receipt" />
        <span className={styles.grow}>
          <span className={styles.quiet}>ATH-2026-0142</span>
          <div>Fall 2026 Registration, Maya +4 more</div>
          <span className={styles.quiet}>Nov 9, 2026</span>
        </span>
        <StatusPill tone="warn" icon="arrow-bend-up-left">
          Partially refunded
        </StatusPill>
        <Amount cents={54112} />
      </button>
    </div>
  );
}
