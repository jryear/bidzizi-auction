// Pure guard controls. Does not import the delegated group or start services.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {observeAliases,validateAliases} from './guard.mjs';
const mapping=JSON.parse(await readFile(new URL('./ALIASES.json',import.meta.url))),observed=await observeAliases(process.env.VERIFY_ROOT||process.cwd(),mapping);
validateAliases(observed,mapping);let rejected=0;
for(let i=0;i<17;i++)for(const key of ['originalSHA256','aliasSHA256']){const bad=structuredClone(observed);bad.aliases[i][key]='0'.repeat(64);assert.throws(()=>validateAliases(bad,mapping),assert.AssertionError);rejected++;}
for(const path of Object.keys(mapping.mandatoryFrozenSHA256)){const bad=structuredClone(observed);bad.mandatoryFrozenSHA256[path]='0'.repeat(64);assert.throws(()=>validateAliases(bad,mapping),assert.AssertionError);rejected++;}
for(const change of [x=>x.aliases.pop(),x=>x.aliases.push(x.aliases[0]),x=>x.aliases.reverse(),x=>x.aliases[0].alias='wrong']){const bad=structuredClone(observed);change(bad);assert.throws(()=>validateAliases(bad,mapping),assert.AssertionError);rejected++;}
console.log(JSON.stringify({status:'PURE_PORTABILITY_CONTROLS_PASS',aliases:17,negativeControlsRejected:rejected,appDBBrowserKernelStarted:false,originalGroupImported:false}));
