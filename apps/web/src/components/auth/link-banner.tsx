'use client';

import {
  claimBanner,
  inviteBanner,
  linkProblemCopy,
  type InviteKind,
  type PublicPreviewOutcome,
} from '@athleit/core';
import { previewClaimPublic, previewInvitePublic } from '@athleit/db/api';
import { useEffect, useState } from 'react';

import { getClient } from '@/lib/supabase/browser';

import styles from './auth-page.module.css';

interface BannerData {
  kind: 'banner' | 'problem';
  title: string;
  body: string;
}

const INVITE = /^\/invite\/([^/?#]+)/;
const CLAIM = /^\/claim\/([0-9a-fA-F-]{36})(?:[/?#]|$)/;

async function load(next: string): Promise<BannerData | null> {
  const invite = INVITE.exec(next);
  const claim = CLAIM.exec(next);
  const client = getClient();
  if (invite?.[1]) {
    let token: string;
    try {
      token = decodeURIComponent(invite[1]);
    } catch {
      return { kind: 'problem', ...linkProblemCopy('invalid') };
    }
    const res = await previewInvitePublic(client, token);
    const row = res.data?.[0];
    const outcome = (row?.outcome ?? 'invalid') as PublicPreviewOutcome;
    if (row && outcome === 'ok') {
      return {
        kind: 'banner',
        ...inviteBanner({
          kind: row.kind as InviteKind,
          targetName: row.target_name ?? '',
          role: row.role ?? '',
          inviterFirstName: row.inviter_first_name,
        }),
      };
    }
    return { kind: 'problem', ...linkProblemCopy(outcome === 'ok' ? 'invalid' : outcome) };
  }
  if (claim?.[1]) {
    const res = await previewClaimPublic(client, claim[1]);
    const row = res.data?.[0];
    const outcome = (row?.outcome ?? 'invalid') as PublicPreviewOutcome;
    if (row && outcome === 'ok') return { kind: 'banner', ...claimBanner(row.player_first_name) };
    return { kind: 'problem', ...linkProblemCopy(outcome === 'ok' ? 'invalid' : outcome) };
  }
  return null;
}

/**
 * Who invited you and what you are joining, above the form. It loads in the browser so the
 * preview's attempt limit counts the visitor, not the web server that renders this page.
 */
export function LinkBanner({ next }: { next: string | undefined }) {
  const [data, setData] = useState<BannerData | null>(null);
  useEffect(() => {
    if (!next) return;
    let live = true;
    void load(next).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [next]);
  if (!data) return null;
  return (
    <section
      className={data.kind === 'problem' ? styles.bannerProblem : styles.banner}
      role={data.kind === 'problem' ? 'alert' : undefined}
      aria-label={data.title}
    >
      <h3 className={styles.bannerTitle}>{data.title}</h3>
      <p className={styles.bannerBody}>{data.body}</p>
    </section>
  );
}
