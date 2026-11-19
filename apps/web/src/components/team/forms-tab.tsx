'use client';

import {
  FORM_STARTERS,
  adaptFormSchema,
  friendlyError,
  matchesQuery,
  shortDateLabel,
} from '@athleit/core';
import {
  archiveForm,
  createForm,
  listForms,
  listRegistrationEvents,
} from '@athleit/db/registration';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { FormMessage } from '@/components/app/states';
import { useTeam } from '@/components/app/team-context';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Icon,
  IconButton,
  IconCircle,
  ListGroup,
  ListRow,
  Popover,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { ListState, SearchField, ShowMore, useShowMore } from './parts';
import { HeaderAction } from './team-hub';
import styles from './team.module.css';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Forms: the reusable question sets registrations point to. Building happens on web only. */
export function FormsTab() {
  const { team, caps } = useTeam();
  const router = useRouter();
  const toast = useToast();
  const client = getClient();
  const manage = caps.has('registration.manage');
  const owner = { teamId: team.id };
  const newHref = `/manage/forms/new?team=${team.id}`;

  const data = useLoad(async () => {
    const [forms, events] = await Promise.all([
      listForms(client, owner, true),
      listRegistrationEvents(client, owner),
    ]);
    if (forms.error) return forms;
    if (events.error) return events;
    return { data: { forms: forms.data, events: events.data }, error: null };
  }, [team.id]);

  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const all = data.data?.forms ?? [];
  const archivedCount = all.filter((f) => f.archived_at).length;
  const rows = all.filter(
    (f) => Boolean(f.archived_at) === archived && matchesQuery(search, f.name),
  );
  const page = useShowMore(rows, `${archived}|${search}`);
  const usedIn = (f: (typeof all)[number]) => {
    const ids = new Set(f.form_versions.map((v) => v.id));
    return (data.data?.events ?? []).filter((e) => e.form_version_id && ids.has(e.form_version_id))
      .length;
  };
  const questions = (f: (typeof all)[number]) => adaptFormSchema(f.draft_schema).fields.length;

  async function duplicate(f: (typeof all)[number]) {
    setError(null);
    const r = await createForm(client, owner, `${f.name} copy`.slice(0, 100), {
      fields: adaptFormSchema(f.draft_schema).fields,
    } as never);
    if (r.error) return setError(friendlyError(r.error));
    toast('Form duplicated');
    data.reload();
  }
  async function setArchive(f: (typeof all)[number], on: boolean) {
    setError(null);
    const r = await archiveForm(client, f.id, on);
    if (r.error) return setError(friendlyError(r.error));
    toast(on ? 'Form archived' : 'Form restored');
    data.reload();
  }
  async function applyStarter(id: string) {
    const s = FORM_STARTERS.find((x) => x.id === id);
    if (!s) return;
    setBusy(id);
    setError(null);
    const r = await createForm(client, owner, s.name, { fields: s.fields } as never);
    setBusy(null);
    if (r.error) return setError(friendlyError(r.error));
    router.push(`/manage/forms/${r.data}`);
  }

  const empty = all.length === 0;
  return (
    <div className={styles.stack}>
      {manage ? (
        <HeaderAction>
          <ButtonLink href={newHref}>
            <Icon name="plus" size="sm" /> New form
          </ButtonLink>
        </HeaderAction>
      ) : null}
      <FormMessage error={error} />
      <ListState
        name="forms"
        loading={data.loading}
        error={data.error}
        onRetry={data.reload}
        empty={undefined}
      >
        {empty ? (
          <Card className={styles.stack}>
            <div className={styles.emptyHead}>
              <IconCircle>
                <Icon name="list-checks" />
              </IconCircle>
              <h2 className={styles.section}>No forms yet</h2>
              <p className={styles.muted}>
                Forms hold the questions parents answer when they register. Start from a template or
                build your own.
              </p>
            </div>
            {manage ? (
              <div className={styles.cols}>
                {FORM_STARTERS.map((s) => (
                  <div key={s.id} className={styles.tile}>
                    <IconCircle>
                      <Icon name={s.icon as never} />
                    </IconCircle>
                    <strong>{s.name}</strong>
                    <span className={styles.muted}>{s.description}</span>
                    <div className={`${styles.row} ${styles.between}`}>
                      <span className={`${styles.muted} ${styles.mono}`}>
                        {plural(s.fields.length, 'question')}
                      </span>
                      <Button
                        variant="secondary"
                        loading={busy === s.id}
                        onClick={() => void applyStarter(s.id)}
                      >
                        Use template
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        ) : (
          <>
            <div className={styles.toolbar}>
              <SearchField label="Search forms" value={search} onChange={setSearch} />
              {archivedCount > 0 || archived ? (
                <Button variant="secondary" onClick={() => setArchived((a) => !a)}>
                  <Icon name="archive-box" size="sm" />{' '}
                  {archived ? 'Back to forms' : `Archived (${archivedCount})`}
                </Button>
              ) : null}
            </div>
            {rows.length === 0 ? (
              <p className={styles.muted}>
                {archived ? 'Nothing archived.' : 'No forms match that search.'}
              </p>
            ) : (
              <ListGroup data-testid="forms-library">
                {page.items.map((f) => {
                  const used = usedIn(f);
                  return (
                    <li key={f.id}>
                      <ListRow
                        leading={
                          <IconCircle>
                            <Icon name="clipboard-text" />
                          </IconCircle>
                        }
                        title={f.name}
                        subtitle={`${plural(questions(f), 'question')} · ${
                          used ? `Used in ${plural(used, 'registration')}` : 'Not used yet'
                        } · Edited ${shortDateLabel(f.updated_at)}`}
                        trailing={
                          <>
                            {f.form_versions.length === 0 ? <Badge>Draft only</Badge> : null}
                            {manage ? (
                              <>
                                <ButtonLink variant="secondary" href={`/manage/forms/${f.id}`}>
                                  Edit
                                </ButtonLink>
                                <RowMenu
                                  name={f.name}
                                  archived={Boolean(f.archived_at)}
                                  onDuplicate={() => void duplicate(f)}
                                  onArchive={() => void setArchive(f, !f.archived_at)}
                                  onEdit={() => router.push(`/manage/forms/${f.id}`)}
                                />
                              </>
                            ) : null}
                          </>
                        }
                      />
                    </li>
                  );
                })}
              </ListGroup>
            )}
            <ShowMore
              total={page.total}
              shown={page.items.length}
              remaining={page.remaining}
              onMore={page.more}
            />
          </>
        )}
      </ListState>
      <p className={styles.muted}>
        <Icon name="desktop" size="sm" /> Registrations and forms are created on web. Parents
        complete them on web and mobile.
      </p>
    </div>
  );
}

/** Duplicate / Edit / Archive. */
function RowMenu({
  name,
  archived,
  onDuplicate,
  onEdit,
  onArchive,
}: {
  name: string;
  archived: boolean;
  onDuplicate: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const item = (icon: 'copy' | 'pencil' | 'archive-box', label: string, run: () => void) => (
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
          label={`More actions for ${name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        />
      </span>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        label="Form actions"
        align="end"
      >
        <div role="menu" className={styles.menu}>
          {archived ? null : item('copy', 'Duplicate', onDuplicate)}
          {archived ? null : item('pencil', 'Edit', onEdit)}
          {item('archive-box', archived ? 'Restore' : 'Archive', onArchive)}
        </div>
      </Popover>
    </>
  );
}
