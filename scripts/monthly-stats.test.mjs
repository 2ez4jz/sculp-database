import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyStats} from '../src/domain/monthly-stats.js';
import {bookings} from '../src/data/demo.js';
const admin={role:'admin'};
test('300-order September has 26 active records and 21 completed bookings totaling CAD 19685',()=>{
 const r=monthlyStats(bookings,'2026-09',admin);
 assert.equal(r.bookings,26);assert.equal(r.completed,21);assert.equal(r.amountCents,1968500);
});
test('October 2026 has 19 active bookings, 14 completed',()=>{
 const r=monthlyStats(bookings,'2026-10',admin);
 assert.equal(r.bookings,19);assert.equal(r.completed,14);assert.equal(r.amountCents,1031500);
});
test('artist is denied global business figures',()=>{
 assert.throws(()=>monthlyStats(bookings,'2026-09',{role:'artist',artistId:'emily'}));
});
