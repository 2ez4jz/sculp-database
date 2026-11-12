import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {createDatabase} from './support/cloud-database.mjs';
const bytes=await readFile(process.argv[2]);const backup=JSON.parse(bytes);const db=await createDatabase();
try{
 for(const f of backup.functions){assert(['public','sculpy_private'].includes(f.schema));assert(f.definition.startsWith('CREATE OR REPLACE FUNCTION '));await db.exec(f.definition);}
 const map={clients:'clients',clientPrivate:'client_private',bookings:'bookings',bookingServices:'booking_services',bookingChanges:'booking_changes',invoices:'invoices',payments:'payments',enquiries:'website_enquiries'};
 // The audited pre-launch commercial tables are empty. Fail if that changes:
 // a nonempty backup needs a full dependency-ordered restore test before release.
 for(const [key,rows] of Object.entries(backup.tableData)){assert.equal(rows.length,0,`Nonempty ${key}: use full restore workflow`);assert.equal((await db.query(`select count(*)::int n from public.${map[key]}`)).rows[0].n,0);}
 await db.exec("begin;insert into clients(display_name) values('Fictional rollback probe');rollback;");assert.equal((await db.query('select count(*)::int n from clients')).rows[0].n,0);
 console.log(JSON.stringify({sha256:createHash('sha256').update(bytes).digest('hex'),restoredFunctionDefinitions:backup.functions.length,verifiedCommercialTables:Object.keys(backup.tableData).length,transactionalRollback:'passed',chatVersion:backup.edgeFunctions.chat.version,enquiryVersion:backup.edgeFunctions.enquiry.version}));
}finally{await db.close();}
