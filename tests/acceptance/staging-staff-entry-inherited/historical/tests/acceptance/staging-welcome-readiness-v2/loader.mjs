// Import the already frozen fan-only hook; supersede only manual acceptance bootstrap.
import '../staging-welcome/loader.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const plan=JSON.parse(readFileSync(new URL('./EXECUTION_SUPERSESSION.json',import.meta.url),'utf8'));
export function manualDriverSource(source,mode){
 if(hash(source)!==plan.originalSHA256||source.split(plan.original).length!==2)throw Error('HARNESS99 exact manual driver lineage/single bootstrap anchor required');
 if(mode!=='acceptance')return source;
 const transformed=source.replace(plan.original,plan.replacement);if(hash(transformed)!==plan.executedSHA256)throw Error('HARNESS99 declared manual bootstrap source hash required');return transformed;
}
registerHooks({load(url,context,next){
 const result=next(url,context);if(!new URL(url).pathname.endsWith('/tests/acceptance/staging-manual-bid/driver.mjs'))return result;
 const source=String(result.source),transformed=manualDriverSource(source,process.argv[2]);
 if(transformed===source)return result;
 console.log('MANUAL_RECEIPT_READY_LINEAGE '+JSON.stringify({path:plan.path,originalSHA256:plan.originalSHA256,executedSHA256:hash(transformed),mode:'acceptance',onlyChange:'Strict unauthenticated receipt-route bootstrap before prepareFixture'}));return {...result,source:transformed};
}});
