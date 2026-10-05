// Catch dependency/setup failures before loading PG/Playwright-heavy evidence.
try{
  const {run}=await import('./checks.mjs');
  await run(process.argv[2]);
}catch(e){
  const missing=['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND'].includes(e?.code);
  let classify;
  try{classify=(await import('./harness.mjs')).evidenceExit;}catch{}
  console.error((missing?'HARNESS dependency':e.name||'FAIL')+': '+e.message);
  process.exitCode=missing?99:classify?classify(e):99;
}
