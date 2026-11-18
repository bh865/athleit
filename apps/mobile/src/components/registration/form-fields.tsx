import { visibleFields, type FormField, type FormSchema } from '@athleit/core';
import { space } from '@athleit/tokens';
import { View } from 'react-native';

import { Choice } from '@/components/app/kit';
import { Chip, DatePicker, Text, TextField } from '@/components/ui';

export type Answers = Record<string, unknown>;
const ADDRESS_PARTS = [
  ['line1', 'Street address'],
  ['city', 'City'],
  ['region', 'State or region'],
  ['postal', 'Postal code'],
] as const;

/** Native renderer for a published form. Mirrors the web FormRenderer: hidden fields are not shown or submitted. */
export function FormFields({
  schema,
  answers,
  errors,
  onChange,
}: {
  schema: FormSchema;
  answers: Answers;
  errors: Record<string, string>;
  onChange: (a: Answers) => void;
}) {
  const set = (id: string, v: unknown) => {
    const next = { ...answers, [id]: v };
    const shown = new Set(visibleFields(schema, next).map((f) => f.id));
    for (const k of Object.keys(next)) if (!shown.has(k)) delete next[k];
    onChange(next);
  };
  return (
    <View style={{ gap: space[4] }}>
      {visibleFields(schema, answers).map((f) => (
        <One
          key={f.id}
          f={f}
          value={answers[f.id]}
          error={errors[f.id]}
          set={(v) => set(f.id, v)}
        />
      ))}
    </View>
  );
}

function One({
  f,
  value,
  error,
  set,
}: {
  f: FormField;
  value: unknown;
  error: string | undefined;
  set: (v: unknown) => void;
}) {
  const label = `${f.label}${f.required ? '' : ' (optional)'}`;
  const common = { label, error, ...(f.help ? { hint: f.help } : {}) };
  switch (f.type) {
    case 'dropdown':
    case 'single_choice':
      return (
        <View style={{ gap: space[2] }}>
          <Choice
            label={label}
            value={String(value ?? '')}
            options={(f.options ?? []) as { value: string; label: string }[]}
            onChange={set}
          />
          {error ? (
            <Text variant="caption" style={{ color: undefined }} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
      );
    case 'multiple_choice': {
      const sel = Array.isArray(value) ? (value as string[]) : [];
      return (
        <View style={{ gap: space[2] }} accessibilityLabel={label}>
          <Text variant="caption">{label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {(f.options ?? []).map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={sel.includes(o.value)}
                onPress={() =>
                  set(sel.includes(o.value) ? sel.filter((x) => x !== o.value) : [...sel, o.value])
                }
              />
            ))}
          </View>
          {error ? (
            <Text variant="caption" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
      );
    }
    case 'checkbox':
    case 'consent_checkbox':
      return (
        <View style={{ gap: space[2] }}>
          <Chip
            label={`${value === true ? 'Yes' : 'No'}: ${f.label}`}
            selected={value === true}
            onPress={() => set(value !== true)}
          />
          {f.help ? (
            <Text variant="caption" muted>
              {f.help}
            </Text>
          ) : null}
          {error ? (
            <Text variant="caption" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
      );
    case 'address': {
      const v = (value && typeof value === 'object' ? value : {}) as Record<string, string>;
      return (
        <View style={{ gap: space[3] }}>
          <Text variant="caption">{label}</Text>
          {ADDRESS_PARTS.map(([k, l]) => (
            <TextField
              key={k}
              label={l}
              value={v[k] ?? ''}
              onChangeText={(t) => set({ ...v, [k]: t })}
            />
          ))}
          {error ? (
            <Text variant="caption" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
      );
    }
    case 'number':
      return (
        <TextField
          {...common}
          keyboardType="decimal-pad"
          value={value === undefined || value === null ? '' : String(value)}
          onChangeText={(t) => set(t === '' ? undefined : Number(t))}
        />
      );
    case 'date':
      return <DatePicker {...common} value={String(value ?? '')} onChange={set} />;
    case 'email':
      return (
        <TextField
          {...common}
          keyboardType="email-address"
          autoCapitalize="none"
          value={String(value ?? '')}
          onChangeText={set}
        />
      );
    case 'phone':
      return (
        <TextField
          {...common}
          keyboardType="phone-pad"
          value={String(value ?? '')}
          onChangeText={set}
        />
      );
    case 'long_text':
      return (
        <TextField
          {...common}
          multiline
          numberOfLines={4}
          value={String(value ?? '')}
          onChangeText={set}
        />
      );
    default:
      return <TextField {...common} value={String(value ?? '')} onChangeText={set} />;
  }
}
