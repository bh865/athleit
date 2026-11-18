import type { InfoBlock } from '@athleit/core';

import { Heading, Text } from '@/components/ui';

import styles from './registration.module.css';

/**
 * Event info blocks. User-authored text is rendered as plain React text (escaped), never as HTML or markdown links.
 * Line breaks in a description are kept with `white-space: pre-wrap`.
 */
export function InfoBlocks({ blocks }: { blocks: InfoBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'key_facts':
            return (
              <dl key={i} className={styles.factGrid}>
                {b.items.map((it, j) => (
                  <div key={j} className={styles.fact}>
                    <dt>{it.label}</dt>
                    <dd>{it.value}</dd>
                  </div>
                ))}
              </dl>
            );
          case 'description':
            return (
              <section key={i} className={`${styles.stack} ${styles.tight}`}>
                {b.title ? <Heading as="h2">{b.title}</Heading> : null}
                <Text as="p" className={styles.preBody}>
                  {b.body}
                </Text>
              </section>
            );
          case 'agenda':
            return (
              <section key={i} className={`${styles.stack} ${styles.tight}`}>
                <Heading as="h2">{b.title ?? 'Schedule'}</Heading>
                <ul className={styles.list}>
                  {b.items.map((it, j) => (
                    <li key={j} className={styles.item}>
                      {it.time ? <Text variant="mono">{it.time}</Text> : null}
                      <Text>{it.label}</Text>
                    </li>
                  ))}
                </ul>
              </section>
            );
          case 'what_to_bring':
            return (
              <section key={i} className={`${styles.stack} ${styles.tight}`}>
                <Heading as="h2">What to bring</Heading>
                <ul className={styles.list}>
                  {b.items.map((it, j) => (
                    <li key={j} className={styles.item}>
                      <Text>{it}</Text>
                    </li>
                  ))}
                </ul>
              </section>
            );
          case 'faq':
            return (
              <section key={i} className={`${styles.stack} ${styles.tight}`}>
                <Heading as="h2">Questions</Heading>
                {b.items.map((it, j) => (
                  <details key={j}>
                    <summary>{it.question}</summary>
                    <Text as="p" muted>
                      {it.answer}
                    </Text>
                  </details>
                ))}
              </section>
            );
        }
      })}
    </>
  );
}
