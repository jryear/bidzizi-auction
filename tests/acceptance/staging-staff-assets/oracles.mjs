import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {HarnessError} from '../staging-catalog/harness.mjs';

export const hash=b=>createHash('sha256').update(b).digest('hex');
export const assetUUID=ref=>{assert.equal(typeof ref,'string');assert.match(ref,/^asset:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);return ref.slice(6);};
export function meta(value,event,request){
  assert.ok(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype,'Successful target DTO must be a plain object.');
  assert.ok(value.asset!==null&&typeof value.asset==='object'&&!Array.isArray(value.asset)&&Object.getPrototypeOf(value.asset)===Object.prototype,'Successful target asset must be a plain object.');
  assert.deepEqual(Object.keys(value).sort(),['asset']);const a=value.asset;
  assert.deepEqual(Object.keys(a).sort(),['ref','eventId','requestId','mime','width','height','byteLength','sha256','createdAt'].sort());
  assetUUID(a.ref);assert.equal(a.eventId,event);assert.equal(a.requestId,request);assert.equal(a.mime,'image/webp');
  for(const k of ['width','height'])assert.ok(Number.isInteger(a[k])&&a[k]>=1&&a[k]<=1600);
  assert.ok(Number.isInteger(a.byteLength)&&a.byteLength>=12&&a.byteLength<=1048576);
  assert.equal(typeof a.sha256,'string');assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.equal(typeof a.createdAt,'string');assert.ok(Number.isFinite(Date.parse(a.createdAt)));return a;
}
export function neutral(r,status,code){
  assert.equal(r.status,status);assert.match(r.headers.get('cache-control')||'',/no-store/i);
  assert.equal(r.data?.error?.code,code);assert.deepEqual(Object.keys(r.data).sort(),['error']);
  assert.deepEqual(Object.keys(r.data.error).sort(),['code','message']);assert.equal(typeof r.data.error.message,'string');
  assert.doesNotMatch(r.text||'',/postgres(?:ql)?:|password|token_hash|\.neon\.tech|DETAIL|HINT|SELECT |INSERT |PBA0[123]|stack/i);
  assert.ok(!r.bytes?.subarray(0,4).equals(Buffer.from('RIFF')),'Denied response cannot be image bytes.');
}
export function encoded(r,a){
  assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/webp');
  assert.match(r.headers.get('cache-control')||'',/private.*no-store|no-store.*private/i);
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('cross-origin-resource-policy'),'same-origin');
  assert.equal(r.headers.get('access-control-allow-origin'),null);assert.match(r.headers.get('content-disposition')||'',/^inline;\s*filename="?image\.webp"?$/);
  assert.equal(r.bytes.length,a.byteLength);assert.equal(hash(r.bytes),a.sha256);
}
// An external evidence decoder, never a product normalizer. It decodes the
// actual response, uses pixel landmarks and metadata, and does not reproduce
// the production encoding algorithm or declare the app dependency for it.
let decoder;
export function sharp(){
  if(!decoder){try{const req=createRequire(import.meta.url),nextReq=createRequire(req.resolve('next/package.json'));decoder=nextReq('sharp');}
    catch{throw new HarnessError('The already-linked independent raster decoder is unavailable.');}}
  return decoder;
}
export async function decoded(bytes,a,fixture){
  let info,pixels;try{info=await sharp()(bytes,{failOn:'warning'}).metadata();pixels=await sharp()(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});}
  catch(e){assert.fail('Downloaded WebP cannot fully decode: '+e.message);}
  assert.equal(info.format,'webp');assert.equal(info.width,a.width);assert.equal(info.height,a.height);assert.equal(info.pages||1,1);
  for(const key of ['exif','xmp','icc','iptc','orientation'])assert.equal(info[key],undefined,'Stored '+key+' must be stripped.');
  if(fixture.expectedWidth)assert.equal(info.width,fixture.expectedWidth);
  if(fixture.expectedHeight)assert.equal(info.height,fixture.expectedHeight);
  if(fixture.alpha){let transparent=false;for(let i=3;i<pixels.data.length;i+=4)if(pixels.data[i]===0){transparent=true;break;}assert.ok(transparent,'Transparency must survive.');}
  for(const {x,y,rgba} of fixture.landmarks||[]){const offset=(y*pixels.info.width+x)*4;
    assert.ok(x>=0&&x<pixels.info.width&&y>=0&&y<pixels.info.height,'Independent fixture landmark is in range.');
    for(let channel=0;channel<rgba.length;channel++)if(rgba[channel]!==null)assert.ok(Math.abs(pixels.data[offset+channel]-rgba[channel])<=(channel===3?0:30),'Independent fixture color/alpha landmark differs.');}
  return {format:info.format,width:info.width,height:info.height,pages:info.pages||1,alpha:!!info.hasAlpha,sha256:hash(bytes)};
}
export function persisted(rows,a,actor,raw,{eventId,orgId,sourceMime}){
  assert.equal(rows.length,1);const r=rows[0];assert.equal(r.id,assetUUID(a.ref));assert.equal(r.event_id,a.eventId);assert.equal(r.uploaded_by,actor);
  assert.equal(r.event_id,eventId);assert.equal(r.org_id,orgId);assert.equal(r.source_mime,sourceMime);
  assert.equal(r.created_at_matches_meta,true,'Exact SQL timestamp must equal AssetMeta.createdAt without JS millisecond truncation.');
  assert.equal(r.request_id,a.requestId);assert.equal(r.mime,a.mime);assert.equal(r.width,a.width);assert.equal(r.height,a.height);
  assert.equal(r.byte_length,a.byteLength);assert.equal(r.sha256,a.sha256);assert.ok(Buffer.isBuffer(r.bytes));assert.equal(hash(r.bytes),a.sha256);
  assert.equal(r.source_size,raw.length);assert.equal(r.source_sha256,hash(raw));assert.equal(r.normalization_version,'raster-webp-v1');
}
export function samePublished(before,after){assert.deepEqual(after,before,'Approved snapshots and durable receipts must remain byte-exact.');}
