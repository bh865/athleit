'use client';

import { documentAbilities } from '@athleit/core';

import { DocumentsLibrary } from '@/components/documents/documents-library';
import { useTeam } from '@/components/app/team-context';
import { Button, Icon } from '@/components/ui';

import { HeaderAction } from './team-hub';

/** Documents for staff: the shared library with Upload as the page's one primary action. */
export function DocumentsTab() {
  const { team, caps } = useTeam();
  const a = documentAbilities(caps);
  return (
    <DocumentsLibrary
      owner={{ teamId: team.id }}
      can={{ manage: a.upload, seeVisibility: a.seeVisibility }}
      primary={(open) => (
        <HeaderAction>
          <Button onClick={open}>
            <Icon name="upload-simple" size="sm" /> Upload document
          </Button>
        </HeaderAction>
      )}
    />
  );
}
