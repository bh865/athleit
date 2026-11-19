import { describe, expect, it, vi } from 'vitest';

import {
  deleteAccount,
  type Blockers,
  type DeleteAccountDeps,
} from '../../../supabase/functions/_shared/account/delete-account';

const none: Blockers = { teams: [], clubs: [], households: [], plans: [] };
function deps(blockers: Blockers = none): DeleteAccountDeps & {
  removeAvatars: ReturnType<typeof vi.fn>;
  deleteUser: ReturnType<typeof vi.fn>;
} {
  return {
    blockers: vi.fn().mockResolvedValue(blockers),
    removeAvatars: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
  };
}

describe('deleteAccount', () => {
  it('requires the typed confirmation and touches nothing without it', async () => {
    const d = deps();
    expect(await deleteAccount('u1', 'delete', d)).toMatchObject({ ok: false, status: 400 });
    expect(d.removeAvatars).not.toHaveBeenCalled();
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it('is blocked, with the list, when the user is the only admin somewhere', async () => {
    const b = { ...none, clubs: [{ id: 'c1', name: 'Athleit FC' }] };
    const d = deps(b);
    const r = await deleteAccount('u1', 'DELETE', d);
    expect(r).toEqual({ ok: false, status: 409, error: 'blocked', blockers: b });
    expect(d.deleteUser).not.toHaveBeenCalled();
    expect(d.removeAvatars).not.toHaveBeenCalled();
  });

  it('is blocked when the user is the only guardian of children', async () => {
    const d = deps({ ...none, households: [{ id: 'h1', name: 'Hayes family' }] });
    expect(await deleteAccount('u1', 'DELETE', d)).toMatchObject({ ok: false, status: 409 });
  });

  it('is blocked while a payment plan still has installments to pay', async () => {
    const d = deps({ ...none, plans: [{ id: 'r1', name: 'Season dues · PR-1' }] });
    expect(await deleteAccount('u1', 'DELETE', d)).toMatchObject({ ok: false, status: 409 });
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it('removes the photo and then deletes only the caller', async () => {
    const d = deps();
    const order: string[] = [];
    d.removeAvatars.mockImplementation(async () => void order.push('photos'));
    d.deleteUser.mockImplementation(async () => void order.push('user'));
    expect(await deleteAccount('u1', 'DELETE', d)).toEqual({ ok: true });
    expect(order).toEqual(['photos', 'user']);
    expect(d.deleteUser).toHaveBeenCalledWith('u1');
  });

  it('does not delete the user if the photo cleanup fails, so the user can retry', async () => {
    const d = deps();
    d.removeAvatars.mockRejectedValue(new Error('avatar_remove_failed'));
    await expect(deleteAccount('u1', 'DELETE', d)).rejects.toThrow('avatar_remove_failed');
    expect(d.deleteUser).not.toHaveBeenCalled();
  });
});
