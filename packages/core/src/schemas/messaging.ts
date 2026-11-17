import { z } from 'zod';

import {
  ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  MAX_THREAD_TITLE_LENGTH,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  PUSH_PLATFORMS,
  REACTIONS,
  THREAD_TYPES,
} from '../constants';

const uuid = z.uuid();

export const attachmentInputSchema = z.object({
  storage_path: z.string().min(1).max(300),
  mime_type: z.enum(ATTACHMENT_MIME_TYPES),
  size_bytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
});
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;

export const messageBodySchema = z
  .string()
  .trim()
  .max(MAX_MESSAGE_LENGTH, `Use at most ${MAX_MESSAGE_LENGTH} characters`);

export const sendMessageSchema = z
  .object({
    thread_id: uuid,
    body: messageBodySchema,
    reply_to: uuid.nullish(),
    attachments: z.array(attachmentInputSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
  })
  .refine((m) => m.body.length > 0 || m.attachments.length > 0, {
    message: 'Write a message or attach a file',
    path: ['body'],
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  message_id: uuid,
  body: messageBodySchema.min(1, 'A message cannot be empty'),
});

export const createThreadSchema = z
  .object({
    team_id: uuid,
    type: z.enum(THREAD_TYPES),
    title: z.string().trim().max(MAX_THREAD_TITLE_LENGTH).nullish(),
    participant_ids: z.array(uuid).default([]),
  })
  .superRefine((t, ctx) => {
    if (t.type !== 'direct' && !t.title) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'Give this thread a title' });
    }
    if (t.type === 'direct' && t.participant_ids.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['participant_ids'],
        message: 'Choose one person to message',
      });
    }
    if (t.type === 'group' && t.participant_ids.length < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['participant_ids'],
        message: 'Add at least one person',
      });
    }
  });
export type CreateThreadInput = z.infer<typeof createThreadSchema>;

export const reactionSchema = z.enum(REACTIONS);

export const reportMessageSchema = z.object({
  message_id: uuid,
  reason: z.string().trim().min(1, 'Tell us what is wrong').max(MAX_REPORT_REASON_LENGTH),
});

// Notifications ---------------------------------------------------------------------------------
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:MM');

export const notificationPreferenceSchema = z
  .object({
    channel: z.enum(NOTIFICATION_CHANNELS),
    category: z.enum(NOTIFICATION_CATEGORIES),
    enabled: z.boolean(),
    quiet_hours_start: timeOfDay.nullable(),
    quiet_hours_end: timeOfDay.nullable(),
    timezone: z.string().min(1).max(64),
    include_preview: z.boolean(),
  })
  .refine((p) => (p.quiet_hours_start === null) === (p.quiet_hours_end === null), {
    message: 'Set both ends of quiet hours, or neither',
    path: ['quiet_hours_end'],
  });
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;

export const registerPushDeviceSchema = z
  .object({
    platform: z.enum(PUSH_PLATFORMS),
    token: z.string().min(10).max(2000),
    subscription: z.object({ p256dh: z.string(), auth: z.string() }).nullish(),
    label: z.string().max(100).nullish(),
  })
  .superRefine((d, ctx) => {
    if (d.platform === 'web') {
      if (!d.token.startsWith('https://') || !d.subscription) {
        ctx.addIssue({
          code: 'custom',
          path: ['subscription'],
          message: 'Invalid web push subscription',
        });
      }
    } else if (!/^Expo(nent)?PushToken\[.+\]$/.test(d.token)) {
      ctx.addIssue({ code: 'custom', path: ['token'], message: 'Invalid Expo push token' });
    }
  });
export type RegisterPushDeviceInput = z.infer<typeof registerPushDeviceSchema>;
