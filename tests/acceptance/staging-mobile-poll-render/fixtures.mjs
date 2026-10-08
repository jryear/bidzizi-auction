// Independent browser-local DTOs. No provider, live session, event or bid is used.
export const ORIGIN='https://mobile-render.invalid';
export const EVENT='10000000-0000-4000-8000-000000000001';
export const LOT='10000000-0000-4000-8000-000000000002';
export const RELEASE='10000000-0000-4000-8000-000000000003';
export const PERSON='10000000-0000-4000-8000-000000000004';
export const BUSINESS='10000000-0000-4000-8000-000000000005';
export const OTHER='10000000-0000-4000-8000-000000000006';
export const REQUEST='10000000-0000-4000-8000-000000000007';
const organization={id:'10000000-0000-4000-8000-000000000008',name:'Local test organization',initials:'LT'};
export function fixture(){
 return {
  tick:0,catalogStatus:200,contextStatus:200,standingStatus:200,receiptStatus:404,bidAbort:true,
  context:{testMode:true,person:{id:PERSON,name:'Local test person'},businesses:[{id:BUSINESS,name:'Local test business',canBid:true}]},
  packet:{event:{id:EVENT,name:'Independent render fixture',eyebrow:'Synthetic',welcome:'Browser-local evidence only.',venue:'Local fixture',cover:'assets/lots/dinner.jpg',sponsorsEnabled:false,sponsors:[]},organization,schedule:{opensAt:'2026-10-01T00:00:00.000Z',closesAt:'2026-11-01T00:00:00.000Z'},serverNow:'2026-10-07T12:00:00.000Z',phase:'open',biddingEnabled:false,catalog:{approvalId:RELEASE,sourceRevision:1,lots:[{id:LOT,number:'01',title:'Independent dinner lot',short:'Dinner browser fixture',description:'No real auction is accessed.',category:'Experiences',image:'assets/lots/dinner.jpg',alt:'Local dinner fixture',opening:10000,includes:['Fixture inclusion'],fine:'Synthetic only',windowId:'main',provider:organization}]}},
  standing:{releaseId:RELEASE,lotId:LOT,rulesetId:'staging-usd-manual-v1',currency:'USD',incrementMinor:2500,amountCapMinor:1000000000,phase:'open',canBid:true,serverNow:'2026-10-07T12:00:00.000Z',updatedAt:'2026-10-07T11:00:00.000Z',version:0,acceptedBidCount:0,currentAmountMinor:null,minimumAmountMinor:10000,leadingBusiness:null},
 };
}
export function stamp(f){return new Date(Date.parse('2026-10-07T12:00:00.000Z')+(++f.tick)*1000).toISOString();}
export function receipt(f,intent){return {requestId:intent.requestId,eventId:EVENT,releaseId:RELEASE,lotId:LOT,actorId:f.context.person.id,businessId:intent.businessId,amountMinor:intent.amountMinor,rulesetId:intent.rulesetId,currency:'USD',status:'accepted',reason:null,bidId:REQUEST,decidedAt:'2026-10-07T12:00:00.000Z'};}
