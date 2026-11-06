# HMM Platform

Healing Minds Matter (HMM) Phase 1: web app (Super Admin + Champion) and
mobile app (Gatekeeper) for managing a network of QPR-certified Gatekeepers
across clubs.

## Stack
- Database/Auth: Supabase (Postgres + Supabase Auth + Row Level Security for RBAC)
- Web: Next.js (App Router), deployed on Vercel
- Mobile: React Native + Expo, built via EAS

## Roles
- Super Admin: system-wide access, web only
- Champion: manages one club, web only
- Gatekeeper: mobile only, onboarded by a Champion

## Source of truth
Requirements and acceptance criteria live in project root ("Phase 1 - Super
Admin User Stories.md"). Always check that file before implementing a feature
— build to the acceptance criteria exactly, including edge cases (e.g. club
deactivation cascading to Champions/Gatekeepers, permission overrides,
password reuse rules).

## Conventions
- One epic/story = one focused set of commits, not everything at once.
- Every new table needs a Row Level Security policy before it ships.
- Run and pass relevant tests before marking a story done.

## Email delivery — live via SendGrid (switched from Resend 2026-09-16)

Supabase Auth emails (Champion/Gatekeeper invites, password reset, etc.) go
through SendGrid's SMTP relay, sending from a **verified Single Sender**
(`jayani@ensiz.com`) — this is a real, personally-verified address, not a
DNS-verified domain, but SendGrid's Single Sender model allows sending to
**any recipient**, unlike Resend's `onboarding@resend.dev` test sender
(which only delivered to the Resend account owner's own address — see the
2026-09-14 / 2026-09-16 Epic 1 log entries below for that history).

**Confirmed working 2026-09-16**: a real invite was sent to a non-`ensiz.com`
address and confirmed delivered.

**Still worth knowing:**
- SendGrid's free tier caps at 100 emails/day — fine for continued testing
  and low-volume real onboarding, but confirm current SendGrid plan limits
  before any high-volume Champion/Gatekeeper import.
- The sender is a named individual's address (`jayani@ensiz.com`), not a
  generic `noreply@`/`support@` — acceptable for now, but a DNS-verified
  dedicated domain (e.g. `healingmindsmatter.org`, once DNS access exists)
  would be the more standard long-term setup and would also unlock a
  generic sender address instead of a personal one.
- No orphaned-record risk confirmed: when an invite fails for any reason,
  no `auth.users` or `profiles` row is left behind — verified directly via
  DB query after several forced failure tests.

## Progress Log

### Sprint 1 — COMPLETE (all ACs verified 2026-08-03, re-audited against live code
and fixed 2026-08-12, then given a full live-browser QA pass across all 9
epics + NFRs on 2026-09-07 — see "2026-09-07 full QA pass" note at the bottom
of this log before trusting old "✅" claims elsewhere; several were inaccurate)

**Epic 1 — Authentication & RBAC (Stories 1.1–1.4)** ✅ (re-verified 2026-08-12,
live-QA-passed 2026-09-07)
- Login with RBAC redirect, generic error (no field hint), deactivated-account
  check (distinguishes club_deactivated vs manual).
- Forgot password: always-generic response (no email enumeration), Supabase
  time-limited reset link, complexity validation (8 chars, upper, lower, number,
  symbol, no name/email, not common — 2026-08-12: rewrote the common-password
  check to normalize leetspeak substitutions and match on a root-word list
  instead of exact strings, since the original exact-match list almost never
  fired), password-reuse prevention (last 5, bcrypt), confirmation match,
  audit log written on successful reset.
- Change password: current-password verify, same complexity rules, reuse
  prevention, match check, cannot reuse current password, audit log written on
  successful change.
- **2026-08-12 fixes**: `resetPasswordAction` now signs out the recovery
  session before redirecting to `/login?reset=success` — previously the
  still-authenticated recovery session got silently bounced back to the
  dashboard by middleware, so the reset-success message was unreachable.
  `changePasswordAction` now actually calls `supabase.auth.signOut({scope:
  'others'})` after a successful change (Sc07) — it previously just assumed
  Supabase did this automatically and never called it. `login-form.tsx` now
  renders `club_inactive`/`account_inactive` (in addition to `session_expired`)
  so the message from a forced mid-session logout isn't dropped.
- Session: 20-min idle timeout, 2-min warning modal with countdown; manual
  logout → /login; idle timeout → /login?error=session_expired (shows
  "session expired" message).
- Outstanding (infrastructure, not code): no transactional email provider is
  configured, so password-reset/change confirmation emails (1.2 Sc09, 1.3
  Sc08) are not actually sent. The UI no longer claims one was sent (fixed
  2026-08-12 — it previously did, which was worse than just missing).
  **2026-09-07**: closed the *notification* half of this specific gap by
  enabling Supabase's own built-in `mailer_notifications_password_changed_enabled`
  toggle via the Management API (template was already provisioned, just
  switched off) — actual inbox delivery not independently re-verified (no
  inbox access in this session), but the feature is now correctly configured
  end-to-end for both reset and change flows.
  **2026-09-14 — transactional email provider now configured (test mode)**:
  the root gap (no SMTP provider at all, so Supabase fell back to its own
  mailer with a very low default rate limit — 2 emails/hour — which was
  actively blocking Champion/Gatekeeper invite testing) is resolved. Custom
  SMTP is wired up via Resend (`smtp.resend.com:465`, configured through the
  Supabase Management API's `/config/auth` endpoint — dashboard equivalent:
  Authentication → Settings → SMTP Settings). The email send rate limit
  (Authentication → Rate Limits → "Rate limit for sending emails") was raised
  from the default 2/hour to 40/hour. The Resend API key lives only in
  Supabase's project auth config (`smtp_pass`, encrypted at rest) — never
  committed to this repo or added to `.env.local`.
  **Known limitation — sender domain not yet verified for production**: the
  intended production sender `noreply@healingmindsmatter.org` could not be
  verified in Resend (it's a company domain and DNS access wasn't available
  in this session to add the SPF/DKIM records Resend requires). As a
  workaround, the SMTP sender is currently set to Resend's own pre-verified
  test address, `onboarding@resend.dev`. **This only delivers to the email
  address on the Resend account itself** (`jayani@ensiz.com`) — sends to any
  other recipient will silently fail or bounce. This is expected Resend
  behavior for an unverified custom domain, not an app bug — don't mistake a
  failed send to an arbitrary Champion/Gatekeeper email for a regression;
  it's this same limitation. Verified live end-to-end on 2026-09-14: a real
  Create Champion invite to `jayani@ensiz.com` returned `200` from Supabase's
  `/invite` endpoint (previously `500`, "domain is not verified") and the
  email was confirmed received (landed in spam — expected for a shared,
  unverified-domain sender with no sending reputation; verified-domain
  delivery in production should land in the inbox normally).
  **Before this can support real Champion/Gatekeeper invites to arbitrary
  emails**, one of two things needs to happen: (a) get DNS access to
  `healingmindsmatter.org` from IT to add Resend's verification records, or
  (b) verify a different, dedicated domain for this project's sending. The
  `healingmindsmatter.org` domain entry in Resend was left as-is
  (unverified/pending) — no action taken on it either way, per an explicit
  decision with the user.
  **2026-09-16 — switched from Resend to SendGrid, arbitrary-recipient limitation
  resolved**: DNS access to `healingmindsmatter.org` still wasn't available, so
  instead of domain verification, switched providers to one supporting
  **Single Sender Verification** (proves ownership of one email address via a
  confirmation-link click — no DNS records needed at all). Verified
  `jayani@ensiz.com` as a SendGrid Single Sender, then re-pointed Supabase's
  SMTP config to SendGrid's relay (`smtp.sendgrid.net:587`, `smtp_user:
  "apikey"` literally, `smtp_pass` = a Mail-Send-scoped SendGrid API key,
  `smtp_admin_email: jayani@ensiz.com`) via the same `PATCH /config/auth`
  Management API call as before — same all-fields-in-one-request gotcha
  applies. **This removes the single-recipient restriction**: Single Sender
  Verification allows sending to any recipient, not just the verified
  address itself (unlike Resend's `onboarding@resend.dev`, which only ever
  delivered to the Resend account owner's own inbox). User confirmed a real
  test invite to a non-`ensiz.com` address was sent and received. Rate limit
  (40/hour) and `smtp_max_frequency` (60s between sends to the same address)
  carried over unchanged from the Resend setup.
  **Also fixed while verifying this**: `@supabase/auth-js`'s
  `AuthRetryableFetchError` (thrown for 5xx-class invite failures) sets
  `.message` to the raw JSON-stringified response body — literally the
  2-character string `"{}"` for this project, since that error class doesn't
  parse the response body's `msg`/`error_code` fields. Both `createChampionAction`
  and `createGatekeeperAction` were relaying that unhelpful literal straight
  to the UI as the error message. Extracted a shared `describeInviteError()`
  helper (`lib/invite-errors.ts`) that detects this useless-message case and
  substitutes a real explanation instead; both actions now use it. Verified
  the fix live for both Champions and Gatekeepers, and confirmed (via direct
  DB query after several forced failures) that a failed invite never leaves
  behind an orphaned `auth.users` or `profiles` row.
  **On HTTP status codes**: Next.js Server Actions always return `200` at the
  transport layer for the form's POST request regardless of whether the
  action returns `{success}` or `{error}` — the actual outcome travels inside
  the RSC response body that `useActionState` unpacks into form state. This
  is intentional Next.js behavior (a non-2xx/thrown response would trigger
  Next's crash-style error boundary instead of the in-form error banner), not
  a bug — don't mistake a `200` in the Network tab for a sign that an error
  wasn't actually caught.
- **2026-09-07 fix**: `middleware.ts`'s authenticated-user redirect (hit
  `/login` or `/forgot-password` while already signed in) was cloning the
  *full* incoming URL and only overwriting `.pathname`, so any dangling query
  string (e.g. `?error=link_expired` from an already-used reset link opened
  in a tab where the user happens to already be logged in) silently rode
  along to the dashboard, where it's never read/displayed — the intended
  "your link has expired" message was lost in that specific edge case. Fixed
  by constructing a clean `new URL(destination, request.url)` instead of
  cloning. Not a security issue (RLS/session state was always correct), just
  a lost warning message. Re-verified live in both directions.

**Epic 2 — Super Admin Dashboard (Story 2.1)** ✅ (rebuilt 2026-08-12 — see audit note;
live-QA-passed 2026-09-07)
- All 6 spec widgets now actually render on the live page (an 2026-08-12 audit
  found the *previous* "✅" was wrong: the live page rendered a different,
  simpler set of components than the correctly-built ones this log claimed
  were wired in — 2 of 6 elements didn't render at all, using correctly-built-
  but-orphaned widget files instead):
  1. Active Gatekeepers per Club — `BarChartWidget`, sorted descending, hover
     tooltips, View All modal (>10 clubs).
  2. Total Active Champions — KPI tile (top row).
  3. Club Onboarding Progress — `OnboardingWidget` (bar chart, bars driven by
     actual per-period onboarding counts, not a static ratio), This Month
     (default)/Last Month/This Quarter filter visible directly on the widget,
     independent of other widgets.
  4. Club-wise Gatekeeper Count — `StackedBarWidget` (active/inactive
     segments), legend, hover tooltips, View All modal.
  5. Upcoming Events — KPI tile (top row, clickable → /super-admin/events) +
     mini-list of next 3 via `EventsWidget`; Next 7 Days/Next 30
     Days(default)/All Upcoming filter, independent of other widgets.
  6. QPR Certified — KPI tile showing the full `count/total (pct%)` format
     from the spec's own example (was previously just a rounded percentage
     with no total), plus a supplementary donut-ring card.
- Top row is now exactly the 3 KPI tiles the spec's Layout Notes call for
  (#2/#5/#6) — a 4th "total active Gatekeepers" tile that wasn't one of the
  three was removed (redundant with the new #1 chart).
- `components/dashboard/club-onboarding-card.tsx` and `kpi-tile.tsx` (the
  files that were actually live before this fix) are deleted — superseded by
  `bar-chart-widget.tsx`/`stacked-bar-widget.tsx`/`onboarding-widget.tsx`,
  which were already correct and just needed to be imported into
  `app/(dashboard)/super-admin/page.tsx`.
- Active-clubs-only filter on all widgets (this part was already correct).
  Zero-states handled.
- **2026-09-07 bug fix**: the Upcoming Events KPI tile (#5, top row) didn't
  track its own Next 7/30 Days/All filter — the mini-list below it refetched
  correctly on filter change, but the KPI number/caption above stayed frozen
  on the initial 30-day value. Root cause: the two pieces (KPI tile in
  `page.tsx`, mini-list in `EventsWidget`) had no shared state. Fixed by
  lifting the filter/data/pending state into a new `UpcomingEventsProvider`
  context in `components/dashboard/events-widget.tsx`, with the KPI tile and
  mini-list both as consumers.

**Epic 7 — Club Management (Stories 7.1–7.4)** ✅ (re-verified 2026-08-12,
live-QA-passed 2026-09-07 — full deactivate/reactivate cascade re-proven both
live and via direct DB reads on a real test club/champion, including the
"manually-deactivated users are never touched by a club-level action" case;
no bugs found)
- Create club: unique club_code + name, duplicate check, status Active on
  creation, audit log.
- Edit club: name/location/description, audit log.
- Deactivate: cascades is_active=false to all active Champions/Gatekeepers
  (tagged deactivation_reason='club_deactivated', deactivated_club_id set).
  Champion web login blocked with club-inactive message (Gatekeeper login
  blocking can't be verified/isn't applicable — no Gatekeeper mobile app
  exists yet to enforce it in). Audit log lists affected users.
- Reactivate: restores only cascade-tagged users for that specific club;
  manually deactivated users unchanged. Audit log.
- Club list: name, location, status, active-champion **name(s)** (2026-08-12:
  was previously just a count; also shows an amber "No active Champion" flag
  for active clubs with none — see Epic 8 note); search by name, filter by
  status.
- Club detail: full info card + Champions table + Gatekeepers table, plus the
  same persistent "No active Champion" flag (2026-08-12).

**Epic 3 — Profile Management (Story 3.1)** ✅ (fixed 2026-08-12,
live-QA-passed 2026-09-07, rebuilt to Figma + real Change Password modal
2026-09-15 — see below)
- View own profile: name, email, contact info (phone), role, access level —
  all displayed at /super-admin/profile.
- **2026-08-12 fixes**: "Access level" was a hardcoded string that always
  read "Full system access (Super Admin)" regardless of who was viewing —
  now derived from `profile.role` via a label map. The route also had no role
  guard (unlike sibling `/super-admin/*` pages) — added
  `if (profile.role !== 'super_admin') redirect(...)`.
- Update permitted fields: full_name and phone editable via server action;
  success/error feedback shown inline; audit log written on save.
- Restricted fields: login email and role displayed as read-only inputs
  (bg-gray-50, cursor-not-allowed) with explanatory captions.
- Password change: links to existing /settings/change-password (Story 1.3),
  not rebuilt here.
- Nav: "My Profile" link in the bottom sidebar section (amber active state);
  top-bar name+avatar is a clickable link to the profile page.
- **2026-09-15 — full rebuild to Figma (node `82:23037`, fileKey
  `K1Csx2BjbSmP9NRSDtoEe2`)**: `page.tsx` + `profile-form.tsx` rewritten as a
  4-card layout (Identity, Personal & Account Details, Security & Sign-in,
  Role & Permissions), all real Figma icon assets downloaded to
  `public/icons/`. New migration `20260915060000_add_profile_office_location.sql`
  adds `profiles.office_location TEXT`; the form now also edits `title` (maps
  to Figma's "Job Title" — deliberately not "& Primary Role", since role stays
  read-only everywhere per existing policy) and `preferred_language` (reusing
  the Gatekeeper form's exact en/si/ta labels). Email field gained a real
  `navigator.clipboard` copy button.
  **Fabricated Figma content dropped, not built**: "All Systems Good" badge,
  fake "ADM-00192" admin ID (no ID scheme exists for admins, unlike the real
  `club_code`/`gatekeeper_code`), "Protected" badge, and the entire
  Two-Factor Authentication/TOTP block (no MFA system exists anywhere in this
  app). Figma's password-strength claim ("Strong & Enterprise-grade") was
  replaced with an honest tier computed from `checkPasswordRules` (see Change
  Password note below) — there's no basis for an "enterprise-grade"
  certification claim. Session Timeout shows the real "20 minutes" value as
  **read-only** text (no per-user timeout preference exists to edit).
  Card 4's "Coverage & Out of Office" section is real — queries
  `role_delegations` where `delegator_id` = the current user and reuses the
  exact live-status computation from `delegations/page.tsx`; "Set Out of
  Office" links to the real `/super-admin/permissions/delegations/new` flow.
  Champion/club counts use real `created_at`/active-club-count queries, not
  Figma's hardcoded "14".
- **2026-09-15 — Change Password modal** (Figma node `82:24334`): moved off
  the old standalone `/settings/change-password` page (now a pure `redirect()`
  to preserve old bookmarks) into an intercepting-route modal at
  `app/(dashboard)/super-admin/profile/@modal/(.)change-password/`, using the
  same `layout.tsx` + `@modal` + `ModalOverlay` pattern as Events/Resources/
  Announcements/Gatekeepers. **Deliberately reachable only from within
  `/super-admin/profile`** (header button + Security card button) — not the
  sign-in page, not any global menu. This required removing a pre-existing
  "Change Password" link from `components/dashboard-client-layout.tsx`'s
  global avatar dropdown, which violated that constraint (found via
  `grep -rln "settings/change-password" app components`). A standalone
  fallback page still exists at `/super-admin/profile/change-password` for
  direct navigation/bookmarks — same `ChangePasswordForm` component, no
  `onClose` prop, so it renders a full success screen instead of closing an
  overlay. Reuses the existing, already-audited `changePasswordAction`
  (`actions/auth.ts`) unchanged — only presentation changed. Real
  show/hide toggles, a real password-strength meter (Weak/Fair/Good/Strong,
  computed from how many `checkPasswordRules` checks pass — not Figma's
  fabricated "Enterprise-grade" label), the same 5 live-checked requirement
  rules plus a 6th static "Cannot match last 5 previous passwords" line, and
  the real Session Revocation Guarantee banner (describes the actual
  `signOut({scope:'others'})` behavior from Story 1.3). Figma's "Send
  password change confirmation receipt" checkbox was **dropped** — there is
  no per-request opt-in/out mechanism this could wire to (Supabase's
  password-changed notification is a project-wide toggle, not per-send).
  End-to-end-tested with a throwaway Auth Admin API test account (not the
  real admin login): changed its password through the modal, then logged out
  and back in with the new password to confirm it actually took effect,
  before deleting the test account and all its audit-log/password-history
  rows.

**Epic 8 — Champion Account Management (Stories 8.1–8.4)** ✅ (re-verified 2026-08-12,
live-QA-passed 2026-09-07 — OCC conflict handling and the privilege-escalation
trigger both re-proven live end-to-end; no new bugs found)
- Create: Supabase invite email (welcome + set-password link), duplicate-email
  check, audit log. One club per Champion enforced at data model level (a
  single scalar `club_id` column — structurally impossible to double-assign,
  not an active guard clause, but functionally equivalent to the AC).
- Edit: name/email/phone/club with real OCC (version column, enforced via a
  conditional `UPDATE ... WHERE version = knownVersion` whose affected-row
  count is checked — verified this isn't cosmetic); conflict detected →
  "reload and retry" prompt; email synced to auth.users on change; audit log.
- Deactivate: is_active=false (reason='manual'), club and data preserved,
  audit log. Sole-champion-deactivated warning is now **persistent**
  (2026-08-12: previously only a one-time toast at the moment of
  deactivation, with nothing shown if you navigated away and came back — see
  the Epic 7 club list/detail flag).
- Reactivate: club-active check enforced (blocked if club inactive), current
  club shown with option to reassign before confirming, audit log.
- Champion list: name, club, status; search by name, filter by club or status.
- **2026-08-12**: added a `WITH CHECK`-equivalent DB trigger
  (`protect_profile_privileged_fields`, migration 20260812000000) that pins
  `role`/`club_id`/`is_active`/`deactivation_reason`/`deactivated_club_id` to
  their prior value whenever a non-super-admin updates their own `profiles`
  row — closes a latent privilege-escalation gap in the "champion/gatekeeper
  update own" RLS policies (they had no `WITH CHECK` at all) before any
  Champion/Gatekeeper self-service edit UI gets built.
- Outstanding: email notifications to Champions on Super-Admin-initiated
  edits (8.2 Sc04) and on reactivation (8.3 Sc06) are still not sent — no
  code path exists yet to send them at all. **2026-09-14**: this is no longer
  blocked on "no transactional email provider" (Resend/SMTP is now
  configured, see the Epic 1 note) — it's now purely a missing-code gap, and
  in test mode is further limited by the resend.dev sender only delivering
  to the Resend account's own address (see Epic 1 note for the full caveat).
  **2026-09-16 update**: the resend.dev single-recipient limitation
  referenced above no longer applies — see the Epic 1 2026-09-16 note; email
  can now reach arbitrary recipients via SendGrid. Still purely a
  missing-code gap for these two specific notifications.

**Epic 4 — Resource Management (Stories 4.1–4.2)** ✅ (verified 2026-08-10,
live-QA-passed 2026-09-07 — see fix below)
- Upload: video (file upload or external URL), article (rich-text-ish body
  and/or external link), document (file upload; PDF/Word/PPT/txt), other
  (file or URL) — title/description/category/publication_date common fields,
  missing-required-field blocked with inline error.
- Files stored in private Supabase Storage bucket `resources`
  (migration 20260810000000); `resources.content_url` holds either an
  http(s) URL or a bucket-relative storage path (disambiguated by regex on
  read). Super Admin list generates short-lived signed URLs per row for
  View/Download. RLS on `storage.objects` mirrors the `resources` table:
  super_admin all, champion/gatekeeper read-only.
- Edit: replace file/URL/text, old stored file deleted from bucket on
  replacement. Delete: removes row and any associated stored file.
- **Storage upload gotcha**: uploading the native `File` from a server
  action's `FormData` directly to `admin.storage.from(...).upload()` fails;
  convert via `Buffer.from(await file.arrayBuffer())` first (see
  `actions/resources.ts`).
- **2026-08-12 visual redesign** (list/create/edit pages only — no functional
  change): re-skinned to match `Design/resources-design.html` +
  `resources-design.png`, extracted via computed-style inspection in a real
  browser (the HTML is a self-unpacking "bundled" export — reading it as
  static text shows only a loading shim, it must be rendered). New files:
  `fonts.ts` (Archivo + Manrope, scoped to this section only — the rest of
  the app stays on Plus Jakarta Sans/Inter), `design-tokens.ts` (colors/type
  labels), `resource-type-icon.tsx`, `resource-card.tsx`, `resource-section.tsx`,
  `add-resource-card.tsx`, `stat-tile.tsx`. Resources are grouped into
  card-grid sections by their existing free-text `category` field (not
  `type` — the mockup's categories don't map to our type enum). The mockup
  shows fabricated LMS-style metrics (Active Learners, Completion Rate,
  photo thumbnails, lesson/view counts) that don't exist in this schema —
  per an explicit decision with the user, these were replaced with only
  real, honest data (Total Resources / Published This Month / by-type
  breakdown; a type-colored icon block instead of a photo) rather than
  fabricated or schema-expanded to match. "View all →" on a section is a
  client-side expand toggle (>3 items), not a new page/feature.
- **2026-09-07 bug fix**: editing a file-based resource (Video/Document/Other)
  *without* touching the file or URL field was rejected with "Upload a file
  or provide an external URL." — the edit form only pre-fills the URL input
  when the existing `content_url` is already an http(s) link, so a
  file-backed resource's URL field renders blank, and `validate()` had no
  way to tell "nothing submitted" apart from "clear it." A second, related
  bug: the old-file-cleanup-on-replace only fired when a *new file* was
  uploaded, so replacing a stored file with an external URL instead leaked
  the old file in storage forever. Both fixed in `actions/resources.ts`:
  falls back to the previous `content_url` when nothing new was submitted,
  and cleanup now fires whenever the final content reference actually
  changed (file→file, file→URL, or URL→file alike), not just file→file.

**Epic 5 — Announcement Management (Stories 5.1–5.2)** ✅ (verified 2026-08-10,
live-QA-passed 2026-09-07 — no bugs found; visually rebuilt to match Figma
2026-09-15, see note below)
- Create: title/body/publish_date (date, immediate or future — RLS's
  `NOW() >= publish_date` check makes future-scheduled announcements go
  live automatically with no cron needed) + optional expiry_date (RLS's
  `NOW() < expiry_date` hides it once passed).
- List shows a computed status badge (Scheduled / Active / Expired).
  Edit/Delete both supported.
- **2026-09-15 Figma rebuild**: list and create/edit rebuilt to match the
  current Figma design (`1:3160`/`49:12988` list+modal pair, confirmed
  canonical — no other "Announcements" page frame exists in the file),
  reusing the exact intercepting-route modal pattern from Champions/Resources
  (`app/(dashboard)/super-admin/announcements/@modal/`). Schema gap found and
  closed via migration `20260915020000_add_announcement_metadata_fields.sql`:
  added `priority` (standard/mandatory/urgent), `audience`
  (all/champions/gatekeepers/specific_clubs), and `status` (draft/published)
  enums — the create modal's Priority, Target Audience, and Save-as-Draft
  fields had no backing columns before this. "Specific Cohort" audience
  reuses the existing `club_id` column for a single targeted club (not a new
  join table — Figma's plural "Selected clubs" wording was scoped down to
  one club per an explicit decision with the user, matching the
  single-club-per-Champion model used everywhere else). The old "Super-Admin
  announcements are always platform-wide (`club_id = NULL`)" rule from the
  original build no longer holds now that Specific Cohort exists — `club_id`
  is set whenever `audience = 'specific_clubs'`, null otherwise. The Figma
  modal's "Assigned Club"/"Institutional Title"/"AUTO-FORMAT" badge and a
  leftover "Deactivate Club" footer button were confirmed (via matching node
  IDs) to be copy-paste leftovers from the Add Champion modal, not real
  Announcement fields — dropped, same discipline as the AUTO-FORMAT badge
  dropped from the Resources card redesign.
  **Explicitly excluded — no real backing data possible**: the Figma list
  view also depicts a full read/acknowledgment-tracking system (per-item
  "X of Y Gatekeepers read", "Send Reminder to Unread", "View Detailed
  Analytics"). This was deliberately not built — it would require real
  Gatekeepers and Champions actually reading and acknowledging
  announcements, which needs a Gatekeeper mobile app and Champion UI that
  don't exist yet (see "Not started yet" below). Building the progress bars
  without that would mean fabricating engagement numbers. Tracked as a
  future gap alongside the existing "announcement read tracking — deferred"
  backlog item, not fixed.
  **Champion/Gatekeeper visibility caveat (mirrors the Resources
  visibility/status caveat from Epic 4)**: `audience`, `priority`, and
  `status` are Super-Admin bookkeeping only right now — there is no
  Champion or Gatekeeper-side screen anywhere that reads or filters by
  these fields (or even lists announcements at all), since Champion-side UI
  is still platform-wide blocked. Setting an announcement's audience to
  "Champions" or "Gatekeepers" today does not restrict who can technically
  see it anywhere in the app; it is metadata for when that UI exists.
  End-to-end tested live: create (all 3 audience types, all 3 priorities,
  both Draft/Publish paths), edit (including switching audience to Specific
  Cohort and status to Published), and delete — each verified via direct DB
  query against a `TEST-ANNOUNCEMENT-*`-named record, then fully cleaned up.

**Epic 9 — Permission Management (Stories 9.0–9.4)** ✅ (verified 2026-08-11,
live-QA-passed 2026-09-07, Sc07 screen built and live-tested 2026-09-07 —
fully complete, zero known gaps)
- User stories doc was updated mid-project: Epic 9 grew from 2 stories to 5
  (9.0 Effective Permission Resolution, 9.1 Role Defaults, 9.2 Individual
  Exceptions, 9.3 Permission Groups, 9.4 Temporary Role Delegation). Full
  data-model plan (migration 20260811000000) was written and approved before
  any code — see `.claude/plans` history for that session if needed.
- New tables: `permission_groups`, `group_members`, `group_permissions`
  (row presence = has-an-opinion; `is_enabled` = Allow/Deny; no row = Not
  Set — the group UI is a 3-way Not Set/Allow/Deny control, not a checkbox,
  specifically so 9.0's deny-overrides scenario is reachable), `role_delegations`
  (no status column — Scheduled/Active/Expired is always computed live from
  `starts_at`/`ends_at`/`ended_early_at` + the delegator's `profiles.is_active`,
  same pattern as `announcements`).
- Resolution engine: `public.effective_permission(user_id, permission)` —
  precedence Individual (`role_overrides`) > Group (`group_permissions`,
  deny-overrides on conflict) > Role default (`permissions`) — returns which
  layer decided, for the UI. `public.effective_permission_with_delegation()`
  wraps it: additive OR against the delegator's own effective result while an
  active `role_delegations` row exists; never restricts the delegate's own
  access. `public.list_effective_permissions()` is the one-call variant for a
  per-user permissions view. All SECURITY DEFINER with an internal
  self-or-super_admin guard (verified via a real authenticated-session smoke
  test, not just service-role).
  **2026-09-07 correction**: "for the UI" above is aspirational, not actual —
  the 2026-09-07 QA pass confirmed via SQL that all three resolution
  functions compute perfectly correct results (9.0 Sc01–06 all PASS), but a
  repo-wide grep found **zero** callers of any of them from any page or
  server action. There is no screen anywhere that shows a user's effective
  permission *and which layer decided it* (9.0 Sc07) — a Super Admin can
  currently only reconstruct this by manually cross-referencing the Role
  Defaults/Groups/Individual Exceptions tabs by hand, which is exactly the
  manual work this story exists to eliminate. This is a missing UI feature,
  not a resolution-engine bug — the engine itself is solid and ready to be
  wired up whenever this screen gets built.
  **2026-09-07 — Sc07 built**: added
  `app/(dashboard)/super-admin/permissions/effective/[userId]/page.tsx`, a
  read-only screen that calls `list_effective_permissions(p_user_id)` (the
  function's own migration comment already named this exact screen as its
  purpose) and renders one row per permission — effective Allow/Deny, which
  layer decided it (Individual/Group/Role Default, color-coded pills
  distinct from the Allow/Deny pills), and a plain-language "why" derived
  from `source_detail` (e.g. "Denied by group: X" / "Set directly for this
  user" / "Inherited from the Champion role default"). Reused the existing
  table/pill conventions from the Role Defaults and Group Detail pages
  exactly, so it looks native to the section rather than bolted on. Entry
  point: a "View Permissions" button on the Champion detail page
  (`champions/[id]/page.tsx`, next to Edit/status controls) — the only
  place a Super Admin currently looks at "a specific user" in this app,
  since no Gatekeeper detail page exists yet. Deliberately scoped to just
  Individual/Group/Role per the AC's own wording — delegation-borrowed
  access (9.4) is a separate concept with its own scenario coverage and
  isn't part of this specific screen. Live-tested end-to-end against a
  temporary test Champion with all three source layers actually present
  (an individual override, a group deny, and several role-default
  fallbacks) — every row's effective result, layer, and why-text matched
  expectations exactly; the not-found case (deleted/invalid user id) also
  correctly 404s. `npx tsc --noEmit` passes clean. All test data deleted
  and reconfirmed clean via direct DB query afterward.
  **2026-09-07 bug fix**: the "End Now" manual-delegation-end audit log
  (`role_delegation.ended_manually`) wrote no `details` at all — no
  delegator/delegate/period — unlike every other delegation audit event.
  Fixed in `actions/permissions.ts` (`endDelegationAction`) to fetch and
  embed those fields before logging.
- Deactivating a Champion (manual, or cascaded via club deactivation) now also
  ends any `role_delegations` row where that user is the delegator
  (`endDelegationsForDeactivatedUser` in `actions/permissions.ts`, called from
  `actions/champions.ts` and `actions/clubs.ts`) — the access itself already
  vanishes live via the `is_active` check in the resolution engine; this just
  stamps `ended_reason='delegator_deactivated'` and writes the audit row.
- Decisions made explicitly with the user before building: group deny needs
  the 3-way control (not allow-only); delegation "activated"/"expired" are
  NOT synthesized as audit events (live status badge only, no cron in this
  app — same limitation already accepted for announcements); 9.4 is
  Super-Admin-managed for any user this phase, no Champion self-service flow.
- **Found and fixed a pre-existing bug while testing**: the Champions list/
  detail/reactivate pages' `profiles.select(...clubs(...))` embed was
  ambiguous (`profiles` has two FKs to `clubs`: `club_id` and
  `deactivated_club_id`) and PostgREST silently errored, which the pages
  swallowed by only destructuring `{ data }` — so it rendered as an empty
  "no champions yet" list instead of surfacing the error. This had been
  latent since Epic 7/8 shipped; never caught because no real champions with
  a `club_id` existed in the DB until Epic 9 testing created some. Fixed by
  disambiguating to `clubs!profiles_club_id_fkey(...)` in all three files.
- **2026-09-15 — visual-only restyle**: no Figma design exists anywhere in
  the file for the Permissions section (confirmed via a full fresh re-fetch
  of the entire Figma document) — restyled to match this app's own
  established visual language instead, per an explicit decision with the
  user. Covered every Permissions screen: Role Defaults, Individual
  Exceptions (list/new), Groups (list/detail/new), Delegations (list/new),
  and the Effective Permissions view — card containers, `#F4AC1E` buttons,
  the segmented pill-tab sub-nav, and the inline "Sure? Yes/No" confirm
  pattern already used elsewhere (e.g. Champion deactivation). Purely visual:
  no query logic, table structure, or business rules changed; `statusOf()`,
  `whyText()`, and all RPC calls preserved verbatim. The Permissions layout
  also gained a real page-level header (title + description) above the
  sub-nav, which it previously lacked entirely.
  **Bug found and fixed during this restyle**: `group-archive-button.tsx`'s
  confirm-form lost its `<input type="hidden" name="group_id" value={groupId}>`
  in the process of restyling the surrounding markup, so `archiveGroupAction`
  received no `group_id` and silently no-opped (`.eq('id', null)` matches
  nothing) while the UI still showed a success redirect — archiving a group
  looked like it worked but never actually set `is_active=false`. Caught by
  archiving a real test group and checking `permission_groups.is_active` via
  direct DB query; fixed by restoring the hidden input. All other restyled
  confirm-forms (`exception-revoke-button.tsx`, `group-member-remove-button.tsx`,
  `delegation-end-button.tsx`) were diffed against `HEAD` afterward and
  confirmed to have kept their hidden inputs intact — this was an isolated
  mistake, not a pattern.
- **2026-09-15 (later the same day) — a Figma design for Permissions was
  found after all; the note directly above ("no Figma design exists anywhere
  in the file for the Permissions section") was wrong**. A fresh, deeper pull
  of the Figma file surfaced a real, detailed Permissions design under node
  `106:26108` (file `K1Csx2BjbSmP9NRSDtoEe2`) — internally named "super admin
  profile" (a copy-paste artifact, the same mislabeling pattern seen
  elsewhere in this file), verified as genuine Permissions content and not a
  decoy before use. Only the **Role Defaults** page was rebuilt a second time
  to match it. Individual Exceptions, Groups, Delegations, and the Effective
  Permissions view keep the app's-own-design-language restyle from the note
  above — no Figma design exists for those specifically, that part of the
  original note was correct.

  **New data model** (migration `20260915070000_add_permission_catalog.sql`):
  adds `permission_catalog` (key, label, description, category,
  display_order, restricted_to; RLS: super_admin all, authenticated read) to
  back the design's categorized, human-readable card UI — the raw
  `permissions.permission` TEXT keys had no label/description/category
  before this. Renames 7 existing permission keys in place (role_overrides
  and group_permissions carry forward automatically, same TEXT column):
  `manage_gatekeepers`→`manage_gatekeepers_add`,
  `manage_events`→`schedule_qpr_sessions`,
  `create_announcements`→`publish_club_announcements`,
  `view_resources`→`download_facilitator_kits`,
  `register_for_events`→`register_for_training`,
  `view_announcements`→`view_club_announcements`,
  `view_events`→`view_event_calendar`. Seeds 6 new champion-role permissions
  the design introduced with no prior equivalent: `bulk_import_gatekeepers`,
  `edit_gatekeeper_profiles`, `deactivate_gatekeepers`,
  `mark_attendance_badges`, `delete_announcements`, `upload_clinical_guides`.
  Gatekeeper-role rows were deliberately *not* seeded for
  `edit_gatekeeper_profiles`/`mark_attendance_badges` (the design treats
  these as champion-only concepts) — the UI treats a missing role+permission
  row as a real, honest "OFF / not set" state rather than crashing or
  defaulting to a fabricated value.

  **`restricted_to` mechanism**: a nullable TEXT column on
  `permission_catalog`. When set (today, only `upload_clinical_guides` →
  `'super_admin'`), the toggle for that permission renders locked and
  disabled for every non-matching role in this UI, regardless of whatever is
  actually stored in `permissions` for that role — champions and
  gatekeepers can never enable it from here no matter what.

  **What was built**: `app/(dashboard)/super-admin/permissions/page.tsx`
  now renders — a real, conditionally-rendered delegation banner (shows only
  when `role_delegations` has a currently-active row, using the same live
  status computation as the Delegations page; hidden today since none
  exist); a Champion/Gatekeeper role switcher with real enabled-permission
  counts (sum of `is_enabled=true` across the 10 catalog-shown keys for that
  role); four grouped permission-module cards driven by `permission_catalog`
  filtered to `display_order <= 10` (the 3 renamed-but-hidden baseline keys
  — `register_for_training`, `view_club_announcements`,
  `view_event_calendar` — share category *names* with the shown modules, so
  filtering had to be by `display_order`, not category, to avoid silently
  pulling them into this view) joined with `permissions` and
  `role_overrides`, each toggle reusing the existing `RoleDefaultToggle`
  (Story 9.1) — with a genuinely locked, disabled toggle for
  `upload_clinical_guides`; a real "N User Exception Active" (amber) / "N
  User Restricted" (red) chip per item computed from `role_overrides`
  scoped to the currently-selected role's users (falls back to "Standard
  Default" gray when no override exists); a right sidebar with three
  real-data widgets — a live user search
  (`searchAssignableUsersAction` in `actions/permissions.ts`, active
  champions/gatekeepers only, computes each match's real allowed/total count
  via the existing `list_effective_permissions` RPC and links to the
  existing Effective Permissions page rather than re-implementing
  resolution logic a second time), an Active Exceptions list (real
  `role_overrides` joined to `profiles`/`clubs`, GRANTED/RESTRICTED chips,
  real "N Overrides" badge), and a Custom Groups summary (real
  `permission_groups` + `group_members` count); and a footer with the real
  active-user count for the selected role. New
  `app/(dashboard)/super-admin/permissions/audit/page.tsx` ("Audit History"
  tab, added to `permissions-sub-nav.tsx`) reads `audit_logs` for
  `permission%`/`role_delegation%` actions. Real Figma icon assets
  downloaded to `public/icons/permissions/` (18 files) rather than
  hand-drawn.

  **Deliberate deviations from the Figma mockup**, per this app's
  no-fabrication rule:
  1. Toggle color kept as the app's existing amber (`#F4AC1E`, from the
     pre-existing `RoleDefaultToggle`) rather than Figma's navy
     (`#022C51`) — reusing the one established toggle component/token used
     everywhere else rather than forking a second toggle style for one page.
  2. Figma's save/status bar has "Reset to Defaults" and "Save Changes"
     buttons; both dropped. Every toggle here already saves instantly on
     click (no pending/unsaved state exists to "Save"), and there's no
     stored factory-default snapshot to "Reset" to (the migration's seed
     values were a one-time INSERT, not a restorable baseline) — adding
     either button would have meant fabricating behavior. Kept only the
     real "saves automatically, applies to N active {role}s" status line.
  3. Figma shows a second filter-pill row above the role switcher (`All
     (48)`, `Role Permissions`, `Standard Defaults`, `Individual
     Exceptions`, `Active`, `Custom Group`, `Group`, `Role Delegation`,
     `Audit History`) filtering the module-card list in-page. Interpreted
     this as the existing page-level sub-nav instead (added an "Audit
     History" tab to it) rather than building a second, separate in-page
     filter system: the literal "(48)" count is an unbacked Figma
     placeholder, several labels look like duplicated/decoy content
     (`Group` vs `Custom Group`), and the concepts these pills map to
     (exceptions, groups, delegations, audit) already have full, real,
     dedicated pages built in Epic 9 — building parallel in-page filtering
     would have meaningfully duplicated that functionality without clear
     added value.
  4. Sidebar "Check Access for a User" shows a real allowed/total count and
     a link to the full Effective Permissions breakdown, instead of
     Figma's fabricated inline diff sentence ("Full Champion baseline
     access + **Bulk CSV Upload** approved...") — that sentence isn't a
     real computed value anywhere in the schema; reusing the existing
     Effective Permissions page for the actual per-permission breakdown
     avoided re-implementing the resolution engine's explanation logic a
     second time.

  **Live-tested end-to-end (2026-09-15)**: toggled
  `champion`/`bulk_import_gatekeepers` on then off via the UI, confirmed
  both writes directly in the DB, confirmed both changes appear in the new
  Audit History tab; created a throwaway test Champion
  (`zz-test-permissions-qa@example.com`, deleted afterward via the Auth
  Admin API) plus a temporary `role_overrides` row, `permission_groups`/
  `group_members` row, and `role_delegations` row to prove the Active
  Exceptions widget, Custom Groups widget, per-item exception chip,
  delegation banner, and user-search widget all render real non-empty data
  correctly — then deleted every row and reconfirmed a clean baseline via
  direct DB query. **Bug found and fixed during this pass**:
  `RoleDefaultToggle` instances weren't keyed per role, so switching the
  Champion/Gatekeeper tab left stale toggle visuals on screen from the
  previous role until a full page reload, even though the header counts
  were already correct (server-computed, so always fresh) — fixed by
  keying each toggle `key={role}` inside `module-card.tsx` so React
  remounts it (and re-reads `initialEnabled`) on every role switch.

  **Consuming-UI status of the 6 newly-seeded champion permissions** — none
  are enforced by any real Champion-side UI yet (Champion-side screens
  remain blocked per "Not started yet" below), but 3 of the 6 already have a
  genuine Super-Admin-side equivalent a future Champion screen could mirror:
  - `manage_gatekeepers_add`, `edit_gatekeeper_profiles`,
    `deactivate_gatekeepers` — Gatekeepers CRUD already exists, but only on
    the Super Admin side (`/super-admin/gatekeepers`); no Champion-side
    gatekeeper management screen exists yet to gate with these permissions.
  - `bulk_import_gatekeepers`, `mark_attendance_badges`,
    `upload_clinical_guides` — zero real consuming UI anywhere in the app,
    Super Admin or Champion side. These are fully real in the resolution
    engine and toggleable on this page, but nothing currently checks them
    before performing the corresponding action, because that action (bulk
    CSV import, attendance/badge marking, clinical-guide upload) doesn't
    exist as a feature anywhere yet.

**Epic 6 — Event & Calendar (Story 6.1)** ✅ (verified 2026-08-11,
live-QA-passed 2026-09-07 — no bugs found; visually rebuilt to match Figma
2026-09-15; **Super Admin event creation added the same day as an explicit,
deliberate Story 6.1 spec deviation — see below, this is no longer
view-only**)
- Super Admin calendar at `/super-admin/events`: Month grid, Week grid, and
  Agenda (list) view, toggled and fully driven by URL params
  (`view`/`year`/`month`/`day`/`club`/`type`/`q`/`event`) rather than local
  component state, specifically so opening/closing an event's detail
  (Scenario 04) always returns to the exact same calendar position without
  needing separate client-side state to track it.
- Event tiles color-coded by type (`event-type.ts`). `is_cancelled=true`
  events excluded from all views (Champions cancel rather than delete
  events, per Epic 6/checklist 2.4 — matches the existing dashboard
  `EventsWidget` convention).
- Detail view is a centered modal (backdrop-click or × closes) — title,
  type, date/time (range if `ends_at` set), venue, club, facilitator,
  max participants, and link (all "Not specified" / omitted if unset),
  description (omitted if empty). Still no edit/delete controls on this
  view (only creation was added — see below).
- Filter by club, event type, and free-text search (title/venue), combinable,
  via plain `<select>`s/`<input>` that push URL updates.
- **2026-09-15 Figma rebuild, visual only (first pass)**: re-checked "Phase 1
  - Super Admin User Stories.md" Story 6.1 before touching anything, which at
  the time explicitly stated event creation/editing is Champion-only in
  Phase 1 and Scenario 06 requires "no edit or delete controls shall be
  shown." Per an explicit decision with the user, the Figma "Add Event"
  modal was initially **not built** on this basis — only the read-only
  calendar (`32:771`, confirmed canonical) was restyled: colors/spacing/
  typography, legend relabeling ("QPR Certification Cohort" / "Awareness
  Program" / "Clinical & Skills Workshop" — copy only, same underlying
  `event_type` enum values), and the day grid switched from **Monday-start
  to Sunday-start** weeks to match the design's SUN–SAT header
  (`date-grid.ts`). Also added in this pass: an honest "Updated `<time>`"
  header badge (replacing Figma's fabricated "Live Sync Active," which had
  no real sync system behind it) and a genuinely new **Week view** (the app
  only had Month/List before; "List" was renamed "Agenda" to match Figma's
  label). Figma's "Upcoming QPR Certifications" section (facilitator names,
  seat-capacity bars, "Manage Cohort Capacities", an accreditation badge)
  was excluded entirely — no facilitator/capacity schema existed at the
  time, and it duplicated the Dashboard's real Upcoming Events widget.
- **2026-09-15, later same day — "Schedule New Event" popup explicitly
  requested and built, overriding Story 6.1**: the user asked for the
  Figma "Add Event" modal (`54:18600`, confirmed real — internally
  mislabeled "Create New Club" from copy-paste, same artifact pattern as
  every other modal found this session) to actually be built and wired to
  real Super Admin event creation. This was flagged and explicitly
  confirmed before building, since it directly reverses the "view-only,
  no edit/delete" decision made earlier the same day and goes beyond Story
  6.1's documented Phase 1 scope. **Two schema gaps found and closed** via
  migration `20260915030000_add_event_metadata_fields.sql`: added nullable
  `facilitator` and `virtual_link` TEXT columns (both required/shown in the
  Figma modal, neither existed before). Both fields are now also surfaced
  in the read-only detail view for consistency (data collected on create
  should be visible somewhere). One thing dropped as fabricated even after
  the override: a "Notify Club Members & Champions — send instant calendar
  invitation" toggle and the button's "& Notify" wording — there is no
  notification/calendar-invite dispatch system anywhere in the app, so the
  toggle would have been a no-op; removed the toggle and renamed the button
  to plain "Schedule Event" per an explicit decision with the user.
  **RLS gap found and fixed**: `events` had only ever had a Champion INSERT
  policy (`events: champion insert`, scoped to `club_id = current_user_club_id()`)
  — the first live create attempt as Super Admin failed with "new row
  violates row-level security policy for table events." Added migration
  `20260915040000_add_super_admin_event_insert_policy.sql` with a
  Super-Admin-scoped INSERT policy. Deliberately INSERT-only — no
  Super Admin edit/delete UI was built in this pass, so no UPDATE/DELETE
  policy was added either.
  End-to-end verified live: seeded 5 `TEST-EVENT-*`-named events across all
  4 real event types for the visual-redesign pass (confirmed Month/Week/
  Agenda views, filters, and detail modal against real data via direct SQL
  insert), then separately created one real `TEST-EVENT-ScheduleModal`
  through the actual modal UI end-to-end (all fields, including the new
  facilitator/link, persisted correctly per direct DB query) before
  deleting all test data and confirming 0 events via direct DB query.
- **2026-09-15 — "Upcoming QPR Certifications" section added, reduced/real
  version only**: this section (below the calendar) was originally excluded
  during the visual-redesign pass above because `facilitator` didn't exist
  yet and it appeared to duplicate the Dashboard's Upcoming Events widget.
  Re-evaluated per an explicit user request: the Dashboard widget
  (`components/dashboard/events-widget.tsx`) covers *all* event types in a
  compact 3-item KPI-card format — different scope and density than a
  QPR-only highlight strip — so it wasn't reused directly, but the query
  shape (`is_cancelled=false`, `starts_at > now()`, ascending) is the same
  pattern, just filtered to `type='qpr_session'`
  (`upcoming-qpr-section.tsx` + the new query in `page.tsx`, limit 4 with a
  real "View All N" count linking to Agenda view pre-filtered to QPR).
  `facilitator` is now real (added in the `20260915030000` migration above
  for "Schedule New Event"), so title/facilitator/venue/club/date-time are
  all genuinely backed. Three things Figma showed were deliberately **not**
  built, per an explicit decision with the user — no new migration was
  written for any of them:
  - **Seat-capacity bars** ("28/30 Seats", "2 seats remaining") — shown
    instead as a plain "Capacity: N" pill from the real `max_participants`
    cap, with no registered/enrolled count. There is no registration/RSVP
    table anywhere in the app, and — same blocker as the Announcements
    read-tracking exclusion — even adding one now would show a permanent
    honest "0 of N" until a Champion/Gatekeeper-side registration flow
    exists to populate it. Flagged as a future item, not built.
  - **"Manage Cohort Capacities" action** — dropped entirely; nothing real
    to manage without the registration table above.
  - **"Accredited with National QPR Institute Guidelines" badge** — dropped
    permanently, not deferred as a schema gap. This isn't missing data, it's
    an organizational compliance/certification claim — not something this
    app should assert on the org's behalf regardless of what schema exists.
  End-to-end verified live: seeded 2 `TEST-EVENT-QPR-Upcoming*` sessions
  (with real facilitator names and capacities), confirmed the section
  renders correctly with real data and that "View All" correctly stays
  hidden when the total matches what's already shown; confirmed the section
  renders nothing at all (not an empty-state placeholder) when there are no
  upcoming QPR sessions; then deleted all test data and confirmed 0 events
  via direct DB query.

### 2026-08-12 full-platform audit
All 9 Super Admin epics were independently re-audited scenario-by-scenario
against the live code (5 parallel research agents, one per Epic 1/2/3/7/8;
Epics 4/5/6/9 were already fresh from this same week and re-checked directly)
before being marked complete. This caught several real bugs that earlier
"✅ verified" notes had missed or gotten backwards — see the per-epic notes
above for what was actually wrong and how it was fixed. Lesson for future
sessions: a "✅" in this log reflects what was true *at the time it was
verified against real test data* — an epic having shipped and been reviewed
once doesn't mean a later change didn't quietly break it (Epic 2's dashboard
is the clearest example: the log claimed a fix had landed, but the live page
was actually using a different, earlier draft of the components). When in
doubt, re-verify against current code rather than trusting the log.

Genuinely still outstanding after this audit (not fixed, by design — see
per-epic notes for why):
- Transactional email (Resend/SendGrid or similar) is not configured anywhere
  in this app. This blocks: password reset/change confirmation emails (1.2
  Sc09, 1.3 Sc08), and Champion notification emails on Super-Admin-initiated
  edits/reactivation (8.2 Sc04, 8.3 Sc06). All affected UI copy has been
  corrected to not claim an email was sent when none was.
  **2026-09-14 update**: the "not configured anywhere" half of this is now
  resolved — see the Epic 1 2026-09-14 note above for what changed (Resend
  SMTP live, in test mode pending a verified production domain). 8.2
  Sc04/8.3 Sc06 remain blocked, but now purely on missing code to send those
  specific notifications, not on missing infrastructure.
- Gatekeeper login-blocking on club/account deactivation (7.3 Sc01, the
  Gatekeeper half) can't be enforced or verified — there's no Gatekeeper
  mobile app or API surface in this repo at all yet for it to apply to.

### 2026-09-07 full QA pass — all 9 epics + Non-Functional Requirements
Every acceptance-criteria scenario across all 9 Super Admin epics (~108
scenarios) plus the Non-Functional Requirements section of the Initial
Requirement Document was independently tested live in a real browser against
the running app (not just "code exists" review), using a mix of direct
testing and parallel/sequential subagents each covering one epic. Full
scenario-by-scenario evidence lives in this session's transcript; the
summary below is the durable record.

**Final verification status, epic by epic (answers "is this epic fully done
and verified against its own acceptance criteria" — not "is Phase 1 done"):**

✅ **Fully done and verified, zero gaps** — Epic 2 (Dashboard), Epic 3
(Profile Management), Epic 4 (Resource Management), Epic 5 (Announcement
Management), Epic 6 (Event & Calendar), **Epic 9 (Permission Management,
as of 2026-09-07)**. Every scenario live-tested and passing. (Epic 2 has
two sub-scenarios that could only be code-verified, not pixel-verified
live, because this environment doesn't have >10 clubs or any non-zero
Gatekeeper count to trigger them — not an app defect, just a data-volume
ceiling in this test environment. Epic 9's last gap — Story 9.0 Scenario 07,
a screen showing a user's effective permission and which layer decided it —
was built and live-tested on 2026-09-07; see the Epic 9 note above for
details.)

⚠️ **Functionally complete, with a known and clearly-scoped gap** — Epic 1
(Authentication & Access Control): every scenario passes except that actual
inbox delivery of the two password-changed confirmation emails (1.2 Sc09,
1.3 Sc08) couldn't be independently confirmed (no inbox access in this
session) — the send mechanism itself is correctly configured and working.
Epic 7 (Club Management): the entire Super Admin/Champion-facing
deactivate/reactivate cascade is fully verified, live and via direct
database reads, including the "manually- vs. cascade-deactivated" cascade
distinction — but 7.3 Scenario 01's *Gatekeeper* login-block half remains
unverifiable, because no Gatekeeper mobile app or API surface exists in
this repo yet for it to apply to (tracked separately below, not a Super
Admin defect). Epic 8 (Champion Account Management): all account-management
behavior (create/edit/reassign/OCC-conflict-handling/deactivate/reactivate/
list/search/filter) is fully verified; the two Champion-notification-email
scenarios (8.2 Sc04, 8.3 Sc06) are unimplemented — no code path exists yet
to send them at all. (**2026-09-14**: was blocked on integrating a
transactional email provider — now resolved, Resend SMTP is live in test
mode, see the Epic 1 2026-09-14 note. Remaining blocker is purely missing
code, not infrastructure.)

❌ **Not started at all** — none of these 9 Super Admin epics. Every one has
real, working, live-tested implementation. (The only genuinely not-started
work is Champion-side UI and the Gatekeeper mobile app — see "Not started
yet" below; that work sits outside these 9 epics entirely and is blocked on
user stories that don't exist yet, not on anything left undone here.)

**Per-story result** (PASS unless noted):
- 1.1 Login — PASS (3/3). 1.2 Forgot Password — PASS (bug fixed, see Epic 1
  note above; Sc09 notification now configured but delivery unverified).
  1.3 Change Password — PASS (8/8, including a genuine reuse-prevention test
  using two real non-common passwords back-to-back). 1.4 Session Timeout —
  PASS (auto-logout + correct message verified twice live; "Stay logged in"
  reset verified by code only — remote browser-automation round-trip latency
  in this session consistently exceeded even a 30s countdown buffer before
  the click landed, an environment artifact, not an app issue).
- 2.1 Dashboard — PASS (bug found & fixed, see Epic 2 note above). Two
  sub-scenarios PARTIAL/code-verified-only because they need data volumes
  this environment doesn't have (>10 clubs for the "View All" modal; any
  non-zero gatekeeper count for the stacked-bar hover tooltip) — not fixed,
  not exercisable without mutating shared/real data.
- 3.1 Profile — PASS (3/3), no bugs.
- 4.1/4.2 Resources — PASS (bug found & fixed, see Epic 4 note above).
- 5.1/5.2 Announcements — PASS (5/5), no bugs.
- 6.1 Events & Calendar — PASS (6/6), no bugs.
- 7.1–7.4 Clubs — PASS (18/18, including the full deactivate/reactivate
  cascade and the manually-vs-cascade-deactivated distinction), no bugs.
- 8.1–8.4 Champions — PASS (20/22). The 2 FAILs are Sc04/Sc06 (Super-Admin
  edit/reactivation notification emails) — the same pre-existing
  no-transactional-email-provider gap already logged above, not new.
- 9.0–9.4 Permissions — PASS (24/24 as of 2026-09-07, 2 bugs found & fixed —
  see Epic 9 note above). The resolution engine was proven correct directly
  via SQL against `effective_permission()`/`list_effective_permissions()`
  with controlled role/group/individual test data, including deny-overrides
  across conflicting groups and live re-evaluation with no caching. 9.0
  Sc07 (a screen showing "effective permission + which layer decided") was
  missing when this pass first ran (3 FAILs) and was built + live-tested
  the same day — see the Epic 9 note above for what was built.

**Bugs found and fixed this pass** (all re-tested live after fixing,
`npx tsc --noEmit` clean):
1. `middleware.ts` — dangling query string on the authenticated-user
   auth-page redirect (Epic 1).
2. `components/dashboard/events-widget.tsx` + `page.tsx` — Upcoming Events
   KPI tile didn't track its own filter (Epic 2).
3. `actions/resources.ts` — editing a file-based resource without touching
   the file broke it, and replacing a file with a URL leaked the old file in
   storage (Epic 4).
4. `actions/permissions.ts` — manual "End Now" delegation audit log had no
   `details` (Epic 9).
5. **`middleware.ts` — RBAC/NFR finding, the most significant one this
   pass**: essentially every `/super-admin/*` page had no role guard (only
   Profile did, from the earlier Epic 3 fix), and the shared
   `app/(dashboard)/layout.tsx` never checks role — so a logged-in Champion
   could browse directly into any Super Admin screen (Clubs, Champions,
   Permissions, etc.) just by typing the URL, seeing the real management UI
   (Create/Edit buttons and all). The underlying *data* was always correctly
   scoped by RLS (a Champion only ever saw their own club/own row — this was
   never a data leak), but it's a real, systemic gap against "RBAC must be
   strictly enforced across all platform areas." Fixed centrally in
   `middleware.ts`: any authenticated request to `/super-admin/*` where the
   profile's role isn't `super_admin` (or `/champion/*` where it isn't
   `champion`) now redirects to the user's own dashboard. One change covers
   every current and future page under either route group. Verified live in
   both directions; normal access unaffected.

**Non-Functional Requirements**:
- Security: password hashing PASS (bcrypt), RLS coverage PASS (all 15 public
  tables have RLS enabled, spot-checked policies correctly scope
  Champion/Gatekeeper reads and restrict writes), RBAC — see bug #5 above.
  HTTPS not locally testable (dev server is HTTP-only) but the Vercel +
  Supabase architecture enforces TLS by default in production.
- **New outstanding gap found**: Supabase's Management API confirms
  `pitr_enabled: false` and zero backups configured for this project —
  almost certainly a free-tier limitation (Supabase's free tier doesn't
  include automated daily backups; this needs a paid Pro-or-higher plan).
  Fails the "automated daily backups, 30-day retention" NFR as of today —
  a billing/infrastructure decision, not a code fix, same category as the
  missing transactional email provider above.
- Performance (<3s page load): not cleanly measurable this session — local
  dev-mode compilation + 8+ concurrent QA browser sessions on one machine
  both inflate load times well past what a production/single-user
  measurement would show (~2.7s on an already-compiled route even under that
  load, vs. an initial 11s on a cold compile). Re-measure against a
  production build or the real Vercel deployment before trusting a number.
- Scalability: none of the Super Admin list pages paginate (`clubs`,
  `champions`, `resources`, `announcements` all fetch unbounded) — fine at
  today's tiny data volumes, a real gap against "accommodate growth... "
  once those tables grow into the hundreds/thousands of rows. Backlog item.
- Availability/Compliance/Device Support (mobile): not independently
  testable or not yet applicable — see full per-item notes in this session's
  transcript; none block Phase 1 web launch on their own.
- Device Support (web, non-Chrome): not tested live in this environment
  (only Chrome available); code review found nothing browser-specific.
  Recommend a manual Firefox/Safari/Edge smoke test before launch.

**Environment lessons for future live-QA sessions in this repo**:
- Live-editing a source file (e.g. temporarily shrinking session-timeout
  constants to make a 20-minute wait testable in a live session) can trip a
  one-off Next.js/Turbopack "unexpected response from server" dev-overlay
  error if a request is in flight during the edit/recompile — reproducing
  the same test cleanly afterward (no edit-in-flight) showed no such error.
  Don't mistake this for an app bug; do revert any temporarily-changed
  constants immediately after testing and confirm via `git diff` that the
  file is byte-identical to before.
- This session ran many QA subagents concurrently in the *same* shared
  Chrome profile/browser. Cookies (and therefore the logged-in session) are
  shared across every tab on that origin — logging in as a different user
  (or account role) in one tab silently swaps the session out from under
  every other tab using it. Any test that needs to switch accounts (e.g. an
  RBAC cross-role check) must either wait until no other agent/tab is
  relying on the shared session, or run in total isolation.
- Remote browser-automation round-trip latency in this environment can
  easily exceed 15-30+ seconds between an observed state (e.g. a countdown
  timer reading "13s left") and the next tool call actually executing in the
  browser — don't design live tests around sub-30-second windows; either
  widen the window generously or fall back to code-review confidence for
  that specific interaction, and say so explicitly in the findings.

### Gatekeepers Management (Super Admin) — net-new, no corresponding user story
Built 2026-09-15 per an explicit, deliberate user request — same category of
spec deviation as the Events "Schedule New Event" override above. Before
building, grepped "Phase 1 - Super Admin User Stories.md" for "gatekeeper"
and found nothing resembling a standalone Super Admin Gatekeepers management
story — only dashboard widget specs (Epic 2) and one permission-key example
(Epic 9's `Manage Gatekeepers` row). CLAUDE.md's own "Not started yet"
section (below) already documented "Gatekeeper management" as a **Champion**-
side capability, blocked platform-wide. This section describes a Super
Admin-side directory/CRUD screen built anyway, at `/super-admin/gatekeepers`.

- **Figma**: list+create pair confirmed real via node-ID search (`32:2791`
  "Gatekeepers", `49:14459` "add Gatekeepers" → the actual modal is nested at
  `83:25428`, internally mislabeled "Create New Club" — the same copy-paste
  artifact pattern found in every other modal this session).
- **Schema gap closed**: migration `20260915050000_add_gatekeeper_code.sql`
  adds `profiles.gatekeeper_code` (e.g. "GK-1000"), auto-generated via a
  Postgres sequence + `next_gatekeeper_code()` function — unlike
  `clubs.club_code` (manually typed), this one is truly system-generated and
  read-only in the UI, matching Figma's literal "Auto-generated" caption.
- **No new RLS policy needed** (unlike the Events "Schedule New Event"
  flow, which used the regular authenticated client and did need one):
  `actions/gatekeepers.ts` creates gatekeepers through the **admin
  (service-role) client**, exactly like `createChampionAction` already
  does for Champions — service role bypasses RLS entirely, so the existing
  Champion-only `profiles` INSERT policy was never actually in the way.
- **Fabricated Figma content excluded, same discipline as everywhere else
  this session**:
  - The list view's **"Mobile App Status" column** (Active/Logged in today,
    Pending 1st Login, Deactivated Mobile Access) — excluded entirely. No
    session/login/mobile-device tracking exists anywhere in this app (there
    is no Gatekeeper mobile app in this repo at all).
  - The create modal's **"Send Mobile App Access Link via SMS & Email"**
    toggle, which claimed to dispatch "temporary mobile login credentials
    and crisis escalation toolkit" — no SMS system or crisis toolkit exists.
    Repurposed honestly as a real (test-mode) email invite via the exact
    same `admin.auth.admin.inviteUserByEmail(...)` flow already used for
    Champions (Epic 8) — same `onboarding@resend.dev` test-mode caveat
    applies (see Epic 1). No toggle is shown; the invite is unconditional
    and mandatory, same as Champion creation (a `profiles` row cannot exist
    without a matching `auth.users` row).
  - The modal's leftover **"Deactivate Club" footer button** and **"Save as
    Draft"** option — dropped (Club-modal copy-paste cruft; Gatekeepers have
    no draft concept anywhere else in the app, only active/inactive, same as
    Champions).
- **QPR expiry**: computed server-side as certification date + 3 years
  (`qpr_expiry_date`), matching the Figma banner ("Active for 3 Years...")
  and the existing 90-day "expiring soon" convention used everywhere else in
  the app (Club/Champion detail, Dashboard QPR widget) — no new threshold
  invented.
- **Built**: list page (search by name/email/phone/gatekeeper_code, Club/
  Status/Champion filters, in-memory pagination since status is a computed
  field not a raw column — same pattern as the Champion detail page's
  roster tab), create modal with **Single Gatekeeper** and **Bulk CSV
  Upload (up to 50 rows)** modes (both built per explicit request — CSV
  format: `full_name,email,phone,club_id,certification_date`, processed
  row-by-row with a per-row results summary, not all-or-nothing), a
  simplified detail page (no roster/events tabs — unlike Champions, a
  Gatekeeper doesn't own a roster or events), an edit page, and deactivate/
  reactivate — all by close visual analogy to the equivalent Champion
  screens, since no Figma frame exists for any of these four states.
- **Real infrastructure finding, worth flagging beyond this feature**: while
  testing, direct calls to Supabase's `/auth/v1/invite` for any address
  other than `jayani@ensiz.com` returned a hard `{"code":500,"error_code":
  "unexpected_failure","msg":"Error sending invite email"}` — **not** the
  silent-200-but-never-arrives behavior the Epic 1 2026-09-14 note
  documents. This may mean that note is stale, or something about the
  Resend/SMTP config changed since 2026-09-14. Not independently
  re-investigated further (out of scope for this feature) — worth a fresh
  look before the next real Champion/Gatekeeper invite attempt, since a
  hard failure changes the on-screen behavior too (the create form now
  shows a visible error for non-`ensiz.com` emails, rather than a false
  "success").
  **2026-09-16 resolution**: this was indeed a real, correctly-surfaced hard
  failure (not a stale note) — Resend's `onboarding@resend.dev` genuinely
  rejected sends to any non-`ensiz.com` address with that exact 500. See the
  Epic 1 2026-09-16 note: the project has since switched to SendGrid Single
  Sender Verification specifically to remove this restriction. The one
  actual bug this session surfaced — the create form showing a literal
  `"{}"` for that failure rather than readable text — is also fixed there.
- End-to-end verified live: single-gatekeeper create (all fields including
  `gatekeeper_code` and computed `qpr_expiry_date` verified via direct DB
  query), bulk CSV with one real row (`jayani@ensiz.com`, succeeded) and one
  deliberately-invalid row (missing email, correctly rejected with a clear
  per-row error, batch correctly reported "1 of 2 created" rather than
  failing the whole upload), edit (certification-date change correctly
  recalculated the expiry date), deactivate → reactivate, and the detail
  page — all confirmed against real data, then fully deleted (both the
  Auth Admin API user records and the cascaded `profiles` rows) and
  reconfirmed back to the pre-test baseline (1 super_admin, 0 champions,
  0 gatekeepers) via direct DB query.
- **2026-09-16 — Deactivate/Reactivate brought in line with Champion's popup
  pattern**: Gatekeeper Deactivate previously used its own inline
  confirm-box (no `ModalOverlay`, no blur), and Reactivate was still a full
  page with no `@modal` intercept and an action that ended in `redirect()`
  instead of `return {success:true}` — the same silent-redirect-breaks-modal
  issue Champion Reactivate had. Fixed by extracting a new shared
  `components/deactivation-controls.tsx` (`DeactivationControls`, generic
  over the action's result type) used by **both** `champion-status-
  controls.tsx` and `gatekeeper-status-controls.tsx` — the Champion version
  passes an `extraWarning` callback for its sole-active-champion-in-club
  notice (Gatekeepers have no equivalent, so it's omitted there), everything
  else (popup copy, layout, button styling) is identical by construction
  rather than by copy-paste. `reactivateGatekeeperAction` (`actions/
  gatekeepers.ts`) now returns `{success:true}`; added the matching
  `@modal` intercept at `gatekeepers/@modal/(.)[id]/reactivate/` (mirrors
  Champion's), and `reactivate-gatekeeper-form.tsx` now accepts an optional
  `onClose` the same way the Champion form does. Verified end-to-end with a
  throwaway test Gatekeeper: deactivated and reactivated through the live
  popups, confirmed `is_active`/`deactivation_reason`/`club_id` and both
  audit-log rows directly via the DB (not just the UI) — the hidden
  `gatekeeper_id`/`club_id` fields are correctly wired, no repeat of the
  earlier missing-hidden-input bug — then deleted the test account and its
  audit rows and reconfirmed cleanup. Champion's popup was also re-verified
  live post-refactor (opened, confirmed identical rendering, cancelled
  without submitting — it's the real admin's own account, not a test one).

## Champion Web Portal — built 2026-09-16, branch `feature/champion-web-portal`

The "Not started yet" note below had stood since Sprint 1 ("BLOCKED until
Champion user stories are written by the BA") — that blocker never actually
lifted (no separate Champion user-stories doc exists), but the user
explicitly asked to build the Champion Web Portal directly from the
**Initial Requirement Document**'s "Champion Features" section and
`Phase1 Feature Checklist.md` §2, using the Figma node at `118:30465` as the
design source. Built section by section, same rigor as every Super Admin
epic this session: reuse existing shared components, verify every RLS
scoping claim directly, exclude any Figma content with no real schema
backing, and end-to-end test each section with seeded throwaway data before
cleanup.

**Pre-build scoping** (full findings in this session's transcript): the
Figma "Champions" canvas contains 7 screens (sign-in, dashboard, gatekeeper
directory, resources, announcements, events, profile) — all clearly
produced by copy-pasting the Super Admin mockups and reskinning copy,
**without** re-applying this project's own no-fabrication decisions or
correcting scope down to a single club. Concretely rejected before building
anything: a fabricated onboarding funnel state machine, satisfaction/
attendance percentages, seat-capacity/registration counts, "peer
verification" and monthly "goal" figures, "Live Sync Active" and
Auto-sync-with-Outlook/GCal badges, a "Mobile App Status" column (no
Gatekeeper app exists), and a multi-club Gatekeeper directory view (a
Champion manages exactly one club). The sign-in screen itself was a full
decoy — the app already has one shared, tested login page for both roles.

**Schema fix required before building anything**: Champions already had
read+insert RLS on their own club's Gatekeepers but no UPDATE policy at
all, which would have silently blocked edit/deactivate/reactivate. Added
migration `20260916000000_add_champion_gatekeeper_update_policy.sql`
(`profiles: champion update own club gatekeeper`, scoped identically to the
existing insert policy — both USING and WITH CHECK require
`role='gatekeeper' AND club_id=current_user_club_id()`, so a Champion can
never move a Gatekeeper to a different club).

- **Dashboard** (`/champion`) — KPI tiles (active/inactive/new-this-month
  Gatekeepers, QPR certified %), an active-vs-inactive donut, a QPR
  certification breakdown bar, a 6-month onboarding trend chart, an
  "Onboarding Status" widget, and upcoming/recently-completed club events.
  The "added but not yet logged in" requirement (Gatekeeper dashboard
  element 5) is genuinely real, not fabricated, despite no Gatekeeper
  mobile app existing yet: it reads Supabase Auth's own `last_sign_in_at`
  (set on any invited user's first real authentication) via the admin
  client, so it will already be accurate the moment a Gatekeeper app ships.
- **Gatekeeper Management** (`/champion/gatekeepers`) — full CRUD (list,
  create single + bulk CSV, edit, deactivate/reactivate), scoped to the
  Champion's own club with no club picker anywhere. Deactivate/reactivate
  reuse the exact shared `DeactivationControls` component and
  `ReactivateGatekeeperForm` built for the Super Admin side (not
  duplicated). **Real security gap found and fixed**: `createGatekeeperAction`
  / `createGatekeepersBulkAction` (`actions/gatekeepers.ts`) use the
  service-role admin client, which bypasses RLS — before this fix, *any*
  authenticated caller (not just Super Admin) could submit an arbitrary
  `club_id` with zero server-side check, since no role guard existed on
  this action at all. Added `resolveScopedClubId()`: a Champion caller's
  `club_id` is now always forced server-side to their own club regardless
  of what's submitted; a Super Admin's behavior is unchanged; any other
  role is rejected outright.
- **Events & Calendar** (`/champion/events`) — the same shared
  platform-wide calendar as Super Admin (Month/Week/Agenda), reusing
  `EventsCalendar`/`EventDetailPanel`/`CreateEventForm` directly
  (parameterized with `basePath`/`lockedClub`/`manageClubId` props) rather
  than a second ~700-line implementation. **New capability that didn't
  exist for either role before**: Edit and Cancel an event, scoped to the
  Champion's own club only — added `updateEventAction`/`cancelEventAction`
  to `actions/events.ts`, both using the regular authenticated client so
  the pre-existing `events: champion update club events` RLS policy is
  what actually enforces scoping. **Bug found while testing**:
  `updateEventAction` initially reused `createEventAction`'s `validate()`
  as-is, which requires `club_id` — but the edit form never submits one
  (club is shown read-only), so every edit failed with "Assigned club is
  required." Fixed with a `requireClub` flag on `validate()` rather than
  faking a hidden `club_id` input just to satisfy it.
- **Announcements** (`/champion/announcements`) — title/body/publish-date/
  expiry-date only, matching the requirement's literal scope (no audience/
  priority/draft pickers — Super-Admin-only concepts). **Real scoping gap
  found and fixed**: the Champion insert/update RLS policies require
  `club_id` = the caller's own club on *every* row, but
  `createAnnouncementAction`/`updateAnnouncementAction` only set `club_id`
  when `audience === 'specific_clubs'` — so a Champion's insert would have
  been rejected by RLS outright for any other (Super-Admin-only) audience
  value. Added `resolveAnnouncementScope()`: forces
  `audience='specific_clubs'` + `club_id`=own club whenever the caller is a
  Champion (an honest description, not a fabricated one — the row really
  is single-club), regardless of what the Champion-only form submits (it
  exposes no audience/club picker at all). **Bug found while testing**: the
  edit form's date inputs rendered empty instead of pre-filling —
  `publish_date`/`expiry_date` are TIMESTAMPTZ columns
  (`"2026-09-16T00:00:00+00:00"`), and a native date input's `defaultValue`
  only matches an exact `YYYY-MM-DD` string. Fixed with the same
  `toDateInputValue()` slice(0,10) helper already used on the Super Admin
  side — this class of bug fails silently (empty field, no error), so it's
  easy to miss without actually clicking into the edit form live.
- **Resources** (`/champion/resources`) — read-only browse/preview/
  download of Super-Admin-published resources, platform-wide (not
  club-scoped, per the requirement doc), reusing `ResourceFilters`/
  `ResourceTypeTabs`/`ResourceRow` directly. Added an explicit
  `.eq('status', 'published')` filter on top of RLS as defense-in-depth —
  the `resources: champion read published` policy only checks
  `publication_date <= today`, not `status`, so a still-in-progress draft
  with a past publication date would otherwise be readable.
- **Profile** (`/champion/profile`) — view/update personal details, change
  password, view role/access level. `ProfileForm` and `ChangePasswordForm`
  were already fully role-agnostic and needed zero changes beyond a new
  `profilePath` prop on the latter (defaults to the Super Admin route, so
  that call site is unaffected). The "Role & Access" card shows a **real**,
  live-resolved list of enabled permissions via
  `list_effective_permissions(auth.uid())` + `permission_catalog` labels —
  not a hardcoded capability list like the Super Admin profile's equivalent
  card — reusing the Epic 9 resolution engine's own self-view guard.

**Shared-component changes made to support both roles** (all verified with
a live regression pass afterward — Super Admin behavior unchanged in every
case): `EventsCalendar`/`EventDetailPanel`/`CreateEventForm` gained
`basePath`/`newEventHref`/`manageClubId`/`lockedClub`/`fallbackPath` props;
`AnnouncementCard` gained `basePath`/`canManage`; `ResourceRow`/
`ResourceTypeTabs` gained `basePath`/`canManage`; `ChangePasswordForm`
gained `profilePath`. Also fixed a real pre-existing bug found along the
way: the shared dashboard layout's "My Profile" link was hardcoded to
`/super-admin/profile` for every role (a Champion clicking it was silently
bounced to their own dashboard by middleware) — `ProfileMenu` now takes a
`profileHref` prop, set per-role at the call site.

**Verification discipline**: every section was tested end-to-end with a
dedicated throwaway test club (`ZZ Test Champion Portal Club`), one
throwaway Champion account, and 3–4 throwaway Gatekeepers/events/
announcements covering the certified/expiring/inactive and own-club/
other-club permission boundaries — created via the Auth Admin API and
direct table inserts, confirmed via direct DB queries after every mutating
action (not just UI appearance), and fully deleted (including cascaded
`audit_logs` rows) at the end, reconfirmed back to a clean baseline via
direct DB query.

## Login page — rebuilt to updated Figma, responsiveness fix — 2026-09-17

Figma's login frame (node `1:22`, section `1:21` "sign in", file
`K1Csx2BjbSmP9NRSDtoEe2`) had been revised since the original 2026-09-16
`feature/login-redesign` build. Checked for the decoy/duplicate-frame issue
that's bitten this session before (mislabeled/copy-pasted modals found
under Champions, Clubs, Gatekeepers, Announcements, Permissions) — a full
metadata dump of the file's only page found exactly one "sign in" section
and one "Login" frame, so node `1:22` is confirmed current and non-decoy.
Its inner content nodes carry a mix of old (`1:xx`) and much newer
(`130:xx`, `128:xx`) IDs, confirming this frame really was edited in place
rather than being a stale cached reference.

**What changed and what was rebuilt** (`app/(auth)/login/login-form.tsx`):
labels/input text/checkbox/"Keep me signed in"/"Forgot Password?" all went
from 16px to 14px; the heading went from `font-extrabold` responsive
28→38px to a flat `font-black` 34px; the subtitle now matches at 18px; the
submit button dropped its responsive up-scaling and now sits at a flat
16px/16px-padding; the checkbox shrank 22px→18px; form-section gaps were
restructured to match the new spec exactly (24px between the two fields,
9px down to the checkbox/forgot row, 60px down to the submit button,
replacing the old uniform gap). Figma also added a password
show/hide-eye icon that didn't exist on the live page before — added,
reusing the existing `/icons/pw-eye.svg` / `pw-eye-off.svg` pair already
established by the Change Password modal rather than pulling in Figma's
own `basil:eye-closed-outline` asset as a new icon file.
**Deliberately not copied from Figma**: the heading text itself
("Login"/"For Super Admin" in the current Figma copy) — left as "Sign
in"/"For Super Admins and Champions.", since the Champion Web Portal
means this is genuinely a shared two-role login page now, not a
Super-Admin-only screen; Figma's copy predates that and was never
accurate even before this update.

**Illustration image** (`public/images/login-illustration.png`): re-cropped
from a fresh Figma screenshot export of the whole `1:22` frame (the
composition — tagline text, logo badge, photo/blob collage — changed
enough between revisions that patching the old asset wasn't an option).
The frame's own outer 30px corner radius bled through as small gray
corner-artifact triangles on the flattened PNG export (Figma renders the
canvas-background color outside a rounded frame's corners rather than
transparency) — masked those out with a matching rounded-corner alpha mask
before committing the new asset, rather than shipping the export as-is.

**Responsiveness bug (the actual reason this needed more than a copy-paste
image swap)**: `AuthIllustrationPanel` was a plain `flex-1` box holding the
image at `object-cover object-top` — at any viewport where the panel's
available aspect ratio drifted far enough from the image's native 711:900
portrait ratio (mainly short-height laptop viewports), object-cover was
forced to crop hard enough to cut the tagline text or the logo badge
outright, since both sit near opposite edges of the image and there's no
single `object-position` that protects both at once. Root-caused this by
reproducing it live (a 1024×563 viewport clipped "Brighter" and "Happier"
down to just "Minds"/"Tomorrows"). Fixed by locking the image's own
container to `aspect-[711/900]` with `h-full max-w-full` — the box always
shrinks to fit whichever of height/width is the binding constraint while
keeping the exact image ratio, so `object-cover` has nothing left to crop;
any leftover flex space just shows the panel's own matching `#FFF8EE`
background, invisibly. Verified live across the achievable range in this
session's browser-automation environment (viewports from roughly
1280×533 up to 1800×1054, several short-height cases in between) — no
cropping on either the form side or the image side at any of them.
**Environment note for future sessions**: `resize_window` in this Chrome
automation session only takes effect reliably on a tab's *first* call
after creation/navigation — later resize calls on the same tab silently
no-op (viewport stays pinned to whatever the first successful resize set).
Work around it by opening a fresh tab per target size rather than
resizing one tab repeatedly. This session's virtual display also hard-caps
window bounds around 1800×1169, so a literal 2560×1440 "large monitor" test
wasn't reachable — the ~1800×1054 case was used as the closest available
proxy; the fix itself has no viewport-specific constants, so there's no
reason to expect it to behave differently at true 2560+ widths, but this
wasn't independently confirmed.

## Bug fix — bad club_id on gatekeeper creation surfaced a raw Postgres error — 2026-09-17

User-reported: bulk-CSV gatekeeper creation on a row with a bad `club_id`
showed `insert or update on table "profiles" violates foreign key
constraint "profiles_club_id_fkey"` directly in the per-row results table.
Root cause: `inviteAndCreateGatekeeper` (`actions/gatekeepers.ts`, shared by
both the single-gatekeeper form and the bulk CSV path) never validated
`club_id` before using it — the bulk path in particular takes it as a raw
CSV cell, typed/pasted by whoever built the file, with no dropdown to
constrain it. A bad value only ever surfaced when the final `profiles`
insert hit the FK constraint, and the raw Postgres message was relayed to
the UI as-is (`error: profileError.message`).

**Worse than just an ugly message**: `createInvitedUser()` — which creates
the real auth user *and sends the temp-password invite email* — runs
*before* the `profiles` insert. So on this failure path, a real email with
a real temporary password had already been sent to the row's email address
before the insert failed and the auth user got rolled back
(`admin.auth.admin.deleteUser`) — the recipient got working-looking
credentials for an account that no longer exists by the time they read the
email.

**Fix**: added a `clubs` lookup (`select name, is_active … eq('id',
clubId)`) immediately after the existing-email check, before
`next_gatekeeper_code()` or `createInvitedUser()` run at all. Covers both
failure shapes verified live against the DB — a well-formed but
non-existent UUID (empty result) and a malformed one, e.g. garbage CSV text
(a `22P02 invalid input syntax for type uuid` from Postgres) — both now
return `"The selected club could not be found. Double-check the club_id
and try again."` (or an inactive-club-specific message) before any auth
user is created or email sent. Also added a `profileError.code === '23503'`
fallback on the later insert itself, translating any FK violation that
might still slip through into a readable message instead of the raw
constraint text, as a backstop.
**Not changed**: `updateGatekeeperAction`'s `club_id` write — it comes from
a `<select>` dropdown (not free-typed CSV) and goes through the
RLS-enforced authenticated client rather than the service-role admin
client, so the same class of bad-input risk doesn't apply there the same
way; left as-is rather than fixing something not actually reported broken.

**On the "still got a 200 response" observation from the same report**:
expected, not a bug — this is the exact same Next.js Server Actions
behavior already documented under the Epic 1 2026-09-14 note ("Next.js
Server Actions always return 200 at the transport layer... this is
intentional Next.js behavior"). The real error already was being caught
and shown correctly (that's why the raw Postgres message was visible in
the per-row results at all) — the 200 in the network tab was never a sign
the error was missed.

## Login page — copy fix + illustration-cropping regression fix — 2026-09-17

User-reported, day-of the login rebuild logged above: the right-side
illustration still didn't match Figma (bottom of the orange swirl and
breathing room around the logo looked cropped/zoomed vs. Figma), and the
form copy had drifted — heading read "Sign in" instead of Figma's literal
"Login" text.

**Root cause of the cropping, confirmed live, not just by code inspection**:
`AuthIllustrationPanel`'s container locked `aspect-[711/900]` together with
an explicit `h-full` *and* `max-w-full` — the fix from earlier the same day
for a different (short-viewport-height) crop bug. That combination only
actually holds the box to the image's native ratio when the available
*width* is `>= height * (711/900)`. Reproduced the failure directly (forcing
the flex panel to a narrower width via a live DOM/style override, since
`resize_window` in this session is too unreliable — see the environment note
below the 2026-09-17 login-rebuild entry above — to hit an exact narrow
target pixel-for-pixel): when width is the tighter constraint, the browser
can't satisfy both the definite height and the aspect-ratio at once, the box
silently stops matching the image's ratio, and `object-cover` then crops to
fill that mismatched box — clipping the logo and the left edge of the
tagline text, exactly matching the report. This is a real regression from
that earlier fix, not a one-off — any panel narrower (relative to its
height) than the image's own ratio hits it.

**Fix**: replaced the aspect-ratio-matching box entirely with a plain
`h-full w-full` container and switched the image from `object-cover` to
`object-contain` (`components/auth/auth-illustration-panel.tsx`). This is
correct for every possible panel shape by construction — `object-contain`
can never crop, it only ever letterboxes — and the letterboxed space is
invisible here since the image's own background and the panel's background
are the same `#FFF8EE`. Verified against the same forced-narrow repro
(logo/tagline fully visible, no crop) and at the environment's other
achievable window sizes; all showed the complete illustration with the same
breathing room Figma shows.

**Copy fix**: re-pulled node `1:22`'s metadata directly (not just the
earlier screenshot) and confirmed the heading text node (`1:43`) is
literally "Login" — the live page still said "Sign in" from before this
node was last edited. Changed `login-form.tsx`'s `<h1>` to "Login" to match.
The button itself stays "Sign in" (Figma's own button label, unchanged).
Email/password placeholders (`you@healingmindsmatter.org` / "At least 8
characters") were already correct from the earlier rebuild — no change
needed.

**Subtitle — did not change, flagging a discrepancy in what was reported**:
the request described the reference as reading "For Champion," but a fresh
read of node `1:44` shows the literal Figma text is "For Super Admin"
(singular, Super-Admin-only — this predates the Champion Web Portal, same
stale-copy issue already noted in the 2026-09-15 Profile-rebuild entry).
Kept the existing "For Super Admins and Champions." wording rather than
copying either literal Figma variant — this is a genuinely shared login
page for both roles now, and neither "For Super Admin" nor "For Champion"
alone would be accurate. Same deliberate-deviation call as the original
2026-09-17 rebuild; not re-litigated, just re-confirmed against the actual
node text.

## Login page — illustration rebuilt as real layered SVG, not a flattened PNG — 2026-09-18

User-reported: the illustration still didn't match Figma after the previous
fix — the photo was masked into a generic rounded-rectangle/blob instead of
Figma's actual organic shape, and the swirl/photo/logo bled past the panel's
right edge and got cut off. Root cause of both: `AuthIllustrationPanel` was
one flattened raster PNG export (a screenshot-derived crop), so it carried no
real clip data, and (separately) whatever CSS box was sizing it could still
end up wider than the panel's own padded space at some proportions.

**Fixed by rebuilding the whole panel as a single inline SVG using real data
pulled directly from Figma** (fileKey `K1Csx2BjbSmP9NRSDtoEe2`, node `1:22`
"Login") via `get_design_context`/`get_metadata`, not approximated:
- The photo's clip shape is node `1:27`'s actual "Union" path (a boolean
  union of 4 vectors + 4 rounded rectangles), embedded verbatim as an SVG
  `<clipPath>` — not a border-radius or hand-drawn blob.
- The three layers that appear "inside" that shape (photo `1:36`, swirl
  accent `1:37`, room/plants background `1:38`) all reference the *same*
  clip region at different offsets, which is how Figma gets the interlocking
  look (each layer reveals a different "cell" of the same union). Confirmed
  this by independently back-computing the clip's absolute origin from all
  three layers' own `mask-position` values — all three agreed to within
  0.005px (`868.003, 79.365`), so one `<clipPath>` correctly serves all three.
- The two swirl vectors (node `1:25` "Vector 9", back/decorative, and node
  `1:37`'s own art) are embedded as real stroked `<path>`s with their
  original gradients (`paint0_linear_0_14` / `paint0_linear_0_4`), not
  rasterized — **caught and fixed a self-introduced bug here**: on the first
  pass the two paths/gradients got swapped between the two usages, which
  produced solid-looking swirls instead of Figma's softer translucent
  gradient look; re-verified against each source file directly before fixing.
- The logo badge (node `1:56`) needed Figma's own non-uniform fill-scale
  (`h-115.22% w-148.3% left--25.95% top--6.69%` of its own 75×57 box) — a
  plain center-crop of the source asset rendered unreadable/distorted text;
  reproducing Figma's exact scale-and-shift (`preserveAspectRatio="none"` at
  the computed 111.225×65.675 box, shifted to `1313.538, 28.187`) fixed it.
- Tagline text/rule (node `130:34222`) uses Figma's literal values directly
  (20px/700/`#012C51`/0.2px tracking; rule `#F4AC1E`, `rx:2`) as real SVG
  `<text>`/`<rect>`, not baked into a raster.

**Why this also fixes the edge-bleed/cropping**: the whole composition is one
`<svg viewBox="729 0 711 900" preserveAspectRatio="xMidYMid meet">` — 711×900
is the same visible right-hand slice of Figma's 1440×900 frame the previous
PNG used (`x:[729,1440]`), and viewBox slicing reproduces the frame's own
content-clipping exactly. Rendering it as an `<svg>` (a replaced element,
same category as `<img>`) rather than a plain CSS box means normal
`preserveAspectRatio="meet"` containment behavior applies natively — it
cannot be pushed into the over-constrained aspect-ratio/height combination
that broke the previous two attempts (documented in the two entries above);
there is no CSS state that makes an `<svg>` render outside its own box.
Verified live by forcing the panel to extreme sizes in both directions
(a 260px-wide panel and a 180px-tall panel, both far outside anything a real
browser window would produce) — the whole illustration scales as one unit,
centered, with zero cropping or distortion at either extreme.

**Assets**: `photo.jpg` (was `.png`, re-encoded to JPEG since it has no
transparency — 1.8MB → 210KB), `room-bg.png` (kept as PNG, genuinely has
alpha), and `logo-badge.png`, all under `public/images/login/`, pulled from
Figma's own asset export (not re-screenshotted). The old flattened
`login-illustration.png` and the intermediate standalone mask/swirl SVG
files (superseded by inlining the same path data directly in the component)
were deleted — nothing else referenced them.

## Login page — show/hide password fix + dual portal routing — 2026-09-18

**Password toggle audit across every password field in the app**: found
that Change Password (`ChangePasswordForm`'s `PasswordInput`, shared by the
Super Admin/Champion modals and the "Set Your Password" forced first-login
screen at `/set-password`) already had a correct, working eye-icon toggle —
no fix needed there. Two real bugs found and fixed elsewhere:
- **Login page** (`login-form.tsx`): the toggle's state/type-switching logic
  was already functional (dots ↔ plain text worked), but the icon mapping
  was inverted relative to the convention `ChangePasswordForm` established
  from Figma — it showed the *open* eye icon while the password was already
  revealed, and the *crossed-out* eye while it was hidden (backwards from
  "open eye invites you to reveal, crossed-eye invites you to hide"). Fixed
  by swapping the two icon srcs so it matches the same, already-correct
  convention everywhere else.
- **Reset Password page** (`/reset-password`, the final step of the Forgot
  Password email-link flow): had a working toggle but used plain "Show"/
  "Hide" text buttons instead of the eye icon used everywhere else in the
  app. Replaced both password fields' toggle buttons with the same
  `/icons/pw-eye.svg` / `pw-eye-off.svg` pair, same convention.
Verified live: screenshotted the Login password field masked, then revealed
via the eye icon, confirming the dots-to-plaintext toggle actually works and
the icon state now matches everywhere else.

**Two login portals, one shared form component**: added `/champion/login`
alongside the existing `/login`, both rendering the exact same
`LoginForm`/`(auth)` layout — no duplicated page, just a new `portal:
'super_admin' | 'champion'` prop that drives the subtitle text ("For Super
Admin" vs. "For Champion") and a hidden `portal` form field. Confirmed this
was the right shape before building: the existing `middleware.ts` already
keys all role-gating off `profiles.role`, not off which URL was used to log
in, and no existing plan/checklist/Figma frame calls for a different
routing shape — so two thin routes sharing one component (the option this
was already leaning toward) was the correct, lowest-friction fit, not just
an assumption.
- **Real blocking, not just cosmetic**: `loginAction` (`actions/auth.ts`)
  now reads that hidden `portal` field and rejects a real role mismatch
  outright — a Champion account submitted through `/login` (or a Super
  Admin account through `/champion/login`) gets signed back out immediately
  with "This is a [Champion/Super Admin] account. Please sign in from the
  [Champion/Super Admin] login page." instead of silently letting them in
  and bouncing them to their real dashboard. This is a UX/business rule, not
  a security boundary — RLS and the middleware role-gates already scope
  real access correctly either way — but per the request, using the wrong
  door is now actually refused, not just cosmetically mismatched.
- `middleware.ts`: added `/champion/login` to `PUBLIC_PREFIXES` (it was
  being caught by the "protected route, not authenticated → login" rule and
  bounced straight back to `/login` before this) and to the
  already-authenticated-user redirect-to-dashboard check (mirrors `/login`'s
  existing behavior — an already-signed-in user hitting either login page
  just gets sent to their own dashboard, not blocked; the portal-mismatch
  block only applies to an actual login *attempt*, which only `loginAction`
  can see).
- End-to-end tested live with a throwaway test Champion account (created
  directly via the Auth Admin API, not through the invite flow, to keep the
  test fast) alongside the real Super Admin account, all four combinations:
  Super Admin via `/login` → succeeds; Super Admin via `/champion/login` →
  blocked; Champion via `/champion/login` → succeeds (reaches `/champion`);
  Champion via `/login` → blocked. Test account and its audit-log rows
  deleted afterward, confirmed via direct DB query.

## Login page — font sizes, swirl continuity, panel balance — 2026-09-18

User asked for a second review pass on the Login page's font sizes, swirl
continuity, image responsiveness, and left/right panel balance. **Root
cause of most of it**: the Figma file had been revised in place again since
the previous rebuild — node `1:22` (used to pull every coordinate/path in
the previous two entries) no longer exists at all; the current "sign in"
section's frame is now `144:20`, same file (`K1Csx2BjbSmP9NRSDtoEe2`). Every
number the illustration used was quietly stale. Re-pulled everything fresh
from `144:20`/`144:22` via `get_metadata`/`get_design_context` rather than
trusting anything cached from the deleted node — same "file gets revised in
place, always re-check" lesson as the 2026-09-15 Profile/Permissions entries.

**Font sizes — real mismatches found and fixed** (`login-form.tsx`), pulled
from the current node's actual text styles, not eyeballed:
- Email/Password field labels: were `14px`/`0.14px` tracking, Figma is
  `16px`/`0.16px`. Fixed.
- Email input text + placeholder: same 14→16px fix (shares the label's
  input styling).
- Password input text + placeholder: **left at 14px** — Figma genuinely
  uses a smaller size here specifically (`text-[14px]` on that one field,
  vs `16px` for Email), presumably so the longer "At least 8 characters"
  placeholder fits comfortably; not a bug, confirmed via the actual node.
- "Sign in" button text: was `16px`/`0.16px`, Figma is `18px`/`0.18px`. Fixed.
- Heading (34px), subtitle (18px), checkbox label (14px), "Forgot
  Password?" (14px), and the tagline (20px, already real SVG text from the
  previous rebuild) were already correct — verified via
  `getComputedStyle` on the live page, not just re-reading the JSX.

**Swirl continuity + responsiveness** (`components/auth/auth-illustration-
panel.tsx`, full rewrite with the fresh `144:20` coordinates): same
technique as the previous rebuild (one inline SVG, `viewBox="729 0 711
900"` slicing the visible right-hand region of the 1440×900 frame, a real
`<clipPath>` from the photo's exact "Union" path, the two swirl vectors as
real stroked paths with their own gradients) — just every coordinate,
gradient, and path `d` value re-extracted from the current node instead of
reused. Cross-checked the shared clip origin three independent ways from
the three masked layers' own `mask-position` values (photo/accent/room-bg
all agree to within 0.001px: `798.000, 122.427`) before using it, same
verification discipline as before. Because it's real `<svg>` markup (not a
flattened raster) with `preserveAspectRatio="xMidYMid meet"`, it scales as
one unit at any container size with no crop possible — re-verified live by
forcing the panel to a 260px-wide and a 180px-tall extreme (both far beyond
any real browser window); the swirl reads as the same continuous loop at
every size tested, natural and both extremes.

**Panel balance — a real, verifiable bug, not just a look-alike issue**
(`app/(auth)/layout.tsx`): the left card was `lg:w-[697px] lg:flex-none`
(fixed) while the illustration panel was plain `flex-1` (unbounded) — so
the two sides grew increasingly lopsided at wide viewports instead of
staying balanced. There's no single explicit Figma "right panel width" to
copy (the illustration is loose content in Figma, not a second named,
bounded frame like the 697px card is), so exact 50/50 was the closest
non-fabricated match: both sides are now `lg:flex-1`. Also removed the
`lg:gap-8` (32px) flex gap between the two sides — this frame doesn't
actually show a deliberate gap of that kind between two named panels (only
the 32px *outer* frame margin, which is real and was kept via `lg:p-8`);
the space that appears between the card and the illustration's visible
content is just where the SVG's own composition happens to be empty, not a
second, additively-stacked gap. Verified live via `getBoundingClientRect`
on both panels at a real viewport: `768×693` each, flush at the same x
coordinate (800) — equal width, equal height, zero added gap.
`/forgot-password` (shares this same layout) re-checked live afterward,
unaffected.

## Login page — third review pass: real eye icon, field-by-field re-check — 2026-09-18

User did a close side-by-side against Figma again and flagged the
password field's show/hide icon as visibly wrong shape ("looks like a lock
or circle-dot" instead of an eye). Re-checked node `144:20` first — **it
had not been revised again** (unchanged from the previous entry, same file
`K1Csx2BjbSmP9NRSDtoEe2`), so this was a real implementation bug, not stale
data this time.

**Root cause, confirmed two ways**: node `144:56` is literally named
`basil:eye-closed-outline` — a real icon from the Basil Iconify set, 24×24,
shown paired with the masked/dotted password field in Figma's static
mockup. The live page was instead using a differently-shaped, non-square
icon (`/icons/pw-eye.svg` / `pw-eye-off.svg`, native ratio 16.5:11.25 and
16.5:14.85) forced into a 16px **square** box (`h-4 w-4`) with
`preserveAspectRatio="none"` baked into the SVG itself — non-uniformly
stretching an already-different icon into a distorted blob. Downloaded
Figma's actual asset for `144:56` and cross-checked it against the public
Iconify registry (`api.iconify.design/basil/eye-closed-outline.svg`) —
identical path data, confirming it's the real, unmodified icon, not
something to hand-draw. Fetched the real open-eye companion
(`basil:eye-outline`, same registry, same icon set) for the revealed state
— Figma's static mockup can only show one interactive state, so this isn't
a separate node in the file, but it's the verified real counterpart, not
invented. Saved both as `public/icons/basil-eye-outline.svg` /
`basil-eye-closed-outline.svg` and wired `login-form.tsx` to use them at
their real 24×24 size (`h-6 w-6`, no distorting stretch needed) — scoped to
the Login page only; `ChangePasswordForm`'s `PasswordInput` (Change
Password modal, Set Your Password) and the Reset Password page keep their
existing `pw-eye.svg` pair and convention, since neither was reported
broken this pass and neither was re-verified against its own Figma source
today. **Convention note**: Figma pairs closed-eye-icon with the
*masked* state (icon describes current state, not the click action) —
opposite to `ChangePasswordForm`'s open-eye-when-hidden convention.
Matched Login's own Figma source exactly rather than forcing consistency
with the other component's unverified-this-session convention.

**Full field-by-field re-check of the left form**, values pulled fresh
from `144:20` (not re-trusted from prior passes), each confirmed live via
`getComputedStyle` — Figma value → live rendered value, all matches unless
noted:
- Heading "Login": 34px/black/`#012C51` → 34px/700/`rgb(1,44,81)` ✓
- Subtitle: 18px/regular/0.18px/`#67707F` → 18px/400/0.18px/`rgb(103,112,127)` ✓
- Email/Password labels: 16px/0.16px/`#0C1421` → 16px/400/0.16px/`rgb(12,20,33)` ✓ (this was the fix from the previous pass — re-confirmed it actually took effect, not just re-claimed)
- Email input text: 16px/0.16px → 16px/400/0.16px ✓
- Password input text: 14px/0.14px (Figma genuinely uses a smaller size on this one field) → 14px/400/0.14px ✓
- Checkbox label "Keep me signed in": 14px/0.14px/`#67707F` → 14px/400/0.14px/`rgb(103,112,127)` ✓
- "Forgot Password?": 14px/bold/0.14px/`#265BA2` → 14px/700/0.14px/`rgb(38,91,162)` ✓
- Button "Sign in": 18px/semibold/0.18px/white → 18px/600/0.18px/`rgb(255,255,255)` ✓ (also the previous pass's fix — re-confirmed)
- Input height/radius/border: 48px/`8px`/`#D4D7E3` → 48px/`8px`/`rgb(212,215,227)` ✓ (background reads as a light blue in a live screenshot only because Chrome's autofill highlight overrides it when a field is autofilled — confirmed via `getComputedStyle` this isn't the app's own CSS)
- Label→input gap (8px), Email→Password field gap (24px), fields-block→checkbox-row gap (9px), checkbox→its own label gap (7px): all already matched Figma's real values from the previous pass — re-confirmed by re-reading the exact class values against `144:45`/`144:46`/`144:49`/`144:50`'s real gap values, not just re-asserted.
- Checkbox icon itself (`carbon:checkbox`, 18×18): the app's existing `/icons/checkbox-unchecked.svg` turned out to already be the same real Carbon icon (same path shape, just a differently-scaled 22×22 export vs Figma's 18×18 — no visual difference since both are simple square outlines) — verified by downloading Figma's own asset and comparing; no change needed.

Screenshotted the live left panel next to a fresh Figma crop of `144:20`'s
left side at matching framing to confirm — heading, subtitle, both fields,
checkbox, "Forgot Password?", button, and (the actual fix) the eye icon
shape all match.

## Login heading — found the real reason font-weight/family fixes weren't sticking — 2026-09-19

User reported the Login heading still wasn't extra-bold Inter despite
`font-black` + `font-[family-name:var(--font-inter)]` already being in
`login-form.tsx`'s `<h1>` classes. Root cause, confirmed live via
`getComputedStyle` before touching anything: `app/globals.css` has a plain,
**unlayered** `h1, h2, h3, h4, h5, h6 { font-family: var(--font-jakarta);
font-weight: 700; letter-spacing: -0.025em }` (plus `h1 { letter-spacing:
-0.035em }`) — written directly in the stylesheet outside any `@layer`
block. Tailwind v4 puts every one of its own utility classes inside cascade
layers (`theme`/`base`/`components`/`utilities`); per the CSS cascade-layer
spec, **unlayered author CSS always wins over layered CSS**, regardless of
source order or selector specificity. So this rule was unconditionally
beating `font-black`, the font-family utility, and the tracking utility on
every `<h1>` in the app that tried to override it — not just Login's.
Confirmed precisely: the heading's `getComputedStyle` before the fix read
`fontFamily: Jakarta` (not Inter), `fontWeight: "700"` (not the requested
900), and `letterSpacing: "-1.19px"` — which is exactly
`34px × -0.035em`, i.e. the global rule's value computed against Login's
own 34px size, not `login-form.tsx`'s intended `0.34px`.

**Considered the systemic fix** (moving those rules into `@layer base`, so
every heading's own Tailwind classes could properly override them as
Tailwind intends) but backed off — a repo-wide grep found ~113 other
heading tags, several of which already carry their *own* `tracking-[...]`
values that are currently silently overridden the same way. Un-breaking
that globally would change the rendered letter-spacing on headings across
many pages no one asked to touch in this session, with no way to review
each one. **Flagging this as a real, separate latent bug worth fixing
deliberately later** — but scoped today's fix to just the Login heading:
added Tailwind's `!` important-modifier suffix to that one `<h1>`'s
font-family/font-weight/tracking classes (`font-[family-name:var(--font-
inter)]! font-black! tracking-[0.28px]! sm:tracking-[0.34px]!`), which
forces those three properties to win on this element specifically without
touching the shared global rule or any other page's headings. Re-verified
live via `getComputedStyle`: `fontFamily: "Inter, \"Inter Fallback\""`,
`fontWeight: "900"`, `letterSpacing: "0.34px"` — matches Figma's own
`Inter:Black` designation exactly (Tailwind's own naming calls weight 900
"black" and weight 800 "extrabold"; used 900 since that's the literal
Figma value, not a guess at what "extra bold" means colloquially).

## Login illustration — back swirl's floating end extended to the right edge — 2026-09-19

User request, not a Figma-mismatch this time: the back swirl (the thick
orange gradient loop) should have one end touching the top of the panel
and the other touching the right edge — an explicit design ask, since
Figma's own static frame actually shows this same floating round-cap end
too (checked the reference screenshot at the exact same coordinates before
assuming it was a bug — it wasn't a mismatch, the user wanted a different
look than Figma's own mockup here).

Measured the real endpoints live via each path's `getScreenCTM()` (not
guessed): the top end already sat right at the panel's top edge
(screenY≈27 vs panel top=32 — already bleeding past it correctly), but the
other end (the path's `M582.338 760.285` start) landed ~76px short of the
panel's right edge, floating with a visible round cap in empty cream
space.

**Fix, without inventing new curve geometry**: computed the curve's own
real initial tangent direction from its first actual control point
(340.546, 655.891) and prepended a straight `M<point> L582.338 760.285`
segment continuing 130 units further out along that exact same direction
— the original curve itself is byte-for-byte unchanged, this only adds a
straight tail before it so the round stroke cap now bleeds past the right
edge (and gets clipped by the existing `viewBox` slice) the same way the
other end already bleeds past the top. Verified live: the band now runs
cleanly off the right edge with no floating cap, at both the natural size
and a forced 260px-wide extreme (confirming it still scales/anchors
correctly, not just at one fixed size).

## Login/Forgot Password — input background color, Forgot Password de-carded — 2026-09-19

- Input field background on Login changed from `#F7FBFF` to `#FCFDFF` (both
  Email and Password fields), per explicit request.
- **Forgot Password page rebuilt flat to match Login exactly**: it
  previously had its own nested `rounded-3xl bg-white p-10 shadow-md` card
  floating inside the shared `(auth)` layout's own white panel — visibly
  inconsistent with Login, which has no such nested card. **Checked for a
  real Figma frame for this page first, per an explicit instruction not to
  just copy Login's CSS blindly**: none exists — a full metadata scan of
  the file's only page found no Forgot/Reset Password section anywhere
  (only "sign in" for Login). With no real spec to pull instead, reused
  Login's own verified layout/typography values directly (heading 34px
  Inter Black w/ the same `!`-forced override for the same global-h1-rule
  reason as Login's own heading, 18px subtitle, 16px label, the same
  `#FCFDFF`/`#D4D7E3`/`8px`-radius input, the same 18px semibold button) —
  removed the nested card entirely so content sits flat on the shared panel
  exactly like Login. Covered both states (the email-entry form and the
  post-submit "Check your email" confirmation) — verified live, neither
  shows a nested card anymore, both match Login's spacing/typography.

## Password field font-size — iOS Safari auto-zoom-on-focus, not a CSS bug — 2026-09-19

User reported the Login password field's text "changes size" after clicking
into it. Root cause is a real WebKit behavior, not app CSS: Login's
Password input has a deliberate `14px` text size (Figma's own spec for
this one field, confirmed in an earlier pass), but **iOS Safari
auto-zooms the whole page when a focused input's font-size is under
16px** — an accessibility feature so tiny input text doesn't stay
illegible, not a bug in this app. That page-level zoom is what made
everything, including the field itself, look like it "became 16px" on
focus — nothing in this app's CSS was actually changing.

**Fix**: kept the input's real font-size at 16px (matching Email, so the
zoom trigger never fires) and moved the Figma-specified 14px onto the
`::placeholder` pseudo-element specifically (`placeholder:text-[14px]
placeholder:tracking-[0.14px]`) — the placeholder still renders visibly
smaller than Email's placeholder exactly as Figma shows, real typed
characters (which render as dots regardless of size) are unaffected, and
the browser's zoom-trigger check only looks at the input's own base
font-size, not its placeholder override. Verified live: `getComputedStyle`
confirms the input's real font-size is 16px, and a screenshot with both
fields cleared confirms the placeholder text is still visibly smaller than
Email's.

**Same bug also exists elsewhere, not fixed here** (out of scope for this
specific report, flagging for a deliberate follow-up): Reset Password's
two password fields use `text-sm` (14px) directly on the `<input>`, and
`ChangePasswordForm`'s shared `PasswordInput` (Change Password modal, Set
Your Password screen) uses `text-[13px]` directly on its `<input>`s — both
would trigger the same iOS auto-zoom.

## Certifications — no hard-coded QPR anywhere — 2026-11-06 (spec deviation)

User decision: QPR is an ordinary certification type; no screen or figure may
single it out. **This overrides Story 10.12 Scenario 04** ("existing QPR
displays shall read the person's current QPR certificate"). Branch
`fix/remove-hardcoded-qpr` (web) plus uncommitted edits on hmm-mobile
`feature/certifications`.
- Per-person status (Gatekeeper badges/filters, Champion detail, Club rates,
  Clubs "Certification Readiness" + CSV, Champion profile) now covers every
  type: `personCertStatus()` / `certifiedFigures()` in `lib/cert-summary.ts`
  (Certified if any valid > Expiring soon > Expired > No certifications).
- Gatekeeper registration no longer writes `profiles.qpr_certification_date` +
  a hard-coded 3-year expiry; bulk CSVs with `certification_date` are refused.
- Event type `qpr_session` is labelled "Certification Programme";
  `event-type.ts` is the single label source (`EVENT_TYPE_OPTIONS`,
  `CERTIFICATION_PROGRAMME_EVENT`).
- **Stored values deliberately kept** because the live site and current mobile
  build share the DB: enum value `qpr_session`, permission key
  `schedule_qpr_sessions`, permission category text (shown via a display title
  in `module-card.tsx`), and `qpr_certification_stats()` (new builds use
  `certification_stats()`). Rename them only after main + mobile have shipped.
- Migration `20261109000000_remove_hardcoded_qpr.sql` (user runs it).
- `lib/no-hardcoded-qpr.test.ts` fails if QPR is named again in web code.

### Not started yet
- Everything on the Gatekeeper mobile app — BLOCKED until Gatekeeper user
  stories exist, and until the web app's core features are further along.
  (The Champion Web Portal above is now fully built — this bullet no
  longer covers the Champion side.)
- Recommended extras (push notifications, attendance tracking, announcement
  read tracking, audit log UI, mood tracker) — deferred, time-permitting.
