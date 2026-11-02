# SCULPY V2.4.1 — 2026-11-02

Status: deployed and verified on 2026-11-02. Physical-device business acceptance remains open.

## Requested behavior

- Remove the ordinary legacy `admin` role from production account creation and role editing. The management roles are System administrator (`operations`, JZ) and Studio owner (`owner`, Miranda). Existing employee/read-only roles are separate from these management roles.
- Owner and operations can view the business dashboard and manage enquiries, bookings and communication records. Only operations can list/manage login accounts, create identities, change roles/active state and reset passwords. Existing human confirmation steps remain in place.
- Remove every in-app installation entry on desktop, phone, sign-in, authenticated workspace, Demo navigation and Settings. No installation instructions dialog or programmatic install prompt remains. Users add the app manually through the browser menu.
- Put enquiries first for both operations and owner, including the first sidebar item. Reports follow the order list.
- Show “欢迎最美化妆师Miranda亲临工作室指导工作” only for the verified `sculp_miranda` profile. Other accounts keep the standard workspace heading; the personal heading wraps on phone screens.
- Refine the authenticated desktop/tablet/phone workspace toward a professional business application: consistent system typography, restrained green accents, clearer page/data hierarchy, compact spacing, smaller corner radii, aligned controls and stronger information density. Account management becomes a concise member list with expandable editing; empty financial trends use a compact empty state instead of twelve blank bars. Phone inputs retain 16 px text and primary touch controls remain large.

## Implementation and compatibility

`src/domain/accounts.js` supplies one assignable-role list to the account UI and authenticated account Edge Function. The retired role is rejected before an Auth identity is created. A database CHECK constraint also rejects it through account updates, service provisioning and direct profile inserts. Existing accounts are inspected before application; this release does not promote, rename or reset them.

The PostgreSQL enum keeps its historical token so existing migrations/function signatures do not need a destructive rebuild; it cannot be assigned to a production profile. Demo's internal local `admin` identity is a separate fictional-data implementation, not an assignable production account role.

`setupWebApp` now only suppresses automatic installation promotion and registers the existing scoped, data-free offline worker. It injects no DOM, stores no install event and never calls `prompt()`. Manifests, icons, manual browser installation and existing shortcuts remain available.

## Verification

Focused tests cover server-side denial of account creation/password reset for owner, legacy admin, employee, read-only and inactive identities; retired-role rejection before Auth creation; database assignment rejection; owner business writes and operations-only account RPCs. Existing account creation/reset auditing and self-protection are retained.

Local complete suite: 185 passed, 2 PostgreSQL-only concurrency checks skipped locally. PostgreSQL CI subsequently passed 21 checks with concurrent edits and fixture backup/recovery. Browser CI passed 100 unit/handler contracts, 23 database checks and the complete interaction suite. Communication QA covered 6 viewport widths, multiple real-format PNG fixtures, lost-acknowledgement replay, manual AI-summary edits and lead conversion history. Account and PWA checks covered management boundaries, the exact Miranda greeting, enquiries-first ordering, and removal of installation UI.

Fictional desktop and 390 × 844 phone previews were visually checked, including the long welcome heading and enquiry controls. No real customer data was written into Demo. The model, transcription and storage browser adapters are mocked; this is not a live model-quality or physical microphone test. Chat and multi-step capability checks passed 16/16 after updating release knowledge.

Browser regression checks inspect every account role selector, operations account management, owner business/communication editing, and no installation UI on desktop, phone, iPhone, login, Demo, Settings or standalone mode. Existing manifest/icon, offline/reconnect and data-free cache checks remain.

## Rollback

Revert the frontend and account-admin function to the preceding source. Retaining the CHECK constraint keeps the retired role unavailable; restore assignment only through an explicitly reviewed migration that drops `profiles_no_legacy_admin`. No user data, password or existing role is removed by this release. Preserve the newer live sculpy-chat runtime; patch release descriptions only.

## Deployment evidence

- Feature PR: [#38](https://github.com/2ez4jz/sculp-database/pull/38), final checked head `c58ed141f53f2f320dec24279809ba681b42e095`; merged as `3cc9f71bfb4df82105f4f9b485b89a8f7932f6b4`.
- PR checks: [41443912438](https://github.com/2ez4jz/sculp-database/actions/runs/41443912438), browser-check and postgres-check both successful. No test failure was waived.
- Existing Pages deployment: [41444359487](https://github.com/2ez4jz/sculp-database/actions/runs/41444359487), successful. Built-in Pages run [41444358416](https://github.com/2ez4jz/sculp-database/actions/runs/41444358416) also successful.
- Live frontend: https://2ez4jz.github.io/sculp-database/ — HTTP 200 and byte-for-byte comparison passed for index.html, login/index.js, login/workspace.js, services/auth.js, studio-polish.css, pwa/install.js and domain/accounts.js after publication.
- Production migration `20261102115423_retire_legacy_admin_role.sql` applied; `profiles_no_legacy_admin` read back with `convalidated = true`. No legacy-admin profiles existed. JZ operations and Miranda owner remain active; no existing account or password was changed.
- Production `account-admin` v2 ACTIVE; all 3 deployed source files exactly match the release source. It authenticates the caller and checks the active operations profile before account operations.
- Production `sculpy-chat` v47 ACTIVE; all 17 files read back and matched the deployment. Only product-knowledge.js and the shared release-facts module changed from v46; all 15 newer runtime implementation files were preserved. No new API key or model service was added.
- Screenshots contain fictional QA data: [desktop](screenshots/v241-miranda-desktop-20261102.jpg) and [phone](screenshots/v241-miranda-mobile-20261102.jpg).

## Human acceptance still required

Sign in with JZ and Miranda on actual devices, inspect the greeting and enquiry-first layout, and perform normal business acceptance of recording, real speech transcription, screenshot interpretation and cross-device cloud reading. Automated UI tests and deployed resource checks do not prove live AI quality or physical-device usability. No requested feature is left as a plan; these are acceptance checks.

### Published follow-up: editable account welcomes

The fixed Miranda heading is now seeded in cloud profile data. JZ can edit any account’s welcome from the header beside account management, with preview, reset-to-default, audit, conflict and retry protection. Verified deployment and test evidence: [editable account welcomes](WELCOME_EDITOR_2026-11-02.md).
