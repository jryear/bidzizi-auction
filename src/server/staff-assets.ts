import "server-only";
import type { PoolClient } from "pg";
import { transaction } from "./db";
import { grant, sessionIsCurrent, sessionHash, staff } from "./auth";
import { testMode } from "./config";
import { ApiError, forbidden, json, unauthenticated, uuid, validation } from "./http";
import { normalizeAsset } from "./staff-asset-codec";

type AssetMeta = { ref: string; eventId: string; requestId: string; mime: string; width: number; height: number; byteLength: number; sha256: string; createdAt: string };
type SQLResult = { error?: string; asset?: AssetMeta; replayed?: boolean; valid?: boolean };
const unavailable = () => new ApiError(404,"ASSET_UNAVAILABLE","This image is unavailable.");
const permitted = (request: Request) => { if (!testMode(request) || !sessionHash(request)) throw unauthenticated(); };
function mapped(result: SQLResult, missingCode = "ASSET_UPLOAD_NOT_FOUND"): SQLResult {
  if (!result.error) return result;
  if (result.error === "INVALID") throw validation();
  if (result.error === "DENIED") throw forbidden();
  if (result.error === "MISSING") throw new ApiError(404,missingCode,"This upload could not be found.");
  if (result.error === "CONFLICT") throw new ApiError(409,"IDEMPOTENCY_CONFLICT","This request ID was used for a different image.");
  if (result.error === "QUOTA") throw new ApiError(409,"ASSET_QUOTA","This event has reached its image storage limit.");
  throw new ApiError(503,"UNAVAILABLE","The image could not be confirmed.");
}
async function preflight(client: PoolClient, request: Request, eventId: string) {
  const actor = await staff(client,request);
  const row = (await client.query<{ org_id: string }>("SELECT org_id FROM bz_events WHERE id=$1 FOR SHARE",[eventId])).rows[0];
  if (!row) throw forbidden();
  grant(actor,row.org_id);
}
export async function uploadStaffAsset(request: Request,eventId:string):Promise<Response> {
  permitted(request);
  const mode = testMode(request);
  if (!mode || request.headers.get("origin") !== mode.origin) throw forbidden();
  const event = uuid(eventId),requestId=uuid(request.headers.get("x-bidzizi-request-id"));
  await transaction(client=>preflight(client,request,event));
  const normalized=await normalizeAsset(request);
  const response=await transaction(async client=>{
    const row=await client.query<{value:SQLResult}>("SELECT public.bz_staff_asset_put($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value",
      [sessionHash(request),event,requestId,normalized.sourceMime,normalized.sourceSize,
        normalized.sourceSha256,normalized.bytes,normalized.width,normalized.height]);
    return mapped(row.rows[0].value);
  });
  return json({asset:response.asset},response.replayed?200:201);
}
export async function recoverStaffAsset(request:Request,eventId:string,requestId:string):Promise<Response>{
  permitted(request);
  const result=await transaction(async client=>{
    const row=await client.query<{value:SQLResult}>("SELECT public.bz_staff_asset_recover($1,$2,$3) AS value",
      [sessionHash(request),uuid(eventId),uuid(requestId)]);
    if(row.rows[0].value.error==="DENIED"){if(!await sessionIsCurrent(client,request))throw unauthenticated();throw unavailable();}
    return mapped(row.rows[0].value);
  });
  return json({asset:result.asset});
}
export async function recoverAssetMeta(client:PoolClient,request:Request,eventId:string,requestId:string):Promise<AssetMeta>{
  const row=await client.query<{value:SQLResult}>("SELECT public.bz_staff_asset_recover($1,$2,$3) AS value",
    [sessionHash(request),eventId,requestId]);
  if(row.rows[0].value.error==="DENIED"){if(!await sessionIsCurrent(client,request))throw unauthenticated();throw unavailable();}
  return mapped(row.rows[0].value,"ASSET_UNAVAILABLE").asset!;
}
export function referencedAssets(draft:{event:{cover?:string|null;sponsors?:{logo:string}[]};lots:{image?:string|null}[]}):string[]{
  const refs=[draft.event.cover,...(draft.event.sponsors??[]).map(s=>s.logo),...draft.lots.map(l=>l.image)];
  return [...new Set(refs.filter((v):v is string=>typeof v==="string"&&v.startsWith("asset:")).map(v=>uuid(v.slice(6))))];
}
export async function validateAssetRefs(client:PoolClient,request:Request,eventId:string,
  draft:{event:{cover?:string|null;sponsors?:{logo:string}[]};lots:{image?:string|null}[]}):Promise<void>{
  const refs=referencedAssets(draft);
  if(!refs.length)return;
  const row=await client.query<{value:SQLResult}>("SELECT public.bz_staff_asset_validate($1,$2,$3::uuid[]) AS value",
    [sessionHash(request),eventId,refs]);
  if(row.rows[0].value.error==="DENIED"){if(!await sessionIsCurrent(client,request))throw unauthenticated();throw forbidden();}
  if(row.rows[0].value.valid!==true)throw validation();
}
export async function readStaffAsset(request:Request,eventId:string,assetId:string,context:"saved"|"staff-approved"|"published"|"upload",binding:string|null):Promise<Response>{
  permitted(request);
  const event=uuid(eventId),asset=uuid(assetId),scope=binding===null?null:uuid(binding);
  let data:{mime:string;width:number;height:number;byte_length:number;sha256:string;bytes:Buffer};
  try{
    data=await transaction(async client=>{
      const rows=await client.query<typeof data>("SELECT * FROM public.bz_staff_asset_read($1,$2,$3,$4,$5)",
        [sessionHash(request),event,asset,context,scope]);
      if(rows.rows.length!==1)throw new Error("Image read did not return exactly one row.");
      return rows.rows[0];
    });
  }catch(error){
    const state=(error as {code?:string}).code;
    if(state==="PBA01")throw validation();
    if(state==="PBA02")throw unauthenticated();
    if(state==="PBA03")throw unavailable();
    throw error;
  }
  return new Response(new Uint8Array(data.bytes),{status:200,headers:{"Content-Type":"image/webp",
    "Content-Disposition":'inline; filename="image.webp"',"Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"}});
}
export async function ownStaffAssetContent(request:Request,eventId:string,requestId:string):Promise<Response>{
  permitted(request);
  const event=uuid(eventId),requestKey=uuid(requestId);
  const meta=await transaction(client=>recoverAssetMeta(client,request,event,requestKey));
  return readStaffAsset(request,event,meta.ref.slice(6),"upload",requestKey);
}
