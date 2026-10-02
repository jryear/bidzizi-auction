# First product slice discovery

Status: proposed scope awaiting the user's product decision. This is a discovery scaffold, not a frozen implementation contract. No product implementation, schema migration, service configuration, or deployment is authorized by this document.

## Proposed user outcome

An authorized staff member signs in, creates a draft auction event for their company, and can reopen the same saved event after signing out and back in.

The experience should make the company, event state, and next action clear. Existing staging connectivity is verified, but the fresh repository has no authentication, company authority, event records, or event screens yet. The proposal intentionally ends with a saved draft; bidding and publication are later outcomes.

## Decisions required before freezing

1. Confirm the first user outcome: staff creates and reopens a draft event, staff authorization only, or a participant joining an event.
2. Define who qualifies as staff and who grants that authority. A successful Clerk sign-in alone must not grant company access.
3. Define company ownership and membership: whether existing Clerk organizations provide the company identity or the application owns a separate company record and membership mapping.
4. Confirm the minimum event inputs and the meaning of draft. Proposed minimum: a required event name, server-assigned identity, company ownership, and no participant admission or bidding while draft.
5. Establish the interface reference and the delivery boundary: locally verified implementation, connected staging verification, and deployment are separate claims.

These decisions belong to the user. Nothing in this scaffold adopts a legacy schema, organization model, or auction rule.

## Proposed acceptance evidence

Once the outcome and authority are agreed, frozen checks should observe the real boundaries:

- An authorized staff member creates one draft event through the interface; its stable identity and company ownership are persisted in Postgres.
- Reload, sign-out/sign-in, and a new browser session reopen that same saved event and preserve its name and draft state.
- Anonymous requests and signed-in people without staff authority cannot list, read, or create company events; denied writes leave no event behind.
- A staff member from another company cannot read or mutate the event by changing a URL, request body, or company identifier.
- Invalid input leaves no saved event. Database failure is shown as a failed or unresolved operation and does not produce a fictional saved result.
- Repeating or interrupting event creation does not silently create duplicate events or show an incorrect success. Define the intended retry behavior before freezing its check.
- Existing live database connectivity and credential secrecy remain intact.
- The rendered interface is inspected on desktop and phone using the agreed interface reference.

Local deterministic authentication checks cannot establish that Clerk sign-in worked on staging. Connected Clerk evidence must be recorded separately if that boundary is part of the agreed delivery.

## Contract packet

After the decisions are settled, create `tasks/bidzizi-product-slice-001.toml` and its executable acceptance and adversarial evidence. The evidence must exist and be committed on the trusted base before implementation starts. The current `main` revision is `b6beff9047161fd1fe44bb583f510636461d4c68`.

The external verifier remains `~/code/_kernel/verify.py`. Establish a ready baseline with genuine red acceptance checks, then implement on a candidate without editing the frozen task or its evidence. Completion requires supported verification plus the agreed browser and connected-service evidence; declaring review metadata does not establish that independent review occurred.

No task TOML has been created or frozen. No acceptance tests have been written or run for the proposed product slice. The existing template examples are not acceptance criteria for BidZizi.

## Proposed exclusions

Auction items, participant onboarding, QR codes, bidding, auto-bid, event publication, timers, settlement, messaging, and Ably are outside the proposed draft-event slice. The accepted outcome may change this list before the contract is frozen.
