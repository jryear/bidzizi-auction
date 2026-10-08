# Private display and lot standing010

Bounded local candidate; integration and owner visual acceptance remain separate.
Baseline docs `1fb94e77677ebafa2b2f36f31b6db7498c353b35`, accepted application
`3b1fa23abfd22b7efca3c2727305431f7bf0de1a`, frozen private contract
`54a93a09d6994c10876ff75e0c46cfe438d25345`.

Two new private browser routes consume existing same-origin GET APIs:
`/events/[id]/display` presents the approved catalog in Design A's paper/ink,
Fraunces/Instrument Sans language with large lot titles and complete amounts.
`/events/[id]/results` presents a semantic Lot standing table, stacked on phones.
Both link to the ordinary event page for sign-in and to each other. Existing
wrappers, navigation, API routes, server code, migrations, historical tests,
dependencies and the shared kernel are unchanged.

Only an active explicit event VIEW grant reveals approved catalog content.
Scheduled catalogs retain the authorized header and withhold every lot. Numeric
standing still requires the existing BID/business/network authority checked by
the standing endpoint; a staff grant alone supplies none of it. Closed reads do
not depend on phase-dependent sending flags. Session identity is used only to
bind request generations; person/business/leader fields are never rendered or
persisted. Catalog/standing DTOs are validated and projected into local allowlists.

Each visible refresh checks the current session, reads the authorized catalog,
reads at most two standings concurrently, then rechecks the session before
publishing staged content. Manual refresh cancels and drains older generations.
Event changes, hidden pages, offline transitions, unmount and restored pages
invalidate pending work. Visible scheduled/open reads recur5s after completion;
closed reads recur30s. A browser clock cannot authorize phase. No refresh sends
a mutation, initializes standing, changes bids or changes a session.

Any401 clears all private data. Catalog400/403/404 clears the view. Standing
403/404 clears that lot's numeric data and timestamps, while independently
authorized catalog content remains. Invalid event/release/lot/rules/currency or
amount packets are unavailable. Transport failure can retain only previously
confirmed data, conspicuously stale/offline with original timestamps. Each lot
uses its own serverNow read time and updatedAt origin/change time; there is no
atomic event-wide snapshot or aggregate total. Exact integer cents use the fixed
synthetic USD manual rules. Null amount/zero count means No accepted bids and is
never replaced by opening metadata or a zero-dollar result.

Published catalog is labeled explicitly. The existing staff draft preview remains
a separate surface; its placeholder current/count/history values are not read.
Standing is provisional and does not confirm winners or settlement. This slice
does not supply public/unattended display access, TV credentials, device pairing
or control, staff-only numeric results, payment or ledger operations. A projector
visible to an audience remains a separate disclosure/product decision.

Prefreeze review is source-bound outside this repository at task6/freeze-audit.json
and contract-review/AUTHOR_PREIMPLEMENTATION_REVIEW.json. All15 shared observation
validators were challenged by66 negative predicate controls. Trusted kernel3.1.0
baseline is BASELINE_READY:15 declared finite RED and one inherited binding PASS,
zero harness errors. These controls/rehearsal are not application acceptance.
The first development authority run passed4 native assertions. Exact candidate
checks, screenshots and fresh independent review are required before handoff.

The bounded packet preserves198 historical/application hashes and all24 accepted
command groups/59 assertion IDs. Its hash regression does not execute those
bodies. Parent integration must run them unchanged and rebind010 to the accepted
007/008 DTOs before landing, including actual immutable per-lot windows and server
phases. Do not reuse the current single-window assumptions after that change.
Original failed welcome evidence and HOME_DETAILS_HISTORY OPEN/UNKNOWN remain.

Own product paths are the two pages, three staging-display-results feature files
and this handoff. Contract/evidence commit is separate from product source. Local
code, disposable fixtures, tests and commits only: no push/merge/deployment/grants,
new external credential/provider/model calls or operational ledger effects.
Exact internal Codex model ID is unavailable.

Preview launcher outside the repository: `../private-display-runtime.mjs`, run
from this checkout with the installed Node24 path. It owns a fresh disposable DB
and application source copy, lasts two hours, and writes public-safe local runtime
metadata to `../evidence/RUNTIME.json`. Sign in through its event URL with the
existing labeled synthetic Juniper test account, then open its display or standing
URL. No private credentials enter URLs or committed files. Existing owner runtimes
and data are untouched. Runtime/captures prove a local browser, not owner taste or
physical TV/projector/mobile hardware acceptance.
