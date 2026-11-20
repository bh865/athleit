'use client';
// Contact support: one form for signed-in and signed-out people. Typed text is never cleared on an error.
// Copy marked Placeholder is business-dependent (response times, hours, contact email) and lives in COPY below.
import {
  createSupportRequest,
  finalizeSupportAttachments,
  submitPublicSupportRequest,
  supportErrorCode,
  type SupportType,
} from '@athleit/db/support';
import { loadContextSource } from '@athleit/db/api';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Captcha } from '@/components/registration/turnstile';
import {
  Button,
  Card,
  Heading,
  SegmentedControl,
  Select,
  Text,
  TextArea,
  TextField,
} from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

import styles from './help.module.css';
import { useDocsSearch, type SearchDoc } from './search-box';

const BUCKET = 'support-attachments';
const TYPES = [
  { value: 'question', label: 'Question' },
  { value: 'problem', label: 'Something’s wrong' },
  { value: 'billing', label: 'Billing or payment' },
  { value: 'feedback', label: 'Idea or feedback' },
] as const satisfies readonly { value: SupportType; label: string }[];

const COPY = {
  helper: {
    question: 'Ask anything about using Athleit.',
    problem: 'Tell us what you expected and what happened instead.',
    billing: 'Tell us which payment or subscription this is about.',
    feedback: 'We read every idea; we can’t reply to all.',
  } satisfies Record<SupportType, string>,
  privacy: 'Please don’t include children’s birthdates, medical details or card numbers.',
  safety:
    'If a child is in danger, call your local emergency number. To report a message or a person in Athleit, use Report in the conversation.',
  next: 'A person reads every request and replies by email. We can’t promise a time.', // Placeholder: confirm response-time wording
  rate: 'You’ve sent a few requests already. Please wait a bit before sending another.',
  held: 'We’ve received your request and are checking it.',
};

const MB = 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';

interface Ctx {
  teams: { id: string; name: string }[];
  clubs: { id: string; name: string }[];
  role: string | null;
}
type Done = { ref: string; held: boolean; email: string | null; signedIn: boolean };

function diagnostics(role: string | null): Record<string, string> {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Other';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Other';
  let route = '/help/contact';
  try {
    const r = new URL(document.referrer);
    if (r.origin === location.origin)
      route = r.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id');
  } catch {
    /* no referrer */
  }
  return {
    platform: 'web',
    os,
    browser,
    route,
    ...(role ? { role } : {}),
    at: new Date().toISOString(),
  };
}

export function ContactForm({
  docs,
  article,
  q,
  type: initialType,
}: {
  docs: SearchDoc[];
  article: string | null;
  q: string;
  type: SupportType;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<{ id: string; email: string } | null | undefined>(undefined);
  const [ctx, setCtx] = useState<Ctx>({ teams: [], clubs: [], role: null });
  const [type, setType] = useState<SupportType>(initialType);
  const [subject, setSubject] = useState(q);
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [place, setPlace] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [withDiag, setWithDiag] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [capKey, setCapKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [suggestQ, setSuggestQ] = useState('');
  const errRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return setUser(null);
      setUser({ id: u.id, email: u.email ?? '' });
      const r = await loadContextSource(supabase, u.id);
      if (!r.error) {
        const roles = r.data.teams.map((t) => t.role);
        setCtx({
          teams: r.data.teams.map((t) => ({ id: t.team_id, name: t.name })),
          clubs: r.data.clubs.map((c) => ({ id: c.club_id, name: c.name })),
          role: roles.includes('admin')
            ? 'team admin'
            : roles.includes('coach')
              ? 'coach'
              : roles.includes('manager')
                ? 'manager'
                : r.data.households.length
                  ? 'parent'
                  : null,
        });
      }
    })();
  }, [supabase]);

  useEffect(() => {
    const t = setTimeout(() => setSuggestQ(subject), 300);
    return () => clearTimeout(t);
  }, [subject]);
  const suggestions = useDocsSearch(docs, suggestQ).slice(0, 3);

  const signedIn = Boolean(user);
  const maxFiles = 3; // Placeholder: support.max_attachments
  const maxBytes = 10 * MB; // Placeholder: support.max_attachment_mb

  function addFiles(list: FileList | null) {
    setFileError(null);
    const next = [...files];
    for (const f of Array.from(list ?? [])) {
      if (!ACCEPT.split(',').includes(f.type))
        return setFileError(`“${f.name}” isn’t an allowed type. Use an image or a PDF.`);
      if (f.size > maxBytes) return setFileError(`“${f.name}” is larger than ${maxBytes / MB} MB.`);
      if (next.length >= maxFiles) return setFileError(`You can attach up to ${maxFiles} files.`);
      next.push(f);
    }
    setFiles(next);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!subject.trim()) e.subject = 'Add a short subject.';
    else if (subject.length > 120) e.subject = 'Keep the subject under 120 characters.';
    if (!body.trim()) e.body = 'Tell us what happened.';
    else if (body.length > 5000) e.body = 'Keep it under 5,000 characters.';
    if (!signedIn && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
      e.email = 'Enter an email so we can reply.';
    if (!signedIn && !token) e.captcha = 'Please complete the check below.';
    return e;
  }

  async function upload(
    requestId: string,
    bucketToken: { path: string; token: string }[] | null,
    accessToken: string | null,
  ) {
    const sent: { path: string; name: string }[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(`Uploading ${i + 1} of ${files.length}`);
      const signed = bucketToken?.[i];
      const path =
        signed?.path ?? `${requestId}/${crypto.randomUUID()}/${f.name.replace(/[^\w.\- ]+/g, '_')}`;
      const res = signed
        ? await supabase.storage.from(BUCKET).uploadToSignedUrl(signed.path, signed.token, f)
        : await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type });
      if (!res.error) sent.push({ path, name: f.name });
    }
    if (sent.length) await finalizeSupportAttachments(supabase, requestId, sent, accessToken);
    return sent.length === files.length;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return queueMicrotask(() => errRef.current?.focus());
    setBusy('Sending');
    const diag = withDiag ? diagnostics(ctx.role) : {};
    try {
      if (signedIn) {
        const r = await createSupportRequest(supabase, {
          type,
          subject: subject.trim(),
          body: body.trim(),
          teamId: place.startsWith('t:') ? place.slice(2) : null,
          clubId: place.startsWith('c:') ? place.slice(2) : null,
          sourceArticle: article,
          sourceRoute: diag.route ?? null,
          diagnostics: diag,
        });
        if (r.error) throw r.error;
        if (files.length) await upload(r.data.id, null, null);
        setDone({ ref: r.data.ref, held: false, email: user!.email, signedIn: true });
      } else {
        const r = await submitPublicSupportRequest(supabase, {
          type,
          subject: subject.trim(),
          body: body.trim(),
          email: email.trim(),
          captchaToken: token!,
          sourceArticle: article,
          sourceRoute: diag.route ?? null,
          diagnostics: diag,
          files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        });
        if (r.error) throw r.error;
        if (files.length && r.data.uploads.length)
          await upload(r.data.request_id, r.data.uploads, r.data.finalize_token);
        setDone({ ref: r.data.ref, held: r.data.held, email: email.trim(), signedIn: false });
      }
    } catch (err) {
      const code = supportErrorCode(err as { message?: string });
      setFormError(
        code === 'rate_limited'
          ? COPY.rate
          : code === 'captcha_failed'
            ? 'The check didn’t pass. Please try it again.'
            : code === 'public_tickets_disabled'
              ? 'Sending a request without signing in is switched off right now. Please sign in, or try again later.'
              : 'We couldn’t send that. Your text is still here, so you can try again.',
      );
      setCapKey((k) => k + 1);
      queueMicrotask(() => errRef.current?.focus());
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <Card className={styles.vote} role="status">
        <Heading level="title" as="h1">
          {done.held ? 'We’re checking your request' : 'We got your request'}
        </Heading>
        <Text as="p">
          Your reference is <span className={styles.mono}>{done.ref}</span>.
        </Text>
        <Text as="p" muted>
          {done.held ? COPY.held : COPY.next}
        </Text>
        <Text as="p" muted>
          {done.signedIn
            ? 'You can follow it under Your requests.'
            : `We’ll email replies to ${done.email}.`}
        </Text>
        {done.signedIn ? (
          <Link className={styles.link} href={`/help/requests/${done.ref}`}>
            View your request
          </Link>
        ) : null}
        <Link className={styles.link} href="/help">
          Back to Help
        </Link>
      </Card>
    );
  }

  const noCaptchaKey =
    !signedIn && user !== undefined && !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  return (
    <form onSubmit={submit} noValidate className={styles.vote} aria-busy={busy !== null}>
      <Heading level="title" as="h1">
        Contact support
      </Heading>
      {type === 'problem' ? (
        <Card role="note">
          <Text as="p">{COPY.safety}</Text>
        </Card>
      ) : null}
      <SegmentedControl
        label="What is this about?"
        value={type}
        options={TYPES}
        onChange={setType}
      />
      <Text as="p" muted>
        {COPY.helper[type]}
      </Text>
      <div ref={errRef} tabIndex={-1} role="alert">
        {formError ? <Text as="p">{formError}</Text> : null}
      </div>
      <TextField
        label="Subject"
        name="subject"
        value={subject}
        maxLength={120}
        onChange={(e) => setSubject(e.target.value)}
        error={errors.subject}
      />
      {suggestions.length ? (
        <details open aria-label="Suggested articles">
          <summary>Suggested articles</summary>
          <ul className={styles.list}>
            {suggestions.map((s) => (
              <li key={s.id}>
                <Link className={styles.item} href={`/help/a/${s.slug}`} target="_blank">
                  {String(s.title)}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <TextArea
        label={type === 'feedback' ? 'Details' : 'What happened?'}
        name="body"
        rows={6}
        value={body}
        maxLength={5000}
        onChange={(e) => setBody(e.target.value)}
        error={errors.body}
      />
      {signedIn ? (
        <>
          <TextField
            label="Reply email"
            value={user?.email ?? ''}
            readOnly
            hint="We’ll reply here and to this email."
          />
          {ctx.teams.length + ctx.clubs.length > 0 ? (
            <Select
              label="Which team or club? (optional)"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              options={[
                { value: '', label: 'Not about a team' },
                ...ctx.teams.map((t) => ({ value: `t:${t.id}`, label: t.name })),
                ...ctx.clubs.map((c) => ({ value: `c:${c.id}`, label: c.name })),
              ]}
            />
          ) : null}
        </>
      ) : (
        <TextField
          label="Reply email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
      )}
      <div>
        <label htmlFor="attach" className={styles.mono}>
          Attachments (up to {maxFiles}, images or PDF, {maxBytes / MB} MB each)
        </label>
        <input
          id="attach"
          type="file"
          accept={ACCEPT}
          multiple
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {fileError ? (
          <Text role="alert" as="p">
            {fileError}
          </Text>
        ) : null}
        <ul>
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {f.name}{' '}
              <Button
                variant="ghost"
                onClick={() => setFiles(files.filter((_, k) => k !== i))}
                aria-label={`Remove ${f.name}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <label>
        <input type="checkbox" checked={withDiag} onChange={(e) => setWithDiag(e.target.checked)} />{' '}
        Include diagnostics
      </label>
      <details>
        <summary>What we include</summary>
        <Text as="p" muted>
          Browser, operating system, the screen you came from, your role and the time. Never message
          text or payment details.
        </Text>
      </details>
      {!signedIn && user !== undefined ? (
        <div>
          <Captcha onToken={setToken} resetKey={capKey} />
          {errors.captcha ? (
            <Text role="alert" as="p">
              {errors.captcha}
            </Text>
          ) : null}
          {noCaptchaKey ? (
            <Text as="p" muted>
              Sending without signing in isn’t available here yet.
            </Text>
          ) : null}
        </div>
      ) : null}
      <Text as="p" muted>
        {COPY.privacy}
      </Text>
      <Button type="submit" loading={busy !== null} disabled={user === undefined || noCaptchaKey}>
        {busy ?? 'Send request'}
      </Button>
    </form>
  );
}
