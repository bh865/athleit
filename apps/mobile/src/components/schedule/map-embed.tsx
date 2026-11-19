import { componentTokens, radius } from '@athleit/tokens';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

import { useTheme } from '@/components/ui';

/**
 * A map with a pin. Google's embed only works inside an iframe, so the WebView loads a tiny page that
 * holds the iframe (loading the embed URL directly shows "must be used in an iframe").
 */
export function MapEmbed({
  src,
  label,
  height,
  rounded = radius.lg,
  testID,
}: {
  src: string;
  label: string;
  height: number;
  rounded?: number;
  testID?: string;
}) {
  const { theme } = useTheme();
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:transparent}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="${src.replace(/"/g, '&quot;')}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></body></html>`;
  return (
    <View
      testID={testID}
      accessibilityLabel={label}
      style={{
        height,
        overflow: 'hidden',
        borderRadius: rounded,
        borderWidth: componentTokens.card.border,
        borderColor: theme.color.line,
      }}
    >
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://maps.google.com' }}
        scrollEnabled={false}
      />
    </View>
  );
}
