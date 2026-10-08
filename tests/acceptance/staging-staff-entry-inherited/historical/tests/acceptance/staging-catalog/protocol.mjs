import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export const ids={saturn:'10000000-0000-4000-8000-000000000001',pine:'10000000-0000-4000-8000-000000000002',
  staff:'20000000-0000-4000-8000-000000000001',outsider:'20000000-0000-4000-8000-000000000002',
  juniper:'20000000-0000-4000-8000-000000000003',harbor:'20000000-0000-4000-8000-000000000004'};
export const uuid=()=>randomUUID();
export const phaseFunction='public.bz_catalog_phase(timestamp with time zone,timestamp with time zone,timestamp with time zone)';
export const approvalPath=id=>'/api/admin/events/'+id+'/catalog-approval';
export const audiencePath=id=>'/api/catalog/events/'+id;
export const lotPath=(event,lot)=>audiencePath(event)+'/lots/'+lot;
export const eventKeys=['name','eyebrow','welcome','venue','cover','date','start','end','timezone','increment','sponsorsEnabled','sponsors'];
export const lotKeys=['id','title','short','description','category','image','alt','opening','includes','fine','windowId'];
export const welcomeKeys=['id','name','eyebrow','welcome','venue','cover','sponsorsEnabled','sponsors'];
export function noStore(r){assert.match(r.headers.get('cache-control')||'',/no-store/i);}
export function error(r,status,code){
  assert.equal(r.status,status,'Expected '+status+' '+code+', received '+r.status);
  noStore(r);assert.equal(r.data?.error?.code,code);
  assert.deepEqual(Object.keys(r.data).filter(k=>k!=='revision').sort(),['error']);
  if('revision' in r.data){assert.equal(code,'REVISION_CONFLICT');assert.ok(Number.isSafeInteger(r.data.revision));}
  assert.deepEqual(Object.keys(r.data.error).sort(),['code','message']);assert.equal(typeof r.data.error.message,'string');
  assert.doesNotMatch(r.text,/postgres(?:ql)?:|password|token_hash|\.neon\.tech|stack|SELECT |INSERT /i);
}
export async function login(f,account='staff-saturn'){
  const r=await f.request('/api/test-auth/login',{method:'POST',json:{account},headers:{origin:f.origin}});
  assert.equal(r.status,200);noStore(r);
  const raw=r.headers.get('set-cookie')||'';assert.match(raw,/HttpOnly/i);assert.match(raw,/SameSite=Lax/i);
  return {account,cookie:raw.split(';')[0]};
}
export function mutate(f,actor,path,method,json,headers={}){
  return f.request(path,{method,json,cookie:actor.cookie,headers:{origin:f.origin,...headers}});
}
export function compact(p){
  return {event:Object.fromEntries(eventKeys.map(k=>[k,p.event[k]])),
    lots:p.lots.map(l=>Object.fromEntries(lotKeys.map(k=>[k,l[k]])))};
}
export async function create(f,staff,name='Catalog fixture',organizationId=ids.saturn){
  const r=await mutate(f,staff,'/api/admin/events','POST',{organizationId,name,requestId:uuid()});
  assert.equal(r.status,201);return r.data.draft;
}
export async function saved(f,staff,packet,draft){
  const r=await mutate(f,staff,'/api/admin/events/'+packet.event.id,'PUT',{expectedRevision:packet.revision,requestId:uuid(),draft});
  assert.equal(r.status,200);return r.data.draft;
}
export function completeLot(title='Selected fixture lot',image='coffee'){
  return {id:uuid(),title,short:'Selected short text',description:'Complete saved description for '+title,
    category:'Experiences',image:'assets/lots/'+image+'.jpg',alt:'Fixture photograph',opening:2500,
    includes:['Included first item','Included second item'],fine:'Synthetic catalog terms only.',windowId:'main'};
}
export function eventFields(date='2030-01-15',start='18:00',end='20:00',timezone='America/Los_Angeles'){
  return {name:'Saved catalog event',eyebrow:'Synthetic member event',welcome:'Welcome from the saved event.',
    venue:'Synthetic venue',cover:'assets/lots/cabin.jpg',date,start,end,timezone,increment:2500,
    sponsorsEnabled:true,sponsors:[{name:'Saved Cedar sponsor',logo:'cedar'},{name:'Saved Harbor sponsor',logo:'harbor'}]};
}
export async function completeEvent(f,staff,fields=eventFields(),organizationId=ids.saturn){
  const empty=await create(f,staff,fields.name,organizationId);
  const first=completeLot('Selected coffee lot','coffee'),unselected={...completeLot('PRIVATE UNSELECTED draft','dinner'),description:'',windowId:null},
    last=completeLot('Selected cabin lot','cabin');
  const packet=await saved(f,staff,empty,{event:fields,lots:[first,unselected,last]});
  return {packet,first,unselected,last};
}
export function body(packet,lotIds,requestId=uuid()){
  return {expectedRevision:packet.revision,requestId,lotIds};
}
export function expectedSnapshot(packet,lotIds){
  const selected=new Set(lotIds);
  return {organization:packet.org,event:compact(packet).event,
    lots:compact(packet).lots.filter(l=>selected.has(l.id)).map((l,i)=>({...l,number:packet.lots.find(source=>source.id===l.id).number,provider:packet.org}))};
}
export function expectedWelcome(packet){
  return Object.fromEntries(welcomeKeys.map(k=>[k,packet.event[k]]));
}
export async function approve(f,staff,packet,lotIds,requestId=uuid()){
  const payload=body(packet,lotIds,requestId);
  const r=await mutate(f,staff,approvalPath(packet.event.id),'POST',payload);
  assert.equal(r.status,201,'Saved catalog approval endpoint must exist and durably approve.');noStore(r);
  const a=r.data.approval;
  assert.ok(a&&/^[0-9a-f-]{36}$/.test(a.id));
  assert.deepEqual(Object.keys(a).sort(),['id','eventId','organizationId','sourceRevision','approvedAt','opensAt','closesAt','local','snapshot'].sort());assert.equal(a.eventId,packet.event.id);assert.equal(a.organizationId,packet.org.id);
  assert.equal(a.sourceRevision,packet.revision);
  assert.deepEqual(a.local,{date:packet.event.date,start:packet.event.start,end:packet.event.end,timezone:packet.event.timezone});
  assert.deepEqual(a.snapshot,expectedSnapshot(packet,lotIds));
  return {approval:a,response:r,payload};
}
export async function assertApprovalSQL(f,packet,lotIds,a,expectedActor=ids.staff){
  const parent=(await f.db.query('SELECT * FROM bz_catalog_approvals WHERE event_id=$1',[packet.event.id])).rows;
  assert.equal(parent.length,1);const p=parent[0],expected=expectedSnapshot(packet,lotIds);
  assert.equal(p.id,a.id);assert.equal(p.org_id,packet.org.id);assert.equal(p.source_revision,packet.revision);
  assert.equal(p.approved_by,expectedActor);assert.equal(p.approved_at.toISOString(),a.approvedAt);
  assert.deepEqual(p.organization_snapshot,expected.organization);assert.deepEqual(p.event_snapshot,expected.event);
  assert.equal(p.opens_at.toISOString(),a.opensAt);assert.equal(p.closes_at.toISOString(),a.closesAt);
  assert.equal(p.local_date,packet.event.date);assert.equal(p.local_start,packet.event.start);assert.equal(p.local_end,packet.event.end);assert.equal(p.timezone,packet.event.timezone);
  const lots=(await f.db.query('SELECT * FROM bz_catalog_lots WHERE approval_id=$1 ORDER BY position',[a.id])).rows;
  assert.deepEqual(lots.map(l=>l.position),expected.lots.map((_,i)=>i));
  assert.deepEqual(lots.map(l=>l.lot_id),expected.lots.map(l=>l.id));
  assert.ok(lots.every(l=>l.event_id===packet.event.id&&l.org_id===packet.org.id));
  assert.deepEqual(lots.map(l=>l.snapshot),expected.lots);
}
export async function audience(f,viewer,event,phase,packet,lotIds,extra={}){
  const before=await f.dbNow();
  const r=await f.request(audiencePath(event),{cookie:viewer.cookie,...extra});
  const after=await f.dbNow();
  assert.equal(r.status,200);noStore(r);
  assert.deepEqual(Object.keys(r.data).sort(),['catalog','event','organization','phase','schedule','serverNow','biddingEnabled'].sort());
  assert.equal(r.data.biddingEnabled,false);
  const approval=(await f.db.query('SELECT opens_at,closes_at FROM bz_catalog_approvals WHERE event_id=$1',[event])).rows[0];
  assert.deepEqual(r.data.schedule,{opensAt:approval.opens_at.toISOString(),closesAt:approval.closes_at.toISOString()});
  assert.deepEqual(r.data.organization,packet.org);assert.deepEqual(r.data.event,expectedWelcome(packet));
  const serverNow=Date.parse(r.data.serverNow);
  assert.ok(Number.isFinite(serverNow)&&serverNow>=before.getTime()-1&&serverNow<=after.getTime()+1,'serverNow must lie in independent DB-time request bracket.');
  const derived=serverNow<Date.parse(r.data.schedule.opensAt)?'scheduled':serverNow<Date.parse(r.data.schedule.closesAt)?'open':'closed';
  assert.equal(r.data.phase,derived,'Response phase must agree with independently bracketed DB time.');
  if(phase!==null)assert.equal(r.data.phase,phase);
  if(derived==='scheduled'){
    assert.equal(r.data.catalog,null);
    for(const hidden of compact(packet).lots){assert.ok(!r.text.includes(hidden.id)&&!r.text.includes(hidden.title),'Unopened response cannot contain lot identities or text.');}
  }else{
    assert.ok(r.data.catalog);
    assert.deepEqual(Object.keys(r.data.catalog).sort(),['approvalId','sourceRevision','lots'].sort());
    const approvalId=(await f.db.query('SELECT id FROM bz_catalog_approvals WHERE event_id=$1',[event])).rows[0].id;
    assert.equal(r.data.catalog.approvalId,approvalId);
    assert.deepEqual(r.data.catalog.lots,expectedSnapshot(packet,lotIds).lots);
    for(const hidden of compact(packet).lots.filter(l=>!lotIds.includes(l.id)))assertNoPrivateLot(r,hidden);
    assert.equal(r.data.catalog.sourceRevision,packet.revision);
  }
  return r;
}
export function assertNoPrivateLot(r,lot){
  assert.ok(!r.text.includes(lot.id)&&!r.text.includes(lot.title)&&!r.text.includes(lot.description||'PRIVATE UNSELECTED'));
}
export async function phaseBoundaries(f){
  const open='2030-01-16T02:00:00.000Z',close='2030-01-16T04:00:00.000Z';
  for(const [at,expected] of [['2030-01-16T01:59:59.999999Z','scheduled'],[open,'open'],['2030-01-16T03:59:59.999999Z','open'],[close,'closed'],['2030-01-16T04:00:00.000001Z','closed']]){
    const r=await f.db.query('SELECT bz_catalog_phase($1::timestamptz,$2::timestamptz,$3::timestamptz) AS phase',[open,close,at]);
    assert.equal(r.rows[0].phase,expected,'Exact fixed-instant inclusive-open/exclusive-close predicate.');
  }
}

export async function futureFields(f){
  const now=await f.dbNow(),date=new Date(now.getTime()+86400000).toISOString().slice(0,10);
  return eventFields(date,'18:00','20:00','UTC');
}
export async function openFields(f){
  const now=await f.dbNow(),late=now.getUTCHours()===23&&now.getUTCMinutes()>=58;
  const local=new Date(now.getTime()-(late?12*3600000:0));
  return eventFields(local.toISOString().slice(0,10),'00:00','23:59',late?'Etc/GMT+12':'UTC');
}
export async function transitionFields(f){
  const now=await f.dbNow(),opens=Math.floor((now.getTime()+30_000)/60000)*60000+60000,closes=opens+60000;
  const late=new Date(opens).getUTCHours()===23&&new Date(opens).getUTCMinutes()===59;
  const shift=late?12*3600000:0,start=new Date(opens-shift),end=new Date(closes-shift);
  return {fields:eventFields(start.toISOString().slice(0,10),start.toISOString().slice(11,16),end.toISOString().slice(11,16),late?'Etc/GMT+12':'UTC'),
    opensAt:new Date(opens).toISOString(),closesAt:new Date(closes).toISOString()};
}

export async function direct(f,viewer,packet,selected,lotId,phase){
  const before=await f.dbNow();
  const r=await f.request(lotPath(packet.event.id,lotId),{cookie:viewer.cookie});
  const after=await f.dbNow();
  assert.equal(r.status,200);noStore(r);
  assert.deepEqual(Object.keys(r.data).sort(),['eventId','approvalId','lot','phase','serverNow','biddingEnabled'].sort());
  const a=(await f.db.query('SELECT id,opens_at,closes_at FROM bz_catalog_approvals WHERE event_id=$1',[packet.event.id])).rows[0];
  assert.equal(r.data.eventId,packet.event.id);assert.equal(r.data.approvalId,a.id);
  assert.equal(r.data.phase,phase);assert.equal(r.data.biddingEnabled,false);
  const time=Date.parse(r.data.serverNow);
  assert.ok(time>=before.getTime()-1&&time<=after.getTime()+1);
  assert.equal(r.data.phase,time<a.opens_at.getTime()?'scheduled':time<a.closes_at.getTime()?'open':'closed');
  assert.deepEqual(r.data.lot,expectedSnapshot(packet,selected).lots.find(l=>l.id===lotId));
  for(const hidden of compact(packet).lots.filter(l=>!selected.includes(l.id)))assertNoPrivateLot(r,hidden);
  return r;
}

export function sealedError(r,status,code,packet){
  error(r,status,code);
  for(const lot of compact(packet).lots)assertNoPrivateLot(r,lot);
  return r;
}
