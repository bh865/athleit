import { radii, spacing } from '@athleit/tokens';
import { ArrowRight, Bell, CheckCircle, Warning, WarningOctagon } from 'phosphor-react-native';
import { StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';

import {
  Button,
  Card,
  GlassBackdrop,
  GlassBar,
  Text,
  TextField,
  ThemeToggle,
  useTheme,
} from '@/components/ui';

/**
 * Smoke-test screen: renders every primitive over a vivid backdrop so the glass blur, tint and
 * fallback are easy to eyeball in light and dark. Reachable without signing in (dev tool).
 */
export default function SmokeScreen() {
  const { theme, reduceTransparency, reduceTransparencyOverride, setReduceTransparencyOverride } =
    useTheme();
  const c = theme.color;

  const chip = (bg: string, fg: string, label: string, icon: React.ReactNode) => (
    <View
      key={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[1],
        paddingHorizontal: spacing[3],
        paddingVertical: spacing[1],
        borderRadius: radii.full,
        backgroundColor: bg,
      }}
    >
      {icon}
      <Text size="sm" weight="semibold" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );

  const heading = (title: string) => (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: spacing[3],
        paddingVertical: spacing[1],
        borderRadius: radii.full,
        backgroundColor: c.surface,
      }}
    >
      <Text size="xl" weight="bold">
        {title}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Everything inside GlassBackdrop is what the glass blurs. */}
      <GlassBackdrop style={StyleSheet.absoluteFill}>
        <View
          style={[
            styles.blob,
            { top: '6%', left: '-20%', width: 320, height: 320, backgroundColor: '#CCFF33' },
          ]}
        />
        <View
          style={[
            styles.blob,
            { top: '40%', right: '-25%', width: 300, height: 300, backgroundColor: '#E1EFF6' },
          ]}
        />
        <View
          style={[
            styles.blob,
            { bottom: '-8%', left: '10%', width: 280, height: 280, backgroundColor: '#272A2B' },
          ]}
        />
        <Text size="4xl" weight="bold" style={{ opacity: 0.5, padding: spacing[4] }}>
          BACKDROP BACKDROP BACKDROP BACKDROP BACKDROP BACKDROP BACKDROP BACKDROP BACKDROP
        </Text>
      </GlassBackdrop>

      <SafeAreaView style={{ flex: 1 }}>
        <GlassBar level="bar" style={styles.topBar}>
          <View style={styles.topBarInner}>
            <Text weight="bold">Athleit · smoke</Text>
            <ThemeToggle />
          </View>
        </GlassBar>

        <ScrollView
          contentContainerStyle={{
            padding: spacing[4],
            gap: spacing[8],
            paddingBottom: spacing[16],
          }}
        >
          <View style={{ gap: spacing[4] }}>
            {heading('Glass')}
            <View
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[2],
                paddingLeft: spacing[3],
                borderRadius: radii.full,
                backgroundColor: c.surface,
              }}
            >
              <Text size="sm">
                Reduce transparency
                {reduceTransparency && !reduceTransparencyOverride ? ' (OS)' : ''}
              </Text>
              <Switch
                value={reduceTransparency}
                disabled={reduceTransparency && !reduceTransparencyOverride}
                onValueChange={setReduceTransparencyOverride}
                trackColor={{ true: c.accent }}
              />
            </View>
            {(['bar', 'sheet', 'modal'] as const).map((level) => (
              <GlassBar key={level} level={level} style={styles.glassSample}>
                <View style={styles.glassRow}>
                  <Bell size={22} color={c.text} />
                  <Text>
                    <Text weight="bold">{level}</Text> glass: blur, tint, edge highlight
                  </Text>
                </View>
              </GlassBar>
            ))}
          </View>

          <View style={{ gap: spacing[4] }}>
            {heading('Buttons')}
            <View style={{ gap: spacing[3] }}>
              <Button
                title="Primary"
                icon={<ArrowRight size={18} weight="bold" color={c.onAccent} />}
              />
              <Button title="Secondary" variant="secondary" />
              <Button title="Ghost" variant="ghost" />
              <Button title="Disabled" disabled />
              <Button title="Loading" loading />
            </View>
          </View>

          <View style={{ gap: spacing[4] }}>
            {heading('Text fields')}
            <Card style={{ gap: spacing[4] }}>
              <TextField label="Name" placeholder="Casey Coach" />
              <TextField
                label="Invite code"
                mono
                defaultValue="ATH-4K29-QX"
                hint="Monospace for codes and IDs"
              />
              <TextField
                label="Email"
                defaultValue="not-an-email"
                error="Enter a valid email address"
              />
            </Card>
          </View>

          <View style={{ gap: spacing[4] }}>
            {heading('Cards, type and status')}
            <Card style={{ gap: spacing[3] }}>
              <Text size="xl" weight="semibold">
                Manrope for UI
              </Text>
              <Text>The quick brown fox jumps over the lazy dog. 0123456789</Text>
              <Text mono>$1,250.00 · INV-2026-0042 · 7c9e6679-7425</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
                {chip(
                  c.success.bg,
                  c.success.text,
                  'Paid',
                  <CheckCircle size={16} weight="fill" color={c.success.text} />,
                )}
                {chip(
                  c.warning.bg,
                  c.warning.text,
                  'Due soon',
                  <Warning size={16} weight="fill" color={c.warning.text} />,
                )}
                {chip(
                  c.danger.bg,
                  c.danger.text,
                  'Overdue',
                  <WarningOctagon size={16} weight="fill" color={c.danger.text} />,
                )}
              </View>
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', borderRadius: radii.full },
  topBar: { marginHorizontal: spacing[4], marginTop: spacing[2] },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  glassSample: { minHeight: 72, justifyContent: 'center' },
  glassRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4] },
});
