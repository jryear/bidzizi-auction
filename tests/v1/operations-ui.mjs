#!/usr/bin/env node
// Connected browser rehearsal of the no-developer operations, through the Claude shell's Studio. Disposable local DB only.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import {randomUUID} from 'node:crypto';
const BASE=process.env.BASE??'http://127.0.0.1:3420';
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(), errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto(BASE+'/studio');
await page.getByLabel('Email',{exact:true}).fill(process.env.HOST_EMAIL);
await page.getByLabel('Password',{exact:true}).fill(process.env.HOST_PASSWORD);
await page.getByRole('button',{name:'Sign in',exact:true}).click();
await page.locator('.home-wrap').waitFor();
async function call(method,path,data){const r=await context.request.fetch(BASE+path,{method,headers:{Origin:BASE},data});const body=await r.json();assert.ok(r.ok(),JSON.stringify(body));return body;}
const event=await call('POST','/api/v1/host/events',{requestId:randomUUID(),name:'UI rehearsal '+randomUUID().slice(0,6),isPractice:true,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()});
const item=await call('POST',`/api/v1/host/events/${event.id}/items`,{requestId:randomUUID(),title:'Practice prize',openingMinor:10000});
let w=await call('GET',`/api/v1/host/events/${event.id}`);
await call('PATCH',`/api/v1/host/events/${event.id}`,{revision:w.event.revision,status:'live'});
const participant=await browser.newContext();
async function pcall(method,path,data){const r=await participant.request.fetch(BASE+path,{method,headers:{Origin:BASE},data});assert.ok(r.ok(),await r.text());return r.json();}
await pcall('POST',`/api/v1/e/${w.event.code}/join`,{requestId:randomUUID(),displayName:'Pat Test',businessName:'One Studio'});
await pcall('POST',`/api/v1/e/${w.event.code}/bid`,{requestId:randomUUID(),itemId:item.id,amountMinor:10000});
await page.goto(`${BASE}/studio/${event.id}`);await page.getByRole('tab',{name:'Live',exact:true}).click();
await page.getByRole('button',{name:/Practice prize/}).click();
await page.getByRole('button',{name:'Void bid',exact:true}).click();await page.getByLabel('Reason',{exact:true}).fill('Wrong amount during rehearsal');await page.getByRole('button',{name:'Confirm void',exact:true}).click();
await page.getByText('Voided · Wrong amount during rehearsal').waitFor();
w=await call('GET',`/api/v1/host/events/${event.id}`);assert.equal(w.items[0].currentMinor,null);assert.equal(w.items[0].bidCount,0);
await page.getByRole('button',{name:'Withdraw item',exact:true}).click();await page.getByLabel('Message to participants').fill('Practice prize is unavailable.');await page.getByRole('button',{name:'Confirm withdrawal'}).click();await page.getByText('Withdrawn · Practice prize is unavailable.').waitFor();
await page.getByLabel('Options for Pat Test').click();await page.getByRole('menuitem',{name:'Edit participant',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('Pat Updated');await page.getByLabel('Business',{exact:true}).fill('Updated Studio');await page.getByRole('button',{name:'Save participant'}).click();await page.getByText('Updated Studio',{exact:true}).first().waitFor();
assert.equal((await pcall('GET',`/api/v1/e/${w.event.code}`)).me.displayName,'Pat Updated');
await page.getByRole('tab',{name:'Set up',exact:true}).click();await page.locator('details.housekeeping').evaluate(d=>{d.open=true;});await page.getByRole('button',{name:'Reset practice',exact:true}).click();await page.getByLabel(`Type ${w.event.name}`,{exact:true}).fill(w.event.name);await page.getByRole('button',{name:'Confirm reset'}).click();
await page.getByText('Practice reset. Share the new join code for your next run.').waitFor();
w=await call('GET',`/api/v1/host/events/${event.id}`);assert.equal(w.participants.length,0);
await page.locator('details.housekeeping').evaluate(d=>{d.open=true;});
await page.getByRole('button',{name:'Delete event',exact:true}).click();await page.getByLabel(`Type ${w.event.name}`,{exact:true}).fill(w.event.name);await page.getByRole('button',{name:'Confirm delete'}).click();await page.waitForURL(BASE+'/studio');
await page.getByRole('button',{name:'Staff & access',exact:true}).click();await page.getByLabel('Colleague’s name').fill('UI Helper');const helperEmail=`ui-${randomUUID()}@example.com`;await page.getByLabel('Email',{exact:true}).fill(helperEmail);await page.getByRole('button',{name:'Create invite',exact:true}).click();await page.getByLabel('One-time setup link').waitFor();const setup=await page.getByLabel('One-time setup link').inputValue();
const helper=await browser.newContext();const hp=await helper.newPage();await hp.goto(setup);await hp.getByLabel('New password').fill('new-ui-password-123');await hp.getByRole('button',{name:'Save password'}).click();await hp.getByRole('heading',{name:'You’re ready to host.'}).waitFor();assert.equal(new URL(hp.url()).hash,'');
await hp.getByRole('link',{name:'Sign in',exact:true}).click();await hp.getByLabel('Email',{exact:true}).fill(helperEmail);await hp.getByLabel('Password',{exact:true}).fill('new-ui-password-123');await hp.getByRole('button',{name:'Sign in',exact:true}).click();await hp.locator('.home-wrap').waitFor();
await page.getByRole('button',{name:'Refresh staff',exact:true}).click();const row=page.locator('.staff-row').filter({hasText:helperEmail});await row.getByRole('button',{name:'Reset password',exact:true}).click();await page.waitForFunction(old=>{const el=document.querySelector('[aria-label="One-time setup link"]');return el&&el.value&&el.value!==old;},setup);const resetLink=await page.getByLabel('One-time setup link').inputValue();const rp=await helper.newPage();await rp.goto(resetLink);await rp.getByLabel('New password').fill('reset-ui-password-456');await rp.getByRole('button',{name:'Save password'}).click();await rp.getByRole('heading',{name:'You’re ready to host.'}).waitFor();assert.equal((await helper.request.get(BASE+'/api/v1/host/events')).status(),401);
assert.deepEqual(errors,[]);console.log('PASS UI: void, withdrawal, edit participant, reset, delete, invite, password setup and reset/session revocation; no page errors');await browser.close();
