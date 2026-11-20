# Dev clean-slate wipe report

Targets (the only ones authorized): Supabase **Athleit Dev** `qzvwoqnykpmvzdnetkmy`; Stripe test-mode account **Athleit** `acct_1OumOtICEGMaqMNy`. Counts only, no personal data. Run date 2026-11-20.

## Guards (Step A)
- Supabase: only project is Athleit Dev; CLI link and env agree. Stripe: livemode false.
- Activity: no other worktrees, dev/Metro/Playwright processes or booted simulators; no non-system DB connections; newest writes were hours old (audit_log 14:44 UTC, messages 02:47, stripe_webhook_events 02:30). User confirmed no other session active.
- Wipe script: `scripts/e2e/wipe-dev.sh` (+ `wipe-dev.sql`): refuses without the exact ref and `--confirm`; `--dry-run` rolls back.

## BEFORE (Step B)
Differences from the brief: **104** migrations applied (repo has 109 files, so ~5 unpushed), **13** cron jobs (not 12), **13** Stripe connected accounts (not 12; one is a Standard account), **7** products (not 6). Targets still pass Step A, so continuing.

| System | Count |
|---|---|
| auth.users / identities | 24 / 23 |
| storage buckets / objects | 6 / 14 |
| cron jobs | 13 |
| applied migrations | 104 |
| Stripe: connected accounts / customers / products (incl. archived) / webhook endpoints | 13 / 11 / 7 / 1 |

Non-empty public tables (exact): audit_log 718, notification_preferences 288, stripe_webhook_events 101, notification_outbox 84, events 81, profiles 24, team_memberships 24, teams 18, payment_requests 12, payment_items 9, payments 9, forms 8, join_requests 8, platform_setting_definitions 8, platform_settings 8, api_rate_limits 7, form_versions 7, locations 7, messages 7, players 7, registration_events 7, sport_configs 7, waiver_versions 7, waivers 7, event_series 6, game_results 6, household_members 6, opponents 6, team_players 6, households 5, payment_events 5, rsvps 5, thread_participants 5, event_seen 4, message_reads 4, calendar_feed_tokens 3, threads 3, message_reactions 2, offline_payments 2, refunds 2, billing_daily_snapshots 1, billing_price_versions 1, connected_accounts 1, fee_config 1, household_join_requests 1, invites 1, message_attachments 1, platform_admins 1. All other public tables are 0.

## Classification
**Kept (config):** sport_configs (7), fee_config (1), platform_settings (8), platform_setting_definitions (8). These are the only tables seeded by migrations/settings definitions; no other migration inserts are seeds (the other `insert into` hits are inside function bodies or tests). Ambiguity rule: keep.
**Wiped:** every other public table, including billing_price_versions (its Stripe price disappears in Step C; recreated in Step F), billing_stripe_product, platform_admins (the platform owner must be re-created: see docs/admin.md) and all audit/outbox/webhook tables.

## FK and trigger findings
- Kept tables have FKs only to `profiles` (fee_config.created_by, platform_settings.updated_by: ON DELETE SET NULL) and `platform_settings -> platform_setting_definitions` (restrict, both kept). Wiped tables referencing kept ones are on the referencing side, so TRUNCATE without CASCADE is safe.
- Because kept tables reference `profiles`, profiles cannot be TRUNCATEd; the script nulls those two attribution columns, then DELETEs profiles. The kept-row checksum excludes created_by/updated_by (the only expected change).
- Append-only guard triggers (payments, forms, form_versions, waiver_*, registrations, documents, installments, billing_price_versions, ...) are bypassed with `SET LOCAL session_replication_role = replica` for the truncate only, then restored to `origin` before `DELETE FROM auth.users` so cascades run. `SET LOCAL` ends with the transaction; no trigger is ever disabled by DDL. Verified the postgres role may set it.
- Verification block raises (rolls back) if: any wiped table or auth is non-empty, any kept table's count/checksum changed, migrations/cron/buckets counts changed, or the replication role was not restored.

(AFTER counts, Stripe remainder and user to-dos are added after Steps C-G.)
