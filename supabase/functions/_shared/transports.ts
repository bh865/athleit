import type { EmailMessage, ExpoMessage, ExpoTicket } from './deliver.ts';

type Fetch = typeof fetch;

/** Expo push service. `url` is overridable so tests can point at a mock endpoint. */
export function expoTransport(opts: { url?: string; accessToken?: string | undefined; fetch?: Fetch }) {
  const f = opts.fetch ?? fetch;
  const url = opts.url ?? 'https://exp.host/--/api/v2/push/send';
  return async (messages: ExpoMessage[]): Promise<ExpoTicket[]> => {
    const res = await f(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) throw new Error(`expo_http_${res.status}`);
    const json = (await res.json()) as { data?: ExpoTicket[] };
    if (!Array.isArray(json.data)) throw new Error('expo_bad_response');
    return json.data;
  };
}

/** Resend transactional email (https://resend.com/docs/api-reference/emails/send-email). */
export function resendTransport(opts: { apiKey: string; from: string; appUrl: string; url?: string; fetch?: Fetch }) {
  const f = opts.fetch ?? fetch;
  return async (msg: EmailMessage): Promise<{ ok: boolean; status: number }> => {
    const res = await f(opts.url ?? 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: opts.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text.replace('{{APP_URL}}', opts.appUrl),
      }),
    });
    return { ok: res.ok, status: res.status };
  };
}
