/** Read a text field from FormData ('' when absent). */
export function formText(data: FormData, key: string): string {
  const v = data.get(key);
  return typeof v === 'string' ? v : '';
}

/** Lower-case, hyphenated slug suggestion from a display name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}
