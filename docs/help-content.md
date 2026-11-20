# Writing help articles

Articles are MDX files in `apps/web/content/help/<category>/<slug>.mdx`. They ship with the app, so a PR that changes behaviour can change the article in the same PR. The admin Articles page reports on them; it does not edit them.

## Frontmatter

```yaml
title: Pay a request and see your receipt
slug: pay-a-request-and-see-your-receipt # must match the file name
category: payments-and-receipts # must match the folder
audience: [parent] # parent, player, coach, team-admin, club-admin
platforms: [web, ios] # optional
summary: One line, 10 to 160 characters.
order: 10
covers: # repo paths, folders or globs this article describes
  - 'apps/web/src/components/payments/**'
verified_commit: 9cfcc51
verified_at: '2026-11-20'
related: [pay-in-installments]
```

`covers` is what makes the check work: when a PR changes a covered file and not the article, `docs:check` flags it.

## Components

`<Steps>` (wrap a numbered list), `<Callout kind="note|warning|tip">`, `<WhoCanDo capability="billing.manage" />` (a role table generated from `capabilities.ts`), `<Live value="price" />` (a figure from settings, with a tooltip), `<PlatformTabs><Tab platform="ios">...</Tab></PlatformTabs>`, `<Screenshot src alt caption />` (alt text required), `<FAQ><Q q="...">...</Q></FAQ>`, `<VersionNote since="1.4">...</VersionNote>`.

**Never type** a price, a trial length, a fee or a role table. Use `<Live>` and `<WhoCanDo>`. Live keys: `price`, `trial_days`, `grace_days`, `fee_example`, `first_reply_target_hours`, `reopen_days`, `max_attachments`, `max_attachment_mb`. While team billing is off, the billing values render the not-yet-charging wording instead.

## Voice

Plain, short, kind. Name buttons exactly as the screen does, in bold. Never promise a response time. Never include children's details in examples.

## Checking

```bash
pnpm docs:index                 # builds the search index (generated, gitignored)
pnpm docs:check                 # validates every article, then lists those whose covered code changed
pnpm docs:check --base origin/dev --pr-body-file body.md
pnpm docs:verify <slug...>      # after you have actually checked the article against the code
pnpm docs:check --stale --json  # which articles cover code changed since verified_commit
```

`docs:check` validates frontmatter, related slugs, that every `covers` entry matches a tracked file, the no-literal-money and no-literal-trial rules, known `<Live>` and `<WhoCanDo>` values, image alt text and internal `/help` links.

Modes: `DOCS_CHECK_MODE=warn` (default, always exits 0 for mismatches) or `block` (fails until the article is updated or the PR says `Docs: none needed, because ...`). Content errors always fail. The repository variable `DOCS_CHECK_MODE` sets the mode in CI.

## Automation

- `.github/workflows/docs-check.yml` runs on every pull request, posts one comment (updated in place) and, when articles are flagged, a PR from this repository and an `ANTHROPIC_API_KEY` secret exist, lets Claude draft the update as a commit on the PR branch for a human to review. Set the variable `DOCS_DRAFTING` to `off` to disable it.
- `.github/workflows/docs-stale.yml` runs weekly, reports stale articles to `report-docs-status` (HMAC with `DOCS_STATUS_SECRET`) so the admin Articles page shows them, and keeps one GitHub issue up to date.
