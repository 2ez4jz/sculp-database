# Sculpy V2.1 — Data integrity and plain-language analysis acceptance

Date: 2026-10-13. Scope: fictional 300-booking demo ONLY. This is the first implementation workstream, not evidence of production acceptance.

## Product boundary
Sculpy calculates from trusted tools and explains observed business data in everyday Chinese/English. It must not prescribe pricing, hiring, marketing spend, or staffing changes unless explicitly asked. Even when asked, label recommendations separately from measured facts and do not invent causes.

## Confirmed baseline (source inspection)
- One editable 300-booking fictional baseline is shared by demo lists, profiles, reports and AI. Browser changes are local, not production data.
- Demo reports distinguish completed service value and gross original receipts. Existing unit tests assert daily, monthly, cross-filter and grouping behavior.
- Analysis charts are generated from reported values and have unit tests for periods, receipt date versus service date, sparse data, escaping, chart selection and follow-up filters.
- The cloud monthly RPC distinguishes service-month value from receipt-month *gross original* receipts. It is **not** a net receipts or profit report.
- Real-account two-device acceptance and deployed migration verification remain pending. Do not import real customer records or promote this branch to production before those gates pass.

## Financial metric contract (must be enforced before labeling charts)
| Metric | Definition | Do not call it |
| --- | --- | --- |
| Booking count | Count eligible bookings under selected status/date filters; cancellation exclusion must be explicit | Number of services or number of artists |
| Completed service value | Sum explicit CAD line-item values (or explicit booking-price fallback) for completed services in service-date range | Cash received, revenue recognized, profit |
| Gross original receipts | Original successful payment amounts grouped by actual payment date, including refund-status payments as defined in cloud RPC | Net receipts, earnings, profit |
| Artist compensation | Sum documented payouts/obligations only if available; explain whether paid or accrued | Entire operating costs |
| Service contribution after artist pay | Completed service value minus corresponding artist pay, only if the same bookings and cost scope match | Net profit |
| Net profit | Requires all relevant costs, refund treatment, time recognition and a documented definition | Inferable from payment totals |
| Refund-adjusted net receipts | Not supported until dated refund amount ledger is implemented | Current gross receipts |

Unknown prices and missing payment dates are missing, NOT zero. Use integer cents for money; avoid float accumulation. Date boundaries are America/Toronto. Future completed statuses require warning. Multiple artists on one booking must not multiply booking value. Artist participation counts are not the same as lead responsibility.

## Phase 1 acceptance scenarios
1. Verify all 300 fictional orders match across list/report/AI; browser reset restores original baseline.
2. Reconcile monthly reports to independent programmatic sums for every month, not only one chosen month.
3. Verify grouped channel/service rows sum to the ungrouped total; artist assignment reporting must declare whether counts are exclusive or participatory.
4. A booking done in September and paid in October must appear in September completed service value and October receipts, never both as September receipts.
5. A completed booking with unknown price must increase the unpriced count and never be silently priced at CAD 0.
6. Refund/partial refund statuses must trigger an explicit gross-original-receipt limitation and must not generate a net number.
7. A two-artist booking must contribute service value exactly once to overall totals.
8. Cancelled, inquiry, confirmed, soft-deleted and completed bookings must not be conflated.
9. Check CAD-only monetary sums and warnings for any non-CAD amounts.
10. AI answer, chart labels, chart points and report number must reconcile exactly; fabricated model numbers cannot override tool output.
11. For missing data, explain “无法判断” and what specific measurement is absent.
12. Explain financial ratios using one plain-language example and label its denominator and time period.
13. If only one or two values are needed, omit decorative chart.
14. Multi-turn questions (“九月婚礼收入” → “只看Google” → “用饼图” → “讲简单点”) preserve filters and metric until changed.
15. Model must distinguish observation (“工资占比上升”) from unproven cause (“工资上涨因为效率低”).
16. 最新方向（2026-10-14）：经营分析默认给一条有证据支持的低风险核查建议；具体调价、增员、预算等行动须说明假设，不能视为已批准。
17. Validate Chinese and English answers against the same numerical fixtures.
18. No real names, payments, credentials, or customer records in public demo fixtures or test logs.

## Work queue
- [x] Inspect existing README, cloud reporting contract, test scripts, and identify definitions and outstanding deployments.
- [x] Add a per-month independent reconciliation suite and negative cases for multi-artist and refund interpretation.
- [ ] Audit each UI/AI label for value-versus-receipt and margin-versus-profit mistakes.
- [x] Implement a consistent observation / common interpretation / unknown-cause response style in Sculpy prompt.
- [ ] Run full Node 24 suite and focused 30-question evaluation; document actual pass/fail, not invented scores.
- [ ] Separate draft PR review from any deployment. Production promotion requires explicit approval and real-account acceptance.

## Release gates
P0: exact calculation and chart-to-data consistency; zero fabricated financial facts; no access-control regression. P1: >=90% reviewed understanding/clarity on a declared evaluation set. Report test environment, sample size, failing cases and unresolved issues. Do not mark a gate passed merely because code is committed.

最新审查与修复证据见 [2026-10-14完整review](SCULPY_REVIEW_2026-10-14.md)。以上历史工作队列不应被当作当前部署状态；未执行30问质量门槛不能标为通过。
