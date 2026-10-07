import { serviceRevenue } from "../../domain/analytics.js";
export const wantsRevenueChart = (q) =>
  /(饼图|pie|占比)/i.test(q) && /(收入|营收|销售额|revenue)/i.test(q);

export function createRevenueChart({
  available,
  serviceName,
  config,
  money,
  date,
  esc,
}) {
  function serviceRevenueChart() {
    const { rows, total, start, end } = serviceRevenue(
        available(),
        serviceName,
        config,
      ),
      colors = [
        "#40584c",
        "#819477",
        "#c5a66d",
        "#b77664",
        "#718a96",
        "#a9879b",
      ];
    if (!total)
      return '<div class="empty">过去 30 天没有已完成的收入记录。</div>';
    let cursor = 0;
    const stops = rows.map((row, i) => {
        const startAngle = cursor,
          endAngle = cursor + (row.value / total) * 360;
        row.percent = Math.round((row.value / total) * 100);
        row.midAngle = startAngle + (endAngle - startAngle) / 2;
        cursor = endAngle;
        return `${colors[i % colors.length]} ${startAngle}deg ${endAngle}deg`;
      }),
      labels = rows
        .map((row) => {
          const radians = ((row.midAngle - 90) * Math.PI) / 180,
            x = 50 + Math.cos(radians) * 36,
            y = 50 + Math.sin(radians) * 36;
          return `<span class="slice-label" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%">${row.percent}%</span>`;
        })
        .join("");
    return `<div class="sculpy-chart"><div class="pie-wrap"><div class="pie-chart" style="background:conic-gradient(${stops.join(",")})" role="img" aria-label="过去 30 天各种服务收入饼图">${labels}<div><strong>${money(total)}</strong><span>已完成收入</span></div></div></div><div class="chart-detail"><div><div class="eyebrow">REVENUE BY SERVICE</div><h3>过去 30 天 · 服务收入</h3><p>${date(start.toISOString().slice(0, 10))} – ${date(end.toISOString().slice(0, 10))}</p></div><div class="chart-legend">${rows.map((row, i) => `<div><i style="background:${colors[i % colors.length]}"></i><span>${esc(row.label)}</span><strong>${money(row.value)}</strong><small>${row.percent}%</small></div>`).join("")}</div><p class="fake-note">仅统计已完成场次；金额由数据库记录计算，不由 AI 生成。</p></div></div>`;
  }
  return serviceRevenueChart;
}
