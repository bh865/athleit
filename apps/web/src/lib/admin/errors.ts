import { REASON_TOO_SHORT } from '@athleit/core';
import type { AdminErrorCode } from '@athleit/db/admin';

/** Copy for each typed error, using the design's copy deck where it has the wording. */
export function adminErrorMessage(code: AdminErrorCode, fallback?: string): string {
  switch (code) {
    case 'mfa_required':
      return 'Verify to make this change. Your change is kept here and applied right after you verify.';
    case 'not_authorized':
      return 'Your role can’t do this.';
    case 'not_authenticated':
      return 'Your session expired. Sign in again to keep going.';
    case 'reason_required':
      return REASON_TOO_SHORT;
    case 'unknown_setting':
      return 'That setting no longer exists. Reload the page.';
    case 'invalid_setting_value':
    case 'setting_out_of_range':
      return 'That value isn’t allowed for this setting.';
    case 'last_owner':
      return 'This can’t be done. At least one owner must always exist.';
    case 'user_not_found':
      return 'No account has that email.';
    case 'already_admin':
      return 'That person is already an admin.';
    case 'already_enabled':
      return 'Team billing is already on.';
    case 'already_disabled':
      return 'Team billing is already off.';
    case 'report_not_open':
      return 'This report was already reviewed.';
    default:
      return fallback && fallback.length < 160 ? fallback : 'Nothing was changed. Try again.';
  }
}
