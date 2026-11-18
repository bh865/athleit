'use client';

import { Calendar, DatePicker, Glass, TimePicker } from '@/components/ui';

import styles from './gallery.module.css';

/** Date and time pickers in every state. The "open" calendar is rendered inline so it can be captured. */
export function PickerGallery() {
  return (
    <div className={styles.row}>
      <div className={styles.col}>
        <DatePicker label="Date of birth" defaultValue="" />
        <DatePicker label="Starts on" defaultValue="2026-11-30" hint="Shown as a friendly date." />
        <DatePicker label="Due date" value="" error="Choose a due date." required />
        <DatePicker label="Locked" defaultValue="2026-11-30" disabled />
        <TimePicker label="Start time" defaultValue="15:05" />
        <TimePicker label="Ends" value="" error="Choose a time." />
      </div>
      <Glass solid level="modal" className={styles.card} aria-label="Open calendar">
        <Calendar
          value="2026-11-30"
          limits={{ min: '2026-11-05', max: '2027-02-20', disabledDates: ['2026-11-18'] }}
          weekStart={0}
          yearSpan={{ before: 1, after: 2 }}
          onPick={() => undefined}
        />
      </Glass>
    </div>
  );
}
