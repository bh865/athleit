'use client';

import { EDIT_WINDOW_MINUTES, editSecondsLeft, type PlatformRole } from '@athleit/core';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getClient } from '@/lib/supabase/browser';

import { StepUpSheet } from './mfa';

export interface AdminClientContext {
  role: PlatformRole;
  displayName: string;
  stripeMode: 'test' | 'live';
  asOf: string;
  factorId: string;
  /** Editing is on: an aal2 session verified within the last 15 minutes. UI convenience; the database enforces aal2. */
  editing: boolean;
  secondsLeft: number;
  /** Open the verify sheet; resolves true once verified. */
  verify: () => Promise<boolean>;
  /** Run a write now when editing, otherwise open the step-up sheet, keep the change, and run it right after verifying. */
  withEditing: (apply: () => void | Promise<void>) => void;
}

const Ctx = createContext<AdminClientContext | null>(null);
export function useAdmin(): AdminClientContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdmin must be used inside AdminProvider');
  return v;
}

export function AdminProvider({
  children,
  role,
  displayName,
  stripeMode,
  asOf,
  factorId,
  verifiedAt,
}: {
  children: ReactNode;
  role: PlatformRole;
  displayName: string;
  stripeMode: 'test' | 'live';
  asOf: string;
  factorId: string;
  verifiedAt: number | null;
}) {
  const router = useRouter();
  // Verified in this tab (step-up) or on the server render, whichever is newer. No effect needed to sync the prop.
  const [localVerified, setLocalVerified] = useState<number | null>(null);
  const verified = Math.max(localVerified ?? 0, verifiedAt ?? 0) || null;
  const [secondsLeft, setSecondsLeft] = useState(() => editSecondsLeft(verifiedAt));
  const [sheetOpen, setSheetOpen] = useState(false);
  const waiting = useRef<{ resolve: (ok: boolean) => void; pending?: () => void | Promise<void> } | null>(null);

  useEffect(() => {
    const tick = () => setSecondsLeft(editSecondsLeft(verified));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [verified]);

  const settle = useCallback((ok: boolean) => {
    const w = waiting.current;
    waiting.current = null;
    setSheetOpen(false);
    w?.resolve(ok);
    if (ok) void w?.pending?.();
  }, []);

  const open = useCallback((pending?: () => void | Promise<void>) => {
    waiting.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      waiting.current = { resolve, ...(pending ? { pending } : {}) };
      setSheetOpen(true);
    });
  }, []);

  const value = useMemo<AdminClientContext>(
    () => ({
      role,
      displayName,
      stripeMode,
      asOf,
      factorId,
      editing: secondsLeft > 0,
      secondsLeft,
      verify: () => open(),
      withEditing: (apply) => {
        if (secondsLeft > 0) void apply();
        else void open(apply);
      },
    }),
    [role, displayName, stripeMode, asOf, factorId, secondsLeft, open],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <StepUpSheet
        open={sheetOpen}
        factorId={factorId}
        onCancel={() => settle(false)}
        onVerified={() => {
          setLocalVerified(Math.floor(Date.now() / 1000));
          router.refresh(); // pick up the aal2 session on the server
          settle(true);
        }}
        minutes={EDIT_WINDOW_MINUTES}
        client={getClient}
      />
    </Ctx.Provider>
  );
}
