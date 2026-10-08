// CONTROL ONLY: deliberate local negative observations, never passed as candidate gate receipts.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {expect} from '@playwright/test';
import {withFixture} from '../../staging-workspace-entry/harness.mjs';
import {fixture,healthy,compact,ids} from '../../staging-workspace-entry/fixtures.mjs';
import {browserFixture} from '../browser.mjs';
import {assertStoredDraft} from '../../staff-drafts/protocol.mjs';
import {commandRows} from '../../staging-workspace-entry-schema2-v1/validate.mjs';
import {selectExistingEvent,observeRestoredCatalog} from './navigation.mjs';
import {classifyError} from '../classify.mjs';
const results=[],AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor,hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const configuration=JSON.parse(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8'));const helperPaths=configuration.checks[10].chain;const map=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(join(process.cwd(),p)))])));const sourceCommit=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),helperHashes=await map(helperPaths),sourcePaths=Object.keys(JSON.parse(await readFile(new URL('../../staging-workspace-entry/SOURCE_BINDING.json',import.meta.url),'utf8')).sha256).sort(),sourceHashes=await map(sourcePaths);
const source=await readFile(new URL('../../staff-drafts/context-race.mjs',import.meta.url),'utf8');
const staleLine=source.split('\n').find(s=>s.includes("assert.ok(!(await admin.locator('body').innerText()).includes(held.draft.event.name)"));assert.ok(staleLine);
const checks=await readFile(new URL('../checks.mjs',import.meta.url),'utf8');const historyLine="await expect(ui.admin.locator('[data-tab=\"lots\"]')).toHaveAttribute('aria-current','page');";assert.ok(checks.includes(historyLine));
async function negative(name,fn,{legacy=false}={}){let error;try{await fn();}catch(e){error=e;}assert.ok(error,name+' must reject its concrete negative observation');const leaf=classifyError(error);assert.equal(leaf,1,name+' must reach a finite product assertion');let wrapper=null;if(legacy){try{commandRows({assertions:['LEGACY'],marker:'unused',count:1,index:10},{exit:1,stdout:'',stderr:'FAIL: '+error.message,phase:'candidate'});}catch{wrapper=99;}assert.equal(wrapper,99,'Unchanged legacy minimal-log wrapper classification remains accurately99');}results.push({name,leafExit:leaf,legacyMinimalLogWrapperExit:wrapper,detail:error.message});}
await withFixture(async f=>{
 await healthy(f);const saturn=await fixture(f,'Navigation control Saturn'),pine=await fixture(f,'Navigation control Pine',{account:'staff-pine',organization:ids.pine});
 await browserFixture(f,saturn.packet,async ui=>{
  // No application patch: erase a persisted tab query, then perform real outer navigation.
  await ui.admin.getByRole('link',{name:/^Lots/}).click();await expect(ui.admin.locator('[data-tab="lots"]')).toHaveAttribute('aria-current','page');
  await ui.page.evaluate(()=>{const url=new URL(location.href);url.searchParams.delete('tab');url.searchParams.delete('lot');history.replaceState(history.state,'',url);});
  await ui.page.reload({waitUntil:'domcontentloaded'});
  await observeRestoredCatalog(f,saturn.actor,ui.page,ui.admin,saturn.packet);
  results.push({name:'Truthful Event reload preserves shared catalog full packet/SQL/preview',leafExit:0});
  await negative('Mandatory HOME_DETAILS_HISTORY rejects truthful lost Lots route',()=>new AsyncFunction('ui','expect',historyLine)(ui,expect));
 });
 await browserFixture(f,pine.packet,async ui=>{
  // Mutation is a controlled native DOM counterexample after current Pine selection.
  await ui.admin.locator('body').evaluate((body,name)=>{const p=document.createElement('p');p.id='controlled-stale-private-canary';p.textContent=name;body.append(p);},saturn.packet.event.name);
  await negative('Exact frozen stale-private-content assertion rejects current Pine contamination',()=>new AsyncFunction('assert','admin','held',staleLine)(assert,ui.admin,{draft:saturn.packet}),{legacy:true});
 },{account:'staff-pine'});
 const before=compact(saturn.packet);await f.db.query("UPDATE bz_events SET draft=jsonb_set(draft,'{name}',to_jsonb($2::text)) WHERE id=$1",[saturn.packet.event.id,'Controlled corrupted durable name']);
 try{await negative('Exact frozen staff complete durable SQL assertion rejects changed stored data',()=>assertStoredDraft(f,saturn.packet.event.id,before),{legacy:true});}
 finally{await f.db.query('UPDATE bz_events SET draft=$2::jsonb WHERE id=$1',[saturn.packet.event.id,JSON.stringify(before.event)]);}
 // Missing authorized UID cannot fall through to auto-selected or arbitrary data.
 await browserFixture(f,saturn.packet,async ui=>{
  await ui.admin.locator('[data-action="events-home"]').first().click();await expect(ui.admin.locator('#events-home')).toBeVisible();
  await negative('Native home selection rejects foreign UID rather than selecting a fallback',()=>selectExistingEvent(ui.page,ui.admin,pine.packet),{legacy:true});
 });
});
assert.deepEqual(await map(helperPaths),helperHashes);assert.deepEqual(await map(sourcePaths),sourceHashes);
const receipt={sourceCommit,sourceHashes,helperHashes,controlOnly:true,gateProof:false,sourceRoot:process.cwd(),staleAssertionSHA256:hash(staleLine),mandatoryHistoryAssertionSHA256:hash(historyLine),results};
const path=process.argv[2]||'/tmp/task-root/saturn005-v3-navigation-controls.json';await writeFile(path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log('NAVIGATION_CONTROLS '+JSON.stringify({path,sha256:hash(await readFile(path)),results:results.length}));
