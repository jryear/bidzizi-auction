import {controls as inherited} from '../staging-studio-composition/controls.mjs';
import {access,ReachedMismatch} from './oracles.mjs';
const clone=v=>structuredClone(v);
function matrix(){
  const id='30000000-0000-4000-8000-000000000001',actor='20000000-0000-4000-8000-000000000001',org='10000000-0000-4000-8000-000000000001',
    request='40000000-0000-4000-8000-000000000001',origin='http://127.0.0.1:1234',at='2030-01-01T00:00:00.000Z';
  const row=(state,text)=>({steps:[{key:'access',state,text,action:true}]}),buttons=(enable,disable,check,copy)=>Object.fromEntries(
    Object.entries({enable,disable,check,copy}).map(([key,enabled])=>[key,{count:1,enabled}]));
  const phase=(enabled,n,state,text,command)=>({
    api:{status:200,data:{entry:{eventId:id,enabled,entryRevision:n,updatedAt:n?at:null,shareUrl:origin+'/events/'+id},serverNow:at},
      cacheControl:'no-store',hasSetCookie:false,clock:{before:Date.parse(at),after:Date.parse(at)}},
    sql:{entry:n?[{event_id:id,org_id:org,enabled,entry_revision:n,updated_by:actor,updated_at:at}]:[],ledger:[]},
    dom:{panelCount:1,panelState:state,checklist:row(state==='enabled'?'complete':state==='disabled'?'needs-attention':'pending',text),
      buttons:command,link:{count:1,value:origin+'/events/'+id}}});
  const original=Array.from({length:7},()=>row('needs-attention','Entry disabled · revision 0')),
    initial=phase(false,0,'disabled','Entry disabled · revision 0',buttons(true,false,false,false)),
    saving=phase(false,0,'saving','Saving entry · revision 0',buttons(false,false,false,false)),
    uncertain=phase(true,1,'uncertain','Entry not confirmed · last confirmed revision 0',buttons(false,false,true,false)),
    enabled=phase(true,1,'enabled','Entry enabled · revision 1',buttons(false,true,false,true));
  const ledger={actor_id:actor,event_id:id,request_id:request,expected_revision:0,requested_enabled:true,applied_revision:1,applied_enabled:true};
  uncertain.sql.ledger=[ledger];enabled.sql.ledger=[clone(ledger)];
  const denied=clone(enabled);denied.api={status:403,data:{error:{code:'FORBIDDEN',message:'Staff entry control denied'}},cacheControl:'no-store',hasSetCookie:false};
  denied.dom.checklist=row('unavailable','Entry authority denied · last confirmed revision 1');denied.dom.buttons=buttons(false,false,true,false);
  const intent={expectedEntryRevision:0,enabled:true,requestId:request},good={id,actorId:actor,organizationId:org,origin,
    initial,saving,uncertain,enabled,denied,deniedMutationStatus:403,lostResponseStatus:200,requests:[intent,clone(intent)]};
  const rows=[],check=(id,mutate)=>{let reference=true,rejected=false;
    try{access(original,good);}catch(e){if(!(e instanceof ReachedMismatch))throw e;reference=false;}
    const broken={original:clone(original),entry:clone(good)};mutate(broken);
    try{access(broken.original,broken.entry);}catch(e){if(!(e instanceof ReachedMismatch))throw e;rejected=true;}
    rows.push({id,reference,rejected,source:'Typed successor oracle control; not application or baseline evidence'});
  };
  for(const [id,mutate] of [
    ['ENTRY_API_ABSENT',v=>{v.entry.initial.api.status=404;v.entry.initial.api.data=null;}],
    ['ENTRY_INITIAL_SQL_SEEDED',v=>v.entry.initial.sql.entry=[clone(good.enabled.sql.entry[0])]],
    ['ENTRY_INITIAL_REVISION_INVENTED',v=>v.original[1].steps[0].text='Entry disabled · revision 9'],
    ['ENTRY_OBSOLETE_UNAVAILABLE_COPY',v=>v.original[1].steps[0]={key:'access',state:'unavailable',text:'Entry control unavailable until ADMISSION',action:false}],
    ['ENTRY_PENDING_COMPLETE',v=>v.entry.saving.dom.checklist.steps[0].state='complete'],
    ['ENTRY_PENDING_SHARE_ENABLED',v=>v.entry.saving.dom.buttons.copy.enabled=true],
    ['ENTRY_UNCERTAIN_SHARE_ENABLED',v=>v.entry.uncertain.dom.buttons.copy.enabled=true],
    ['ENTRY_RETRY_NEW_UUID',v=>v.entry.requests[1].requestId='40000000-0000-4000-8000-000000000002'],
    ['ENTRY_RETRY_CHANGED_BODY',v=>v.entry.requests[1].enabled=false],
    ['ENTRY_CURRENT_SQL_REVISION_STALE',v=>v.entry.enabled.sql.entry[0].entry_revision=0],
    ['ENTRY_CURRENT_API_REVISION_STALE',v=>v.entry.enabled.api.data.entry.entryRevision=0],
    ['ENTRY_RECEIPT_DUPLICATED',v=>v.entry.enabled.sql.ledger.push(clone(ledger))],
    ['ENTRY_SHARED_DESTINATION_WRONG',v=>v.entry.enabled.dom.link.value=origin+'/events/other'],
    ['ENTRY_DENIED_COMPLETE',v=>v.entry.denied.dom.checklist.steps[0].state='complete'],
    ['ENTRY_DENIED_SHARE_ENABLED',v=>v.entry.denied.dom.buttons.copy.enabled=true],
    ['ENTRY_DENIED_DURABLE_MUTATION',v=>v.entry.denied.sql.entry[0].enabled=false],
  ])check(id,mutate);
  return rows;
}
export async function controls(f,record){
  const additional=matrix();
  return inherited(f,(id,rows,validate)=>record(id,[...rows,...additional],validate));
}
