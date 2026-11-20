import {
  consentLine,
  passwordStrengthLabel,
  resendLabel,
  resendRemaining,
  type OAuthProvider,
} from '@athleit/core';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useState, type Ref } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Button, Icon, Text, TextField, useTheme, type TextFieldInput } from '@/components/ui';
import { legalUrls, providerOrder } from '@/lib/auth-config';
import { fontFace } from '@/lib/fonts';
import { useNow } from '@/lib/use-now';

/** Password field: labelled show/hide toggle and, for new passwords, a strength meter in words. */
export function PasswordField({
  label = 'Password',
  value,
  onChangeText,
  isNew,
  error,
  inputRef,
  onSubmitEditing,
  returnKeyType,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  /** A new password: autofill suggests one, the hint and strength meter show. */
  isNew?: boolean;
  error?: string | undefined;
  inputRef?: Ref<TextFieldInput>;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'next' | 'go';
}) {
  const [shown, setShown] = useState(false);
  const { theme } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={isNew ? 'new-password' : 'current-password'}
        textContentType={isNew ? 'newPassword' : 'password'}
        {...(isNew ? { hint: 'At least 8 characters' } : {})}
        error={error}
        inputRef={inputRef}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType ?? 'done'}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            onPress={() => setShown((s) => !s)}
            style={{
              width: componentTokens.iconButton.size,
              height: componentTokens.iconButton.size,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={shown ? 'eye-slash' : 'eye'} color={theme.color.muted} />
          </Pressable>
        }
      />
      {isNew ? <StrengthMeter value={value} /> : null}
    </View>
  );
}

/** Three segments plus the words, so strength is never colour alone. */
export function StrengthMeter({ value }: { value: string }) {
  const { theme } = useTheme();
  const c = theme.color;
  const s = passwordStrengthLabel(value);
  if (!s.level) return null;
  const color = s.level === 'weak' ? c.bad : s.level === 'fair' ? c.warn : c.ok;
  return (
    <View
      accessible
      accessibilityLabel={s.text}
      accessibilityLiveRegion="polite"
      style={{ gap: space[2] }}
    >
      <View style={{ flexDirection: 'row', gap: space[1] }}>
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={{
              flex: 1,
              height: space[1],
              borderRadius: radius.pill,
              backgroundColor: n <= s.filled ? color : c.line,
            }}
          />
        ))}
      </View>
      <Text variant="caption" style={{ color }}>
        {s.text}
      </Text>
    </View>
  );
}

/** Apple first on iPhone and Google first on Android, only the providers this build enables. */
export function SocialButtons({
  onProvider,
  disabled,
}: {
  onProvider: (p: OAuthProvider) => void;
  disabled?: boolean;
}) {
  const order = providerOrder();
  if (order.length === 0) return null;
  return (
    <View style={{ gap: space[3] }}>
      {order.map((p, i) => (
        <Button
          key={p}
          size="lg"
          title={`Continue with ${p === 'apple' ? 'Apple' : 'Google'}`}
          icon={p === 'apple' ? 'apple-logo' : 'google-logo'}
          variant={i === 0 ? 'primary' : 'secondary'}
          disabled={disabled}
          onPress={() => onProvider(p)}
        />
      ))}
    </View>
  );
}

/** The consent line; Terms and Privacy are links only when their URLs are configured. */
export function ConsentLine({ short }: { short?: boolean }) {
  const { theme } = useTheme();
  const c = theme.color;
  const segs = consentLine(legalUrls);
  // The welcome screen drops the age sentence, as drawn; every other screen shows all of it.
  const shown = short ? segs.slice(0, 4).concat({ text: '.' }) : segs;
  return (
    <Text variant="caption" muted style={{ textAlign: 'center' }}>
      {shown.map((s, i) =>
        s.href ? (
          <Text
            key={i}
            variant="caption"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(s.href as string)}
            style={{
              color: c.ink,
              fontFamily: fontFace.sans.bold,
              textDecorationLine: 'underline',
            }}
          >
            {s.text}
          </Text>
        ) : (
          s.text
        ),
      )}
    </Text>
  );
}

/** Resend with a cooldown. `sentAt` is when the last email went out (ms), or null for "ready". */
export function ResendButton({
  sentAt,
  busy,
  onResend,
  idleLabel,
}: {
  sentAt: number | null;
  busy?: boolean;
  onResend: () => void;
  /** Label when ready; defaults to "Resend email". */
  idleLabel?: string;
}) {
  const now = useNow(1000);
  const remaining = resendRemaining(sentAt, now.getTime());
  const label = remaining > 0 ? resendLabel(remaining) : (idleLabel ?? resendLabel(0));
  return (
    <Button
      title={label}
      variant="secondary"
      loading={Boolean(busy)}
      disabled={remaining > 0}
      accessibilityLabel={remaining > 0 ? `Resend available in ${remaining} seconds` : label}
      onPress={onResend}
    />
  );
}

/** Logo, title and a line of explanation: the top of every sign-in screen. */
export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string | undefined }) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text muted>{subtitle}</Text> : null}
    </View>
  );
}

/** A text-style button for secondary links ("Forgot password?", "Use a different email"). */
export function LinkButton({ title, onPress }: { title: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={{
        minHeight: componentTokens.iconButton.size,
        justifyContent: 'center',
        alignSelf: 'flex-start',
      }}
    >
      <Text variant="bodyBold" style={{ color: theme.color.ink, textDecorationLine: 'underline' }}>
        {title}
      </Text>
    </Pressable>
  );
}
