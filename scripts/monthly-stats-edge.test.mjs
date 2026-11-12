import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyStats} from '../src/domain/monthly-stats.js';
const admin={role:'admin'};
test('cancelled not counted as active, and missing price is not invented',()=>{
 const rows=[{date:'2026-09-01',status:'Completed',price:null},{date:'2026-09-02',status:'Completed',price:0},{date:'2026-09-03',status:'Cancelled',price:900}];
 const r=monthlyStats(rows,'2026-09',admin);
 assert.equal(r.bookings,2);assert.equal(r.completed,2);assert.equal(r.cancelled,1);assert.equal(r.unpriced,1);assert.equal(r.amountCents,0);
});
test('handles month boundaries, invalid dates and non-CAD amounts',()=>{
 const rows=[{date:'2026-09-30',status:'Completed',price:0.1},{date:'2026-10-01',status:'Completed',price:5},{date:'2026-09-31',status:'Completed',price:300},{date:'2026-09-29',status:'Completed',price:100,currency:'USD'}];
 const r=monthlyStats(rows,'2026-09',admin);
 assert.equal(r.bookings,2);assert.equal(r.amountCents,10);assert.equal(r.unpriced,1);
});
