import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyStats} from '../src/domain/monthly-stats.js';
import {bookings} from '../src/data/demo.js';
const admin={role:'admin'};
test('fictional fixture September is 18 completed bookings totaling CAD 13230',()=>{
 const r=monthlyStats(bookings,'2026-09',admin);
 assert.equal(r.bookings,18);assert.equal(r.completed,18);assert.equal(r.amountCents,1323000);
});
test('October 2026 has six demo bookings, one completed',()=>{
 const r=monthlyStats(bookings,'2026-10',admin);
 assert.equal(r.bookings,6);assert.equal(r.completed,1);assert.equal(r.amountCents,199000);
});
test('artist is denied global business figures',()=>{
 assert.throws(()=>monthlyStats(bookings,'2026-09',{role:'artist',artistId:'emily'}));
});
