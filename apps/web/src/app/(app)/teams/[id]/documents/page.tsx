'use client';

import { useTeam } from '@/components/app/team-context';
import { DocumentsShelf } from '@/components/registration/documents-shelf';

export default function DocumentsPage() {
  const { team, caps } = useTeam();
  return <DocumentsShelf owner={{ teamId: team.id }} canManage={caps.has('documents.manage')} />;
}
