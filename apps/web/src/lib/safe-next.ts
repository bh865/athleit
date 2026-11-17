/** Only same-site relative paths, so `next` can never become an open redirect. */
export function safeNext(value: string | null | undefined): string {
  if (!value) return '/';
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';
}
