'use client';

import {
  SPORT_CONFIG_DEFAULTS,
  effectivePeriodCount,
  friendlyError,
  validateGameResult,
  type GameFormat,
  type PeriodScore,
  type SportConfig,
} from '@athleit/core';
import {
  clearGameResult,
  getSportConfigs,
  recordGameResult,
  type EventDetail,
} from '@athleit/db/scheduling';
import { useEffect, useState } from 'react';

import { FormMessage } from '@/components/app/states';
import { Button, SegmentedControl, Sheet, Text, TextArea, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './schedule.module.css';

const PERIOD_NAME: Record<string, string> = {
  half: 'Half',
  quarter: 'Quarter',
  period: 'Period',
  inning: 'Inning',
  set: 'Set',
};

type Row = { us: string; them: string };
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

/** Game result, shaped by the sport: final score only, or period/inning/set scores that add up. */
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
  const [final, setFinal] = useState<Row>({
    us: event.our_score?.toString() ?? '',
    them: event.their_score?.toString() ?? '',
  });
  const [rows, setRows] = useState<Row[]>(
    existing?.map((p) => ({ us: String(p.us), them: String(p.them) })) ??
      Array.from({ length: count }, () => ({ us: '', them: '' })),
  );
  const [notes, setNotes] = useState(event.result_notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getSportConfigs(getClient()).then((r) => {
      const c = r.data?.find((x) => x.sport === event.sport);
      if (live && c) setConfig({ ...c, positions: c.positions ?? [] } as SportConfig);
    });
    return () => {
      live = false;
    };
  }, [event.sport]);

  const periodName = PERIOD_NAME[config.period_type] ?? 'Period';
  const isSets = config.period_type === 'set';

  function build(): { our: number; their: number; periods: PeriodScore[] | null } | string {
    if (mode === 'final') {
      const our = num(final.us);
      const their = num(final.them);
      if (!Number.isInteger(our) || !Number.isInteger(their) || our < 0 || their < 0)
        return 'Enter both scores.';
      if (isSets)
        return `Add the ${periodName.toLowerCase()} scores; ${config.scoring_label.toLowerCase()} come from them.`;
      return { our, their, periods: null };
    }
    const periods: PeriodScore[] = [];
    for (const r of rows) {
      if (r.us.trim() === '' && r.them.trim() === '') continue;
      const us = num(r.us);
      const them = num(r.them);
      if (!Number.isInteger(us) || !Number.isInteger(them) || us < 0 || them < 0)
        return `Fill in both scores for each ${periodName.toLowerCase()}.`;
      periods.push({ us, them });
    }
    if (periods.length === 0) return `Enter at least one ${periodName.toLowerCase()}.`;
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
    const res = await recordGameResult(
      getClient(),
      event.id,
      built.our,
      built.their,
      built.periods,
      notes || null,
    );
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    onClose();
    onDone();
  }

  async function clear() {
    setBusy(true);
    const res = await clearGameResult(getClient(), event.id);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    onClose();
    onDone();
  }

  const tally = (() => {
    const b = build();
    return typeof b === 'string' ? null : `${b.our}–${b.their}`;
  })();

  return (
    <Sheet open={open} onClose={onClose} title="Game result" level="modal" placement="center">
      <div className={styles.form}>
        <Text variant="heading" as="h2">
          {event.title}
        </Text>
        <SegmentedControl
          label="Result detail"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'final', label: 'Final score' },
            { value: 'periods', label: `By ${PERIOD_NAME[config.period_type]?.toLowerCase()}` },
          ]}
        />
        {mode === 'final' ? (
          <div className={styles.twoCols}>
            <TextField
              label={`Us (${config.scoring_label.toLowerCase()})`}
              inputMode="numeric"
              mono
              value={final.us}
              onChange={(e) => setFinal({ ...final, us: e.target.value })}
            />
            <TextField
              label="Them"
              inputMode="numeric"
              mono
              value={final.them}
              onChange={(e) => setFinal({ ...final, them: e.target.value })}
            />
          </div>
        ) : (
          <>
            {rows.map((r, i) => (
              <div key={i} className={styles.scoreGrid}>
                <span className={styles.scoreLabel}>
                  {periodName} {i + 1}
                </span>
                <TextField
                  label="Us"
                  inputMode="numeric"
                  mono
                  value={r.us}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, us: e.target.value } : x)))
                  }
                />
                <TextField
                  label="Them"
                  inputMode="numeric"
                  mono
                  value={r.them}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, them: e.target.value } : x)))
                  }
                />
              </div>
            ))}
            {!isSets && rows.length < count + 10 ? (
              <Button variant="ghost" onClick={() => setRows([...rows, { us: '', them: '' }])}>
                Add {periodName.toLowerCase()} (overtime)
              </Button>
            ) : null}
            {tally ? (
              <Text muted as="p" role="status">
                {isSets ? `${config.scoring_label}: ` : 'Final: '}
                {tally}
              </Text>
            ) : null}
          </>
        )}
        {!config.ties_allowed ? (
          <Text muted as="p">
            Ties are not allowed in {event.sport}.
          </Text>
        ) : null}
        <TextArea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
        />
        <FormMessage error={error} />
        <div className={styles.actionRow}>
          <Button onClick={submit} loading={busy} data-testid="save-result">
            Save result
          </Button>
          {event.outcome ? (
            <Button variant="ghost" onClick={clear} disabled={busy}>
              Clear result
            </Button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
