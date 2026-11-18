'use client';

import { friendlyError, waiverInputSchema } from '@athleit/core';
import {
  createWaiver,
  getWaiver,
  publishWaiverVersion,
  saveWaiverDraft,
  type Owner,
} from '@athleit/db/registration';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FormMessage } from '@/components/app/states';
import { Button, Card, Heading, Text, TextArea, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './registration.module.css';

interface Version {
  id: string;
  version: number;
  published_at: string;
  title: string;
}

/** Waiver editor (web only): plain text, versioned. Publishing freezes the text; signers keep what they signed. */
export function WaiverEditor({ waiverId, owner }: { waiverId: string | null; owner: Owner }) {
  const client = getClient();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [days, setDays] = useState('');
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error?: string; success?: string }>({});

  useEffect(() => {
    if (!waiverId) return;
    void getWaiver(client, waiverId).then((r) => {
      if (r.error) return setNotice({ error: friendlyError(r.error) });
      setTitle(r.data.title);
      setBody(r.data.draft_body);
      setDays(
        r.data.draft_requires_resign_after_days
          ? String(r.data.draft_requires_resign_after_days)
          : '',
      );
      setVersions([...r.data.waiver_versions].sort((a, b) => b.version - a.version));
    });
  }, [client, waiverId]);

  async function save(publish: boolean) {
    const parsed = waiverInputSchema.safeParse({
      title,
      body,
      requiresResignAfterDays: days ? Number(days) : null,
    });
    if (!parsed.success)
      return setNotice({ error: parsed.error.issues[0]?.message ?? 'Check the waiver.' });
    setBusy(true);
    setNotice({});
    const resign = days ? Number(days) : undefined;
    let id = waiverId;
    if (!id) {
      const c = await createWaiver(client, owner, title, body, resign);
      if (c.error) {
        setBusy(false);
        return setNotice({ error: friendlyError(c.error) });
      }
      id = c.data;
    } else {
      const s = await saveWaiverDraft(client, id, title, body, resign);
      if (s.error) {
        setBusy(false);
        return setNotice({ error: friendlyError(s.error) });
      }
    }
    if (publish) {
      const p = await publishWaiverVersion(client, id);
      if (p.error) {
        setBusy(false);
        return setNotice({ error: friendlyError(p.error) });
      }
    }
    setBusy(false);
    setNotice({ success: publish ? 'Published.' : 'Draft saved.' });
    if (!waiverId) router.replace(`/manage/waivers/${id}`);
    else if (publish)
      void getWaiver(client, id).then(
        (r) =>
          r.data && setVersions([...r.data.waiver_versions].sort((a, b) => b.version - a.version)),
      );
  }

  return (
    <div className={styles.stack}>
      <Heading as="h1" level="title">
        {waiverId ? 'Edit waiver' : 'New waiver'}
      </Heading>
      <Text as="p" muted>
        Have a lawyer review waivers before you publish them. Athleit records who signed which
        version; it does not give legal advice.
      </Text>
      <TextField
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={150}
      />
      <TextArea
        label="Waiver text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={14}
        hint="Plain text. Blank lines start a new paragraph."
      />
      <TextField
        label="Ask people to sign again after (days, optional)"
        inputMode="numeric"
        value={days}
        onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 4))}
      />
      <Card>
        <div className={styles.stack}>
          <Heading as="h2">Preview</Heading>
          <div className={styles.preBody}>{body || 'Your waiver text appears here.'}</div>
        </div>
      </Card>
      <div className={styles.row}>
        <Button variant="secondary" disabled={busy} onClick={() => void save(false)}>
          Save draft
        </Button>
        <Button disabled={busy || !body.trim()} onClick={() => void save(true)}>
          Publish version {(versions[0]?.version ?? 0) + 1}
        </Button>
      </div>
      {versions.length > 0 && (
        <div className={styles.stack}>
          <Heading as="h2">Published versions</Heading>
          <ul className={styles.list}>
            {versions.map((v) => (
              <li key={v.id} className={styles.item}>
                <Text className={styles.grow}>
                  Version {v.version}: {v.title}
                </Text>
                <Text muted>
                  {new Date(v.published_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}
      {notice.error ? <FormMessage error={notice.error} /> : null}
      {notice.success ? <FormMessage success={notice.success} /> : null}
    </div>
  );
}
