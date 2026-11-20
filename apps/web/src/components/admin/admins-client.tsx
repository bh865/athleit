'use client';

import { roleAtLeast, type PlatformRole } from '@athleit/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { addAdminAction, removeAdminAction, setAdminRoleAction } from '@/app/admin/actions';
import { Button, Select, TextField } from '@/components/ui';

import { ConfirmWrite } from './confirm-write';

const ROLES = [
  { value: 'support', label: 'Support' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
];

export function AddAdmin({ role }: { role: PlatformRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [pick, setPick] = useState('support');
  return (
    <>
      <Button disabled={!roleAtLeast(role, 'owner')} onClick={() => setOpen(true)}>
        Add admin
      </Button>
      <ConfirmWrite
        open={open}
        onClose={() => setOpen(false)}
        title="Add admin"
        confirmLabel="Add admin"
        onDone={() => {
          setEmail('');
          router.refresh();
        }}
        rows={[{ label: 'Admin', before: 'Not an admin', after: `${email || '…'} · ${pick}` }]}
        impact="They can read right away. To change anything they must set up two-step verification first."
        onSubmit={(why) => addAdminAction(email, pick, why)}
      >
        <TextField
          label="Email of an existing account"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select
          label="Role"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          options={ROLES}
        />
      </ConfirmWrite>
    </>
  );
}

export function AdminRowActions({
  profileId,
  name,
  current,
  role,
}: {
  profileId: string;
  name: string;
  current: PlatformRole;
  role: PlatformRole;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | 'role' | 'remove'>(null);
  const [pick, setPick] = useState<string>(current);
  const owner = roleAtLeast(role, 'owner');
  return (
    <>
      <Button
        variant="ghost"
        disabled={!owner}
        onClick={() => {
          setPick(current);
          setMode('role');
        }}
      >
        Change role
      </Button>
      <Button variant="ghost" disabled={!owner} onClick={() => setMode('remove')}>
        Remove
      </Button>
      <ConfirmWrite
        open={mode === 'role'}
        onClose={() => setMode(null)}
        title={`Change role for ${name}`}
        onDone={() => router.refresh()}
        rows={[{ label: 'Role', before: current, after: pick }]}
        onSubmit={(why) => setAdminRoleAction(profileId, pick, why)}
      >
        <Select
          label="New role"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          options={ROLES}
        />
      </ConfirmWrite>
      <ConfirmWrite
        open={mode === 'remove'}
        onClose={() => setMode(null)}
        title={`Remove ${name}`}
        confirmLabel="Remove admin"
        onDone={() => router.refresh()}
        rows={[{ label: 'Role', before: current, after: 'Not an admin' }]}
        impact="They lose all access to the admin portal immediately."
        onSubmit={(why) => removeAdminAction(profileId, why)}
      />
    </>
  );
}
