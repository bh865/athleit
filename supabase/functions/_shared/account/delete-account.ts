// Account deletion core. Dependencies are injected so it can be unit tested without Deno or Supabase.
// Authorization: the caller is the signed-in user (resolved by the entry point), never a client-supplied id.

export interface Blockers {
  teams: { id: string; name: string }[];
  clubs: { id: string; name: string }[];
  households: { id: string; name: string }[];
  plans: { id: string; name: string }[];
}

export interface DeleteAccountDeps {
  /** public.account_deletion_blockers() run AS the caller. */
  blockers: () => Promise<Blockers>;
  /** Removes every object in the user's avatar folder. */
  removeAvatars: (userId: string) => Promise<void>;
  /** auth.admin.deleteUser (service role). Cascades the user's own rows; kept records null the reference. */
  deleteUser: (userId: string) => Promise<void>;
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; status: 409; error: 'blocked'; blockers: Blockers }
  | { ok: false; status: 400; error: 'confirmation_required' };

export const CONFIRM_WORD = 'DELETE';

export async function deleteAccount(
  userId: string,
  confirm: string,
  deps: DeleteAccountDeps,
): Promise<DeleteResult> {
  if (confirm !== CONFIRM_WORD) return { ok: false, status: 400, error: 'confirmation_required' };
  const blockers = await deps.blockers();
  if (
    blockers.teams.length ||
    blockers.clubs.length ||
    blockers.households.length ||
    blockers.plans.length
  )
    return { ok: false, status: 409, error: 'blocked', blockers };
  // Photos first: if this fails nothing is deleted yet and the user can retry. After the user is
  // gone the folder could no longer be cleaned by anyone but the service role.
  await deps.removeAvatars(userId);
  await deps.deleteUser(userId);
  return { ok: true };
}
