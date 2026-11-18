'use client';

import { createClubSchema, fieldErrors, friendlyError, type FieldErrors } from '@athleit/core';
import { createClub } from '@athleit/db/api';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useApp } from '@/components/app/app-provider';
import styles from '@/components/app/app.module.css';
import { formText, slugify } from '@/components/app/form-utils';
import { FormMessage } from '@/components/app/states';
import { Button, Card, PageHeader, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

export default function NewClubPage() {
  const router = useRouter();
  const { refresh, setActive } = useApp();
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<'name' | 'slug'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = createClubSchema.safeParse({ name: formText(fd, 'name'), slug });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    const res = await createClub(getClient(), parsed.data);
    if (res.error) {
      setBusy(false);
      return setError(friendlyError(res.error));
    }
    await refresh();
    setActive(`club:${res.data}:admin`);
    router.push(`/clubs/${res.data}`);
  }

  return (
    <>
      <PageHeader
        title="Create a club"
        subtitle="A club groups teams. Teams ask to join it and you approve each one."
      />
      <Card>
        <form onSubmit={onSubmit} noValidate className={styles.stack}>
          <TextField
            name="name"
            label="Club name"
            error={errors.name}
            onChange={(e) => {
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
          <TextField
            name="slug"
            label="Web address"
            hint="Teams use this to find your club. Lowercase letters, numbers and hyphens."
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            autoCapitalize="none"
            mono
            error={errors.slug}
          />
          <FormMessage error={error} />
          <Button type="submit" loading={busy}>
            Create club
          </Button>
        </form>
      </Card>
    </>
  );
}
