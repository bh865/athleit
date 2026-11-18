'use client';

import {
  PAYMENT_TIMINGS,
  REGISTRATION_KINDS,
  REGISTRATION_VISIBILITIES,
  friendlyError,
  infoBlocksSchema,
  registrationEventDataSchema,
  suggestSlug,
  type InfoBlock,
} from '@athleit/core';
import {
  createRegistrationEvent,
  getRegistrationEvent,
  listForms,
  listWaivers,
  updateRegistrationEvent,
  type Owner,
} from '@athleit/db/registration';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FormMessage } from '@/components/app/states';
import {
  Button,
  Card,
  DatePicker,
  Heading,
  Select,
  Text,
  TextArea,
  TextField,
  TimePicker,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './registration.module.css';

const KIND_LABEL: Record<string, string> = {
  season: 'Season',
  tryout: 'Tryout',
  camp: 'Camp',
  clinic: 'Clinic',
  other: 'Other',
};
const VIS_LABEL: Record<string, string> = {
  public: 'Public: anyone can find it',
  link_only: 'Link only: not listed or indexed',
  members_only: 'Members only: sign-in required',
};
const TIMING_LABEL: Record<string, string> = {
  none: 'Free or pay elsewhere',
  at_submission: 'At sign-up (holds the spot)',
  after_acceptance: 'After you accept',
};

const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

interface InfoState {
  description: string;
  facts: string;
  bring: string;
  agenda: string;
  faq: string;
}
function blocksFromState(s: InfoState): InfoBlock[] {
  const out: InfoBlock[] = [];
  if (s.description.trim()) out.push({ type: 'description', body: s.description.trim() });
  const facts = lines(s.facts)
    .map((l) => {
      const [a, ...b] = l.split(':');
      return { label: (a ?? '').trim(), value: b.join(':').trim() };
    })
    .filter((f) => f.label && f.value);
  if (facts.length) out.push({ type: 'key_facts', items: facts });
  if (lines(s.bring).length) out.push({ type: 'what_to_bring', items: lines(s.bring) });
  const agenda = lines(s.agenda).map((l) => {
    const [a, ...b] = l.split('|');
    return b.length ? { time: (a ?? '').trim(), label: b.join('|').trim() } : { label: l };
  });
  if (agenda.length) out.push({ type: 'agenda', items: agenda });
  const faq = lines(s.faq)
    .map((l) => {
      const [q, ...a] = l.split('::');
      return { question: (q ?? '').trim(), answer: a.join('::').trim() };
    })
    .filter((f) => f.question && f.answer);
  if (faq.length) out.push({ type: 'faq', items: faq });
  return out;
}
function stateFromBlocks(bs: InfoBlock[]): InfoState {
  const s: InfoState = { description: '', facts: '', bring: '', agenda: '', faq: '' };
  for (const b of bs) {
    if (b.type === 'description') s.description = b.body;
    if (b.type === 'key_facts') s.facts = b.items.map((i) => `${i.label}: ${i.value}`).join('\n');
    if (b.type === 'what_to_bring') s.bring = b.items.join('\n');
    if (b.type === 'agenda')
      s.agenda = b.items.map((i) => (i.time ? `${i.time} | ${i.label}` : i.label)).join('\n');
    if (b.type === 'faq') s.faq = b.items.map((i) => `${i.question} :: ${i.answer}`).join('\n');
  }
  return s;
}

/** Event builder (web only). Create or edit a registration event; publishing is done from the management screen. */
/** A date and a time as one local `date T time` string, built from the shared pickers. */
function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [date = '', time = ''] = value.split('T');
  return (
    <div className={styles.stack}>
      <DatePicker
        label={`${label} (date)`}
        value={date}
        onChange={(d) => onChange(d ? `${d}T${time || '09:00'}` : '')}
      />
      <TimePicker
        label={`${label} (time)`}
        value={time}
        onChange={(t) => onChange(date ? `${date}T${t}` : '')}
      />
    </div>
  );
}

export function EventBuilder({ eventId, owner }: { eventId: string | null; owner: Owner }) {
  const client = getClient();
  const router = useRouter();
  const forms = useLoad(() => listForms(client, owner), [owner.teamId, owner.clubId]);
  const waivers = useLoad(() => listWaivers(client, owner), [owner.teamId, owner.clubId]);
  const teams = useLoad(async () => {
    const q = client.from('teams').select('id, name').order('name');
    const { data, error } = await (owner.teamId
      ? q.eq('id', owner.teamId)
      : q.eq('club_id', owner.clubId as string));
    return error
      ? { data: null, error: { message: error.message } }
      : { data: data ?? [], error: null };
  }, [owner.teamId, owner.clubId]);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [kind, setKind] = useState('season');
  const [summary, setSummary] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [location, setLocation] = useState('');
  const [opens, setOpens] = useState('');
  const [closes, setCloses] = useState('');
  const [capacity, setCapacity] = useState('');
  const [waitlist, setWaitlist] = useState(true);
  const [autoPromote, setAutoPromote] = useState(false);
  const [visibility, setVisibility] = useState('link_only');
  const [price, setPrice] = useState('');
  const [timing, setTiming] = useState('none');
  const [holdMinutes, setHoldMinutes] = useState('60');
  const [formId, setFormId] = useState('');
  const [waiverIds, setWaiverIds] = useState<string[]>([]);
  const [targetTeam, setTargetTeam] = useState('');
  const [place, setPlace] = useState(false);
  const [contact, setContact] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const [info, setInfo] = useState<InfoState>({
    description: '',
    facts: '',
    bring: '',
    agenda: '',
    faq: '',
  });
  const [formVersionId, setFormVersionId] = useState<string | null>(null);
  const [waiverVersionIds, setWaiverVersionIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error?: string; success?: string }>({});

  useEffect(() => {
    if (!eventId) return;
    void getRegistrationEvent(client, eventId).then((r) => {
      if (r.error) return setNotice({ error: friendlyError(r.error) });
      const e = r.data;
      setTitle(e.title);
      setSlug(e.slug);
      setSlugTouched(true);
      setKind(e.kind);
      setSummary(e.summary ?? '');
      setStartsOn(e.starts_on ?? '');
      setEndsOn(e.ends_on ?? '');
      setLocation(e.location_text ?? '');
      setOpens(toLocal(e.opens_at));
      setCloses(toLocal(e.closes_at));
      setCapacity(e.capacity ? String(e.capacity) : '');
      setWaitlist(e.waitlist_enabled);
      setAutoPromote(e.auto_promote_waitlist);
      setVisibility(e.visibility);
      setPrice(e.price_cents ? (e.price_cents / 100).toFixed(2) : '');
      setTiming(e.payment_timing);
      setHoldMinutes(String(e.payment_hold_minutes));
      setTargetTeam(e.target_team_id ?? '');
      setPlace(e.roster_behavior === 'propose_placement');
      setContact(e.contact_email ?? '');
      setConfirmation(e.confirmation_message ?? '');
      setCover(e.cover_image_path);
      setFormVersionId(e.form_version_id);
      setWaiverVersionIds(e.waiver_version_ids ?? []);
      const parsed = infoBlocksSchema.safeParse(e.info_blocks);
      if (parsed.success) setInfo(stateFromBlocks(parsed.data));
    });
  }, [client, eventId]);

  const formOptions = (forms.data ?? []).filter((f) => f.form_versions.length > 0);
  const waiverOptions = (waivers.data ?? []).filter((w) => w.waiver_versions.length > 0);
  const latest = <T extends { version: number }>(vs: T[]) =>
    [...vs].sort((a, b) => b.version - a.version)[0];

  async function uploadCover(file: File) {
    const ownerId = owner.teamId ?? owner.clubId;
    const path = `${ownerId}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60)}`;
    const { error } = await client.storage
      .from('registration-covers')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) return setNotice({ error: friendlyError(error) });
    setCover(path);
  }

  async function save() {
    const blocks = blocksFromState(info);
    const priceCents = price ? Math.round(Number(price) * 100) : null;
    const data = {
      title: title.trim(),
      slug: slug || suggestSlug(title),
      kind,
      summary: summary.trim() || null,
      info_blocks: blocks,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      location_text: location.trim() || null,
      opens_at: fromLocal(opens),
      closes_at: fromLocal(closes),
      capacity: capacity ? Number(capacity) : null,
      waitlist_enabled: waitlist,
      auto_promote_waitlist: autoPromote,
      visibility,
      price_cents: priceCents,
      payment_timing: priceCents ? timing : 'none',
      payment_hold_minutes: Number(holdMinutes) || 60,
      target_team_id: targetTeam || null,
      roster_behavior: place ? 'propose_placement' : 'none',
      form_version_id: formId
        ? ((
            latest(
              (formOptions.find((f) => f.id === formId)?.form_versions as {
                id: string;
                version: number;
              }[]) ?? [],
            ) as { id: string } | undefined
          )?.id ?? formVersionId)
        : formVersionId,
      waiver_version_ids: waiverIds.length
        ? waiverIds
            .map(
              (id) =>
                (
                  latest(
                    (waiverOptions.find((w) => w.id === id)?.waiver_versions ?? []) as unknown as {
                      id: string;
                      version: number;
                    }[],
                  ) as { id: string } | undefined
                )?.id,
            )
            .filter((x): x is string => Boolean(x))
        : waiverVersionIds,
      cover_image_path: cover,
      contact_email: contact.trim() || null,
      confirmation_message: confirmation.trim() || null,
    };
    const parsed = registrationEventDataSchema.safeParse(data);
    if (!parsed.success)
      return setNotice({ error: parsed.error.issues[0]?.message ?? 'Check the form.' });
    if (priceCents !== null && priceCents > 0 && timing === 'none')
      return setNotice({ error: 'Choose when to collect payment.' });
    setBusy(true);
    setNotice({});
    const r = eventId
      ? await updateRegistrationEvent(client, eventId, data as never)
      : await createRegistrationEvent(client, owner, data as never);
    setBusy(false);
    if (r.error) return setNotice({ error: friendlyError(r.error) });
    if (!eventId && typeof r.data === 'string') router.replace(`/manage/registration/${r.data}`);
    else setNotice({ success: 'Saved.' });
  }

  return (
    <div className={styles.stack}>
      <Heading as="h1" level="title">
        {eventId ? 'Edit registration' : 'New registration'}
      </Heading>
      <Card>
        <div className={styles.stack}>
          <Heading as="h2">Basics</Heading>
          <TextField
            label="Title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(suggestSlug(e.target.value));
            }}
            maxLength={120}
          />
          <TextField
            label="Web address"
            mono
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setSlugTouched(true);
            }}
            hint="Lower-case letters, numbers and dashes. This becomes /r/your-address."
          />
          <Select
            label="Type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            options={REGISTRATION_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] ?? k }))}
          />
          <TextArea
            label="Short summary"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={500}
            hint="Shown in link previews."
          />
          <DatePicker label="Starts" value={startsOn} onChange={setStartsOn} />
          <DatePicker label="Ends" value={endsOn} onChange={setEndsOn} />
          <TextField
            label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={200}
          />
          <div className={styles.stack}>
            <Text variant="label">Cover image (optional)</Text>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Cover image"
              onChange={(e) => e.target.files?.[0] && void uploadCover(e.target.files[0])}
            />
            {cover ? <Text muted>Cover uploaded.</Text> : null}
          </div>
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <Heading as="h2">Page content</Heading>
          <TextArea
            label="Description"
            rows={5}
            value={info.description}
            onChange={(e) => setInfo({ ...info, description: e.target.value })}
            hint="Plain text. It is shown exactly as typed."
          />
          <TextArea
            label="Key facts (one per line, “Label: value”)"
            rows={3}
            value={info.facts}
            onChange={(e) => setInfo({ ...info, facts: e.target.value })}
          />
          <TextArea
            label="What to bring (one per line)"
            rows={3}
            value={info.bring}
            onChange={(e) => setInfo({ ...info, bring: e.target.value })}
          />
          <TextArea
            label="Schedule (one per line, “9:00 | Check in”)"
            rows={3}
            value={info.agenda}
            onChange={(e) => setInfo({ ...info, agenda: e.target.value })}
          />
          <TextArea
            label="Questions (one per line, “Question :: Answer”)"
            rows={3}
            value={info.faq}
            onChange={(e) => setInfo({ ...info, faq: e.target.value })}
          />
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <Heading as="h2">Who can register</Heading>
          <DateTimeField label="Opens" value={opens} onChange={setOpens} />
          <DateTimeField label="Closes" value={closes} onChange={setCloses} />
          <TextField
            label="Spots (leave blank for no limit)"
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ''))}
          />
          <label className={styles.choice}>
            <input
              type="checkbox"
              checked={waitlist}
              onChange={(e) => setWaitlist(e.target.checked)}
            />{' '}
            Offer a waitlist when full
          </label>
          <label className={styles.choice}>
            <input
              type="checkbox"
              checked={autoPromote}
              onChange={(e) => setAutoPromote(e.target.checked)}
            />{' '}
            Automatically move families up when a spot opens
          </label>
          <Select
            label="Visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            options={REGISTRATION_VISIBILITIES.map((v) => ({ value: v, label: VIS_LABEL[v] ?? v }))}
          />
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <Heading as="h2">Price</Heading>
          <TextField
            label="Price (USD, blank for free)"
            mono
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          {price ? (
            <>
              <Select
                label="Collect payment"
                value={timing}
                onChange={(e) => setTiming(e.target.value)}
                options={PAYMENT_TIMINGS.filter((t) => t !== 'none').map((t) => ({
                  value: t,
                  label: TIMING_LABEL[t] ?? t,
                }))}
              />
              {timing === 'at_submission' && (
                <TextField
                  label="Hold a spot for (minutes)"
                  inputMode="numeric"
                  value={holdMinutes}
                  onChange={(e) => setHoldMinutes(e.target.value.replace(/\D/g, ''))}
                  hint="Unpaid holds are released afterwards. Payment needs an Athleit account."
                />
              )}
              <Text muted>
                Charges use your connected Stripe account. The amount is set here, never by the
                family.
              </Text>
            </>
          ) : null}
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <Heading as="h2">Form and waivers</Heading>
          <Select
            label="Registration form"
            value={formId}
            onChange={(e) => setFormId(e.target.value)}
            options={[
              {
                value: '',
                label: formVersionId ? 'Keep current version' : 'Choose a published form',
              },
              ...formOptions.map((f) => ({ value: f.id, label: f.name })),
            ]}
            hint="The newest published version is used. Publish a form under Registrations first."
          />
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Waivers to sign</legend>
            {waiverOptions.length === 0 ? (
              <Text muted>No published waivers yet.</Text>
            ) : (
              waiverOptions.map((w) => (
                <label key={w.id} className={styles.choice}>
                  <input
                    type="checkbox"
                    checked={waiverIds.includes(w.id)}
                    onChange={(e) =>
                      setWaiverIds(
                        e.target.checked
                          ? [...waiverIds, w.id]
                          : waiverIds.filter((x) => x !== w.id),
                      )
                    }
                  />
                  {w.title}
                </label>
              ))
            )}
            {waiverVersionIds.length > 0 && waiverIds.length === 0 ? (
              <Text muted>
                {waiverVersionIds.length} waiver(s) attached. Tick waivers above to replace them.
              </Text>
            ) : null}
          </fieldset>
        </div>
      </Card>
      <Card>
        <div className={styles.stack}>
          <Heading as="h2">After they register</Heading>
          <label className={styles.choice}>
            <input type="checkbox" checked={place} onChange={(e) => setPlace(e.target.checked)} /> I
            will place accepted players on a team roster
          </label>
          {place && (
            <Select
              label="Default team"
              value={targetTeam}
              onChange={(e) => setTargetTeam(e.target.value)}
              options={[
                { value: '', label: 'Choose a team' },
                ...(teams.data ?? []).map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
          )}
          <TextField
            label="Contact email (shown on the page)"
            type="email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
          <TextArea
            label="Confirmation message"
            rows={3}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            maxLength={1000}
            hint="Shown to accepted families."
          />
        </div>
      </Card>
      <div className={styles.row}>
        <Button disabled={busy || !title.trim()} onClick={() => void save()}>
          {busy ? 'Saving…' : eventId ? 'Save changes' : 'Create draft'}
        </Button>
      </div>
      {notice.error ? <FormMessage error={notice.error} /> : null}
      {notice.success ? <FormMessage success={notice.success} /> : null}
    </div>
  );
}
