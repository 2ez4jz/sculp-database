import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createDatabase } from './support/cloud-database.mjs';

// Only dump newly created fictional fixtures on a local test server. No existing
// database is migrated, dumped, overwritten or removed by this check.
const container=process.env.SCULPY_TEST_POSTGRES_CONTAINER;
if(!process.env.SCULPY_TEST_DATABASE_URL||!container||!/^[-a-zA-Z0-9_.]+$/.test(container)) {
  throw Error('Recovery check needs a local SCULPY_TEST_DATABASE_URL and its SCULPY_TEST_POSTGRES_CONTAINER.');
}
const source=await createDatabase();let restored;
try {
  restored=await createDatabase({applyMigrations:false});
  const actor='10000000-0000-0000-0000-000000000001',client='10000000-0000-0000-0000-000000000002',booking='10000000-0000-0000-0000-000000000003';
  await source.exec(`insert into auth.users(id) values('${actor}');insert into profiles(id,display_name,role) values('${actor}','Recovery QA','operations');
    insert into clients(id,display_name) values('${client}','Fictional recovery client');
    insert into bookings(id,client_id,starts_at,status,price_cad) values('${booking}','${client}','2026-09-15T12:00:00Z','confirmed',1000);
    set role authenticated;set request.jwt.claim.sub='${actor}';`);
  await source.query('select sculpy_confirm_booking_change($1,$2,1,$3,$4)',[crypto.randomUUID(),booking,
    {date:'2026-09-15',time:'08:00',endDate:'',endTime:'',location:'Recovered location',details:'Fixture',status:'completed',confirmed:true},'Recovery fixture']);
  const dump=spawnSync('docker',['exec',container,'pg_dump','-U','postgres','--no-owner',source.databaseName],{encoding:'utf8',maxBuffer:10*1024*1024});
  if(dump.error||dump.status!==0)throw Error('Fixture backup failed: '+(dump.error?.message||dump.stderr));
  const restore=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','--set','ON_ERROR_STOP=1','--dbname',restored.databaseName],
    {input:dump.stdout,encoding:'utf8',maxBuffer:10*1024*1024});
  if(restore.error||restore.status!==0)throw Error('Fixture restore failed: '+(restore.error?.message||restore.stderr));
  await restored.exec(`set role authenticated;set request.jwt.claim.sub='${actor}';`);
  const data=(await restored.query('select sculpy_order_detail($1) as data',[booking])).rows[0].data;
  assert.equal(data.edit.version,2);assert.equal(data.bookings[0].venue,'Recovered location');
  assert.equal((await restored.query("select sculpy_monthly_report('2026-09') as data")).rows[0].data.bookings.completedAmountCents,'100000');
  assert.equal((await restored.query('select count(*)::int as n from booking_changes')).rows[0].n,1);
  assert.equal((await restored.query('select reason from booking_changes')).rows[0].reason,'Recovery fixture');
  await assert.rejects(()=>restored.query('select * from bookings'),/permission denied/);
  await restored.exec('reset role');
  assert.equal((await restored.query("select count(*)::int as n from audit_events where entity_id=$1 and action='update'",[booking])).rows[0].n,1);
  console.log('PostgreSQL fixture backup/restore passed: order, version, change reason, audit, report and canonical grants preserved.');
} finally {if(restored)await restored.close();await source.close();}
