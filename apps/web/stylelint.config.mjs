/**
 * Design guardrails for CSS: values come from generated token variables only.
 * Allowed exception: `/* stylelint-disable-next-line <rule> -- design-exception: <reason> *\/`.
 */
const layoutProps =
  '/^(padding|margin|gap|row-gap|column-gap|border-radius|font-size|line-height|top|left|right|bottom|inset|width|height|min-width|min-height|max-width|max-height)(-.*)?$/';

const config = {
  rules: {
    'color-no-hex': true,
    'function-disallowed-list': [
      'rgb',
      'rgba',
      'hsl',
      'hsla',
      'hwb',
      'lab',
      'lch',
      'oklab',
      'oklch',
    ],
    'declaration-property-unit-disallowed-list': {
      [layoutProps]: ['px', 'rem'],
      '/^(letter-spacing|border-radius)$/': ['px', 'rem'],
    },
    'declaration-property-value-disallowed-list': {
      'font-family': ['/^(?!var\\()/'],
      '/^(-webkit-)?backdrop-filter$/': ['/^(?!var\\()/'],
      'box-shadow': ['/(rgb|#)/'],
    },
    'property-disallowed-list': ['filter'],
  },
  overrides: [
    {
      // The Glass component is the only place that applies backdrop-filter.
      files: ['src/components/ui/glass.module.css'],
      rules: { 'declaration-property-value-disallowed-list': null },
    },
  ],
};

export default config;
