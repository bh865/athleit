'use client';

import { formSchemaSchema, type InfoBlock } from '@athleit/core';
import { useState } from 'react';

import { Badge, Button, Card, Heading, Icon, ListGroup, ListRow, Text } from '@/components/ui';

import { FormRenderer, type Answers } from './form-renderer';
import { InfoBlocks } from './info-blocks';
import styles from './registration.module.css';
import { RegistrationStatusBadge } from './status';

const BLOCKS: InfoBlock[] = [
  {
    type: 'key_facts',
    items: [
      { label: 'Starts', value: 'Mar 14' },
      { label: 'Where', value: 'Riverside Fields' },
    ],
  },
  {
    type: 'description',
    body: 'Ten weeks of Saturday games for ages 8 to 10.\nNo experience needed.',
  },
  { type: 'what_to_bring', items: ['Shin guards', 'Water bottle'] },
  {
    type: 'faq',
    items: [{ question: 'Can we switch teams?', answer: 'Ask the coordinator before week two.' }],
  },
];
const FORM = formSchemaSchema.parse({
  fields: [
    {
      id: 'shirt',
      type: 'dropdown',
      label: 'Shirt size',
      required: true,
      options: [
        { value: 's', label: 'Youth S' },
        { value: 'm', label: 'Youth M' },
      ],
    },
    {
      id: 'position',
      type: 'multiple_choice',
      label: 'Positions',
      options: [
        { value: 'gk', label: 'Goalie' },
        { value: 'fw', label: 'Forward' },
      ],
    },
    { id: 'notes', type: 'long_text', label: 'Anything we should know?' },
    { id: 'photos', type: 'consent_checkbox', label: 'Photos may be shared with the team' },
  ],
});

/** Static fixtures only: no network, so the visual tests need no database. */
export function RegistrationPublicGallery() {
  const [answers, setAnswers] = useState<Answers>({ shirt: 'm' });
  return (
    <div className={styles.stack}>
      <div className={`${styles.stack} ${styles.tight}`}>
        <Text variant="label" muted>
          Riverside Youth Soccer
        </Text>
        <Heading as="h1" level="title">
          Spring recreational league
        </Heading>
        <div className={styles.row}>
          <Badge tone="success">Only a few spots left</Badge>
          <Badge>$85</Badge>
        </div>
      </div>
      <InfoBlocks blocks={BLOCKS} />
      <Card>
        <div className={styles.stack}>
          <ol className={styles.steps} aria-label="Registration steps">
            <li className={styles.step}>1. Child</li>
            <li className={`${styles.step} ${styles.stepActive}`} aria-current="step">
              2. Details
            </li>
            <li className={styles.step}>3. Review</li>
          </ol>
          <FormRenderer
            schema={FORM}
            answers={answers}
            errors={{ position: 'Choose at least one position' }}
            onChange={setAnswers}
          />
          <Button>Continue</Button>
        </div>
      </Card>
    </div>
  );
}

export function RegistrationStaffGallery() {
  return (
    <div className={styles.stack}>
      <Card>
        <div className={styles.stack}>
          <div className={`${styles.row} ${styles.between}`}>
            <Heading as="h2">Capacity</Heading>
            <Text variant="mono">18 / 24</Text>
          </div>
          <div
            className={styles.meter}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={24}
            aria-valuenow={18}
            aria-label="Spots taken"
          >
            <div className={styles.meterFill} style={{ ['--pct' as string]: '75%' }} />
          </div>
          <Text muted>4 to review · 12 accepted · 2 placed · 3 waitlisted</Text>
        </div>
      </Card>
      <Card>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Child</th>
                <th scope="col">Guardian</th>
                <th scope="col">Status</th>
                <th scope="col">Waivers</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Maya Reyes', 'Ana Reyes', 'submitted', '1/2'],
                ['Leo Park', 'Sam Park', 'accepted', '2/2'],
                ['Ivy Chen', 'Jo Chen', 'waitlisted', '0/2'],
                ['Noah Webb', 'Kim Webb', 'declined', '—'],
              ].map(([c, g, s, w]) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td>{g}</td>
                  <td>
                    <RegistrationStatusBadge status={s ?? ''} />
                  </td>
                  <td>{w}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className={styles.sensitive}>
        <Heading as="h2">Medical information</Heading>
        <Text as="p">Opening this is recorded in the audit log with your name and the time.</Text>
        <Button variant="secondary">Show medical info</Button>
      </div>
    </div>
  );
}

export function RegistrationDocsGallery() {
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <Badge tone="success">12 signed</Badge>
        <Badge tone="danger">3 missing</Badge>
        <Badge tone="warning">1 expired</Badge>
      </div>
      <div className={styles.preBody}>
        I understand that soccer involves physical activity and agree to the terms below. A typed
        name below is my signature.
      </div>
      <ListGroup>
        <ListRow
          leading={<Icon name="file-pdf" />}
          title="Season rules"
          subtitle="Rules · 214 KB · Coach Dee"
          trailing={<Button variant="secondary">Open</Button>}
        />
        <ListRow
          leading={<Icon name="file-text" />}
          title="Tournament schedule"
          subtitle="Schedule · 88 KB · Coach Dee"
          trailing={<Button variant="secondary">Open</Button>}
        />
      </ListGroup>
    </div>
  );
}
