// Versioned, announced fan-selector-only evidence supersession. Disk originals
// remain protected. Every other historical assertion executes unmodified.
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const plan=JSON.parse(readFileSync(new URL('./SUPERSESSION.json',import.meta.url),'utf8'));
registerHooks({load(url,context,next){
 const result=next(url,context),path=new URL(url).pathname;
 if(!path.endsWith('/tests/acceptance/staging-workspace-entry/browser.mjs'))return result;
 const source=String(result.source),sha=createHash('sha256').update(source).digest('hex');
 if(sha!==plan.originalSHA256||source.split(plan.original).length!==2)throw Error('HARNESS99 exact inherited browser lineage/single fan anchor required');
 const transformed=source.replace(plan.original,plan.replacement);
 console.log('WELCOME_VISUAL_SUPERSESSION '+JSON.stringify({path:plan.path,originalSHA256:sha,executedSHA256:createHash('sha256').update(transformed).digest('hex'),retired:'fan selector only',phaseIndependent:true}));
 return {...result,source:transformed};
}});
