import { DocumentsSection } from '@/components/registration/documents';

import { useTeam } from './team-context';

/** Documents for staff: the same shelf families see, plus visibility, and a note that uploads are on the web. */
export function DocumentsTab() {
  const { team } = useTeam();
  return <DocumentsSection owner={{ teamId: team.id }} staff />;
}
