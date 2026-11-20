import {
  claimBanner,
  inviteBanner,
  linkProblemCopy,
  type InviteKind,
  type PublicPreviewOutcome,
} from '@athleit/core';
import { previewClaimPublic, previewInvitePublic } from '@athleit/db/api';

import { createClient } from '@/lib/supabase/server';

export type LinkBannerData =
  | { kind: 'banner'; title: string; body: string }
  | { kind: 'problem'; title: string; body: string };

const INVITE = /^\/invite\/([^/?#]+)/;
const CLAIM = /^\/claim\/([0-9a-fA-F-]{36})(?:[/?#]|$)/;

/**
 * The invite or claim link the person was heading to (`next`), as the words shown above the form.
 * Reads only the signed-out preview, which returns a name, a role and a first name, nothing else.
 */
export async function linkBannerFor(next: string | undefined): Promise<LinkBannerData | null> {
  if (!next) return null;
  const invite = INVITE.exec(next);
  const claim = CLAIM.exec(next);
  if (!invite?.[1] && !claim?.[1]) return null;
  const client = await createClient();

  if (invite?.[1]) {
    const res = await previewInvitePublic(client as never, decodeURIComponent(invite[1]));
    const row = res.data?.[0];
    const outcome = (row?.outcome ?? 'invalid') as PublicPreviewOutcome;
    if (row && outcome === 'ok') {
      return {
        kind: 'banner',
        ...inviteBanner({
          kind: row.kind as InviteKind,
          targetName: row.target_name ?? '',
          role: row.role ?? '',
          inviterFirstName: row.inviter_first_name,
        }),
      };
    }
    return { kind: 'problem', ...linkProblemCopy(outcome === 'ok' ? 'invalid' : outcome) };
  }

  const res = await previewClaimPublic(client as never, claim![1] as string);
  const row = res.data?.[0];
  const outcome = (row?.outcome ?? 'invalid') as PublicPreviewOutcome;
  if (row && outcome === 'ok') return { kind: 'banner', ...claimBanner(row.player_first_name) };
  return { kind: 'problem', ...linkProblemCopy(outcome === 'ok' ? 'invalid' : outcome) };
}
