import { chromium } from '@playwright/test';
import { composition as observeComposition,invalid as observeInvalid,checklist as observeChecklist } from './observe.mjs';
import * as oracle from './oracles.mjs';
import { must } from './fixture.mjs';
import { ownedBrowser,refreshOwned,verifyGone } from './cleanup.mjs';

// Native DOM controls challenge the same measurement functions as the app run.
// Typed durable tuple/request controls challenge those subpredicates only; actual
// SQL, network loss and session boundaries are proved by cases.mjs.
export async function controls(_f,record) {
  const rows=[];
  const check=(id,positive,broken,validate)=>{
    let reference=true,rejected=false;
    try{validate(positive);}catch(e){if(!(e instanceof oracle.ReachedMismatch))throw e;reference=false;}
    try{validate(broken);}catch(e){if(!(e instanceof oracle.ReachedMismatch))throw e;rejected=true;}
    rows.push({id,reference,rejected});
  };
  let browser,browserOwned,cleanup;
  try {
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1120}});
    browserOwned=ownedBrowser();
    const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="blue"/></svg>');
    await page.setContent(`<style>.lot-row{display:flex;gap:16px;margin:20px}.lot-row img{width:72px;height:72px}.title{display:block;font-size:18px;max-width:600px}</style>`+
      ['01','02'].map((n,i)=>`<div class="lot-row" data-id="${n}"><img src="${image}"><span><span class="lot-number">${n}</span><span class="title">${i?'Second controlled title':'First controlled title'}</span></span></div>`).join(''));
    await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
    const expected={'01':'First controlled title','02':'Second controlled title'},good=await observeComposition(page,expected);
    await page.locator('.title').first().evaluate(e=>e.style.fontSize='11px');const small=await observeComposition(page,expected);
    check('NATIVE_CATALOG_SMALL_TITLE',[good,good],[small,good],oracle.composition);
    await page.locator('.title').first().evaluate(e=>{e.style.fontSize='18px';e.style.width='30px';e.style.whiteSpace='nowrap';e.style.overflow='hidden';});
    const clipped=await observeComposition(page,expected);check('NATIVE_CATALOG_CLIPPED_TITLE',[good,good],[clipped,good],oracle.composition);
    await page.setContent('<label>Opening<input id="amount" value="12.345" aria-invalid="true" aria-describedby="error"></label><p role="alert" id="error">Enter at most two decimal places.</p>');
    await page.locator('#amount').focus();const linked={...await observeInvalid(page,'#amount'),puts:0,cleared:true};
    await page.locator('#amount').evaluate(e=>e.removeAttribute('aria-describedby'));const unlinked={...await observeInvalid(page,'#amount'),puts:0,cleared:true};
    check('NATIVE_INVALID_AMOUNT_UNLINKED',[linked,linked],[unlinked,linked],oracle.invalid);
    const step=(key,state,text,button='')=>`<div data-setup-step="${key}" data-state="${state}">${text}${button}</div>`;
    const markup='<section aria-label="Event setup" data-studio-checklist data-basis="saved">Saved setup. Unsaved working edits. '+
      step('welcome','complete','Welcome saved')+step('items','complete','Items saved')+
      step('approval','needs-attention','Catalog approval is independent from saved draft')+
      step('access','unavailable','Entry control is unavailable until ADMISSION')+'</section>';
    await page.setContent(markup);const complete=await observeChecklist(page);
    const state=(welcome,items,approval)=>({...structuredClone(complete),steps:complete.steps.map(s=>({...s,state:s.key==='welcome'?welcome:s.key==='items'?items:s.key==='approval'?approval:s.state}))});
    const failed=state('complete','complete','unavailable');failed.steps.find(s=>s.key==='approval').text='Independent approval could not be confirmed';
    const truth=[state('needs-attention','needs-attention','needs-attention'),complete,complete,{...state('complete','needs-attention','needs-attention'),actionReached:true},state('complete','complete','pending'),failed,state('complete','complete','complete')];
    await page.locator('[data-setup-step="access"]').evaluate(e=>{e.dataset.state='complete';e.textContent='Entry is ready';});
    const access=await observeChecklist(page),untruth=structuredClone(truth);untruth[1]=access;
    check('NATIVE_CHECKLIST_INVENTED_ENTRY',truth,untruth,oracle.checklist);
    const invented=structuredClone(truth);invented[5].steps.find(s=>s.key==='approval').state='complete';
    check('CHECKLIST_FAILED_READ_COMPLETE',truth,invented,oracle.checklist);
    const inert=structuredClone(truth);inert[3].actionReached=false;
    check('CHECKLIST_INERT_CORRECTION_ACTION',truth,inert,oracle.checklist);
    await page.setContent(markup);await page.locator('[data-studio-checklist]').evaluate(e=>e.removeAttribute('aria-label'));
    const unnamed=structuredClone(truth);unnamed[1]=await observeChecklist(page);
    check('NATIVE_CHECKLIST_UNNAMED_REGION',truth,unnamed,oracle.checklist);
  } finally {if(browserOwned)browserOwned=refreshOwned(browserOwned);if(browser)await browser.close();
    if(browserOwned)cleanup=await verifyGone(browserOwned);}
  const phone={width:296,height:636,nativeWidth:296,nativeHeight:636,unscaled:true,horizontalOverflow:false,
    routes:['/','/lots','/lot/lot-id'],lotId:'lot-id',scrolled:true,mode:'saved'};
  for(const [id,delta] of [['PHONE_SQUASHED',{height:300}],['PHONE_TRANSFORM',{unscaled:false}],['PHONE_FAKE_NATIVE_WIDTH',{nativeWidth:500}],['PHONE_INERT_ROUTE',{routes:['/','/lots','/lots']}],['PHONE_NO_CHILD_SCROLL',{scrolled:false}]]){
    check(id,[phone,phone,phone],[{...phone,...delta},phone,phone],oracle.phone);
  }
  const entered={event:{name:'Typed event',welcome:'Typed welcome'},lots:[
      {id:'first',title:'Typed first',description:'Typed description',opening:12345,image:'coffee'},
      {id:'second',title:'Known changed title',description:'Typed second description',opening:23456,image:'cabin'}]},
    request={requestId:'00000000-0000-4000-8000-000000000001',expectedRevision:2,draft:entered},
    sql={revision:3,...entered},lost={requests:[request,request],expected:entered,changedTitle:'Known changed title',locked:true,uncertain:'Save not confirmed',startRevision:2,
      sql,requestCount:1,retrySQL:sql,status:'Saved',preview:{revision:3}};
  const consumedAfterSave={event:entered.event,lots:entered.lots,labels:{}};
  Object.assign(lost,{id:'event',expectedPreview:consumedAfterSave,preview:{mode:'saved',eventId:'event',revision:3,consumed:consumedAfterSave}});
  for(const [id,delta] of [['RETRY_NEW_UUID',{requests:[request,{...request,requestId:'changed'}]}],['RETRY_CHANGED_PAYLOAD',{requests:[request,{...request,draft:{event:{name:'changed'},lots:[]}}]}],['RETRY_DUPLICATE_REQUEST',{requestCount:2}],['RETRY_NEW_REVISION',{retrySQL:{...sql,revision:4}}],['UNCERTAIN_EDITABLE',{locked:false}]]){
    check(id,lost,{...lost,...delta},oracle.lost);
  }
  const held={id:'event',request,expected:entered,changedTitle:'Known changed title',locked:true,status:'Saving…',before:{revision:2},during:{revision:2},posts:1,cancelledLeave:true,after:sql,
    expectedPreview:consumedAfterSave,preview:{mode:'saved',eventId:'event',revision:3,consumed:consumedAfterSave}};
  check('HELD_PREMATURE_SQL_WRITE',held,{...held,during:{revision:3}},oracle.held);
  // JSON copies deliberately break aliases between expected and observation.
  const independent=value=>JSON.parse(JSON.stringify(value));
  const lostWrong=independent(lost);lostWrong.sql.lots[1].title='Old title';check('LOST_CHANGED_TITLE_DROPPED',lost,lostWrong,oracle.lost);
  const heldWrong=independent(held);heldWrong.after.lots[1].title='Old title';check('HELD_CHANGED_TITLE_DROPPED',held,heldWrong,oracle.held);
  const heldStale=independent(held);heldStale.preview.consumed.lots[1].title='Stale old title';check('HELD_STALE_A_CORRECT_REVISION',held,heldStale,oracle.held);
  const lostStale=independent(lost);lostStale.preview.consumed.lots[1].title='Stale old title';check('LOST_STALE_A_CORRECT_REVISION',lost,lostStale,oracle.lost);
  const consumed={event:entered.event,lots:entered.lots,labels:{}},persist={id:'event',createdEmpty:true,initialRevision:2,
    saved:{revision:3,event:{...entered.event,id:'event'},lots:entered.lots},api:entered,expected:entered,sql,
    reloadTitle:'Typed event',reloadValue:'Known changed title',preview:{eventId:'event',revision:3,consumed},expectedPreview:consumed};
  for(const [id,mutate]of [
    ['SAVED_API_FIELD_DROPPED',v=>v.api.event.welcome=''],
    ['SAVED_SQL_AMOUNT_CHANGED',v=>v.sql.lots[0].opening=12300],
    ['SAVED_SQL_IMAGE_CHANGED',v=>v.sql.lots[0].image='wrong'],
    ['SAVED_SQL_ORDER_CHANGED',v=>v.sql.lots.reverse()],
    ['CONSUMED_A_DESCRIPTION_CHANGED',v=>v.preview.consumed.lots[0].description='wrong'],
    ['CONSUMED_A_REVISION_CHANGED',v=>v.preview.revision=99],
  ]){const broken=independent(persist);mutate(broken);check(id,persist,broken,oracle.persistence);}
  const boundary={blocked:true,blockedLocked:true,noWrite:true,foreignDenied:true,spoofIgnored:true,privateCleared:true};
  for(const key of Object.keys(boundary))check('BOUNDARY_'+key.toUpperCase(),boundary,{...boundary,[key]:false},oracle.isolation);
  must(rows.length>=20,'Control matrix is incomplete.');
  await record('STUDIO_EVIDENCE_CONTROLS',rows,o=>{if(!o.every(v=>v.reference&&v.rejected))throw new oracle.ReachedMismatch('Native/typed negative control was not rejected.');});
  return cleanup;
}
