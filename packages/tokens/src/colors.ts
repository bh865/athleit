/** Brand palette. These three are fixed; everything else is derived from them. */
export const brand = {
  charcoal: '#272A2B',
  lime: '#CCFF33',
  ice: '#E1EFF6',
} as const;

export interface StatusColor {
  /** Text/icon colour on `bg` and on the page surfaces. */
  text: string;
  /** Soft tinted background for banners and badges. */
  bg: string;
  /** Saturated fill for solid status chips and buttons. */
  solid: string;
  /** Text/icon colour on `solid`. */
  onSolid: string;
}

export interface ThemeColors {
  /** Page background. */
  bg: string;
  /** Cards, inputs, sheets. */
  surface: string;
  /** Subtle fills, hover states, secondary buttons. */
  surfaceMuted: string;
  /** Decorative dividers (not required to meet 3:1). */
  border: string;
  /** Component boundaries that identify a control, e.g. text fields (>= 3:1). */
  borderStrong: string;
  text: string;
  textMuted: string;
  /** Electric lime fill: primary actions and active states only. Use sparingly. */
  accent: string;
  accentPressed: string;
  /** Text/icons on `accent`. */
  onAccent: string;
  /**
   * Accent-coloured text, icons and indicators on page surfaces. Lime itself fails
   * contrast on light surfaces, so light mode uses a dark olive; dark mode uses lime.
   */
  accentInk: string;
  focusRing: string;
  /** Scrim behind modals. */
  scrim: string;
  success: StatusColor;
  warning: StatusColor;
  danger: StatusColor;
}

export const lightColors: ThemeColors = {
  bg: '#F3F8FB',
  surface: '#FFFFFF',
  surfaceMuted: brand.ice,
  border: '#CBDAE2',
  borderStrong: '#6F8792',
  text: brand.charcoal,
  textMuted: '#4A5558',
  accent: brand.lime,
  accentPressed: '#B7E62E',
  onAccent: brand.charcoal,
  accentInk: '#445F00',
  focusRing: brand.charcoal,
  scrim: 'rgba(39, 42, 43, 0.48)',
  success: { text: '#17653A', bg: '#E2F5E9', solid: '#1F7A45', onSolid: '#FFFFFF' },
  warning: { text: '#7A4800', bg: '#FFF0D2', solid: '#F2A81D', onSolid: brand.charcoal },
  danger: { text: '#B3261E', bg: '#FDE8E6', solid: '#C62828', onSolid: '#FFFFFF' },
};

export const darkColors: ThemeColors = {
  bg: '#1B1E1F',
  surface: brand.charcoal,
  surfaceMuted: '#333738',
  border: '#3F4446',
  borderStrong: '#869398',
  text: '#F3F7F9',
  textMuted: '#A9B6BB',
  accent: brand.lime,
  accentPressed: '#B7E62E',
  onAccent: brand.charcoal,
  accentInk: brand.lime,
  focusRing: brand.lime,
  scrim: 'rgba(0, 0, 0, 0.64)',
  success: { text: '#6FD392', bg: '#1C3526', solid: '#3DBB6E', onSolid: '#1B1E1F' },
  warning: { text: '#F4B84A', bg: '#3A2D12', solid: '#F2A81D', onSolid: '#1B1E1F' },
  danger: { text: '#FF8F86', bg: '#4A2321', solid: '#FF6B60', onSolid: '#1B1E1F' },
};
