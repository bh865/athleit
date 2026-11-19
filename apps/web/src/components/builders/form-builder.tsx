'use client';

import {
  FORM_STARTERS,
  PALETTE,
  adaptFormSchema,
  canRedo,
  canUndo,
  changeType,
  commit,
  conditionAnswers,
  conditionCandidates,
  duplicateField,
  formSchemaSchema,
  friendlyError,
  insertField,
  isChoice,
  issueCount,
  moveField,
  optionsFromLabels,
  parseBulkOptions,
  patchField,
  redo,
  removeField,
  startHistory,
  typeLabel,
  undo,
  validateFields,
  type FormField,
  type History,
  type Snapshot,
} from '@athleit/core';
import {
  createForm,
  getForm,
  publishFormVersion,
  saveFormDraft,
  type Owner,
} from '@athleit/db/registration';
import type { IconName } from '@athleit/ui-core';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { LoadState } from '@/components/app/states';
import { useLoad } from '@/lib/use-load';
import { FormRenderer, type Answers } from '@/components/registration/form-renderer';
import {
  Button,
  Icon,
  IconButton,
  SegmentedControl,
  Select,
  TextArea,
  TextField,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './builders.module.css';

type Save = 'idle' | 'saving' | 'saved' | 'error';
const TEXTY = ['short_text', 'long_text', 'email', 'phone', 'number'];

/** Loads the form (if editing), then hands a ready snapshot to the builder. */
export function FormBuilder({
  formId,
  owner,
  returnTo,
}: {
  formId: string | null;
  owner: Owner;
  returnTo?: string | null;
}) {
  const res = useLoad(
    () => (formId ? getForm(getClient(), formId) : Promise.resolve({ data: null, error: null })),
    [formId],
  );
  if (formId && (res.loading || res.error || !res.data))
    return (
      <div className={styles.shell}>
        <div className={styles.stepPane}>
          <LoadState loading={res.loading} error={res.error} onRetry={res.reload}>
            {null}
          </LoadState>
        </div>
      </div>
    );
  const row = res.data;
  return (
    <FormBuilderInner
      formId={formId}
      owner={row ? (row.team_id ? { teamId: row.team_id } : { clubId: row.club_id ?? '' }) : owner}
      returnTo={returnTo ?? null}
      initial={{
        name: row?.name ?? '',
        fields: adaptFormSchema(row?.draft_schema).fields,
      }}
    />
  );
}

/** Form builder (web only): palette, WYSIWYG canvas, inspector. Autosaves the draft; "Save form" publishes a version. */
function FormBuilderInner({
  formId: initialId,
  owner: initialOwner,
  returnTo,
  initial,
}: {
  formId: string | null;
  owner: Owner;
  returnTo?: string | null;
  initial: Snapshot;
}) {
  const client = getClient();
  const router = useRouter();
  const toast = useToast();
  const [formId, setFormId] = useState(initialId);
  const owner = initialOwner;
  const [hist, setHist] = useState<History>(() => startHistory(initial));
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [device, setDevice] = useState<'web' | 'mobile'>('web');
  const [answers, setAnswers] = useState<Answers>({});
  const [slash, setSlash] = useState(false);
  const [save, setSave] = useState<Save>('idle');
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const lastEdit = useRef<string | undefined>(undefined);
  const focusHandle = useRef<string | null>(null);

  const { name, fields } = hist.present;
  const issues = validateFields(fields);
  const nIssues = issueCount(issues);
  const sel = fields.find((f) => f.id === selected) ?? null;

  /** Every edit goes through here so undo/redo and autosave see it. `merge` collapses typing into one step. */
  const edit = useCallback((next: Partial<Snapshot>, merge?: string) => {
    setHist((h) => {
      const snap = { ...h.present, ...next };
      const out = commit(h, snap, merge ? { key: merge, last: lastEdit.current } : undefined);
      return out;
    });
    lastEdit.current = merge;
    setDirty(true);
  }, []);
  const setFields = (fs: FormField[], merge?: string) => edit({ fields: fs }, merge);
  const patch = (id: string, p: Partial<FormField>, merge?: string) =>
    setFields(patchField(fields, id, p), merge);

  // Autosave the draft once the form is valid and named (the database rejects blank labels).
  useEffect(() => {
    if (!dirty || !name.trim() || nIssues > 0 || fields.length === 0) return;
    const t = setTimeout(() => void saveDraft(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on edits; saveDraft reads the current snapshot
  }, [hist.present, dirty]);

  async function saveDraft(): Promise<string | null> {
    setSave('saving');
    let id = formId;
    if (!id) {
      const c = await createForm(client, owner, name.trim(), { fields } as never);
      if (c.error) {
        setSave('error');
        toast(friendlyError(c.error), 'danger');
        return null;
      }
      id = c.data as string;
      setFormId(id);
      // Keep the URL in sync without remounting the builder.
      window.history.replaceState(
        null,
        '',
        `/manage/forms/${id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`,
      );
    } else {
      const s = await saveFormDraft(client, id, name.trim(), { fields } as never);
      if (s.error) {
        setSave('error');
        toast(friendlyError(s.error), 'danger');
        return null;
      }
    }
    setDirty(false);
    setSave('saved');
    return id;
  }

  async function publish() {
    if (!name.trim()) return toast('Give the form a name first.', 'danger');
    if (fields.length === 0) return toast('Add at least one question.', 'danger');
    if (nIssues > 0)
      return toast(`Fix ${nIssues} ${nIssues === 1 ? 'issue' : 'issues'} first.`, 'danger');
    setPublishing(true);
    const id = await saveDraft();
    if (!id) return setPublishing(false);
    const p = await publishFormVersion(client, id);
    setPublishing(false);
    if (p.error) return toast(friendlyError(p.error), 'danger');
    toast('Form saved');
    if (returnTo) router.push(`${returnTo}${returnTo.includes('?') ? '&' : '?'}form=${id}`);
  }

  // ----------------------------------------------------------------------------- actions
  const add = (type: FormField['type'], after = selected) => {
    const r = insertField(fields, type, after);
    setFields(r.fields);
    setSelected(r.id);
    setMode('edit');
  };
  const dup = () => {
    if (!selected) return;
    const r = duplicateField(fields, selected);
    setFields(r.fields);
    setSelected(r.id);
  };
  const del = (id: string) => {
    const i = fields.findIndex((f) => f.id === id);
    setFields(removeField(fields, id));
    setSelected(fields[i + 1]?.id ?? fields[i - 1]?.id ?? null);
  };
  const move = (from: number, to: number) => {
    setFields(moveField(fields, from, to));
    focusHandle.current = fields[from]?.id ?? null;
  };
  const applyStarter = (id: string) => {
    const s = FORM_STARTERS.find((x) => x.id === id);
    if (!s) return;
    edit({ name: name.trim() || s.name, fields: s.fields.map((f) => ({ ...f })) });
    setSelected(s.fields[0]?.id ?? null);
  };

  // Keep keyboard focus on a dragged-by-keyboard handle after it moves.
  useEffect(() => {
    if (!focusHandle.current) return;
    document.querySelector<HTMLElement>(`[data-handle="${focusHandle.current}"]`)?.focus();
    focusHandle.current = null;
  }, [fields]);

  // Keyboard: "/" inserts, ⌘D duplicates, ⌘Z / ⇧⌘Z undo and redo (outside text inputs, where the browser's own undo applies).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t?.matches('input, textarea, select, [contenteditable="true"]');
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === '/' && !typing && !mod) {
        e.preventDefault();
        setSlash(true);
      } else if (mod && e.key.toLowerCase() === 'd' && selected) {
        e.preventDefault();
        dup();
      } else if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        setHist((h) => (e.shiftKey ? redo(h) : undo(h)));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const back = () => router.push(returnTo ?? (owner.teamId ? `/teams/${owner.teamId}/forms` : '/'));

  const parsed = formSchemaSchema.safeParse({ fields });
  const status =
    save === 'saving' ? (
      <span className={styles.status}>Saving…</span>
    ) : nIssues > 0 ? (
      <span className={`${styles.status} ${styles.statusBad}`}>
        <Icon name="warning" size="sm" /> {nIssues} {nIssues === 1 ? 'issue' : 'issues'}
      </span>
    ) : save === 'error' ? (
      <span className={`${styles.status} ${styles.statusBad}`}>Not saved</span>
    ) : dirty || !formId ? (
      <span className={styles.status}>
        <Icon name="check" size="sm" /> {formId ? 'Unsaved changes' : 'Not saved yet'}
      </span>
    ) : (
      <span className={styles.status}>
        <Icon name="check" size="sm" /> Saved
      </span>
    );

  return (
    <div className={styles.shell} data-testid="form-builder">
      <div className={styles.top}>
        <IconButton icon="arrow-left" label="Back" onClick={back} />
        <div className={styles.title}>
          <input
            className={styles.titleInput}
            aria-label="Form name"
            placeholder="Untitled form"
            maxLength={100}
            value={name}
            onChange={(e) => edit({ name: e.target.value }, 'name')}
          />
        </div>
        {status}
        <span className={styles.spacer} />
        <SegmentedControl
          label="Mode"
          value={mode}
          options={[
            { value: 'edit', label: 'Edit' },
            { value: 'preview', label: 'Preview' },
          ]}
          onChange={setMode}
        />
        {mode === 'preview' ? (
          <SegmentedControl
            label="Preview device"
            value={device}
            options={[
              { value: 'web', label: 'Web' },
              { value: 'mobile', label: 'Mobile' },
            ]}
            onChange={setDevice}
          />
        ) : null}
        <IconButton
          icon="arrow-counter-clockwise"
          label="Undo"
          disabled={!canUndo(hist)}
          onClick={() => setHist(undo)}
        />
        <IconButton
          icon="arrow-clockwise"
          label="Redo"
          disabled={!canRedo(hist)}
          onClick={() => setHist(redo)}
        />
        <Button loading={publishing} onClick={() => void publish()}>
          Save form
        </Button>
      </div>
      <p className={styles.notice} role="note">
        The form builder works best on a desktop-width screen.
      </p>

      <div className={styles.body}>
        {mode === 'edit' ? (
          <nav className={styles.palette} aria-label="Add a question">
            <span className={styles.kicker}>Add a question</span>
            {PALETTE.map((p) => (
              <button
                key={p.type}
                type="button"
                className={styles.paletteBtn}
                onClick={() => add(p.type)}
              >
                <Icon name={p.icon as IconName} size="sm" /> {p.label}
              </button>
            ))}
            <p className={styles.keys}>
              Keys: <kbd className={styles.kbd}>/</kbd> insert ·{' '}
              <kbd className={styles.kbd}>⌘D</kbd> duplicate · <kbd className={styles.kbd}>⌘Z</kbd>{' '}
              undo
            </p>
          </nav>
        ) : null}

        <main className={styles.canvas} onClick={() => setSelected(null)}>
          {mode === 'preview' ? (
            <div className={styles.canvasInner}>
              <div className={styles.banner}>
                <Icon name="eye" size="sm" /> Preview · nothing you enter here is saved
              </div>
              {parsed.success ? (
                <div
                  className={
                    device === 'mobile' ? `${styles.phone} ${styles.phoneFrame}` : styles.phone
                  }
                >
                  <h2 className={styles.section}>{name || 'Untitled form'}</h2>
                  <FormRenderer
                    schema={parsed.data}
                    answers={answers}
                    errors={{}}
                    onChange={setAnswers}
                    compact={device === 'mobile'}
                  />
                  <Button disabled>Continue</Button>
                </div>
              ) : (
                <p className={styles.muted}>
                  Fix {nIssues} {nIssues === 1 ? 'issue' : 'issues'} to see the preview.
                </p>
              )}
            </div>
          ) : fields.length === 0 ? (
            <div
              className={`${styles.canvasInner} ${styles.center}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="list-plus" size="xl" />
              <h2 className={styles.section}>Start with a template</h2>
              <p className={styles.muted}>
                Pick a starter and edit it, or add your first question from the left. Press{' '}
                <kbd className={styles.kbd}>/</kbd> anywhere to insert one.
              </p>
              <div className={styles.starters}>
                {FORM_STARTERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={styles.starter}
                    onClick={() => applyStarter(s.id)}
                  >
                    <Icon name={s.icon as IconName} />
                    <strong>{s.name}</strong>
                    <span className={styles.muted}>{s.fields.length} questions</span>
                  </button>
                ))}
              </div>
              <Button variant="secondary" onClick={() => add('short_text', null)}>
                <Icon name="plus" size="sm" /> Start blank
              </Button>
            </div>
          ) : (
            <div className={styles.canvasInner}>
              <h2 className={styles.section}>{name || 'Untitled form'}</h2>
              <div className={styles.questions} role="list" aria-label="Questions">
                {fields.map((f, i) => (
                  <Question
                    key={f.id}
                    f={f}
                    index={i}
                    selected={f.id === selected}
                    issue={issues[f.id]}
                    all={fields}
                    onSelect={() => setSelected(f.id)}
                    onChange={(p, merge) => patch(f.id, p, merge)}
                    onMove={move}
                    onDuplicate={dup}
                    onDelete={() => del(f.id)}
                  />
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  add('short_text', fields.at(-1)?.id ?? null);
                }}
              >
                <Icon name="plus" size="sm" /> Add a question
              </Button>
            </div>
          )}
        </main>

        {mode === 'edit' ? (
          <aside className={styles.inspector} aria-label="Question settings">
            {sel ? (
              <Inspector
                f={sel}
                all={fields}
                issue={issues[sel.id]}
                onPatch={(p, merge) => patch(sel.id, p, merge)}
                onType={(t) => setFields(changeType(fields, sel.id, t))}
                onMove={(d) =>
                  move(
                    fields.findIndex((f) => f.id === sel.id),
                    fields.findIndex((f) => f.id === sel.id) + d,
                  )
                }
              />
            ) : (
              <div className={styles.inspectorEmpty}>
                <Icon name="cursor-click" size="lg" />
                <p className={styles.muted}>
                  Select a question to edit its label, options and logic.
                </p>
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {slash ? (
        <SlashMenu
          onClose={() => setSlash(false)}
          onPick={(t) => {
            setSlash(false);
            add(t);
          }}
        />
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------------------------------------------- canvas
function Question({
  f,
  index,
  selected,
  issue,
  all,
  onSelect,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  f: FormField;
  index: number;
  selected: boolean;
  issue: { label?: string; options?: string; logic?: string; other?: string } | undefined;
  all: FormField[];
  onSelect: () => void;
  onChange: (p: Partial<FormField>, merge?: string) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [over, setOver] = useState(false);
  const dep = f.show_if ? all.find((x) => x.id === f.show_if!.field) : undefined;
  const cls = [
    styles.q,
    f.width === 'half' ? styles.qHalf : '',
    selected ? styles.qSelected : '',
    issue ? styles.qBad : '',
    over ? styles.qDragOver : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      role="listitem"
      className={cls}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isInteger(from)) onMove(from, index);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {f.show_if && dep ? (
        <span className={styles.logicTag}>
          <Icon name="git-branch" size="sm" /> Shown if “{dep.label || 'Untitled question'}” is{' '}
          {String('equals' in f.show_if ? f.show_if.equals : f.show_if.in.join(', '))}
        </span>
      ) : null}
      <div className={styles.qHead}>
        <button
          type="button"
          className={styles.handle}
          data-handle={f.id}
          aria-label={`Move question ${index + 1}. Press Alt and an arrow key to reorder`}
          onKeyDown={(e) => {
            if (e.altKey && e.key === 'ArrowUp') {
              e.preventDefault();
              onMove(index, index - 1);
            } else if (e.altKey && e.key === 'ArrowDown') {
              e.preventDefault();
              onMove(index, index + 1);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="dots-six-vertical" />
        </button>
        <span className={styles.qLabel}>
          {f.label || 'Untitled question'}
          {f.required ? ' *' : ''}
        </span>
        {selected ? (
          <span className={styles.qTools}>
            <IconButton icon="copy" label="Duplicate question" onClick={onDuplicate} />
            <IconButton icon="trash" label="Delete question" onClick={onDelete} />
          </span>
        ) : null}
      </div>
      {selected && isChoice(f.type) ? (
        <OptionList f={f} onChange={onChange} />
      ) : (
        <>
          {f.help ? <span className={styles.muted}>{f.help}</span> : null}
          <Fake f={f} />
        </>
      )}
      {issue ? (
        <span className={styles.err} role="alert">
          <Icon name="warning-circle" size="sm" />{' '}
          {issue.label ?? issue.options ?? issue.logic ?? issue.other}
        </span>
      ) : null}
    </div>
  );
}

/** What the answer control looks like, quietly. */
function Fake({ f }: { f: FormField }) {
  if (isChoice(f.type) && f.type !== 'dropdown')
    return (
      <span className={styles.muted}>
        {(f.options ?? []).map((o) => o.label).join(' · ') || 'No options yet'}
      </span>
    );
  const hint =
    f.placeholder ??
    (
      {
        date: 'MM / DD / YYYY',
        phone: '(555) 000-0000',
        email: 'name@example.com',
        number: '0',
        dropdown: 'Choose one',
        address: 'Street, city, postal code',
        checkbox: 'Checkbox',
        consent_checkbox: 'I agree',
      } as Record<string, string>
    )[f.type] ??
    '';
  return <span className={styles.fake}>{hint}</span>;
}

/** Inline options: Enter adds the next, paste splits lines, buttons reorder. */
function OptionList({
  f,
  onChange,
}: {
  f: FormField;
  onChange: (p: Partial<FormField>, merge?: string) => void;
}) {
  const opts = f.options ?? [];
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focusAt = useRef<number | null>(null);
  const setFocusAt = (i: number) => {
    focusAt.current = i;
  };
  useEffect(() => {
    if (focusAt.current !== null) refs.current[focusAt.current]?.focus();
    focusAt.current = null;
  });
  const labels = opts.map((o) => o.label);
  const set = (next: string[], merge?: string) =>
    onChange({ options: optionsFromLabels(next, opts) }, merge);
  return (
    <ul className={styles.optList} onClick={(e) => e.stopPropagation()}>
      {opts.map((o, i) => (
        <li key={o.value} className={styles.optRow}>
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={styles.optInput}
            aria-label={`Option ${i + 1}`}
            value={o.label}
            onChange={(e) =>
              // Edit in place so the option keeps its value (and its answers) while its label changes.
              onChange(
                { options: opts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) },
                `opt:${f.id}:${i}`,
              )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const next = [...labels];
                next.splice(i + 1, 0, '');
                // An empty label is not a valid option yet; keep a placeholder row until it is typed.
                onChange({
                  options: [
                    ...opts.slice(0, i + 1),
                    { value: `option_${Date.now().toString(36)}`, label: '' },
                    ...opts.slice(i + 1),
                  ],
                });
                setFocusAt(i + 1);
              } else if (e.key === 'Backspace' && !o.label && opts.length > 1) {
                e.preventDefault();
                onChange({ options: opts.filter((_, j) => j !== i) });
                setFocusAt(Math.max(0, i - 1));
              } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                const j = i + (e.key === 'ArrowUp' ? -1 : 1);
                if (j >= 0 && j < opts.length) {
                  const n = [...opts];
                  [n[i], n[j]] = [n[j]!, n[i]!];
                  onChange({ options: n });
                  setFocusAt(j);
                }
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (!/[\n,\t]/.test(text)) return;
              e.preventDefault();
              const pasted = parseBulkOptions(text);
              const next = [...labels];
              next.splice(i, 1, ...pasted);
              set(next);
            }}
          />
          <IconButton
            icon="x"
            label={`Remove option ${i + 1}`}
            disabled={opts.length <= 1}
            onClick={() => onChange({ options: opts.filter((_, j) => j !== i) })}
          />
        </li>
      ))}
      <li>
        <Button
          variant="ghost"
          onClick={() => {
            onChange({
              options: [...opts, { value: `option_${Date.now().toString(36)}`, label: '' }],
            });
            setFocusAt(opts.length);
          }}
        >
          <Icon name="plus" size="sm" /> Add option
        </Button>
      </li>
    </ul>
  );
}

// ------------------------------------------------------------------------------------------------ inspector
function Inspector({
  f,
  all,
  issue,
  onPatch,
  onType,
  onMove,
}: {
  f: FormField;
  all: FormField[];
  issue: { label?: string; options?: string; logic?: string; other?: string } | undefined;
  onPatch: (p: Partial<FormField>, merge?: string) => void;
  onType: (t: FormField['type']) => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const [bulk, setBulk] = useState(false);
  const earlier = conditionCandidates(all, f.id);
  const dep = earlier.find((x) => x.id === f.show_if?.field);
  const answers = conditionAnswers(dep);
  const eq = f.show_if && 'equals' in f.show_if ? String(f.show_if.equals) : '';
  const setVal = (k: 'min' | 'max' | 'min_length' | 'max_length', v: string) => {
    const next = { ...(f.validation ?? {}) } as Record<string, number>;
    if (v.trim() === '' || Number.isNaN(Number(v))) delete next[k];
    else next[k] = Number(v);
    onPatch({ validation: Object.keys(next).length ? next : undefined }, `v:${f.id}:${k}`);
  };
  return (
    <>
      <span className={styles.kicker}>Question settings</span>
      <details open>
        <summary>Question</summary>
        <div className={styles.stack}>
          <TextField
            label="Label"
            value={f.label}
            error={issue?.label}
            maxLength={200}
            onChange={(e) => onPatch({ label: e.target.value }, `${f.id}:label`)}
          />
          <TextField
            label="Help text"
            value={f.help ?? ''}
            maxLength={500}
            onChange={(e) => onPatch({ help: e.target.value || undefined }, `${f.id}:help`)}
          />
          {TEXTY.includes(f.type) ? (
            <TextField
              label="Placeholder"
              value={f.placeholder ?? ''}
              maxLength={120}
              onChange={(e) => onPatch({ placeholder: e.target.value || undefined }, `${f.id}:ph`)}
            />
          ) : null}
          <Select
            label="Type"
            value={f.type}
            options={PALETTE.map((p) => ({ value: p.type, label: p.label }))}
            onChange={(e) => onType(e.target.value as FormField['type'])}
          />
        </div>
      </details>
      {isChoice(f.type) ? (
        <details open>
          <summary>
            Options <span className={styles.muted}>{f.options?.length ?? 0} options</span>
          </summary>
          <div className={styles.stack}>
            {issue?.options ? (
              <span className={styles.err} role="alert">
                {issue.options}
              </span>
            ) : null}
            <Button variant="secondary" onClick={() => setBulk((b) => !b)}>
              {bulk ? 'Done' : 'Bulk edit'}
            </Button>
            {bulk ? (
              <TextArea
                label="One option per line"
                rows={6}
                value={(f.options ?? []).map((o) => o.label).join('\n')}
                onChange={(e) =>
                  onPatch({
                    options: optionsFromLabels(
                      parseBulkOptions(e.target.value.replace(/,/g, '\n')),
                      f.options,
                    ),
                  })
                }
              />
            ) : null}
          </div>
        </details>
      ) : null}
      <details open>
        <summary>Validation</summary>
        <div className={styles.stack}>
          <label className={styles.switchRow}>
            <input
              type="checkbox"
              checked={f.required === true}
              onChange={(e) => onPatch({ required: e.target.checked || undefined })}
            />
            <span>
              <strong>Required</strong>
              <span className={styles.muted}> Parents must answer to continue.</span>
            </span>
          </label>
          <label className={styles.switchRow}>
            <input
              type="checkbox"
              checked={f.sensitive === true}
              onChange={(e) => onPatch({ sensitive: e.target.checked || undefined })}
            />
            <span>
              <strong>Medical or sensitive</strong>
              <span className={styles.muted}> Stored apart; only admins can read it.</span>
            </span>
          </label>
          {f.type === 'number' ? (
            <div className={styles.grid2}>
              <TextField
                label="Minimum"
                inputMode="numeric"
                value={f.validation?.min?.toString() ?? ''}
                onChange={(e) => setVal('min', e.target.value)}
              />
              <TextField
                label="Maximum"
                inputMode="numeric"
                value={f.validation?.max?.toString() ?? ''}
                onChange={(e) => setVal('max', e.target.value)}
              />
            </div>
          ) : null}
          {f.type === 'short_text' || f.type === 'long_text' ? (
            <div className={styles.grid2}>
              <TextField
                label="Min length"
                inputMode="numeric"
                value={f.validation?.min_length?.toString() ?? ''}
                onChange={(e) => setVal('min_length', e.target.value)}
              />
              <TextField
                label="Max length"
                inputMode="numeric"
                value={f.validation?.max_length?.toString() ?? ''}
                onChange={(e) => setVal('max_length', e.target.value)}
              />
            </div>
          ) : null}
        </div>
      </details>
      <details open>
        <summary>Layout</summary>
        <div className={styles.stack}>
          <SegmentedControl
            label="Width"
            value={f.width ?? 'full'}
            options={[
              { value: 'half', label: 'Half width' },
              { value: 'full', label: 'Full width' },
            ]}
            onChange={(w) => onPatch({ width: w === 'half' ? 'half' : undefined })}
          />
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => onMove(-1)}>
              <Icon name="arrow-up" size="sm" /> Move up
            </Button>
            <Button variant="secondary" onClick={() => onMove(1)}>
              <Icon name="arrow-down" size="sm" /> Move down
            </Button>
          </div>
        </div>
      </details>
      <details open={Boolean(f.show_if) || undefined}>
        <summary>Logic</summary>
        <div className={styles.stack}>
          {earlier.length === 0 ? (
            <p className={styles.muted}>
              Add an earlier question to show this one only for certain answers.
            </p>
          ) : (
            <>
              <Select
                label="Show this question only if…"
                value={f.show_if?.field ?? ''}
                options={[
                  { value: '', label: 'Always show' },
                  ...earlier.map((x) => ({ value: x.id, label: x.label || 'Untitled question' })),
                ]}
                onChange={(e) =>
                  onPatch({
                    show_if: e.target.value ? { field: e.target.value, equals: '' } : undefined,
                  })
                }
              />
              {f.show_if ? (
                <>
                  {answers ? (
                    <Select
                      label="Is"
                      value={eq}
                      options={[{ value: '', label: 'Choose an answer' }, ...answers]}
                      onChange={(e) =>
                        onPatch({
                          show_if: {
                            field: f.show_if!.field,
                            equals:
                              dep?.type === 'checkbox' || dep?.type === 'consent_checkbox'
                                ? e.target.value === 'true'
                                : e.target.value,
                          },
                        })
                      }
                    />
                  ) : (
                    <TextField
                      label="Is"
                      value={eq}
                      onChange={(e) =>
                        onPatch(
                          { show_if: { field: f.show_if!.field, equals: e.target.value } },
                          `${f.id}:eq`,
                        )
                      }
                    />
                  )}
                  {issue?.logic ? (
                    <span className={styles.err} role="alert">
                      {issue.logic}
                    </span>
                  ) : null}
                </>
              ) : null}
            </>
          )}
          <span className={styles.muted}>Type: {typeLabel(f.type)}</span>
        </div>
      </details>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- slash menu
function SlashMenu({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (t: FormField['type']) => void;
}) {
  const [q, setQ] = useState('');
  const items = PALETTE.filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className={styles.slash} onMouseDown={onClose}>
      <div
        className={styles.slashPanel}
        role="dialog"
        aria-modal="true"
        aria-label="Insert a question"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className={styles.optInput}
          aria-label="Search question types"
          placeholder="Type to filter…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && items[0]) onPick(items[0].type);
          }}
        />
        {items.map((p) => (
          <button
            key={p.type}
            type="button"
            className={styles.paletteBtn}
            onClick={() => onPick(p.type)}
          >
            <Icon name={p.icon as IconName} size="sm" /> {p.label}
          </button>
        ))}
        {items.length === 0 ? <p className={styles.muted}>No question type matches.</p> : null}
      </div>
    </div>
  );
}
