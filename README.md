# Sculpy — SCULP Studio internal app

## 版本与更新

- **Miranda 行程推送精简（2026-11-21，已上线）**：推送显示行程、一个当地时间和地点简称。航班可显示机场代码和航站楼，点开查看完整行程。[发布记录](docs/MIRANDA_PERSONAL_SCHEDULE.md#推送文案精简)

- **Miranda 行程提醒与北京时间（2026-11-21，已上线）**：定时安排可在关键时刻前及早起行程前一晚收到包含名称、时间和地点的推送。自 11 月 23 日北京时间 00:00 起，个人行程页按北京时间选日，航班同时显示机场当地时间。实体设备送达待验收。[发布记录](docs/MIRANDA_PERSONAL_SCHEDULE.md#行程提醒与时区)

- **Miranda 行程首屏精简（2026-11-21，已上线）**：打开即见今日清单，点击日期展开月历。Miranda 当天到期的工作待办与个人安排同列，可直接打开原任务处理。见 [发布记录](docs/MIRANDA_PERSONAL_SCHEDULE.md#首屏调整)。

- **Miranda 每日个人行程与待办（2026-11-21，已部署，待实机验收）**：独立个人行程页面，月历选日期查看航班、酒店、工作和待办；支持当地时间/时区、跨日住宿、备注、编辑删除与完成勾选。仅 JZ/Miranda 两个现有有效账户共同读写，云端同步并防止旧版本覆盖。隔离检查及PostgreSQL回归通过，前端、数据库和聊天说明已验证发布；真实设备验收状态及已知回归限制见 [发布记录](docs/MIRANDA_PERSONAL_SCHEDULE.md)。

- **SCULP OS 独立分类页面 + 精简营销日历（2026-11-18，待部署）**：九类侧边导航切换后只显示当前页面，滚动不会滑入其他业务区域；Dashboard 快捷操作与通知可切换到对应页面。Marketing 四周24篇日历改为每篇一个「已完成」勾，保留素材分镜、完整文案、单篇团队留言和 @推送。云端仍复用既有安全 RPC；本次不改变权限或自动发布能力。自动化测试及线上部署需分别记录。

- **已合并并线上验证：SCULP OS Marketing Collaboration（2026-11-18）**：Holiday 四周24篇日历 JZ/Miranda 跨账号共享状态、留言及 @团队管理人员；@复用已订阅的 Web Push 并点击打开对应营销内容。数据库迁移、通知 Edge Function v2、GitHub Pages 页面均已验证发布；两位真实账号/真实设备推送仍待验收。无订阅不承诺送达；通知正文不包含客户资料。

- **开发候选：SCULP OS Marketing Calendar（2026-11-18，未部署）**：将24篇社媒内容改为四周日历，点击日期查看逐张图片/逐段 Reel 镜头、完整文案与可勾选制作清单。Checklist 目前仅保存在当前账号的本机浏览器，不跨设备/账号同步；团队共用内容稿件不变。测试及真实账户验收待完成。

- **开发候选：SCULP OS 3.2 Marketing Plan（2026-11-18，未部署）**：Marketing｜营销中心增加 Holiday 四周24篇社媒内容的团队共享只读计划，JZ（operations）与 Miranda（owner）沿用登录权限查看，按周/平台筛选、展开封面、配图/分镜、完整文案并复制。不含自动发布、素材上传或跨设备状态编辑；线上验收待完成。

- **当前线上版本：SCULP OS 3.2（2026-11-16，已部署，待本版用户验收）**：客户资料编辑、任务负责人分配/改派与我的/团队筛选、UTF-8 CSV 历史客户/订单预览、匹配与分批导入。前端、数据库及聊天说明均已验证发布；基线 V3.1 已由 JZ 验收。见 [V3.2 发布与验证记录](docs/V3.2_RELEASE.md)。

- **此前业务版本：SCULP OS 3.1（2026-11-16，JZ 已验收）**：客户档案及联系方式、分页订单历史、姓名/邮箱/电话搜索；跟进任务完成/取消/改期/重新打开与状态筛选。Gmail 配置暂停。见 [V3.1 更新与验证记录](docs/V3.1_RELEASE.md)。

- **手机顶部固定菜单修正（2026-11-12，已上线）**：横向菜单固定、品牌标题随页面滚走，模块跳转保留顶部空间。见 [验证与发布记录](docs/V3.0_MOBILE_NAV_20261112.md)。

- **此前业务版本：SCULP OS 3.0 Phase 1 + Phase 2.5（2026-11-12）**：工作台、九区导航、客户/任务基础、Gmail 设置和邮件中心、数据库及 Gmail 后端已部署。Google OAuth 配置未就绪，真实邮箱尚未连接；邮箱设置页已明确列出配置前置步骤。见 [正式部署记录](docs/V3.0_DEPLOYMENT_20261112.md)、[邮箱配置指南](docs/V3.0_GMAIL_SETUP_GUIDE.md)。
- **此前业务版本：V2.5 P0（2026-11-02）**，推送与询盘提醒已有部署记录；真实 iPhone 送达仍待验收。见 [V2.5 发布记录](docs/V25_RELEASE.md)。
- **[完整版本历史与更新记录](docs/CHANGELOG.md)**：以后每次版本更新都在这里登记，并同步此入口。代码完成、测试通过和生产发布分别记录。

Every SCULP booking becomes a record connecting the client, artist, venue, partners, notes and photos.

## Run

No build or dependencies required. Run `python -m http.server 4173` in this folder and open http://localhost:4173.

For development checks, use Node.js 24 and run `npm ci`, then `npm test`.
Dependencies are for tests only. Cloud order editing, permission checks, monthly
reporting and PostgreSQL acceptance instructions are in [Cloud operations V1](docs/CLOUD_OPERATIONS_V1.md).
Current production deployment evidence is recorded in the version links above;
V3.2 real-account cross-device acceptance remains pending.

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
