# Team subscriptions (billing)

Athleit charges **teams** a monthly subscription, with a free trial. This is separate from payments: payments are Stripe Connect
direct charges on a team's connected account (see [payments-architecture.md](payments-architecture.md)); a subscription is Athleit
charging its own customer on **Athleit's platform Stripe account** (no `Stripe-Account` header anywhere in the billing code).
Test mode only until the items in [payments-go-live.md](payments-go-live.md) are approved. `fee_config` (the per-transaction
charge) is untouched.

## The model

- **One subscription per team**, paid by a team admin. The Stripe Customer belongs to the **team** (metadata `team_id`), not to whoever
  clicked Subscribe; who subscribed is recorded (`team_billing.subscribed_by`). If they are later demoted, billing continues and notices go
  to **all current admins** (the last admin can never be removed).
- **Who sees what.** `billing.manage` (team admin): subscribe, card, cancel, resume, invoices. `billing.view` (coach, manager): status
  only (trial end, subscribed, payment problem). Parents, players, guardians and club admins see nothing.
- **Clubs.** A club-linked team pays for itself. Club-pays-for-teams is not built; nothing in the pricing functions assumes the payer is a
  team (the price lives on a version, the customer on a billing row), so a club payer can be added without changing the price model.
- **Facts are stored, state is computed.** `team_billing` holds trial end, Stripe ids, Stripe status, period end, cancel flag,
  `past_due_since`, `grace_ends_at`, comp, `last_snapshot_at`. `private.team_billing_state(team, now)` computes the state; the same
  function exists in `packages/core/src/team-billing.ts` with the same test vectors. No derived status column exists.
- **No retention job.** A long-lapsed team's data is never deleted. How long to keep it is a business decision; nothing here schedules
  a deletion.

### States

| State              | Meaning                                           | Access                               |
| ------------------ | ------------------------------------------------- | ------------------------------------ |
| `off`              | billing disabled (the switch, or no billing row)  | full                                 |
| `trialing`         | inside the Athleit trial, no Stripe subscription  | full                                 |
| `active`           | Stripe subscription `active` or Stripe-`trialing` | full                                 |
| `cancel_scheduled` | `cancel_at_period_end`, paid through the period   | full until the period ends           |
| `past_due`         | latest invoice failed, inside grace               | **grace** (full access, loud banner) |
| `trial_expired`    | trial ended, no subscription                      | **restricted**                       |
| `lapsed`           | subscription ended, or past due beyond grace      | **restricted**                       |
| `comped`           | complimentary until a date (or no date)           | full                                 |

A payment that succeeds at any time returns the team to `active`. An `incomplete` first payment falls back to the trial rules.

### Restricted access

Restriction stops growth and new money collection; it never harms families or loses data. The database refuses (`billing_restricted`):
`publish_payment_event`, `publish_registration_event` (publishing **and reopening**: reopening goes through the same function),
`create_invite` (team invites) and `decide_join_request` **when approving** (declining stays open). Never gated in any state: reading,
RSVPs, messaging, announcements, editing or cancelling existing events, exports, refunds, account deletion, families paying requests
that are already published, registrations already open, anything about billing itself. A club-issued event (no team) is never gated.

The gate is one helper, `private.assert_team_billing_allows(team)`. Each gated function is a thin public wrapper that runs the gate and
then calls the **original body unchanged**, which was moved to the `private` schema (`*_inner`). A caller who is not staff of the team
gets the function's normal authorization error, never a hint about the team's billing.

## Dynamic pricing and trial

Everything commercial lives in `platform_settings`, described by `platform_setting_definitions` (label, description, type, bounds, unit,
default, write role) so a generic admin form can be rendered from the data. Keys: `team_subscription.enabled` (false), `.price_cents`
(1000), `.trial_days` (14), `.grace_days` (7), `.trial_reminder_days` ([3, 1]), `.automatic_tax` (false). These seeds are the **only**
place those numbers appear; the UI renders from `get_billing_terms()` and `get_team_billing()`.

- **Price versions.** Stripe Prices are immutable, so a list price is a `billing_price_versions` row (immutable amount; the Stripe price id
  is attached once). Changing `price_cents` creates or reuses the version in the same transaction as the setting change. The Stripe
  Product and Price are created lazily by `create-billing-checkout` with idempotency keys derived from the version id.
- **Price change policy (default; flag if you disagree).** A new list price applies to teams that subscribe **after** the change.
  Existing paying teams keep the price they signed up at (`team_billing.price_version_id` locks it). A team still in its Athleit trial
  takes the price current when it subscribes. Moving a paying team to a new price is an admin action that is **not built**; the locked
  version column makes it possible.
- **Trial.** Starts when the team is created (a trigger on `teams`), stored per team (`trial_ends_at`), so changing `trial_days` never
  alters a running trial. The decision is in **one function**, `private.start_team_trial`; moving the clock (for example to the first
  published event) is a one-function change. No card and no Stripe objects exist until an admin chooses Subscribe.
- **Launch switch.** `team_subscription.enabled` ships `false`: every team is fully active, no billing UI renders, no notices send, no
  gating applies. `private.enable_team_billing(actor, reason)` flips it (audited, with history) and backfills a billing row for every
  existing team with `trial_ends_at = now() + trial_days`. `private.disable_team_billing` restores everything instantly and deletes nothing.

## Stripe Billing flow

Stripe Subscriptions, hosted Checkout, the Billing Portal and Smart Retries (not our own scheduler: Athleit charges its own customers on a
fixed monthly cycle, so re-implementing dunning and proration would add risk; split payments differ because they charge connected-account
families through the fee module).

| Function                        | Who        | What                                                                                                                     |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `create-billing-checkout`       | team admin | Checkout Session, subscription mode, `client_reference_id` = team. Redirect URLs from `APP_URL` only. Returns `{ url }`. |
| `create-billing-portal-session` | team admin | Billing Portal (payment method and invoice history only). Return URL from config.                                        |
| `update-team-subscription`      | team admin | `cancel` / `resume` = `cancel_at_period_end` true / false. Never ends service early.                                     |
| `get-billing-card`              | team admin | Card brand and last four from Stripe on demand (nothing stored).                                                         |
| `reconcile-billing`             | pg_cron    | Every 15 minutes: refresh stale, past-due or unexpected subscriptions; mirror recent invoices. Safe to run concurrently. |

Subscribing during the Athleit trial passes `subscription_data.trial_end = trial_ends_at`, so no trial days are lost and the first charge
is when the trial would have ended. Stripe needs `trial_end` at least 48 hours ahead (`scripts/billing-integration.mjs` checks this in test
mode); with less left the end is pushed to 48 hours plus a 10 minute margin, the real end is returned, and the success page says so. A
lapsed or expired team gets no trial and is charged immediately. The success redirect **never grants anything**: the page polls
`get_team_billing` (bounded backoff) until the webhook has landed, then keeps polling quietly.

### Webhook (platform endpoint, `event.account` null)

`stripe-webhook` keeps raw-body signature verification, the ledger-first idempotency (`stripe_webhook_events`), the test-mode refusal and
redaction. `STRIPE_WEBHOOK_SECRET` is now **required**. Billing events are routed by type and a null `account`, so they can never be mistaken for
Connect payments (which key on `metadata.athleit_payment_id`).

- **Fetch, do not trust.** Every subscription or invoice event triggers a fetch of the current subscription (and invoice) from Stripe, applied
  through `svc_apply_subscription_snapshot`, which is idempotent and refuses an older snapshot (`last_snapshot_at`). Events may arrive late,
  twice or out of order.
- A subscription links to a team by `client_reference_id` / metadata, verified by the database (team exists, stored customer matches).
  Never by email or name. An unknown customer is logged and ignored.
- `team_billing_invoices` mirrors invoices (ids, amounts, links; no card data). `charge.refunded` and `charge.dispute.created` are recorded for
  subscription invoice charges only and logged loudly; a dispute never restricts a team by itself.
- `invoice.payment_failed` sets `past_due_since` (first failure only) and `grace_ends_at`; `invoice.paid` clears them. A price or currency
  mismatch against the locked version sets `price_mismatch` and is shown to the admin, never silently accepted.
- Stuck platform events that the payments reconciler re-fetches are not replayed through billing; `reconcile-billing` heals state from snapshots.

### Stripe Dashboard configuration (test mode now, live later)

1. **Webhooks:** a platform endpoint to `.../functions/v1/stripe-webhook` with exactly: `checkout.session.completed`,
   `customer.subscription.created`, `.updated`, `.deleted`, `.trial_will_end`, `invoice.created`, `.finalized`, `.paid`, `.payment_failed`,
   `.payment_action_required`, `charge.refunded`, `charge.dispute.created`. Set its signing secret as `STRIPE_WEBHOOK_SECRET`.
2. **Revenue recovery:** Smart Retries on, retry window about three weeks, then **cancel the subscription** (so a lapsed team re-subscribes
   through Checkout and is charged immediately, with no stuck open invoice).
3. **Customer emails:** receipts only. Athleit sends every payment-problem notice itself (consistent copy, deep links into the app).
4. **Billing Portal:** allow payment method updates and invoice history only. Cancel and resume are done in the app so state and copy stay consistent.
5. **Tax:** off by default (`team_subscription.automatic_tax`). Software subscriptions can be taxable in some states; ask an accountant before turning it on.
6. **Secrets and Vault:** `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `APP_URL`, `RECONCILE_SECRET`; Vault `billing_reconcile_function_url`.

## Notices

Sent by `private.notify_team_billing` (once per team and key) to all current admins, category `billing`. Coaches and managers receive only the
restricted notice ("ask a team admin", no amounts).

| Notice                     | When                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| Trial started              | Hourly sweep, once admins exist (the end date)                        |
| Trial ending               | Sweep, at each `trial_reminder_days` value (only the closest if late) |
| Trial ended / restricted   | Sweep, when the trial ends with no subscription (admins) and staff    |
| Subscribed                 | Snapshot transition into `active` (next charge date and amount)       |
| Payment failed             | Snapshot transition into `past_due` (what to do and the deadline)     |
| Needs authentication       | `invoice.payment_action_required`                                     |
| Final warning              | Sweep, one day before `grace_ends_at`                                 |
| Restricted for non-payment | Sweep, when grace ends                                                |
| Payment recovered          | Snapshot transition `past_due` to `active`                            |
| Cancellation scheduled     | Snapshot transition to `cancel_scheduled` (end date)                  |
| Subscription resumed       | Snapshot transition `cancel_scheduled` to `active`                    |
| Subscription ended         | Snapshot transition from paying to `lapsed`                           |

State changes themselves are computed from time. The sweep only sends notices and writes team audit events (`billing.trial_expired`,
`billing.restricted`, and one per snapshot transition) once.

## Admin-portal foundations

No admin route or screen exists yet. The data and functions the portal will need do:

- `platform_admins` (owner, admin, support): RLS on, **no client grants at all**. Rows are created only by service role or SQL.
- **AAL2 for writes.** Every admin write requires an authenticated platform admin of the needed role **and** `auth.jwt()->>'aal' = 'aal2'`
  (MFA). An admin must enrol TOTP before the portal can write; enrolment is not built. Reads need an admin session only.
- `platform_admin_role()` (a client learns only its own role), `admin_list_settings()`, `admin_set_setting(key, value, reason)` (the key's
  write role or higher; reason required; validates type and bounds; history and platform audit), `admin_list_team_billing(state, search,
limit, cursor)` (keyset), `admin_get_team_billing`, `admin_billing_metrics` (teams per state, MRR = sum of locked prices of `active` and
  `cancel_scheduled`, trials ending in 7 days, past-due count), and the writes `admin_extend_trial`, `admin_comp_team`, `admin_clear_comp`.
- `platform_audit_log` holds admin actions and setting changes and is readable only by platform admins. Team-visible lifecycle events go to the
  team's `audit_log` through `private.write_audit`. Admin actions never appear there.
- Stripe-side admin actions (cancel now, refund an invoice, force resync) are **not built**; `svc_apply_subscription_snapshot` (used by the
  reconciler) is reusable for a resync.
- The portal should also wrap `private.admin_set_fee_config` under the same admin and audit rules; `fee_config` is unchanged today.

### Runbook: until the portal exists

All of this is service-role or SQL (Dashboard SQL editor or `pnpm supabase db query`). Use your own profile id as the actor.

```sql
-- Make someone a platform admin (the person must also enrol TOTP before the portal can write).
insert into public.platform_admins (profile_id, role, created_by) values ('<profile id>', 'owner', '<your profile id>');

-- Change the price (a new version is created; paying teams keep theirs) or the trial / grace length.
select private.set_platform_setting('team_subscription.price_cents', '1500'::jsonb, '<profile id>', 'reason');
select private.set_platform_setting('team_subscription.trial_days', '21'::jsonb, '<profile id>', 'reason');

-- Launch billing (starts a fresh trial for every existing team) and switch it off again.
select private.enable_team_billing('<profile id>', 'Launch');
select private.disable_team_billing('<profile id>', 'Pause billing');
```

## Verification

`pnpm db:test` (pgTAP: `fn_team_billing` plus one RLS file per new table), `packages/core` Vitest (`team-billing`, `billing-edge`),
`scripts/billing-integration.mjs` (Stripe test clocks; needs a test key), and the Playwright specs for the billing screens.
