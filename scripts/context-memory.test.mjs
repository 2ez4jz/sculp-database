import test from "node:test";
import assert from "node:assert/strict";
import {
  memoryTargets,
  relatedTargets,
  normalizeProposal,
  validateMemory,
  visibleMemories,
} from "../src/domain/memory.js";
import {
  createDemoMemoryRepository,
  createCloudMemoryRepository,
} from "../src/services/memory.js";
const data = {
  bookings: [
    {
      id: "b1",
      clientId: "c1",
      date: "2026-10-01",
      artistIds: ["a1"],
      venueId: "v1",
      partnerIds: ["p1"],
    },
    { id: "b2", clientId: "c2", artistIds: ["a2"], partnerIds: [] },
  ],
  clients: [
    { id: "c1", name: "Sarah" },
    { id: "c2", name: "Other" },
  ],
  artists: [
    { id: "a1", name: "Alice" },
    { id: "a2", name: "Bob" },
  ],
  venues: [
    { id: "v1", name: "Venue" },
    { id: "v2", name: "Other Venue" },
  ],
  partners: [{ id: "p1", name: "Partner" }],
};
const identity = { role: "artist", artistId: "a1" },
  targets = memoryTargets(data, identity),
  root = targets[0],
  related = relatedTargets(root, targets, data);
test("employee can annotate assigned entities and propose client preferences without opening CRM", () => {
  assert(
    !targets.some(
      (t) => t.id === "b2" || t.id === "c1" || t.id === "v2" || t.id === "a2",
    ),
  );
  const proposal = normalizeProposal(
    {
      summary: "note",
      preferences: ["light makeup"],
      opportunities: ["next week"],
    },
    root,
    related,
    "raw",
  );
  const items = validateMemory(
    { root, rawText: "raw", items: proposal.items },
    targets,
    related,
    identity,
    [data.artists[0]],
  );
  assert.equal(items[1].entityType, "client");
  assert.equal(items[1].status, "pending_review");
  assert.equal(items[2].dueDate, null);
  assert.equal(items[2].assigneeId, null);
  assert.throws(() =>
    validateMemory(
      {
        root: { type: "booking", id: "b2" },
        rawText: "raw",
        items: proposal.items,
      },
      targets,
      related,
      identity,
      [],
    ),
  );
});
test("unknown AI targets and wrong preference targets are ignored; financial change remains an application", () => {
  const p = normalizeProposal(
    {
      summary: "note",
      items: [
        {
          kind: "preference",
          entityType: "venue",
          entityId: "v1",
          text: "invalid",
        },
        { kind: "task", entityType: "booking", entityId: "b2", text: "wrong" },
        {
          kind: "change",
          entityType: "booking",
          entityId: "b1",
          text: "received $500",
        },
      ],
    },
    root,
    related,
    "raw",
  );
  assert.equal(p.items.length, 2);
  assert.equal(
    validateMemory(
      { root, rawText: "raw", items: p.items },
      targets,
      related,
      identity,
      [],
    )[1].status,
    "pending_review",
  );
});
test("failed browser write is atomic and retries do not duplicate the batch", async () => {
  let state = { notes: [], memories: [] },
    ok = false;
  const repo = createDemoMemoryRepository({
    getState: () => state,
    setState: (next) => (state = next),
    storage: () => ok,
  });
  const batch = { id: "one", items: [] };
  await assert.rejects(repo.save(batch));
  assert.equal(state.memories.length, 0);
  ok = true;
  await repo.save(batch);
  await repo.save(batch);
  assert.equal(state.memories.length, 1);
});
test("cloud cannot silently fall back to local persistence", async () => {
  await assert.rejects(
    createCloudMemoryRepository({}).save({}),
    /云端尚未连接/,
  );
  const repo = createCloudMemoryRepository({
    supabase: {
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
  });
  await assert.rejects(repo.save({}), /登录/);
});
test("staff cannot read another employee pending management request", () => {
  const records = [
    {
      createdBy: "a2",
      items: [
        {
          entityType: "booking",
          entityId: "b1",
          kind: "change",
          status: "pending_review",
          text: "private",
        },
      ],
    },
  ];
  assert.equal(visibleMemories(records, root, identity).length, 0);
  assert.equal(visibleMemories(records, root, { role: "admin" }).length, 1);
});

const { validDate, normalizeEntityProposals, uniqueNameId, validateNewEntity } = await import('../src/domain/intake.js');
test('intake leaves ambiguous IDs and unknown fields empty; validates real calendar dates', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(uniqueNameId([{id:'1',name:'Sarah'},{id:'2',name:'SARAH'}], 'Sarah'), '');
  assert.equal(uniqueNameId(data.clients, ' sarah '), 'c1');
  const [p] = normalizeEntityProposals({entities:[{type:'booking',name:'Sarah',date:'2026-02-30',service:'unknown',artist:{id:'a1'}}]});
  assert.equal(p.date, ''); assert.equal(p.artist, ''); assert.equal(p.service, '');
  assert.deepEqual(normalizeEntityProposals({entities:[{type:'delete'}]}), []);
  assert.throws(()=>validateNewEntity('client',{name:'Sarah',city:''},data), /同名/);
  const fields = {clientId:'c1',date:'2026-11-01',artistId:'a1',venueId:'v1',service:'Wedding'};
  assert.throws(()=>validateNewEntity('booking',{...fields,artistId:''},data), /负责人/);
  assert.throws(()=>validateNewEntity('booking',{...fields,date:'2026-02-30'},data), /日期/);
  assert.throws(()=>validateNewEntity('booking',fields,{...data,bookings:[fields]}), /重复/);
  assert.equal(validateNewEntity('booking',fields,data).needsReview, true);
});
test('entity and original source are persisted together or neither is saved', async () => {
  let state = {demoClients:[],memories:[]}, ok = false;
  const repo = createDemoMemoryRepository({getState:()=>state,setState:s=>state=s,storage:()=>ok});
  const client = {id:'new',name:'New Demo'}, batch = {id:'source',rawText:'  original source  ',recordedAt:'2026-10-08T00:00:00Z',items:[]};
  await assert.rejects(repo.createEntity('client',client,batch));
  assert.equal(state.demoClients.length,0); assert.equal(state.memories.length,0);
  ok = true; await repo.createEntity('client',client,batch);
  assert.equal(state.demoClients.length,1); assert.equal(state.memories[0].rawText,'  original source  ');
  await assert.rejects(repo.createEntity('client',client,batch));
  assert.equal(state.memories.length,1);
});
