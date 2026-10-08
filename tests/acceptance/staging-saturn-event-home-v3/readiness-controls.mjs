#!/usr/bin/env node
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {currentAdminFrame,waitActualAdminFrame} from './readiness.mjs';
import {HarnessError} from '../staging-workspace-entry/harness.mjs';
const origin='http://127.0.0.1:43210',main={},make=(url,{parent=main,detached=false}={})=>({url:()=>url,parentFrame:()=>parent,isDetached:()=>detached});
function fixture(frames=[]){const page=new EventEmitter();page.frames=()=>frames;page.mainFrame=()=>main;return {ui:{f:{origin},page},frames,page};}
const clean=page=>assert.ok(['framenavigated','frameattached','framedetached'].every(e=>page.listenerCount(e)===0));
const good=make(origin+'/staging-admin/index.html'),already=fixture([good]);assert.equal(await waitActualAdminFrame(already.ui,200),good);clean(already.page);
const later=fixture([]),pending=waitActualAdminFrame(later.ui,200);later.frames.push(make('about:blank'));later.page.emit('frameattached');later.frames.splice(0,1,good);later.page.emit('framenavigated',good);assert.equal(await pending,good);clean(later.page);
for(const frame of [make('https://foreign.example/staging-admin/index.html'),make(origin+'/staging-bidder-preview/index.html'),make(origin+'/staging-admin/index.html',{parent:{}}),make(origin+'/staging-admin/index.html',{detached:true})]){const x=fixture([frame]);assert.equal(currentAdminFrame(x.ui),null);await assert.rejects(waitActualAdminFrame(x.ui,5),HarnessError);clean(x.page);}
const absent=fixture();await assert.rejects(waitActualAdminFrame(absent.ui,5),HarnessError);clean(absent.page);
const duplicate=fixture([good,make(origin+'/staging-admin/index.html')]);await assert.rejects(waitActualAdminFrame(duplicate.ui,20),HarnessError);clean(duplicate.page);
console.log('8 native iframe readiness controls passed: alreadyready, laternavigation, foreign/preview/nested/detached/absent/duplicate refusal; every listener/timer cleaned up.');
// Execute the actual observation callbacks in isolated document contexts; same Frame object can change document.
const {readyConsumedRead}=await import('./readiness.mjs');const vm=await import('node:vm');
function consumptionControl({parsed=true,replaceDocument=false}={}){
 let documentId=1,identityReads=0,readObservations=0,disposals=0;
 const context=()=>({window:{__workspaceReadBodies:[{path:'/api/admin/events',method:'GET',status:200,sequence:7,parsed,documentId}]},performance:{timeOrigin:documentId*1000},location:{href:origin+'/staging-admin/index.html'},setTimeout,requestAnimationFrame:cb=>setImmediate(cb)});
 const frame={...make(origin+'/staging-admin/index.html'),frameElement:async()=>({getAttribute:async()=> 'BidZizi admin workspace',dispose:async()=>{disposals++;}}),evaluate:async(fn,arg)=>{const value=await vm.runInNewContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context());if(value?.timeOrigin){identityReads++;if(replaceDocument&&identityReads===1)documentId=2;}if(value?.path)readObservations++;return value;}};
 const x=fixture([frame]);return {...x,stats:()=>({identityReads,readObservations,disposals})};
}
const valid=consumptionControl();assert.equal((await readyConsumedRead(valid.ui,'/api/admin/events',{status:200,after:6,deadlineMs:500})).sequence,7);assert.equal(valid.stats().readObservations,1);clean(valid.page);
const replaced=consumptionControl({replaceDocument:true});assert.equal((await readyConsumedRead(replaced.ui,'/api/admin/events',{status:200,after:6,deadlineMs:500})).documentId,2);assert.equal(replaced.stats().readObservations,2,'Changed document identity requires consumption again');assert.equal(replaced.stats().disposals,2);clean(replaced.page);
const malformed=consumptionControl({parsed:false});await assert.rejects(readyConsumedRead(malformed.ui,'/api/admin/events',{status:200,after:6,deadlineMs:500}),HarnessError);clean(malformed.page);
console.log('3 document-consumption controls passed: current parsedread, sameFrame document replacement requires fresh consumption, unparsed read remains99.');
