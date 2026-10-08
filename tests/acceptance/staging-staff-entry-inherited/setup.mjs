// Disposable prerequisite only. No event/entry/member fixtures are added here.
import assert from 'node:assert/strict';
import {readFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {assertOwnedDatabasePort} from './owned-processes.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function entryPrerequisite({repo,db,runtime,HarnessError:SetupError=Error}){
 try{
 let entryBytes;try{entryBytes=await readFile(join(repo,'migrations/015_staff_event_entry.sql'));}catch(error){if(error.code==='ENOENT')return;throw error;}
 const cp=db.connectionParameters;
 if(cp.host!=='127.0.0.1'||!/^bz_test_[a-f0-9]+$/.test(cp.database)||!/^\w+$/.test(runtime))throw Error('HARNESS99 owned disposable database prerequisite refused');
 assertOwnedDatabasePort(cp.port);
 const owner=(await db.query('SELECT datdba::regrole::text owner FROM pg_database WHERE datname=current_database()')).rows[0]?.owner;
 if(!/^\w+$/.test(owner||''))throw Error('HARNESS99 owned migration role unavailable');
 const applied=[];
 async function install(name,bytes){
  await db.query('SET ROLE '+owner);
  try{await db.query(bytes.toString());applied.push({name,sha256:sha(bytes)});}finally{await db.query('RESET ROLE');}
 }
 if(!(await db.query("SELECT to_regclass('public.bz_catalog_approvals') present")).rows[0].present)await install('002_staging_catalog.sql',await readFile(join(repo,'migrations/002_staging_catalog.sql')));
 if(!(await db.query("SELECT to_regclass('public.bz_businesses') present")).rows[0].present)await install('003_staging_manual_bid.sql',await readFile(join(repo,'migrations/003_staging_manual_bid.sql')));
 if(!(await db.query("SELECT to_regclass('public.bz_demo_entry_slots') present")).rows[0].present)await install('009_demo_attendee_entry.sql',await readFile(join(repo,'migrations/009_demo_attendee_entry.sql')));
 const functions=async()=> (await db.query("SELECT p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname NOT LIKE 'bz_staff_event_entry_%' ORDER BY identity")).rows;
 const before=await functions();
 if(!(await db.query("SELECT to_regprocedure('public.bz_staff_event_entry_read(text,uuid)') present")).rows[0].present)await install('015_staff_event_entry.sql',entryBytes);
 const after=await functions();assert.deepEqual(after,before,'All inherited functions, including009 bodies, remain byte-exact');
 const grants=['bz_staff_event_entry_read(text,uuid)','bz_staff_event_entry_set(text,uuid,integer,boolean,uuid)'];
 for(const signature of grants)await db.query('GRANT EXECUTE ON FUNCTION public.'+signature+' TO '+runtime);
 // Discovery continues through the shipped narrow SELECT privilege, never a
 // direct table mutation grant. Empty staff fixtures receive no enabled row.
 await db.query('GRANT SELECT ON public.bz_demo_event_entries TO '+runtime);
 const row={protocol:1,database:cp.database,host:'127.0.0.1',owner,runtime,applied,extraEXECUTEs:grants,oldFunctionDefinitionsUnchanged:true,targetEntryRowsCreated:0};
 const directory=process.env.BZ_INHERITED_PROCESS_REGISTRY_DIR;if(!directory)throw Error('HARNESS99 inherited prerequisite registry unavailable');
 await appendFile(join(directory,'DISPOSABLE_SETUP.jsonl'),JSON.stringify(row)+'\n');
 console.log('STAFF_ENTRY_INHERITED_SETUP '+JSON.stringify(row));
 }catch(error){throw new SetupError('Inherited owned disposable Entry prerequisite failed; no behavioral observation or feature absence is established.');}
}
