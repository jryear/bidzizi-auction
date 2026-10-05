import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';

// Operator-only command. Never invoked by a route or the runtime database role.
const file=process.env.BIDZIZI_MIGRATION_URL_FILE;
if(process.env.BIDZIZI_MIGRATION_TARGET!=='br-autumn-surf-arrxv906' || !file) throw Error('Confirm the isolated staging migration target.');
const connection=new URL(fs.readFileSync(file,'utf8').trim());
if(connection.hostname!=='ep-shiny-mountain-ar1x2qwa-pooler.c-4.us-west-2.aws.neon.tech' || connection.pathname!=='/bz_staging_e2e' || connection.username!=='staging_e2e_owner') throw Error('Refusing a database outside the isolated staging boundary.');
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])connection.searchParams.delete(key);
const client=new pg.Client({connectionString:connection.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try {
 await client.connect();
 for(const migration of fs.readdirSync('migrations').filter(n=>/^\d+_.*\.sql$/.test(n)).sort()) {
  await client.query(fs.readFileSync('migrations/'+migration,'utf8'));
  console.log('Applied staging migration: '+migration);
 }
 await client.query(fs.readFileSync('tests/acceptance/staff-drafts/seed.sql','utf8'));
 const eventId='30000000-0000-4000-8000-000000000001',orgId='10000000-0000-4000-8000-000000000001',staffId='20000000-0000-4000-8000-000000000001';
 const draft={name:'Holiday Trade Show (test)',eyebrow:'Member auction',welcome:'Browse example items provided by Saturn Barter.',venue:'Saturn Barter community event',cover:'assets/lots/dinner.jpg',date:'2026-12-10',start:'18:00',end:'20:00',timezone:'America/Los_Angeles',increment:2500,sponsorsEnabled:false,sponsors:[]};
 const examples=[['Weekend cabin stay','cabin','Getaways',10000],['Coffee for your team','coffee','Food & drink',5000],['Dinner for two','dinner','Food & drink',15000],['Handmade ceramics','ceramics','Good things',5000],['City bicycle','bicycle','Good things',10000],['Seasonal flowers','flowers','Good things',5000]];
 await client.query('BEGIN');
 const inserted=await client.query('INSERT INTO bz_events(id,org_id,draft,created_by) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(id) DO NOTHING RETURNING id',[eventId,orgId,JSON.stringify(draft),staffId]);
 if(inserted.rowCount) for(const [i,[title,image,category,opening]] of examples.entries()) {
  const id='40000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
  const lot={id,title,short:'Example auction item',description:'Synthetic demonstration item. Edit its details in the staff workspace.',category,image:'assets/lots/'+image+'.jpg',alt:title,opening,includes:[],fine:'Demonstration only. No real purchase or fulfillment.',windowId:null};
  await client.query('INSERT INTO bz_lots(id,event_id,org_id,position,data) VALUES($1,$2,$3,$4,$5::jsonb)',[id,eventId,orgId,i,JSON.stringify(lot)]);
 }
 await client.query('COMMIT');
 console.log('Synthetic identities and example draft are present. Existing draft edits were preserved.');
 console.log('No catalog published; no bid or payment created.');
} catch {
 await client.query('ROLLBACK').catch(()=>{});
 console.error('Staging migration/seed failed; database output withheld.');process.exitCode=99;
} finally {await client.end().catch(()=>{});}
