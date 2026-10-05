const mode=process.argv[2];
if (!['acceptance','adversarial','list'].includes(mode)) {
  console.error('HARNESS: mode must be acceptance or adversarial.');
  process.exitCode=99;
} else {
  let count=0;
  let HarnessError,ApplicationFailure,evidenceExit;
  try {
    const driver=await import('./driver.mjs'),packet=await import('./probes.mjs');
    ({HarnessError,ApplicationFailure,evidenceExit}=driver);
    const cases=packet.cases;
    if(cases.length!==28||new Set(cases.map(p=>p.id)).size!==28||cases.some(p=>typeof p.run!=='function'))
      throw new HarnessError('All28 unique declared concrete groups must exist.');
    if(mode==='list'){
      console.log(JSON.stringify(cases.map(({id,name,mode,scenario})=>({id,name,mode,scenario})),null,2));
    } else {
    for (const probe of cases.filter(p=>p.mode===mode)) {
      await driver.withBidFixture(probe.run,probe.scenario);
      console.log(`PASS ${++count}: ${probe.id} ${probe.name}`);
    }
    console.log(`${count} independent ${mode} cases passed.`);
    }
  } catch(error) {
    if(!evidenceExit||error.code==='ERR_MODULE_NOT_FOUND'){
      console.error('HARNESS: Protected evidence module/dependency unavailable.');process.exitCode=99;
    }else{
      console.error(`${error instanceof HarnessError?'HARNESS':error instanceof ApplicationFailure?'APPLICATION':'FAIL'}: ${error.message}`);
      process.exitCode=evidenceExit(error);
    }
  }
}
