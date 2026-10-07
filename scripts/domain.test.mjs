import test from "node:test";
import assert from "node:assert/strict";
import { serviceRevenue } from "../src/domain/analytics.js";
import {
  visibleBookings,
  canViewTechnical,
} from "../src/domain/permissions.js";
import { searchCatalog, searchLinks } from "../src/domain/sculpy.js";

const records = [
  {
    id: "a",
    date: "2026-10-07",
    status: "Completed",
    service: "Wedding",
    price: 200,
    artistIds: ["alice"],
    partnerIds: ["p"],
    clientId: "c",
  },
  {
    id: "b",
    date: "2026-09-08",
    status: "Completed",
    service: "Trial",
    price: 100,
    artistIds: ["bob"],
    partnerIds: [],
    clientId: "d",
  },
  {
    id: "c",
    date: "2026-09-07",
    status: "Completed",
    service: "Wedding",
    price: 900,
    artistIds: ["bob"],
    partnerIds: [],
    clientId: "d",
  },
  {
    id: "d",
    date: "2026-10-07",
    status: "Cancelled",
    service: "Wedding",
    price: 999,
    artistIds: ["alice"],
    partnerIds: [],
    clientId: "c",
  },
];
test("revenue includes both 30-day boundaries, excludes cancelled and old records, and does not mutate input", () => {
  const before = structuredClone(records);
  const result = serviceRevenue(
    records,
    { Wedding: "婚礼", Trial: "试妆" },
    { environment: "production", today: "2026-10-07" },
  );
  assert.equal(result.total, 300);
  assert.deepEqual(result.rows, [
    { label: "婚礼", value: 200 },
    { label: "试妆", value: 100 },
  ]);
  assert.deepEqual(records, before);
  assert.equal(serviceRevenue([], {}, { today: "2026-10-07" }).total, 0);
});
test("demo and production reporting anchors differ explicitly", () => {
  assert.equal(
    serviceRevenue(records, {}, { environment: "demo", today: "2027-01-01" })
      .total,
    300,
  );
  assert.equal(
    serviceRevenue(
      records,
      {},
      { environment: "production", today: "2027-01-01" },
    ).total,
    0,
  );
});
test("employee catalog excludes other bookings, notes, internal partner fields and global prices", () => {
  const context = { role: "artist", artistId: "alice" };
  const scoped = visibleBookings(records, context);
  const catalog = searchCatalog({
    bookings: scoped,
    context,
    serviceName: { Wedding: "婚礼" },
    client: (id) => ({ name: id }),
    artists: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
    ],
    partners: [{ id: "p", name: "P", type: "Photography", note: "private" }],
    notes: [
      {
        id: "n1",
        entityId: "a",
        rawText: "my note",
        structuredData: { opportunities: ["private"] },
      },
      { id: "n2", entityId: "b", rawText: "other note" },
    ],
  });
  assert.deepEqual(
    catalog.bookings.map((b) => b.id),
    ["a", "d"],
  );
  assert(catalog.bookings.every((b) => !("price" in b)));
  assert.deepEqual(
    catalog.artists.map((a) => a.id),
    ["alice"],
  );
  assert.deepEqual(
    catalog.notes.map((n) => n.id),
    ["n1"],
  );
  assert(!JSON.stringify(catalog).includes("private"));
  assert.equal(
    canViewTechnical({ role: "admin", adminPersona: "miranda" }),
    false,
  );
  assert.equal(canViewTechnical({ role: "admin", adminPersona: "jz" }), true);
  assert.deepEqual(
    searchLinks(
      [
        { kind: "booking", id: "b" },
        { kind: "booking", id: "a", href: "javascript:alert(1)" },
      ],
      catalog,
    ),
    [{ kind: "booking", id: "a", href: "#bookings/a" }],
  );
});
