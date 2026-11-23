# Sculpy — SCULP Studio internal app

## 版本与更新

- **每日行程 @ 推送（2026-11-22，已上线）**。新留言 @ 对方时向其已订阅设备推送，点开定位到该日留言。[更新记录](docs/CHANGELOG.md#每日行程推送)

- **正式模式与安全检查（2026-11-21，已上线）**。移除演示工作区和匿名 AI 调用，收紧网站发布范围。[发布与检查记录](docs/CHANGELOG.md#正式模式与安全检查)

- **通知设备总览（2026-11-21，已上线）**。JZ 可在「账户管理 → 团队账户」标题下方点「通知设备」，查看各账号的设备订阅、设备类型及通知类别。[发布记录](docs/CHANGELOG.md#通知设备总览)

- **行程自动时区（2026-11-21，已上线）**。每日行程按当前设备显示时间，无法识别时使用多伦多。航班保留机场当地时间，酒店日期与订单一致。[发布记录](docs/CHANGELOG.md#行程自动时区)

- **酒店退房标注（2026-11-21，已上线）**。每日行程突出酒店入住和退房，续住日使用普通酒店标签。[发布记录](docs/CHANGELOG.md#酒店退房标注)

- **每日行程留言（2026-11-21，已上线）**。JZ 与 Miranda 可在每天的行程下方留言、互相 @，并查看其他日期提到自己的未读留言。[发布记录](docs/CHANGELOG.md#每日行程留言)

- **询盘精简与共享任务（2026-11-21，已上线）**：询盘主操作为转订单、备注及失败原因，保留折叠资料和沟通记录。行程清单合入 JZ/Miranda 工作任务及 Marketing 排期，可直接完成，未完成任务顺延。[发布记录](docs/CHANGELOG.md#询盘精简与共享任务)

- **Miranda 行程按天切换（2026-11-21，已上线）**：日期左右增加前一天、后一天按钮，单击切换一天。[发布记录](docs/MIRANDA_PERSONAL_SCHEDULE.md#按天切换)

- **在此设备保持登录（2026-11-21，已上线）**：登录时可选择保存有效会话，同一个浏览器或已安装的应用关闭再打开时可恢复登录。[发布记录](docs/CHANGELOG.md#保持登录)

- **Miranda 行程时间排序（2026-11-21，已上线）**：个人行程移到工作台前。当天有时间的事项按时刻排列，航班起飞、抵达及酒店入住有醒目标注。[发布记录](docs/MIRANDA_PERSONAL_SCHEDULE.md#导航排序与重要事项)

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

## 正式工作区

团队成员从 [SCULP OS](https://2ez4jz.github.io/sculp-database/) 登录。客户、询盘、订单、沟通记录、工作任务和行程按当前账号权限读取。设备安装、推送提醒和保持登录沿用正式工作区设置。

开发测试使用本地测试数据。网站发布只包含正式页面运行所需的资源及其许可证。运行文件集合变化时，在仓库根目录执行 `python3 scripts/build-pages.py OUT --write-branch-config`，其中 OUT 为新的临时目录。发布后自动核对线上文件及应返回 404 的旧路径。
