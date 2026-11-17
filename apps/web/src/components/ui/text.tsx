import type { TextVariant } from '@athleit/tokens';
import type { ComponentProps, ElementType } from 'react';

const kebab = (s: string) => s.replace(/([A-Z])/g, '-$1').toLowerCase();

export interface TextProps extends ComponentProps<'span'> {
  variant?: TextVariant;
  /** Element to render; defaults to span. Use h1/h2/p etc. for semantics. */
  as?: ElementType;
  muted?: boolean;
}

/** Typography from the type-scale tokens. Fonts are loaded once in app/layout.tsx. */
export function Text({ variant = 'body', as: Tag = 'span', muted, className, ...rest }: TextProps) {
  const cls = [`t-${kebab(variant)}`, muted ? 't-muted' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return <Tag {...rest} className={cls} />;
}

export const Heading = (p: Omit<TextProps, 'variant'> & { level?: 'title' | 'heading' }) => {
  const { level = 'heading', as, ...rest } = p;
  return <Text variant={level} as={as ?? (level === 'title' ? 'h1' : 'h2')} {...rest} />;
};
export const Label = (p: Omit<TextProps, 'variant'>) => <Text variant="label" {...p} />;
export const Mono = (p: Omit<TextProps, 'variant'>) => <Text variant="mono" {...p} />;
