# SCULPY V2.4.1 — 2026-11-02

Status: implementation and verification; publication pending.

## Requested behavior

- Remove the ordinary legacy `admin` role from production account creation and role editing. The management roles are System administrator (`operations`, JZ) and Studio owner (`owner`, Miranda). Existing employee/read-only roles are separate from these management roles.
- Owner and operations can view the business dashboard and manage enquiries, bookings and communication records. Only operations can list/manage login accounts, create identities, change roles/active state and reset passwords. Existing human confirmation steps remain in place.
- Remove every in-app installation entry on desktop, phone, sign-in, authenticated workspace, Demo navigation and Settings. No installation instructions dialog or programmatic install prompt remains. Users add the app manually through the browser menu.
- Put enquiries first for both operations and owner, including the first sidebar item. Reports follow the order list.
- Refine the authenticated desktop/tablet/phone workspace toward a professional business application: consistent system typography, restrained green accents, clearer page/data hierarchy, compact spacing, smaller corner radii, aligned controls and stronger information density. Account management becomes a concise member list with expandable editing; empty financial trends use a compact empty state instead of twelve blank bars. Phone inputs retain 16 px text and primary touch controls remain large.

## Implementation and compatibility

`src/domain/accounts.js` supplies one assignable-role list to the account UI and authenticated account Edge Function. The retired role is rejected before an Auth identity is created. A database CHECK constraint also rejects it through account updates, service provisioning and direct profile inserts. Existing accounts are inspected before application; this release does not promote, rename or reset them.

The PostgreSQL enum keeps its historical token so existing migrations/function signatures do not need a destructive rebuild; it cannot be assigned to a production profile. Demo's internal local `admin` identity is a separate fictional-data implementation, not an assignable production account role.

`setupWebApp` now only suppresses automatic installation promotion and registers the existing scoped, data-free offline worker. It injects no DOM, stores no install event and never calls `prompt()`. Manifests, icons, manual browser installation and existing shortcuts remain available.

## Verification

Focused tests cover server-side denial of account creation/password reset for owner, legacy admin, employee, read-only and inactive identities; retired-role rejection before Auth creation; database assignment rejection; owner business writes and operations-only account RPCs. Existing account creation/reset auditing and self-protection are retained.

Local complete suite: 185 passed, 2 PostgreSQL-only concurrency checks skipped pending PostgreSQL CI. Fictional desktop preview was visually checked for the workspace and account list. Browser/PostgreSQL CI and final production checks are pending.

Browser regression checks inspect every account role selector, operations account management, owner business/communication editing, and no installation UI on desktop, phone, iPhone, login, Demo, Settings or standalone mode. Existing manifest/icon, offline/reconnect and data-free cache checks remain.

## Rollback

Revert the frontend and account-admin function to the preceding source. Retaining the CHECK constraint keeps the retired role unavailable; restore assignment only through an explicitly reviewed migration that drops `profiles_no_legacy_admin`. No user data, password or existing role is removed by this release. Preserve the newer live sculpy-chat runtime; patch release descriptions only.

## Deployment evidence

Record PR, checks, production migration/function versions, frontend deployment and resource verification after completion. Tests and merges alone do not prove publication.
