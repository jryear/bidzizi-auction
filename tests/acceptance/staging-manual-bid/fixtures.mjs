import assert from 'node:assert/strict';
import {RULESET,OPENING,INCREMENT,AMOUNT_CAP} from './protocol.mjs';
export const ids={
  saturn:'10000000-0000-4000-8000-000000000001',pine:'10000000-0000-4000-8000-000000000002',
  staff:'20000000-0000-4000-8000-000000000001',
  personJuniper:'20000000-0000-4000-8000-000000000003',personHarbor:'20000000-0000-4000-8000-000000000004',
  personCoworker:'20000000-0000-4000-8000-000000000005',personMember:'20000000-0000-4000-8000-000000000006',
  personViewer:'20000000-0000-4000-8000-000000000007',personUnlisted:'20000000-0000-4000-8000-000000000008',
  personPine:'20000000-0000-4000-8000-000000000009',
  personBidOnly:'20000000-0000-4000-8000-000000000010',
  businessJuniper:'30000000-0000-4000-8000-000000000001',businessHarbor:'30000000-0000-4000-8000-000000000002',
  businessPine:'30000000-0000-4000-8000-000000000003',businessAlternate:'30000000-0000-4000-8000-000000000004',
  event:'40000000-0000-4000-8000-000000000001',eventOther:'40000000-0000-4000-8000-000000000002',eventPine:'40000000-0000-4000-8000-000000000003',
  eventBefore:'40000000-0000-4000-8000-000000000004',eventClosed:'40000000-0000-4000-8000-000000000005',
  eventUnsupported:'40000000-0000-4000-8000-000000000006',
  release:'50000000-0000-4000-8000-000000000001',releaseOther:'50000000-0000-4000-8000-000000000002',releasePine:'50000000-0000-4000-8000-000000000003',
  releaseBefore:'50000000-0000-4000-8000-000000000004',releaseClosed:'50000000-0000-4000-8000-000000000005',
  releaseUnsupported:'50000000-0000-4000-8000-000000000006',
  lotA:'60000000-0000-4000-8000-000000000001',lotB:'60000000-0000-4000-8000-000000000002',
  lotC:'60000000-0000-4000-8000-000000000003',lotOther:'60000000-0000-4000-8000-000000000004',lotPine:'60000000-0000-4000-8000-000000000005',
  lotBefore:'60000000-0000-4000-8000-000000000006',lotClosed:'60000000-0000-4000-8000-000000000007',
  lotUnsupported:'60000000-0000-4000-8000-000000000008',
};
export const organization={id:ids.saturn,name:'Saturn Barter',initials:'SB'};
export function lot(id,title,number=1,provider=organization){
  return {id,title,short:'Synthetic selected lot',description:'Complete approved description for '+title,
    category:'Experiences',image:'assets/lots/coffee.jpg',alt:'Synthetic lot photograph',opening:OPENING,
    includes:['Synthetic included item'],fine:'Staging test only.',windowId:'main',number:String(number).padStart(2,'0'),provider};
}
export async function prepareFixture(f,scenario){
  f.fixtures={...ids};f.scenario=scenario;
  f.approvedLots=[lot(ids.lotA,'Selected coffee lot',1),lot(ids.lotB,'Selected cabin lot',3)];
  f.privateLot=lot(ids.lotC,'PRIVATE UNSELECTED draft',2);
  const now=await f.dbNow();
  const open=new Date(now.getTime()+(scenario.phase==='before'?(scenario.transitionOpen?3500:60_000):-60_000));
  const close=new Date(now.getTime()+(scenario.phase==='closed'?-1000:scenario.queuedClose?3500:120_000));
  const event={name:'Staging manual bid event',eyebrow:'Synthetic event',welcome:'Welcome to this staging test.',
    venue:'Synthetic venue',cover:'assets/lots/cabin.jpg',date:open.toISOString().slice(0,10),
    start:open.toISOString().slice(11,16),end:close.toISOString().slice(11,16),timezone:'UTC',
    increment:INCREMENT,sponsorsEnabled:false,sponsors:[]};
  f.approvedEvent=event;f.opensAt=open;f.closesAt=close;
  for(const [business,name] of [[ids.businessJuniper,'Juniper Studio'],[ids.businessHarbor,'Harbor Company'],[ids.businessPine,'Pine Company']])
    await f.db.query('INSERT INTO bz_businesses(id,name,active) VALUES($1,$2,true)',[business,name]);
  for(const [person,business] of [[ids.personJuniper,ids.businessJuniper],[ids.personCoworker,ids.businessJuniper],
    [ids.personHarbor,ids.businessHarbor],[ids.personMember,ids.businessJuniper],[ids.personViewer,ids.businessJuniper],
    [ids.personPine,ids.businessPine],[ids.personBidOnly,ids.businessJuniper]])
    await f.db.query('INSERT INTO bz_business_person_memberships(person_id,business_id,can_bid,active) VALUES($1,$2,true,true)',[person,business]);
  for(const [org,business] of [[ids.saturn,ids.businessJuniper],[ids.saturn,ids.businessHarbor],[ids.pine,ids.businessPine]])
    await f.db.query('INSERT INTO bz_org_business_memberships(org_id,business_id,active) VALUES($1,$2,true)',[org,business]);
  const extra=lot(ids.lotOther,'Other admitted event lot');
  const pineOrg={id:ids.pine,name:'Pine Street Exchange',initials:'PE'},pineLot=lot(ids.lotPine,'Private Pine lot',1,pineOrg);
  f.phaseFixtures={};
  for(const [eventId,release,org,selected,phase] of [[ids.event,ids.release,organization,f.approvedLots,scenario.phase],
    [ids.eventOther,ids.releaseOther,organization,[extra],scenario.phase],[ids.eventPine,ids.releasePine,pineOrg,[pineLot],scenario.phase],
    [ids.eventBefore,ids.releaseBefore,organization,[lot(ids.lotBefore,'Future selected lot')],'before'],
    [ids.eventClosed,ids.releaseClosed,organization,[lot(ids.lotClosed,'Closed selected lot')],'closed'],
    [ids.eventUnsupported,ids.releaseUnsupported,organization,[lot(ids.lotUnsupported,'Unsupported increment lot')],'open']]){
    const selectedOpen=eventId===ids.event||eventId===ids.eventOther||eventId===ids.eventPine?open:new Date(now.getTime()+(phase==='before'?60_000:-60_000));
    const selectedClose=eventId===ids.eventOther&&scenario.queuedClose?new Date(now.getTime()+120_000):
      eventId===ids.event||eventId===ids.eventOther||eventId===ids.eventPine?close:new Date(now.getTime()+(phase==='closed'?-1000:120_000));
    const eventFields={...event,name:eventId===ids.event?event.name:eventId===ids.eventOther?'Other Saturn event':eventId===ids.eventPine?'Pine private event':phase==='before'?'Future Saturn event':'Closed Saturn event'};
    if(eventId===ids.eventUnsupported){eventFields.name='Unsupported test increment event';eventFields.increment=5000;}
    await f.db.query('INSERT INTO bz_events(id,org_id,revision,draft,created_by) VALUES($1,$2,2,$3,$4)',[eventId,org.id,eventFields,ids.staff]);
    await f.db.query(`INSERT INTO bz_catalog_approvals(id,event_id,org_id,source_revision,approved_by,approved_at,
      local_date,local_start,local_end,timezone,opens_at,closes_at,organization_snapshot,event_snapshot)
      VALUES($1,$2,$3,1,$4,clock_timestamp(),$5,$6,$7,'UTC',$8,$9,$10,$11)`,
      [release,eventId,org.id,ids.staff,eventFields.date,eventFields.start,eventFields.end,selectedOpen,selectedClose,org,eventFields]);
    for(const [position,item] of selected.entries()){
      await f.db.query(`INSERT INTO bz_catalog_lots(approval_id,event_id,org_id,lot_id,position,snapshot) VALUES($1,$2,$3,$4,$5,$6)`,
        [release,eventId,org.id,item.id,position,item]);
      await f.db.query(`INSERT INTO bz_lot_standing(release_id,lot_id,event_id,org_id,ruleset_id,currency,increment_minor,amount_cap_minor,
        current_amount_minor,leading_business_id,accepted_bid_id,accepted_bid_count,version,updated_at)
        VALUES($1,$2,$3,$4,$5,'USD',$6,$7,NULL,NULL,NULL,0,0,clock_timestamp())`,[release,item.id,eventId,org.id,RULESET,INCREMENT,AMOUNT_CAP]);
    }
    if(eventId===ids.eventBefore||eventId===ids.eventClosed)f.phaseFixtures[phase]={event:eventId,release,lotA:selected[0].id,approvedEvent:eventFields,approvedLots:selected};
  }
  // Deliberately divergent WORKING draft; the first operational minimum stays10000.
  for(const [position,item] of [f.approvedLots[0],f.privateLot,f.approvedLots[1]].entries()){
    const {number,provider,...compact}=item;compact.opening=111;
    await f.db.query('INSERT INTO bz_lots(id,event_id,org_id,position,data) VALUES($1,$2,$3,$4,$5)',[item.id,ids.event,ids.saturn,position,compact]);
  }
  for(const person of [ids.personJuniper,ids.personCoworker,ids.personHarbor,ids.personViewer]){
    await f.db.query(`INSERT INTO bz_event_bidder_admissions(person_id,event_id,access,active) VALUES($1,$2,$3,true)`,
      [person,ids.event,person===ids.personViewer?'VIEW':'BID']);
    await f.grantViewer(person,ids.event);
  }
  await f.db.query(`INSERT INTO bz_event_bidder_admissions(person_id,event_id,access,active) VALUES($1,$2,'BID',true),($3,$4,'BID',true)`,
    [ids.personJuniper,ids.eventOther,ids.personPine,ids.eventPine]);
  await f.grantViewer(ids.personJuniper,ids.eventOther);await f.grantViewer(ids.personPine,ids.eventPine);
  await f.db.query("INSERT INTO bz_event_bidder_admissions(person_id,event_id,access,active) VALUES($1,$2,'BID',true)",[ids.personHarbor,ids.eventOther]);
  await f.grantViewer(ids.personHarbor,ids.eventOther);
  // BID-only deliberately lacks catalog002 VIEW; either grant alone is insufficient.
  await f.db.query("INSERT INTO bz_event_bidder_admissions(person_id,event_id,access,active) VALUES($1,$2,'BID',true)",[ids.personBidOnly,ids.event]);
  for(const person of [ids.personJuniper,ids.personHarbor])for(const eventId of [ids.eventBefore,ids.eventClosed,ids.eventUnsupported]){
    await f.db.query("INSERT INTO bz_event_bidder_admissions(person_id,event_id,access,active) VALUES($1,$2,'BID',true)",[person,eventId]);
    await f.grantViewer(person,eventId);
  }
  assert.deepEqual((await f.db.query('SELECT snapshot FROM bz_catalog_lots WHERE approval_id=$1 ORDER BY position',[ids.release])).rows.map(r=>r.snapshot),f.approvedLots);
}
