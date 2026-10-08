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
  need(scene.screenshotScale==='css'&&Number.isFinite(scene.devicePixelRatio)&&scene.devicePixelRatio>0,'invalid screenshot scale/device pixel ratio');
  const viewport=scene.adminIframeViewport,box=scene.adminIframeBox;
  need(viewport&&['width','height'].every(k=>Number.isFinite(viewport[k])&&viewport[k]>0)&&viewport.width<=p.viewport.width+1&&viewport.height<=p.viewport.height+1,'admin iframe viewport missing or impossible');
  need(box&&['x','y','width','height'].every(k=>Number.isFinite(box[k]))&&box.width>0&&box.height>0,'admin iframe box missing/nonfinite');
  need(Math.abs(box.width-viewport.width)<=2&&Math.abs(box.height-viewport.height)<=2,'admin iframe viewport/boundingbox mismatch');
  const scroll=scene.scroll;
  need(scroll&&['main','workspace','document.scrollingElement'].includes(scroll.container)&&['before','after','max'].every(k=>Number.isFinite(scroll[k])&&scroll[k]>=0)&&scroll.max>1&&scroll.before<=scroll.max&&scroll.after<=scroll.max&&typeof scroll.eventObserved==='boolean'&&scroll.rafCompleted===2,'actual bounded scroll observation missing');
  if(p.scroll==='top')need(scroll.after<=1,'top scene not at actual top');
  else {
   need(scroll.before<=1&&scroll.after-scroll.before>1&&scroll.eventObserved===true,'no measurable native scroll transition');const reset=scene.topReset;
   need(reset&&['before','after'].every(k=>Number.isFinite(reset[k])&&reset[k]>=0&&reset[k]<=scroll.max)&&reset.before>1&&reset.after<=1&&reset.eventObserved===true&&reset.rafCompleted===2,'actual bounded top reset incomplete');
  }
  need(scene.png.path.endsWith('/'+scene.id+'.png')&&/^[a-f0-9]{64}$/.test(scene.png.sha256),'screenshot filename/hash binding');
  need(Array.isArray(scene.rows)&&same(scene.rows.map(r=>r.selector).toSorted(),['#org-name','#event-title','#saved','#save-draft','#preview-toggle','nav[aria-label="Event Studio"]'].toSorted()),'geometry observation matrix incomplete');
  need(typeof scene.contextMatches==='boolean'&&typeof scene.overflow==='boolean'&&Array.isArray(scene.failures)&&scene.failures.every(f=>typeof f==='string'),'geometry/context/failure observation types');
  for(const row of scene.rows){
   need(typeof row.reachable==='boolean'&&(row.rect===null||row.rect&&['x','y','width','height','right','bottom'].every(k=>Number.isFinite(row.rect[k]))),'missing/nonfinite native row geometry');
   const r=row.rect;
   if(r)need(r.width>=0&&r.height>=0&&Math.abs(r.right-r.x-r.width)<=0.01&&Math.abs(r.bottom-r.y-r.height)<=0.01,'inconsistent native rectangle extent');
   const reachable=!!r&&r.width>0&&r.height>0&&r.x>=-1&&r.y>=-1&&r.right<=viewport.width+1&&r.bottom<=viewport.height+1&&box.x+r.x>=-1&&box.y+r.y>=-1&&box.x+r.right<=p.viewport.width+1&&box.y+r.bottom<=p.viewport.height+1;
   need(row.reachable===reachable,'recorded reachability disagrees with native rect/iframe/parent bounds');
  }
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
