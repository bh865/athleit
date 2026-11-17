import type { Appearance } from '@stripe/stripe-js';

/**
 * Stripe's Appearance API driven by the semantic tokens (read from the live CSS variables so light/dark and any
 * re-theme flow through). Nothing here is a hard-coded colour: values are looked up, with Stripe's defaults only if a
 * variable is missing.
 */
export function stripeAppearance(): Appearance {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim() || undefined;
  const dark = document.documentElement.dataset.theme === 'dark';
  const vars: NonNullable<Appearance['variables']> = {
    fontFamily: v('--font-sans') ?? 'system-ui, sans-serif',
    ...(v('--size-input-radius') ? { borderRadius: v('--size-input-radius') as string } : {}),
  };
  const set = (k: keyof NonNullable<Appearance['variables']>, token: string) => {
    const val = v(token);
    if (val) (vars as Record<string, string>)[k as string] = val;
  };
  set('colorPrimary', '--color-ink');
  set('colorBackground', '--color-surface');
  set('colorText', '--color-ink');
  set('colorTextSecondary', '--color-muted');
  set('colorDanger', '--color-bad');
  return { theme: dark ? 'night' : 'stripe', variables: vars };
}
