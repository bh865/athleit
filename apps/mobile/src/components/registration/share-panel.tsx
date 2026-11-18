import { componentTokens, radius, space } from '@athleit/tokens';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button, Text, useTheme } from '@/components/ui';
import { WEB_ORIGIN } from '@/lib/registration';

/** Share link, copy and QR for a published registration. The QR is dark on white in both themes so it scans. */
export function SharePanel({ slug, title }: { slug: string; title: string }) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  if (!WEB_ORIGIN) return <Text muted>Set the web address for this build to share links.</Text>;
  const url = `${WEB_ORIGIN}/r/${slug}`;
  return (
    <View style={{ gap: space[3] }}>
      <Text variant="mono" selectable>
        {url}
      </Text>
      <View
        style={{
          alignSelf: 'flex-start',
          padding: space[2],
          borderRadius: radius.md,
          backgroundColor: theme.color.qrSurface,
        }}
        accessibilityLabel={`QR code for ${title}`}
      >
        <QRCode
          value={url}
          size={componentTokens.qr.size}
          color={theme.color.qrInk}
          backgroundColor={theme.color.qrSurface}
        />
      </View>
      <Button title="Share…" onPress={() => void Share.share({ message: url })} />
      <Button
        title={copied ? 'Copied' : 'Copy link'}
        variant="secondary"
        onPress={() => void Clipboard.setStringAsync(url).then(() => setCopied(true))}
      />
    </View>
  );
}
