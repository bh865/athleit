import { friendlyError, registrationErrorMessage } from '@athleit/core';
import { callRegistrationFn } from '@athleit/db/registration';
import { radius, space } from '@athleit/tokens';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Choice, FormMessage } from '@/components/app/kit';
import { Button, Chip, Text, TextField, useTheme } from '@/components/ui';
import { accessToken, edgeConfig, RELATIONSHIPS } from '@/lib/registration';

export interface WaiverToSign {
  versionId: string;
  title: string;
  body: string;
  signed: boolean;
}

/** Typed-signature flow, one waiver at a time. Signing goes through the sign-waiver Edge Function. */
export function WaiverSigner({
  waivers,
  registrationId,
  defaults,
  onChanged,
}: {
  waivers: WaiverToSign[];
  registrationId: string;
  defaults?: { name?: string; email?: string; relationship?: string };
  onChanged: () => void;
}) {
  const { theme } = useTheme();
  const open = waivers.filter((w) => !w.signed);
  const [name, setName] = useState(defaults?.name ?? '');
  const [email, setEmail] = useState(defaults?.email ?? '');
  const [rel, setRel] = useState<'parent' | 'legal_guardian'>(
    defaults?.relationship === 'legal_guardian' ? 'legal_guardian' : 'parent',
  );
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = open[0];
  if (!current) return <Text accessibilityRole="summary">All waivers are signed. Thank you.</Text>;

  async function sign() {
    if (!current) return;
    setBusy(true);
    setError(null);
    const r = await callRegistrationFn<{ error?: string }>(
      edgeConfig,
      'sign-waiver',
      {
        waiverVersionId: current.versionId,
        registrationId,
        signerName: name,
        signerEmail: email,
        signerRelationship: rel,
        electronicConsent: consent,
      },
      await accessToken(),
    );
    setBusy(false);
    if (!r.ok && r.body.error !== 'already_signed')
      return setError(r.body.error ? registrationErrorMessage(r.body.error) : friendlyError(null));
    setConsent(false);
    onChanged();
  }
  return (
    <View style={{ gap: space[4] }}>
      <Text variant="label">
        Waiver {waivers.length - open.length + 1} of {waivers.length}: {current.title}
      </Text>
      <ScrollView
        nestedScrollEnabled
        style={{
          maxHeight: 280,
          padding: space[3],
          borderRadius: radius.md,
          backgroundColor: theme.color.surfaceAlt,
        }}
        accessibilityLabel={`${current.title} text`}
      >
        <Text variant="caption">{current.body}</Text>
      </ScrollView>
      <TextField
        label="Type your full legal name"
        value={name}
        onChangeText={setName}
        autoComplete="name"
      />
      <TextField
        label="Email for your signed copy"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Choice label="You are the child’s" value={rel} options={RELATIONSHIPS} onChange={setRel} />
      <Chip
        label="I agree to sign electronically; my typed name is my signature"
        selected={consent}
        onPress={() => setConsent(!consent)}
      />
      <FormMessage error={error} />
      <Button
        title={busy ? 'Signing…' : 'Sign waiver'}
        loading={busy}
        disabled={busy || !name.trim() || !email.trim() || !consent}
        onPress={() => void sign()}
      />
    </View>
  );
}
