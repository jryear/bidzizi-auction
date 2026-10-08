#!/usr/bin/env bash
# Disposable PostgreSQL witness: a pre-opening decision can commit after opening.
# This is a counterexample, not an acceptance oracle or a proposed implementation.
set -euo pipefail
pg_bin=${PG_BIN:-/opt/homebrew/opt/postgresql@18/bin}
if [ ! -x "$pg_bin/postgres" ] || [ ! -x "$pg_bin/initdb" ] || [ ! -x "$pg_bin/pg_ctl" ]; then
  echo "full PostgreSQL server binaries unavailable; set PG_BIN" >&2
  exit 99
fi
scratch=$(mktemp -d "${TMPDIR:-/tmp}/bidzizi-publication-boundary.XXXXXX")
started=0
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then
    for log in init start stop result; do
      if [ -f "$scratch/$log.log" ]; then cat "$scratch/$log.log" >&2; fi
    done
  fi
  if [ "$started" -eq 1 ]; then
    "$pg_bin/pg_ctl" -D "$scratch/data" -m immediate -w -t 20 stop >"$scratch/stop.log" 2>&1 || {
      echo "cleanup failed; owned cluster retained at $scratch" >&2
      return 99
    }
  fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
"$pg_bin/initdb" -A trust -c shared_memory_type=mmap -c dynamic_shared_memory_type=mmap -D "$scratch/data" >"$scratch/init.log" 2>&1
"$pg_bin/pg_ctl" -D "$scratch/data" -o "-c listen_addresses= -c unix_socket_directories=$scratch" -w -t 20 start >"$scratch/start.log" 2>&1
started=1
cat >"$scratch/probe.sql" <<'SQL'
CREATE TABLE publication_probe(id integer PRIMARY KEY, opens_at timestamptz NOT NULL, decided_at timestamptz NOT NULL);
BEGIN;
CREATE TEMP TABLE boundary(opens_at timestamptz NOT NULL) ON COMMIT PRESERVE ROWS;
INSERT INTO boundary SELECT clock_timestamp() + interval '0.5 seconds';
INSERT INTO publication_probe
  SELECT 1, opens_at, clock_timestamp() FROM boundary
  WHERE clock_timestamp() < opens_at;
SELECT pg_sleep(1);
COMMIT;
SELECT count(*) = 1 AND bool_and(decided_at < opens_at AND clock_timestamp() > opens_at)
  FROM publication_probe;
SQL
psql -X -v ON_ERROR_STOP=1 -h "$scratch" -d postgres -At -f "$scratch/probe.sql" >"$scratch/result"
observed=$(tail -n 1 "$scratch/result")
if [ "$observed" != t ]; then
  echo "counterexample not established; inspect disposable setup and timing" >&2
  exit 99
fi
echo "PASS: a row checked before opening committed and became visible after opening"
