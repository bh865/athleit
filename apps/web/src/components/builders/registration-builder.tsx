'use client';

import {
  REG_STEPS,
  REG_STEP_LABEL,
  SPORTS,
  adaptFormSchema,
  dollarsToCents,
  draftToEventData,
  emptyDraft,
  eventDataValid,
  eventToDraft,
  friendlyError,
  issuesFor,
  previewFacts,
  publishBlockers,
  regIssues,
  stepState,
  suggestSlug,
  type RegDraft,
  type RegStep,
} from '@athleit/core';
import {
  createRegistrationEvent,
  getRegistrationEvent,
  listForms,
  listWaivers,
  setRegistrationEventState,
  updateRegistrationEvent,
  type Owner,
} from '@athleit/db/registration';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { LoadState } from '@/components/app/states';
import { SharePanel } from '@/components/registration/share-panel';
import {
  Badge,
  Button,
  DatePicker,
  Icon,
  IconButton,
  SegmentedControl,
  Select,
  TextArea,
  TextField,
  TimePicker,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './builders.module.css';

type Save = 'idle' | 'saving' | 'saved' | 'error';
const KINDS = [
  { value: 'season', label: 'Season' },
  { value: 'tryout', label: 'Tryout' },
  { value: 'camp', label: 'Camp' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'other', label: 'Other' },
];
const VISIBILITY = [
  { value: 'public', label: 'Public: anyone can find it' },
  { value: 'link_only', label: 'Link only: not listed' },
  { value: 'members_only', label: 'Members only: sign-in required' },
];
const TIMING = [
  { value: 'none', label: 'Choose when to collect' },
  { value: 'at_submission', label: 'At sign-up (holds the spot)' },
  { value: 'after_acceptance', label: 'After you accept' },
];
const latestId = (vs: readonly { id: string; version: number }[] | undefined) =>
  [...(vs ?? [])].sort((a, b) => b.version - a.version)[0]?.id ?? null;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Loads everything the builder needs, then renders it with a ready draft. */
export function RegistrationBuilder({
  eventId,
  owner,
  initialStep,
  pickedForm,
}: {
  eventId: string | null;
  owner: Owner;
  initialStep?: RegStep | null;
  /** Form chosen in the Form builder and returned here. */
  pickedForm?: string | null;
}) {
  const client = getClient();
  const res = useLoad(async () => {
    const [ev, forms, waivers, teams] = await Promise.all([
      eventId
        ? getRegistrationEvent(client, eventId)
        : Promise.resolve({ data: null, error: null }),
      listForms(client, owner),
      listWaivers(client, owner),
      (async () => {
        const q = client.from('teams').select('id, name').order('name');
        const { data, error } = await (owner.teamId
          ? q.eq('id', owner.teamId)
          : q.eq('club_id', owner.clubId as string));
        return error
          ? { data: null, error: { message: error.message } }
          : { data: data ?? [], error: null };
      })(),
    ]);
    const err = ev.error ?? forms.error ?? waivers.error ?? teams.error;
    if (err) return { data: null, error: err };
    return {
      data: {
        ev: ev.data,
        forms: forms.data ?? [],
        waivers: waivers.data ?? [],
        teams: teams.data ?? [],
      },
      error: null,
    };
  }, [eventId, owner.teamId, owner.clubId]);

  if (res.loading || res.error || !res.data)
    return (
      <div className={styles.shell}>
        <div className={styles.stepPane}>
          <LoadState loading={res.loading} error={res.error} onRetry={res.reload}>
            {null}
          </LoadState>
        </div>
      </div>
    );
  const { ev, forms, waivers, teams } = res.data;
  const formId = ev?.form_version_id
    ? (forms.find((f) => f.form_versions.some((v) => v.id === ev.form_version_id))?.id ?? '')
    : '';
  const waiverIds = (ev?.waiver_version_ids ?? [])
    .map((id) => waivers.find((w) => w.waiver_versions.some((v) => v.id === id))?.id)
    .filter((x): x is string => Boolean(x));
  const draft = ev ? eventToDraft(ev as never, formId, waiverIds) : emptyDraft();
  if (pickedForm) draft.formId = pickedForm;
  return (
    <Builder
      owner={owner}
      eventId={eventId}
      slug={ev?.slug ?? ''}
      status={ev?.status ?? 'draft'}
      infoBlocks={ev?.info_blocks ?? []}
      initial={draft}
      forms={forms}
      waivers={waivers}
      teams={teams}
      initialStep={initialStep ?? (pickedForm ? 'form' : 'basics')}
      kept={{
        formVersionId: ev?.form_version_id ?? null,
        waiverVersionIds: ev?.waiver_version_ids ?? [],
      }}
    />
  );
}

type FormRow = {
  id: string;
  name: string;
  draft_schema: unknown;
  form_versions: { id: string; version: number }[];
};
type WaiverRow = { id: string; title: string; waiver_versions: { id: string; version: number }[] };

function Builder({
  owner,
  eventId: initialEventId,
  slug: initialSlug,
  status: initialStatus,
  infoBlocks,
  initial,
  forms,
  waivers,
  teams,
  initialStep,
  kept,
}: {
  owner: Owner;
  eventId: string | null;
  slug: string;
  status: string;
  infoBlocks: unknown;
  initial: RegDraft;
  forms: FormRow[];
  waivers: WaiverRow[];
  teams: { id: string; name: string }[];
  initialStep: RegStep;
  kept: { formVersionId: string | null; waiverVersionIds: string[] };
}) {
  const client = getClient();
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<RegDraft>(initial);
  const [step, setStep] = useState<RegStep>(initialStep);
  const [visited, setVisited] = useState<Set<RegStep>>(
    () =>
      new Set(initialStep === 'basics' ? [] : REG_STEPS.slice(0, REG_STEPS.indexOf(initialStep))),
  );
  const [eventId, setEventId] = useState(initialEventId);
  const [slug, setSlug] = useState(initialSlug);
  const [status, setStatus] = useState(initialStatus);
  const [save, setSave] = useState<Save>(initialEventId ? 'saved' : 'idle');
  const [dirty, setDirty] = useState(false);
  const [device, setDevice] = useState<'mobile' | 'web'>('mobile');
  const [tried, setTried] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  const issues = useMemo(() => regIssues(draft), [draft]);
  const blockers = publishBlockers(draft);
  const form = forms.find((f) => f.id === draft.formId);
  const isDraft = status === 'draft';
  const listHref = owner.teamId ? `/teams/${owner.teamId}/registrations` : '/';
  const set = <K extends keyof RegDraft>(k: K, v: RegDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const err = (field: string, s: RegStep) =>
    visited.has(s) || tried
      ? issuesFor(issues, s).find((i) => i.field === field)?.message
      : undefined;

  function payload(d: RegDraft, withSlug: string) {
    return draftToEventData(d, {
      slug: withSlug,
      formVersionId: d.formId
        ? (latestId(forms.find((f) => f.id === d.formId)?.form_versions) ?? kept.formVersionId)
        : null,
      waiverVersionIds: d.waiverIds.length
        ? d.waiverIds
            .map((id) => latestId(waivers.find((w) => w.id === id)?.waiver_versions))
            .filter((x): x is string => Boolean(x))
        : [],
      infoBlocks,
    });
  }

  /** Save the draft. Returns the event id, or null when it cannot be saved yet (no name, or a value the server would refuse). */
  async function saveNow(quiet = false): Promise<string | null> {
    const d = draftRef.current;
    if (!d.title.trim()) {
      if (!quiet) toast('Add a name first so your progress is saved.', 'danger');
      return null;
    }
    let s = slug || suggestSlug(d.title);
    const data = payload(d, s);
    const ok = eventDataValid(data);
    if (!ok.ok) {
      setSave('error');
      if (!quiet) toast(ok.message, 'danger');
      return null;
    }
    setSave('saving');
    let r = eventId
      ? await updateRegistrationEvent(client, eventId, data as never)
      : await createRegistrationEvent(client, owner, data as never);
    // Two registrations can share a title (Fall Soccer, every year): retry once with a short suffix on the address.
    if (r.error && !eventId) {
      s = `${s.slice(0, 74)}-${Math.random().toString(36).slice(2, 6)}`;
      r = await createRegistrationEvent(client, owner, { ...data, slug: s } as never);
    }
    if (r.error) {
      setSave('error');
      if (!quiet) toast(friendlyError(r.error), 'danger');
      return null;
    }
    const id = eventId ?? (r.data as string);
    if (!eventId) {
      setEventId(id);
      setSlug(s);
      // The URL now names the draft, without remounting the builder.
      window.history.replaceState(null, '', `/manage/registration/${id}/edit`);
    }
    setDirty(false);
    setSave('saved');
    return id;
  }

  // Autosave drafts shortly after the last edit.
  useEffect(() => {
    if (!dirty || !isDraft || !draft.title.trim()) return;
    const t = setTimeout(() => void saveNow(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saveNow reads the latest draft from a ref
  }, [draft, dirty, isDraft]);

  const go = (next: RegStep) => {
    setVisited((v) => new Set(v).add(step));
    setStep(next);
  };
  const idx = REG_STEPS.indexOf(step);

  async function publish() {
    setTried(true);
    if (blockers.length) return;
    setPublishing(true);
    const id = await saveNow();
    if (!id) return setPublishing(false);
    const r = await setRegistrationEventState(client, id, 'publish');
    setPublishing(false);
    if (r.error) return toast(friendlyError(r.error), 'danger');
    setStatus('open');
    setSave('saved');
  }

  /** Leave for the Form builder, keeping this draft: it is saved first and the builder returns here with the form picked. */
  async function toFormBuilder(existing?: string) {
    const id = await saveNow();
    if (!id) {
      setStep('basics');
      return;
    }
    const back = `/manage/registration/${id}/edit?step=form`;
    const o = owner.teamId ? `team=${owner.teamId}` : `club=${owner.clubId}`;
    router.push(
      existing
        ? `/manage/forms/${existing}?returnTo=${encodeURIComponent(back)}`
        : `/manage/forms/new?${o}&returnTo=${encodeURIComponent(back)}`,
    );
  }

  const facts = previewFacts(
    draft,
    form ? adaptFormSchema(form.draft_schema).fields.length : 0,
    form?.name,
  );
  const statusEl =
    save === 'saving' ? (
      <span className={styles.status}>Saving…</span>
    ) : save === 'error' ? (
      <span className={`${styles.status} ${styles.statusBad}`}>Not saved</span>
    ) : dirty ? (
      <span className={styles.status}>Unsaved changes</span>
    ) : save === 'saved' ? (
      <span className={styles.status}>
        <Icon name="check" size="sm" /> {isDraft ? 'Saved' : 'Published'}
      </span>
    ) : (
      <span className={styles.status}>Not saved yet</span>
    );

  if (!isDraft && status === 'open' && eventId && tried)
    return <Published title={draft.title} slug={slug} eventId={eventId} listHref={listHref} />;

  return (
    <div className={styles.shell} data-testid="registration-builder">
      <div className={styles.top}>
        <IconButton icon="x" label="Close builder" onClick={() => router.push(listHref)} />
        <div className={styles.title}>
          <input
            className={styles.titleInput}
            aria-label="Registration name"
            placeholder="Untitled registration"
            maxLength={120}
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </div>
        <Badge tone={isDraft ? 'neutral' : 'success'}>{isDraft ? 'Draft' : cap(status)}</Badge>
        {statusEl}
        <span className={styles.spacer} />
        {eventId && !isDraft ? (
          <Button
            variant="secondary"
            onClick={() => router.push(`/manage/registration/${eventId}`)}
          >
            <Icon name="arrow-square-out" size="sm" /> Manage
          </Button>
        ) : null}
      </div>
      <p className={styles.notice} role="note">
        The registration builder works best on a desktop-width screen.
      </p>

      <div className={styles.body}>
        <nav className={styles.rail} aria-label="Registration steps">
          {REG_STEPS.map((s, i) => {
            const st = stepState(s, issues, visited, tried);
            return (
              <button
                key={s}
                type="button"
                className={`${styles.railItem} ${s === step ? styles.railActive : ''}`}
                aria-current={s === step ? 'step' : undefined}
                onClick={() => go(s)}
              >
                <span
                  className={`${styles.dot} ${st === 'done' ? styles.dotDone : st === 'error' ? styles.dotBad : ''}`}
                >
                  {st === 'done' ? (
                    <Icon name="check" size="sm" />
                  ) : st === 'error' ? (
                    <Icon name="warning" size="sm" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span>
                  {REG_STEP_LABEL[s]}
                  {st === 'error' ? <span className={styles.railNote}>Needs fix</span> : null}
                </span>
              </button>
            );
          })}
        </nav>

        <main className={styles.stepPane}>
          <div className={styles.stepInner}>
            <span className={styles.kicker}>
              Step {idx + 1} of {REG_STEPS.length}
            </span>
            {step === 'basics' && (
              <Basics draft={draft} set={set} err={(f) => err(f, 'basics')} teams={teams} />
            )}
            {step === 'pricing' && (
              <Pricing draft={draft} set={set} err={(f) => err(f, 'pricing')} />
            )}
            {step === 'dates' && <Dates draft={draft} set={set} err={(f) => err(f, 'dates')} />}
            {step === 'form' && (
              <FormStep
                draft={draft}
                set={set}
                forms={forms}
                waivers={waivers}
                err={(f) => err(f, 'form')}
                onCreate={() => void toFormBuilder()}
                onEdit={(id) => void toFormBuilder(id)}
                teamId={owner.teamId}
              />
            )}
            {step === 'review' && (
              <Review
                draft={draft}
                blockers={blockers}
                facts={facts}
                formName={form?.name ?? ''}
                waiverTitles={draft.waiverIds.map(
                  (id) => waivers.find((w) => w.id === id)?.title ?? '',
                )}
                onEdit={go}
              />
            )}
          </div>
        </main>

        <aside className={styles.preview} aria-label="Live preview">
          <span className={styles.kicker}>Live preview</span>
          <SegmentedControl
            label="Preview device"
            value={device}
            options={[
              { value: 'mobile', label: 'Mobile' },
              { value: 'web', label: 'Web' },
            ]}
            onChange={setDevice}
          />
          <div
            className={device === 'mobile' ? styles.phone : `${styles.phone} ${styles.phoneWide}`}
          >
            <span className={styles.kicker}>{owner.teamId ? 'Your team' : 'Your club'}</span>
            <h3 className={styles.section}>{facts.title}</h3>
            {facts.meta ? <span className={styles.muted}>{facts.meta}</span> : null}
            <div className={styles.reviewRow}>
              <span className={styles.muted}>Fee</span>
              <strong>{facts.fee}</strong>
            </div>
            <div className={styles.reviewRow}>
              <span className={styles.muted}>Spots</span>
              <strong>{facts.spots}</strong>
            </div>
            {facts.dates ? (
              <span className={styles.factRow}>
                <Icon name="calendar-blank" size="sm" /> {facts.dates}
              </span>
            ) : null}
            <span className={styles.factRow}>
              <Icon name="list-checks" size="sm" /> {facts.forms}
            </span>
            <span className={styles.factRow}>
              <Icon name="file-text" size="sm" /> {facts.waivers}
            </span>
            <Button disabled>Register</Button>
          </div>
        </aside>
      </div>

      <div className={styles.bottom}>
        <Button variant="secondary" disabled={idx === 0} onClick={() => go(REG_STEPS[idx - 1]!)}>
          <Icon name="arrow-left" size="sm" /> Back
        </Button>
        <span className={styles.spacer} />
        <Button
          variant="secondary"
          onClick={() => void saveNow().then((id) => id && toast('Draft saved'))}
        >
          {isDraft ? 'Save as draft' : 'Save changes'}
        </Button>
        {step !== 'review' ? (
          <Button onClick={() => go(REG_STEPS[idx + 1]!)}>
            Continue <Icon name="arrow-right" size="sm" />
          </Button>
        ) : isDraft ? (
          <Button
            loading={publishing}
            disabled={blockers.length > 0}
            onClick={() => void publish()}
          >
            {blockers.length ? (
              <>
                <Icon name="warning-circle" size="sm" /> Fix {blockers.length}{' '}
                {blockers.length === 1 ? 'issue' : 'issues'} to publish
              </>
            ) : (
              <>
                <Icon name="rocket-launch" size="sm" /> Publish registration
              </>
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- steps
type SetFn = <K extends keyof RegDraft>(k: K, v: RegDraft[K]) => void;
const Switch = ({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className={styles.switchRow}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <strong>{label}</strong>
      {hint ? <span className={styles.muted}> {hint}</span> : null}
    </span>
  </label>
);
const Heading = ({ title, hint }: { title: string; hint?: string }) => (
  <div>
    <h1 className={styles.section}>{title}</h1>
    {hint ? <p className={styles.muted}>{hint}</p> : null}
  </div>
);

function Basics({
  draft,
  set,
  err,
  teams,
}: {
  draft: RegDraft;
  set: SetFn;
  err: (f: string) => string | undefined;
  teams: { id: string; name: string }[];
}) {
  return (
    <>
      <Heading title="Registration details" hint="What parents see first." />
      <div className={styles.stack}>
        <TextField
          label="Registration name"
          value={draft.title}
          error={err('title')}
          maxLength={120}
          onChange={(e) => set('title', e.target.value)}
        />
        <div className={styles.grid2}>
          <Select
            label="Type"
            value={draft.kind}
            options={KINDS}
            onChange={(e) => set('kind', e.target.value)}
          />
          <Select
            label="Sport"
            value={draft.sport}
            options={[
              { value: '', label: 'Any' },
              ...SPORTS.map((s) => ({ value: s, label: cap(s) })),
            ]}
            onChange={(e) => set('sport', e.target.value)}
          />
        </div>
        <div className={styles.grid2}>
          <TextField
            label="Youngest age"
            inputMode="numeric"
            value={draft.ageMin}
            error={err('ageMin')}
            onChange={(e) => set('ageMin', e.target.value)}
          />
          <TextField
            label="Oldest age"
            inputMode="numeric"
            value={draft.ageMax}
            error={err('ageMax')}
            onChange={(e) => set('ageMax', e.target.value)}
          />
        </div>
        <TextArea
          label="Description"
          rows={4}
          value={draft.summary}
          maxLength={500}
          onChange={(e) => set('summary', e.target.value)}
        />
      </div>
      <Heading title="Where and who" />
      <div className={styles.stack}>
        <TextField
          label="Location"
          value={draft.locationText}
          maxLength={200}
          onChange={(e) => set('locationText', e.target.value)}
        />
        <Select
          label="Team"
          value={draft.targetTeamId}
          options={[
            { value: '', label: 'No team placement' },
            ...teams.map((t) => ({ value: t.id, label: t.name })),
          ]}
          onChange={(e) => set('targetTeamId', e.target.value)}
        />
        {draft.targetTeamId ? (
          <Switch
            label="Place accepted players on the roster"
            hint="Propose a roster spot on this team when you accept a registration."
            checked={draft.placeOnRoster}
            onChange={(v) => set('placeOnRoster', v)}
          />
        ) : null}
        <TextField
          label="Contact email"
          type="email"
          value={draft.contactEmail}
          error={err('contactEmail')}
          onChange={(e) => set('contactEmail', e.target.value)}
        />
        <Select
          label="Visibility"
          value={draft.visibility}
          options={VISIBILITY}
          onChange={(e) => set('visibility', e.target.value as RegDraft['visibility'])}
        />
      </div>
    </>
  );
}

function Pricing({
  draft,
  set,
  err,
}: {
  draft: RegDraft;
  set: SetFn;
  err: (f: string) => string | undefined;
}) {
  const paid = (dollarsToCents(draft.price) ?? 0) > 0;
  return (
    <>
      <Heading title="Pricing" hint="Charged per player at checkout." />
      <div className={styles.stack}>
        <TextField
          label="Base fee ($)"
          inputMode="decimal"
          mono
          value={draft.price}
          error={err('price')}
          onChange={(e) => set('price', e.target.value)}
          hint="Leave empty for a free registration."
        />
        {paid ? (
          <Select
            label="Collect payment"
            value={draft.paymentTiming}
            options={TIMING}
            error={err('paymentTiming')}
            onChange={(e) => set('paymentTiming', e.target.value as RegDraft['paymentTiming'])}
          />
        ) : null}
      </div>
      <Heading title="Capacity" />
      <div className={styles.stack}>
        <TextField
          label="Maximum players"
          inputMode="numeric"
          value={draft.capacity}
          error={err('capacity')}
          onChange={(e) => set('capacity', e.target.value)}
          hint="Leave empty for no limit."
        />
        <Switch
          label="Waitlist"
          hint="Parents can join once the registration is full."
          checked={draft.waitlist}
          onChange={(v) => set('waitlist', v)}
        />
        {draft.waitlist ? (
          <Switch
            label="Promote automatically"
            hint="Move the next family up when a spot opens."
            checked={draft.autoPromote}
            onChange={(v) => set('autoPromote', v)}
          />
        ) : null}
      </div>
    </>
  );
}

/** A date and a time from the shared pickers, as one local `YYYY-MM-DDTHH:mm` value. */
function DateTime({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
}) {
  const [date = '', time = ''] = value.split('T');
  return (
    <div className={styles.stack}>
      <DatePicker
        label={label}
        value={date}
        error={error}
        onChange={(d) => onChange(d ? `${d}T${time || '09:00'}` : '')}
      />
      <TimePicker
        label={`${label} time`}
        value={time}
        onChange={(t) => onChange(date ? `${date}T${t}` : '')}
      />
    </div>
  );
}

function Dates({
  draft,
  set,
  err,
}: {
  draft: RegDraft;
  set: SetFn;
  err: (f: string) => string | undefined;
}) {
  return (
    <>
      <Heading title="Registration window" />
      <div className={styles.grid2}>
        <DateTime label="Opens" value={draft.opensAt} onChange={(v) => set('opensAt', v)} />
        <DateTime
          label="Closes"
          value={draft.closesAt}
          error={err('closesAt')}
          onChange={(v) => set('closesAt', v)}
        />
      </div>
      <Heading title="Season" />
      <div className={styles.grid2}>
        <DatePicker
          label="First practice"
          value={draft.startsOn}
          onChange={(v) => set('startsOn', v)}
        />
        <DatePicker
          label="Last game"
          value={draft.endsOn}
          error={err('endsOn')}
          onChange={(v) => set('endsOn', v)}
        />
      </div>
    </>
  );
}

function FormStep({
  draft,
  set,
  forms,
  waivers,
  err,
  onCreate,
  onEdit,
  teamId,
}: {
  draft: RegDraft;
  set: SetFn;
  forms: FormRow[];
  waivers: WaiverRow[];
  err: (f: string) => string | undefined;
  onCreate: () => void;
  onEdit: (id: string) => void;
  teamId: string | undefined;
}) {
  const published = waivers.filter((w) => w.waiver_versions.length > 0);
  return (
    <>
      <Heading title="Registration form" hint="Parents answer this form when they register." />
      <div className={styles.stack} role="radiogroup" aria-label="Registration form">
        {forms.map((f) => {
          const ready = f.form_versions.length > 0;
          const on = draft.formId === f.id;
          return (
            <div key={f.id} className={styles.row}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!ready}
                className={`${styles.pick} ${on ? styles.pickOn : ''}`}
                onClick={() => set('formId', on ? '' : f.id)}
              >
                <Icon
                  name={on ? 'check-circle' : 'clipboard-text'}
                  weight={on ? 'fill' : 'regular'}
                />
                <span>
                  <strong>{f.name}</strong>
                  <span className={styles.muted}>
                    {' '}
                    {adaptFormSchema(f.draft_schema).fields.length} questions
                    {ready ? '' : ' · publish it in the Form builder first'}
                  </span>
                </span>
              </button>
              {on ? (
                <Button variant="secondary" onClick={() => onEdit(f.id)}>
                  <Icon name="arrow-square-out" size="sm" /> Edit in Form builder
                </Button>
              ) : null}
            </div>
          );
        })}
        {err('formId') ? (
          <span className={styles.err} role="alert">
            <Icon name="warning-circle" size="sm" /> {err('formId')}
          </span>
        ) : null}
        <div>
          <Button variant="secondary" onClick={onCreate}>
            <Icon name="plus" size="sm" /> Create new form
          </Button>
        </div>
      </div>
      <Heading
        title="Waivers"
        hint="Every waiver you select is required before a parent can submit."
      />
      <div className={styles.stack}>
        {published.length === 0 ? (
          <p className={styles.muted}>No published waivers yet. Create one from the Waivers tab.</p>
        ) : (
          published.map((w) => (
            <Switch
              key={w.id}
              label={w.title}
              checked={draft.waiverIds.includes(w.id)}
              onChange={(v) =>
                set(
                  'waiverIds',
                  v ? [...draft.waiverIds, w.id] : draft.waiverIds.filter((x) => x !== w.id),
                )
              }
            />
          ))
        )}
        {teamId ? (
          <div>
            <a className={styles.muted} href={`/manage/waivers/new?team=${teamId}`}>
              Create a new waiver
            </a>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Review({
  draft,
  blockers,
  facts,
  formName,
  waiverTitles,
  onEdit,
}: {
  draft: RegDraft;
  blockers: string[];
  facts: ReturnType<typeof previewFacts>;
  formName: string;
  waiverTitles: string[];
  onEdit: (s: RegStep) => void;
}) {
  const card = (step: RegStep, rows: [string, string][]) => (
    <div className={styles.reviewCard}>
      <div className={`${styles.row} ${styles.between}`}>
        <h2 className={styles.section}>{REG_STEP_LABEL[step]}</h2>
        <Button variant="ghost" onClick={() => onEdit(step)}>
          Edit
        </Button>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className={styles.reviewRow}>
          <span className={styles.muted}>{k}</span>
          <span>{v || 'Not set'}</span>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <Heading title="Review" />
      {blockers.length === 0 ? (
        <div className={`${styles.checklist} ${styles.checkOk}`} role="status">
          <Icon name="check-circle" /> Everything looks good. Parents can register as soon as you
          publish.
        </div>
      ) : (
        <ul className={`${styles.checklist} ${styles.checkBad}`} role="alert">
          <li>
            <strong>
              <Icon name="warning" size="sm" /> {blockers.length}{' '}
              {blockers.length === 1 ? 'thing' : 'things'} to fix before you publish
            </strong>
          </li>
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {card('basics', [
        ['Name', facts.title === 'Untitled registration' ? '' : facts.title],
        ['Location', draft.locationText],
        ['Ages', facts.meta.split(' · ')[0] ?? ''],
      ])}
      {card('pricing', [
        ['Fee', facts.fee],
        ['Spots', facts.spots + (draft.waitlist ? ' + waitlist' : '')],
      ])}
      {card('dates', [
        ['Closes', draft.closesAt.replace('T', ' ')],
        ['Season', [draft.startsOn, draft.endsOn].filter(Boolean).join(' to ')],
      ])}
      {card('form', [
        ['Form', formName || 'None selected'],
        ['Waivers', waiverTitles.filter(Boolean).join(', ') || 'None'],
      ])}
    </>
  );
}

function Published({
  title,
  slug,
  eventId,
  listHref,
}: {
  title: string;
  slug: string;
  eventId: string;
  listHref: string;
}) {
  const router = useRouter();
  return (
    <div className={styles.shell} data-testid="registration-published">
      <div className={styles.stepPane}>
        <div className={`${styles.stepInner} ${styles.center}`}>
          <Icon name="check-circle" size="xl" weight="fill" />
          <h1 className={styles.section}>Registration is live</h1>
          <p className={styles.muted}>
            {title} is open. Share the link with families or let them find it from the team page.
          </p>
          <SharePanel path={`/r/${slug}`} title={title} />
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => router.push(listHref)}>
              <Icon name="arrow-left" size="sm" /> Back to Registrations
            </Button>
            <Button onClick={() => router.push(`/manage/registration/${eventId}`)}>
              <Icon name="arrow-square-out" size="sm" /> View registration
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ReactNode };
