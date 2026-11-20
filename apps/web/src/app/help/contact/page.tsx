import type { SupportType } from '@athleit/db/support';
import type { Metadata } from 'next';

import { ContactForm } from '@/components/help/contact-form';
import { searchDocs } from '@/lib/help/content';

export const metadata: Metadata = {
  title: 'Contact support',
  robots: { index: false, follow: false },
};

const TYPES: SupportType[] = ['question', 'problem', 'billing', 'feedback'];

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ article?: string; q?: string; type?: string }>;
}) {
  const p = await searchParams;
  const type = TYPES.includes(p.type as SupportType) ? (p.type as SupportType) : 'question';
  const article = p.article && /^[a-z0-9-]{1,120}$/.test(p.article) ? p.article : null;
  return (
    <ContactForm docs={searchDocs()} article={article} q={(p.q ?? '').slice(0, 120)} type={type} />
  );
}
