// Failure receipts must be safe even when a candidate returns malformed credentials.
export function safeDetail(value){return String(value).replace(/\bbz_session=[^\s;,"']*/g,'bz_session=[redacted]').replace(/\bbz_demo_entry_[a-f0-9-]+=[^\s;,"']*/g,'bz_demo_entry=[redacted]').replace(/[A-Za-z0-9_-]{43,}/g,'[redacted long token]').replaceAll('DEMO-ONLY-MEMBER','[redacted member claim]');}
