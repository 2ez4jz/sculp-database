// Isolated fictional PostgreSQL fixture only; never points at production.
import {createDatabase} from './support/cloud-database.mjs';
export async function generateWeddingFixture(){
 const db=await createDatabase();try{
 const actor='23000000-0000-4000-8000-000000000001',client='23000000-0000-4000-8000-000000000010',b='23000000-0000-4000-8000-000000000040';
 await db.query('insert into auth.users(id) values($1)',[actor]);await db.query("insert into profiles(id,display_name,role) values($1,'Fixture Owner','owner')",[actor]);await db.query("insert into clients(id,display_name) values($1,'Fictional wedding client')",[client]);
 await db.query("insert into bookings(id,client_id,service_id,starts_at) select $1,$2,id,'2027-07-10T14:00:00Z' from services where code='wedding'",[b,client]);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
 const cmd=async(action,p)=>db.query('select sculpy_wedding_command($1,$2,$3) d',[crypto.randomUUID(),action,{confirmed:true,reason:'Fictional acceptance fixture',...p}]).then(r=>r.rows[0].d);
 await cmd('confirm_contract',{bookingId:b,version:1,amount:2000,effectiveAt:'2026-09-12',dateQuality:'verified'});
 const deposit=await cmd('record_payment',{bookingId:b,kind:'deposit',amount:600,paidAt:'2026-09-20',method:'etransfer'});
 await cmd('amend_contract',{bookingId:b,version:2,amount:2500,effectiveAt:'2026-10-02'});
 await cmd('record_payment',{bookingId:b,kind:'balance',amount:1900,paidAt:'2026-10-05',method:'etransfer'});
 await cmd('record_payment',{bookingId:b,kind:'refund',amount:200,paidAt:'2026-10-10',method:'etransfer',refundOf:deposit.paymentId});
 await cmd('save_lead',{name:'Fictional enquiry',email:'fixture@example.test',service:'Bridal',serviceType:'wedding',source:'instagram',status:'won',bookingId:b,firstContact:'2026-08-01'});
 const report=(await db.query("select sculpy_wedding_report('2026-08-01','2026-10-18','2026-10-18',2027,null,null) d")).rows[0].d;
 const detail=(await db.query('select sculpy_wedding_detail($1) d',[b])).rows[0].d;
 return {fictional:true,expected:{signedCents:'200000',changeCents:'50000',cashNetCents:'230000',outstandingCents:'20000',futureCents:'250000',won:1,leadCount:1},report,detail};
 }finally{await db.close();}
}
if(process.argv[1]?.endsWith('wedding-v23-fixture.mjs'))console.log(JSON.stringify(await generateWeddingFixture(),null,2));
