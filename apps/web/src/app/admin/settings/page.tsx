import { getBillingMetrics, listSettings, listSportConfigs } from '@athleit/db/admin';

import { PageTitle } from '@/components/admin/kit';
import { FeeCard, SettingCard, SettingsGroup, SportCard, type FeeConfigView, type SportView } from '@/components/admin/settings-client';
import { ErrorState } from '@/components/ui';
import { getAdminContext } from '@/lib/admin/context';
import { createClient } from '@/lib/supabase/server';

/** Generated from admin_list_settings(): a new setting is a database row, not UI code. */
export default async function SettingsPage() {
  const ctx = await getAdminContext();
  const supabase = await createClient();
  const [settings, metrics, sports, fee] = await Promise.all([
    listSettings(supabase), getBillingMetrics(supabase), listSportConfigs(supabase),
    supabase.from('fee_config').select('*').eq('is_active', true).maybeSingle(),
  ]);
  if (settings.error) return <><PageTitle title="Settings" /><ErrorState message="Couldn’t load settings. Nothing was changed." /></>;

  const by = metrics.data?.teams_by_state ?? {};
  const trialDays = settings.data.find((s) => s.key === 'team_subscription.trial_days')?.value;
  const counts = {
    trialing: by.trialing ?? 0,
    paying: (by.active ?? 0) + (by.cancel_scheduled ?? 0) + (by.past_due ?? 0),
    teams: 0,
    trialDays: typeof trialDays === 'number' ? trialDays : 0,
  };
  const groups = [...new Set(settings.data.map((s) => s.group))];
  const feeView: FeeConfigView | null = fee.data ? {
    flat: fee.data.platform_fee_flat_cents, bps: fee.data.platform_fee_bps, stripeBps: fee.data.stripe_fee_bps, stripeFixed: fee.data.stripe_fee_fixed_cents,
    refundChargeFull: fee.data.refund_athleit_charge_on_full, refundChargePartial: fee.data.refund_athleit_charge_on_partial,
    refundServiceFull: fee.data.refund_service_fee_on_full, refundServicePartial: fee.data.refund_service_fee_on_partial,
  } : null;

  return (
    <>
      <PageTitle title="Settings" sub="Generated from the setting definitions. Every change asks for a reason and is audited." />
      {groups.map((g) => (
        <SettingsGroup key={g} title={g}>
          {settings.data.filter((s) => s.group === g).map((s) => <SettingCard key={s.key} setting={s} role={ctx.role} counts={counts} />)}
        </SettingsGroup>
      ))}
      {feeView ? <SettingsGroup title="Fees"><FeeCard fee={feeView} role={ctx.role} /></SettingsGroup> : null}
      {sports.data ? (
        <SettingsGroup title="Sports">
          {(sports.data.items as unknown as SportView[]).map((sp) => <SportCard key={sp.sport} sport={sp} role={ctx.role} />)}
        </SettingsGroup>
      ) : null}
    </>
  );
}
