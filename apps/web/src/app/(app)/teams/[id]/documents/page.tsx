'use client';

import { documentAbilities } from '@athleit/core';

import { useTeam } from '@/components/app/team-context';
import { DocumentsLibrary } from '@/components/documents/documents-library';
import { DocumentsTab } from '@/components/team/documents-tab';
import { PageHeader } from '@/components/ui';

/** Staff get the library inside the tab row; parents and players get the same library, read-only, with no tabs. */
export default function DocumentsPage() {
  const { team, caps } = useTeam();
  if (caps.has('team.details')) return <DocumentsTab />;
  const a = documentAbilities(caps);
  return (
    <>
      <PageHeader title={team.name} subtitle="Documents" />
      <DocumentsLibrary
        owner={{ teamId: team.id }}
        can={{ manage: false, seeVisibility: a.seeVisibility }}
      />
    </>
  );
}
