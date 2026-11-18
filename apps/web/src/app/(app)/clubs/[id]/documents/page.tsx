'use client';

import { capabilitiesForPlace } from '@athleit/core';
import { useParams } from 'next/navigation';

import { useApp } from '@/components/app/app-provider';
import { DocumentsShelf } from '@/components/registration/documents-shelf';

export default function ClubDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const { contexts } = useApp();
  const caps = capabilitiesForPlace(contexts, 'club', id);
  return <DocumentsShelf owner={{ clubId: id }} canManage={caps.has('documents.manage')} />;
}
