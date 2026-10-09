'use client';
import {useEffect,useRef,useState} from 'react';
import {asset,currencyLabel,dateTime,InvalidPayload,money,parseResults,parseSession,ReadFailure,readJSON,type ResultLot,type StaffResults} from './read-model';
import styles from './display-results.module.css';
type View={packet:StaffResults|null;state:'loading'|'current'|'stale'|'offline'|'denied'|'error';busy:boolean;message:string};
const empty=():View=>({packet:null,state:'loading',busy:true,message:'Confirming staff access…'});
export default function AuthorizedReadView({eventId,mode}:{eventId:string;mode:'display'|'results'}){
 const [view,setView]=useState<View>(empty),[exportMessage,setExportMessage]=useState('');
 const refresh=useRef<()=>void>(()=>{}),generationRef=useRef(0),actorRef=useRef<string|null>(null);
 useEffect(()=>{
  let snapshot=empty(),disposed=false,active:Promise<void>|undefined,controller:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const publish=(next:View)=>{if(!disposed){snapshot=next;setView(next);}};
  const clear=(message:string,state:View['state']='denied')=>publish({packet:null,state,busy:false,message});
  const run=()=>{
   clearTimeout(timer);const ticket=++generationRef.current,previous=active;controller?.abort();controller=new AbortController();const signal=controller.signal,current=()=>!disposed&&ticket===generationRef.current&&!signal.aborted;
   publish({...snapshot,state:snapshot.packet?(navigator.onLine?'stale':'offline'):'loading',busy:true,message:snapshot.packet?'Refreshing · showing the last confirmed staff read.':'Confirming staff access…'});
   active=(async()=>{
    await previous?.catch(()=>{});if(!current())return;
    try{
     if(!navigator.onLine){publish({...snapshot,state:snapshot.packet?'offline':'error',busy:false,message:'Offline. Refresh when the connection returns.'});return;}
     const actor=parseSession(await readJSON('/api/session',signal));if(!current())return;
     if(!actor){actorRef.current=null;clear('Sign in through Event Studio with an authorized staff account.');return;}
     if(actorRef.current&&actorRef.current!==actor)publish(empty());actorRef.current=actor;
     const packet=parseResults(await readJSON(`/api/admin/events/${encodeURIComponent(eventId)}/results`,signal),eventId);
     const after=parseSession(await readJSON('/api/session',signal));if(!current())return;
     if(after!==actor){actorRef.current=after;clear('Account changed. Refresh to confirm staff access again.');return;}
     if(snapshot.packet&&Date.parse(packet.serverNow)<Date.parse(snapshot.packet.serverNow))throw new ReadFailure(503);
     if(snapshot.packet?.releaseId===packet.releaseId&&packet.lots.some(row=>{const prior=snapshot.packet?.lots.find(value=>value.lot.id===row.lot.id);return prior&&(row.standing.version<prior.standing.version||Date.parse(row.standing.updatedAt)<Date.parse(prior.standing.updatedAt));}))throw new ReadFailure(503);
     publish({packet,state:'current',busy:false,message:''});
    }catch(error){if(!current())return;if(error instanceof ReadFailure&&[400,401,403,404].includes(error.status))clear('This private staff view is unavailable to the current account.');else if(error instanceof InvalidPayload)clear('The staff response could not be verified. Refresh to check again.','error');else publish({...snapshot,state:snapshot.packet?(navigator.onLine?'stale':'offline'):'error',busy:false,message:'Refresh failed. Any retained amounts are from the dated, last confirmed read.'});}
    finally{if(current()&&document.visibilityState==='visible'&&navigator.onLine&&snapshot.state!=='denied')timer=setTimeout(run,snapshot.packet?.phase==='closed'?30000:5000);}
   })();
  };
  const suspend=()=>{++generationRef.current;clearTimeout(timer);controller?.abort();publish({...snapshot,state:snapshot.packet?'stale':'loading',busy:false,message:'View paused. Refresh to confirm current staff data.'});};
  const visibility=()=>document.visibilityState==='visible'?run():suspend();
  const offline=()=>{suspend();publish({...snapshot,state:snapshot.packet?'offline':'error',message:'Offline · last confirmed staff data.'});};
  refresh.current=run;document.addEventListener('visibilitychange',visibility);window.addEventListener('offline',offline);window.addEventListener('online',run);window.addEventListener('pageshow',run);window.addEventListener('pagehide',suspend);run();
  return()=>{disposed=true;++generationRef.current;clearTimeout(timer);controller?.abort();refresh.current=()=>{};actorRef.current=null;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('offline',offline);window.removeEventListener('online',run);window.removeEventListener('pageshow',run);window.removeEventListener('pagehide',suspend);};
 },[eventId]);
 const exportCSV=async()=>{
  const ticket=generationRef.current,actor=actorRef.current;setExportMessage('Preparing private CSV…');
  try{
   const signal=AbortSignal.timeout(12000),before=parseSession(await readJSON('/api/session',signal));if(!actor||before!==actor)throw new Error('Account changed.');
   const response=await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/results/export`,{credentials:'same-origin',cache:'no-store',signal});if(!response.ok||!response.headers.get('content-type')?.includes('text/csv'))throw new Error('CSV unavailable.');
   const blob=await response.blob(),after=parseSession(await readJSON('/api/session',signal));if(ticket!==generationRef.current||after!==actor)throw new Error('Access changed.');
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`event-${eventId}-recorded-standing.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setExportMessage('CSV downloaded. Recorded standing remains subject to manual staff processing.');
  }catch{setExportMessage('CSV download could not be confirmed. Refresh staff access and try again.');}
 };
 const packet=view.packet,old=view.state==='stale'||view.state==='offline',zone=packet?.schedule?.timezone||'UTC';
 return <main className={styles.board} data-state={view.state} data-mode={mode} data-event-id={eventId}>
  <header className={styles.topbar}><div className={styles.wordmark}>BidZizi <span>Private staff {mode==='display'?'display':'standing'}</span></div><nav aria-label="Staff views"><a href={`/admin?event=${eventId}`}>Event Studio</a><a href={`/events/${eventId}/${mode==='display'?'results':'display'}`}>{mode==='display'?'Recorded standing':'Private display'}</a></nav></header>
  <div className={styles.content}><section className={styles.hero}><div><p className={styles.kicker}>{packet?.organization.name||'Staff access required'}</p><h1>{packet?.event.name||(mode==='display'?'Private event display':'Recorded standing')}</h1><p className={styles.welcome}>{packet?.event.welcome||'Use Event Studio to sign in with current organization staff access.'}</p>{packet?.event.venue&&<p className={styles.venue}>{packet.event.venue}</p>}</div>{packet?.schedule&&<dl className={styles.schedule}><div><dt>Frozen opening</dt><dd>{dateTime(packet.schedule.opensAt,zone)}</dd></div><div><dt>Frozen closing</dt><dd>{dateTime(packet.schedule.closesAt,zone)}</dd></div><div><dt>Time zone</dt><dd>{zone}</dd></div></dl>}</section>
   <div className={styles.notice} data-stale={old} role="status" aria-live="polite"><div><strong>{view.busy?'Refreshing staff view…':old?'Stale · last confirmed data':packet?packet.phase==='closed'?'Closed · recorded standing':`${packet.phase} · confirmed staff read`:'Staff view unavailable'}</strong>{packet&&<p>As of {dateTime(packet.serverNow,zone)}</p>}{view.message&&<p>{view.message}</p>}</div><button onClick={()=>refresh.current()}>Refresh {mode==='display'?'display':'standing'}</button></div>
   {packet&&!packet.published&&<p className={styles.empty}>No catalog has been published. Save and publish selected items in Event Studio before using recorded standing.</p>}
   {packet?.published&&packet.lots.length===0&&<p className={styles.empty}>No published items.</p>}
   {packet?.published&&packet.lots.length>0&&(mode==='display'?<section className={styles.displayLots} aria-label="Published items">{packet.lots.map(row=><article className={styles.lot} key={row.lot.id} data-lot-id={row.lot.id}><span className={styles.number}>{row.lot.number}</span>{row.lot.image&&<img className={styles.lotImage} src={asset(row.lot.image,packet)} alt={row.lot.alt} width={120} height={92}/>}<div className={styles.lotText}><p className={styles.kicker}>{row.lot.category}</p><h2>{row.lot.title}</h2><p>{row.lot.short}</p></div><div className={styles.standing}><p className={styles.kicker}>{packet.phase==='closed'?'Closed recorded amount':'Accepted amount'}</p><Amount row={row} packet={packet} old={old}/><Details row={row} packet={packet}/></div></article>)}</section>:<section className={styles.results} aria-labelledby="standing-heading"><div className={styles.exportActions}><h2 id="standing-heading">Recorded lot standing</h2><button onClick={exportCSV} disabled={view.busy||old}>Download CSV</button></div><p role="status">{exportMessage}</p><table><thead><tr><th scope="col">Lot</th><th scope="col">Published item</th><th scope="col">Accepted amount</th><th scope="col">Standing and business</th></tr></thead><tbody>{packet.lots.map(row=><tr key={row.lot.id} data-lot-id={row.lot.id}><th scope="row" className={styles.tableNumber}>{row.lot.number}</th><td className={styles.tableLot}><strong>{row.lot.title}</strong><span>{row.lot.category}</span></td><td><Amount row={row} packet={packet} old={old}/></td><td><Details row={row} packet={packet}/></td></tr>)}</tbody></table></section>)}
   <footer className={styles.footer}><p>Private staff access · Published catalog is separate from draft preview.</p>{packet&&<p>{currencyLabel(packet.currency)} · Recorded amounts are for this published catalog.</p>}<p>Recorded standing is not an award or finalization. No payment or settlement occurs here.</p></footer>
  </div>
 </main>;
}
function Amount({row,packet,old}:{row:ResultLot;packet:StaffResults;old:boolean}){return row.standing.currentAmountMinor===null?<strong className={styles.noBid}>No accepted bids</strong>:<strong className={styles.amount} data-current-amount data-stale={old}>{money(row.standing.currentAmountMinor,packet.currency)}</strong>;}
function Details({row,packet}:{row:ResultLot;packet:StaffResults}){return <div className={styles.readTime}><strong>{packet.phase==='closed'?'Closed recorded standing':'Current recorded standing'}</strong>{row.standing.leadingBusiness&&<p>{row.standing.leadingBusiness.name}</p>}<p>{row.standing.acceptedBidCount} accepted {row.standing.acceptedBidCount===1?'bid':'bids'} · version {row.standing.version}</p><p>{row.standing.currentAmountMinor===null?'Standing origin':'Last accepted change'}: {dateTime(row.standing.updatedAt,packet.schedule?.timezone)}</p></div>;}
