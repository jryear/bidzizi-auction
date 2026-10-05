// Oracle sensitivity probes only. DOM controls are never candidate completion proof.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {withFixture,request,evidenceExit,HarnessError,ApplicationFailure} from './harness.mjs';
import {healthy,fixture} from './fixtures.mjs';
import {browserFixture,navOracle,consumedRead} from './browser.mjs';
const output=resolve(process.argv[2]||await mkdtemp('/tmp/workspace-oracles-'));await mkdir(output,{recursive:true});const rows=[];
async function rejects(id,fn){let error;try{await fn();}catch(e){error=e;}assert.ok(error instanceof assert.AssertionError,id+' must fail a finite oracle assertion');rows.push({id,oracleRejected:true,probe:true,message:error.message});console.log('ORACLE '+id+' rejected '+error.message);}
try{
 await withFixture(async f=>{await healthy(f);const x=await fixture(f,'004 nav oracle baseline');await browserFixture(f,x.packet,async ui=>{
 await ui.page.screenshot({path:join(output,'actual-baseline-before-nav-DOM-probes.png')});
 await ui.frame.evaluate(()=>document.querySelector('nav[aria-label="Event workspace"]').setAttribute('aria-label','Event Studio'));
 await rejects('NAV_RENAMED_ONLY',()=>navOracle(ui));
 // Labeled DOM positive geometry fixture: demonstrates actual assertion sensitivity, not implementation.
 await ui.frame.evaluate(()=>{const nav=document.querySelector('nav[aria-label="Event Studio"]');Object.assign(nav.style,{position:'fixed',left:'16px',top:'160px',width:'170px',height:'300px',display:'flex',flexDirection:'column'});document.querySelector('#main').style.marginLeft='220px';});
 await navOracle(ui);rows.push({id:'NAV_DOM_POSITIVE_REFERENCE',oraclePassed:true,probe:true});
 await ui.frame.evaluate(()=>{const nav=document.querySelector('nav[aria-label="Event Studio"]');nav.append(nav.querySelector('[data-tab="event"]').cloneNode(true));});
 await rejects('NAV_DUPLICATE_LINKS',()=>navOracle(ui));
 });});
 const server=createServer((req,res)=>{res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"synthetic local control"}');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{let e;try{await request('http://127.0.0.1:'+server.address().port,'/');}catch(error){e=error;}assert.ok(e instanceof ApplicationFailure);assert.equal(evidenceExit(e),99);rows.push({id:'HTTP500_CLASSIFICATION',exit:99,localControl:true});}finally{await new Promise(r=>server.close(r));}
 let missingConsumption;try{await consumedRead({frame:{evaluate:async()=>undefined}},'/api/admin/events/explicit-missing-consumption-control');}catch(e){missingConsumption=e;}assert.ok(missingConsumption instanceof HarnessError);assert.equal(evidenceExit(missingConsumption),99);rows.push({id:'MISSING_ACTUAL_JSON_CONSUMPTION',exit:99,observerControl:true});
 assert.equal(evidenceExit(new HarnessError('Missing tools or dependency')),99);assert.equal(evidenceExit(new Error('Unexpected internal error')),99);assert.equal(evidenceExit(new assert.AssertionError({message:'Finite observable failure'})),1);
 await writeFile(join(output,'ORACLE_RECEIPT.json'),JSON.stringify({classification:'Independent oracle probes; no candidate gate or kernel proof',rows},null,2)+'\n');
}catch(e){console.error(e.message);process.exitCode=99;}
