'use client';

import { useParams } from 'next/navigation';

import { WaiverEditor } from '@/components/registration/waiver-editor';

export default function EditWaiverPage() {
  const { waiverId } = useParams<{ waiverId: string }>();
  return <WaiverEditor waiverId={waiverId} owner={{}} />;
}
