# Registration privacy

Design notes for engineering and for counsel. This is not legal advice; items marked **Counsel** need review before launch.

## What is collected

- **Guardian:** name, email, optional phone, relationship. Registrations are completed by a parent or guardian: the public form requires an explicit
  guardian attestation, there is no child login in the flow, and players under 13 have no account anywhere in the product.
- **Player:** first name, last name, date of birth (needed for eligibility and rosters). Optionally linked to an existing child in the family's household.
- **Custom answers:** only what the issuer's form asks for. The builder refuses fields that ask for government ID numbers, SSNs or card data; file upload
  fields do not exist. Card payments go through Stripe, never through a form.
- **Waiver signature:** typed name, relationship, email, timestamp, consent to electronic records, content hash of the waiver text, and optionally IP address
  and user agent (separate admin-only table).

Public pages never list registrants or show names. The public payload contains a coarse availability label, not a count of registrants.

## Sensitive answers

Fields flagged `sensitive` (medical conditions, allergies, medications, emergency medical notes) are stored in `registration_sensitive_answers`, a separate
table with RLS enabled, a deny-all policy and **no grants to any client role**. The only read path is `get_sensitive_answers`, which:

1. allows the registrant's own family, issuer admins, and staff holding the explicit `sensitive_answers` capability (granted by an admin, revocable);
2. writes an audit row (actor, registration, time) on every read, with no values in the audit row;
3. is never used by lists, detail, exports (unless the exporter holds the capability and asks) or notifications.

Detail, list and export functions exclude sensitive answers; an export that asks for them without the capability is refused, not silently reduced.

**Storage options considered** (decision requested in the Part A summary):

| Option                                                                 | Protects against                                                                | Cost                                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate RLS-protected table, no grants, audited read function (built) | Accidental exposure through lists, exports, joins, policies; every read audited | Plaintext at rest inside the database (as is everything else; Supabase encrypts disks)                                                              |
| Column encryption with Supabase Vault / pgsodium                       | A database dump or a leaked read-only connection                                | Key management, no server-side search (not needed), pgsodium is being deprecated upstream; adds failure modes to a read path that is already narrow |
| Application-level encryption in the Edge Function                      | Database-level exposure, including operators                                    | Key in Edge secrets; decrypt only in functions; complicates the audited SQL read path                                                               |

Recommendation: keep the separate table now; add application-level encryption only if counsel or a customer requires protection from database-level access.

## Retention (decisions needed)

Proposed defaults, to be confirmed: declined and withdrawn registrations anonymized 12 months after the event ends (guardian and player names, email,
phone, date of birth and answers replaced; counts and audit trail kept); accepted/placed registrations kept for the season plus 24 months; sensitive answers
deleted 90 days after the event ends unless the player is placed on a roster; signed waivers and acceptance records kept for the statute-of-limitations
period (**Counsel**: commonly several years after a minor reaches majority); audit entries kept. Anonymization of waiver acceptances conflicts with
append-only and is therefore not built; **Counsel** to decide whether signed records are retained intact or pseudonymized by a dedicated, logged procedure.
Parent-requested export and deletion are staff-triggered, audited functions (`export_registrant_data`, `erase_registrant_data`). The retention job (`svc_run_registration_retention`, daily) anonymizes declined/withdrawn registrations 12 months after the event ends and deletes sensitive answers 90 days after it ends (kept for placed players); both periods are parameters of that function.

## Items for counsel to confirm

- E-signature record: typed signature, intent to sign, consent to electronic records, association of the signature with the record (version hash), and the
  ability to reproduce the signed copy (PDF). Whether recording IP and user agent is wanted or creates unnecessary data.
- A minor cannot be bound by their own signature; a guardian signs. Whether enforceability of releases of a minor's claims varies by state, and what wording is required.
- COPPA and state children's privacy laws: registrations are collected from the parent, not the child; confirm the guardian attestation and notice wording, and
  whether the public page needs a privacy notice link.
- Retention periods above, and the right to deletion versus legal-hold of signed waivers.
- Medical information handling: whether any answer collected is regulated health data for the issuer and what notice is required.
- Anonymous submissions: the email magic link is the only verification before a registration counts.

## Operational privacy notes (Part B)

- Verification and signing tokens are random 256-bit values stored only as sha256 hashes; the verification token is in the URL fragment so it never reaches a server log or a Referer header.
- Logs contain ids, statuses and error codes only (the logger redacts names, emails, tokens and bodies). Rate-limit buckets use a hash of the email, not the address.
- Registrant emails are plain text. They contain the display id, event title, issuer name, the child's first name and (when staff wrote one) the decision message; never answers or medical data.
- Signer IP and user agent are NOT recorded unless `RECORD_SIGNER_EVIDENCE=true` is set on `sign-waiver`.
- The cover image of a public page is served through a 1-hour signed URL that may be cached publicly for 60 seconds; do not put anything in a cover image that must stay private.
- Signed waiver copies are stored privately and emailed as attachments to the signer's address; the email provider (Resend) therefore processes them.
