import { describe, expect, it } from 'vitest';

import { notificationSummary } from './notifications';

describe('installment notifications open the right place', () => {
  const base = { payment_event_id: 'e1', request_id: 'r1', installment_id: 'i1' };
  it.each([
    'installment_due_soon',
    'installment_failed',
    'installment_final',
    'installment_overdue',
    'card_expiring',
    'plan_completed',
    'plan_restructured',
    'autopay_paused',
  ])('family %s opens that request in Pay', (change) => {
    const s = notificationSummary('payments', {
      ...base,
      change,
      title: 'Dues',
      body: 'x',
      kind: 'payment',
    });
    expect(s.href).toBe('/pay?request=r1');
    expect(s.icon).toBe('credit-card');
  });
  it('staff overdue notices open the event collection', () => {
    const s = notificationSummary('payments', {
      ...base,
      change: 'installment_overdue',
      audience: 'staff',
      team_id: 't1',
      title: 'Dues',
      body: 'x',
    });
    expect(s.href).toBe('/teams/t1/payments?event=e1');
  });
  it('a club-issued event opens the club collection', () => {
    const s = notificationSummary('payments', {
      ...base,
      audience: 'staff',
      club_id: 'c1',
      title: 'Dues',
      body: 'x',
    });
    expect(s.href).toBe('/clubs/c1/payments?event=e1');
  });
});
