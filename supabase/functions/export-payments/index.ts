// export-payments: CSV of one payment event for its staff (authorization is the database function's).
import { toCsv, type ExportRow } from '../_shared/payments/csv.ts';
import { json } from '../_shared/payments/http.ts';
import { exportInput } from '../_shared/payments/schemas.ts';
import { userFunction } from '../_shared/payments/runtime.ts';

userFunction(
  'export-payments',
  (b) => exportInput.safeParse(b),
  { perMinute: 10 },
  async ({ input, user$ }) => {
    const { data, error } = await user$.rpc('payment_event_export', { p_event_id: input.eventId });
    if (error) throw new Error(error.message);
    if (!data?.length) return json({ error: 'not_authorized' }, 403);
    return new Response(toCsv(data as ExportRow[]), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="payments.csv"',
        'cache-control': 'no-store',
      },
    });
  },
);
