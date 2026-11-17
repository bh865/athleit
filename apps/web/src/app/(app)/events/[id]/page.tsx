'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import styles from '@/components/app/app.module.css';
import { EventDetail } from '@/components/schedule/event-detail';
import scheduleStyles from '@/components/schedule/schedule.module.css';
import { Icon } from '@/components/ui';

/** Full-page event: the deep-link target for notifications and the Home "Next up" card. */
export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className={styles.stack}>
      <Link href="/schedule" className={styles.link}>
        <Icon name="caret-left" /> Schedule
      </Link>
      <div className={scheduleStyles.layout} data-testid="event-page">
        <EventDetail eventId={id} variant="page" />
      </div>
    </div>
  );
}
