'use client';

import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_VISIBILITIES,
  friendlyError,
} from '@athleit/core';
import {
  archiveDocument,
  createDocumentRecord,
  listDocuments,
  signedDocumentUrl,
  uploadDocumentFile,
  type Owner,
} from '@athleit/db/registration';
import { useRef, useState } from 'react';

import { FormMessage, LoadState } from '@/components/app/states';
import {
  Badge,
  Button,
  Card,
  Heading,
  Icon,
  ListGroup,
  ListRow,
  Select,
  Text,
  TextField,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './registration.module.css';

const CAT_LABEL: Record<string, string> = {
  rules: 'Rules',
  schedule: 'Schedule',
  tournament: 'Tournament',
  forms: 'Forms',
  other: 'Other',
};
const VIS_LABEL: Record<string, string> = {
  staff_only: 'Staff only',
  team_members: 'Team members',
};
const kb = (n: number) =>
  n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'file';

/** Team documents: upload (staff), download through a short-lived signed URL (anyone who can read the document). */
export function DocumentsShelf({ owner, canManage }: { owner: Owner; canManage: boolean }) {
  const client = getClient();
  const [tick, setTick] = useState(0);
  const docs = useLoad(() => listDocuments(client, owner), [owner.teamId, owner.clubId, tick]);
  const file = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('other');
  const [visibility, setVisibility] = useState<string>('team_members');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error?: string; success?: string }>({});

  async function upload() {
    const f = file.current?.files?.[0];
    if (!f) return setNotice({ error: 'Choose a file first.' });
    if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(f.type))
      return setNotice({
        error: 'That file type isn’t supported. Use PDF, an image, or an Office document.',
      });
    if (f.size > DOCUMENT_MAX_BYTES) return setNotice({ error: 'Files can be up to 20 MB.' });
    setBusy(true);
    setNotice({});
    const folder = owner.teamId ? `team/${owner.teamId}` : `club/${owner.clubId}`;
    const path = `${folder}/${crypto.randomUUID()}/${safeName(f.name)}`;
    const up = await uploadDocumentFile(client, path, f, f.type);
    if (up.error) {
      setBusy(false);
      return setNotice({ error: friendlyError(up.error) });
    }
    const rec = await createDocumentRecord(client, owner, {
      title: title.trim() || f.name,
      category,
      visibility,
      pinned,
      path,
      mime: f.type,
      size: f.size,
    });
    setBusy(false);
    if (rec.error) return setNotice({ error: friendlyError(rec.error) });
    setTitle('');
    setPinned(false);
    if (file.current) file.current.value = '';
    setNotice({ success: 'Uploaded' });
    setTick((n) => n + 1);
  }
  async function open(path: string) {
    const r = await signedDocumentUrl(client, path);
    if (r.error) return setNotice({ error: friendlyError(r.error) });
    window.open(r.data, '_blank', 'noopener,noreferrer');
  }
  async function archive(id: string) {
    const r = await archiveDocument(client, id);
    setNotice(r.error ? { error: friendlyError(r.error) } : { success: 'Archived' });
    setTick((n) => n + 1);
  }

  return (
    <div className={styles.stack}>
      <Heading as="h2">Documents</Heading>
      <LoadState
        loading={docs.loading}
        error={docs.error}
        empty={docs.data?.length === 0}
        emptyText="No documents yet."
        onRetry={docs.reload}
      >
        <ListGroup>
          {(docs.data ?? []).map((d) => (
            <li key={d.id}>
              <ListRow
                leading={
                  <Icon name={d.mime_type === 'application/pdf' ? 'file-pdf' : 'file-text'} />
                }
                title={
                  <>
                    {d.pinned ? <Icon name="star" weight="fill" size="sm" /> : null} {d.title}
                  </>
                }
                subtitle={`${CAT_LABEL[d.category] ?? d.category} · ${kb(d.size_bytes)} · ${d.uploaded_by_name}`}
                trailing={
                  <span className={styles.row}>
                    {canManage ? <Badge>{VIS_LABEL[d.visibility] ?? d.visibility}</Badge> : null}
                    <Button variant="secondary" onClick={() => void open(d.storage_path)}>
                      Open
                    </Button>
                    {canManage ? (
                      <Button variant="ghost" onClick={() => void archive(d.id)}>
                        Archive
                      </Button>
                    ) : null}
                  </span>
                }
              />
            </li>
          ))}
        </ListGroup>
      </LoadState>
      {canManage && (
        <Card>
          <div className={styles.stack}>
            <Heading as="h2">Upload a document</Heading>
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
            />
            <div className={styles.stack}>
              <label htmlFor="doc-file">
                <Text variant="label">File (up to 20 MB)</Text>
              </label>
              <input id="doc-file" ref={file} type="file" accept={DOCUMENT_MIME_TYPES.join(',')} />
            </div>
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: CAT_LABEL[c] ?? c }))}
            />
            <Select
              label="Who can open it"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              options={DOCUMENT_VISIBILITIES.map((v) => ({ value: v, label: VIS_LABEL[v] ?? v }))}
            />
            <label className={styles.choice}>
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />{' '}
              Pin to the top
            </label>
            <Text muted>Don’t upload government IDs, medical records or card numbers.</Text>
            <Button disabled={busy} onClick={() => void upload()}>
              <Icon name="upload-simple" /> {busy ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </Card>
      )}
      {notice.error ? <FormMessage error={notice.error} /> : null}
      {notice.success ? <FormMessage success={notice.success} /> : null}
    </div>
  );
}
