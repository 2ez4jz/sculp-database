import test from "node:test";
import assert from "node:assert/strict";
import {channelCatalog,channelForBooking,channelSummary,validChannelName} from "../src/domain/channels.js";

test("channel catalog includes defaults and custom channels",()=>{
 const state={extraChannels:[{id:"custom-test",name:"Wedding Expo",category:"自定义"}]};
 assert(channelCatalog(state).some(c=>c.name==="Wedding Expo"));
 assert(channelCatalog({...state,disabledChannels:["custom-test"]}).every(c=>c.id!=="custom-test"));
});
test("unattributed booking never becomes an invented acquisition source",()=>{
 const rows=[{id:"b1"},{id:"b2"},{id:"b3",channelId:"instagram"}];
 const state={channelAssignments:{b1:"google"}};
 assert.equal(channelForBooking(rows[1],state),null);
 const summary=channelSummary(rows,state);
 assert.equal(summary.find(r=>r.id==="google").count,1);
 assert.equal(summary.find(r=>r.id==="instagram").count,1);
 assert.equal(summary.find(r=>r.id===null).count,1);
});
test("reject blank, too-short, and oversized channel names",()=>{
 assert.equal(validChannelName(" "),false);
 assert.equal(validChannelName("A"),false);
 assert.equal(validChannelName("Instagram"),true);
 assert.equal(validChannelName("X".repeat(61)),false);
});
