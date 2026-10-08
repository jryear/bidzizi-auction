// Diagnostic-only independent reference and broken variants, served in a disposable browser.
// No reference code is written into product source; these observations never claim application GREEN.
import {createHash} from 'node:crypto';
import {HarnessError} from '../staging-workspace-entry/harness.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export const controls=['REFERENCE','MISSING_COPY','WRONG_SOURCE','DUPLICATE_ID','ASSIGNED_WINDOW','RUNTIME_CARRYOVER','PREVIEW_CORRUPTION'];
export function controlledSource(original,control){
 if(!controls.includes(control))throw new HarnessError('Unknown bounded source control');
 if(control==='MISSING_COPY')return original.replaceAll('Duplicate lot','Unavailable action');
 if(original.includes("'duplicate-lot':"))throw new HarnessError('Freeze-time reference controls require original no-copy base; execute candidate mutations separately');
 const editor='<div class="lot-footer"><div class="order-controls">',action=" 'add-lot':()=>{",lock='[data-action="add-lot"],[data-action="move-up"]';
 if(!original.includes(editor)||!original.includes(action)||!original.includes(lock))throw new HarnessError('Exact source control anchors unavailable');
 let source=control==='WRONG_SOURCE'?'d.lots[0]':'chosen()',identity=control==='DUPLICATE_ID'?'source.id':'crypto.randomUUID()',window=control==='ASSIGNED_WINDOW'?'source.windowId':'null';
 const runtime=control==='RUNTIME_CARRYOVER'?"Object.assign(lot,{count:source.count,current:source.current,history:clone(source.history),standing:clone(source.standing),approvalId:source.approvalId,publicationState:source.publicationState});":'';
 const body=` 'duplicate-lot':()=>{if(!editable()||!chosen())return;if(d.lots.length>=100){toast('This event already has 100 lots.');return;}const source=${source},id=${identity};const lot={id,number:String(d.lots.length+1).padStart(2,'0'),provider:d.org.name,logo:'saturn',count:0,current:0,history:[],...Object.fromEntries(['title','short','description','category','image','alt','opening','includes','fine'].map(k=>[k,clone(source[k])])),windowId:${window}};${runtime}d.lots.push(lot);markDirty();navigate('lots',id);refresh();},\n`;
 let result=original.replace(editor,'<div class="lot-footer"><button class="btn" data-action="duplicate-lot">Duplicate lot</button><div class="order-controls">').replace(action,body+action).replace(lock,'[data-action="duplicate-lot"],'+lock);
 if(control==='PREVIEW_CORRUPTION'){
  const anchor="const packet=previewMode==='saved'?confirmed:d;";if(!result.includes(anchor))throw new HarnessError('Preview control anchor unavailable');
  result=result.replace(anchor,"const packet=clone(previewMode==='saved'?confirmed:d);if(previewMode==='saved'&&packet.lots.length>2)packet.lots.at(-1).title='BROKEN SAVED PREVIEW COPY';");
 }
 return result;
}
export async function installControl(ui,control){
 await ui.page.route('**/staging-admin/studio.js',async route=>{const response=await route.fetch();if(response.status()!==200)throw new HarnessError('Source control fetch unavailable');const original=await response.text(),result=controlledSource(original,control);console.log('SOURCE_CONTROL '+JSON.stringify({control,originalSHA256:hash(original),servedSHA256:hash(result),gateProof:false}));await route.fulfill({response,body:result});});
}
