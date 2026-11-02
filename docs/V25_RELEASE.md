# SCULPY V2.5 P0 — Web Push and enquiry reminders — 2026-11-02

Status: implementation; not published. Real iPhone acceptance not yet performed. P1 internal messaging is intentionally deferred until P0 passes actual phone acceptance.

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

Pending implementation, automated checks, actual deployed-source/schema/scheduler readback and manual iPhone acceptance. No passing test or merge is a release claim.
