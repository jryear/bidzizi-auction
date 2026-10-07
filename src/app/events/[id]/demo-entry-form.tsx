"use client";
import {useEffect,useRef,useState} from "react";

export type DemoSession={authenticated:boolean;testMode:boolean;person?:{id:string;name:string}};
export const entryStorageKey=(eventId:string)=>"bz:demo-entry-slot:v1:"+eventId;
export function pendingDemoEntry(eventId:string):string|null{
 try{const id=sessionStorage.getItem(entryStorageKey(eventId));return id&&/^[a-f0-9-]{36}$/.test(id)?id:null;}catch{return null;}
}
async function api(path:string,input?:unknown){
 const r=await fetch(path,{credentials:"same-origin",cache:"no-store",...(input===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)})});
 const data=await r.json();if(!r.ok)throw new Error(data.error?.message??"Your entry could not be confirmed.");return data;
}
export default function DemoEntryForm({eventId,initialSession,onReady}:{eventId:string;initialSession:DemoSession|null;onReady:(session:DemoSession)=>void}){
 const [name,setName]=useState(""),[businessName,setBusinessName]=useState(""),[memberId,setMemberId]=useState("");
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState("");
 const alive=useRef(true),running=useRef(false),ready=useRef(onReady),entry=useRef<string|null>(null);ready.current=onReady;
 const root="/api/demo/events/"+encodeURIComponent(eventId);
 async function finish(session:DemoSession,entryId:string){
  if(!session.authenticated||!session.person?.id)throw new Error("Your private session could not be confirmed. Check entry to retry.");
  const ack=await api(root+"/acknowledge",{entryId});
  if(ack.acknowledged!==true||ack.eventId!==eventId)throw new Error("Entry acknowledgement could not be confirmed.");
  // Verify actual session again; concurrent logout must not expose private content.
  const current=await api("/api/session");if(!current.authenticated||current.person?.id!==session.person.id)throw new Error("Your private session changed. Check entry to continue.");
  if(!alive.current)return;
  try{sessionStorage.removeItem(entryStorageKey(eventId));}catch{}
  ready.current(current);
 }
 async function enter(){
  if(running.current)return;running.current=true;setBusy(true);setError("");
  try{
   let entryId=entry.current??pendingDemoEntry(eventId);
   if(!entryId){entryId=crypto.randomUUID();try{sessionStorage.setItem(entryStorageKey(eventId),entryId);}catch{}}
   entry.current=entryId;
   const current=await api("/api/session");
   if(current.authenticated){await finish(current,entryId);return;}
   await api(root+"/begin",{entryId});
   const enrolled=await api(root+"/enroll",{entryId,name,businessName,memberId});
   const session=await api("/api/session");
   if(enrolled.eventId!==eventId||enrolled.authenticated!==true||!enrolled.person?.id||session.person?.id!==enrolled.person.id)throw new Error("Your enrollment response and private session could not be matched.");
   await finish(session,entryId);
  }catch(e){if(alive.current){setUncertain(true);setError((e instanceof Error?e.message:"Your entry could not be confirmed.")+" Check entry to recover the original request.");}}
  finally{running.current=false;if(alive.current)setBusy(false);}
 }
 useEffect(()=>{
  alive.current=true;entry.current=pendingDemoEntry(eventId);
  if(initialSession?.authenticated&&entry.current){void enter();}
  return()=>{alive.current=false;};
  // Entry is mounted per event/actor epoch. Recovery performs only idempotent ACK.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[eventId]);
 function startNew(){
  if(busy)return;entry.current=null;try{sessionStorage.removeItem(entryStorageKey(eventId));}catch{}
  setUncertain(false);setError("");setName("");setBusinessName("");setMemberId("");
 }
 return <main className="demo-entry">
  <div className="demo-brand">BidZizi<span>DEMO EVENT</span></div>
  <section className="demo-profile" aria-labelledby="demo-profile-title">
   <div className="demo-pass"><span className="demo-pass-mark" aria-hidden="true">B</span><div><strong>Your private bidding pass</strong><span>Synthetic demo · no SMS</span></div></div>
   <h1 id="demo-profile-title">Create your demo profile</h1>
   <p className="demo-lead">Tell us who’s bidding. Your business name will appear with your bids.</p>
   <form onSubmit={e=>{e.preventDefault();void enter();}}>
    <label htmlFor="demo-name">Your name</label><input id="demo-name" name="name" autoComplete="name" required maxLength={80} value={name} onChange={e=>setName(e.target.value)} disabled={busy||uncertain}/>
    <label htmlFor="demo-business">Business name</label><input id="demo-business" name="businessName" autoComplete="organization" required maxLength={120} value={businessName} onChange={e=>setBusinessName(e.target.value)} disabled={busy||uncertain}/>
    <label htmlFor="demo-member">Member ID</label><input id="demo-member" name="memberId" autoComplete="off" required maxLength={80} value={memberId} onChange={e=>setMemberId(e.target.value)} disabled={busy||uncertain}/>
    <p className="demo-note">Self-entered demo profile. Your Member ID is not verified. No payment is taken.</p>
    {error&&<p role="alert" className="demo-error">{error}</p>}
    {uncertain?<button type="button" onClick={()=>void enter()} disabled={busy}>{busy?"Checking…":"Check entry"}</button>:<button type="submit" disabled={busy}>{busy?"Entering…":"Enter demo event"}</button>}
    {uncertain&&<button type="button" className="demo-reset" onClick={startNew} disabled={busy}>Start a new demo profile</button>}
   </form>
   <p className="demo-return">Keep this browser session to return to your bids. A new profile starts with no bids.</p>
  </section>
  <style jsx>{`
   @font-face{font-family:DemoInstrument;src:url(/staging-bidder-preview/assets/fonts/instrument-sans-vf.woff2) format('woff2');font-weight:400 700;font-display:swap}
   @font-face{font-family:DemoFraunces;src:url(/staging-bidder-preview/assets/fonts/fraunces-vf.woff2) format('woff2');font-weight:100 900;font-display:swap}
   .demo-entry{max-width:480px;margin:0 auto;padding:26px 22px 40px;font-family:DemoInstrument,Arial,sans-serif;color:#1a1814}
   .demo-brand{font-family:DemoFraunces,Georgia,serif;font-size:30px;font-weight:650;display:flex;justify-content:space-between;align-items:center;margin-bottom:30px}
   .demo-brand span{font-family:DemoInstrument,Arial,sans-serif;font-size:10px;letter-spacing:.12em;color:#5a5448}
   .demo-pass{display:flex;gap:12px;align-items:center;background:#1a1814;color:#f5f0e6;border-radius:18px;padding:16px 18px;margin-bottom:28px}
   .demo-pass-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:#f7b928;color:#1a1814;font-size:20px;font-weight:700;flex:none}
   .demo-pass strong,.demo-pass div span{display:block}.demo-pass strong{font-size:16px}.demo-pass div span{font-size:12px;opacity:.8;margin-top:3px}
   h1{font-family:DemoFraunces,Georgia,serif;font-size:32px;line-height:1.1;letter-spacing:-.025em;margin:0 0 14px;font-weight:650}
   .demo-lead{line-height:1.5;font-size:15px;color:#5a5448;margin-bottom:26px}
   label{display:block;font-size:13px;font-weight:650;margin:18px 0 8px}
   input{display:block;box-sizing:border-box;width:100%;min-height:50px;border:1px solid #d9d0be;border-radius:12px;background:#fffcf5;color:#1a1814;padding:12px 14px;font:inherit;font-size:16px}
   input:focus-visible,button:focus-visible{outline:3px solid #1a1814;outline-offset:3px}
   input:disabled{opacity:.7}.demo-note,.demo-return{font-size:12px;line-height:1.5;color:#5a5448;margin:18px 0}
   button{min-height:54px;display:block;width:100%;border:0;border-radius:14px;background:#2b36d7;color:white;font:inherit;font-size:16px;font-weight:650;padding:14px;cursor:pointer}
   button:disabled{opacity:.6;cursor:wait}.demo-error{font-size:13px;color:#962d24;line-height:1.5}.demo-reset{background:transparent;color:#1a1814;text-decoration:underline;font-size:13px;margin-top:8px}
   .demo-return{border-top:1px solid #d9d0be;padding-top:16px;margin-top:24px}
   @media(min-width:700px){.demo-entry{padding-top:40px;padding-bottom:60px}.demo-profile{padding:26px;background:#fffcf5;border:1px solid #d9d0be;border-radius:22px}}
  `}</style>
 </main>;
}
