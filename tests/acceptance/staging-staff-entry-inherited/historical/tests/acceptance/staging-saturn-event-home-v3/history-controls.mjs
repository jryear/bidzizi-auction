// CONTROL ONLY: real held approval proves the pending guard and the normal-history precondition.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {withFixture} from '../staging-workspace-entry/harness.mjs';
import {fixture,healthy,readPacket} from '../staging-workspace-entry/fixtures.mjs';
import {expect,bounded,deferred,taskFrameFlush,preview} from './browser.mjs';
import {homeBrowser} from './checks.mjs';
import {markNavigationReads,completeNavigationReads} from './history-readiness.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),root=process.cwd();
const config=JSON.parse(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8')),paths=config.checks[0].chain,sourcePaths=Object.keys(JSON.parse(await readFile(new URL('../staging-workspace-entry/SOURCE_BINDING.json',import.meta.url),'utf8')).sha256).sort();
const map=async ps=>Object.fromEntries(await Promise.all(ps.map(async p=>[p,hash(await readFile(root+'/'+p))])));
const sourceCommit=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHashes=await map(sourcePaths),helperHashes=await map(paths),observations=[];
await withFixture(async f=>{
 await healthy(f);const a=await fixture(f,'005 normal history control first'),b=await fixture(f,'005 held history control second');
 await homeBrowser(f,async ui=>{
  let marker=await markNavigationReads(ui);await ui.admin.locator('[data-action="switch-event"][data-id="'+a.packet.event.id+'"]').click();await completeNavigationReads(ui,marker,a.packet.event.id);
  marker=await markNavigationReads(ui);await ui.admin.locator('[data-action="events-home"]').first().click();await completeNavigationReads(ui,marker);marker=await markNavigationReads(ui);await ui.admin.locator('[data-action="switch-event"][data-id="'+b.packet.event.id+'"]').click();await completeNavigationReads(ui,marker,b.packet.event.id);
  const arrived=deferred(),release=deferred();let once=false,finished=false,pending;
  await ui.page.route('**/api/admin/events/'+b.packet.event.id+'/catalog-approval',async route=>{if(once)return route.continue();once=true;const response=await route.fetch();assert.equal(response.status(),200);arrived.resolve();await release.promise;await route.fulfill({response});});
  try{
   marker=await markNavigationReads(ui);await ui.page.reload({waitUntil:'domcontentloaded'});await bounded(arrived.promise,'Real held reload approval captured');await expect(ui.admin.locator('[data-event="name"]')).toHaveValue(b.packet.event.name);await expect(ui.admin.locator('#catalog-approval')).toHaveText('Checking approval…');
   pending=completeNavigationReads(ui,marker,b.packet.event.id).then(value=>{finished=true;return value;});pending.catch(()=>{});
   await ui.page.goBack({waitUntil:'domcontentloaded'});await taskFrameFlush(ui,'Native pending Back challenge');assert.equal(finished,false,'Fresh completion cannot be satisfied by pre-reload or unparsed held approval');assert.equal(new URL(await ui.page.evaluate(()=>location.href)).searchParams.get('event'),b.packet.event.id);assert.equal(await ui.admin.locator('#events-home').count(),0);assert.equal(await ui.admin.locator('[data-event="name"]').inputValue(),b.packet.event.name);await expect(ui.admin.locator('[data-action="events-home"]').first()).toBeDisabled();assert.deepEqual(await readPacket(f,b.actor,b.packet.event.id),b.packet);
   observations.push({id:'HELD_APPROVAL_STILL_BLOCKS_NORMAL_BACK',actualExit:0,completionFinished:false});
   release.resolve();const fresh=await pending;assert.equal(fresh.reset,true,'Real outer reload must explicitly reset request marker for its new native document');assert.equal(fresh.after,0);assert.ok(fresh.reads.every(r=>r.parsed===true&&r.status===200&&r.sequence>0));await expect(ui.admin.locator('[data-action="events-home"]').first()).toBeEnabled();
   marker=await markNavigationReads(ui);await ui.page.goBack({waitUntil:'domcontentloaded'});const same=await completeNavigationReads(ui,marker,a.packet.event.id);assert.equal(same.reset,false,'Same current iframe document uses its pretrigger sequence');assert.equal(same.after,marker.sequence);assert.ok(same.reads.every(r=>r.parsed===true&&r.status===200&&r.sequence>marker.sequence));await expect(ui.admin.locator('[data-event="name"]')).toHaveValue(a.packet.event.name);assert.equal(new URL(await ui.page.evaluate(()=>location.href)).searchParams.get('event'),a.packet.event.id);await preview(ui,a.packet,{render:false});assert.deepEqual(await readPacket(f,a.actor,a.packet.event.id),a.packet);assert.deepEqual(ui.errors,[]);
   observations.push({id:'FRESH_COMPLETED_APPROVAL_ENABLES_NORMAL_BACK',actualExit:0,newDocumentReset:fresh.reset,sameDocumentAfter:same.after});
  }finally{release.resolve();if(pending)await pending.catch(()=>{});}
 });
});
assert.deepEqual(await map(sourcePaths),sourceHashes);assert.deepEqual(await map(paths),helperHashes);
const receipt={controlOnly:true,gateProof:false,sourceRoot:root,sourceCommit,sourceHashes,helperHashes,observations};const path=process.argv[2]||'/tmp/task-root/saturn005-v3-history-controls.json';await writeFile(path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log('HISTORY_CONTROLS '+JSON.stringify({path,sha256:hash(await readFile(path)),observations:observations.length}));
