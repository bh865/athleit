import { RequestList } from '@/components/help/request-list';

export const metadata = { title: 'Your requests', robots: { index: false, follow: false } };

export default function RequestsPage() {
  return <RequestList />;
}
