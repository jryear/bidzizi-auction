// Read-only event recovery comparison; only counts and hashes leave memory.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export async function manifest(db,eventId){
 assert.match(eventId,/^[a-f0-9-]{36}$/);
 assert.equal((await db.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on');
 const queries={events:'SELECT to_jsonb(t)::text data FROM events t WHERE id=$1',items:'SELECT to_jsonb(t)::text data FROM items t WHERE event_id=$1',bids:'SELECT to_jsonb(t)::text data FROM bids t WHERE event_id=$1',receipts:'SELECT to_jsonb(t)::text data FROM bid_receipts t JOIN items i ON i.id=t.item_id WHERE i.event_id=$1',standings:'SELECT to_jsonb(t)::text data FROM standings t WHERE event_id=$1',participants:'SELECT to_jsonb(t)::text data FROM participants t WHERE event_id=$1'};
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  const result={};
  for(const [table,sql] of Object.entries(queries)){const rows=(await db.query(sql,[eventId])).rows.map(r=>r.data).sort();result[table]={rows:rows.length,sha256:createHash('sha256').update(rows.join('\n')).digest('hex')};}
  const point=(await db.query('SELECT clock_timestamp() at, pg_current_wal_lsn()::text lsn')).rows[0];
  await db.query('COMMIT');return {eventId,point,tables:result};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
