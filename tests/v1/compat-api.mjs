#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from '@playwright/test';
const BASE=process.env.BASE??'http://127.0.0.1:3432',browser=await chromium.launch();
try{
 const staff=await browser.newContext(),guest=await browser.newContext(),other=await browser.newContext();let count=0;
 async function api(method,path,data){const r=await staff.request.fetch(BASE+path,{method,headers:{Origin:BASE},data});const b=await r.json();assert.ok(r.ok(),JSON.stringify(b));return b;}
 await api('POST','/api/v1/host/login',{email:process.env.HOST_EMAIL,password:process.env.HOST_PASSWORD});
 const e=await api('POST','/api/v1/host/events',{requestId:randomUUID(),name:'Telemetry verification',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()});
 let w=await api('GET',`/api/v1/host/events/${e.id}`);const url=BASE+`/api/v1/e/${w.event.code}/telemetry`;
 const testIP=()=> '2001:db8:'+randomUUID().replaceAll('-','').match(/.{4}/g).slice(0,6).join(':');
 const reportIP=testIP(),sharedIP=testIP();
 const report=(ctx,body,extra={})=>ctx.request.post(url,{headers:{Origin:BASE,'x-forwarded-for':reportIP,...extra},data:body});
 const deviceId=randomUUID(),body={deviceId,kind:'device',viewport:'390x844@3',route:'/e/'+w.event.code};
 assert.equal((await report(guest,body)).status(),404);count++;
 await api('PATCH',`/api/v1/host/events/${e.id}`,{revision:w.event.revision,status:'live'});
 assert.equal((await report(guest,body)).status(),202);assert.equal((await report(guest,{...body,viewport:'bad'})).status(),400);
 assert.equal((await report(guest,body,{Origin:'https://evil.example'})).status(),403);
 assert.equal((await report(guest,{...body,detail:'x'.repeat(10000)})).status(),413);count++;
 const outcomes=await Promise.all(Array.from({length:35},()=>report(guest,body).then(r=>r.status())));assert.equal(outcomes.filter(x=>x===202).length,29);assert.equal(outcomes.filter(x=>x===429).length,6);count++;
 const next={...body,deviceId:randomUUID()};
 await guest.request.post(BASE+`/api/v1/e/${w.event.code}/join`,{headers:{Origin:BASE},data:{requestId:randomUUID(),displayName:'Device guest',businessName:'Local test'}});
 assert.equal((await report(guest,{...next,kind:'error',message:'Problem at https://example.test/page?token=secret#fragment person@example.test',detail:'password=hello',route:'/e/CODE?token=secret#fragment'})).status(),202);
 const devices=await api('GET',`/api/v1/host/events/${e.id}/devices`);assert.equal(devices.totals.devices,2);assert.equal(devices.totals.joined,1);assert.equal(devices.problems.length,1);
 const raw=JSON.stringify(devices);assert.ok(!raw.includes('secret')&&!raw.includes('person@example.test')&&!raw.includes('password=hello'));assert.equal(devices.problems[0].route,'/e/CODE');count++;
 assert.equal((await other.request.get(BASE+`/api/v1/host/events/${e.id}/devices`)).status(),401);
 const fake=randomUUID();const bad=await staff.request.get(BASE+`/api/v1/host/events/${fake}/devices`);assert.equal(bad.status(),404);count++;
 const database=process.env.BIDZIZI_DATABASE_URL??'';
 if(!/^postgres(?:ql)?:\/\/[^@]*@127\.0\.0\.1:\d+\/bz_test_[a-z0-9_]+$/.test(database))throw new Error('Set a disposable local BIDZIZI_DATABASE_URL for scoping and retention checks.');
 const db=new pg.Client({connectionString:database});await db.connect();
 try{
  const org=(await db.query("INSERT INTO orgs (slug,name) VALUES ($1,'Other test org') RETURNING id",['compat-'+randomUUID().slice(0,8)])).rows[0];
  const email='other-'+randomUUID()+'@example.com';await db.query("INSERT INTO staff (org_id,email,name,password_hash) SELECT $1,$2,'Other tester',password_hash FROM staff WHERE email=$3",[org.id,email,process.env.HOST_EMAIL]);
  const login=await other.request.post(BASE+'/api/v1/host/login',{headers:{Origin:BASE},data:{email,password:process.env.HOST_PASSWORD}});assert.equal(login.status(),200);
  assert.equal((await other.request.get(BASE+`/api/v1/host/events/${e.id}/devices`)).status(),404);
  assert.equal((await other.request.post(BASE+'/api/v1/host/telemetry',{headers:{Origin:BASE},data:{...body,eventId:e.id}})).status(),404);count++;
  await db.query("UPDATE client_reports SET at=now()-interval '31 days' WHERE event_id=$1",[e.id]);
  assert.equal((await report(guest,{...body,deviceId:randomUUID()})).status(),202);
  assert.equal(Number((await db.query("SELECT count(*) FROM client_reports WHERE at<now()-interval '30 days'")).rows[0].count),0);count++;
 }finally{await db.end();}
 const ipOutcomes=await Promise.all(Array.from({length:121},()=>report(guest,{...body,deviceId:randomUUID()},{'x-forwarded-for':sharedIP}).then(r=>r.status())));
 assert.equal(ipOutcomes.filter(x=>x===202).length,120);assert.equal(ipOutcomes.filter(x=>x===429).length,1);count++;
 console.log(`${count}/8 telemetry checks passed: draft isolation, validation/size/origin, concurrent device/IP limits, redaction, staff/tenant scoping and retention`);

}finally{await browser.close();}
