'use client';

import { capabilitiesForPlace, documentAbilities } from '@athleit/core';
import { useParams } from 'next/navigation';

import { useApp } from '@/components/app/app-provider';
import { DocumentsLibrary } from '@/components/documents/documents-library';

export default function ClubDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const { contexts } = useApp();
  const a = documentAbilities(capabilitiesForPlace(contexts, 'club', id));
  return (
    <DocumentsLibrary
      owner={{ clubId: id }}
      can={{ manage: a.upload, seeVisibility: a.seeVisibility }}
      noun="club documents"
    />
  );
}
