# 009: bounded no-SMS demo attendee entry

Source: app 3b1fa23abfd22b7efca3c2727305431f7bf0de1a, docs-only baseline
1fb94e77677ebafa2b2f36f31b6db7498c353b35. Owner allocation approved at16:15UTC,
recorded in docs/decisions/demo-private-entry-2026-10-07.json. Delivery owner reserves
migration009 and the minimal EventAccess hook. Preparation until independent case
review and trusted contract commit; product files remain unchanged before freeze.

The shared `/events/:eventId` URL discovers an operator-enabled synthetic event.
It conveys no private identity. Before enrollment, disclose only demo availability
and the event UUID; no saved catalog, people, member claims, businesses or bids.
No room-code or QR tooling is required for this bounded shared-link journey.

An attendee enters name (1–80), business display name (1–120) and self-claimed
member ID (1–80). Trim surrounding whitespace, reject empty/control characters
and unexpected fields. Explicitly label self-entry unverified and synthetic,
with no SMS or payment. Claims never locate, join or recover an existing actor.
Accepted allocation: fresh synthetic person AND business UUID per enrollment.
Duplicates across browsers remain separate. No staff authority or shared spending.

Reuse configured staging/local-test guards, exact Origin/JSON, no-store responses,
existing eight-hour private `bz_session` and current auth/VIEW/BID/business/network
checks. New authority writes occur only in a narrowly scoped SECURITY DEFINER
function with fixed search_path, qualified objects, PUBLIC execution revoked.
Ordinary runtime receives exact function execution and entry-read rights only;
no direct authority/profile/retry table INSERT/UPDATE. Migration/provisioning is
operator-only, demo rows opt-in; runtime cannot enable another event.

`GET /api/demo/events/:id/entry` returns `{demoEntry:true,eventId}` for enabled
entries or sealed404. The client generates a non-secret entryId UUID in sessionStorage
before begin. `POST .../begin` with `{entryId}` checks entry and current identity
before issuing a random event-bound `bz_demo_entry_<entryId>` HttpOnly SameSite=Strict cookie,
15-minute DB expiry, hash only at rest. Valid existing bootstrap is retained on
refresh; never rotate it while an enrollment result may be unconfirmed. Each slot
has a separate cookie name, so reordered initial begin responses cannot overwrite
another tab's retry credential. The same entryId without its matching private cookie
refuses409 with no Set-Cookie. An active
session cannot be silently replaced by begin/enroll. Bootstrap is a private
temporary retry credential; the event link/member ID/request UUID is not one.

`POST .../enroll` validates entryId, three claims and bootstrap. One transaction locks the
enabled entry and bootstrap, then creates person/business/profile, person-business
BID membership, organizer network membership, event VIEW, event BID and session.
No publication, draft, standing, bid or receipt is created or altered. Invalid,
disabled, foreign-event, expired or consumed bootstrap fails closed. Unpublished
events can enroll without inventing catalog content. Admission does not imply an
open lot or supported bid rules.

The same bootstrap + normalized payload reuses the same actor/business/session;
changed payload409. Concurrent duplicates serialize. Session token is deterministically
derived from the private bootstrap with a purpose-separated SHA256 digest, stored
only as ordinary session hash. The bootstrap is high-entropy and never public.
Retry must reject an expired/revoked session or inactive actor, rather than resurrect
it. Capture DB time and current entry/session state after locks. No normal logout
behavior is weakened. `POST .../acknowledge` with `{entryId}` requires
the enrolled current private session, consumes bootstrap in DB and expires cookie.
Acknowledgement is idempotent for that same current session even after consumption
or loss of its response/cookie. Public entryId alone cannot acknowledge or recover.
The client confirms actual matching session before acknowledging and showing
connected content. Authenticated refresh with a retained entryId retries acknowledgement
before mounting the catalog, or keeps recovery visible if acknowledgement fails. A lost
enrollment acknowledgement stays unconfirmed; original claims and
private bootstrap permit retry. Losing both cookies means a new empty actor;
cross-device recovery is outside this contract.

The form keeps submitted claims locked during uncertain outcome and checks current
session before retry. It does not persist claims or credentials in URLs/localStorage.
Refresh continuity comes from the existing private session. Initial My Bids/standing
is empty for the new actor. Ordinary A catalog → lot → review → pending → committed
receipt remains server authoritative. Member claims appear only in private profile
storage, never catalog/context/session/standing responses.

Required fixed cases: discovery versus authentication; atomic scoped empty entry;
concurrent identical retry; changed retry; duplicate claims separated; wrong event;
forged actor/business/grants; Origin/JSON/control/length errors; disabled/expired;
rollback at session write; current authority revocation; opaque foreign receipts;
staff preserved; held/lost enrollment acknowledgement; refresh; logout/consumed retry;
real connected bid acceptance and competing outbid standing. Infrastructure/setup/
timeouts are99, absent reached feature on trusted base is finite RED. Independent
review is a probe; executable checks gate completion.
