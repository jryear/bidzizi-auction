// Pure validity/composition helpers. Original failures are monotonically retained.
import assert from 'node:assert/strict';
export class InvalidEvidence extends Error {}
export const need=(ok,message)=>{if(!ok)throw new InvalidEvidence(message);};
const same=(a,b)=>{try{assert.deepEqual(a,b);return true;}catch{return false;}};
export function privateResult(result,c,ctx,exit){
 need(result&&same(Object.keys(result).sort(),['protocol','check','phase','run_id','assertions'].sort()),'private protocol keys');
 need(result.protocol===1&&result.check===c.name&&result.phase===ctx.phase&&result.run_id===ctx.runId,'private protocol invocation binding');
 need(Array.isArray(result.assertions)&&result.assertions.length===c.assertions.length,'private incomplete assertions');
 const ids=result.assertions.map(x=>x?.id);need(new Set(ids).size===ids.length&&same(ids.toSorted(),c.assertions.toSorted()),'private assertion ID set');
 need(result.assertions.every(x=>same(Object.keys(x).sort(),['id','status','detail'].sort())&&['pass','fail'].includes(x.status)&&typeof x.detail==='string'),'private malformed assertion');
 need([0,1].includes(exit)&&exit===(result.assertions.some(x=>x.status==='fail')?1:0),'private aggregate exit disagreement');return result.assertions;
}
export function pngSize(bytes){
 need(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR','missing/malformed PNG header');
 return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}
export function supplemental(receipt,plan,ctx){
 need(receipt?.version===1&&receipt.check===ctx.check&&receipt.phase===ctx.phase&&receipt.run_id===ctx.runId&&receipt.sourceCommit===ctx.commit,'supplement invocation/source mismatch');
 need(same(receipt.sourceHashes,ctx.sourceHashes)&&same(receipt.helperHashes,ctx.helperHashes),'supplement source/helper byte mismatch');
 need(Number.isFinite(receipt.startedMs)&&Number.isFinite(receipt.endedMs)&&receipt.startedMs>=ctx.startedMs&&receipt.endedMs>=receipt.startedMs&&receipt.endedMs<=ctx.endedMs,'supplement start/end freshness');
 need(receipt.actualExit===0||receipt.actualExit===1,'supplement harness99/reserved outcome');
 need(Array.isArray(receipt.scenes)&&receipt.scenes.length===8&&plan.scenes.length===8,'supplement complete eight-scene matrix');
 need(new Set(receipt.scenes.map(s=>s.id)).size===8,'supplement duplicate scenes');
 const expected=new Map(plan.scenes.map(s=>[s.id,s]));
 for(const scene of receipt.scenes){
  const p=expected.get(scene.id);need(p,'supplement unknown scene');
  need(same(scene.requestedViewport,p.viewport)&&same(scene.configuredPageViewport,p.viewport)&&same(scene.actualPageViewport,p.viewport)&&same(scene.png.dimensions,p.viewport),'omitted/mislabelled viewport or PNG dimensions');
  need(scene.previewOpen===p.previewOpen&&scene.previewButtonPressed===String(p.previewOpen)&&scene.previewPanelVisible===p.previewOpen&&scene.scrollLabel===p.scroll,'preview/scroll label mismatch');
  need(scene.adminIframeViewport.width>0&&scene.adminIframeViewport.height>0&&scene.adminIframeViewport.width<=p.viewport.width+1&&scene.adminIframeViewport.height<=p.viewport.height+1,'admin iframe viewport missing or impossible');
  need(Math.abs(scene.adminIframeBox.width-scene.adminIframeViewport.width)<=2&&Math.abs(scene.adminIframeBox.height-scene.adminIframeViewport.height)<=2,'admin iframe viewport/boundingbox mismatch');
  need(['main','document.scrollingElement'].includes(scene.scroll.container)&&Number.isFinite(scene.scroll.before)&&Number.isFinite(scene.scroll.after)&&scene.scroll.max>1&&scene.scroll.rafCompleted===2,'actual scroll observation missing');
  if(p.scroll==='top')need(scene.scroll.after<=1,'top scene not at actual top');
  else {need(scene.scroll.before<=1&&scene.scroll.after-scene.scroll.before>1&&scene.scroll.eventObserved===true,'no measurable native scroll transition');need(scene.topReset?.before>1&&scene.topReset.after<=1&&scene.topReset.eventObserved===true&&scene.topReset.rafCompleted===2,'actual top reset incomplete');}
  need(scene.png.path.endsWith('/'+scene.id+'.png')&&/^[a-f0-9]{64}$/.test(scene.png.sha256),'screenshot filename/hash binding');
  need(Array.isArray(scene.rows)&&same(scene.rows.map(r=>r.selector).toSorted(),['#org-name','#event-title','#saved','#save-draft','#preview-toggle','nav[aria-label="Event Studio"]'].toSorted()),'geometry observation matrix incomplete');
  need(scene.rows.every(r=>typeof r.reachable==='boolean')&&typeof scene.overflow==='boolean'&&Array.isArray(scene.failures),'geometry observation types');
  const counted=scene.rows.filter(r=>!r.reachable).length+(scene.overflow?1:0)+(scene.contextMatches?0:1);need(scene.failures.length===counted,'geometry failure aggregate mismatch');
 }
 const failures=receipt.scenes.flatMap(s=>s.failures);need(receipt.actualExit===(failures.length?1:0),'supplement finite failure aggregate mismatch');
 return {failed:failures.length>0,detail:'Eight measured viewport/preview/top/native-scroll scenes; finite reachability defects='+failures.length+'.'};
}
export function compose(originalRows,supplementResult){
 need(supplementResult&&typeof supplementResult.failed==='boolean'&&typeof supplementResult.detail==='string','incomplete supplement cannot produce final assertions');
 need(originalRows.filter(x=>x.id==='REACHABILITY').length===1,'original REACHABILITY missing/duplicate');
 return originalRows.map(row=>row.id==='REACHABILITY'?{...row,status:row.status==='fail'||supplementResult.failed?'fail':'pass',detail:row.detail+' Supplemental: '+supplementResult.detail}:{...row});
}
