import { fontWeight, type FontWeightName } from './primitives';

export type TextVariant =
  'display' | 'title' | 'heading' | 'body' | 'bodyBold' | 'caption' | 'label' | 'mono' | 'monoLg';

export interface TextStyleToken {
  family: 'sans' | 'mono';
  /** px */
  size: number;
  /** px */
  lineHeight: number;
  weight: FontWeightName;
  /** em */
  letterSpacing: number;
  uppercase: boolean;
}

const t = (
  family: 'sans' | 'mono',
  size: number,
  lineHeight: number,
  weight: FontWeightName,
  letterSpacing = 0,
  uppercase = false,
): TextStyleToken => ({ family, size, lineHeight, weight, letterSpacing, uppercase });

/** Type scale from the design system: Display 44/800, Title 32/800, Heading 20/700, Body 16/500, Caption 13/600, Label 12/700, Mono. */
export const textStyles: Record<TextVariant, TextStyleToken> = {
  display: t('sans', 44, 48, 'extrabold', -0.03),
  title: t('sans', 32, 36, 'extrabold', -0.02),
  heading: t('sans', 20, 28, 'bold'),
  body: t('sans', 16, 24, 'medium'),
  bodyBold: t('sans', 16, 24, 'bold'),
  caption: t('sans', 13, 18, 'semibold'),
  label: t('sans', 12, 16, 'bold', 0.08, true),
  mono: t('mono', 16, 24, 'medium'),
  monoLg: t('mono', 28, 34, 'medium'),
};

export const fontWeightValue = (w: FontWeightName) => fontWeight[w];
