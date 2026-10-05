import assert from 'node:assert/strict';
import {withFixture} from './staff-proof-harness.mjs';
import {configuration,ids,uuid} from './staff-proof-protocol.mjs';
try{
 await withFixture(async f=>{
  const root=await f.request('/');assert.equal(root.status,200);
  assert.ok(Math.abs(Number(root.headers.get('x-fixed-app-clock-skew-ms'))-365*86400000)<10);
  await f.initialize();
  const signed=await f.request('/api/test-auth/login',{method:'POST',json:{account:'staff-saturn'},headers:{origin:f.origin}});
  assert.equal(signed.status,200);const cookie=signed.headers.get('set-cookie').split(';')[0];
  const before=(await f.db.query('SELECT clock_timestamp() AS t')).rows[0].t;
  const created=await f.request('/api/admin/events',{method:'POST',json:{organizationId:ids.saturn,name:'Clock compatibility proof',requestId:uuid()},cookie,headers:{origin:f.origin}});
  console.log(JSON.stringify({sessionStatus:(await f.request('/api/session',{cookie})).status,createdStatus:created.status,workerHeader:created.headers.get('x-fixed-app-clock-skew-ms')}));
  assert.equal(created.status,201,'Actual Next PG timestamp read/format route must remain functional under the skew.');
  const id=created.data.draft.event.id,row=(await f.db.query('SELECT updated_at FROM bz_events WHERE id=$1',[id])).rows[0];
  assert.equal(created.data.draft.savedAt,row.updated_at.toISOString());assert.ok(row.updated_at>=before&&row.updated_at<=(await f.db.query('SELECT clock_timestamp() AS t')).rows[0].t);
  const read=await f.request('/api/admin/events/'+id,{cookie});assert.equal(read.status,200);assert.deepEqual(read.data,created.data);
  const list=await f.request('/api/admin/events',{cookie});assert.equal(list.status,200);assert.equal(list.data.events[0].savedAt,created.data.draft.savedAt);
  console.log(JSON.stringify({actualNextPGTimestamp:true,createStatus:201,readStatus:200,listStatus:200,unskewedDBTimestamp:row.updated_at.toISOString()}));
 },configuration);
}catch(e){console.error(e.name+': '+e.message);process.exitCode=1;}
