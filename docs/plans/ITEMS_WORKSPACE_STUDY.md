# Items workspace interaction study — 2026-10-13

The approved next-landing plan separates this experiment from the connected image pass (`96af781`). Its purpose is to settle how item creation feels before assigning the connected Items manager. The production Studio has not gained a second publishing workflow.

## Try it

Open **http://127.0.0.1:3423** on this computer. A persistent local server runs from `prototypes/items-workspace/serve.mjs`; restart with `node prototypes/items-workspace/serve.mjs` (default port 3423). This loopback URL is not a remote or phone link. Phone captures are below.

The top comparison switch selects separate browser-local examples:

| Flow | Behavior |
|---|---|
| Automatic + optional draft | Existing items always autosave. New items in a draft event belong to the event immediately. When the event is live, the creation editor saves unfinished work for staff; Add to event introduces the item to guests, and subsequent edits autosave. Keep as draft lets staff return later. |
| Visible Drafts group | Every new item starts in Drafts. Staff can finish one or select several to Add to event together. Existing event items still autosave. |

Both use Draft/Live event language, Draft/In the event item language, search, category filtering, missing-photo filtering, single-image selection, a focused item editor and guest preview. An optional Add several example lets staff paste tab-separated spreadsheet rows and review them before addition. It demonstrates the capability without committing it to the connected build.

All 30 items, images, visibility changes and saves are **synthetic and browser-local**. There are no API calls, application imports or database writes. No crop, stage settings, full category management or connected item-management code was added.

## A useful five-minute pass

1. Start in Draft. Add an item and correct a donor. Notice whether you expect a Save button.
2. Switch the event to Live. Add an item, leave it unfinished, and return through search. Reload once.
3. Open guest preview. Check whether it is clear why the unfinished item is absent.
4. Finish it with Add to event, then change its title again. Check whether you expect another action.
5. Filter missing photos, open an item, and return. Switch creation flow and repeat the live-add moment.

The decision to settle: does the optional-draft approach keep ordinary editing fluid, or does the visible Drafts group make preparation easier enough to justify its extra structure? Also note any moment where guest visibility, saving or returning to work feels uncertain. The working hypothesis favors automatic editing with optional drafts; Zack has not yet selected the final interaction.

## Visual review

The first inspection found that the empty-state CSS made missing-photo thumbnails too tall. That was corrected; a second inspection confirmed consistent row rhythm and a phone editor with reachable actions. Matching desktop/phone captures were inspected. No horizontal overflow or browser page errors occurred in the rehearsals.

| View | Evidence |
|---|---|
| Compare desktop layouts | [Side by side](images/items-study/flows-desktop-pair.png) |
| Compare phone layouts | [Side by side](images/items-study/flows-phone-pair.png) |
| Automatic flow | [Desktop](images/items-study/automatic-1440.png), [phone](images/items-study/automatic-initial-390.png) |
| Drafts flow | [Desktop](images/items-study/drafts-1440.png), [phone](images/items-study/drafts-initial-390.png) |
| Live creation, optional draft | [Desktop editor](images/items-study/automatic-editor-1440.png), [phone editor](images/items-study/automatic-draft-editor-390.png) |
| Live creation, Drafts group | [Desktop editor](images/items-study/drafts-editor-1440.png), [phone editor](images/items-study/drafts-draft-editor-390.png) |

## Verification and next action

`node prototypes/items-workspace/evidence/browser.mjs` passed for **2/2 creation flows** with Node 24.4.1. Each rehearsal covers live creation, unfinished recovery, reload, guest visibility before/after Add to event, missing-photo filtering, returning from preview, spreadsheet-row validation/review, desktop and phone layout. The Drafts flow also exercises selecting and adding a draft from the list.

Prototype readiness is established. Final visual/interaction acceptance and the connected Items implementation remain pending Zack's trial. The next action is feedback on these two actual flows, then a bounded connected Items build specification. The image landing is complete independently.
