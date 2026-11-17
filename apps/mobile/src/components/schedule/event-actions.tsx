import {
  EDIT_SCOPES,
  EDIT_SCOPE_LABELS,
  SPORT_CONFIG_DEFAULTS,
  effectivePeriodCount,
  friendlyError,
  validateGameResult,
  type EditScope,
  type GameFormat,
  type PeriodScore,
  type SportConfig,
} from '@athleit/core';
import {
  cancelEvent,
  clearGameResult,
  getSportConfigs,
  recordGameResult,
  type EventDetail,
} from '@athleit/db/scheduling';
import { space } from '@athleit/tokens';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Choice, FormMessage } from '@/components/app/kit';
import { Button, Sheet, Text, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const PERIOD_NAME: Record<string, string> = {
  half: 'Half',
  quarter: 'Quarter',
  period: 'Period',
  inning: 'Inning',
  set: 'Set',
};
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

/** Cancel flow: a reason is required; series events also pick a scope. */
export function CancelSheet({
  open,
  onClose,
  event,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  event: EventDetail;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<EditScope>('this');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError(null);
    const res = await cancelEvent(supabase, event.id, event.series_id ? scope : 'this', reason);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setReason('');
    onClose();
    onDone();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Cancel event" level="modal">
      <View style={{ gap: space[4] }}>
        <Text variant="heading">Cancel “{event.title}”?</Text>
        <Text muted>Families are told, and the event stays on the schedule marked cancelled.</Text>
        {event.series_id ? (
          <Choice
            label="Apply to"
            value={scope}
            onChange={setScope}
            options={EDIT_SCOPES.map((s) => ({ value: s, label: EDIT_SCOPE_LABELS[s] }))}
          />
        ) : null}
        <TextField
          label="Reason (shown to families)"
          value={reason}
          onChangeText={setReason}
          maxLength={300}
        />
        <FormMessage error={error} />
        <Button
          title="Cancel event"
          onPress={submit}
          loading={busy}
          disabled={reason.trim().length === 0}
          testID="confirm-cancel"
        />
        <Button title="Keep event" variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}

/** Game result shaped by the sport: final score, or period / inning / set scores that add up. */
export function ResultSheet({
  open,
  onClose,
  event,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  event: EventDetail;
  onDone: () => void;
}) {
  const [config, setConfig] = useState<SportConfig>(SPORT_CONFIG_DEFAULTS[event.sport]);
  const format = (event.game_format ?? null) as GameFormat | null;
  const count = effectivePeriodCount(config, format);
  const existing = (event.period_scores ?? null) as PeriodScore[] | null;
  const [mode, setMode] = useState<'final' | 'periods'>(existing ? 'periods' : 'final');
  const [final, setFinal] = useState({
    us: event.our_score?.toString() ?? '',
    them: event.their_score?.toString() ?? '',
  });
  const [rows, setRows] = useState(
    existing?.map((p) => ({ us: String(p.us), them: String(p.them) })) ??
      Array.from({ length: count }, () => ({ us: '', them: '' })),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getSportConfigs(supabase).then((r) => {
      const c = r.data?.find((x) => x.sport === event.sport);
      if (live && c) setConfig({ ...c, positions: c.positions ?? [] } as SportConfig);
    });
    return () => {
      live = false;
    };
  }, [event.sport]);

  const name = PERIOD_NAME[config.period_type] ?? 'Period';
  const isSets = config.period_type === 'set';

  function build(): { our: number; their: number; periods: PeriodScore[] | null } | string {
    if (mode === 'final') {
      const our = num(final.us);
      const their = num(final.them);
      if (!Number.isInteger(our) || !Number.isInteger(their) || our < 0 || their < 0)
        return 'Enter both scores.';
      if (isSets) return `Add the ${name.toLowerCase()} scores; sets won come from them.`;
      return { our, their, periods: null };
    }
    const periods: PeriodScore[] = [];
    for (const r of rows) {
      if (r.us.trim() === '' && r.them.trim() === '') continue;
      const us = num(r.us);
      const them = num(r.them);
      if (!Number.isInteger(us) || !Number.isInteger(them) || us < 0 || them < 0)
        return `Fill in both scores for each ${name.toLowerCase()}.`;
      periods.push({ us, them });
    }
    if (periods.length === 0) return `Enter at least one ${name.toLowerCase()}.`;
    const our = isSets
      ? periods.filter((p) => p.us > p.them).length
      : periods.reduce((a, p) => a + p.us, 0);
    const their = isSets
      ? periods.filter((p) => p.us < p.them).length
      : periods.reduce((a, p) => a + p.them, 0);
    return { our, their, periods };
  }

  async function submit() {
    const built = build();
    if (typeof built === 'string') return setError(built);
    const problem = validateGameResult(
      config,
      { our_score: built.our, their_score: built.their, period_scores: built.periods },
      format,
    );
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const res = await recordGameResult(supabase, event.id, built.our, built.their, built.periods);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    onClose();
    onDone();
  }
  async function clear() {
    setBusy(true);
    const res = await clearGameResult(supabase, event.id);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    onClose();
    onDone();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Game result">
      <View style={{ gap: space[4] }}>
        <Text variant="heading">{event.title}</Text>
        <Choice
          label="Result detail"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'final', label: 'Final score' },
            { value: 'periods', label: `By ${name.toLowerCase()}` },
          ]}
        />
        {mode === 'final' ? (
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <View style={{ flex: 1 }}>
              <TextField label="Us" mono keyboardType="number-pad" value={final.us} onChangeText={(v) => setFinal({ ...final, us: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Them" mono keyboardType="number-pad" value={final.them} onChangeText={(v) => setFinal({ ...final, them: v })} />
            </View>
          </View>
        ) : (
          <>
            {rows.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <TextField label={`${name} ${i + 1}: us`} mono keyboardType="number-pad" value={r.us} onChangeText={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, us: v } : x)))} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label="Them" mono keyboardType="number-pad" value={r.them} onChangeText={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, them: v } : x)))} />
                </View>
              </View>
            ))}
            {!isSets && rows.length < count + 10 ? (
              <Button title={`Add ${name.toLowerCase()} (overtime)`} variant="ghost" onPress={() => setRows([...rows, { us: '', them: '' }])} />
            ) : null}
          </>
        )}
        {!config.ties_allowed ? <Text muted>Ties are not allowed in {event.sport}.</Text> : null}
        <FormMessage error={error} />
        <Button title="Save result" onPress={submit} loading={busy} testID="save-result" />
        {event.outcome ? <Button title="Clear result" variant="ghost" onPress={clear} disabled={busy} /> : null}
      </View>
    </Sheet>
  );
}
