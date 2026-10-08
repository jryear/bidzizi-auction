// Additive rendered probe. No source/DOM layout rewrites; actual native scroll only.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {withFixture,HarnessError} from '../staging-workspace-entry/harness.mjs';
import {healthy,fixture} from '../staging-workspace-entry/fixtures.mjs';
import {browserFixture,bounded,taskFrameFlush} from '../staging-workspace-entry/browser.mjs';
import {need,pngSize} from './validate.mjs';
export async function probe(output,plan,binding){
 const startedMs=Date.now(),scenes=[];
 await withFixture(async f=>{
  await healthy(f);const x=await fixture(f,'004 measured viewport and scroll supplement');
  for(const viewport of [{width:1440,height:900},{width:1280,height:800}]){
   // The fourth argument is essential: default viewport must never masquerade as1280.
   await browserFixture(f,x.packet,async ui=>{
    for(const previewOpen of [true,false]){
     if((await ui.admin.locator('#preview-toggle').getAttribute('aria-pressed'))!==String(previewOpen))await ui.admin.locator('#preview-toggle').click();
     await taskFrameFlush(ui,'Preview visibility settled');
     for(const scrollLabel of ['top','scrolled']){
      const scroll=await bounded(ui.frame.evaluate(async label=>{
       const main=document.querySelector('#main'),doc=document.scrollingElement;
       const mainScrollable=main&&main.scrollHeight-main.clientHeight>1&&/auto|scroll|overlay/.test(getComputedStyle(main).overflowY);
       const el=mainScrollable?main:doc,name=mainScrollable?'main':'document.scrollingElement';
       if(!el||el.scrollHeight-el.clientHeight<=1)throw Error('Actual page has no measurable scroll container');
       const max=el.scrollHeight-el.clientHeight,target=label==='top'?0:max,before=el.scrollTop;
       let eventObserved=false;const eventTarget=mainScrollable?el:window,listener=()=>{eventObserved=true;};eventTarget.addEventListener('scroll',listener,{passive:true});
       try{
        el.scrollTop=target;
        await Promise.race([new Promise(async done=>{while(Math.abs(el.scrollTop-target)>1||Math.abs(target-before)>1&&!eventObserved)await new Promise(r=>requestAnimationFrame(r));done();}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native scroll transition deadline')),2500))]);
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        return {container:name,before,after:el.scrollTop,max,eventObserved,rafCompleted:2};
       }finally{eventTarget.removeEventListener('scroll',listener);}
      },scrollLabel),'Actual scroll/event/RAF completion',3500);
      const id=viewport.width+'x'+viewport.height+'-preview-'+previewOpen+'-'+scrollLabel;
      const observed=await ui.frame.evaluate(({org,event,open})=>{
       const selectors=['#org-name','#event-title','#saved','#save-draft','#preview-toggle','nav[aria-label="Event Studio"]'];
       const panel=document.querySelector('.preview'),pr=panel?.getBoundingClientRect();
       return {adminIframeViewport:{width:innerWidth,height:innerHeight},previewButtonPressed:document.querySelector('#preview-toggle')?.getAttribute('aria-pressed'),previewPanelVisible:!!pr&&pr.width>0&&pr.height>0&&getComputedStyle(panel).display!=='none',overflow:document.documentElement.scrollWidth>innerWidth+1,contextMatches:document.querySelector('#org-name')?.textContent===org&&document.querySelector('#event-title')?.textContent===event,rows:selectors.map(selector=>{const el=document.querySelector(selector),r=el?.getBoundingClientRect();return {selector,rect:r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null,reachable:!!r&&r.width>0&&r.height>0&&r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};})};
      },{org:x.packet.org.name,event:x.packet.event.name,open:previewOpen});
      const adminIframeBox=await ui.page.locator('iframe[title="BidZizi admin workspace"]').boundingBox();if(!adminIframeBox)throw new HarnessError('Actual admin iframe bounding geometry absent');
      // Record actual admin iframe viewport separately; do not pretend its footer/layout equals outer height.
      for(const row of observed.rows)if(row.rect)row.reachable=row.reachable&&adminIframeBox.x+row.rect.x>=-1&&adminIframeBox.y+row.rect.y>=-1&&adminIframeBox.x+row.rect.right<=viewport.width+1&&adminIframeBox.y+row.rect.bottom<=viewport.height+1;
      const bidderFrame=ui.page.frames().find(fr=>fr.url().includes('/staging-bidder-preview/index.html'));
      const bidderIframeViewport=bidderFrame?await bidderFrame.evaluate(()=>({width:innerWidth,height:innerHeight})):null;
      const configuredPageViewport=ui.page.viewportSize(),actualPageViewport=await ui.page.evaluate(()=>({width:innerWidth,height:innerHeight})),devicePixelRatio=await ui.page.evaluate(()=>window.devicePixelRatio),path=join(output,id+'.png');await ui.page.screenshot({path,type:'png',fullPage:false,scale:'css'});const bytes=await readFile(path);
      const failures=observed.rows.filter(r=>!r.reachable).map(r=>id+': '+r.selector+' unreachable');if(observed.overflow)failures.push(id+': horizontal overflow');if(!observed.contextMatches)failures.push(id+': current org/event mismatch');
      scenes.push({id,requestedViewport:viewport,configuredPageViewport,actualPageViewport,devicePixelRatio,screenshotScale:'css',previewOpen,scrollLabel,...observed,adminIframeBox,bidderIframeViewport,scroll,png:{path,dimensions:pngSize(bytes),sha256:createHash('sha256').update(bytes).digest('hex')},failures});
      if(ui.errors.length)throw new HarnessError('Application pageerror during measured rendering: '+ui.errors.join('; '));
     }
     // Restore the real container to top before the next preview scene, with native frame completion.
     const topReset=await bounded(ui.frame.evaluate(async()=>{
      const main=document.querySelector('#main'),isMain=main&&main.scrollHeight-main.clientHeight>1&&/auto|scroll|overlay/.test(getComputedStyle(main).overflowY),el=isMain?main:document.scrollingElement,eventTarget=isMain?el:window,before=el.scrollTop;let eventObserved=false;const listener=()=>{eventObserved=true;};eventTarget.addEventListener('scroll',listener,{passive:true});
      try{el.scrollTop=0;await Promise.race([new Promise(async done=>{while(el.scrollTop>1||before>1&&!eventObserved)await new Promise(r=>requestAnimationFrame(r));done();}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native top-reset deadline')),2500))]);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {before,after:el.scrollTop,eventObserved,rafCompleted:2};}finally{eventTarget.removeEventListener('scroll',listener);}
     }),'Actual top reset completion',3500);scenes.at(-1).topReset=topReset;
    }
   },{viewport});
  }
 });
 const receipt={version:1,check:binding.check,phase:binding.phase,run_id:binding.runId,sourceCommit:binding.commit,sourceHashes:binding.sourceHashes,helperHashes:binding.helperHashes,startedMs,endedMs:Date.now(),scenes,actualExit:scenes.some(s=>s.failures.length)?1:0};
 await writeFile(join(output,'SUPPLEMENT_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return receipt;
}
