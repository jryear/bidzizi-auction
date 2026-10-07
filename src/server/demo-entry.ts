import "server-only";
import {createHash,randomBytes} from "node:crypto";
import type {PoolClient} from "pg";
import {identity,sessionHash} from "./auth";
import {testMode} from "./config";
import {transaction} from "./db";
import {ApiError,body,forbidden,json,mutationMode,object,unauthenticated,uuid} from "./http";

const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const unavailable=()=>new ApiError(404,"ENTRY_UNAVAILABLE","Demo entry is unavailable for this event.");
const invalid=()=>new ApiError(400,"ENTRY_VALIDATION","Enter your name, business name and Member ID using the field limits.");
const cookieName=(entryId:string)=>"bz_demo_entry_"+entryId;
const cookiePath=(eventId:string)=>"/api/demo/events/"+eventId;
function privateToken(request:Request,entryId:string):string|null{
 const item=(request.headers.get("cookie")??"").split(";").map(s=>s.trim()).find(s=>s.startsWith(cookieName(entryId)+"="));
 const token=item?.slice(cookieName(entryId).length+1);return token&&/^[A-Za-z0-9_-]{43}$/.test(token)?token:null;
}
function bootstrapCookie(entryId:string,eventId:string,token:string,secure:boolean,expired=false){return `${cookieName(entryId)}=${token}; Path=${cookiePath(eventId)}; HttpOnly; SameSite=Strict; Max-Age=${expired?0:900}${secure?"; Secure":""}`;}
function packet(value:Record<string,unknown>){
 if(value.error==="MISSING")throw unavailable();
 if(value.error==="INVALID")throw invalid();
 if(value.error==="FORBIDDEN")throw new ApiError(403,"ENTRY_RETRY_UNAVAILABLE","This private entry cannot be reused. Keep your current session or create a new demo profile.");
 if(value.error==="CONFLICT")throw new ApiError(409,"ENTRY_CONFLICT","This entry was already started or submitted differently. Check your original entry.");
 return value;
}
async function noOtherSession(client:PoolClient,request:Request,expectedHash?:string){
 if(!sessionHash(request)||sessionHash(request)===expectedHash)return;
 try{await identity(client,request);}catch(e){if(e instanceof ApiError&&e.status===401)return;throw e;}
 throw new ApiError(409,"ENTRY_SESSION_ACTIVE","Sign out before creating another demo profile.");
}
function claim(value:unknown,max:number):string{
 if(typeof value!=="string"||/[\u0000-\u001f\u007f-\u009f]/.test(value))throw invalid();
 const trimmed=value.trim();if(!trimmed.length||trimmed.length>max)throw invalid();return trimmed;
}
export async function demoEntry(request:Request,eventId:string){
 if(!testMode(request))throw unavailable();const event=uuid(eventId);
 return json(await transaction(async client=>{
  const row=(await client.query("SELECT event_id FROM bz_demo_event_entries WHERE event_id=$1 AND enabled",[event])).rows[0];if(!row)throw unavailable();
  return {demoEntry: true,eventId:event};
 }));
}
export async function beginDemoEntry(request:Request,eventId:string){
 const mode=mutationMode(request),event=uuid(eventId),input=object(await body(request),["entryId"]),entryId=uuid(input.entryId);
 const previous=privateToken(request,entryId),token=previous??randomBytes(32).toString("base64url");
 const result=await transaction(async client=>{await noOtherSession(client,request);return packet((await client.query<{result:Record<string,unknown>}>("SELECT bz_demo_begin($1,$2,$3) AS result",[event,entryId,digest(token)])).rows[0].result);});
 return json(result,200,previous?{}:{"Set-Cookie":bootstrapCookie(entryId,event,token,mode.secure)});
}
export async function enrollDemoAttendee(request:Request,eventId:string){
 const mode=mutationMode(request),event=uuid(eventId),input=object(await body(request),["entryId","name","businessName","memberId"]),entryId=uuid(input.entryId);
 const name=claim(input.name,80),businessName=claim(input.businessName,120),memberId=claim(input.memberId,80),bootstrap=privateToken(request,entryId);
 if(!bootstrap)throw forbidden();
 const token=createHash("sha256").update("bz:demo-session:v1\0"+bootstrap).digest("base64url"),hash=digest(token);
 const result=await transaction(async client=>{
  await noOtherSession(client,request,hash);
  return packet((await client.query<{result:Record<string,unknown>}>("SELECT bz_demo_enroll($1,$2,$3,$4,$5,$6,$7,$8) AS result",[event,entryId,digest(bootstrap),name,businessName,memberId,digest(JSON.stringify([event,name,businessName,memberId])),hash])).rows[0].result);
 });
 // Issuance follows the committed transaction. Claims never become lookup credentials.
 return json(result,201,{"Set-Cookie":`bz_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${mode.secure?"; Secure":""}`});
}
export async function acknowledgeDemoEntry(request:Request,eventId:string){
 const mode=mutationMode(request),event=uuid(eventId),input=object(await body(request),["entryId"]),entryId=uuid(input.entryId),hash=sessionHash(request);if(!hash)throw unauthenticated();
 const result=await transaction(async client=>{await identity(client,request);return packet((await client.query<{result:Record<string,unknown>}>("SELECT bz_demo_acknowledge($1,$2,$3) AS result",[event,entryId,hash])).rows[0].result);});
 return json(result,200,{"Set-Cookie":bootstrapCookie(entryId,event,"",mode.secure,true)});
}
