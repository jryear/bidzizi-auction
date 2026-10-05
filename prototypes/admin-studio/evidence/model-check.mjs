import assert from 'node:assert/strict';
import {fresh,cents,wallTime,windowFor,makeRelease,statusAt,audiencePayload} from '../model.js';
let count=0;
const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
const d=fresh();
check('exact minor-unit parsing and invalid amounts',()=>{
 assert.equal(cents('100.05'),10005);assert.equal(cents('0.01'),1);
 for(const text of ['1.001','-1','1e3','NaN','', '90071992547409999'])assert.equal(cents(text),null);
});
check('event timezone, including DST gaps and ambiguity',()=>{
 assert.equal(wallTime('2026-12-10','18:00','America/Los_Angeles'),Date.parse('2026-12-11T02:00:00Z'));
 assert.equal(wallTime('2026-03-08','02:30','America/Los_Angeles'),null);
 assert.equal(wallTime('2026-11-01','01:30','America/Los_Angeles'),null);
 assert.equal(wallTime('2026-02-30','18:00','America/Los_Angeles'),null);
});
check('a catalog without assigned lots cannot be scheduled',()=>assert.equal(makeRelease(d).ok,false));
d.lots.forEach(l=>l.windowId='main');
check('an incomplete selected lot blocks release',()=>assert.equal(makeRelease(d).ok,false));
d.lots.at(-1).description='A fictional year of seasonal flowers.';
const result=makeRelease(d);
assert.equal(result.ok,true);d.release=result.release;
const w=windowFor(d.event);
check('opening inclusive; closing exclusive; automatic boundary states',()=>{
 assert.equal(statusAt(d.release,w.start-1),'scheduled');assert.equal(statusAt(d.release,w.start),'open');
 assert.equal(statusAt(d.release,w.end-1),'open');assert.equal(statusAt(d.release,w.end),'closed');
});
check('audience catalog hidden before opening and visible afterward',()=>{
 assert.equal(audiencePayload(d,'before','audience').visible,false);
 assert.equal(audiencePayload(d,'open','audience').visible,true);
 assert.equal(audiencePayload(d,'closed','audience').visible,true);
});
check('working edits preserve the scheduled content and window',()=>{
 const original=d.release.lots[0].title;d.lots[0].title='A changed working draft';d.event.end='21:00';
 assert.equal(d.release.lots[0].title,original);assert.equal(d.release.event.end,'20:00');
 assert.equal(audiencePayload(d,'open','audience').lots[0].title,original);
 assert.equal(audiencePayload(d,'open','draft').lots[0].title,'A changed working draft');
});
check('unassigned lots are excluded from a released snapshot',()=>{
 d.lots[0].windowId=null;const r=makeRelease(d);assert.equal(r.ok,true);assert.equal(r.release.lots.length,5);
});
check('an invalid shared window cannot be released',()=>{d.event.end='17:00';assert.equal(makeRelease(d).ok,false);});
console.log(`${count} model boundary checks passed. Prototype evidence only; not a frozen-contract verdict.`);
