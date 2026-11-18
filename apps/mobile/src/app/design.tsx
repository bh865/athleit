import { glassLevels, space, themeDefinitions, type TextVariant } from '@athleit/tokens';
import { iconNames } from '@athleit/ui-core';
import { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HomeGallery } from '@/components/home/gallery-parts';

import {
  Avatar,
  Backdrop,
  Badge,
  Button,
  CalendarSheetBody,
  Card,
  Chip,
  DatePicker,
  EmptyState,
  ErrorState,
  Glass,
  Icon,
  IconButton,
  IconCircle,
  Label,
  ListGroup,
  ListRow,
  LoadingSkeleton,
  Logo,
  SegmentedControl,
  StatusDot,
  TabBar,
  Text,
  TextField,
  ThemeScope,
  TimePicker,
  useTheme,
  useToast,
} from '@/components/ui';

/** Dev-only design gallery (mirrors System.dc.html). Shows every theme one after another. */
const TYPES: [TextVariant, string][] = [
  ['display', 'Display 44/800'],
  ['title', 'Title 32/800'],
  ['heading', 'Heading 20/700'],
  ['body', 'Body 16/500'],
  ['caption', 'Caption 13/600'],
  ['label', 'Label 12/700'],
  ['monoLg', 'Mono 28/500'],
  ['monoXl', 'Mono 56/500'],
];

const noop = () => undefined;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space[4] }}>
      <Label>{title}</Label>
      {children}
    </View>
  );
}

function Panel({ name }: { name: string }) {
  const [chip, setChip] = useState(true);
  const [seg, setSeg] = useState('a');
  const [tab, setTab] = useState('home');
  const toast = useToast();
  return (
    <ThemeScope name={name}>
      <Backdrop>
        <View testID={`gallery-${name}`} style={{ padding: space[4], gap: space[8] }}>
          <Logo variant="lockup" size={space[8]} />
          <Section title="Logo">
            <View style={{ flexDirection: 'row', gap: space[4], alignItems: 'center' }}>
              <Logo variant="mark" size={space[8]} />
              <Logo variant="app-icon" size={space[8]} />
            </View>
          </Section>
          <Section title="Type">
            {TYPES.map(([v, l]) => (
              <Text key={v} variant={v}>
                {l}
              </Text>
            ))}
          </Section>
          <Section title="Liquid glass · 3 levels">
            {glassLevels.map((l) => (
              <Glass key={l} level={l} style={{ padding: space[6] }}>
                <Text variant="heading">{l}</Text>
              </Glass>
            ))}
          </Section>
          <Section title="Buttons">
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: space[3],
                alignItems: 'center',
              }}
            >
              <Button title="Primary" />
              <Button title="Secondary" variant="secondary" />
              <Button title="Ghost" variant="ghost" />
              <Button title="Disabled" disabled />
              <IconButton
                icon="bell"
                label="Notifications"
                onPress={() => toast('Reminder sent')}
              />
            </View>
          </Section>
          <Section title="Inputs">
            <TextField label="Name" placeholder="Sample name" />
            <TextField label="Amount" mono defaultValue="$ 45.00" />
            <TextField
              label="Email"
              defaultValue="not-an-email"
              error="Enter a valid email address"
            />
          </Section>
          <Section title="Pickers">
            <DatePicker label="Date of birth" value="" onChange={noop} />
            <DatePicker label="Starts on" value="2026-11-30" onChange={noop} />
            <DatePicker
              label="Due date"
              value=""
              onChange={noop}
              error="Choose a due date."
              required
            />
            <DatePicker label="Locked" value="2026-11-30" onChange={noop} disabled />
            <TimePicker label="Start time" value="15:05" onChange={noop} />
            <Glass level="modal" style={{ padding: space[4] }}>
              <CalendarSheetBody
                value="2026-11-30"
                limits={{ min: '2026-11-05', max: '2027-02-20', disabledDates: ['2026-11-18'] }}
                weekStart={0}
                yearSpan={{ before: 1, after: 2 }}
                onPick={noop}
                onCancel={noop}
              />
            </Glass>
          </Section>
          <Section title="Chips, badges, status">
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: space[2],
                alignItems: 'center',
              }}
            >
              <Chip label="Selected" selected={chip} onPress={() => setChip(!chip)} />
              <Chip label="Sample team U12" />
              <Badge tone="count">3</Badge>
              <Badge tone="success">Paid</Badge>
              <Badge tone="warning">Pending</Badge>
              <Badge tone="danger">Overdue</Badge>
              <StatusDot tone="success" />
            </View>
            <SegmentedControl
              label="Sample"
              value={seg}
              onChange={setSeg}
              options={[
                { value: 'a', label: 'One' },
                { value: 'b', label: 'Two' },
              ]}
            />
          </Section>
          <Section title="Avatars">
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <Avatar name="Alex Sample" size="lg" />
              <Avatar name="Jordan Test" />
              <Avatar name="Sam Example" size="sm" />
            </View>
          </Section>
          <Section title="Icons · regular / fill active">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
              {iconNames.map((n, i) => (
                <Icon key={n} name={n} size="lg" weight={i % 5 === 0 ? 'fill' : 'regular'} />
              ))}
            </View>
          </Section>
          <Section title="List rows and card">
            <ListGroup>
              <ListRow
                leading={
                  <IconCircle>
                    <Icon name="credit-card" />
                  </IconCircle>
                }
                title="Sample fee"
                subtitle="Alex · due soon"
                trailing={<Text variant="mono">$45.00</Text>}
              />
              <ListRow
                leading={<Avatar name="Jordan Test" />}
                title="Jordan Test"
                subtitle="Midfield"
                trailing={<Badge tone="success">Active</Badge>}
                onPress={() => undefined}
                last
              />
            </ListGroup>
            <Card>
              <Label>Next up</Label>
              <Text variant="title">Sample event</Text>
            </Card>
          </Section>
          <Section title="States">
            <Card>
              <EmptyState
                title="All caught up"
                body="Empty state: icon, one line, at most one action."
              />
            </Card>
            <Card>
              <ErrorState
                message="Can’t load this right now. Check your connection."
                onRetry={() => undefined}
              />
            </Card>
            <Card>
              <LoadingSkeleton />
            </Card>
          </Section>
          <Section title="Home · attention and tiles">
            <HomeGallery />
          </Section>
          <Section title="Tab bar">
            <View style={{ height: space[12] * 2 }}>
              <TabBar
                items={[
                  { key: 'home', label: 'Home', icon: 'house' },
                  { key: 'family', label: 'Family', icon: 'house-line' },
                  { key: 'more', label: 'More', icon: 'dots-three-circle' },
                ]}
                active={tab}
                onSelect={setTab}
              />
            </View>
          </Section>
        </View>
      </Backdrop>
    </ThemeScope>
  );
}

export default function DesignScreen() {
  const { reduceTransparencyOverride, setReduceTransparencyOverride } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}
        >
          <Switch
            value={reduceTransparencyOverride}
            onValueChange={setReduceTransparencyOverride}
          />
          <Text variant="caption">Reduce transparency (solid fallback)</Text>
        </View>
        {Object.keys(themeDefinitions).map((n) => (
          <Panel key={n} name={n} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
