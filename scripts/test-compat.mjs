#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const db=process.env.BIDZIZI_DATABASE_URL??'',base=process.env.BASE??'';
if(!/^postgres(?:ql)?:\/\/[^@]*@127\.0\.0\.1:\d+\/bz_test_[a-z0-9_]+$/.test(db)||!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)||!process.env.HOST_EMAIL||!process.env.HOST_PASSWORD){
 console.error('Set BASE, HOST_EMAIL, HOST_PASSWORD and a disposable loopback BIDZIZI_DATABASE_URL. This suite creates its own test events.');process.exit(99);
}
for(const file of ['scripts/compat.mjs','tests/v1/compat-logic.mjs','tests/v1/compat-gate.mjs','tests/v1/compat-api.mjs','tests/v1/devices-ui.mjs','tests/v1/bid-sheet.mjs','tests/v1/simple-ui.mjs']){
 const r=spawnSync(process.execPath,[file],{stdio:'inherit',env:process.env});if(r.error){console.error('Test setup failed: '+r.error.message);process.exit(99);}if(r.status!==0)process.exit(r.status??99);
}
console.log('Compatibility software checks passed. Run pnpm test:ios separately for the actual Mobile Safari matrix.');
