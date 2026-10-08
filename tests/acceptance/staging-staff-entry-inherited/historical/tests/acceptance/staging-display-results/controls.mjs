#!/usr/bin/env node
// Predicate controls do not exercise the app and never vote the slice or aggregate GREEN.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {clean,current,onlySelected,cleared,oracles} from './oracles.mjs';
import {groups} from './checks.mjs';
import {ids} from '../staging-manual-bid/fixtures.mjs';
const observation={board:{eventId:ids.event,state:'current'},lots:[{id:ids.lotA},{id:ids.lotB}],html:'<main>Published catalog · private view</main>',text:'Lot standing',persisted:{local:'{}',session:'{}'}};
const controls=[];
function mutation(name,positive,validate,alter){validate(positive);const broken=structuredClone(positive);alter(broken);assert.throws(()=>validate(broken),assert.AssertionError);controls.push(name);}
mutation('PRIVATE_IDENTITY_DOM',observation,clean,o=>o.html+='Juniper Studio');
mutation('PRIVATE_IDENTITY_OUTSIDE_MAIN',observation,clean,o=>o.html+='<header hidden>Harbor Company</header>');
mutation('PRIVATE_PERSISTENCE',observation,clean,o=>o.persisted.local='{"leadingBusiness":"Harbor Company"}');
mutation('FINAL_WINNER_CLAIM',observation,clean,o=>o.text+=' Winner');
mutation('PROVISIONAL_DISCLAIMER_ONLY',{...observation,text:'Standing is provisional; it does not confirm winners or settlement.'},clean,o=>o.text+=' Sold');
mutation('UNCAUGHT_BROWSER_ERROR',observation,clean,o=>o.pageErrors=['Unexpected render error']);
mutation('EVENT_BINDING',observation,current,o=>o.board.eventId=ids.eventOther);
mutation('IMMUTABLE_SELECTED_ORDER',observation,onlySelected,o=>o.lots.reverse());
mutation('PRIVATE_DRAFT_SENTINEL',observation,onlySelected,o=>o.text+=' PRIVATE DRAFT CHANGED');
const denied={...observation,board:{state:'denied'},lots:[]};
mutation('DENIAL_CLEARS_PRIVATE',denied,cleared,o=>o.text+=' Selected coffee lot');
// All15 application observation validators receive a positive typed observation
// and broken meaning mutations. These are predicate controls, never app evidence.
const clone=structuredClone;
const asOfA='2026-10-07T12:00:01.000Z',asOfB='2026-10-07T12:00:02.000Z',updated='2026-10-07T11:59:59.000Z';
const approved=()=>({board:{mode:'results',eventId:ids.event,state:'current',phase:'open'},html:'<main>Published catalog</main>',text:'Selected coffee lot. Selected cabin lot. Published catalog · private view. Draft preview is separate from this published catalog. Synthetic test standing · USD.',pageErrors:[],persisted:{local:'{}',session:'{}'},lots:[{id:ids.lotA,state:'current',text:'Selected coffee lot. 1 accepted bid · version 1',amount:'$1,234,567.89',asOf:asOfA,updatedAt:updated,asOfText:'12:00:01 UTC',updatedText:'11:59:59 UTC'},{id:ids.lotB,state:'current',text:'Selected cabin lot. No accepted bids. 0 accepted bids · version 0',amount:null,asOf:asOfB,updatedAt:updated,asOfText:'12:00:02 UTC',updatedText:'11:59:59 UTC'}]});
const deniedBoard=()=>({...approved(),board:{mode:'results',state:'denied'},text:'Sign in to continue.',html:'<main>Sign in</main>',lots:[]});
const viewer=()=>{const o=approved();for(const l of o.lots)Object.assign(l,{state:'denied',amount:null,asOf:null,updatedAt:null});return o;};
const future=phase=>({...approved(),board:{mode:'display',eventId:ids.eventBefore,state:'current',phase},html:'<main>Future Saturn event</main>',text:'Future Saturn event · UTC',lots:phase==='scheduled'?[]:[{id:ids.lotBefore}]});
const cases=[];
function meaning(id,positive,mutations){const validate=oracles[id];assert.equal(typeof validate,'function');validate(positive);for(const [name,alter] of mutations){mutation(id+'_'+name,positive,validate,alter);}cases.push(id);}
meaning('DR01_PRIVATE_READ_ONLY',{o:approved(),requests:[{path:'/api/session',method:'GET'},{path:'/api/catalog/events/'+ids.event,method:'GET'}],before:{bids:[]},after:{bids:[]}},[
 ['MUTATION_REQUEST',v=>v.requests[1].method='POST'],['DURABLE_WRITE',v=>v.after.bids.push({id:'unexpected'})],['IDENTITY_LEAK',v=>v.o.html+='<aside hidden>Juniper Studio</aside>']]);
meaning('DR02_SCHEDULED_WITHHOLD',{o:future('scheduled'),requests:[{path:'/api/catalog/events/'+ids.eventBefore,method:'GET'}]},[
 ['EARLY_LOT',v=>v.o.lots.push({id:ids.lotBefore})],['EARLY_STANDING',v=>v.requests.push({path:'/api/bidder/events/'+ids.eventBefore+'/lots/'+ids.lotBefore+'/standing'})],['BROWSER_GRANTED_PHASE',v=>v.o.board.phase='open']]);
const scenarios=[];for(const account of ['bidder-viewer','staff-saturn','staff-pine','bidder-bid-only','bidder-unlisted','bidder-pine',null])for(const mode of ['display','results']){const o=account==='bidder-viewer'?viewer():deniedBoard();o.board.mode=mode;scenarios.push({account,mode,o});}
meaning('DR03_VIEW_STAFF_SEPARATION',{scenarios},[
 ['VIEW_NUMERIC',v=>v.scenarios[0].o.lots[0].amount='$100.00'],['STAFF_IMPLIED_VIEW',v=>v.scenarios[2].o=approved()],['DISPLAY_AUTHORITY_OMITTED',v=>v.scenarios=v.scenarios.filter(s=>s.mode==='results')]]);
meaning('DR04_EMPTY_ERROR',{empty:{...approved(),lots:[],text:'No approved lots'},error:{...deniedBoard(),board:{state:'error'},text:'Unavailable. Try again.'}},[
 ['EMPTY_INVENTED_LOT',v=>v.empty.lots.push({id:ids.lotA})],['INITIAL_ERROR_CURRENT',v=>v.error.board.state='current']]);
meaning('DR05_SNAPSHOT_RELEASE_MATCH',{initial:approved(),updated:approved()},[
 ['SAVED_DRAFT_LEAK',v=>v.updated.text+=' PRIVATE DRAFT CHANGED'],['SELECTED_ORDER',v=>v.updated.lots.reverse()],['DRAFT_PUBLISHED_CONFUSION',v=>v.updated.text='Selected coffee lot. Selected cabin lot.']]);
meaning('DR06_NO_BID_NULL',{o:approved(),absent:0},[
 ['READ_INITIALIZES_ROW',v=>v.absent=1],['OPENING_AS_CURRENT',v=>v.o.lots[1].amount='$100.00'],['NO_BID_LABEL_OMITTED',v=>v.o.lots[1].text='Sold for $0.00']]);
meaning('DR07_EXACT_MONEY_ASOF_PRIVACY',{o:approved(),packets:[{lotId:ids.lotA,serverNow:asOfA,updatedAt:updated,acceptedBidCount:1,version:1},{lotId:ids.lotB,serverNow:asOfB,updatedAt:updated,acceptedBidCount:0,version:0}]},[
 ['TRUNCATED_MONEY',v=>v.o.lots[0].amount='$1,234'],['SHARED_EVENT_ASOF',v=>v.o.lots[1].asOf=asOfA],['WRONG_UPDATED_AT',v=>v.o.lots[0].updatedAt=asOfA],['USD_DISCLOSURE',v=>v.o.text=v.o.text.replace('USD','')],['SYNTHETIC_DISCLOSURE',v=>v.o.text=v.o.text.replace('Synthetic','')],['IDENTITY_PORTAL',v=>v.o.html+='<div hidden>Harbor Company</div>']]);
const closed=approved();closed.board.phase='closed';closed.text+=' Closed standing.';
meaning('DR08_CLOSED_NOT_WINNER',{o:closed,standing:{canBid:false}},[
 ['CLOSED_READ_HIDDEN',v=>v.o.lots[0].amount=null],['FINAL_WINNER',v=>v.o.text+=' Winner'],['PHASE_OPEN',v=>v.o.board.phase='open']]);
const unavailable=approved();unavailable.lots[0].amount=null;unavailable.lots[0].state='unavailable';const unsupported=approved();unsupported.lots[0].amount=null;unsupported.lots[0].text='Unsupported test rules';
meaning('DR09_MALFORMED_UNSUPPORTED',{malformed:[{patch:{releaseId:ids.releaseOther},o:unavailable}],unsupported},[
 ['MISMATCH_OLD_NUMERIC',v=>v.malformed[0].o.lots[0].amount='$100.00'],['UNSUPPORTED_CONVERSION',v=>v.unsupported.lots[0].amount='€100.00']]);
const deniedModes=['display','results'].map(mode=>{const b=viewer();b.board.mode=mode;return {mode,bidRevoked:b,viewRevoked:deniedBoard(),sessionRevoked:deniedBoard()};});
meaning('DR10_DENIED_CLEARING',{deniedModes},[
 ['BID_AUTHORITY_RETAINS_AMOUNT',v=>v.deniedModes[0].bidRevoked.lots[0].amount='$100.00'],['VIEW_DENIAL_STALE',v=>v.deniedModes[1].viewRevoked=approved()],['SESSION_KEEPS_CONTENT',v=>v.deniedModes[0].sessionRevoked.lots=[{id:ids.lotA}]]]);
const staleModes=['display','results'].map(mode=>{const fresh=approved();fresh.board.mode=mode;const stale=clone(fresh);stale.lots[0].state='stale';stale.text+=' Stale, last confirmed.';const offline=clone(stale);offline.board.state='offline';offline.text+=' Offline.';return {mode,fresh,stale,offline};});
meaning('DR11_STALE_OFFLINE',{staleModes},[
 ['FAILED_READ_FRESH_TIMESTAMP',v=>v.staleModes[0].stale.lots[0].asOf=asOfB],['OFFLINE_CURRENT_CLAIM',v=>v.staleModes[1].offline.board.state='current'],['ORIGINAL_AMOUNT_LOST',v=>v.staleModes[1].stale.lots[0].amount=null]]);
const other=approved();other.board.eventId=ids.eventOther;other.lots=[{id:ids.lotOther}];other.text='Other Saturn event';
meaning('DR12_ACCOUNT_EVENT_LATE_ISOLATION',{finalSessionGuard:deniedBoard(),noExtraRefreshBeforeFinalSessionGuard:true,changedAccount:viewer(),changedGeneration:viewer(),deniedOther:deniedBoard(),changedEvent:other},[
 ['NO_FINAL_SESSION_CHECK',v=>v.finalSessionGuard=approved()],['LATE_ACCOUNT_RESPONSE',v=>v.changedAccount.lots[0].amount='$100.00'],['LATE_GENERATION_RESPONSE',v=>v.changedGeneration.lots[0].asOf=asOfA],['LATE_EVENT_RESPONSE',v=>v.changedEvent.lots=[{id:ids.lotA}]]]);
meaning('DR13_SERVER_PHASE_REFRESH',{skew:future('scheduled'),opened:future('open'),closed:future('closed')},[
 ['CLOCK_SKEW_GRANTS_OPEN',v=>v.skew.board.phase='open'],['DB_OPEN_IGNORED',v=>v.opened.lots=[]],['DB_CLOSE_IGNORED',v=>v.closed.board.phase='open']]);
const polling={initialSelectedCount:3,openTimer:{timers:[{delay:5000}]},closeTimer:{timers:[{delay:30000}]},scheduledTimer:{timers:[{delay:5000}]},initial:1,before5:1,after5:2,closeInitial:3,before30:3,after30:4,scheduledInitial:1,beforeScheduled5:1,afterScheduled5:2,hideStart:3,hidden:3,resumed:4,activeWhileHeld:1,max:2,afterCancelledCycle:approved(),order:['/api/session','/api/catalog/events/'+ids.event]};
meaning('DR14_BOUNDED_VISIBLE_REFRESH',polling,[
 ['UNBOUNDED_QUEUE',v=>v.max=3],['TWO_ROW_VACUITY',v=>v.initialSelectedCount=2],['EARLY_POLL',v=>v.before5=2],['SCHEDULED_POLL_MISSING',v=>v.afterScheduled5=1],['CLOSED_FAST_POLL',v=>v.before30=4],['BACKGROUND_POLL',v=>v.hidden=4],['RESUME_MISSING',v=>v.resumed=3],['NO_SESSION_FIRST',v=>v.order=['/api/catalog/events/'+ids.event]],['CANCELLED_CYCLE_LEAK',v=>v.afterCancelledCycle.board.eventId=ids.eventOther]]);
const layout=[];for(const mode of ['display','results'])for(const viewport of [{width:320,height:568},{width:1280,height:800},{width:1920,height:1080}])layout.push({mode,viewport,o:approved(),actual:{heading:true,width:viewport.width,scrollWidth:viewport.width,focus:{native:true,visible:true,outline:true},amounts:[{text:'$9,999,999.99',complete:true}],table:mode==='results',links:[`/events/${ids.event}`,`/events/${ids.event}/${mode==='display'?'results':'display'}`]}});
meaning('DR15_NATIVE_RESPONSIVE',{layout},[
 ['EMPTY_AMOUNT_VACUITY',v=>v.layout[0].actual.amounts=[]],['CLIPPED_MONEY',v=>v.layout[0].actual.amounts[0].complete=false],['SMALL_SCREEN_OVERFLOW',v=>v.layout[0].actual.scrollWidth=500],['INVISIBLE_FOCUS',v=>v.layout[0].actual.focus.outline=false],['TABLE_SEMANTICS',v=>v.layout[3].actual.table=false],['BROKEN_NAVIGATION',v=>v.layout[0].actual.links=[]]]);
assert.deepEqual(cases,groups.flatMap(g=>g.ids),'Each15 declared meaning uses its exact application oracle');
const r=spawnSync('/Users/jryear/.nvm/versions/node/v24.4.1/bin/node',['tests/acceptance/staging-display-results/adapter.mjs','99'],{cwd:process.env.VERIFY_ROOT||process.cwd(),encoding:'utf8',timeout:15000});
assert.equal(r.status,99);assert.match(r.stderr,/HARNESS99/);assert.doesNotMatch(r.stdout,/BOUND_RECEIPT|CASE_RESULT/);
console.log(JSON.stringify({controls,meaningCoverage:cases,sharedApplicationValidators:true,runnerInvalidInvocationExit:r.status,scope:'synthetic predicate and runner-classification controls only',aggregateGate:false,applicationGreen:false},null,2));
