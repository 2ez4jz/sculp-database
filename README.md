# Sculpy — SCULP Studio internal app

## 版本与更新

- **最近有部署记录的业务版本：V2.5 P0（2026-11-02）**，推送与询盘提醒已记录部署；真实 iPhone 送达仍待验收。见 [V2.5 发布记录](docs/V25_RELEASE.md)。
- **当前开发候选：SCULP OS V3.0 Phase 1（2026-11-12）**，包含日常工作台、九区导航和客户/任务基础整合；未发布生产。见 [开发日志](docs/V3.0_PHASE1_CHANGELOG.md)与[测试及待验收项](docs/V3.0_TEST_REPORT.md)。
- **[完整版本历史与更新记录](docs/CHANGELOG.md)**：以后每次版本更新都在这里登记，并同步此入口。代码完成、测试通过和生产发布分别记录。

Every SCULP booking becomes a record connecting the client, artist, venue, partners, notes and photos.

## Run

No build or dependencies required. Run `python -m http.server 4173` in this folder and open http://localhost:4173.

For development checks, use Node.js 24 and run `npm ci`, then `npm test`.
Dependencies are for tests only. Cloud order editing, permission checks, monthly
reporting and PostgreSQL acceptance instructions are in [Cloud operations V1](docs/CLOUD_OPERATIONS_V1.md).
The new operations migration is locally verified; deployment and real-account
cross-device acceptance remain pending.

## Included

- 300 linked fictional bookings, 300 fictional clients, 9 team profiles, 6 venues and 8 partners.
- Booking list and month calendar, global booking search, artist/service/status/date/venue filters.
- Client, artist, venue and partner profiles with calculated collaboration history.
- Booking notes with original text, prepared demo summaries and structured preferences.
- Galleries, category filters, full-size image previews and personal portfolio selection/reordering.
- Official artist galleries read directly from each member's public SCULP Studio portfolio. Remaining public site work is assigned to Miranda; studio interior/location images are excluded.
- Admin/Artist interface simulation. Artist view only shows assigned bookings, service details and own statistics; CRM/contact details and marketing opportunities are hidden in the interface.
- Sculpy voice capture, deploy-ready OpenAI transcription, reviewed AI extraction, semantic demo-database search and browser-local note persistence.
- Installable web-app manifest, Demo/Production configuration boundary and formal Supabase schema with row-level policies.
- Context-aware Sculpy voice/text panel on order and profile pages, reviewed multi-destination notes/preferences/follow-ups, and browser-local persistence. See `docs/CONTEXT_MEMORY.md` for cloud integration prerequisites.
- Eight-step presentation mode and responsive layouts.

## Demo boundaries

This repository is public and contains only fictional business records. Existing SCULP portfolio images are associated with mock bookings solely to demonstrate navigation; those associations do not describe real clients or services.

Identity switching is an interface simulation, not authentication or data protection. All seed data is shipped to the browser. Do not add real client information until server-side access controls exist.

The intended production access model has two global business viewers only: Jz (`operations`) and Miranda (`owner`). Jz additionally sees system health, data quality, AI configuration and audit events. Miranda sees the full business view without technical administration. Artists see only assigned work and their own portfolio.

Sculpy's online mode runs through one Supabase Edge Function. OpenAI credentials remain in Supabase Secrets and are never shipped to the browser. Search receives only the repository's fictional demo catalog; no real client records are present. The checked-in config currently selects `openai` mode; `mock` is an explicit configuration override, not an automatic fallback. Added notes and portfolio choices still persist only in the current browser via localStorage.

## Presentation path

Use **发布会演示** on Bookings: bookings → wedding detail → client → venue → photographer → artist → media → Sculpy. On the last step select **试试发布会示例**, review the fields, save, then show the added record in the booking.

## Production foundation

`supabase/migrations/001_initial_schema.sql` defines the V1 foundation. `supabase/migrations/002_production_core.sql` adds production billing, payments, consent history, strict Jz/Miranda access boundaries, auditable AI conversations and trusted reporting views. See `docs/DATABASE_V2.md` for the full model and rollout order. `supabase/seed_team.sql` contains only public employee profiles and service definitions. Connect a private Supabase project plus server-side OpenAI endpoints before enabling real login or importing client data.

## Cloud intake (2026-10-08)

Authenticated owner/operations accounts can open **录入新订单**, retain the original message, review a client match and booking fields, and explicitly save through `sculpy_confirm_intake`. The transaction persists the client, booking, optional artist assignment and source together. Cloud details and Sculpy context read the same canonical booking. Budget is not price; unknown times/prices are not guessed. Demo entry remains local-only.

The AI extraction function is deployed and enabled after explicit authorization. It sends source text to OpenAI only when an authenticated owner/operations user clicks **识别订单**; extracted fields remain drafts until human confirmation. See [the work log](docs/WORK_LOG.md) for verification and remaining acceptance boundaries.

## Bilingual fictional demo

Open `?demo=1#bookings` for the fictional workspace. First visits default to English; the English / 中文 control remembers the browser preference. `lang=en` or `lang=zh` can explicitly choose a language. `i18n/catalog.js` contains UI and sample-data translations; `i18n/runtime.js` translates the presentation without modifying records, option values, drafts, or persisted data. English service names are searchable. The adapter runs only in the fictional demo; authenticated workspaces and the database are unchanged. Online AI receives a language preference in demo requests, but the deployed backend and its response language were not changed or verified by this frontend update.

## Cloud conversational monthly reports (2026-10-10)

Authenticated owner/operations chat can query the canonical cloud monthly report. Service-month completed booking value and receipt-month gross original receipts remain separate CAD measures; missing prices and refund limitations are surfaced. Demo lists, profiles, channels, reports and AI share one editable 300-order baseline. Prior 24-order browser state and chat caches are removed. Changes persist in this browser; reset restores 300 orders. Unknown prices stay blank; completed value and gross receipts remain separate. Real-account and two-device acceptance remains outstanding.


## Install on a phone or computer (updated 2026-11-02)

Add Sculpy manually through the browser menu. On iPhone/iPad, open Safari → Share → Add to Home Screen. Desktop and Android users use their browser's installation menu. The app does not inject installation buttons, settings cards, instructions dialogs or prompt controls into the sign-in page, workspace or Demo, and suppresses automatic install promotion.

The existing regular/Demo manifests, distinct launch URLs, sprite icons and data-free offline/retry service worker remain available. Application/business data is not cached for offline editing. Existing installations continue using their saved icons and launch URLs.

`scripts/pwa.cjs` verifies manifests/icons, separate launches, absence of app installation controls across desktop/mobile/iPhone views, no script-triggered install prompt, scoped offline/reconnect behavior and the data-free cache. Physical OS installation is a manual browser action.
