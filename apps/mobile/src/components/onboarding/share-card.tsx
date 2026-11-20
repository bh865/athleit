import { componentTokens, space } from '@athleit/tokens';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button, Text, useTheme } from '@/components/ui';

/** A value to hand to someone else: shown in mono, with copy, the share sheet and an optional QR code. */
export function ShareCard({
  label,
  value,
  shareMessage,
  qr,
}: {
  label: string;
  value: string;
  shareMessage: string;
  qr?: boolean;
}) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ gap: space[3] }}>
      <Text variant="label" muted>
        {label}
      </Text>
      <Text
        variant="monoLg"
        selectable
        accessibilityLabel={`${label}: ${value.split('').join(' ')}`}
      >
        {value}
      </Text>
      {qr ? (
        <View
          style={{
            alignSelf: 'flex-start',
            padding: space[2],
            backgroundColor: theme.color.qrSurface,
          }}
        >
          <QRCode
            value={value}
            size={componentTokens.qr.size}
            color={theme.color.qrInk}
            backgroundColor={theme.color.qrSurface}
          />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <Button
          title={copied ? 'Copied' : 'Copy'}
          variant="secondary"
          onPress={() => void Clipboard.setStringAsync(value).then(() => setCopied(true))}
        />
        <Button
          title="Share"
          variant="secondary"
          onPress={() => void Share.share({ message: shareMessage })}
        />
      </View>
    </View>
  );
}
