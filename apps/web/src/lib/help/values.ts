// Public live values for articles (price, trial length, billing on or off). anon-callable, non-secret, cached for five minutes.
import type { HelpValues } from '@athleit/core';

import { env } from '@/env';

export async function getHelpValues(): Promise<HelpValues | null> {
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/get_public_help_values`, {
      method: 'POST',
      headers: {
        apikey: env.anonKey,
        authorization: `Bearer ${env.anonKey}`,
        'content-type': 'application/json',
      },
      body: '{}',
      next: { revalidate: 300 },
    });
    return res.ok ? ((await res.json()) as HelpValues) : null;
  } catch {
    return null;
  }
}
