export const APP_NAME = 'Athleit';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt limit used by Supabase Auth
export const MAX_DISPLAY_NAME_LENGTH = 80; // matches profiles_display_name_length

/** OAuth providers wired up in Phase 0 (credentials supplied later). */
export const OAUTH_PROVIDERS = ['google', 'apple'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

// Phase 1: people, households, clubs, teams and rosters. Values mirror the database enums.
export const SPORTS = [
  'soccer',
  'basketball',
  'volleyball',
  'football',
  'baseball',
  'softball',
  'hockey',
] as const;
export type Sport = (typeof SPORTS)[number];

export const TEAM_ROLES = ['admin', 'coach', 'manager', 'parent', 'player'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
/** Roles with write/roster access to a team. */
export const TEAM_STAFF_ROLES = ['admin', 'coach', 'manager'] as const;
export type TeamStaffRole = (typeof TEAM_STAFF_ROLES)[number];

export const CLUB_ROLES = ['admin', 'manager'] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'inactive'] as const;
export const REQUEST_STATUSES = ['pending', 'approved', 'declined'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const ROSTER_STATUSES = ['active', 'inactive'] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

/** Children under this age never have their own login (also enforced in the database). */
export const MIN_PLAYER_LOGIN_AGE = 13;
export const MAX_INVITE_EXPIRY_DAYS = 90;
export const DEFAULT_INVITE_EXPIRY_DAYS = 7;
export const MAX_INVITE_USES = 1000;
export const MAX_JERSEY_NUMBER = 99;

/** Display names for the roles shown in invites and menus. */
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  coach: 'Coach',
  manager: 'Manager',
  parent: 'Parent',
  player: 'Player',
  guardian: 'Guardian',
};

// Phase 3: messaging and notifications. Values mirror the database constraints.
export const THREAD_TYPES = ['announcement', 'group', 'direct'] as const;
export type ThreadType = (typeof THREAD_TYPES)[number];
export const THREAD_PARTICIPANT_ROLES = ['owner', 'member', 'read_only'] as const;
export type ThreadParticipantRole = (typeof THREAD_PARTICIPANT_ROLES)[number];

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_THREAD_TITLE_LENGTH = 100;
export const MAX_REPORT_REASON_LENGTH = 500;
/** In-database rate limit: messages per user per rolling minute. */
export const MESSAGE_RATE_LIMIT_PER_MINUTE = 30;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];
export const MESSAGE_ATTACHMENTS_BUCKET = 'message-attachments';

/** Fixed reaction set (stored as keys; the apps render them as icons). */
export const REACTIONS = ['thumbs_up', 'heart', 'laugh', 'celebrate', 'clap', 'wow'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Settable channels/categories; the *_reserved values exist in the database but are not implemented. */
export const NOTIFICATION_CHANNELS = ['push', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export const NOTIFICATION_CATEGORIES = [
  'messages',
  'announcements',
  'schedule',
  'payments',
  'registration',
  'billing',
  'support',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export const PUSH_PLATFORMS = ['ios', 'android', 'web'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];
export const OUTBOX_STATUSES = ['pending', 'sending', 'sent', 'failed', 'skipped'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

/** Realtime private-channel topic for typing indicators and presence in a thread. */
export const threadChannelTopic = (threadId: string) => `thread:${threadId}`;
