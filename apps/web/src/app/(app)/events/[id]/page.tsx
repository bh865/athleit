'use client';

import { useParams } from 'next/navigation';

import styles from '@/components/app/app.module.css';
import { EventDetail } from '@/components/schedule/event-detail';
import scheduleStyles from '@/components/schedule/schedule.module.css';
import { PageHeader } from '@/components/ui';

/** Full-page event: the deep-link target for notifications and the Home "Next up" card. */
export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className={styles.stack}>
      <PageHeader title="Event" back={{ href: '/schedule', label: 'Schedule' }} />
      <div className={scheduleStyles.layout} data-testid="event-page">
        <EventDetail eventId={id} variant="page" />
      </div>
    </div>
  );
}
