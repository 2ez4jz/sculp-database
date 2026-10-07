export const entityNames = {
  booking: "订单",
  client: "客户",
  artist: "化妆师",
  venue: "场地",
  partner: "合作方",
};
export const routes = {
  booking: "bookings",
  client: "clients",
  artist: "artists",
  venue: "venues",
  partner: "partners",
};
export const kindNames = {
  note: "工作记录",
  preference: "客户偏好",
  experience: "经验备注",
  task: "跟进待办",
  change: "变更申请",
};
export const keyOf = (e) => `${e.type}:${e.id}`;
export function memoryTargets(data, identity) {
  const admin = identity.role === "admin";
  const own = admin
    ? data.bookings
    : data.bookings.filter((b) => b.artistIds.includes(identity.artistId));
  const lookup = (rows, id) => rows.find((x) => x.id === id);
  const mapped = (type, rows) =>
    rows.map((x) => ({ type, id: x.id, label: x.name }));
  return [
    ...own.map((b) => ({
      type: "booking",
      id: b.id,
      label: `${lookup(data.clients, b.clientId)?.name || "客户"} · ${b.date}`,
      clientId: b.clientId,
      venueId: b.venueId,
      partnerIds: b.partnerIds,
      artistIds: b.artistIds,
    })),
    ...(admin ? mapped("client", data.clients) : []),
    ...mapped(
      "artist",
      admin
        ? data.artists
        : data.artists.filter((a) => a.id === identity.artistId),
    ),
    ...mapped(
      "venue",
      admin
        ? data.venues
        : data.venues.filter((v) => own.some((b) => b.venueId === v.id)),
    ),
    ...mapped(
      "partner",
      admin
        ? data.partners
        : data.partners.filter((p) =>
            own.some((b) => b.partnerIds.includes(p.id)),
          ),
    ),
  ];
}
export function relatedTargets(root, targets, data) {
  if (!root) return [];
  const result = [root];
  if (root.type === "booking") {
    const booking = data.bookings.find((b) => b.id === root.id);
    if (booking) {
      const customer = data.clients.find((c) => c.id === booking.clientId);
      // Employees may propose a preference via their assigned booking, without CRM access.
      if (customer)
        result.push({
          type: "client",
          id: customer.id,
          label: customer.name,
          proposalOnly: !targets.some(
            (t) => t.type === "client" && t.id === customer.id,
          ),
        });
      result.push(
        ...targets.filter(
          (t) =>
            (t.type === "venue" && t.id === booking.venueId) ||
            (t.type === "partner" && booking.partnerIds.includes(t.id)),
        ),
      );
    }
  }
  return result.filter(
    (t, i, arr) => arr.findIndex((x) => keyOf(x) === keyOf(t)) === i,
  );
}
export function routeTarget(hash, targets) {
  const [route, id] = hash.replace(/^#/, "").split("/");
  return targets.find((t) => routes[t.type] === route && t.id === id) || null;
}
export function normalizeProposal(result, root, related, rawText) {
  const items = [
    {
      kind: "note",
      target: keyOf(root),
      text: String(result.summary || rawText),
      selected: true,
      dueDate: "",
      assigneeId: "",
    },
  ];
  if (Array.isArray(result.items)) {
    for (const x of result.items.slice(0, 12)) {
      const target = related.find(
        (t) => keyOf(t) === `${x.entityType}:${x.entityId}`,
      );
      if (
        !target ||
        !["preference", "experience", "task", "change"].includes(x.kind) ||
        !String(x.text || "").trim()
      )
        continue;
      if (x.kind === "preference" && target.type !== "client") continue;
      items.push({
        kind: x.kind,
        target: keyOf(target),
        text: String(x.text).slice(0, 4000),
        selected: true,
        dueDate: "",
        assigneeId: "",
      });
    }
  } else {
    const client = related.find((t) => t.type === "client");
    if (client)
      for (const text of (result.preferences || []).slice(0, 6))
        items.push({
          kind: "preference",
          target: keyOf(client),
          text: String(text),
          selected: true,
          dueDate: "",
          assigneeId: "",
        });
    for (const text of (result.opportunities || []).slice(0, 6))
      items.push({
        kind: "task",
        target: keyOf(root),
        text: String(text),
        selected: true,
        dueDate: "",
        assigneeId: "",
      });
  }
  return {
    items,
    warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [],
    provider: result.provider,
  };
}
export function validateMemory(
  { root, rawText, items },
  targets,
  related,
  identity,
  assignees,
) {
  if (!root || !targets.some((t) => keyOf(t) === keyOf(root)))
    throw Error("当前账号不能记录到这个位置，请重新选择。");
  if (!rawText.trim() || rawText.length > 4000)
    throw Error("原话需要在 1–4000 字以内。");
  const chosen = items.filter((i) => i.selected);
  if (!chosen.length) throw Error("至少选择一项需要保存的内容。");
  if (chosen.length > 16) throw Error("一次最多保存 16 项。");
  return chosen.map((i) => {
    const target = related.find((t) => keyOf(t) === i.target);
    if (
      !target ||
      !kindNames[i.kind] ||
      (i.kind === "preference" && target.type !== "client")
    )
      throw Error("保存位置无效，请重新整理。");
    const text = i.text.trim();
    if (!text || text.length > 4000)
      throw Error("每项记录需要在 1–4000 字以内。");
    if (
      i.dueDate &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate) ||
        new Date(i.dueDate + "T12:00:00Z").toISOString().slice(0, 10) !==
          i.dueDate)
    )
      throw Error("请选择有效日期。");
    if (i.assigneeId && !assignees.some((a) => a.id === i.assigneeId))
      throw Error("请选择有效负责人。");
    return {
      kind: i.kind,
      entityType: target.type,
      entityId: target.id,
      text,
      dueDate: i.kind === "task" ? i.dueDate || null : null,
      assigneeId: i.kind === "task" ? i.assigneeId || null : null,
      status:
        i.kind === "change" ||
        (identity.role !== "admin" && target.type === "client")
          ? "pending_review"
          : "confirmed",
    };
  });
}
export function visibleMemories(memories, root, identity) {
  return memories.flatMap((batch) =>
    batch.items
      .filter(
        (i) =>
          i.entityType === root.type &&
          i.entityId === root.id &&
          (identity.role === "admin" ||
            batch.createdBy === identity.artistId ||
            (i.status === "confirmed" &&
              i.kind !== "change" &&
              i.kind !== "task")),
      )
      .map((item) => ({ batch, item })),
  );
}

export function clientPreferences(client, memories = []) {
  return [
    ...new Set([
      ...(client.preferences || []),
      ...memories.flatMap((batch) =>
        batch.items
          .filter(
            (i) =>
              i.kind === "preference" &&
              i.entityType === "client" &&
              i.entityId === client.id &&
              i.status === "confirmed",
          )
          .map((i) => i.text),
      ),
    ]),
  ];
}
