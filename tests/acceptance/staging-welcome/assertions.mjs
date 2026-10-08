import assert from 'node:assert/strict';

export const welcomeKeys=['name','cover','eyebrow','welcome','venue','sponsorsEnabled','sponsors'];
export const prototypeSentinels=['Local visual study · synthetic content, not saved event data','Synthetic staging preview','Saturn Year-End Exchange','synthetic-year-end','synthetic-cabin','synthetic-coffee'];
export function welcomeFields(event){
  assert.ok(event&&typeof event.name==='string'&&typeof event.welcome==='string','Authoritative event fields required');
  assert.equal(typeof event.sponsorsEnabled,'boolean');assert.ok(Array.isArray(event.sponsors));
  return Object.fromEntries(welcomeKeys.map(k=>[k,structuredClone(event[k])]));
}
export function visibleSponsors(event){return event.sponsorsEnabled?event.sponsors.filter(s=>s.name.trim()):[];}
export function assertSavedPacket(observed,durable){
  assert.equal(observed.mode,'saved','Actual frame must be in Saved draft mode');
  assert.equal(observed.revision,durable.revision,'Fresh saved revision must match actual frame');
  for(const key of ['org','event','lots'])assert.deepEqual(observed[key],durable[key],'Exact durable saved '+key+' source');
}
export function assertSourceFields(observed,event,{allowStaticTitleSuffix=false}={}){
  const titleMatches=observed.title===event.name||(allowStaticTitleSuffix&&observed.title===event.name+' Auction');
  assert.ok(titleMatches,'Authoritative event name rendered');
  assert.equal(observed.eyebrow,event.eyebrow||'','Authoritative eyebrow rendered');
  assert.equal(observed.welcome,event.welcome||'','Authoritative welcome rendered');
  assert.equal(observed.coverAsset,event.cover||null,'Authoritative cover rendered');
  assert.deepEqual(observed.sponsorNames,visibleSponsors(event).map(s=>s.name),'Authoritative sponsor names/order rendered');
  assert.equal(observed.sponsorBlock,visibleSponsors(event).length>0,'Whole sponsor block follows saved enablement');
  const authorizedText=JSON.stringify(event);
  assert.equal(observed.prototypeLeaks.filter(s=>!authorizedText.includes(s)).length,0,'No isolated prototype content leaked outside authoritative fields');
}
export function assertComposition(observed,event){
  assert.ok(observed.hero&&observed.titleBox,'Required cover/title hero rendered');
  assertSourceFields(observed,event);
  assert.ok(observed.titleVisible&&observed.messageVisible,'Actual title and welcome are visibly rendered');
  if(event.cover)assert.ok(observed.coverLoaded&&observed.coverVisible,'Actual authoritative cover is visibly loaded');
  assert.equal(observed.fanCount,0,'Approved event hero replaces photo fan');
  const h=observed.hero,t=observed.titleBox,v=observed.viewport;
  assert.ok(Math.abs(h.left)<=1&&Math.abs(h.right-v.width)<=1&&Math.abs(observed.main.left)<=1&&Math.abs(observed.main.right-v.width)<=1,'Hero and welcome fill the actual child viewport');
  assert.ok(Math.abs(h.left-observed.main.left)<=1&&Math.abs(h.right-observed.main.right)<=1,'Hero fills welcome content width');
  assert.ok(t.left>=h.left-1&&t.right<=h.right+1&&t.top>=h.top-1&&t.bottom<=h.bottom+1,'Complete title fits expanding hero');
  assert.ok(!observed.titleClipped,'Long title is not clipped or ellipsized');
  assert.ok(!observed.overflow,'Welcome fits actual frame width');
  assert.ok(observed.browse&&observed.browse.href==='#/lots'&&observed.browse.width>=44&&observed.browse.height>=44,'Browse is a usable existing route');
  assert.ok(observed.browse.left>=-1&&observed.browse.right<=v.width+1,'Browse stays within actual frame');
  if(visibleSponsors(event).length&&v.width<=650){
    assert.ok(observed.sponsorBox&&observed.messageBox&&observed.factsBox,'Phone sponsor/welcome/secondary-fact regions required');
    assert.ok(observed.sponsorBox.top>=observed.messageBox.bottom-1,'Phone sponsors follow welcome');
    assert.ok(observed.sponsorBox.bottom<=observed.factsBox.top+1,'Phone sponsors precede secondary facts');
  }
}
export function assertReadOnlyActions(observed,{draft=false}={}){
  assert.equal(observed.enabledActions.filter(a=>['watch','account','max',...(draft?['bid']:[])].includes(a)).length,0,'Unauthorized operational actions stay disabled');
  assert.equal(observed.enabledDisabledRoutes.length,0,'Disabled watch/account routes cannot navigate');
}
export function assertDocumentBinding(binding,{origin,path,parentPath}={}){
  assert.equal(binding.origin,origin);assert.equal(binding.path,path);
  assert.ok(Number.isFinite(binding.timeOrigin)&&binding.timeOrigin>0,'Native document identity required');
  if(parentPath)assert.equal(binding.parentPath,parentPath);
}
