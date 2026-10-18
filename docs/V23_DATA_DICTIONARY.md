# SCULPY V2.3 数据字典与业务口径

统一时区为 `America/Toronto`。日期筛选含开始及结束日，在 SQL 中转换为本地日的左闭右开时间范围。历史补录只有日期时记录为该日本地零点；当日操作使用实际操作时间。所有汇总金额用 PostgreSQL numeric 运算，RPC 返回 CAD 分字符串，前端用 BigInt 格式化。

| 记录 | 主要字段 | 含义 |
|---|---|---|
| bookings | confirmed_at, confirmation_date_quality | 老板确认的业务时间；unknown 保留空日期，不能用录入时间冒充 |
| bookings | starts_at, cancelled_at, edit_version | 服务、取消时间和并发编辑版本 |
| bookings | contract_role, parent_booking_id | contract 是独立合同；included 是同客户主合同内的试妆/家属等服务，不重复计签约及收款 |
| bookings | originating_enquiry_id | 首次关联成交的主来源；同合同多条询盘保留关联，合同金额只归一次 |
| booking_services | 原有服务与价格明细 | 不另算订单数。老板确认的合同总额 price_cad 包含所有明细；合同整体改价保存在事件中，不再把明细额加一次 |
| booking_business_events | event_type, effective_at, recorded_at, amount, delta, service_at, state, evidence | 追加式签约、改价、改期、完成、取消与上线基线。effective_at 是业务日期，recorded_at 是系统保存时间，禁止覆盖历史 |
| website_enquiries | entry_channel, attribution_source, attribution_detail | 提交入口与客户实际来源独立；UTM/referrer 只作证据，不自动认定获客来源 |
| website_enquiries | first_contact_at, contacted_at, quoted_at, quoted_amount, last_contact_at, handled_by | 首次联系、阶段里程碑、报价、最近联系及负责人 |
| website_enquiries | status, lost_reason, booking_id, converted_at, revision | open 与 lost 分开；spam 不计分母；won 必须关联已确认独立合同；成交周期优先用真实合同确认日期 |
| website_enquiries | original_details, submission_fingerprint | 保留原始需求及原始提交的重试身份；管理员后续跟进不会破坏相同提交的幂等性 |
| payments | 原有 invoice_id, amount, currency, status, paid_at | 继续使用现有支付表；不新建收款账本 |
| payments | payment_kind, refund_of, request_id | deposit/balance/refund；退款为关联原收款的独立正金额记录，方向由 kind 决定；请求重试不重复入账 |
| sculpy_private | wedding_requests, wedding_coverage, enquiry_limits | 非公开的幂等请求、可可靠观察的历史起点、网站持久化限流 |

| 指标 | 计算与限制 |
|---|---|
| 新签约金额/场次 | 期间 confirmation 事件；金额使用确认时快照，取消不抹去原签约；未知日期不归入精确期间 |
| 合同变更净额 | 期间 amendment 的新金额减原金额；追加服务不增加签约场次 |
| 取消金额 | 期间 cancellation 事件的当时合同金额 |
| 净合同额变化 | 新签约 + 合同变更 − 取消；这是合同变化，不是收入或到账 |
| 当前未来预订 | 当前有效 confirmed 独立婚礼合同；未来18个月分布按服务日期；取消剔除 |
| Booking Pace | 各观察点前最后一个可靠事件快照；同比观察点相差一年、当地墙上时间一致，服务年度也相差一年。历史覆盖前或日期/价格不足，不给假同比 |
| 本期净到账 | 实际成功原收款减实际成功退款，按各自 paid_at；原收款不会因退款改写或消失 |
| 未收余额 | 当前有效合同总额 − 累计有效净收款，最低为0；超收额单列。没有付款计划时不能把全部未收款都称为尾款或逾期 |
| 询盘成交率 | first_contact_at 在选定批次内、截至当前 won / 非spam 询盘数；open 尚未结束，不能当作明确流失 |
| 渠道成交金额/均价 | 仅主来源询盘对应独立合同的原签约金额；无价格的均价为未知，不能补0 |
| 比较 | 单月范围使用上月相同本地日进度（整月对整月）；其他范围用前一等长窗口。同比用相同本地边界。缺失历史必须保留覆盖提示 |

公开 RPC：`sculpy_wedding_command`（显式管理员确认）、`sculpy_wedding_detail`、`sculpy_wedding_report`。包装函数为 security invoker；必要私有函数使用受控 security definer，并在每次调用检查真实 Auth UID 及 active owner/operations。官网 `sculpy_submit_website_enquiry` 只授予 service_role，由受限 Edge Function 调用。

合同签约、改价及付款保留幂等请求；合同改价使用 edit_version 防止覆盖其他窗口。成功支付不可直接覆盖；退款累计不得超过原收款、不能早于原收款、币种须与合同/发票一致。重复转账编号被拒绝；同日同类型同金额无编号的疑似重复也被拒绝，可用真实不同编号区分合法多笔付款。

真实登录入口和300单虚构演示仍然隔离。V2.3只读正式云端表，不会从演示补造正式历史。英文功能沿用原架构，本轮新增经营界面以中文为主，完整英文文案后续完善。
