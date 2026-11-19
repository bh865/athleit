import { componentTokens, radius, space } from '@athleit/tokens';
import {
  MONTH_NAMES,
  MONTH_SHORT,
  WEEKDAY_NAMES,
  addMonths,
  clampIso,
  daysInMonth,
  formatDateFriendly,
  formatDateLong,
  formatTimeFriendly,
  isDateDisabled,
  monthGrid,
  parseIso,
  parseTime,
  toIso,
  toTime,
  todayIso,
  weekdayOrder,
  yearRange,
  type DateLimits,
} from '@athleit/ui-core';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from './button';
import { Icon } from './icon';
import { Sheet } from './sheet';
import { Text } from './text';
import { useTheme } from './theme';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CELL = componentTokens.iconButton.size; // 44pt minimum touch target

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  icon: 'calendar-blank' | 'clock';
  text: string;
  onPress: () => void;
  testID?: string;
}

/** Looks like TextField (52 high, surface-alt, focused/open = 2px "sent" border) with a leading icon. */
function PickerField({
  label,
  error,
  hint,
  required,
  disabled,
  placeholder,
  icon,
  text,
  onPress,
  testID,
}: FieldProps) {
  const { theme } = useTheme();
  const c = theme.color;
  const { height, radius: r, focusBorder } = componentTokens.input;
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="caption">
        {label}
        {required ? ' *' : ''}
      </Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${text || placeholder}`}
        accessibilityHint={error ?? hint ?? 'Opens a picker'}
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: height,
          paddingHorizontal: space[4],
          borderRadius: r,
          borderWidth: focusBorder,
          borderColor: error ? c.bad : pressed ? c.bubbleOwn : 'transparent',
          backgroundColor: c.surfaceAlt,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          opacity: disabled ? 0.5 : 1,
        })}
      >
        <Icon name={icon} size="sm" />
        <Text style={{ flex: 1, color: text ? c.ink : c.muted }}>{text || placeholder}</Text>
      </Pressable>
      {error ? (
        <Text variant="caption" accessibilityRole="alert" style={{ color: c.bad }}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: 'caret-left' | 'caret-right';
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: CELL,
        height: CELL,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.color.line : theme.color.surfaceAlt,
      })}
    >
      <Icon name={icon} />
    </Pressable>
  );
}

export interface DatePickerProps extends DateLimits {
  label: string;
  /** ISO date `YYYY-MM-DD`, or '' when empty. */
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | undefined;
  hint?: string;
  placeholder?: string;
  weekStart?: 0 | 1;
  /** Years offered when no min/max is set. Birth dates: `{ before: 100, after: 0 }`. */
  yearSpan?: { before: number; after: number };
  testID?: string;
}

type View_ = 'days' | 'months' | 'years';

/**
 * Date field that opens a glass bottom sheet with a month grid. Choosing a day commits and closes at
 * once (one tap); dismissing the sheet cancels. Same props as the web DatePicker.
 */
export function DatePicker({
  label,
  value,
  onChange,
  required,
  disabled,
  error,
  hint,
  placeholder = 'Select a date',
  min,
  max,
  disabledDates,
  weekStart = 0,
  yearSpan = { before: 100, after: 20 },
  testID,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const limits = useMemo(() => ({ min, max, disabledDates }), [min, max, disabledDates]);
  return (
    <>
      <PickerField
        label={label}
        error={error}
        hint={hint}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        icon="calendar-blank"
        text={formatDateFriendly(value)}
        onPress={() => setOpen(true)}
        testID={testID}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={`Choose ${label}`} level="modal">
        {open ? (
          <CalendarSheetBody
            value={value}
            limits={limits}
            weekStart={weekStart}
            yearSpan={yearSpan}
            onPick={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </Sheet>
    </>
  );
}

/** The calendar body (also rendered inline in the gallery to show the open state). */
export function CalendarSheetBody({
  value,
  limits,
  weekStart,
  yearSpan,
  onPick,
  onCancel,
}: {
  value: string;
  limits: DateLimits;
  weekStart: 0 | 1;
  yearSpan: { before: number; after: number };
  onPick: (iso: string) => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const today = todayIso();
  const [shown, setShown] = useState(() => (parseIso(value) ? value : clampIso(today, limits)));
  const [view, setView] = useState<View_>('days');
  const p = parseIso(shown)!;
  const years = yearRange(limits, yearSpan, new Date().getFullYear()).reverse();

  const choice = (
    key: string | number,
    text: string,
    selected: boolean,
    onPress: () => void,
    disabled = false,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: '33.33%',
        minHeight: CELL,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: selected ? c.accent : 'transparent',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        variant={selected ? 'bodyBold' : 'body'}
        style={{ color: selected ? c.accentInk : c.ink }}
      >
        {text}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <RoundButton
          icon="caret-left"
          label={view === 'days' ? 'Previous month' : 'Previous year'}
          onPress={() => setShown(addMonths(shown, view === 'days' ? -1 : -12))}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${MONTH_NAMES[p.m - 1]} ${p.y}, choose month and year`}
          onPress={() => setView(view === 'days' ? 'years' : 'days')}
          style={{
            minHeight: CELL,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[1],
            paddingHorizontal: space[3],
          }}
        >
          <Text variant="bodyBold">
            {MONTH_NAMES[p.m - 1]} {p.y}
          </Text>
          <Icon name="caret-down" size="sm" />
        </Pressable>
        <RoundButton
          icon="caret-right"
          label={view === 'days' ? 'Next month' : 'Next year'}
          onPress={() => setShown(addMonths(shown, view === 'days' ? 1 : 12))}
        />
      </View>

      {view === 'years' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: CELL * 6 }}
          contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap' }}
        >
          {years.map((y) =>
            choice(y, String(y), y === p.y, () => {
              setShown(toIso({ y, m: p.m, d: Math.min(p.d, daysInMonth(y, p.m)) }));
              setView('months');
            }),
          )}
        </ScrollView>
      ) : view === 'months' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {MONTH_SHORT.map((m, i) =>
            choice(m, m, i + 1 === p.m, () => {
              setShown(toIso({ y: p.y, m: i + 1, d: Math.min(p.d, daysInMonth(p.y, i + 1)) }));
              setView('days');
            }),
          )}
        </View>
      ) : (
        <View>
          <View style={{ flexDirection: 'row' }}>
            {weekdayOrder(weekStart).map((w) => (
              <View
                key={w}
                style={{ flex: 1, alignItems: 'center', minHeight: space[8] }}
                accessible
                accessibilityLabel={WEEKDAY_NAMES[w]!}
              >
                <Text variant="label" muted>
                  {WEEKDAY_LETTERS[w]}
                </Text>
              </View>
            ))}
          </View>
          {monthGrid(p.y, p.m, weekStart).map((week, wi) => (
            <View key={wi} style={{ flexDirection: 'row' }}>
              {week.map((d) => {
                const disabled = isDateDisabled(d.iso, limits);
                const selected = d.iso === value;
                const isToday = d.iso === today;
                return (
                  <Pressable
                    key={d.iso}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatDateLong(d.iso)}${isToday ? ', today' : ''}`}
                    accessibilityState={{ selected, disabled }}
                    disabled={disabled}
                    onPress={() => onPick(d.iso)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: CELL,
                    }}
                  >
                    <View
                      style={{
                        width: CELL - space[1],
                        height: CELL - space[1],
                        borderRadius: radius.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: componentTokens.input.focusBorder,
                        borderColor: isToday && !selected ? c.ink : 'transparent',
                        backgroundColor: selected ? c.accent : 'transparent',
                        opacity: disabled ? 0.4 : 1,
                      }}
                    >
                      <Text
                        variant={selected ? 'bodyBold' : 'body'}
                        style={{ color: selected ? c.accentInk : d.inMonth ? c.ink : c.muted }}
                      >
                        {d.day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}
      <Button variant="ghost" title="Cancel" onPress={onCancel} accessibilityLabel="Cancel" />
    </View>
  );
}

export interface TimePickerProps {
  label: string;
  /** 24-hour `HH:MM`, or '' when empty. */
  value: string;
  onChange: (hhmm: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | undefined;
  hint?: string;
  placeholder?: string;
  minuteStep?: number;
  testID?: string;
}

/** Time field opening a glass sheet with hour, minute and AM/PM columns, confirmed with Done. */
export function TimePicker({
  label,
  value,
  onChange,
  required,
  disabled,
  error,
  hint,
  placeholder = 'Select a time',
  minuteStep = 5,
  testID,
}: TimePickerProps) {
  const { theme } = useTheme();
  const c = theme.color;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(parseTime(value) ?? { h: 9, min: 0 });
  const h12 = draft.h % 12 === 0 ? 12 : draft.h % 12;
  const pm = draft.h >= 12;
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);

  const col = (
    title: string,
    items: { key: string; text: string; selected: boolean; onPress: () => void }[],
  ) => (
    <View style={{ flex: 1 }} accessibilityLabel={title}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: CELL * 5 }}
        contentContainerStyle={{ gap: space[1] }}
      >
        {items.map((it) => (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityLabel={`${title} ${it.text}`}
            accessibilityState={{ selected: it.selected }}
            onPress={it.onPress}
            style={{
              minHeight: CELL,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.pill,
              backgroundColor: it.selected ? c.accent : 'transparent',
            }}
          >
            <Text
              variant={it.selected ? 'bodyBold' : 'body'}
              style={{ color: it.selected ? c.accentInk : c.ink }}
            >
              {it.text}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <>
      <PickerField
        label={label}
        error={error}
        hint={hint}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        icon="clock"
        text={formatTimeFriendly(value)}
        onPress={() => {
          setDraft(parseTime(value) ?? { h: 9, min: 0 });
          setOpen(true);
        }}
        testID={testID}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={`Choose ${label}`} level="modal">
        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {col(
              'Hour',
              Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i)).map((h) => ({
                key: String(h),
                text: String(h),
                selected: h === h12,
                onPress: () => setDraft({ ...draft, h: (h % 12) + (pm ? 12 : 0) }),
              })),
            )}
            {col(
              'Minute',
              minutes.map((m) => ({
                key: String(m),
                text: String(m).padStart(2, '0'),
                selected: m === draft.min,
                onPress: () => setDraft({ ...draft, min: m }),
              })),
            )}
            {col(
              'AM or PM',
              (['AM', 'PM'] as const).map((p) => ({
                key: p,
                text: p,
                selected: (p === 'PM') === pm,
                onPress: () => setDraft({ ...draft, h: (draft.h % 12) + (p === 'PM' ? 12 : 0) }),
              })),
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <View style={{ flex: 1 }}>
              <Button variant="ghost" title="Cancel" onPress={() => setOpen(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Done"
                onPress={() => {
                  onChange(toTime(draft));
                  setOpen(false);
                }}
              />
            </View>
          </View>
        </View>
      </Sheet>
    </>
  );
}
