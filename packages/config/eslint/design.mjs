/**
 * Design guardrails: design values come from @athleit/tokens and the shared UI components only.
 *
 * Allowed exception (documented, searchable, requires a reason):
 *   // eslint-disable-next-line no-restricted-syntax -- design-exception: <why this literal is correct>
 */
const COLOR = '/^(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab)\\(.*)$/';
const LAYOUT_PROPS =
  '/^(borderRadius|border(Top|Bottom|Left|Right)(Left|Right)?Radius|padding.*|margin.*|gap|rowGap|columnGap|fontSize|lineHeight|letterSpacing|shadowRadius|shadowOpacity|elevation|top|left|right|bottom)$/';
const NUM = '/^-?(?!0$)[0-9.]+$/';

export const designRestrictedSyntax = [
  {
    selector: `Literal[value=${COLOR}]`,
    message:
      'No colour literals outside packages/tokens. Use a semantic colour from useTheme() / var(--color-*).',
  },
  {
    selector: `Property[key.name=${LAYOUT_PROPS}][value.type='Literal'][value.raw=${NUM}]`,
    message:
      'No raw numbers for radius, spacing, font or shadow. Use space/radius/componentTokens (@athleit/tokens) or a shared component.',
  },
  {
    selector: "Property[key.name='fontFamily'][value.type='Literal']",
    message: 'No literal font families. Use <Text> (type scale) or fontFace from lib/fonts.',
  },
  {
    selector: "Property[key.name=/^(fontSize|fontWeight|letterSpacing)$/][value.type='Literal']",
    message: 'No literal font sizes or weights. Use <Text variant="…"> from the type scale.',
  },
  {
    selector: 'Literal[value=/\\b[0-9]+(\\.[0-9]+)?(px|rem)\\b/]',
    message: 'No raw px/rem strings. Use token variables (var(--space-*), var(--radius-*)).',
  },
  {
    selector: 'Literal[value=/backdrop-?[Ff]ilter/]',
    message: 'Blur and backdrop-filter live in the Glass component only.',
  },
  {
    selector: "JSXAttribute[name.name='type'][value.value=/^(date|time|datetime-local|month|week)$/]",
    message:
      'No native date/time inputs (unstyled browser chrome). Use <DatePicker> / <TimePicker> from components/ui.',
  },
  {
    selector: 'Literal[value=/YYYY-MM-DD|HH:MM/]',
    message:
      'No typed date or time text fields. Use <DatePicker> / <TimePicker> from components/ui.',
  },
  {
    selector: "Property[key.name='backdropFilter']",
    message: 'Blur and backdrop-filter live in the Glass component only.',
  },
];

const restrictedImports = {
  patterns: [
    {
      group: ['@phosphor-icons/*', 'phosphor-react-native'],
      message:
        'Import icons through the Icon wrapper (components/ui/icon.tsx), not Phosphor directly.',
    },
    {
      group: ['expo-blur'],
      message: 'Blur lives in the Glass component only.',
    },
    {
      group: ['@athleit/tokens/primitives', '**/tokens/src/primitives'],
      message: 'Primitive tokens are for packages/tokens only. Components use semantic tokens.',
    },
  ],
};

/** Applies to application source. Spread into an app's flat config. */
export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...designRestrictedSyntax],
      'no-restricted-imports': ['error', restrictedImports],
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    // The wrapper files that are allowed to touch the underlying libraries.
    files: ['src/components/ui/icon.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/components/ui/glass.tsx'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': [
        'error',
        ...designRestrictedSyntax.filter((r) => !String(r.selector).includes('backdrop')),
      ],
    },
  },
];
