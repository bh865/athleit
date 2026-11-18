'use client';

import {
  semanticColorNames,
  themeDefinitions,
  glassLevels,
  type TextVariant,
} from '@athleit/tokens';
import { iconNames } from '@athleit/ui-core';
import { useState } from 'react';

import { PayGallery, PayStaffGallery, PayStatesGallery } from '@/components/payments/gallery-parts';
import {
  RegistrationDocsGallery,
  RegistrationPublicGallery,
  RegistrationStaffGallery,
} from '@/components/registration/gallery-parts';

import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  ChipLabel,
  EmptyState,
  ErrorState,
  Glass,
  Icon,
  IconButton,
  IconCircle,
  ListGroup,
  ListRow,
  LoadingSkeleton,
  Logo,
  SegmentedControl,
  Select,
  StatusDot,
  Text,
  TextField,
  ThemeToggle,
  useTheme,
} from '@/components/ui';

import styles from './gallery.module.css';
import {
  CancelledDetailDemo,
  FamilyDetailDemo,
  FlowPartsDemo,
  MonthDemo,
  ScheduleRowsDemo,
  StaffDetailDemo,
} from './schedule-gallery';

const TYPE_SAMPLES: [TextVariant, string][] = [
  ['display', 'Display 44/800'],
  ['title', 'Title 32/800'],
  ['heading', 'Heading 20/700'],
  ['body', 'Body 16/500'],
  ['caption', 'Caption 13/600'],
  ['label', 'Label 12/700'],
  ['monoLg', 'Mono 28/500 · 1,240.00'],
  ['monoXl', 'Mono 56/500 · $45.00'],
];
const SPACE = [1, 2, 3, 4, 6, 8, 12] as const;
const RADII = ['xs', 'sm', 'md', 'lg', 'xl', 'pill'] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <Text variant="label" muted as="h2">
        {title}
      </Text>
      {children}
    </section>
  );
}

function ThemePanel({ name }: { name: string }) {
  const [chip, setChip] = useState(true);
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a');
  const def = themeDefinitions[name as keyof typeof themeDefinitions];
  return (
    <div data-theme-scope={name} data-testid={`gallery-${name}`} className={styles.panel}>
      <div className={styles.head}>
        <Logo variant="lockup" size="lg" />
        <Text variant="mono" muted>
          Manrope · IBM Plex Mono · Phosphor · {name}
        </Text>
      </div>

      <Section title="Logo">
        <div className={styles.row}>
          <Logo variant="mark" size="lg" />
          <Logo variant="app-icon" size="lg" />
          <Logo variant="lockup" size="md" />
        </div>
      </Section>

      <Section title="Color">
        <div className={styles.swatches}>
          {semanticColorNames.map((n) => (
            <div key={n}>
              <span
                className={styles.swatch}
                style={{ background: `var(--color-${n.replace(/([A-Z])/g, '-$1').toLowerCase()})` }}
              />
              <Text variant="caption" as="div">
                {n}
              </Text>
              <Text variant="label" muted as="div">
                {String(
                  def.colors[n as keyof typeof def.colors] &&
                    typeof def.colors[n as keyof typeof def.colors] === 'string'
                    ? def.colors[n as keyof typeof def.colors]
                    : 'alpha',
                )}
              </Text>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className={styles.stack}>
          {TYPE_SAMPLES.map(([v, label]) => (
            <Text key={v} variant={v} as="div">
              {label}
            </Text>
          ))}
        </div>
      </Section>

      <Section title="Spacing · radii">
        <div className={styles.row}>
          {SPACE.map((s) => (
            <div key={s} className={styles.center}>
              <span
                className={styles.space}
                style={{ width: `var(--space-${s})`, height: `var(--space-${s})` }}
              />
              <Text variant="label" muted>
                {s * 4}
              </Text>
            </div>
          ))}
        </div>
        <div className={styles.row}>
          {RADII.map((r) => (
            <div key={r} className={styles.center}>
              <span className={styles.radius} style={{ borderRadius: `var(--radius-${r})` }} />
              <Text variant="label" muted>
                {r}
              </Text>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Liquid glass · 3 levels">
        <div className={styles.glassGrid}>
          {glassLevels.map((l) => (
            <Glass key={l} level={l} className={styles.glassCard}>
              <Text variant="heading" as="div">
                {l[0]!.toUpperCase() + l.slice(1)}
              </Text>
              <Text variant="caption" as="div">
                {l === 'bar'
                  ? 'Sidebar, tab bar, headers'
                  : l === 'sheet'
                    ? 'Drawers, popovers, toasts'
                    : 'Dialogs, confirm'}
              </Text>
            </Glass>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className={styles.row}>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
          <IconButton icon="bell" label="Notifications" />
          <IconButton icon="plus" label="Add" large />
        </div>
      </Section>

      <Section title="Inputs">
        <div className={styles.fields}>
          <TextField label="Name" placeholder="Sample name" />
          <TextField label="Amount" mono defaultValue="$ 45.00" />
          <TextField
            label="Email"
            defaultValue="not-an-email"
            error="Enter a valid email address"
          />
          <Select
            label="Sport"
            options={[
              { value: 'a', label: 'Soccer' },
              { value: 'b', label: 'Hockey' },
            ]}
          />
        </div>
      </Section>

      <Section title="Chips, badges, status">
        <div className={styles.row}>
          <Chip selected={chip} onClick={() => setChip(!chip)}>
            Selected
          </Chip>
          <ChipLabel>Sample team U12</ChipLabel>
          <Badge tone="count">3</Badge>
          <Badge>Neutral</Badge>
          <Badge tone="success">Paid</Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="danger">Overdue</Badge>
          <StatusDot tone="success" />
        </div>
        <SegmentedControl
          label="Sample"
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'a', label: 'One' },
            { value: 'b', label: 'Two' },
            { value: 'c', label: 'Three' },
          ]}
        />
        <ThemeToggle />
      </Section>

      <Section title="Avatars">
        <div className={styles.row}>
          <Avatar name="Alex Sample" size="lg" />
          <Avatar name="Jordan Test" />
          <Avatar name="Sam Example" size="sm" />
          <Avatar name="Riley Demo" />
        </div>
      </Section>

      <Section title="Icons · regular / fill active">
        <div className={styles.row}>
          {iconNames.map((n, i) => (
            <Icon key={n} name={n} size="lg" weight={i % 5 === 0 ? 'fill' : 'regular'} label={n} />
          ))}
        </div>
      </Section>

      <Section title="List rows and card">
        <div className={styles.twoCol}>
          <ListGroup>
            <li>
              <ListRow
                leading={
                  <IconCircle>
                    <Icon name="credit-card" />
                  </IconCircle>
                }
                title="Sample fee"
                subtitle="Alex · due soon"
                trailing={<Text variant="mono">$45.00</Text>}
              />
            </li>
            <li>
              <ListRow
                leading={<Avatar name="Jordan Test" />}
                title="Jordan Test"
                subtitle="Midfield"
                href="/dev/design"
                trailing={<Badge tone="success">Active</Badge>}
              />
            </li>
          </ListGroup>
          <Card>
            <Text variant="label" muted as="div">
              Next up
            </Text>
            <Text variant="title" as="div">
              Sample event
            </Text>
          </Card>
        </div>
      </Section>

      <Section title="States">
        <div className={styles.threeCol}>
          <Card>
            <EmptyState
              icon="tray"
              title="All caught up"
              body="Empty state: icon, one line, at most one action."
            />
          </Card>
          <Card>
            <ErrorState
              message="Can’t load this right now. Check your connection."
              onRetry={() => undefined}
            />
          </Card>
          <Card>
            <LoadingSkeleton rows={3} />
          </Card>
        </div>
      </Section>

      <Section title="Schedule · rows and month">
        <ScheduleRowsDemo />
        <MonthDemo />
      </Section>
      <Section title="Schedule · event detail">
        <div className={styles.row}>
          <FamilyDetailDemo />
          <StaffDetailDemo />
          <CancelledDetailDemo />
        </div>
      </Section>
      <Section title="Schedule · flows">
        <FlowPartsDemo />
      </Section>
      <Section title="Payments · pay and receipt">
        <PayGallery />
      </Section>
      <Section title="Payments · staff">
        <PayStaffGallery />
      </Section>
      <Section title="Payments · states">
        <PayStatesGallery />
      </Section>
      <Section title="Registration · public page">
        <RegistrationPublicGallery />
      </Section>
      <Section title="Registration · staff">
        <RegistrationStaffGallery />
      </Section>
      <Section title="Registration · waivers and documents">
        <RegistrationDocsGallery />
      </Section>
      <Section title="Sidebar · sheet · toast">
        <div className={styles.navDemo}>
          <Glass level="bar" className={styles.sidebarDemo}>
            <span className={`${styles.navItem} ${styles.navActive}`}>
              <Icon name="house" weight="fill" size="lg" /> Home
            </span>
            <span className={styles.navItem}>
              <Icon name="house-line" size="lg" /> Family
            </span>
          </Glass>
          <Glass level="modal" className={styles.sheetDemo}>
            <Text variant="heading" as="div">
              Confirm
            </Text>
            <Text variant="monoLg" as="div">
              $45.00
            </Text>
            <Button fullWidth>Pay</Button>
          </Glass>
          <Glass level="sheet" className={styles.toastDemo}>
            <Icon name="check-circle" weight="fill" /> Reminder sent
          </Glass>
        </div>
      </Section>
    </div>
  );
}

export function Gallery() {
  const { reduceTransparency, setReduceTransparency } = useTheme();
  return (
    <main className={styles.page}>
      <label className={styles.row}>
        <input
          type="checkbox"
          checked={reduceTransparency}
          onChange={(e) => setReduceTransparency(e.target.checked)}
        />
        <Text variant="caption">Reduce transparency (solid fallback)</Text>
      </label>
      {Object.keys(themeDefinitions).map((n) => (
        <ThemePanel key={n} name={n} />
      ))}
    </main>
  );
}
