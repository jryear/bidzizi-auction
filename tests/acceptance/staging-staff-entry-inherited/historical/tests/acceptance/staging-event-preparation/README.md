# Event preparation 006 · bounded draft lot duplication

Read the [project map](../../../docs/project-map/index.html) for orientation,
[CURRENT.md](../../../docs/project-map/CURRENT.md) for assignment and permissions,
the [006 contract](../../../tasks/staging-event-preparation-006.toml) for authority,
and [assertion requirement map](ASSERTION_REQUIREMENT_MAP.json) before implementation.
Source-bound receipts provide proof. Owner rendered acceptance remains pending.

One selected-editor **Duplicate lot** action creates an unsaved local copy in the
current event. Only title, short description, description, category, image,
photo description, opening bid, included lines and fine details are copied.
Identity is fresh; source stays unchanged. No runtime, bid, publication, approval,
standing or window assignment is copied. Normal Save, revision checking and the
same request-ID retry keep the intended copy durable exactly once. The existing
100-lot limit and pending/uncertain write locks still apply.

`ROUTER_REFRESH_EVENT_ROUTE` also preserves the inherited selected-event route
under a real ordinary Next router refresh. The current document must observe an
actual framework HistoryUpdater completion before native and cached event-query
oracles and the complete saved API/SQL/preview packet run. This deterministic
trigger does not establish the natural cause of the older intermittent history
failure. No pending, held, dirty or unresolved path receives this normal barrier.

New files are owned by the independent contract author. Product files are owned by
the implementation worker after coordinator freeze. Historical 005/v3 and all
cumulative graders stay unchanged and are reused as current006 regressions.
This base already includes Events home, so inherited checks have no declared RED.

Use literal Node24.4.1 and installed dependencies. Every run owns and cleans up a
credential-free temporary app copy and scoped disposable PostgreSQL18 cluster.
Never reset shared staging or the owner review runtime.

```bash
/Users/jryear/.nvm/versions/node/v24.4.1/bin/node tests/acceptance/staging-event-preparation/run.mjs acceptance
/Users/jryear/.nvm/versions/node/v24.4.1/bin/node tests/acceptance/staging-event-preparation/run.mjs adversarial
/Users/jryear/.nvm/versions/node/v24.4.1/bin/node tests/acceptance/staging-event-preparation/controls.mjs
```

The first two commands observe the actual app. Their finite base failure must be a
reached missing action/assertion, never setup failure or a browser timeout.
Controls serve a labeled independent reference only to the disposable browser,
then challenge missing action, wrong source, repeated identity, assigned window,
runtime carryover and saved-preview corruption. A reference pass is **not** an app
pass; source controls are forbidden by the application gate adapter and runner.

For exact frozen completion, the coordinator commits these files and runs unchanged
kernel 3.1.0 against the trusted base:

```bash
python3 /Users/jryear/code/_kernel/verify.py tasks/staging-event-preparation-006.toml --repo . --base "$FROZEN_BASE_SHA" --baseline
python3 /Users/jryear/code/_kernel/verify.py tasks/staging-event-preparation-006.toml --repo . --base "$FROZEN_BASE_SHA" --claim "Selected lot duplicates into a fresh durable editable draft and recovers its exact Save retry" --implementer-model "actual inherited Codex runtime"
```

Receipts bind current source/helper bytes, exact commit and Node executable, run ID,
phase and complete ordered observations. Actual desktop/laptop/phone screenshots
and the titled nested saved Design A phone image are fresh and hash/geometry checked.
The tests do not settle visual acceptance or authorize promotion.
