import type { Metadata } from 'next';

import { RequestView } from '@/components/help/request-view';

// The signed-out emailed link. Never indexed, never sends a Referer, and the token is never logged or put in analytics.
export const metadata: Metadata = {
  title: 'Your request',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function TokenRequestPage({ params }: { params: Promise<{ token: string }> }) {
  return <RequestView refOrToken={(await params).token} mode="token" />;
}
