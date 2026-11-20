import { notFound } from 'next/navigation';

import { RequestView } from '@/components/help/request-view';

export const metadata = { title: 'Your request', robots: { index: false, follow: false } };

export default async function RequestPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!/^SUP-[0-9]{6,}$/i.test(ref)) notFound();
  return <RequestView refOrToken={ref.toUpperCase()} mode="ref" />;
}
