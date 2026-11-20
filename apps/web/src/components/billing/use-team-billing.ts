'use client';

import { type BillingTerms, type TeamBillingView } from '@athleit/core';
import { getBillingTerms, getTeamBilling } from '@athleit/db/billing';

import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

/** The team's billing status (what the caller may see) and the server's terms. Both come from the database, never from copy. */
export function useTeamBilling(teamId: string) {
  const billing = useLoad(async () => {
    const r = await getTeamBilling(getClient(), teamId);
    return r as typeof r & { data: TeamBillingView | null };
  }, [teamId]);
  const terms = useLoad(async () => {
    const r = await getBillingTerms(getClient());
    return r as typeof r & { data: (BillingTerms & { trial_reminder_days?: number[] }) | null };
  }, []);
  return {
    view: billing.data,
    terms: terms.data,
    loading: billing.loading || terms.loading,
    error: billing.error,
    reload: billing.reload,
  };
}
