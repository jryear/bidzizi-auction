import assert from 'node:assert/strict';
export async function audit(db, eventId, expectedReceipts = new Map()) {
  const checks = {
    duplicateBids: `SELECT count(*)::int AS n FROM (SELECT participant_id,request_id FROM bids WHERE event_id=$1 GROUP BY 1,2 HAVING count(*)>1) x`,
    missingOrWrongReceipts: `SELECT count(*)::int AS n FROM bids b LEFT JOIN bid_receipts r ON r.participant_id=b.participant_id AND r.request_id=b.request_id
      WHERE b.event_id=$1 AND (r.request_id IS NULL OR NOT r.accepted OR r.item_id<>b.item_id OR r.receipt->>'bidId'<>b.id::text
      OR (r.receipt->>'amountMinor')::bigint<>b.amount_minor OR (r.receipt->>'decidedAt')::timestamptz<>b.decided_at)`,
    orphanAcceptedReceipts: `SELECT count(*)::int AS n FROM bid_receipts r JOIN items i ON i.id=r.item_id LEFT JOIN bids b ON b.id::text=r.receipt->>'bidId'
      WHERE i.event_id=$1 AND r.accepted AND (b.id IS NULL OR b.participant_id<>r.participant_id OR b.request_id<>r.request_id)`,
    wrongStanding: `SELECT count(*)::int AS n FROM standings s LEFT JOIN LATERAL
      (SELECT id,participant_id,amount_minor FROM bids WHERE item_id=s.item_id AND voided_at IS NULL ORDER BY amount_minor DESC,sequence DESC LIMIT 1) b ON true
      WHERE s.event_id=$1 AND (s.leading_bid_id IS DISTINCT FROM b.id OR s.leader_id IS DISTINCT FROM b.participant_id OR s.current_minor IS DISTINCT FROM b.amount_minor
      OR s.bid_count<>(SELECT count(*) FROM bids WHERE item_id=s.item_id AND voided_at IS NULL)
      OR s.next_sequence<>(SELECT coalesce(max(sequence),0)+1 FROM bids WHERE item_id=s.item_id))`,
    wrongOrder: `SELECT count(*)::int AS n FROM (SELECT sequence,amount_minor,decided_at,
      row_number() OVER w AS expected,lag(amount_minor) OVER w AS prev_amount,lag(decided_at) OVER w AS prev_time
      FROM bids WHERE event_id=$1 WINDOW w AS (PARTITION BY item_id ORDER BY sequence)) b
      WHERE sequence<>expected OR amount_minor<=prev_amount OR decided_at<prev_time`,
    outsideServerWindow: `SELECT count(*)::int AS n FROM bids b JOIN items i ON i.id=b.item_id JOIN events e ON e.id=b.event_id
      WHERE b.event_id=$1 AND (b.decided_at<coalesce(i.opens_at,e.starts_at) OR b.decided_at>=coalesce(i.closes_at,e.ends_at))`,
  };
  const results = {};
  for (const [key, query] of Object.entries(checks)) results[key] = (await db.query(query, [eventId])).rows[0].n;
  results.acceptedBids = (await db.query('SELECT count(*)::int n FROM bids WHERE event_id=$1', [eventId])).rows[0].n;
  results.uniqueReceipts = (await db.query('SELECT count(*)::int n FROM bid_receipts r JOIN items i ON i.id=r.item_id WHERE i.event_id=$1', [eventId])).rows[0].n;
  const saved = (await db.query(`SELECT r.participant_id, r.request_id, r.receipt FROM bid_receipts r JOIN items i ON i.id=r.item_id WHERE i.event_id=$1`, [eventId])).rows;
  const durable = new Map(saved.map(r => [r.participant_id + ':' + r.request_id, r.receipt]));
  results.httpReceiptMismatches = 0;
  for (const [key, receipt] of expectedReceipts) {
    try { assert.deepEqual(durable.get(key), receipt); } catch { results.httpReceiptMismatches++; }
  }
  results.httpReceiptsCompared = expectedReceipts.size;
  results.passed = Object.keys(checks).every(key => results[key] === 0) && results.httpReceiptMismatches === 0;

  return results;
}
