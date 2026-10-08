// Uses unchanged cumulative exit/preflight semantics and all unchanged catalog assertions.
import {runCumulative} from '../../staging-manual-bid/cumulative-catalog.mjs';
process.exitCode=await runCumulative(process.argv[2],{importChecks:()=>import('./catalog-checks.mjs')});
