# Items workspace interaction study

Isolated prototype for Zack's 2026-10-13 plan. No application imports, API calls or real event data. Examples, uploads, saves and guest visibility are browser-local simulations. Uses a copy of the accepted shell's local fonts and follows its cream, cobalt, Fraunces and Instrument Sans design.

Run `node prototypes/items-workspace/serve.mjs` and open http://127.0.0.1:3423. This loopback address works on this computer; captures in `docs/plans/images/items-study/` show the phone composition.

The comparison switch keeps separate examples for each flow:

- **Automatic + optional draft:** edits autosave; new items in a draft event belong to the event immediately. During a live event, new items are saved for staff until Add to event; Keep as draft lets you return later.
- **Visible Drafts group:** new items always begin in Drafts. Select several to add them together, or finish one in its editor.

Both preserve unfinished edits across navigation and reload. Guest preview excludes draft items and preserves the current filters and scroll position when closed. Adding several demonstrates optional spreadsheet paste (tab-separated rows), with a review before addition; it is a capability study, not a committed production scope.

Try with 30 example items:
1. Prepare a draft event: add an item, correct a donor, filter missing photos and add one.
2. Switch the event to Live and create an item.
3. Leave it unfinished, use search to return, then reload.
4. Compare keeping the item as a draft versus adding it to the event.
5. Preview the guest view, then return to your filtered list.
6. Compare the other creation flow. The examples are separate; Reset example clears only the selected flow.

Observe uncertainty about guest visibility, extra save actions, lost place or input, and unnecessary switching. The connected Items manager and its final interaction model remain unbuilt pending Zack's feedback on this study.
