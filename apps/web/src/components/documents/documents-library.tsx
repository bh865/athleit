'use client';

import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABEL,
  DOCUMENT_VISIBILITIES,
  DOCUMENT_VISIBILITY_LABEL,
  categoryCounts,
  documentPath,
  fileKind,
  fileSizeLabel,
  filterDocuments,
  friendlyError,
  shortDateLabel,
  splitPinned,
  titleFromFile,
  validateUploads,
  type FileKind,
} from '@athleit/core';
import {
  archiveDocument,
  createDocumentRecord,
  listDocuments,
  signedDocumentUrl,
  updateDocument,
  uploadDocumentFile,
  type DocumentRow,
  type Owner,
} from '@athleit/db/registration';
import type { IconName } from '@athleit/ui-core';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { FormMessage } from '@/components/app/states';
import { ListState, SearchField } from '@/components/team/parts';
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  Popover,
  SegmentedControl,
  Sheet,
  TextArea,
  TextField,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './documents.module.css';

const KIND_ICON: Record<FileKind, IconName> = {
  pdf: 'file-pdf',
  doc: 'file-doc',
  sheet: 'file-xls',
  slides: 'file-ppt',
  image: 'image',
  file: 'file-text',
};
const UNDO_MS = 6000;

export interface DocumentsLibraryProps {
  owner: Owner;
  /** Capabilities for this place. Management controls appear only with `documents.manage`. */
  can: { manage: boolean; seeVisibility: boolean };
  /** Where the primary "Upload document" action goes. Default: inline in the toolbar. */
  primary?: (open: () => void) => ReactNode;
  /** Words for the empty state: "club documents" on the club page. */
  noun?: string;
}

/**
 * One documents library for team staff, the club page and the read-only family shelf. Everyone who can read sees
 * the same grid or list; upload, edit, pin and archive exist only when `can.manage` is true (the database enforces it).
 */
export function DocumentsLibrary({
  owner,
  can,
  primary,
  noun = 'documents',
}: DocumentsLibraryProps) {
  const client = getClient();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const docs = useLoad(() => listDocuments(client, owner), [owner.teamId, owner.clubId, tick]);
  const [category, setCategory] = useState('all');
  const [visibility, setVisibility] = useState('all');
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<File[] | null>(null);
  const [editing, setEditing] = useState<DocumentRow | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [undo, setUndo] = useState<DocumentRow | null>(null);
  const pending = useRef<{ doc: DocumentRow; timer: ReturnType<typeof setTimeout> } | null>(null);
  const reload = () => setTick((n) => n + 1);

  // Archiving commits after a short window so it can be undone. Leaving the page commits it right away.
  const commit = async (doc: DocumentRow) => {
    const r = await archiveDocument(client, doc.id);
    if (r.error) {
      setError(friendlyError(r.error));
      setHidden((h) => new Set([...h].filter((x) => x !== doc.id)));
    }
    reload();
  };
  const flush = () => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    void commit(pending.current.doc);
    pending.current = null;
    setUndo(null);
  };
  useEffect(
    () => () => {
      if (pending.current) {
        clearTimeout(pending.current.timer);
        void archiveDocument(client, pending.current.doc.id);
      }
    },
    [client],
  );
  function archive(doc: DocumentRow) {
    flush();
    setHidden((h) => new Set(h).add(doc.id));
    setUndo(doc);
    const timer = setTimeout(() => {
      pending.current = null;
      setUndo(null);
      void commit(doc);
    }, UNDO_MS);
    pending.current = { doc, timer };
  }
  function undoArchive() {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    const id = pending.current.doc.id;
    pending.current = null;
    setHidden((h) => new Set([...h].filter((x) => x !== id)));
    setUndo(null);
  }

  async function open(d: DocumentRow) {
    const r = await signedDocumentUrl(client, d.storage_path);
    if (r.error) return setError(friendlyError(r.error));
    window.open(r.data, '_blank', 'noopener,noreferrer');
  }
  async function patch(
    d: DocumentRow,
    p: Partial<{ visibility: string; pinned: boolean }>,
    done: string,
  ) {
    setError(null);
    const r = await updateDocument(client, d.id, {
      title: d.title,
      description: d.description ?? '',
      category: d.category,
      visibility: p.visibility ?? d.visibility,
      pinned: p.pinned ?? d.pinned,
    });
    if (r.error) return setError(friendlyError(r.error));
    toast(done);
    reload();
  }

  const all = (docs.data ?? []).filter((d) => !hidden.has(d.id));
  const filtered = filterDocuments(all, { category, visibility, search });
  const { pinned, rest } = splitPinned(filtered);
  const showPinned = category === 'all' && !search.trim() && visibility === 'all';
  const grid = showPinned
    ? rest
    : filtered.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const openUpload = () => setUploading([]);
  const uploadButton = (
    <Button onClick={openUpload}>
      <Icon name="upload-simple" size="sm" /> Upload document
    </Button>
  );

  const card = (d: DocumentRow, big = false) => (
    <li key={d.id} className={`${styles.card} ${big ? styles.cardBig : ''}`}>
      <div className={`${styles.row} ${styles.between}`}>
        <Icon name={KIND_ICON[fileKind(d.mime_type)]} size="lg" />
        <span className={styles.row}>
          {d.pinned ? (
            <span className={styles.chip}>
              <Icon name="push-pin" size="sm" weight="fill" /> Pinned
            </span>
          ) : null}
          {can.manage ? (
            <RowMenu
              d={d}
              onOpen={() => void open(d)}
              onEdit={() => setEditing(d)}
              onVisibility={() =>
                void patch(
                  d,
                  { visibility: d.visibility === 'staff_only' ? 'team_members' : 'staff_only' },
                  'Visibility changed',
                )
              }
              onPin={() => void patch(d, { pinned: !d.pinned }, d.pinned ? 'Unpinned' : 'Pinned')}
              onArchive={() => archive(d)}
            />
          ) : null}
        </span>
      </div>
      <button type="button" className={styles.title} onClick={() => void open(d)}>
        {d.title}
      </button>
      <span className={styles.muted}>
        {DOCUMENT_CATEGORY_LABEL[d.category] ?? d.category} · {fileSizeLabel(d.size_bytes)}
        {!big ? ` · ${d.uploaded_by_name} · ${shortDateLabel(d.created_at)}` : ''}
      </span>
      {can.seeVisibility ? <VisChip v={d.visibility} /> : null}
    </li>
  );

  return (
    <div className={styles.stack}>
      {can.manage ? (primary ? primary(openUpload) : null) : null}
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <SearchField label="Search documents" value={search} onChange={setSearch} />
        </div>
        {can.seeVisibility ? (
          <label className={styles.selectLabel}>
            Visibility
            <select
              className={styles.select}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="all">All visibility</option>
              {DOCUMENT_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {DOCUMENT_VISIBILITY_LABEL[v]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <SegmentedControl
          label="Layout"
          value={layout}
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'list', label: 'List' },
          ]}
          onChange={setLayout}
        />
        {can.manage && !primary ? uploadButton : null}
      </div>
      <FormMessage error={error} />
      <ListState name="documents" loading={docs.loading} error={docs.error} onRetry={reload}>
        {all.length === 0 ? (
          <div className={styles.drop}>
            <EmptyState
              icon="upload-simple"
              title={can.manage ? `No ${noun} yet` : 'No documents yet'}
              {...(can.manage
                ? {
                    body: `Upload rules, schedules and forms so families always have the latest. Drag files here or choose them. PDF, images and Office files up to 20 MB.`,
                  }
                : {})}
              action={
                can.manage ? (
                  <Button onClick={openUpload}>
                    <Icon name="upload-simple" size="sm" /> Choose files
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className={styles.pills} role="group" aria-label="Category">
              {categoryCounts(all)
                .filter((c) => c.value === 'all' || c.count > 0 || c.value === category)
                .map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={category === c.value}
                    className={`${styles.pill} ${category === c.value ? styles.pillOn : ''}`}
                    onClick={() => setCategory(c.value)}
                  >
                    {c.label} <span className={styles.count}>{c.count}</span>
                  </button>
                ))}
            </div>
            {showPinned && pinned.length > 0 ? (
              <section className={styles.stack} aria-label="Pinned documents">
                <span className={styles.kicker}>Pinned</span>
                <ul className={styles.pinnedGrid}>{pinned.map((d) => card(d, true))}</ul>
              </section>
            ) : null}
            {filtered.length === 0 ? (
              <p className={styles.muted}>No documents match.</p>
            ) : (
              <section className={styles.stack} aria-label="All documents">
                {showPinned && pinned.length > 0 ? (
                  <span className={styles.kicker}>All documents</span>
                ) : null}
                {layout === 'grid' ? (
                  <ul className={styles.grid} data-testid="documents-list">
                    {grid.map((d) => card(d))}
                  </ul>
                ) : (
                  <ul className={styles.list} data-testid="documents-list">
                    {(showPinned ? [...pinned, ...rest] : grid).map((d) => (
                      <li key={d.id} className={styles.listRow}>
                        <Icon name={KIND_ICON[fileKind(d.mime_type)]} />
                        <span className={styles.grow}>
                          <button
                            type="button"
                            className={styles.title}
                            onClick={() => void open(d)}
                          >
                            {d.title}
                          </button>
                          {d.pinned ? <Icon name="push-pin" size="sm" weight="fill" /> : null}
                          <span className={styles.muted}>
                            {' '}
                            {DOCUMENT_CATEGORY_LABEL[d.category] ?? d.category} ·{' '}
                            {fileSizeLabel(d.size_bytes)} · {d.uploaded_by_name} ·{' '}
                            {shortDateLabel(d.created_at)}
                          </span>
                        </span>
                        {can.seeVisibility ? <VisChip v={d.visibility} /> : null}
                        {can.manage ? (
                          <RowMenu
                            d={d}
                            onOpen={() => void open(d)}
                            onEdit={() => setEditing(d)}
                            onVisibility={() =>
                              void patch(
                                d,
                                {
                                  visibility:
                                    d.visibility === 'staff_only' ? 'team_members' : 'staff_only',
                                },
                                'Visibility changed',
                              )
                            }
                            onPin={() =>
                              void patch(d, { pinned: !d.pinned }, d.pinned ? 'Unpinned' : 'Pinned')
                            }
                            onArchive={() => archive(d)}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </ListState>

      {can.manage ? (
        <>
          <UploadSheet
            files={uploading}
            owner={owner}
            noun={noun}
            onClose={() => setUploading(null)}
            onDone={(n) => {
              setUploading(null);
              toast(`${n} ${n === 1 ? 'document' : 'documents'} uploaded`);
              reload();
            }}
          />
          <EditSheet
            doc={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              toast('Changes saved');
              reload();
            }}
            onArchive={(d) => {
              setEditing(null);
              archive(d);
            }}
          />
        </>
      ) : null}

      {undo ? (
        <div className={styles.undo} role="status">
          <Icon name="archive-box" size="sm" /> Archived “{undo.title}”
          <Button variant="secondary" onClick={undoArchive}>
            Undo
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function VisChip({ v }: { v: string }) {
  return (
    <span className={styles.chip}>
      <Icon name={v === 'staff_only' ? 'lock-simple' : 'users-three'} size="sm" />{' '}
      {DOCUMENT_VISIBILITY_LABEL[v] ?? v}
    </span>
  );
}

function RowMenu({
  d,
  onOpen,
  onEdit,
  onVisibility,
  onPin,
  onArchive,
}: {
  d: DocumentRow;
  onOpen: () => void;
  onEdit: () => void;
  onVisibility: () => void;
  onPin: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const item = (icon: IconName, label: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      className={styles.menuItem}
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      <Icon name={icon} size="sm" /> {label}
    </button>
  );
  return (
    <>
      <span ref={anchor}>
        <IconButton
          icon="dots-three"
          label={`More actions for ${d.title}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        />
      </span>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        label="Document actions"
        align="end"
      >
        <div role="menu" className={styles.menu}>
          {item('arrow-square-out', 'Open', onOpen)}
          {item('pencil', 'Rename', onEdit)}
          {item('eye', 'Change visibility', onVisibility)}
          {item('push-pin', d.pinned ? 'Unpin' : 'Pin', onPin)}
          {item('archive-box', 'Archive', onArchive)}
        </div>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------- upload
interface Item {
  file: File;
  title: string;
  category: string;
  visibility: string;
  error: string | null;
  state: 'ready' | 'uploading' | 'done' | 'failed';
}

function UploadSheet({
  files,
  owner,
  noun,
  onClose,
  onDone,
}: {
  files: File[] | null;
  owner: Owner;
  noun: string;
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const client = getClient();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [pin, setPin] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = files !== null;

  const add = (list: File[]) => {
    const { checked } = validateUploads(list);
    setItems((cur) => [
      ...cur,
      ...checked.map(({ file, error: e }) => ({
        file,
        title: titleFromFile(file.name),
        category: 'other',
        visibility: 'team_members',
        error: e,
        state: 'ready' as const,
      })),
    ]);
  };
  const patch = (i: number, p: Partial<Item>) =>
    setItems((cur) => cur.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const good = items.filter((i) => !i.error && i.state !== 'done');

  function close() {
    if (busy) return;
    setItems([]);
    setPin(false);
    setError(null);
    onClose();
  }

  async function upload() {
    setBusy(true);
    setError(null);
    let ok = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.error || it.state === 'done') continue;
      patch(i, { state: 'uploading' });
      const path = documentPath(owner, crypto.randomUUID(), it.file.name);
      const up = await uploadDocumentFile(client, path, it.file, it.file.type);
      if (up.error) {
        patch(i, { state: 'failed', error: friendlyError(up.error) });
        continue;
      }
      const rec = await createDocumentRecord(client, owner, {
        title: it.title.trim() || it.file.name,
        category: it.category,
        visibility: it.visibility,
        pinned: pin,
        path,
        mime: it.file.type,
        size: it.file.size,
      });
      if (rec.error) {
        patch(i, { state: 'failed', error: friendlyError(rec.error) });
        continue;
      }
      patch(i, { state: 'done' });
      ok++;
    }
    setBusy(false);
    if (ok > 0 && ok === good.length) {
      setItems([]);
      setPin(false);
      onDone(ok);
    } else if (ok > 0) setError(`${ok} uploaded. Fix the others or remove them.`);
  }

  return (
    <Sheet open={open} onClose={close} title="Upload documents">
      <div className={styles.stack}>
        <div className={`${styles.row} ${styles.between}`}>
          <h2 style={{ margin: 0 }}>Upload documents</h2>
          <IconButton icon="x" label="Close" onClick={close} />
        </div>
        <div
          className={`${styles.drop} ${over ? styles.dropOn : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            add([...e.dataTransfer.files]);
          }}
        >
          <Icon name="upload-simple" size="lg" />
          <span>{items.length ? 'Drop more files here, or' : `Drop ${noun} here, or`}</span>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            aria-label="Choose files"
            onChange={(e) => {
              add([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <Button variant="secondary" onClick={() => input.current?.click()}>
            Choose files
          </Button>
          <span className={styles.muted}>PDF, images and Office files up to 20 MB.</span>
        </div>
        {items.map((it, i) => (
          <div
            key={`${it.file.name}-${i}`}
            className={`${styles.fileRow} ${it.error ? styles.fileBad : ''}`}
          >
            <div className={`${styles.row} ${styles.between}`}>
              <span className={styles.row}>
                <Icon name={KIND_ICON[fileKind(it.file.type)]} /> {it.file.name} ·{' '}
                {fileSizeLabel(it.file.size)}
              </span>
              {it.state === 'uploading' ? <span className={styles.muted}>Uploading…</span> : null}
              {it.state === 'done' ? (
                <span className={styles.chip}>
                  <Icon name="check" size="sm" /> Uploaded
                </span>
              ) : null}
              {it.state !== 'uploading' && it.state !== 'done' ? (
                <Button
                  variant="ghost"
                  onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))}
                  aria-label={`Remove ${it.file.name}`}
                >
                  Remove
                </Button>
              ) : null}
            </div>
            {it.error ? (
              <span className={styles.err} role="alert">
                <Icon name="warning-circle" size="sm" /> {it.error}
              </span>
            ) : (
              <div className={styles.fields}>
                <TextField
                  label="Title"
                  value={it.title}
                  maxLength={150}
                  onChange={(e) => patch(i, { title: e.target.value })}
                />
                <label className={styles.selectLabel}>
                  Category
                  <select
                    className={styles.select}
                    value={it.category}
                    onChange={(e) => patch(i, { category: e.target.value })}
                  >
                    {DOCUMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {DOCUMENT_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.selectLabel}>
                  Who can open it
                  <select
                    className={styles.select}
                    value={it.visibility}
                    onChange={(e) => patch(i, { visibility: e.target.value })}
                  >
                    {DOCUMENT_VISIBILITIES.map((v) => (
                      <option key={v} value={v}>
                        {DOCUMENT_VISIBILITY_LABEL[v]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        ))}
        {items.length ? (
          <label className={styles.check}>
            <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
            <span>Pin these documents to the top</span>
          </label>
        ) : null}
        <p className={styles.err} style={{ color: 'var(--color-muted)' }}>
          <Icon name="shield-warning" size="sm" /> Don’t upload government IDs, medical records or
          card numbers.
        </p>
        <FormMessage error={error} />
        <div className={styles.row}>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={good.length === 0} onClick={() => void upload()}>
            <Icon name="upload-simple" size="sm" /> Upload {good.length}{' '}
            {good.length === 1 ? 'file' : 'files'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------------ edit
function EditSheet({
  doc,
  onClose,
  onSaved,
  onArchive,
}: {
  doc: DocumentRow | null;
  onClose: () => void;
  onSaved: () => void;
  onArchive: (d: DocumentRow) => void;
}) {
  // Re-key by document so the form always starts from that document's values.
  return (
    <Sheet open={doc !== null} onClose={onClose} title="Edit document">
      {doc ? (
        <EditForm
          key={doc.id}
          doc={doc}
          onClose={onClose}
          onSaved={onSaved}
          onArchive={onArchive}
        />
      ) : null}
    </Sheet>
  );
}

function EditForm({
  doc,
  onClose,
  onSaved,
  onArchive,
}: {
  doc: DocumentRow;
  onClose: () => void;
  onSaved: () => void;
  onArchive: (d: DocumentRow) => void;
}) {
  const client = getClient();
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description ?? '');
  const [category, setCategory] = useState(doc.category);
  const [visibility, setVisibility] = useState(doc.visibility);
  const [pinned, setPinned] = useState(doc.pinned);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!title.trim()) return setError('Add a title.');
    setBusy(true);
    const r = await updateDocument(client, doc.id, {
      title: title.trim(),
      description,
      category,
      visibility,
      pinned,
    });
    setBusy(false);
    if (r.error) return setError(friendlyError(r.error));
    onSaved();
  }
  return (
    <div className={styles.stack}>
      <div className={`${styles.row} ${styles.between}`}>
        <h2 style={{ margin: 0 }}>Edit document</h2>
        <IconButton icon="x" label="Close" onClick={onClose} />
      </div>
      <div className={styles.row}>
        <Icon name={KIND_ICON[fileKind(doc.mime_type)]} size="lg" />
        <span>
          <strong>{doc.title}</strong>
          <span className={styles.muted}>
            {' '}
            {fileSizeLabel(doc.size_bytes)} · Uploaded {shortDateLabel(doc.created_at)} by{' '}
            {doc.uploaded_by_name}
          </span>
        </span>
      </div>
      <TextField
        label="Title"
        value={title}
        maxLength={150}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextArea
        label="Description"
        rows={3}
        value={description}
        maxLength={1000}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label className={styles.selectLabel}>
        Category
        <select
          className={styles.select}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {DOCUMENT_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.selectLabel}>
        Visibility
        <select
          className={styles.select}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
        >
          {DOCUMENT_VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {DOCUMENT_VISIBILITY_LABEL[v]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        <span>Pin to top</span>
      </label>
      <FormMessage error={error} />
      <div className={`${styles.row} ${styles.between}`}>
        <Button variant="ghost" onClick={() => onArchive(doc)}>
          <Icon name="archive-box" size="sm" /> Archive
        </Button>
        <span className={styles.row}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Save changes
          </Button>
        </span>
      </div>
    </div>
  );
}
