'use client';

import {
  FORM_FIELD_TYPES,
  FORM_TEMPLATES,
  CHOICE_FIELD_TYPES,
  formSchemaSchema,
  friendlyError,
  type FormField,
} from '@athleit/core';
import {
  createForm,
  getForm,
  publishFormVersion,
  saveFormDraft,
  type Owner,
} from '@athleit/db/registration';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { FormMessage } from '@/components/app/states';
import {
  Badge,
  Button,
  Card,
  Heading,
  IconButton,
  Select,
  Text,
  TextArea,
  TextField,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import { FormRenderer, type Answers } from './form-renderer';
import styles from './registration.module.css';

const TYPE_LABEL: Record<string, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  email: 'Email',
  phone: 'Phone',
  number: 'Number',
  date: 'Date',
  single_choice: 'Pick one (buttons)',
  multiple_choice: 'Pick several',
  dropdown: 'Pick one (list)',
  checkbox: 'Checkbox',
  consent_checkbox: 'Consent checkbox',
  address: 'Address',
};
const idFrom = (label: string, taken: Set<string>) => {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[^a-z]+/, '')
      .slice(0, 30) || 'field';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base.slice(0, 36)}_${n}`;
  return id;
};

/** Form builder (web only). Drafts are editable; publishing freezes an immutable version that registrations point to. */
export function FormBuilder({ formId, owner }: { formId: string | null; owner: Owner }) {
  const client = getClient();
  const router = useRouter();
  const [name, setName] = useState('');
  const [fields, setFields] = useState<FormField[]>([]);
  const [versions, setVersions] = useState(0);
  const [preview, setPreview] = useState<Answers>({});
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error?: string; success?: string }>({});

  useEffect(() => {
    if (!formId) return;
    void getForm(client, formId).then((r) => {
      if (r.error) return setNotice({ error: friendlyError(r.error) });
      setName(r.data.name);
      setFields(((r.data.draft_schema as { fields?: FormField[] })?.fields ?? []) as FormField[]);
      setVersions(r.data.form_versions.length);
    });
  }, [client, formId]);

  const patch = (i: number, p: Partial<FormField>) =>
    setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const move = (i: number, d: -1 | 1) =>
    setFields((fs) => {
      const j = i + d;
      if (j < 0 || j >= fs.length) return fs;
      const n = [...fs];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  const add = () =>
    setFields((fs) => [
      ...fs,
      {
        id: idFrom('Question', new Set(fs.map((f) => f.id))),
        type: 'short_text',
        label: 'New question',
      },
    ]);

  function check(): boolean {
    const r = formSchemaSchema.safeParse({ fields });
    setIssues(
      r.success
        ? []
        : r.error.issues.map(
            (i) =>
              `${i.path.includes('fields') ? `Question ${Number(i.path[1]) + 1}: ` : ''}${i.message}`,
          ),
    );
    return r.success;
  }
  async function save(publish: boolean) {
    if (!name.trim()) return setNotice({ error: 'Give the form a name.' });
    if (!check()) return setNotice({ error: 'Fix the problems below first.' });
    setBusy(true);
    setNotice({});
    let id = formId;
    if (!id) {
      const c = await createForm(client, owner, name, { fields } as never);
      if (c.error) {
        setBusy(false);
        return setNotice({ error: friendlyError(c.error) });
      }
      id = c.data;
    } else {
      const s = await saveFormDraft(client, id, name, { fields } as never);
      if (s.error) {
        setBusy(false);
        return setNotice({ error: friendlyError(s.error) });
      }
    }
    if (publish) {
      const p = await publishFormVersion(client, id);
      if (p.error) {
        setBusy(false);
        return setNotice({ error: friendlyError(p.error) });
      }
      setVersions((v) => v + 1);
    }
    setBusy(false);
    setNotice({
      success: publish ? 'Published. New registrations use this version.' : 'Draft saved.',
    });
    if (!formId) router.replace(`/manage/forms/${id}`);
  }

  return (
    <div className={styles.stack}>
      <Heading as="h1" level="title">
        {formId ? 'Edit form' : 'New form'}
      </Heading>
      <Text muted>
        Ask only what you need to run the program. Don’t ask for government IDs, Social Security
        numbers or card details.
      </Text>
      <TextField
        label="Form name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
      />
      {fields.length === 0 && (
        <Card>
          <div className={styles.stack}>
            <Heading as="h2">Start from a template</Heading>
            {FORM_TEMPLATES.map((t) => (
              <div key={t.id} className={styles.row}>
                <div className={styles.grow}>
                  <Text variant="label">{t.name}</Text>
                  <Text as="p" muted>
                    {t.description}
                  </Text>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFields(t.fields);
                    if (!name) setName(t.name);
                  }}
                >
                  Use
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {fields.map((f, i) => {
        const choice = CHOICE_FIELD_TYPES.includes(f.type);
        const earlier = fields.slice(0, i);
        const ref = earlier.find((x) => x.id === f.show_if?.field);
        return (
          <div key={i} className={`${styles.editorField} ${styles.stack}`}>
            <div className={`${styles.row} ${styles.between}`}>
              <Text variant="label">
                Question {i + 1}{' '}
                {f.sensitive ? <Badge tone="warning">Medical, stored apart</Badge> : null}
              </Text>
              <div className={styles.row}>
                <IconButton
                  icon="arrow-up"
                  label={`Move question ${i + 1} up`}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                />
                <IconButton
                  icon="arrow-down"
                  label={`Move question ${i + 1} down`}
                  onClick={() => move(i, 1)}
                  disabled={i === fields.length - 1}
                />
                <IconButton
                  icon="trash"
                  label={`Delete question ${i + 1}`}
                  onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}
                />
              </div>
            </div>
            <TextField
              label="Question"
              value={f.label}
              onChange={(e) => patch(i, { label: e.target.value })}
              maxLength={200}
            />
            <Select
              label="Answer type"
              value={f.type}
              onChange={(e) => {
                const type = e.target.value as FormField['type'];
                const next: Partial<FormField> = { type };
                if (CHOICE_FIELD_TYPES.includes(type))
                  next.options = f.options ?? [{ value: 'option_1', label: 'Option 1' }];
                patch(i, next);
                if (!CHOICE_FIELD_TYPES.includes(type))
                  setFields((fs) =>
                    fs.map((x, j) => {
                      if (j !== i) return x;
                      const { options: _o, ...rest } = x;
                      void _o;
                      return rest as FormField;
                    }),
                  );
              }}
              options={FORM_FIELD_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t }))}
            />
            {choice && (
              <TextArea
                label="Options (one per line)"
                rows={4}
                value={(f.options ?? []).map((o) => o.label).join('\n')}
                onChange={(e) =>
                  patch(i, {
                    options: e.target.value
                      .split('\n')
                      .filter((l) => l.trim())
                      .map((label, k) => ({
                        value: idFrom(label, new Set()) + (k ? `_${k}` : ''),
                        label: label.trim(),
                      })),
                  })
                }
              />
            )}
            <TextField
              label="Help text (optional)"
              value={f.help ?? ''}
              onChange={(e) => patch(i, { help: e.target.value })}
              maxLength={500}
            />
            <div className={styles.row}>
              <label className={styles.choice}>
                <input
                  type="checkbox"
                  checked={f.required === true}
                  onChange={(e) => patch(i, { required: e.target.checked })}
                />{' '}
                Required
              </label>
              <label className={styles.choice}>
                <input
                  type="checkbox"
                  checked={f.sensitive === true}
                  onChange={(e) => patch(i, { sensitive: e.target.checked })}
                />{' '}
                Medical or sensitive
              </label>
            </div>
            {i > 0 && (
              <div className={styles.row}>
                <Select
                  label="Show only when"
                  value={f.show_if?.field ?? ''}
                  onChange={(e) => {
                    if (!e.target.value) {
                      setFields((fs) =>
                        fs.map((x, j) => {
                          if (j !== i) return x;
                          const { show_if: _s, ...rest } = x;
                          void _s;
                          return rest as FormField;
                        }),
                      );
                    } else patch(i, { show_if: { field: e.target.value, equals: '' } });
                  }}
                  options={[
                    { value: '', label: 'Always show' },
                    ...earlier.map((x) => ({ value: x.id, label: x.label })),
                  ]}
                />
                {f.show_if &&
                  (ref?.options ? (
                    <Select
                      label="Equals"
                      value={String('equals' in f.show_if ? f.show_if.equals : '')}
                      onChange={(e) =>
                        patch(i, { show_if: { field: f.show_if!.field, equals: e.target.value } })
                      }
                      options={[{ value: '', label: 'Choose' }, ...ref.options]}
                    />
                  ) : ref?.type === 'checkbox' || ref?.type === 'consent_checkbox' ? (
                    <Select
                      label="Equals"
                      value={String('equals' in f.show_if ? f.show_if.equals : '')}
                      onChange={(e) =>
                        patch(i, {
                          show_if: { field: f.show_if!.field, equals: e.target.value === 'true' },
                        })
                      }
                      options={[
                        { value: 'true', label: 'Checked' },
                        { value: 'false', label: 'Not checked' },
                      ]}
                    />
                  ) : (
                    <TextField
                      label="Equals"
                      value={String('equals' in f.show_if ? f.show_if.equals : '')}
                      onChange={(e) =>
                        patch(i, { show_if: { field: f.show_if!.field, equals: e.target.value } })
                      }
                    />
                  ))}
              </div>
            )}
          </div>
        );
      })}
      <Button variant="secondary" onClick={add}>
        Add a question
      </Button>

      {issues.length > 0 && (
        <ul role="alert" className={styles.list}>
          {issues.map((m, k) => (
            <li key={k} className={styles.err}>
              {m}
            </li>
          ))}
        </ul>
      )}
      {fields.length > 0 && (
        <Card>
          <div className={styles.stack}>
            <Heading as="h2">Preview</Heading>
            {(() => {
              const p = formSchemaSchema.safeParse({ fields });
              return p.success ? (
                <FormRenderer schema={p.data} answers={preview} errors={{}} onChange={setPreview} />
              ) : (
                <Text muted>Fix the problems above to see the preview.</Text>
              );
            })()}
          </div>
        </Card>
      )}
      <div className={styles.row}>
        <Button variant="secondary" disabled={busy} onClick={() => void save(false)}>
          Save draft
        </Button>
        <Button disabled={busy || fields.length === 0} onClick={() => void save(true)}>
          Publish version {versions + 1}
        </Button>
      </div>
      <Text muted>
        Published versions never change, so earlier registrations keep the questions they answered.
      </Text>
      {notice.error ? <FormMessage error={notice.error} /> : null}
      {notice.success ? <FormMessage success={notice.success} /> : null}
    </div>
  );
}
