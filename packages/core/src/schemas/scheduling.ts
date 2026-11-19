import { z } from 'zod';

import {
  EDIT_SCOPES,
  EVENT_TYPES,
  HOME_AWAY,
  MAX_CANCEL_REASON_LENGTH,
  MAX_EVENT_NOTES_LENGTH,
  MAX_EVENT_TITLE_LENGTH,
  MAX_RESULT_NOTES_LENGTH,
  MAX_RSVP_NOTE_LENGTH,
  MAX_SERIES_INTERVAL_WEEKS,
  MAX_SERIES_OCCURRENCES,
  RSVP_STATUSES,
} from '../scheduling';

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

/** True if the string is an IANA zone this runtime knows (the database re-checks with pg_timezone_names). */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
export const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isValidTimeZone, { message: 'Choose a valid timezone' });

/** Weekly recurrence; ISO weekdays (1 = Monday ... 7 = Sunday); exactly one of until / count. */
export const recurrenceSchema = z
  .object({
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Pick at least one day')
      .max(7)
      .refine((d) => new Set(d).size === d.length, { message: 'Each day once' }),
    interval: z.number().int().min(1).max(MAX_SERIES_INTERVAL_WEEKS).default(1),
    until: isoDate.optional(),
    count: z.number().int().min(1).max(MAX_SERIES_OCCURRENCES).optional(),
  })
  .strict()
  .refine((r) => (r.until === undefined) !== (r.count === undefined), {
    message: 'Choose either an end date or a number of events',
    path: ['until'],
  });
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const gameFormatSchema = z
  .object({
    period_count: z.number().int().min(1).max(12).optional(),
    period_minutes: z.number().int().min(1).max(120).nullable().optional(),
  })
  .strict();

export const createEventSchema = z
  .object({
    team_id: uuid,
    type: z.enum(EVENT_TYPES),
    title: z.string().trim().min(1, 'Give the event a title').max(MAX_EVENT_TITLE_LENGTH),
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
    timezone: timeZoneSchema,
    location_id: uuid.nullish(),
    location_text: z.string().trim().max(200).nullish(),
    opponent_id: uuid.nullish(),
    home_away: z.enum(HOME_AWAY).nullish(),
    notes: z.string().max(MAX_EVENT_NOTES_LENGTH).nullish(),
    arrive_early_minutes: z.number().int().min(0).max(240).nullish(),
    game_format: gameFormatSchema.nullish(),
    recurrence: recurrenceSchema.nullish(),
    virtual_url: z.string().trim().max(500).regex(/^https?:\/\/\S+$/i, 'Enter a full link starting with https://').nullish(),
  })
  .refine((e) => new Date(e.ends_at) > new Date(e.starts_at), {
    message: 'The end must be after the start',
    path: ['ends_at'],
  })
  .refine((e) => !(e.location_id && e.location_text), {
    message: 'Pick a saved location or type one, not both',
    path: ['location_text'],
  })
  .refine((e) => e.type === 'game' || (!e.opponent_id && !e.home_away && !e.game_format), {
    message: 'Opponent and home/away are only for games',
    path: ['opponent_id'],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** The fields update_event accepts. Absolute times only for a single event; series use local_start_time/duration_minutes. */
export const updateEventPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_EVENT_TITLE_LENGTH),
    notes: z.string().max(MAX_EVENT_NOTES_LENGTH).nullable(),
    location_id: uuid.nullable(),
    location_text: z.string().trim().max(200).nullable(),
    opponent_id: uuid.nullable(),
    home_away: z.enum(HOME_AWAY).nullable(),
    arrive_early_minutes: z.number().int().min(0).max(240).nullable(),
    game_format: gameFormatSchema.nullable(),
    virtual_url: z.string().trim().max(500).regex(/^https?:\/\/\S+$/i, 'Enter a full link starting with https://').nullable(),
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
    timezone: timeZoneSchema,
    local_start_time: timeOfDay,
    duration_minutes: z.number().int().min(1).max(1440),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: 'Nothing to change' });
export type UpdateEventPatch = z.infer<typeof updateEventPatchSchema>;

export const updateEventSchema = z.object({
  event_id: uuid,
  scope: z.enum(EDIT_SCOPES).default('this'),
  patch: updateEventPatchSchema,
});

export const cancelEventSchema = z.object({
  event_id: uuid,
  scope: z.enum(EDIT_SCOPES).default('this'),
  reason: z.string().trim().min(1, 'Say why').max(MAX_CANCEL_REASON_LENGTH),
});

export const setRsvpSchema = z.object({
  event_id: uuid,
  player_id: uuid,
  status: z.enum(RSVP_STATUSES),
  note: z.string().trim().max(MAX_RSVP_NOTE_LENGTH).nullish(),
});

export const periodScoreSchema = z
  .object({ us: z.number().int().min(0).max(999), them: z.number().int().min(0).max(999) })
  .strict();

export const recordGameResultSchema = z.object({
  event_id: uuid,
  our_score: z.number().int().min(0).max(999),
  their_score: z.number().int().min(0).max(999),
  period_scores: z.array(periodScoreSchema).min(1).nullish(),
  notes: z.string().trim().max(MAX_RESULT_NOTES_LENGTH).nullish(),
});
export type RecordGameResultInput = z.infer<typeof recordGameResultSchema>;

export const locationInputSchema = z
  .object({
    team_id: uuid,
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().max(300).nullish(),
    notes: z.string().trim().max(500).nullish(),
    lat: z.number().min(-90).max(90).nullish(),
    lng: z.number().min(-180).max(180).nullish(),
    place_id: z.string().trim().min(1).max(300).nullish(),
  })
  .refine((l) => (l.lat == null) === (l.lng == null), {
    message: 'Give both latitude and longitude, or neither',
    path: ['lat'],
  });

export const opponentInputSchema = z.object({
  team_id: uuid,
  name: z.string().trim().min(1).max(100),
});
