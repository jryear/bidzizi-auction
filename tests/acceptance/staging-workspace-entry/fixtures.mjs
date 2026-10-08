import assert from 'node:assert/strict';
import {HarnessError} from './harness.mjs';
import {ids,login,create,saved,compact,completeLot,eventFields,futureFields,approve,assertApprovalSQL,mutate,uuid} from './protocol.mjs';
import {stored} from './browser.mjs';
export {ids,login,create,saved,compact,completeLot,eventFields,futureFields,approve,assertApprovalSQL,mutate,uuid};
export async function fixture(f,name,{account='staff-saturn',organization=ids.saturn,subset=false,approved=false}={}){
 const actor=await login(f,account);const empty=await create(f,actor,name,organization);const fields=await futureFields(f);fields.name=name;
 const lots=[completeLot(name+' selected coffee','coffee'),completeLot(name+' selected cabin','cabin')];
 if(subset)lots.push({...completeLot(name+' unassigned incomplete','dinner'),description:'',opening:null,windowId:null},{...completeLot(name+' assigned incomplete','flowers'),description:'',opening:null,windowId:'main'});
 const packet=await saved(f,actor,empty,{event:fields,lots});assert.deepEqual(compact(packet),{event:fields,lots},'Independently authored entire fixture content survives save');await stored(f,packet);
 const api=await f.request('/api/admin/events/'+packet.event.id,{cookie:actor.cookie});assert.equal(api.status,200);assert.deepEqual(api.data.draft,packet);
 let approval;if(approved){approval=(await approve(f,actor,packet,[packet.lots[0].id])).approval;await assertApprovalSQL(f,packet,[packet.lots[0].id],approval);}
 return {actor,packet,approval};
}
export async function healthy(f){
 try{
 const auth=await login(f);const x=await fixture(f,'004 healthy server authority control');
 const session=await f.request('/api/session',{cookie:auth.cookie});assert.equal(session.status,200);assert.equal(session.data.person.id,ids.staff);
 const listing=await f.request('/api/admin/events',{cookie:auth.cookie});assert.equal(listing.status,200);assert.ok(listing.data.events.some(e=>e.id===x.packet.event.id));
 const tables=(await f.db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r=>r.tablename);
 for(const table of ['bz_events','bz_lots','bz_requests','bz_catalog_approvals','bz_manual_bids','bz_bid_receipts'])assert.ok(tables.includes(table),'All three migrations exist: '+table);
 const roles=(await f.db.query('SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',[f.runtimeRole])).rows[0];assert.ok(roles&&!roles.rolsuper&&!roles.rolcreatedb&&!roles.rolcreaterole);
 await stored(f,x.packet);const receipts=(await f.db.query("SELECT * FROM bz_requests WHERE operation=$1",['save:'+x.packet.event.id])).rows;assert.equal(receipts.length,1);assert.deepEqual(receipts[0].response.draft,x.packet);
 console.log('CONTROL healthy authenticated Event/API/full SQL; protected001+002+003; unique local scoped runtime role');return x;
 }catch(e){throw new HarnessError('Healthy auth/API/SQL control failed: '+e.message);}
}
export async function readPacket(f,actor,id){const r=await f.request('/api/admin/events/'+id,{cookie:actor.cookie});assert.equal(r.status,200);await stored(f,r.data.draft);return r.data.draft;}
export async function receipt(f,id){const r=(await f.db.query('SELECT request_id,operation,status,response,payload_hash FROM bz_requests WHERE request_id=$1',[id])).rows;assert.equal(r.length,1,'Exactly one durable same-request receipt');return r[0];}
