# SCULPY V2.5 P0 — Web Push and enquiry reminders — 2026-11-02

Status: P0 deployed and source/schema/scheduler verified on 2026-11-02. Real iPhone acceptance not yet performed. P1 internal messaging is intentionally deferred until P0 passes actual phone acceptance.

## Baseline inspection

Latest main at start: e1125ed (V2.4.1). Reuse the existing manifest/icons, manual browser-menu installation, scoped Service Worker, verified Supabase profiles, owner/operations business access, enquiry list/detail reader, sign-in, private schema, audit table, Edge Function authentication pattern and GitHub Actions/Pages deployment. Do not modify the newer live AI long-term-memory implementation.

The existing Service Worker only handles a data-free offline fallback. No push subscriptions or scheduler existed. Production supports Vault; pg_net/pg_cron are available but were not enabled. Current website writes use sculp-enquiry → service-only sculpy_submit_website_enquiry → website_enquiries. Submission replay is already deduplicated. An isolated AFTER INSERT trigger can enqueue notifications without changing this submission contract.

## P0 scope

- Explicit opt-in from Settings → Notifications; no floating button or home-screen notification switch. Permissions are never requested on load. iPhone users add the app manually and enable from the Home Screen app.
- Private device subscriptions bound to verified Auth sessions. VAPID private identity and scheduler credential live in Supabase Vault; browsers receive only the standard public application key. No new notification SaaS or customer-message channel.
- Generic lock-screen content. Existing windows receive a notification ID and preserve unfinished forms; closed windows reopen a login-protected route. The server resolves the current recipient and permissions before returning a lead ID.
- New website enquiries notify opted-in active operations/owner accounts. Overdue pending enquiries default to 24 elapsed hours, once per lead/recipient, with assigned-owner routing and unassigned-management fallback. Threshold and repetition are configurable. Per the follow-up instruction, there are no quiet-hour settings or time-window restrictions. All displayed times use America/Toronto; the overdue threshold uses elapsed hours.
- Retry leases, uniqueness, service Topic/notification tag deduplication, expired-subscription cleanup and a history that distinguishes queued, service-accepted and opened. Worker authorization and current eligibility are checked before every send. Sign-out revokes the current session’s devices; profile deactivation or role changes disable registrations.

## Delivery boundaries

No user is opted in automatically. Push service acceptance does not prove delivery to an iPhone. Previously accepted in-flight generic notifications cannot be recalled; clicking always rechecks current access. The UI, SQL, encryption and mocked transport tests must be reported separately from actual phone receipt.

## Compatibility and rollback

Migrations are additive. Push tables/functions are in sculpy_private with RLS and no anon/authenticated table access; the Edge service alone can invoke the private APIs. Existing account/CRM/finance APIs and permissions remain unchanged. The website trigger catches notification failures and never rolls back a successful enquiry. The scheduler uses a Vault credential and a fixed trusted Edge URL; net request tables are not exposed to web roles.

Rollback: pause push_config.enabled, unschedule sculpy-push-worker and restore the prior frontend/worker. Retain notification/audit data and VAPID identity for recovery; do not drop business tables or rotate credentials casually. Existing real customer data is never copied to Demo.

## Verification/deployment evidence

- PR [#41](https://github.com/2ez4jz/sculp-database/pull/41), feature commits 2ba3250 / b8fe2da / 1123011; merge 8b7813395c151404576f0e3e2e9a8e19a064df37.
- Checked-head CI [41500721083](https://github.com/2ez4jz/sculp-database/actions/runs/41500721083): 106/106 unit checks; ephemeral database 26 passed, 3 PostgreSQL-only checks skipped there; real PostgreSQL 25/25 with no skips, concurrent leases and backup/recovery passed. Browser regression passed, including 320/390/768px settings, direct user activation, operations/owner/staff boundaries, no unsolicited prompt or quiet-hour controls and protected deep links. Existing order, financial, AI, communication and PWA browser regressions passed.
- Full main suite [41501315676](https://github.com/2ez4jz/sculp-database/actions/runs/41501315676): 197 tests, 194 passed, 3 PostgreSQL-only skips; no failures. Financial/chart checks passed three repeated runs. Final local chat/multistep capability checks 16/16 after release-knowledge update. Mocked model checks are not a live model quality evaluation.
- Existing Pages deployment [41501315725](https://github.com/2ez4jz/sculp-database/actions/runs/41501315725) succeeded. All nine changed public frontend resources were downloaded and matched local released bytes: index, Service Worker, bootstrap, login, workspace, enquiry reader, notification settings/client/CSS. This source check, rather than merge alone, establishes frontend publication.
- Both additive push migrations applied to production. All six private push tables have RLS and no anonymous/authenticated direct read; both public push wrappers are invokers and executable only by service_role. Existing website write function/roles were not replaced.
- sculpy-notifications v1 ACTIVE; all three deployed files match source. Unauthorized worker/API probes rejected. Vault-backed VAPID initialization and encryption self-test succeeded on the actual Edge runtime; no outbound message is used by that self-test.
- pg_cron job sculpy-push-worker is active every minute. pg_net worker invocation returned HTTP 200; last_tick_at advances, no push errors. Global defaults: 24 elapsed hours, once per enquiry/recipient, no quiet hours. At verification there are **0 devices, 0 opted-in users, 0 notifications and 0 deliveries**; no real user was enabled or notified.
- Security advisor comparison: existing authenticated-definer/password warnings unchanged. Six new RLS-without-policy INFO entries are intentional private service-only tables. Hosted pg_net installs with non-relocatable public extension metadata and adds one extension_in_public WARN; its net request/response tables are revoked from web roles and no new push RPC is web-executable. Do not drop/reinstall a running extension just to hide metadata lint.
- sculpy-chat v50 ACTIVE: only shared release facts and product-knowledge descriptions changed; all **15 other files** from the newer v49 runtime are byte-for-byte preserved, including long-term memory. All 17 deployed files were read back and compared. No new chat tool or AI memory behavior was introduced.
- Desktop and 390px phone layouts inspected with fictional data. Screenshots: [desktop](screenshots/v25-notifications-desktop-20261102.jpg), [phone viewport](screenshots/v25-notifications-mobile-20261102.jpg). The non-HTTPS local preview correctly cannot receive Web Push; browser transport fixtures are explicitly fictional.

## Manual acceptance still required

1. On an actual iPhone, use the existing manual Safari menu to add Sculpy to the Home Screen. Open that app, sign in, Settings → Notifications → enable this device and explicitly grant permission.
2. Send a test to that device; close/background the app, verify an actual lock-screen notification and tap it. A queue or service-accepted receipt alone is insufficient.
3. With explicitly opted-in JZ and Miranda test devices, submit a **fictional** website enquiry through a protected test workflow, verify each intended recipient, exact enquiry navigation and no replay duplicates. Verify a controlled overdue fixture, then handled/closed cancellation, logout, disabled-account and permission boundaries. Do not put real customer information in Demo or lock-screen payloads.
4. Verify notifications stop after disabling; verify normal order, finance, communication and AI work on the actual business devices. Record phone/iOS version, time and actual outcomes.

Until these physical-device checks are recorded, acceptance remains pending_real_iphone and P1 colleague-to-colleague reminders remain not implemented. No claim of end-to-end iPhone delivery is made.


## Post-publication regression correction

A repeat run (41501950755) exposed an existing order-number test flake: a randomly allocated value can already equal the fixed replacement 610000, so expecting that no-op update to be rejected was incorrect. [PR #42](https://github.com/2ez4jz/sculp-database/pull/42) chooses a replacement guaranteed to differ and retains the immutability assertions. The two focused tests passed locally. The production number-allocation SQL and all notification/runtime files are unchanged; final checked-head CI is available on that PR. This repeat-run failure is recorded separately from the successful P0 release checks above.


## Incremental communication input update — 2026-11-02

[PR #43](https://github.com/2ez4jz/sculp-database/pull/43) adds direct multi-image drag/drop to the shared Lead/Booking communication composer, retaining mobile file selection, explicit cloud save and existing attachment/retry rules. Published by the existing Pages workflow and seven public resources byte-verified. No database, permissions or AI-memory behavior changes; the P0 real-iPhone acceptance and P1 status above remain unchanged. Detailed checks and rollback: [communication drop release](COMMUNICATION_DROP_2026-11-02.md).
