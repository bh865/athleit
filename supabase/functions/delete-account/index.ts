// delete-account: the signed-in user deletes their own account. Blocked while they are the only admin of a team
// or club, or the only guardian of a household with players (see public.account_deletion_blockers).
import { deleteAccount } from '../_shared/account/delete-account.ts';
import { json } from '../_shared/payments/http.ts';
import { serviceClient, userFunction } from '../_shared/payments/runtime.ts';

userFunction(
  'delete-account',
  (b) => {
    const confirm = (b as { confirm?: unknown } | null)?.confirm;
    return typeof confirm === 'string' ? { success: true, data: { confirm } } : { success: false };
  },
  { perMinute: 3 },
  async ({ user, input, user$, log }) => {
    const admin = serviceClient();
    const res = await deleteAccount(user.id, input.confirm, {
      blockers: async () => {
        const { data, error } = await user$.rpc('account_deletion_blockers');
        if (error) throw new Error('blockers_failed');
        return data;
      },
      removeAvatars: async (id) => {
        const { data, error } = await admin.storage.from('avatars').list(id, { limit: 100 });
        if (error) throw new Error('avatar_list_failed');
        if (data.length) {
          const { error: e2 } = await admin.storage
            .from('avatars')
            .remove(data.map((f) => `${id}/${f.name}`));
          if (e2) throw new Error('avatar_remove_failed');
        }
      },
      deleteUser: async (id) => {
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw new Error('delete_user_failed');
      },
    });
    if (!res.ok) {
      log('warn', 'delete_refused', { error: res.error });
      return json(
        res.error === 'blocked'
          ? { error: res.error, blockers: res.blockers }
          : { error: res.error },
        res.status,
      );
    }
    log('info', 'account_deleted', {});
    return json({ ok: true });
  },
);
