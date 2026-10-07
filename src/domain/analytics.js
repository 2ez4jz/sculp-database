// Pure calculation: callers supply only records they may report on.
export function serviceRevenue(
  records,
  serviceNames,
  { environment = "demo", today = new Date().toISOString().slice(0, 10) } = {},
) {
  const completed = records
      .filter((b) => b.status === "Completed")
      .sort((a, b) => b.date.localeCompare(a.date)),
    end = new Date(
      (environment === "demo" ? completed[0]?.date || today : today) +
        "T12:00:00",
    ),
    start = new Date(end);
  start.setDate(start.getDate() - 29);
  const rows = Object.entries(
      completed
        .filter((b) => {
          const d = new Date(b.date + "T12:00:00");
          return d >= start && d <= end;
        })
        .reduce(
          (sum, b) => ((sum[b.service] = (sum[b.service] || 0) + b.price), sum),
          {},
        ),
    )
      .map(([service, value]) => ({
        label: serviceNames[service] || service,
        value,
      }))
      .sort((a, b) => b.value - a.value),
    total = rows.reduce((sum, row) => sum + row.value, 0);
  return { rows, total, start, end };
}
