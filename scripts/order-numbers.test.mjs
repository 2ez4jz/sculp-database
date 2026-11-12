import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateOrderNumber,orderNumberPattern,serviceNumberCodes} from '../src/domain/order-numbers.js';
import {bookings} from '../src/data/demo.js';
import {workspaceBookings} from '../src/domain/demo-workspace.js';
import {generateAdvisorFixtures} from '../src/data/advisor-fixtures.js';
import {venues} from '../src/data/demo.js';
import {validateNewEntity} from '../src/domain/intake.js';

test('300 existing references are unique, fixed, category-specific and never contain 4',()=>{
 assert.equal(new Set(bookings.map(b=>b.orderNumber)).size,300);
 for(const b of bookings){assert.match(b.orderNumber,orderNumberPattern);assert.equal(b.orderNumber[1],serviceNumberCodes[b.service]);assert(!b.orderNumber.includes('4'));}
 assert.deepEqual(workspaceBookings(generateAdvisorFixtures(),venues).map(b=>b.orderNumber),bookings.map(b=>b.orderNumber));
});
test('allocation preserves zeroes, skips collisions, covers all service codes and fails on exhaustion',()=>{
 for(const [service,code] of Object.entries(serviceNumberCodes))assert.equal(allocateOrderNumber(service,[],()=>0),'6'+code+'0000');
 assert.equal(allocateOrderNumber('Wedding',['610000'],()=>0),'610001');
 const all=new Set();for(let i=0;i<6561;i++)all.add(allocateOrderNumber('Trial',all,()=>0));
 assert.equal(all.size,6561);assert([...all].every(n=>orderNumberPattern.test(n)));
 assert.throws(()=>allocateOrderNumber('Trial',all),/已用完/);
 assert.equal(allocateOrderNumber('Unknown',[],()=>0),'600000');
});
test('new demo intake assigns a number without replacing internal IDs or trusting a supplied number',()=>{
 const data={clients:[{id:'c'}],artists:[{id:'a'}],venues:[{id:'v'}],bookings};
 const b=validateNewEntity('booking',{clientId:'c',artistId:'a',venueId:'v',date:'2026-12-01',service:'Trial',orderNumber:'644444'},data);
 assert.match(b.orderNumber,/^62[012356789]{4}$/);assert(!bookings.some(x=>x.orderNumber===b.orderNumber));
});
