import { friendlyError } from '@athleit/core';
import {
  getConnectedAccountStatus,
  startConnectOnboarding,
  type Owner,
} from '@athleit/db/payments';
import { componentTokens, radius, space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Icon, Text, useTheme, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

export type PillTone = 'neutral' | 'ok' | 'warn' | 'bad';
type Key = 'not_started' | 'in_review' | 'needs_info' | 'ready' | 'disconnected';

/** Soft status pill with a filled icon: Open, Due in N days, Overdue, Closed, Unpaid, Paid, Waived. */
export function StatusPill({
  tone,
  icon,
  children,
}: {
  tone: PillTone;
  icon: IconName;
  children: string;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const p = {
    neutral: { bg: c.surfaceAlt, fg: c.ink },
    ok: { bg: c.okSoft, fg: c.ok },
    warn: { bg: c.warnSoft, fg: c.warn },
    bad: { bg: c.badSoft, fg: c.bad },
  }[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: space[1],
        paddingVertical: space[1],
        paddingHorizontal: space[3],
        borderRadius: radius.pill,
        backgroundColor: p.bg,
      }}
    >
      <Icon name={icon} weight="fill" size="sm" color={p.fg} />
      <Text variant="caption" style={{ color: p.fg }}>
        {children}
      </Text>
    </View>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{
        height: space[2],
        borderRadius: radius.pill,
        backgroundColor: theme.color.surfaceAlt,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: radius.pill,
          backgroundColor: theme.color.accent,
        }}
      />
    </View>
  );
}

/** Tab pills with counts (Open / Closed / All, All / Unpaid / Paid / Waived). */
export function CountTabs<T extends string>({
  label,
  value,
  onChange,
  tabs,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  tabs: readonly { key: T; label: string; count: number }[];
}) {
  const { theme } = useTheme();
  const c = theme.color;
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        padding: space[1],
        gap: space[1],
        borderRadius: radius.pill,
        backgroundColor: c.surfaceAlt,
      }}
    >
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.key)}
            style={{
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[1],
              paddingHorizontal: space[3],
              borderRadius: radius.pill,
              backgroundColor: on ? c.accent : 'transparent',
            }}
          >
            <Text variant="caption" style={{ color: on ? c.accentInk : c.muted }}>
              {t.label}
            </Text>
            <Text variant="monoSm" style={{ color: on ? c.accentInk : c.muted }}>
              {String(t.count)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  tone?: 'bad';
  icon?: IconName;
}) {
  const { theme } = useTheme();
  const fg = tone === 'bad' ? theme.color.bad : undefined;
  return (
    <Card style={{ flex: 1, minWidth: '45%', padding: space[4], gap: space[1] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
        {icon ? <Icon name={icon} size="sm" color={fg ?? theme.color.muted} /> : null}
        <Text variant="label" muted={!fg} style={fg ? { color: fg } : undefined}>
          {label}
        </Text>
      </View>
      {value}
      <Text variant="caption" muted numberOfLines={1}>
        {sub}
      </Text>
    </Card>
  );
}

/** Payout state: Connect status plus the "go to Stripe" action. */
export function usePayout(owner: Owner, onReady: (r: boolean) => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const st = useLoad(async () => {
    const r = await getConnectedAccountStatus(supabase, owner);
    onReady(!!r.data?.charges_enabled);
    return r;
  }, [owner.teamId, owner.clubId]);
  const s = st.data;
  const key = (s?.exists_account ? s.onboarding_status : 'not_started') as Key;
  const go = async () => {
    setBusy(true);
    const r = await startConnectOnboarding(
      supabase,
      owner,
      'mobile',
      key === 'in_review' ? 'sync' : 'link',
    );
    setBusy(false);
    if (r.error) return toast(friendlyError(r.error), 'danger');
    if (r.data.url) await WebBrowser.openBrowserAsync(r.data.url);
    st.reload();
  };
  return { st, key, busy, go, canManage: !!s?.can_manage };
}
export type Payout = ReturnType<typeof usePayout>;

export function PayoutBadge({ onPress, fill }: { onPress: () => void; fill?: boolean }) {
  const { theme } = useTheme();
  const c = theme.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Payouts · Ready, open payout settings"
      onPress={onPress}
      testID="connect-card"
      style={{
        minHeight: fill ? componentTokens.button.height : 44,
        ...(fill
          ? { flex: 1, justifyContent: 'center' as const }
          : { alignSelf: 'flex-start' as const }),
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingHorizontal: space[4],
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      <Icon name="check-circle" weight="fill" size="sm" color={c.ok} />
      <Text variant="caption">Payouts · Ready</Text>
      <Icon name="caret-down" size="sm" color={c.muted} />
    </Pressable>
  );
}

export function PayoutNotice({ payout }: { payout: Payout }) {
  const { theme } = useTheme();
  const c = theme.color;
  const copy = {
    in_review: {
      warn: true,
      icon: 'hourglass' as const,
      title: 'Payouts in review',
      body: 'We’ll notify you when payouts are ready.',
      cta: '',
    },
    needs_info: {
      warn: true,
      icon: 'warning-circle' as const,
      title: 'Payouts need more info',
      body: 'Add the missing details to turn payouts on.',
      cta: 'Add info',
    },
    disconnected: {
      warn: false,
      icon: 'plugs' as const,
      title: 'Payouts disconnected',
      body: 'Payments can’t be paid out until you reconnect.',
      cta: 'Reconnect',
    },
  }[payout.key as 'in_review' | 'needs_info' | 'disconnected'];
  if (!copy) return null;
  const fg = copy.warn ? c.warn : c.bad;
  return (
    <View
      testID="connect-card"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space[3],
        minHeight: 64,
        paddingVertical: space[3],
        paddingLeft: space[4],
        paddingRight: space[3],
        borderRadius: radius.lg,
        backgroundColor: copy.warn ? c.warnSoft : c.badSoft,
      }}
    >
      <Icon name={copy.icon} weight="fill" size="lg" color={fg} />
      <View style={{ flex: 1, minWidth: 160 }}>
        <Text variant="bodyBold" style={{ color: fg }}>
          {copy.title}
        </Text>
        <Text variant="caption">
          {payout.canManage ? copy.body : 'Ask a team admin to finish payout setup.'}
        </Text>
      </View>
      {payout.canManage && copy.cta ? (
        <Button title={copy.cta} loading={payout.busy} onPress={payout.go} />
      ) : null}
    </View>
  );
}

const STEPS = ['Confirm your team details', 'Add a bank account', 'Start collecting payments'];

export function PayoutSetupTile({ payout }: { payout: Payout }) {
  const { theme } = useTheme();
  const c = theme.color;
  return (
    <Card
      testID="connect-card"
      style={{ borderRadius: radius.xl, padding: space[6], gap: space[3] }}
    >
      <View
        style={{
          height: 96,
          borderRadius: radius.lg,
          backgroundColor: c.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: radius.pill,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="bank" weight="fill" size="xl" color={c.accentInk} />
        </View>
      </View>
      <Text variant="label" muted>
        Payouts · Not set up
      </Text>
      <Text variant="heading">Set up payouts to start collecting</Text>
      <Text muted>Money from payments goes to your bank account. Setup is a one-time step.</Text>
      <View style={{ gap: space[3], marginVertical: space[1] }}>
        {STEPS.map((t, i) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: radius.xs,
                backgroundColor: c.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="monoSm">{String(i + 1)}</Text>
            </View>
            <Text variant="bodyBold">{t}</Text>
          </View>
        ))}
      </View>
      {payout.canManage ? (
        <Button
          title="Set up payouts"
          size="lg"
          icon="arrow-right"
          loading={payout.busy}
          onPress={payout.go}
        />
      ) : (
        <Text variant="caption" muted>
          Ask a team admin to set up payouts.
        </Text>
      )}
    </Card>
  );
}
