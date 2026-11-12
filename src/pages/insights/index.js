import {renderMonthlyAnalytics} from "./monthly.js";
export function createInsights({
  getContext,
  available,
  visibleMedia,
  isTechnical,
  head,
  stats,
  esc,
  link,
  money,
  artists,
  clients,
  venues,
  partners,
  bookings,
  notes,
  media,
  bookingArtists,
  artist,
  serviceName,
  config,
}) {
  function bars(list, dimension, arr) {
    const rows = arr
        .map((x) => [
          x,
          list.filter((b) =>
            dimension === "artist"
              ? b.artistIds.includes(x.id)
              : dimension === "venue"
                ? b.venueId === x.id
                : b.partnerIds.includes(x.id),
          ).length,
        ])
        .sort((a, b) => b[1] - a[1]),
      max = Math.max(...rows.map((r) => r[1]), 1);
    return rows
      .filter((r) => r[1])
      .map(
        ([x, n]) =>
          `<div class="bar-row">${getContext().role === "artist" && dimension === "artist" ? esc(x.name) : link(dimension === "artist" ? "artists" : dimension === "venue" ? "venues" : "partners", x.id, x.name)}<div class="bar-track"><div class="bar-fill" style="width:${(n / max) * 100}%"></div></div><span>${n} 场</span></div>`,
      )
      .join("");
  }
  function technicalOverview() {
    const allNotes = [...notes, ...getContext().state.notes],
      covered = new Set(allNotes.map((n) => n.entityId)).size,
      followUps = allNotes.filter(
        (n) => (n.structuredData?.opportunities || []).length,
      ).length;
    return `<section class="panel technical-panel"><div class="section-head"><div><div class="eyebrow">JZ ONLY / OPERATIONS</div><h2>系统与数据后台</h2></div><span class="pill">仅 Jz 可见</span></div><div class="ops-grid"><div><strong>${Math.round((covered / bookings.length) * 100)}%</strong><span>场次日志覆盖</span></div><div><strong>${followUps}</strong><span>可跟进机会</span></div><div><strong>${media.length}</strong><span>待迁移媒体记录</span></div><div><strong>0</strong><span>孤立场次记录</span></div></div><div class="divider"></div><div class="entity-row"><span class="label">全局管理权限</span><span>Jz · Miranda</span></div><div class="entity-row"><span class="label">技术与审计权限</span><span>Jz only</span></div><div class="entity-row"><span class="label">AI 草稿策略</span><span>员工确认后写入</span></div><div class="entity-row"><span class="label">当前数据环境</span><span>${config.environment.toUpperCase()} · ${config.aiMode.toUpperCase()}</span></div></section>`;
  }
  function insights() {
    const list = available(),
      completed = list.filter((b) => b.status === "Completed"),
      repeat = clients.filter(
        (c) => list.filter((b) => b.clientId === c.id).length > 1,
      ).length;
    return (
      head(
        "insights",
        getContext().role === "admin"
          ? "从已有工作记录里，看到团队的积累。"
          : "看看自己的作品和经历，正在怎样积累。",
      ) +
      stats([
        [list.length, "收录场次"],
        [completed.length, "已完成场次"],
        [repeat, "有多场记录的客户"],
        [
          getContext().role === "admin"
            ? money(completed.reduce((a, b) => a + b.price, 0))
            : visibleMedia().length,
          getContext().role === "admin"
            ? "已完成订单总额 · CAD"
            : "关联作品照片",
        ],
      ]) +
      (isTechnical() ? technicalOverview() : "") +
      renderMonthlyAnalytics({records:list,context:getContext(),esc,money}) +
      `<div class="two-col"><div class="stack"><section class="panel"><h2>常去的场地</h2>${bars(list, "venue", venues)}</section><section class="panel"><h2>常合作的摄影师</h2>${bars(
        list,
        "partner",
        partners.filter((p) => p.type === "Photography"),
      )}</section><section class="panel"><h2>常合作的 Planner</h2>${bars(
        list,
        "partner",
        partners.filter((p) => p.type === "Planner"),
      )}</section></div><div class="stack"><section class="panel"><h2>${getContext().role === "admin" ? "团队场次数" : "我的场次"}</h2>${bars(list, "artist", getContext().role === "admin" ? bookingArtists : [artist(getContext().artistId)])}<p class="fake-note">协作场次会计入每位参与者，不代表独立订单总数。</p></section><section class="panel"><h2>${getContext().role === "admin" ? "服务与订单金额" : "服务分布"}</h2>${Object.keys(
        serviceName,
      )
        .map(
          (s) =>
            `<div class="entity-row"><span class="label">${serviceName[s]}</span><span class="small">${getContext().role === "admin" ? money(completed.filter((b) => b.service === s).reduce((a, b) => a + b.price, 0)) : list.filter((b) => b.service === s).length + " 场"}</span></div>`,
        )
        .join("")}</section></div></div>`
    );
  }
  return insights;
}
