'use client';

import { ArrowRight, Bell, CheckCircle, Warning, WarningOctagon } from '@phosphor-icons/react';

import { Button, Card, GlassBar, TextField, ThemeToggle, useTheme } from '@/components/ui';

import styles from './smoke.module.css';

/**
 * Smoke-test screen: renders every primitive over a vivid backdrop so the glass blur,
 * tint and fallback are easy to eyeball in light and dark. Public route (dev tool).
 */
export default function SmokePage() {
  const { reduceTransparency, setReduceTransparency } = useTheme();

  return (
    <main className={styles.page}>
      <div className={styles.backdrop} aria-hidden>
        <span className={styles.blobLime} />
        <span className={styles.blobIce} />
        <span className={styles.blobCharcoal} />
        <p className={styles.backdropText}>
          BACKDROP BACKDROP BACKDROP BACKDROP BACKDROP BACKDROP BACKDROP BACKDROP
        </p>
      </div>

      <GlassBar level="bar" className={styles.topBar}>
        <strong>Athleit · smoke test</strong>
        <ThemeToggle />
      </GlassBar>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2>Glass</h2>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={reduceTransparency}
              onChange={(e) => setReduceTransparency(e.target.checked)}
            />
            Reduce transparency (solid fallback)
          </label>
          {(['bar', 'sheet', 'modal'] as const).map((level) => (
            <GlassBar key={level} level={level} className={styles.glassSample}>
              <Bell size={22} aria-hidden />
              <span>
                <strong>{level}</strong> glass: blur, tint and edge highlight
              </span>
            </GlassBar>
          ))}
        </section>

        <section className={styles.section}>
          <h2>Buttons</h2>
          <div className={styles.row}>
            <Button>
              Primary <ArrowRight size={18} weight="bold" aria-hidden />
            </Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button disabled>Disabled</Button>
            <Button loading>Loading</Button>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Text fields</h2>
          <Card className={styles.stack}>
            <TextField label="Name" placeholder="Casey Coach" />
            <TextField
              label="Invite code"
              mono
              defaultValue="ATH-4K29-QX"
              hint="Monospace for codes and IDs"
            />
            <TextField
              label="Email"
              defaultValue="not-an-email"
              error="Enter a valid email address"
            />
          </Card>
        </section>

        <section className={styles.section}>
          <h2>Cards, type and status</h2>
          <Card className={styles.stack}>
            <h3>Manrope for UI</h3>
            <p>The quick brown fox jumps over the lazy dog. 0123456789</p>
            <p className="mono">$1,250.00 · INV-2026-0042 · 7c9e6679-7425</p>
            <div className={styles.row}>
              <span className={`${styles.chip} ${styles.success}`}>
                <CheckCircle size={16} weight="fill" aria-hidden /> Paid
              </span>
              <span className={`${styles.chip} ${styles.warning}`}>
                <Warning size={16} weight="fill" aria-hidden /> Due soon
              </span>
              <span className={`${styles.chip} ${styles.danger}`}>
                <WarningOctagon size={16} weight="fill" aria-hidden /> Overdue
              </span>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
