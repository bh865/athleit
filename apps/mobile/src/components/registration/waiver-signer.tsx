import { friendlyError, registrationErrorMessage } from '@athleit/core';
import { callRegistrationFn } from '@athleit/db/registration';
import { radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { ScrollView, View } from 'react-native';

import { Choice, FormMessage } from '@/components/app/kit';
import { Button, Chip, Icon, IconCircle, Text, TextField, useTheme } from '@/components/ui';
import { accessToken, edgeConfig, RELATIONSHIPS } from '@/lib/registration';

export interface WaiverToSign {
  versionId: string;
  title: string;
  body: string;
  signed: boolean;
}

/**
 * Typed-signature flow, one waiver at a time: read to the end, then sign, then a confirmation. Signing goes through
 * the sign-waiver Edge Function with the same payload as before; only the screens around it changed.
 */
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
  const router = useRouter();
  const open = waivers.filter((w) => !w.signed);
  const [phase, setPhase] = useState<'read' | 'sign' | 'done'>('read');
  const [readToEnd, setReadToEnd] = useState(false);
  const [name, setName] = useState(defaults?.name ?? '');
  const [email, setEmail] = useState(defaults?.email ?? '');
  const [rel, setRel] = useState<'parent' | 'legal_guardian'>(
    defaults?.relationship === 'legal_guardian' ? 'legal_guardian' : 'parent',
  );
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEmail, setLastEmail] = useState('');
  const current = open[0];
  const total = waivers.length;
  const position = Math.min(total, waivers.length - open.length + (phase === 'done' ? 0 : 1));
  const already = waivers.filter((w) => w.signed);

  if (!current && phase !== 'done') {
    return (
      <View style={{ alignItems: 'center', gap: space[3] }} accessibilityRole="summary">
        <IconCircle>
          <Icon name="confetti" />
        </IconCircle>
        <Text variant="heading">{total > 0 ? 'All done' : 'Nothing to sign'}</Text>
        {total > 0 ? (
          <Text muted style={{ textAlign: 'center' }}>
            {total === 1 ? 'The waiver is signed.' : `All ${total} waivers are signed.`} Signed
            copies are in your email.
          </Text>
        ) : null}
        <Button title="Back to Home" variant="secondary" onPress={() => router.replace('/')} />
      </View>
    );
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement: l, contentOffset: o, contentSize: c } = e.nativeEvent;
    if (l.height + o.y >= c.height - 24) setReadToEnd(true);
  }

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
    setLastEmail(email);
    setPhase('done');
    onChanged();
  }

  const progress = (
    <View style={{ gap: space[1] }}>
      <Text variant="label" muted>
        Waiver {position} of {total}
      </Text>
      {already.length > 0 && phase !== 'done' ? (
        <Text variant="caption" muted>
          Already signed: {already.map((w) => w.title).join(', ')}
        </Text>
      ) : null}
    </View>
  );

  if (phase === 'done')
    return (
      <View style={{ gap: space[4], alignItems: 'center' }}>
        <IconCircle>
          <Icon name="check" />
        </IconCircle>
        <Text variant="heading">Signed</Text>
        <Text muted style={{ textAlign: 'center' }}>
          A signed copy was emailed to {lastEmail || 'you'}.
        </Text>
        {current ? (
          <Button
            title="Next waiver"
            icon="arrow-right"
            onPress={() => {
              setPhase('read');
              setReadToEnd(false);
            }}
          />
        ) : (
          <Button title="Back to Home" onPress={() => router.replace('/')} />
        )}
      </View>
    );

  if (phase === 'read' && current)
    return (
      <View style={{ gap: space[3] }}>
        {progress}
        <Text variant="heading">{current.title}</Text>
        <ScrollView
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          onScroll={onScroll}
          scrollEventThrottle={64}
          onContentSizeChange={(_, h) => {
            if (h <= 280) setReadToEnd(true);
          }}
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
        {!readToEnd ? (
          <Text variant="caption" muted>
            Scroll to the end to continue
          </Text>
        ) : null}
        <Button title="I’ve read this" disabled={!readToEnd} onPress={() => setPhase('sign')} />
      </View>
    );

  return (
    <View style={{ gap: space[4] }}>
      {progress}
      <Text variant="heading">Sign {current?.title}</Text>
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
        title={busy ? 'Signing…' : 'Sign'}
        icon="signature"
        loading={busy}
        disabled={busy || !name.trim() || !email.trim() || !consent}
        onPress={() => void sign()}
      />
      <Button title="Back to reading" variant="ghost" onPress={() => setPhase('read')} />
    </View>
  );
}
