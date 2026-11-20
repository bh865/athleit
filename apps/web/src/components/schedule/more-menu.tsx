'use client';

import { useRef, useState } from 'react';

import { Button, Icon, Popover } from '@/components/ui';

import styles from './schedule.module.css';

type Entry = { key: 'places' | 'opponents' | 'feed'; icon: 'map-pin' | 'flag' | 'link'; title: string; body: string };

const ENTRIES: Entry[] = [
  { key: 'places', icon: 'map-pin', title: 'Places', body: 'Saved fields and gyms you can pick when adding events.' },
  { key: 'opponents', icon: 'flag', title: 'Opponents', body: 'Teams you play, so games take one tap to set up.' },
  { key: 'feed', icon: 'link', title: 'Calendar link', body: 'Show this schedule in Apple or Google Calendar.' },
];

/** The quiet "More" menu: Places and Opponents (staff) and Calendar link (everyone), each with one line of why. */
export function MoreMenu({
  canManage,
  onChoose,
}: {
  canManage: boolean;
  onChoose: (k: Entry['key']) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const entries = ENTRIES.filter((e) => canManage || e.key === 'feed');
  return (
    <>
      <Button
        ref={anchor}
        variant="ghost"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="schedule-more"
      >
        <Icon name="dots-three" size="sm" /> More
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label="More schedule options" align="end">
        <ul className={styles.moreList}>
          {entries.map((e) => (
            <li key={e.key}>
              <button
                type="button"
                className={styles.moreItem}
                onClick={() => {
                  setOpen(false);
                  onChoose(e.key);
                }}
              >
                <Icon name={e.icon} />
                <span className={styles.body}>
                  <span className={styles.title}>{e.title}</span>
                  <span className={styles.meta}>{e.body}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </>
  );
}
