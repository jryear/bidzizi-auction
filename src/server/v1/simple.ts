import "server-only";
import { randomUUID } from "node:crypto";
import { snapshot, join, rejoin, placeBid, bidReceipt, pledge, eventByCode } from "./engine";
import { requireParticipant } from "./auth";
import { tx } from "./db";
import { ApiError, handle, sameOrigin } from "./http";
import { formatMoney } from "../../lib/money";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const uuid = (v: string | null) => v && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : randomUUID();
const hidden = (k: string, v: unknown) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`;
const dollars = (v: unknown) => {
  if (typeof v !== "string" || !/^\d+(\.\d{1,2})?$/.test(v.trim())) throw new ApiError(400, "INVALID", "Use an amount like 100 or 100.50.");
  const [d,c=""] = v.trim().split("."); const n=Number(d)*100+Number(c.padEnd(2,"0"));
  if (!Number.isSafeInteger(n) || n <= 0) throw new ApiError(400,"INVALID","Use a positive amount."); return n;
};
const moneyInput = (n: number) => (n / 100).toFixed(2);
const note: Record<string,string> = { INVALID:"Check the fields and try again.", CODE_INVALID:"That rejoin code did not work. Ask staff for a new code.", ENTRY_CLOSED:"Joining is closed for this event.", ACCESS_ENDED:"Your access to this event has ended.", NOT_JOINED:"Join this event to continue.", DONATIONS_CLOSED:"Donations are closed.", CONFLICT:"This request changed. Check your recorded activity before trying again.", UNAVAILABLE:"We could not confirm that request. Check its status before starting another." };
function html(title: string, body: string, status=200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>${esc(title)} · BidZizi</title><link rel="stylesheet" href="/simple.css"></head><body><main><header><a class="brand" href="/join">bid<span>zizi</span></a><small>Simple mode</small></header>${body}</main></body></html>`, { status, headers: { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"private, no-store", "Content-Security-Policy":"default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"same-origin" } });
}
function redirect(url: string, response?: Response) {
  const headers = new Headers({ Location:url, "Cache-Control":"private, no-store" });
  for (const c of response?.headers.getSetCookie() ?? []) headers.append("Set-Cookie",c);
  return new Response(null,{status:303,headers});
}

export async function simpleGet(request: Request, code: string): Promise<Response> {
  const base=`/e/${encodeURIComponent(code)}/simple`, q=new URL(request.url).searchParams;
  const response=await handle(()=>snapshot(request,code));
  if (!response.ok) return html("Event unavailable",'<h1>This event is unavailable.</h1><p>Check the room code or ask the host for the event link.</p><a href="/join">Enter another code</a>',response.status);
  const s=await response.json(), e=s.event, me=s.me;
  let body=`<h1>${esc(e.name)}</h1><p>${esc(e.welcome)}</p><p>${e.venue ? esc(e.venue)+" · " : ""}Bidding ends ${esc(new Date(e.endsAt).toLocaleString("en-US",{timeZone:e.timezone}))}</p><nav><a href="${base}">Items</a>${me?`<a href="${base}?view=mine">My bids</a>`:""}${e.donations.enabled?`<a href="${base}?view=donate">Donate</a>`:""}<a href="/e/${encodeURIComponent(code)}">Full experience</a></nav><p class="hint">Refresh to see current bids. Server time decides when bidding closes.</p>`;
  if(q.get("error"))body+=`<p class="notice" role="alert">${esc(note[q.get("error")!]??"That request could not be completed. Try again.")}</p>`;
  if (!me) {
    if(s.preview)return html(e.name,body+'<p class="notice">Staff preview. Guests can join after the event is published.</p>');
    body+=`<section><h2>Join the event</h2><form method="post" action="${base}">${hidden("action","join")}${hidden("requestId",uuid(q.get("joinRequest")))}<label>Your name<input name="displayName" maxlength="60" required autocomplete="name"></label><label>Business name<input name="businessName" maxlength="120" required autocomplete="organization"></label><button>Join</button></form></section><details><summary>Joined on another phone?</summary><form method="post" action="${base}">${hidden("action","rejoin")}<label>Rejoin code<input name="code" maxlength="20" required autocomplete="off"></label><button>Continue</button></form><p>Ask the host for a one-time rejoin code.</p></details>`;
    return html(e.name,body);
  }
  body+=`<p class="identity">${esc(me.displayName)} · ${esc(me.businessName)}</p>`;
  let uncertainBid=false, uncertainPledge=false;
  const receiptId=q.get("receipt");
  if(receiptId){
    const r=await handle(()=>bidReceipt(request,code,receiptId));const d=await r.json();
    if(d.receipt){const b=d.receipt;body+=`<section class="notice" role="status"><h2>${b.accepted?"Bid recorded":"Bid not placed"}</h2><p>${formatMoney(b.amountMinor)}${b.accepted?" was recorded. This receipt does not mean you are still leading.":". Check the current item and minimum before bidding again."}</p></section>`;}
    else{uncertainBid=true;body+='<section class="notice" role="status"><h2>Bid not confirmed</h2><p>We have not found a recorded receipt. Checking or retrying this same request will not place a second bid.</p>';
      const item=s.items.find((i:any)=>i.id===q.get("item")),amount=q.get("amount");
      body+=`<a href="${base}?${esc(q.toString())}">Check status</a>`;
      if(r.ok&&item&&amount&&/^\d+$/.test(amount))body+=`<form method="post" action="${base}">${hidden("action","bid")}${hidden("requestId",receiptId)}${hidden("itemId",item.id)}${hidden("amount",moneyInput(Number(amount)))}<button>Retry same bid</button></form>`;
      body+='</section>';
    }
  }
  const pledgeRequest=q.get("pledgeRequest");
  if(pledgeRequest){
    const found=await tx(async db=>{const ev=await eventByCode(db,code),p=await requireParticipant(db,request,ev.id);return(await db.query<{amount_minor:string;recipient_name:string}>("SELECT amount_minor, recipient_name FROM pledges WHERE participant_id=$1 AND request_id=$2",[p.id,uuid(pledgeRequest)])).rows[0];}).catch(()=>null);
    uncertainPledge=!found;
    body+=found?`<section class="notice"><h2>Donation recorded</h2><p>${formatMoney(Number(found.amount_minor))} for ${esc(found.recipient_name)}. This records your pledge; it does not charge a payment.</p></section>`:`<section class="notice"><h2>Donation not confirmed</h2><p>Check status before starting another donation.</p><a href="${base}?${esc(q.toString())}">Check status</a>${q.get("recipient")&&q.get("amount")&&/^\d+$/.test(q.get("amount")!)?`<form method="post" action="${base}">${hidden("action","pledge")}${hidden("requestId",pledgeRequest)}${hidden("recipientId",q.get("recipient"))}${hidden("amount",moneyInput(Number(q.get("amount"))))}<button>Retry same donation</button></form>`:""}</section>`;
  }
  if(q.get("view")==="donate"){
    body+='<h2>Donate</h2>';
    if(!e.donations.open)body+='<p>Donations are closed.</p>';
    else if(!uncertainPledge) body+=`<form method="post" action="${base}">${hidden("action","pledge")}${hidden("requestId",randomUUID())}<label>Nonprofit<select name="recipientId">${e.donations.recipients.map((r:any)=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("")}</select></label><label>Amount ($)<input name="amount" inputmode="decimal" value="25.00" required></label><button>Record donation</button><p>A pledge only; no payment is charged here.</p></form>`;
    body+='<h3>Your donations</h3>'+me.pledges.map((p:any)=>`<p>${esc(p.recipientName)} · ${formatMoney(p.amountMinor)}</p>`).join("");
  }else{
    const item=q.get("item"),list=s.items.filter((i:any)=>(!item||i.id===item)&&(q.get("view")!=="mine"||i.myBidCount>0));
    body+=`<h2>${q.get("view")==="mine"?"My bids":"Items"}</h2>`;
    if(!list.length)body+='<p>No items to show.</p>';
    body+=list.map((i:any)=>`<article>${i.imageUrl?`<img src="${esc(i.imageUrl)}" alt="" style="object-position:${Number(i.imageFocal?.x??.5)*100}% ${Number(i.imageFocal?.y??.5)*100}%">`:""}<small>Item ${i.position+1}${i.category?" · "+esc(i.category):""}</small><h3><a href="${base}?item=${esc(i.id)}">${esc(i.title)}</a></h3>${item?`<p>${esc(i.description)}</p>`:""}<p>${i.currentMinor===null?"Starting amount":"Current bid"} <strong>${formatMoney(i.currentMinor??i.openingMinor)}</strong></p><p>${i.withdrawn?"Withdrawn":i.leader?.isMe?"You are leading":i.myBidCount?"You were outbid":i.phase==="open"?"Bidding open":i.phase==="scheduled"?"Bidding has not opened":"Bidding closed"}</p><p>Closes ${esc(new Date(i.closesAt).toLocaleString("en-US",{timeZone:e.timezone}))}</p>${i.award?.isMe?`<p class="notice">You won. ${esc(me.winnerInstructions)}</p>`:""}${!uncertainBid&&i.phase==="open"&&!i.withdrawn&&me.canBid&&!i.leader?.isMe&&i.minimumNextMinor!==null?`<form method="post" action="${base}">${hidden("action","bid")}${hidden("requestId",randomUUID())}${hidden("itemId",i.id)}<label>Your bid ($)<input name="amount" inputmode="decimal" value="${moneyInput(i.minimumNextMinor)}" required></label><button>Bid ${formatMoney(i.minimumNextMinor)}</button></form>`:""}</article>`).join("");
  }
  return html(e.name,body+'<footer><a href="'+base+'">Refresh items</a> · Ask the host if you need help.</footer>');
}

export async function simplePost(request: Request, code: string): Promise<Response> {
  const base=`/e/${encodeURIComponent(code)}/simple`;
  let input: URLSearchParams;
  try { sameOrigin(request); if(!/^application\/x-www-form-urlencoded/i.test(request.headers.get("content-type")??""))throw new ApiError(400,"INVALID","Use the form.");
    const reader=request.body?.getReader();if(!reader)throw new Error();const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192)throw new ApiError(413,"INVALID","Form too large.");chunks.push(value);}}finally{void reader.cancel().catch(()=>{});}
    input=new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  }catch(error){return html("Request refused",'<h1>Request refused</h1><p>Return to the event and use its form.</p>',error instanceof ApiError?error.status:400);}
  const action=input.get("action"),requestId=input.get("requestId"),itemId=input.get("itemId"),recipientId=input.get("recipientId");
  let body:Record<string,unknown>,method: (r:Request,c:string)=>Promise<Response>;
  try{
    if(action==="join"){body={requestId,displayName:input.get("displayName"),businessName:input.get("businessName")};method=join;}
    else if(action==="rejoin"){body={code:input.get("code")};method=rejoin;}
    else if(action==="bid"){body={requestId,itemId,amountMinor:dollars(input.get("amount"))};method=placeBid;}
    else if(action==="pledge"){body={requestId,recipientId,amountMinor:dollars(input.get("amount"))};method=pledge;}
    else throw new ApiError(400,"INVALID","Use the form.");
  }catch{return redirect(base+'?error=INVALID');}
  const headers=new Headers(request.headers);headers.set("Content-Type","application/json");headers.delete("content-length");
  const response=await handle(()=>method(new Request(request.url,{method:"POST",headers,body:JSON.stringify(body)}),code));
  const result=await response.json();const q=new URLSearchParams();
  if(action==="bid"&&(result.receipt||response.status>=500)){q.set("receipt",String(requestId));q.set("item",String(itemId));q.set("amount",String(body.amountMinor));}
  else if(action==="pledge"&&(result.pledge||response.status>=500)){q.set("view","donate");q.set("pledgeRequest",String(requestId));q.set("recipient",String(recipientId));q.set("amount",String(body.amountMinor));}
  else if(!response.ok){q.set("error",result.error?.code??"UNAVAILABLE");if(action==="join")q.set("joinRequest",uuid(requestId));}
  return redirect(base+(q.size?'?'+q.toString():''),response);
}
